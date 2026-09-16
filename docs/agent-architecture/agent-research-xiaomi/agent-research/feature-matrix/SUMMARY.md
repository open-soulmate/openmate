# 100Agent功能研究 · 总结（v2全面重写）

> 重写时间：2026-09-17 深夜轮13（cron）
> 覆盖：13轮迭代、172份feature-matrix报告、~95/100个agent源码级深读
> 前一版SUMMARY停留在轮0的目录级结论，已被13轮源码级发现全面超越——本文件是唯一权威总结。

---

## 一、研究覆盖与方法

- **源码级深读~95个**：openclaw、claude-code（npm逆向sdk.d.ts 9313行）、hermes-agent、deepseek-harness、opencode、AutoGPT、firecrawl、dify、langflow、langchain、codex、browser-use、gemini-cli、TradingAgents、pi、open-webui、OpenHands、deer-flow、n8n、daytona、MetaGPT、cline、anything-llm、mem0、autogen、lobe-chat、litellm、crewai、open-interpreter、kilocode（六轮91项）、goose（六轮）、Warp（六轮~75项）、CowAgent（三补验）、nanobot、agno、AIHawk、Langfuse、E2B、Composio、Khoj、GPT-Researcher、STORM、Flowise、Langflow、aider、deepagents、continue、agent-zero、SWE-agent、Roo-Code、AgentScope、ChatDev、FastGPT、UI-TARS-desktop、Langroid、PromptFlow、swarms、camel、ms-agent-framework、mcp-pysdk/tssdk、agentops、openllmetry、jina-reader、ToolBench、generative-agents、SuperAGI、AgentVerse、lagent、open-deep-research、privateGPT、semantic-kernel、haystack、litellm、gpt-researcher、huginn、librechat、devika、khoj、storm、ag2、bettafish、composio、e2b、n8n、flowise…（详见feature-matrix/目录172份文件）
- **结论级销账**：cursor/cursor-cli（闭源，CSV两条失实）、agent-framework-dotnet（仓库404）、AgentGPT（已归档）、gpt-pilot（停维护+遭供应链蠕虫）、smol-developer（整库合成被证伪）、warp早期"闭源预期"已修正为完全开源（事实修正3条）
- **方法**：本地clone库~/agent-research-src/（~120GB，13轮沉淀）+ web_extract raw通道 + 每轮grep对照OpenMate(/home/climbing/openmate/src)与OpenSoul(/home/climbing/opensoul)确认"已有/部分有/完全没有"

## 二、行业格局信号（2026-09快照）

1. **性能敏感路径下沉编译语言成默认**：open-interpreter 58k★放弃Python转Rust Codex fork；continue索引热路径Rust crate；litellm Rust核心
2. **平台收编/停运潮**：Continue Dev Inc.停运（36k★）、goose捐给Agentic AI Foundation、ChatDev三线分裂（2.0降级角色扮演为legacy）、daytona核心闭源、AgentGPT归档——**36k星≠存活，SaaS共享层先死，本地资产长存**
3. **`.agents/skills/`目录约定五方定案**（goose/ChatDev2.0/FastGPT/OpenHands/Warp）=无可争议事实标准，OpenSoul skills.py需对齐
4. **HITL协议词汇收敛**：MCP elicitation(accept/decline/cancel)+ag2 ElicitationPolicy+ms-agent-fw审批恢复spec——照此实现不自创
5. **OTel GenAI semconv被官方收编**——trajectory字段应对齐gen_ai标准
6. **"评估工程化"同季发力**：agno environments+Flowise Evaluation+langfuse experiments+n8n Evaluation
7. **供应链安全成为agent特有攻击面**：gpt-pilot telemetry目录藏蠕虫窃凭证——第三方依赖出网白名单+telemetry专项审计是immune必修

## 三、跨项目互证核心结论（多方证据≥3的定案能力）

