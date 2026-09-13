# OpenHands（原 OpenDevin）架构研究报告

> 研究日期：2026-09-13 | 仓库：https://github.com/OpenHands/OpenHands | 关联仓：software-agent-sdk / automation / typescript-client / OpenHands-CLI  
> 研究目的：为 openmate 稳定性重构提供架构借鉴（sandbox runtime、event stream、microagents、browser、evaluation）

---

## 1. 元信息

| 项 | 内容 |
|---|---|
| 项目名 | OpenHands（原 OpenDevin） |
| 定位 | 开源自托管 **Developer Control Center / Agent Canvas**，可运行 OpenHands、Claude Code、Codex、Gemini 等任意 ACP 兼容 agent |
| 主语言 | Python（SDK/Agent Server/Tools/Workspace）+ TypeScript（Agent Canvas 前端、TS Client） |
| 许可 | 多仓拆分；主仓偏商业托管 + OSS Canvas；SDK 为 MIT |
| 规模指标 | SWE-Bench 宣称 77.6；被 TikTok / VMware / Netflix / Apple / NVIDIA / Google 等使用；有 arXiv 论文 2511.03690 |
| 产品形态 | npm 包 `@openhands/agent-canvas`（本地/服务器）、Docker 镜像 `ghcr.io/openhands/agent-canvas`、Cloud/Enterprise |
| 多仓边界 | **OpenHands/OpenHands**=Canvas 前端；**software-agent-sdk**=Python SDK + Agent Server + tools + workspace；**typescript-client**=浏览器 TS 客户端；**automation**=调度/webhook/自动化；**OpenHands-CLI**=终端 CLI |

---

## 2. 架构

### 2.1 总体分层

```
Agent Canvas（React/TS 前端）
        │  REST + WebSocket（OpenAPI）
        ▼
OpenHands Agent Server（FastAPI，多 conversation / 多 user）
        │  调用 SDK Conversation.run()
        ▼
Software Agent SDK
  ├── Agent（推理-行动循环，Critic / ResponseDispatch / ParallelToolExecutor）
  ├── LLM（Router / 多 provider / retry / telemetry）
  ├── Conversation（事件日志 + 状态机）
  ├── Tools（Terminal / FileEditor / TaskTracker / Browser / MCP…）
  ├── Workspace（LocalWorkspace / DockerWorkspace / RemoteAPIWorkspace）
  ├── Condenser（上下文压缩）
  ├── Security（LLM 内联 security_risk + ConfirmationPolicy）
  └── Skills / Microagents（触发式可复用知识）
```

### 2.2 关键设计点

1. **多仓微服务化**：Agent 行为单一事实源在 SDK；Agent Server 只暴露 REST/WS；Canvas 只做 UI 与后端选择；Automation 只做“何时跑”。职责边界清晰，利于 openmate 拆分“执行引擎 / 宿主 UI / 调度”。
2. **Workspace 可替换**：同一 Agent 代码可在 Local / Docker / Remote/K8s 间切换，靠 `LocalWorkspace → RemoteWorkspace → DockerWorkspace/RemoteAPIWorkspace` 继承扩展。这是 **sandbox 隔离的核心抽象**。
3. **Agent Server 是多租户进程内 API**：单 host/port 上跑多个 conversation；含 conversation / event / bash / git / file / vscode / desktop / skills / sub_agents / plugins / hooks / llm / mcp / settings / workspaces / profiles / agent_profiles / telemetry 等 router；启动时清理 stale tmux、并发起 VSCode 与 tool preload 服务。
4. **事件系统 = append-only 记忆 + 集成点**：不可变 Pydantic Event；分 LLM 可见（Message/Action/Observation/SystemPrompt/UserReject/AgentError）与内部（CondensationRequest/Condensation/Pause/StateUpdate）。`Event.source`（user/agent/environment）与 LLM `role` 故意解耦。
5. **Skills（微智能体/知识注入）**：
   - Repository Skill（trigger=None，常驻，读 `AGENTS.md` 等）
   - Knowledge Skill（KeywordTrigger，消息关键词）
   - Task Skill（TaskTrigger + inputs）
   - Path Rule（PathTrigger glob，注入 ObservationEvent 的 `<EXTRA_INFO>`，每 conversation 去重一次，零基础成本）
   - 支持内联 `` !`cmd` `` 动态渲染、frontmatter 嵌入 MCP server 配置
6. **安全体系**：工具 schema 自动加 `security_risk` 字段，LLM 内联预测 LOW/MEDIUM/HIGH/UNKNOWN；策略 `AlwaysConfirm / NeverConfirm / ConfirmRisky(threshold, confirm_unknown)`；只读工具可用 readOnlyHint 跳过。
7. **Browser**：历史 OpenDevin 有 browser 工具；当前 SDK 侧 VSCode service + agent 可挂载 browser 类工具；Canvas 有 browser UI 组件。openmate 侧应抽象 `BrowserRuntime` 接口（CDP）。

---

## 3. Loop 与工具

### 3.1 Agent.step 主循环（同步/异步对称）

