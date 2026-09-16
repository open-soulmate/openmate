# Deep Agents (#59, langchain-ai/deepagents, 29k★) 功能研究

> 源码：~/agent-research-src/deepagents（64MB, 1688文件）。定位："batterings-included agent harness"——
> LangGraph运行时 + LangChain create_agent之上的一层opinionated harness，三层架构（Deep Agents / LangChain / LangGraph）。
> 仓库含4个产品：libs/deepagents（SDK）、libs/code（dcode终端编码agent）、libs/talon（IM长时运行host）、libs/evals。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **RubricMiddleware自评循环**：agent将完成时启动独立grader子agent对照rubric评分→needs_revision则反馈作为HumanMessage注入继续跑，直到satisfied/failed/max_iterations（rubric.py 1438行，GRADER_SYSTEM_PROMPT专职裁判prompt） | 无 | 无（benchmark/evaluator是5维自评非独立裁判+无迭代重试） | 完全没有 | **P0**。与langfuse LLM-as-Judge/Flowise Evaluation互证。cortex外挂grader：完成判定从"模型说完了"变"裁判说过了"。难度中（评分→注入→循环约200行），价值极高——直接回答"怎么算做完了" |
| 2 | **SummarizationMiddleware+溢出兜底**（2288行）：正常compaction之外，wrap_model_call捕获ContextOverflowError→强制summarize+尾部裁剪 | 无 | 无（sessions_api仅有compacted标志位） | 完全没有 | P0。OpenSoul长任务迟早撞上下文墙，现在是硬失败。需"正常压缩"+"溢出急救"双路径 |
| 3 | **工具结果双策略外置**：proactive（超阈值即外置）+ reactive（溢出时裁尾）；read_file结果head-slice+指回原路径（文件本来就在那），其他工具结果写/large_tool_results/{id}，替换成head+tail preview stub（"...[N lines truncated]..."）教模型用offset/limit分段读 | 无 | 无（vein有内容寻址存储未接工具结果） | 完全没有 | P0。与DeerFlow ToolOutputBudget/deepseek spill互证（三方）。stub文案可直接抄 |
| 4 | **PatchToolCallsMiddleware悬挂修复**：before_agent扫描无应答的tool_call（含invalid_tool_calls），自动补一条status=error的ToolMessage（"被取消或中断"），防止API因悬空tool_call报错 | 无 | 无 | 完全没有 | P1。~30行。会话中断恢复的正确性基建，OpenSoul多轮长任务必备 |
| 5 | **文件权限→HITL精确映射**（_fs_interrupt.py）：FilesystemPermission规则(deny/ask)自动转成HumanInTheLoopMiddleware的interrupt_on；**exact vs bulk两种scope**——read/write精确路径匹配才中断；ls/grep/glob是bulk：搜索子树与ask规则相交即中断，pathless grep无条件中断（因为可能碰到任何文件） | 无 | casbin用户RBAC，无工具/路径级 | 完全没有 | P0。路径级权限语义设计是政企刚需，exact/bulk二分法可直接抄 |
| 6 | **_ToolExclusionMiddleware按模型裁剪工具面**：harness profile声明excluded_tools，置于middleware栈末尾剥离前面注入的工具（filesystem/subagent等），工具对特定模型物理不可见 | 无 | 无 | 完全没有 | P1。小模型工具面过大时的token/准确率双优化，与GPT-Researcher MCPToolSelector互证 |
| 7 | **Provider级prompt caching middleware自动装配**：Anthropic/Bedrock/Fireworks各自的缓存middleware，unsupported_model_behavior="ignore"优雅降级，按已装依赖懒加载 | 无 | gland/token_meter无缓存标记 | 完全没有 | P1。成本优化直接可抄"ignore不支持"模式 |
| 8 | **read_file读视频**（_video.py）：PyAV懒加载，offset/limit语义改为秒，按采样率抽帧，输出"时间戳文本+JPEG"交错content blocks——文件工具统一入口天然支持多模态 | 无 | sense有视觉模块但不走文件工具 | 完全没有 | P2。OpenMate文件预览+OpenSoul sense联动的差异化功能 |
| 9 | **MemoryMiddleware=AGENTS.md规范**：多源（~/.deepagents/AGENTS.md→./.deepagents/AGENTS.md）顺序拼接注入system prompt，剥离HTML注释，与skills（按需加载）明确二分：memory永远在场 | 无标准目录 | hippo有记忆无AGENTS.md规范 | 部分有 | P1。agents.md已是行业规范（deepseek/opencode/pi同族），OpenSoul应落地标准目录+优先级链 |
| 10 | **Skills分层覆盖**：sources顺序加载base→user→project→team，同名last-wins；纯backend API无直接文件IO（跨存储可移植）；Anthropic progressive disclosure规范 | 无 | gene/skill_learner自动学skill但无分层目录规范 | 部分有 | P1。OpenSoul gene/补四层目录+同名覆盖语义 |
| 11 | **Subagent fork隔离**：task工具fork父上下文时剔除_FORK_EXCLUDED_STATE_KEYS（structured_response/压缩事件/session id），_FORKED_CONTEXT_KEY标记防递归委派（调用时拒绝而非隐藏工具），动态response_format | delegate_task部分有 | 无 | 部分有 | P1。"防递归在调用时拒绝而非隐藏"的设计可抄 |
| 12 | **BackendProtocol可插拔存储**（984行协议）：filesystem/state/store/composite/langsmith/context_hub/sandbox/local_shell 8种后端实现同一协议（ls/grep/glob/read/write/edit/delete/upload）；composite按路径前缀路由多后端 | 无 | vein单一存储 | 完全没有 | **P0**。OpenSoul所有工具直连本地FS，换沙箱/远程=重写。先定协议再换后端，与dcode扩展register_backend_route同族 |
| 13 | **BaseSandbox派生式实现**：具体沙箱只需实现execute()+upload_files()两个抽象方法，ls/grep/glob/read全用shell命令在沙箱内python3 -c派生实现（参数base64防注入）；edit大payload走临时文件+服务端replace脚本 | 无 | mirror/sandbox.py目录级假沙箱 | 完全没有 | P0。"接新沙箱只写两个方法"极大降低E2B/Daytona接入成本 |
| 14 | **ContextHubBackend**：文件持久化到LangSmith Hub agent repo——写入是intent批处理（50ms窗口）+commit hash乐观并发+冲突重试3次 | 无 | 无 | 完全没有 | P2（依赖LangSmith）。但"写intent批处理+乐观锁"模式可抄进vein |
| 15 | **Harness profiles按模型调优**：每个模型spec一个profile（内置anthropic_sonnet_4_6/opus_4_7/haiku_4_5/openai_codex/nvidia_nemotron），调prompt组装/工具可见性/middleware/子agent默认；可注册自定义+additive merge；与ProviderProfile（构造期）正交 | 无 | gland/router无per-model harness调优 | 完全没有 | **P0**。OpenSoul多模型混用但全用同一套prompt/工具面——这是"小模型效果差"的结构性原因之一 |
| 16 | **DeltaChannel消息reducer**：checkpoint增长跨长线程保持线性（增量存储而非全量重放） | 无 | trajectory扁平事件表 | 完全没有 | P1。长会话存储成本问题的langgraph级解法 |
| 17 | **Talon长时运行host**（实验）：单事件循环承载channel adapters（WhatsApp/Telegram/Discord，WhatsApp走loopback Node桥）+cron调度器（agent可用cron工具自助建任务）+agent runtime；checkpoints.sqlite持久会话归档（可list/search/read分页，跨compaction存活，支持mongodb/postgres）；/stop取消、/new新上下文、/reset-all-history彻底清理（故意不写进/help防误触）；**per-conversation interrupt-and-continue**（一个对话中断不block其他对话） | OpenMate有聊天UI | will/有DAG骨架无IM通道/归档 | 完全没有 | P0。与hermes-gateway/deer-flow IM四渠道互证。"归档可搜索+故意隐藏破坏性命令"两个细节可抄 |
| 18 | **Hooks三层信任**：user/project/plugin三级hooks.json，**所有匹配handler并发执行后按project→user→plugin顺序reduce**（先stop者决定事件，但plugin副作用无条件发生）；project hooks须workspace trust门（交互批准→持久化~/.deepagents/.state/hooks_trust.json，headless须--trust-project-hooks显式opt-in）；12事件含PostToolUseFailure/PreCompact/SubagentStart-Stop | 无 | 无 | 完全没有 | P0。与claude-code 33 hooks/OpenHands 6事件互证。"并发执行+顺序reduce"+"trust持久化"是新设计，值得抄 |
| 19 | **Python extensions运行时扩展**：插件声明pythonExtensions入口→async setup函数内register_middleware/register_tool/register_backend_route/on_shutdown；DEEPAGENTS_CODE_EXPERIMENTAL=1门控；backend路由变更须/restart（图构建期决定）vs 工具/middleware即时/下次请求生效——**三档生效时机显式文档化** | 无 | 无 | 完全没有 | P1。OpenMate插件系统的生效语义可对齐 |
| 20 | **THREAT_MODEL.md工程实践**：自动维护的威胁模型文档（信任假设11条+边界in/out of scope+TB编号追踪）；sandbox agent显式拒绝FilesystemBackend/LocalShellBackend直连 | 无 | immune/有安全模块无威胁模型文档 | 完全没有 | P1。为OpenSoul immune/写一份TB编号威胁模型，政企交付加分 |