### P0-1 上下文压缩引擎（OpenSoul完全为零，cortex最大单项差距）
- **证据7方**：kilocode compaction.ts 742行（预算化尾部选择+消息粒度二分切分+prune三层触发+replay重放+auto-continue防呆滞+失败三级降级）、goose structured.rs（9段式JSON摘要：user_intent/technical_concepts/files/errors_and_fixes/problem_solving/user_messages/pending_tasks/current_work/next_step，每列表按重要性排序"消费方可从尾部截断"）、deepseek compaction锁三段式、pi compaction携带readFiles清单、OpenHands Condenser、letta、anything-llm
- **最佳抄写组合**：goose管摘要长什么样（9段式+宽容反序列化+多候选JSON提取）+ kilocode管切哪里/失败怎么办/不丢用户最后的话
- OpenSoul现状：仅hippo token_budget记忆注入+sessions compacted标志位

### P0-2 工具结果外置/溢出处理（7方互证）
- deepagents（proactive超阈值+reactive溢出裁尾+stub教模型分段读回）、DeerFlow ToolOutputBudget、deepseek spill、goose large_response_handler(~80行)、kilocode Truncate服务（2000行/50KB双限→落盘+preview+按agent能力分级提示）、ODR compress_research（子agent只回传蒸馏结果）、AIHawk SHOWN/SENT双预算（截断必须显式标记）
- OpenSoul：零

### P0-3 工具权限审批引擎（10+方，安全刚需）
- claude-code：6模式+PermissionUpdateDestination四层目的地+ProvenanceEntry设置溯源（policyOrigin 7种）
- AgentScope PermissionEngine 848行=Claude-Code权限的Python完整复刻（5模式4行为，tool_name+rule_content按类型分流）——**可整体移植为immune/permission_engine.py**
- kilocode：三层叠加（base×approved×session wildcard findLast）+hardRuleset硬否决+**敏感权限必须真人交互回复**（机器审批静默拒绝留pending）+权限provenance写回tool part metadata（"为什么允许/拒绝"可审计）
- Roo-Code RooProtectedController（agent不能改自己的规则文件，auto-approve也拦）
- goose permission_judge LLM只读判定+结果缓存（审批弹窗疲劳解法）
- OpenSoul现状：casbin用户级RBAC——无工具/路径/参数粒度

### P0-4 可观测性三层模型（直击"我都不知道他们在干嘛"）
- **模型骨架**：langfuse Trace→Observation(嵌套span)→Score；OpenSoul trajectory是扁平事件表（有parent_event_id雏形）
- **token逐项归因**：claude-code SDKContextUsage（mcp_tools[]/memory_files[]/agents[]/skills[]每项多少token+over_limit.kind区分）
- **noop自报+streak**（claude-code ScheduleWakeup必须自报noop，连续noop折叠统计）、idle-detector（anything-llm，纯宿主侧60s弹窗）、循环检测（Jaccard 0.85/3-gram，anything-llm+Khoj组合签名+deepseek guard，四方）
- goose peek三指标（durable turn数+idle时长+buffered通知数="不知道它在干嘛"的行业首个完整实现）
- Warp LrcActivity进程树活性采样（DiskWait="真实进展非挂死"）
- daytona会话录制+回放、Warp录屏4x回放、UI-TARS GUIAgentData逐屏回放
- **用户极度重视可观测性→此P0含金量最高**

### P0-5 评估闭环（"但是一直没有进化啊"的度量解法）
- langfuse LLM-as-Judge+Dataset+Experiment+确定性采样；agno environments（run_rollouts k=8全隔离+error-storm熔断+env指纹vs policy指纹分离+to_sft_jsonl导出SFT数据集）——最完整参照
- Flowise Evaluation四实体+CostCalculator；n8n Evaluation Test-Runs；LobeChat eval-rubric；ToolBench win_rate双跑（新旧版本对跑+GPT裁判）
- RubricMiddleware（deepagents）：完成=独立grader对照rubric评分通过，非"模型说完了"
- OpenSoul benchmark/evaluator=5维自评非裁判，是代差

