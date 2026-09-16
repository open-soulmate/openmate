# DeerFlow（bytedance/deer-flow, #18, 82k★）功能研究 — 源码级深读

> 源码：~/agent-research-src/deer-flow（backend/packages/harness/deerflow + app/gateway）
> 定位：LangGraph 超级agent全栈（Gateway 8001 + Next.js前端 3000 + Nginx 2026 + Provisioner 8002）
> 本轮重点：从L1架构认知升级为**源码功能清单**（此前23-deer-flow.md只有架构概览）

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **36个有序Middleware推理链**（InputSanitization→ToolOutputBudget→ToolResultSanitization→ThreadData→Sandbox→DanglingToolCall→LLMError→Authz/Guardrail→SandboxAudit→ReadBeforeWrite→ToolProgress→Receipt→…→Clarification共36项，lead/subagent共享基座） | 无 | 无（cortex推理是单体函数） | 完全没有 | **本轮最大发现**。OpenSoul cortex应拆为有序middleware栈；langchain四钩子标准(before_model/after_model/wrap_model_call/wrap_tool_call)已两轮互证，此处是全工业实现 |
| 2 | **ToolOutputBudget超长工具结果外置**：超预算结果写`.tool-results/`文件，留类型化摘要+read_file引用；后续同路径成功read/write后，wrap_model_call把旧write_file内容换成引用（elide_superseded_writes） | 无 | 无（vein有内容寻址存储未接） | 完全没有 | 与deepseek-harness"spill"互证。参数：storage_subdir/keep_recent_writes/superseded_write_min_chars，直接抄 |
| 3 | **ToolResultSanitization**：web_fetch/web_search/MCP来源的结果中和`<system-reminder>`等框架标签，防外部页面伪造可信上下文；本地工具输出不动 | 无 | immune/intrusion.py有输入侧检测 | 部分有 | 补工具结果侧的标签中和，MCP工具按`deerflow_mcp`元数据全量覆盖 |
| 4 | **ReadBeforeWrite写门**：read_file在ToolMessage上盖内容hash戳；对已存在文件write/str_replace时，若最新hash不匹配当前文件→**拒绝写入**（必须先读再写） | 无 | 无 | 完全没有 | 防盲写覆盖用户改动。~100行，gate+per-(thread,path)串行锁。与用户"改代码前先研究现有实现"规则同构 |
| 5 | **ToolReceipt工具回执台账**：每个ToolMessage盖确定性溯源（工具名/状态/args+output hash/字节数/时间戳），模型调用前派生r1..rN回执台账（2000字符预算超限保留最新），**模型引用回执ID可验证** | 无 | 无 | 完全没有 | "不知道在干嘛"的证据链解法：回答里引用r7→前端可展开r7原始工具结果 |
| 6 | **ClarificationMiddleware表单卡v2**：ask_clarification工具→Command(goto=END)中断+丢弃同turn兄弟工具调用；form模式16字段/24选项/16KB上限，结构损坏整体降级为选项/自由文本 | 无 | 无（clarif/ask_user零命中） | 完全没有 | OpenSoul intelligence已有意图识别，补ask_clarification工具+OpenMate表单渲染 |
| 7 | **DanglingToolCall修复**：用户打断留下无响应tool_calls→注入占位ToolMessage，严格provider不拒下一轮请求 | 无 | 无 | 完全没有 | 打断恢复刚需，小而必做 |
| 8 | **DeerMem记忆=每fact一个md文件**（YAML frontmatter+sha256前缀分桶），memory.json只存摘要不存facts；用户锁+共享revision+fact revision+恢复journal，冲突rebase | 无 | hippo/long_term_memory.py集中存储 | 部分有 | 文件级fact粒度→单fact改写不重写全库；与用户"文件只存一份"哲学一致 |
| 9 | **记忆驱逐双策略**（confidence默认 / hybrid-v1=confidence×确认新鲜度×访问热度，shadow模式记录分歧不执行）+ **Staleness Review定期复审**（keep/remove/extend，每轮删除上限）+ **Consolidation合并**（源fact必须存在不重叠，取最新创建时间+最早复审期限） | 无 | hippo有decay衰减 | 部分有 | LongMemEval基准跑过的产品级参数，benchmark/deermem_eviction有复现协议 |
| 10 | **写侧近重复fact门**（fact_dedup）：新fact与同类别现有fact释义重复→并入（保留原id/confidence取max）而非追加；token-Jaccard确定性无网络，CJK bigram参与 | 无 | 无 | 完全没有 | 防记忆库膨胀，50行。与Gatekeeper(LobeChat)互证 |
| 11 | **记忆抽取安全标签**：抽取提议必须带scope/durability/authority，自动写只接受user-scoped+durable+descriptive；矛盾删除带reason+replacement，task/project域删除fail-closed | 无 | 无 | 完全没有 | 防agent乱写记忆，fail-closed设计可直接抄 |
| 12 | **子agent双预算**：max_concurrent_subagents（每响应1-64）+ max_total_subagents（每run 1-50，默认6），超限剥掉task调用强置finish_reason=stop+可见限额说明 | 部分（delegate_task） | 无持久化预算 | 部分有 | 防子agent爆炸式繁殖（claude-code failure_mode有subagent_overspawn） |
| 13 | **Delegation Ledger持久委托账本**：task委派写入ThreadState.delegations（含进行中+终态摘要），终态永不降级，跨compaction存活，作为DurableContext投影回每个模型请求 | 无 | 无 | 完全没有 | "压缩历史后仍知道委派过什么"——OpenSoul长任务必备 |
| 14 | **SkillToolPolicy技能工具钳制**：skill激活后其allowed-tools过滤模型可见schema+拦截执行，决策签名绑定run token防伪造；tool_search/describe_skill保留为框架安全工具 | 无 | gene/skill_learner无工具钳制 | 完全没有 | skill不该能调任意工具——安全边界，fail-closed |
| 15 | **DeferredToolFilter延迟工具加载**：MCP工具schema默认隐藏，tool_search或McpRoutingMiddleware（按用户消息自动提升）才注入；per-thread提升记录hash作用域 | 无 | mcp/server全量暴露 | 完全没有 | 与claude-code tool_search/gpt-researcher MCPToolSelector三方互证→**OpenSoul MCP全量暴露是token浪费** |
| 16 | **Python扩展五贡献点**：middleware/任务生命周期/系统模型observer/Gateway服务/FastAPI路由，`deerflow extensions install/upgrade/enable/disable` CLI+事务+锁纪律；config.yaml plugins:列表=操作员信任边界 | 无 | 无 | 完全没有 | OpenSoul无第三方代码插件系统。信任模型设计（API可写vs操作员专属）可直接抄 |
| 17 | **消息溯源戳+释放策略自描述**：所有注入/改写消息盖additional_kwargs(deerflow_content_kind/producer_kind/entity_id)；行为可配middleware实现release_policy_parameters()自描述 | 无 | 无 | 完全没有 | observer从事实而非措辞分类raw→visible变换 |
| 18 | **X-Trace-Id全链路**：ContextVar唯一源，5个入口（HTTP/调度/MCP通知/IM/内嵌客户端）各自绑定，caller传入一律替换，日志/run记录/头三处一致 | 无 | trajectory扁平事件无trace id | 部分有 | 一次可做完的可观测地基 |
| 19 | **调度任务持久队列**：uq唯一活跃occurrence约束+queued/launching/running状态机+租约恢复（multi_instance需Postgres+心跳+advisory锁全局并发帽）+preview-cron API+DST语义 | 无（will/是DAG骨架） | 无 | 完全没有 | OpenSoul will/补生产级调度运行时的教科书 |
| 20 | **双层授权**：AuthorizationProvider（Layer1能力过滤+Layer2执行检查）+GuardrailProvider独立第二道；模型级authorize("model","use")带降级扫描；路由级6权限缓存；sandbox:execute门 | 无 | casbin用户RBAC非工具/模型级 | 完全没有 | 政企多租户刚需（与Composio授权托管同族） |
| 21 | **SandboxAudit命令位置分析**：$()/反引号按**位置**判级——命令位（管道/&&/eval参数后）执行外部内容=拦，值位（x=$(...)）只捕获输出=放；heredoc体当数据 | 无 | 无 | 完全没有 | 防御纵深（沙箱才是边界），AST级命令分类 |
| 22 | **子agent身份双ID**：provider tool_call_id=关联键（消息/事件/前端卡片），服务端execution_id=注册表/轮询/取消/超时键；provider ID不全局唯一绝不能当注册表所有权键 | 无 | 无 | 完全没有 | 并发子agent的坑全写在AGENTS.md里了 |
| 23 | **IM渠道统一入口**：Feishu/Slack/Telegram/DingTalk→同一agent，IM入站context=可信身份源，channel_user_id只从IM context来 | 无 | 无 | 完全没有 | OpenMate目前纯Web，IM是openclaw/AstrBot/CowAgent共同标配 |
| 24 | **MCP持久任务运行时**：McpTaskService+mcp_tasks表+租约恢复，长MCP工作不占agent循环，只有submit对agent可见，通知重试+死信 | 无 | 无 | 完全没有 | 与Langfuse DeadLetter队列互证 |
| 25 | **SystemMessageCoalescing**：每请求所有SystemMessage合并为单条leading（vLLM/SGLang/Qwen/Anthropic严格后端兼容） | 无 | 无 | 完全没有 | 便宜的provider兼容层 |