## 源码亮点

- **架构三行话**：Deep Agents不引入新运行时——"opinionated harness on top of create_agent()"。middleware分三段装配：base scaffolding → caller middleware → profile/tail，subagent有自己独立的middleware栈
- **AGENTS.md工程纪律**（仓库根）：函数<20行、不加依赖须论证维护/采用/发布活跃度、warnings当errors、禁eval/exec/pickle用户输入、ChangeDetector测试禁令（"重构保留行为不应机械改测试"）
- **TUI安全细节**（libs/code/AGENTS.md）：Rich markup f-string注入风险→Content.from_markup("$var")自动转义；App.notify默认markup=True会吞方括号→动态内容必须markup=False；markdown表格逐cell转义防`|`伪造列——**外部文本进UI的转义矩阵，OpenMate可直接对表检查**
- **glyph/spinner单一事实源**：Unicode/ASCII双变体按终端能力选，禁止内联"✓"
- 目标持久化：goal_tools.py + goal_state_limits.py（goal/rubric状态落盘+notice），与LobeChat goal supervisor互证
- Corridor analyzePlan：开发期安全分析工具（生成/改代码前先用它分析plan）

## 可复用设计

1. **RubricMiddleware整套模式**（完成=裁判通过，非模型自说自话）→ cortex质量门
2. **BackendProtocol协议+BaseSandbox两方法派生** → OpenSoul存储/沙箱抽象层的直接蓝本
3. **exact/bulk文件权限→HITL映射** → immune/路径级审批
4. **Harness profiles**（per-model prompt/工具面/middleware调优）→ gland/多模型适配层
5. **Hooks"并发执行+顺序reduce+trust持久化"** → OpenSoul统一Hook层（此前已6方互证缺失，deepagents给出最完整的信任设计）
6. **工具结果外置stub文案**（教模型用offset/limit分段读回）→ vein工具溢写
7. **悬挂tool_call自动补error**（~30行）→ 立即可加的健壮性修复