### P0-6 记忆系统升级路线（hippo的差距清单）
- **三因子检索**（generative-agents，40行可移植）：recency(0.99^i)+importance(poignancy 1-10)+relevance(cos_sim)等权归一——hippo只有时间衰减
- **Dream蒸馏**（nanobot+CowAgent两方互证）：history.jsonl journal→LLM调用archive工具显式确认记忆检查点；CowAgent Deep Dream五步蒸馏prompt（严禁编造材料外信息防幻觉条款）
- **TradingAgents决策延迟回填**（pending→update_with_outcome，带真实反馈信号的记忆——"不进化"痛点独有解）
- **防记忆回声**（kilocode，15行）：recall命中过的回合跳过digest防自我污染
- DeerMem：每fact一个md+三标签(scope/durability/authority) fail-closed+近重复并入门(token-Jaccard+CJK bigram)
- Khoj DateFilter/FileFilter/WordFilter自然语言检索过滤+记忆CRUD API（用户可看/改/删AI对自己的记忆——信任设计）
- LobeChat gatekeeper（记忆准入判定）+6维抽取器
- codex两阶段记忆管线（Phase1提取+Phase2 consolidation agent+版本化）

### P0-7 自我进化机制（"一直没有进化"的机制化解法）
- **claude-code ProposeSkills**：agent主动提议skill（kind=new|improvement），必须给evidence（观察到该流程的memory文件路径）+完整SKILL.md原文，用户审阅卡片一键保存——最直接解
- **LobeChat declareSelfFeedbackIntent**（本轮单设计价值最高）：agent只"声明改进意图"+confidence+evidenceRefs稳定id，**绝不动手**；reviewer负责去重/审批/落盘——"高召回声明+严格审批"解掉不敢改/乱改两个死法
- gemini-cli skill-extraction-agent自动从对话提炼skill；kilocode Wakeup自主唤醒+Goal自主目标循环（五状态机+事件驱动结果判定+失败即停）
- CowAgent idle进化触发器（60s扫描×idle≥N∧context>0.8×budget，进化结果推送回来源IM渠道）+_WorkspaceWriteGuard硬护栏+内置skills保护+无效结果回滚
- OpenSoul heredity/self_evolution.py(181行)只有分析——触发器/动作/护栏/回滚/记账全部缺失

### P0-8 后台作业/长任务引擎（7方互证）
- agno job_queue/store.py 300行（idempotency/claim亲和/heartbeat续锁/stale回收/CAS幂等）、langfuse BullMQ 30+队列+secondary queue隔离+DeadLetter、n8n leader-election、kilocode BackgroundJob注册表（token防ABA+extend续段+promote前台↔后台）、goose summon async子agent（task_id+peek/cancel）、agent-zero parallel作业工具、camel Workforce（modify_task_content运行时干预）
- OpenSoul：零（main.py只有系统级后台任务）

### P0-9 HITL人机协同（10+方协议收敛）
- FastGPT Pause双态（ask用户/tool_child子流程快照）+PendingMainContext标准消息格式（**换provider也能恢复**）、AgentScope AWAITING=parked（事件流自然结束不占进程，带UserConfirmResult从持久化state续跑——比挂起等待优雅）、DeerFlow Clarification表单卡v2（16字段/24选项/16KB）、goose工具执行中Elicitation+审批决策=消息（重放时重建防重复确认）、Warp AskUserQuestion多问题分页多选卡、open-webui tool_approval三态（拒绝=合成错误工具结果loop不断）
- OpenMate已有acp-approval-modal（缺参数粒度/恢复契约/audit型）

### P0-10 会话资产化（fork/import/迁移，四方定案）
- goose session/import_formats：嗅探Claude Code/Codex/Pi三种.jsonl→统一转原生Session（"用了别家agent的用户迁移进来"成行业功能）；kilocode session-import双向；pi会话=追加树(id/parentId)+切分支自动摘要；opencode文件快照git对象库；open-webui parentId消息树+fork环检测
- **OpenMate已有trajectory fork+replay（fork_point_event_id）**——是现有资产中最接近行业标准的能力，升级方向=消息树parentId+跨agent格式导入

