# Agno (#42, 42k★, agno-agi/agno) 功能研究
> 研究方式：web_extract读GitHub raw源码（approval/scorer/environments/job_queue/offload/os多文件全文）+ README/docs。2026-09-16 深夜轮4（cron）
> ⚠️ 本文件由cron轮次产出，此前CSV#42在所有轮次均遗漏（feature-matrix无文件）

## 定位
从"agent框架"（Phidata改名）升级为**Agent平台运行时**：SDK构建agent + AgentOS运行时（FastAPI 50+端点/SSE/WS）+ 控制面UI。与OpenSoul"AI电脑"定位最接近的商业公司产品（Apache 2.0）。

## 功能清单
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| @approval装饰器（required阻塞/audit审计两型，与@tool任意顺序组合，sentinel属性穿透） | ❌ | ❌ | 完全没有 | OpenSoul mcp工具注册时加approval_type字段，HITL三方互证第九方 |
| 消息级Checkpoint快照（list_run_checkpoints从消息标记推断边界+safe_truncation_index防悬挂tool_call+build_run_checkpoint_snapshot深拷贝截断+过滤孤儿tools/requirements） | ❌ | 部分（trajectory有CHECKPOINT事件类型，无快照/续跑） | 大 | `/continue?continue_from=message_index`协议直接抄；OpenMate聊天时间轴加checkpoint pin |
| durable JobQueue（idempotency_key按user命名空间去重/max_depth队列满/claim带deployment_id亲和/heartbeat续锁/stale锁回收/retry_or_fail退避/continue_job CAS幂等含attach/conflict/paused豁免清理） | ❌ | ❌（heartbeat命中的是agent协作心跳，非任务队列） | 完全没有 | 后台作业队列五方互证升第六方；InMemoryQueueStore契约注释即生产Postgres版的规格书 |
| run_continuation_blocked（admin审批未解决时禁止本人继续自己的run，approvals:write管理员可强制） | ❌ | ❌ | 完全没有 | "审批人≠发起人"合规设计，政企刚需 |
| scorer评估包（CodeScorer可调用+digest环境指纹/JudgeScorer LLM裁判1-10归一化+judge prompt fence防注入/ToolCallScorer按工具**执行**判分，拒绝/报错/HITL拒绝不算满足） | ❌ | ❌（benchmark 5维自评非裁判） | 完全没有 | 评估闭环七方互证 |
| environments跑K次（run_rollouts k=8全隔离：新内存db/新session/关缓存关记忆写入；pass_rate只统计scored（超时≠答错）；learning_zone=有成有败的任务=SFT候选；error-storm连续同错即停；env指纹 vs policy指纹区分"环境漂移"vs"策略变更"；baseline diff逐任务improved/regressed；to_sft_jsonl通过尝试直接导出SFT数据集） | ❌ | ❌ | 完全没有 | **"有没有进化"的最完整工程化解法**：指纹分离+diff+learning_zone三件套，比langfuse实验对比更进一步 |
| offload ResultStore（大工具结果→AgentFS文件+信封(head+tail preview+result_id)；read_result/search_result工具读回；ReDoS防护=可疑正则子进程跑10s可杀；TTL 300s sweep；NEVER_OFFLOADED工具名单；写失败显式信封不静默） | ❌ | ❌ | 完全没有 | 工具结果外置**第七方互证**（ODR/goose/deepagents/AgentScope/deer-flow/FastGPT后）；search_result子进程防ReDoS是新细节 |
| RBAC scopes（resource:action全局/resource::id按资源/通配符*三级+legacy别名迁移；列表端点无权限不过403而是**返回过滤后子集**；service account token agno_pat_前缀分发+treat_unverifiable_as_anonymous防陈token锁死开放实例；内部scheduler token故意不含schedules:write防泄漏后改指针） | ❌ | 部分（casbin用户级RBAC，无按agent资源粒度） | 大 | scopes.py 23KB整体可抄为immune/rbac_scopes.py；"过滤而非403"对多租户UI关键 |
| guardrails三内置（PIIDetection/PromptInjection/OpenAIModeration，BaseGuardrail可插拔） | ❌ | 部分（immune/moderator.py敏感数据检测脱敏+intrusion注入检测正则） | 中 | 对齐：OpenSoul已有同类但无统一BaseGuardrail协议+无审核API通道 |
| skills包（Skill/Skills/LocalSkills/SkillLoader/validate_skill_directory目录校验+校验错误类型化） | ❌ | 部分（skills.py/plugin_loader，缺目录规范校验） | 中 | 对齐.agents/skills事实标准（goose/ChatDev/FastGPT四方互证后agno为第五方） |
| 接口矩阵（Slack/Telegram/WhatsApp/Discord/AG-UI/A2A+MCP server） | ❌ | 部分（link有webhook/a2a有协议层，缺IM适配器） | 中 | A2A已对齐；IM适配器可参考DeerFlow四渠道实现 |
| cron调度+后台作业（无外部依赖内置scheduler，INTERNAL_SCHEDULER_USER_ID） | ❌ | 部分（pulse/timer.py定时器） | 中 | Hermes cron即参照 |
| 100+ toolkits（GitHub/Slack/Postgres…）+Context Providers（Slack/Drive/wiki/MCP活数据） | ❌ | 部分（MCP生态，无预置toolkit库） | 中 | MCP路线已选对，toolkit=MCP server的legacy形态 |
| 部署模板矩阵（railway/docker/aws/gcp/azure/fly/render/modal/helm 9套同构starter，prompt交给coding agent自动搭建） | ❌ | 部分（docker-compose自部署） | 低 | 行业信号：**"给coding agent的部署prompt"成为分发方式** |
| telemetry可关（AGNO_TELEMETRY=false，只发run事件不发内容） | - | - | - | 对照教训：gpt-pilot telemetry目录是供应链攻击藏身处 |

