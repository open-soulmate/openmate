# LobeChat (#26, 60k★) 功能研究

源码：`~/agent-research-src/lobe-chat`（monorepo，`packages/` 下 100+ 包，2026-09 canary 分支）
研究时间：2026-09-17 03:00（源码级深读第 26 个）

> LobeChat 已从"聊天 UI"演进为**Agent 操作系统**：`packages/` 里有 100+ 个 `builtin-tool-*` 包，
> 每个都是独立 manifest+executor+systemRole 的插件化工具。这是目前见到**工具颗粒度最细**的开源项目。

## 功能清单

| # | 功能 | OpenMate（前端） | OpenSoul（后端） | 差距 | 实现建议 |
|---|------|------|------|------|------|
| 1 | **自迭代意图声明工具**（`builtin-tool-self-iteration`）：agent 运行中发现"该记到记忆/该建 skill/产品有 gap"时，调 `declareSelfFeedbackIntent(kind=memory/skill/gap, action=write/create/refine/consolidate/proposal, confidence 0-1, evidenceRefs)` 只**记意图不动手**；下游 reviewer 负责去重/审批/落盘 | 无 | 无（gene/skill_learner 会直接改，无"意图→审批"两段式） | **完全没有** | **P0**。直击用户"没有进化"痛点。设计要点：①高召回+低置信（≥0.75 有证据 / 0.45-0.74 待审）②每 topic 最多 1-3 条防 spam ③evidenceRefs 必须是稳定 id（message/tool_call/task/memory）④prompt 明确"不能宣称已保存"。OpenSoul 落位：`learn/` 加 `feedback_intent.py`，`will/` 加审批流 |
| 2 | **异构 agent 适配层**（`heterogeneous-agents/`）：把 Claude Code / Codex / Cursor / Devin / OpenCode / Pi / Kimi Code / Trae / Qoder / CodeBuddy / Amp / Droid 等**外部 CLI/ACP agent 统一成本产品的子 agent**，本地 CLI 与远程平台双类，一套 protocol（cancellation / execStdin / promptEngine）+ mainAgentCoordinator reducer | 无 | 无（acp/ 只有自家 ACP server，不做第三方 agent 编排） | **完全没有** | **P0**。这是"借力"而非"自研"的最佳范式：用户已装 Claude Code → 直接当子 agent 用。落地：OpenSoul `limb/` 加 `external_agent_adapter.py`，先支持 ACP 协议（claude-code/devin/trae/cursor 都支持 ACP），再加 CLI 逐个适配。注意错误分类：`cli_not_found` / `auth_required` + installCommands + docsUrl |
| 3 | **CLI 未装/未登录的结构化错误协议**：`HeterogeneousAgentCliError{code, command, docsUrl, installCommands, stderr}` — 前端能直接渲染"安装引导"而非报错红字 | 无 | 无 | 完全没有 | 中。低成本高体验收益，OpenMate 侧做 ErrorCard |
| 4 | **群 agent / 多 agent 群聊**（`builtin-tool-group-agent-builder` + `builtin-tool-group-management`）：群里 agent 可 `searchAgent` 邀人、`getAgentInfo` 判断对方有无工具、`speak`（说话）vs `executeAgentTask`（委派执行）二选一 | 无 | 无（delegate_task 是父子不是平级群聊） | **完全没有** | P1。OpenMate 需要群聊 UI（多 agent 头像+发言人标识）；OpenSoul 需要 agent-to-agent 消息总线。参考 OpenMate 已有 ACP proxy 基础 |
| 5 | **agent 自改配置工具**（`builtin-tool-agent-builder`）：agent 运行中可 `updateAgentConfig` / `updatePrompt` / `installPlugin` / `searchMarketTools` / `getAvailableModels`，写操作后自动 refresh store | 无 | 无（gene/templates.py 是静态模板，agent 不能改自己 prompt） | 完全没有 | P1。安全关键：必须限制可改字段 + 审计。OpenSoul 落 `gene/self_config.py` |
| 6 | **6 维用户记忆抽取器**（`memory-user-memory/src/extractors/`）：`activity` / `experience` / `identity` / `persona` / `preference` + **`gatekeeper`**（守门员：判断这条该不该进长期记忆），每个 extractor 独立 schema+prompt+测试 | 无 | 部分有（hippo/long_term_memory.py 有记忆但无分维度抽取，无 gatekeeper） | **部分有** | **P0**。gatekeeper 是关键差异——不加过滤的记忆=垃圾堆积。OpenSoul `hippo/` 加 `extractors/` 子包，5 维 schema + 1 个准入判定 |
| 7 | **Context Engine 处理器管线**（`context-engine/src/processors/`）：20+ 个独立处理器按序执行 — `ActivationResultTrim` / `DisabledToolCallFilter` / `GroupOrchestrationFilter` / `HistoryTruncate` / `MessageCleanup` / `PlaceholderVariables` / `ReactionFeedback`（把用户表情反馈喂回上下文）/ `SupervisorRoleRestore` / `ToolMessageReorder` / `VerifyMessage` … | 无 | 部分有（cortex/ 有压缩但非可插拔管线） | **部分有** | **P0**。管线化=每个 processor 单测+可开关。OpenSoul `cortex/context_pipeline/` |
| 8 | **40+ 上下文注入器**（`context-engine/src/providers/`）：`UserMemoryInjector` / `KnowledgeInjector` / `PlanInjector` / `TodoInjector` / `SelectedSkillInjector` / `ToolDiscoveryProvider` / `GoalContextSyntheticInjector` / `WorkspaceContextInjector` / `SystemDateProvider` / `ForceFinishSummaryInjector` / `OnboardingActionHintInjector` … 全部独立类可单测 | 无（OpenMate 只在前端拼 prompt） | 部分有（cortex 拼 system prompt，但非注入器对象） | **部分有** | P1。这是 OpenSoul cortex 的正确重构方向 |
| 9 | **会话流结构化 + 诊断**（`conversation-flow/`）：`indexing`（建 helper maps）→ `parse` → `structuring`；`transformation/` 下 `BranchResolver`（分支解析）+ `ContextTreeBuilder`（上下文树）+ `FlatListBuilder`；**`doctor/diagnose.ts`** 自动扫描话题里丢失/悬挂的消息 id 并生成 `RepairOp` | 无 | 部分（trajectory/ 有事件轨迹） | **部分有** | P1。`doctor` 思路极佳——"会话数据自愈"，OpenSoul `trajectory/doctor.py` |
| 10 | **Goal 监督者工具**（`builtin-tool-goal/supervisor.ts`）：独立 supervisor agent 有 `inspectGoal`（读目标图+预算+版本）/ `inspectTask`（读中断契约+历史尝试+handoff）/ `readArtifact` / `resolveInterruption(action=retry\|escalate)`。systemRole 明确"只有 resolveInterruption 才算提交，散文回答不算"、"handoff 是上报证据不是文件系统探测" | 无 | 部分（will/dag_planner 有调度无监督恢复） | **部分有** | **P0**。长时任务必备。防"假成功"的 prompt 纪律值得直接抄 |
| 11 | **Verify 工具**（`builtin-tool-verify`）：agent 自查产出是否满足验收标准 | 无 | 无 | 完全没有 | P1。轻量，OpenSoul `cortex/verify.py` |
| 12 | **工具干预 UI 注册表**（`builtin-tools/src/interventions.ts`）：每个工具 API 可注册自定义"干预 UI"组件（审批面板/参数编辑器），`dynamicInterventionAudits.ts` 动态审计 | 无 | 无（无工具审批，见前轮结论） | **完全没有** | P1。与前轮 codex/gemini/langchain 三方印证的"工具审批流"合并实现 |
| 13 | **Notebook 工具**（`builtin-tool-notebook`）：agent 可读写结构化笔记本 | 无 | 无（hippo 只有记忆非文档） | 完全没有 | 中。与 WeKnora 知识库可打通 |
| 14 | **User Interaction 工具**（`builtin-tool-user-interaction`）+ 异构 agent 的 `askUser/AskUserBridge`：外部 agent 的提问能**透传到宿主 UI** 由真人回答 | 无 | 部分（acp 有 elicitation 但不透传到外部 agent） | **部分有** | P1。OpenMate 需要统一"待回答问题"面板 |
| 15 | **设备控制包**（`device-control/`）：`workspace.ts` + `filePreview.ts` + `projectFileIndex.ts` + `projectFileSearchManager.ts` + `skillDirectory.ts` + `claudeCodeQuota.ts` | 部分（OpenMate 有 workspace 面板） | 无 | **部分有** | P1。`projectFileIndex`（项目文件索引+搜索）OpenMate 可直接抄 |
| 16 | **设备沙箱**（`device-sandbox/`）：`capability.ts` + `policy.ts` + `presets.ts` + `launchPlan.ts` + `srt.ts`（SRT 隧道）+ `srtWinStaging.ts`（Windows 分阶段部署） | 无 | 部分（mirror/sandbox.py 只是目录级） | **部分有** | P2。Windows staging 思路对国内政企环境有参考价值 |
| 17 | **OTel + gen_ai 语义约定可观测性**（`observability-otel/`，含 `gen-ai/` 子目录）：按 OpenTelemetry GenAI 标准打 LLM trace | 无 | 无（trajectory/ 是自研事件，非标准） | **完全没有** | **P0**。用户"我都不知道他们在干嘛"=可观测性痛点。直接用 gen_ai 语义约定，未来可接任何 OTel 后端 |
| 18 | **Eval rubric 引擎**（`eval-rubric/`）：`AnswerExtractor`（从输出抽答案）→ `matchers`（规则/LLM 双模式匹配）→ rubric 评分（`passThreshold` 默认 0.6），支持 benchmark 级 extractor + 每条 rubric 独立 reason | 无 | 无（benchmark/ 是性能测试非质量评估） | **完全没有** | **P0**。用户"没有进化"的另一面：没有评估就无法证明进化。落 OpenSoul `cortex/eval/` |
| 19 | **Agent Signal 事件源**（`agent-signal/`）：`signal.action.applied/failed/skipped` 三态 + scopeKey + 注册表 + builder，工具执行结果以"信号"回流 UI | 无 | 部分（trajectory/ 有事件） | **部分有** | P2。三态（applied/failed/**skipped**）设计值得注意——skipped 也要可见 |
| 20 | **5 套 IM 适配器独立包**（`chat-adapter-feishu/imessage/line/qq/wechat`）：每个平台一个包，统一 adapter 接口 | 无 | 部分（OpenSoul 有 gateway 多平台但非独立 adapter 包） | **部分有** | P2。OpenSoul gateway 已有基础，缺的是**包化隔离**（单平台崩不影响整体） |
| 21 | **Heterogeneous agent 配额系统**（`heterogeneous-agents/src/quota/`）：`cost.ts` + `windows.ts`（时间窗）+ `loadBalancer.ts` + `calibration.ts`（校准）+ `readings.ts` + `snapshot.ts` + `identity.ts` + `usageApi.ts` | 无 | 部分（token_meter 有 budget 无时间窗/负载均衡） | **部分有** | P1。多外部 agent 时必需 |
| 22 | **内置 MCP server**（`heterogeneous-agents/src/builtinMcp/LobeBuiltinMcpServer.ts`）：把宿主能力以 MCP 形式暴露给外部 agent | 无 | 部分（OpenSoul mcp/ 是客户端） | **部分有** | P1。反向 MCP（宿主当 server）是让外部 agent 用上 OpenSoul 记忆的关键 |
| 23 | **Model bank + 标准参数**（`model-bank/`）：`aiModels` + `modelProviders` + **`standard-parameters`**（跨模型参数标准化） | 无 | 部分（gland/ 有 provider 但无标准参数层） | **部分有** | P2 |
| 24 | **python-interpreter 独立包** + **web-crawler** + **file-loaders** + **eval-dataset-parser**：基础设施全部包化 | 无 | 部分 | 部分有 | P2 |
| 25 | **Agent tracing**（`agent-tracing` / `llm-generation-tracing`）：与 OTel 平行的 LLM 生成级追踪 | 无 | 部分（trajectory） | 部分有 | P2 |

## 源码亮点

1. **"意图声明"与"落盘执行"彻底分离**（self-iteration）。agent 只负责高召回地喊"这里该改"，
   由下游 pipeline 负责去重/审批/执行。这解决了 agent 自我改进的两个经典死法：
   ①不敢改（漏掉学习信号）②乱改（污染记忆/技能库）。**这是本次研究最有价值的单一设计。**

2. **异构 agent 适配 = 生态杠杆**。`heterogeneous-agents/src/adapters/` 里 12+ 个适配器，
   用户已有的 Claude Code / Cursor / Devin 直接变成 LobeChat 的子 agent。不用赢过对手，直接收编对手。

3. **每个工具 = 一个独立包**（manifest + executor + systemRole + types + tests）。
   `builtin-tools/src/register.ts` 统一注册。新工具零侵入主干。

4. **systemRole 即纪律**。GoalSupervisor 的"散文回答不算提交"、self-iteration 的"不能宣称已保存"、
   agent-builder 的写操作后 store refresh —— 把防 agent 说谎的规则写进工具自带的 system prompt。

5. **conversation-flow/doctor**：不信任数据，主动扫描会话树找悬挂 id / 丢失消息并生成 RepairOp。

6. **e2e 用 Cucumber + Playwright**（`e2e/`），AGENTS.md 要求每个 bugfix 必须有"改前失败、改后通过"的回归测试。

## 可复用设计

| 设计 | 直接复用到 | 难度 | 价值 |
|------|-----------|------|------|
| `declareSelfFeedbackIntent` 三参 schema（kind/action/confidence/evidenceRefs） | OpenSoul `learn/feedback_intent.py` | 中 | **极高** |
| gatekeeper 记忆准入判定器 | OpenSoul `hippo/extractors/gatekeeper.py` | 低 | 高 |
| Context processor 管线（每处理器独立类+可开关） | OpenSoul `cortex/context_pipeline/` | 中 | 高 |
| Eval rubric（extractor → matcher → threshold） | OpenSoul `cortex/eval/` | 中 | 高 |
| OTel gen_ai 语义约定 | OpenSoul `trajectory/` 升级 | 中 | 高 |
| Goal supervisor 四工具 + 防假成功 prompt | OpenSoul `will/supervisor.py` | 中 | 高 |
| 异构 agent ACP 适配器 + 结构化 CLI 错误 | OpenSoul `limb/external_agent_adapter.py` | 中高 | 极高 |
| conversation doctor（数据自愈） | OpenSoul `trajectory/doctor.py` | 低 | 中 |
| 工具干预 UI 注册表 | OpenMate 工具审批面板 | 中 | 高 |
| 项目文件索引+搜索（projectFileIndex） | OpenMate workspace | 低 | 中 |

## 三方/四方互证 → OpenSoul 升 P0 的能力

（与前几轮 codex×gemini×langchain×opencode 结论合并）

1. **工具审批流 / 干预 UI**（本轮 LobeChat 加码：干预组件注册表）
2. **记忆准入 gatekeeper + 6 维分维度抽取**（本轮新增）
3. **自迭代意图→审批→落盘两段式**（本轮新增，直击"没有进化"）
4. **质量评估 rubric 引擎**（本轮新增，"进化"的度量）
5. **OTel GenAI 可观测性**（本轮新增，直击"不知道他们在干嘛"）
6. **异构外部 agent 适配**（本轮新增，最高杠杆）
7. **Goal 监督与中断恢复**（本轮新增，长时任务必需）