## 四、OpenMate（前端）差距清单

| 功能 | 现状 | 差距 | 参照 | 优先级 |
|---|---|---|---|---|
| 多agent编排树UI | 无 | 完全没有 | Warp orchestration树（drill-down+面包屑+subtree rollup+血缘单一真源） | P1 |
| 后台作业面板（peek三指标） | 无 | 完全没有 | goose peek+kilocode BackgroundJob | P1 |
| 聊天框插话队列 | 无（运行时消息=新会话?） | 完全没有 | Khoj interrupt_queue(~15行)/goose Steer(78行)/nanobot注入队列 | P1 |
| 交互式提问卡（多问题/多选） | acp-approval-modal单问题 | 部分有 | Warp AskUserQuestion/Dify表单 | P1 |
| Agent主动建议卡 | 无 | 完全没有 | kilocode suggest工具（agent弹建议卡引导下一步） | P2 |
| 本地↔云端Handoff | 无 | 完全没有 | Warp /handoff整卡流转 | P2 |
| Zero State（引导+changelog） | 无 | 完全没有 | Warp zero_state（内容驱动可见性） | P2 |
| 文件编辑diff审批视图 | scm-panel只有git工作区diff | 部分有 | Warp tui_file_edits_view（per-message diff账本） | P2 |
| /usage额度面板 | cost_tracker日/月费用 | 部分有 | Warp usage_menu（credits条+圆点） | P3 |
| per-message累计diff账本 | 无 | 完全没有 | kilocode summary.ts（"这条消息后改了啥"） | P2 |
| 流式输出脱敏展示 | 无 | 完全没有 | Warp secret_redaction（hover点击揭示UX） | P1 |
| 消息级revert×文件快照联动 | edit_guard系统级快照 | 部分有 | kilocode revert/unrevert | P2 |
| 已有优势（勿重做） | xyflow画布+graph-engine、trajectory fork/replay、审批UI、monitoring页、workspace | — | — | — |

## 五、OpenSoul（后端）差距清单（按器官）

| 器官 | 差距项 | 参照 | 优先级 |
|---|---|---|---|
| cortex | 上下文压缩引擎（9段式摘要+预算化切分+失败降级） | goose+kilocode合读 | P0 |
| cortex | 循环/重复检测guard | anything-llm Jaccard 0.85+Khoj组合签名 | P0 |
| cortex | LLM重试策略（Retry-After三格式+5xx重试+离线三态） | kilocode retry.ts | P0 |
| cortex | 模型降级有序链（fallback+限流立即切备胎） | CowAgent chat fallback链 | P0 |
| cortex | 按模型Harness profiles（prompt/工具面/middleware per-model） | deepagents | P1 |
| cortex | Code Mode工具批量化（N次调用批成1个execute） | goose code_execution+kilocode code-mode（两方定案） | P1 |
| immune | 输出侧护栏（流式脱敏20正则+输出侧注入审计门） | Warp secret_redaction+agent-zero _infection_check | P0 |
| immune | 工具级权限引擎（5模式4行为+路径/参数粒度） | AgentScope PermissionEngine 848行可整体移植 | P0 |
| immune | skill供应链防御（origin钉死+原子swap+校验） | kilocode discovery.ts ~80行 | P1 |
| hippo | 三因子检索+Dream蒸馏+CRUD API+自然语言过滤 | generative-agents+nanobot+Khoj | P0 |
| hippo | 记忆回声阻断+准入gatekeeper | kilocode+LobeChat | P1 |
| will | 后台作业队列（idempotency/heartbeat/租约恢复） | agno job_queue 300行 | P0 |
| will | Goal自主目标循环（五状态机+失败即停+用户抢占不打断） | kilocode goal runner 492行 | P1 |
| will | 分阶段checkpoint断点续跑 | STORM分阶段落盘+agno /continue?continue_from | P1 |
| trajectory | span嵌套观测模型+Score挂载+gen_ai semconv对齐 | langfuse三层 | P0 |
| trajectory | token逐项归因（per-tool/per-agent） | claude-code SDKContextUsage | P1 |
| gene/learn | 自进化闭环（触发器+声明式意图+审批落盘+回滚+记账） | LobeChat声明+CowAgent触发器+claude-code ProposeSkills | P0 |
| multi_agent | 子agent压缩出口+peek可观测+跨会话编排五工具 | ODR+goose summon/orchestrator | P1 |
| mcp | 会话级工具隔离endpoint+发布侧auth+消费侧白名单 | Composio+swarms MCPDeployer+ODR MCPConfig | P1 |
| mirror | 真隔离沙箱（E2B snapshot-fork/网络策略热更新） | E2B（现为目录级假沙箱） | P1 |
| benchmark | LLM裁判+数据集+实验对比评估闭环 | langfuse+agno environments | P0 |
| 已有优势 | 器官分层架构、262 tools/100+provider、gateway多平台、cron、MCP基础、casbin、handoff_context | — | — |