## 源码亮点

- **Middleware装配顺序本身是产品**：`_build_runtime_middlewares` 13步+lead专属22步+尾部安全3步，每个middleware的AGENTS.md写明"必须紧跟X之后/必须最外层"的顺序约束，扩展loader(ordering.py)强制校验
- **ReadBeforeWrite的wrap_model_call把被拒写入的死payload换成占位符**——模型看到的是"该写入已被拒绝"而非原始大段内容，state/receipts/journal保留原文
- **LoopDetectionMiddleware状态机**：WARNED(带hint)→BLOCKED(可重试类)；stop类立即block；硬停时清空structured/raw/content-block三种tool_calls形态再强置文本回答
- **TerminalResponseMiddleware**：provider返回空AIMessage→注入恢复prompt重试一次→二次空则替换为可见错误，run以error结束而非静默成功
- **ViewImageMiddleware**：base64图只活在当次ModelRequest不进checkpoint，每次调用先扫除自己的旧消息再按需重建（防历史里stranded base64每轮重发）
- **benchmarks即产品**：deermem_eviction/concurrency/context_snapshot三套可复现基准，离线测试不需网络凭证，数据集按SHA-256钉版本

## 可复用设计

1. **OpenSoul cortex推理链middleware化**（#1）——从DeerFlow抄顺序骨架：输入消毒→输出预算→结果消毒→错误处理→工具门→进度→回执→澄清
2. **ReadBeforeWrite + ToolReceipt**（#4/#5）——两个都是百行级、独立可上、直击"改坏文件"和"不知道在干嘛"
3. **DeferredToolFilter**（#15）——OpenSoul mcp全量暴露立即止血
4. **DeerMem的fact文件化+抽取安全标签+近重复门**（#8/#10/#11）——OpenSoul hippo升级的现成参数
5. **调度队列状态机**（#19）——will/从骨架到运行时的完整参考实现（含租约恢复文档）
6. **AGENTS.md文档纪律本身**：每个子系统一份AGENTS.md=子系统的单一事实源，跨组件不变量显式写出（OpenMate/OpenSoul文档体系可仿）