## 源码亮点
1. **环境/策略双指纹**（environments/runner.py 52KB）：env_fingerprint（任务+评分器+超时等环境要素）与policy_fingerprint（模型+prompt+工具）分离——diff时先校验同环境（MismatchError），再报告policy_changed。"回归了"能定位是环境变了还是agent变了。JudgeScorer.digest哈希judge模型全身份（class/id/provider/base_url/sampling params）。
2. **job_queue/store.py注释即规格**：每条CAS/所有权设计都写明为什么（"ids are never reused—two executors, the first one's completion fenced out"；"paused tickets are retention-exempt—must outlive arbitrary human latency"；continue的budget grant=max_attempts=attempt+1"用户触发的一次续跑绝不静默重跑"）。300行代码=分布式任务队列的最小正确实现。
3. **checkpoints.py 150行**：不引入独立持久化源，从消息级checkpoint_status标记+transcript末尾推断边界；safe_truncation_index保证快照不以悬挂tool_call结尾；孤儿tools/requirements按tool_call_id集合过滤。
4. **offload防ReDoS**：模型提供的搜索正则含`*+?{(`字符即走`python -I`子进程+10s deadline，否则进程内扫——可杀的正则执行，OpenSoul知识库标签V2的ReDoS防护可对照。
5. **错误风暴熔断**：前storm_window个attempt全部error且error_type相同→停止整个rollout（防API key失效时烧完K×N次调用）。
6. **render/_render.py**：LiveGrid rich实时网格渲染（每attempt一格），渲染回调异常自动禁用但不中断评分——展示层故障域与评估层隔离。

## 可复用设计
- **P0**：eval三件套（scorer协议+run_rollouts+diff）——OpenSoul benchmark/从"5维自评"升级到"K次采样+裁判+基线对比"的完整图纸，约800行可移植
- **P0**：job_queue契约（含paused/continue语义）——OpenSoul will/缺的队列地基
- **P1**：checkpoint快照协议（continue_from + safe_truncation）——与Langflow持久图checkpoint互证
- **P1**：scopes.py三级RBAC+过滤式列表
- **P2**：@approval装饰器与OpenMate acp-approval-modal打通（前端已有审批UI，后端补审批记录+审计型）
- 行业信号：Agent平台赛道的"评估工程化"（agno environments + Flowise Evaluation + langfuse experiments三方同季发力）说明**"agent有没有变好"正在从玄学变成CI指标**——正对用户"一直没有进化"的原话痛点