## 六、优先级路线图（按"用户痛点×证据强度×实现成本"排序）

### 第一阶段（直击两大原话痛点）
1. **可观测性**：trajectory升级span嵌套模型（langfuse骨架）+后台作业peek三指标+noop自报——"我都不知道他们在干嘛"
2. **评估闭环**：LLM-as-Judge+数据集+实验对比——"但是一直没有进化啊"的度量前提
3. **上下文压缩引擎**：goose 9段式+kilocode切分策略合抄进cortex
4. **输出侧安全**：Warp 20正则并入immune+接线LLM请求路径（150行，立即可做）

### 第二阶段（能力骨架）
5. 工具权限引擎（AgentScope 848行整体移植）
6. 后台作业队列（agno 300行参照）
7. 记忆升级（三因子检索40行+Dream蒸馏prompt整段抄+CRUD API）
8. 自进化闭环（声明式意图+审批落盘，LobeChat范式）
9. 聊天插话队列（Khoj 15行/Steer 78行）

### 第三阶段（生态与差异化）
10. .agents/skills目录标准对齐（五方定案）
11. 会话导入（goose嗅探转换器）+消息树fork升级
12. Code Mode工具批量化、MCP会话隔离、真沙箱、Handoff、编排树UI

## 七、工程经验沉淀（13轮方法论）

1. **网络**：git clone对GitHub时好时坏（SSL eof/112K停滞），codeload tarball大仓库会**静默截断**（curl退出码仍0！必须tar tzf校验）；raw+web_extract代理是最稳通道；大仓库放独立轮次专攻，≤2路并行
2. **本地优先**：~/agent-research-src/本地库足够全部深挖，cron轮零网络为主
3. **grep确认纪律**：每轮关键词对照双侧代码库，区分"NONE/部分/巧合命中"——node_modules与static JS是巧合重灾区
4. **测试名即安全声明**：goose/Warp多个项目的测试函数名就是安全规格（可直接抄进immune测试）
5. **注释即规格书**：kilocode/CowAgent的commit与docstring密度全行业第一，cortex/immune首选抄写对象
6. **CSV失实3条**：cursor(#34/#84闭源)、agent-framework-dotnet(#96仓库404)、warp早期判断已修正

## 八、输出文件索引

- feature-matrix/：172份md（每agent一份+六轮kilocode/goose/Warp/CowAgent补验+批次清账）
- PROGRESS.md：13轮逐轮详细日志（新功能发现+grep确认清单）
- synthesis/openmate-rewrite-blueprint.md：重写蓝图
- 本地源码库：~/agent-research-src/（~120个仓库）
- 下一步：~5个CSV尾部目标收尾 + 按第一阶段路线图开始实现