```
init_state（SystemPromptEvent 必须在 prefix 前 3 事件内，否则断言）
  → 处理 pending actions（implicit confirmation）
  → 检查 UserPromptSubmit hook 是否 block
  → prepare_llm_messages（condenser 可能返回 CondensationRequest 并提前 return）
  → 非多模态模型收到图片 → 改写为 vision_inspect 引用或直接结束
  → llm.generate（流式 on_token；异常分类处理）
       · FunctionCallValidationError → 注入 user 修正消息
       · ContentPolicyViolation → 注入“换措辞继续”
       · MalformedHistory / ContextWindowExceeded → CondensationRequest 或重建 view
  → classify_response:
       TOOL_CALLS → _handle_tool_calls
       CONTENT    → _handle_content_response
       REASONING/EMPTY → 处理
```

### 3.2 工具调用批处理 `_ActionBatch`

- `_truncate_at_finish`：FinishTool 之后的 tool call 直接丢弃（防失控）
- 阻塞动作（hook reject）从 executable 中拆出，写 `UserRejectObservation`
- `ParallelToolExecutor` 线程池并发执行（`tool_concurrency_limit`）
- 事件按原始 action 顺序 emit（保证 event log 可重放）
- `finalize`：Finish 后可做 iterative refinement followup（注入 user message）或 `execution_status=FINISHED`

### 3.3 内置工具面（openhands.tools）

- `TerminalTool`（tmux 会话，socket 隔离；启动时清理 stale session）
- `FileEditorTool`
- `TaskTrackerTool`
- Grep / 浏览器 / VSCode 集成等
- 统一 Action / Observation / Executor 模式 + Pydantic 校验
- MCP：`MCPToolDefinition`，从 skill frontmatter 或 MCP hub 拉起

### 3.4 与 Automation 的边界

Automation 服务决定**何时**跑（cron/webhook），dispatch conversation 到 Agent Server；Agent Server/SDK 决定**怎么跑**。openmate 若做定时重构任务，可仿此拆分。

---

## 4. 稳定性 / HA 设计

| 机制 | 说明 | 对 openmate 启示 |
|---|---|---|
| **事件日志 append-only** | 30k+ 事件不物化全量 list；`EventLog` O(1) 长度；file-backed | 稳定重构基座：可回放、可审计、可断点续跑 |
| **SystemPromptEvent 不变量** | init 前缀扫描；user 不得先于 system prompt | 防 resume / lazy-load 顺序 bug |
| **Condenser 主动压缩** | context overflow 时 `CondensationRequest`；`LLMSummarizingCondenser` | 长任务不断链；openmate 需要“策略可配置的 condenser” |
| **malformed tool call 修复** | `normalize_tool_call` / `fix_malformed_tool_arguments` / alias / terminal fallback | LLM 输出容错是稳定性核心 |
| **错误分级** | AgentErrorEvent（tool 级，可恢复）vs ConversationErrorEvent（对话级，run 抛错） | 不能把可恢复错误抬升为致命 |
| **finish 截断 + hook 阻塞** | Finish 后动作丢弃；PreToolUse/UserPromptSubmit 可 block | 防 agent 跑飞 |
| **并行工具线程安全约束** | `_execute_action_event` 不得改共享 conversation 状态；状态转移在主线程 | 锁与状态机分离 |
| **tmux 清理** | 服务器启动 kill 残留 session | 沙箱残留资源治理 |
| **secret 脱敏** | 422 validation 回包 sanitize；错误响应带 error_id 关联 traceback | API 稳定与可观测 |
| **deferred init** | warm pool 先 503，POST /api/init 后放行 | 云原生冷启动 |
| **Docker sandbox 推荐** | README 警告本地直跑会暴露整个文件系统 | openmate 默认 sandbox 策略 |
| **Observability** | Laminar/OTel span；tool result record；request_failed telemetry（路由模板而非真实 path） | 稳定性重构必须有 trace 基线 |

**HA 评价**：OpenHands 在“长对话 + 沙箱 + 多租户”场景的稳定性设计最完整（事件源 + 压缩 + 分级错误 + 风险门控）。缺点是组件多、本地栈重（Node 22 + uv + Docker）。

---

## 5. 自我进化

| 维度 | 机制 |
|---|---|
| **知识注入** | Skills/Microagents：常驻 AGENTS.md、关键词知识、任务模板、路径规则；支持动态 `!cmd` |
| **公开 skill 市场** | `load_public_skills=True` 加载 OpenHands/extensions（uv/deno lock 文件自动激活） |
| **第三方格式兼容** | 解析 `.cursorrules`、`agents.md`、`GEMINI.md`、`CLAUDE.md` |
| **Plugins** | 扩展工具与生命周期；与 skills marketplace 配合 |
| **Sub-agents** | sub_agents_router，多 agent 协作（重构类大任务） |
| **Critic** | CriticMixin，可对 action 做二次评估并写入 critic_result |
| **Iterative refinement** | Finish 后检查是否需要 followup |
| **Evaluation** | 历史 OpenDevin 有 evaluation harness（SWE-Bench 等）；现 SDK 论文强调可组合可扩展基础；Canvas 有 automation 集成测试 |
| **自写代码占比** | 未像 Aider 宣称 singularity%，但 ecosystem skill/plugin 可社区贡献 |

---

## 6. 对 openmate 借鉴

**必须借鉴（高优先级）**

1. **Event Stream 作为唯一事实源**：Action/Observation/Message/Condensation 事件化；UI、重放、审计、断点全部挂在事件日志上。
2. **Workspace 抽象**：`Local / Docker / Remote` 三态；openmate 稳定性重构应把“执行环境”从 Agent 逻辑中拔出。
3. **Condenser 一等公民**：不要等 context 爆了再截断历史；设计 `handles_condensation_requests()` 契约。
4. **finish 截断 + hook 门控**：最便宜的失控防护。
5. **Skill/Microagent 触发模型**：Repository 常驻 + Keyword + Task + Path 四态，比单一 `.clinerules` 更稳。
6. **security_risk 内联预测 + ConfirmationPolicy**：零额外 LLM 调用的风险门。
7. **AgentError vs ConversationError 分离**。

**谨慎借鉴**

- 多仓微服务对中小团队过重；openmate 可先 monorepo + 清晰 package 边界。
- Agent Server 全量 router 面过大；先做 conversation/event/tools 三路由。
- tmux 终端方案：跨平台（Windows）是坑，openmate 需评估伪终端方案。

---

## 7. 关键源码路径

### OpenHands/OpenHands（Agent Canvas 前端）
```
docs/architecture.md
docs/README.md
AGENTS.md
bin/                     # agent-canvas 启动器
scripts/
src/api/                 # Agent Server / cloud / settings / git / skills / automations
src/components/          # conversation / chat / browser / files / settings / backend / automation
src/hooks/
src/stores/              # Zustand
src/i18n/
src/mocks/               # MSW mock
```

### OpenHands/software-agent-sdk（核心）
```
openhands-sdk/openhands/sdk/
  agent/agent.py                 # Agent.step / astep / _ActionBatch
  agent/critic_mixin.py
  agent/parallel_executor.py
  agent/stream_context.py
  agent/response_dispatch.py
  conversation/                  # LocalConversation / ConversationState
  event/                         # Event 基类、llm_convertible/、condenser.py、conversation_error.py
  context/skills/skill.py        # Skill 模型
  context/skills/trigger.py      # Keyword/Task/Path Trigger
  context/skills/execute.py      # !cmd 动态渲染
  context/condenser/             # LLMSummarizingCondenser 等
  security/analyzer.py           # SecurityAnalyzerBase
  security/risk.py               # SecurityRisk
  security/confirmation_policy.py
  llm/                           # LLM / RouterLLM / exceptions
  tool/                          # ToolDefinition / builtins

openhands-tools/openhands/tools/
  terminal/   file_editor/   task_tracker/   ...

openhands-workspace/openhands/workspace/
  DockerWorkspace / RemoteAPIWorkspace

openhands-agent-server/openhands/agent_server/
  api.py                         # FastAPI app + lifespan + tmux 清理
  conversation_router.py
  event_router.py
  bash_router.py  git_router.py  file_router.py
  vscode_router.py  desktop_router.py
  skills_router.py  sub_agents_router.py
  plugins_router.py  hooks_router.py
  llm_router.py  mcp_router.py
  workspace_router.py  workspaces_router.py
  openai/router.py               # OpenAI 兼容网关
examples/01_standalone_sdk/ 02_remote_agent_server/ 03_github_workflows/ 05_skills_and_plugins/
```

### OpenHands/automation
```
（调度、webhooks、run history、dispatch 到 Agent Server）
```

---

## 8. 评分（面向 openmate 稳定性重构价值，10 分制）

| 维度 | 分 | 说明 |
|---|---|---|
| 事件流与状态机成熟度 | **9.5** | 业界最完整的 typed event + 不变量 + 压缩 |
| Sandbox/Workspace 隔离 | **9.0** | Local/Docker/Remote 抽象清晰 |
| 长任务稳定性（HA） | **9.0** | condenser + 分级错误 + finish 截断 + hook |
| 工具系统与并行执行 | **8.5** | Action/Observation 模式好；并行需严格状态纪律 |
| Microagent/Skill 自我进化 | **9.0** | 四态触发 + 动态渲染 + MCP 绑定 |
| 复杂度与上手成本 | **6.0** | 多仓、多语言、依赖 Node22+uv+Docker |
| Windows/本地兼容 | **6.5** | tmux/终端在 Windows 弱 |
| 对 openmate 可移植性 | **8.5** | 事件源、Workspace、Condenser、Skill 可直接抄思想 |
| **综合** | **8.5** | 稳定性重构的“架构样板”，但要裁剪规模 |

---

## 9. 一句话结论

OpenHands 是三者中最接近“生产级 agent 平台”的架构：**以不可变事件日志为记忆、以可替换 Workspace 为隔离、以 Condenser/Security/Hook 为稳定阀门、以 Skill 为进化接口**。openmate 稳定性重构应优先移植其事件源与 Workspace 抽象，再按团队规模裁剪 Agent Server 面。
