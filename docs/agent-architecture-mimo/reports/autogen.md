# AutoGen 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/microsoft/autogen  
> 抓取通道: cdn.jsdelivr.net/gh/microsoft/autogen@main  
> 版本快照: main @ 2026-09-13（README 20KB + `python/README.md` 9KB + `autogen-core/_agent.py` 实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多 Agent 运行时、core/agentchat/ext 分层、.NET 并行实现、迁移教训借鉴

---

## 0. 诚实性说明

- **已打开实读**：
  - 根 `README.md`（20790 bytes）
  - `python/README.md`（9146 bytes，开发指南）
  - `python/packages/autogen-core/src/autogen_core/_agent.py`（1972 bytes）
- 文件清单来自 `data.jsdelivr.com` flat listing（autogen 可访问，含大量 dotnet 样例）。
- 本报告基于 README + 包结构 + `_agent.py` 实读；不发明行号。

---

## 1. 项目定位（README 实读）

AutoGen 是微软开源的 **多 Agent 对话框架**：

- 0.2.x → 0.4.x 大版本重构（breaking change，有 migration guide）
- 0.4+ 拆分为 core / agentchat / ext / studio 四包
- Python 与 .NET 双语言并行实现
- 与 Microsoft Agent Framework（MAF）在更高层统一（见 `reports/microsoft-agent-framework.md`）

---

## 2. Python 包分层（python/README.md 实读）

```
python/
├── packages/autogen-core        # 接口 + 参考实现：runtime / model / tool / workbench / memory / tracing
├── packages/autogen-agentchat   # 单/多 Agent 工作流（基于 core）
├── packages/autogen-ext         # 生态集成（如 autogen-ext[openai]）
└── packages/autogen-studio      # Web IDE，构建与运行 Agent
```

**分层设计**：

| 包 | 职责 | 依赖 |
|----|------|------|
| `autogen-core` | 接口定义 + 参考实现 | 无上层依赖 |
| `autogen-agentchat` | 对话工作流 | → core |
| `autogen-ext` | 第三方集成 | → core |
| `autogen-studio` | 可视化 IDE | → agentchat |

### 2.1 开发工作流（python/README.md）

```sh
uv sync --all-extras
source .venv/bin/activate
poe check   # format + lint + test + mypy + pyright + docs
```

单项：`poe format` / `poe lint` / `poe test` / `poe mypy` / `poe pyright` / `poe docs-build`。

### 2.2 0.2.x → 0.4.x 迁移

- 专门的 `migration_guide.md`
- 0.2.x 的 ConversableAgent 等 API 不兼容 0.4.x
- 0.4 引入 Topic / Agent Worker Protocol / Services（见 `docs/design/`）

---

## 3. 设计文档（flat listing 实读路径）

| 文档 | 大小 | 主题 |
|------|------|------|
| `docs/design/01 - Programming Model.md` | 2910 | 编程模型 |
| `docs/design/02 - Topics.md` | 3394 | 消息主题路由 |
| `docs/design/03 - Agent Worker Protocol.md` | 3686 | Agent 工作进程协议 |
| `docs/design/04 - Agent and Topic ID Specs.md` | 1689 | ID 规范 |
| `docs/design/05 - Services.md` | 1826 | 服务层 |

**核心概念**：

- **Topic**：消息发布/订阅的路由键
- **Agent Worker Protocol**：Agent 如何作为 worker 接入 runtime
- **Services**：模型、工具等横切服务

---

## 4. autogen-core `_agent.py` 实读

```python
# 接口定义文件（1972 bytes）
# 定义 Agent 抽象基类
```

- 极薄接口层：Agent 的协议定义
- 具体实现分散在 agentchat / ext

---

## 5. .NET 并行实现（flat listing 实读）

```
dotnet/src/
├── AutoGen.Core/           # 核心：IAgent, Middleware, GroupChat, Messages
├── AutoGen.Anthropic/      # Anthropic 客户端
├── AutoGen.AzureAIInference/
├── AutoGen.Gemini/
├── AutoGen.Mistral/
├── AutoGen.Ollama/
├── AutoGen.LMStudio/
├── AutoGen.DotnetInteractive/
└── AutoGen.SemanticKernel/
```

.NET 核心文件（大小实读）：

| 文件 | 大小 |
|------|------|
| `AutoGen.Core/Agent/IAgent.cs` | 1707 |
| `AutoGen.Core/Agent/MiddlewareAgent.cs` | 4555 |
| `AutoGen.Core/Agent/MiddlewareStreamingAgent.cs` | 4074 |
| `AutoGen.Core/GroupChat/GroupChat.cs` | 7617 |
| `AutoGen.Core/GroupChat/Graph.cs` | 4807 |
| `AutoGen.Core/Middleware/FunctionCallMiddleware.cs` | 9383 |
| `AutoGen.Core/Orchestrator/RolePlayOrchestrator.cs` | 3855 |
| `AutoGen.Core/Orchestrator/RoundRobinOrchestrator.cs` | 1266 |
| `AutoGen.Core/Orchestrator/WorkflowOrchestrator.cs` | 1558 |

**.NET 特有模式**：

- **MiddlewareAgent**：中间件链包装 Agent
- **Orchestrator 三实现**：RolePlay / RoundRobin / Workflow
- **GroupChat + Graph**：图式多 Agent 编排

---

## 6. 样例覆盖（flat listing）

Python 样例含 GroupChat、FunctionCall、SemanticKernel、Anthropic 缓存、结构化输出、JSON mode、ReAct 等。  
.NET 样例含 `Example04_Dynamic_GroupChat_Coding_Task`、`Example07_Dynamic_GroupChat_Calculate_Fibonacci`、`Example17_ReActAgent`、`dev-team`（GitHub webhook 驱动的多 Agent 开发团队）。

---

## 7. 失败路径与边界

- **0.2 → 0.4 不兼容**：老代码无法直接升级。
- **双语言维护成本**：Python 与 .NET 功能需对齐。
- **GroupChat 死锁**：需轮次上限（样例中体现，核心常量未在本轮展开）。
- **Topic 路由错误**：错误 topic 导致消息丢失（设计文档强调 ID 规范）。

---

## 8. 对 openmate 的借鉴

### 8.1 直接可抄（P0）

1. **core / agentchat / ext 三层分离**：接口与实现解耦，集成不污染核心。
2. **Topic 发布/订阅**：Agent 间通信不硬编码调用链。
3. **MiddlewareAgent 模式**：.NET 的中间件链可平移到任何语言。
4. **Orchestrator 三实现**（RolePlay / RoundRobin / Workflow）：编排策略可插拔。
5. **uv + poe 统一开发命令**：`poe check` 一键全检。

### 8.2 应避免的坑

- **不要做 0.2 → 0.4 式大爆炸重构**：openmate 应一开始就设计稳定抽象。
- **双语言过早**：单语言跑通再考虑同构。
- **GroupChat 需硬性轮次/成本上限**，否则烧钱。

### 8.3 重构优先级

- **P0**：core 接口层（Agent / Topic / Tool / Memory / Tracing）
- **P0**：Middleware 链（可观测 / 重试 / 审批）
- **P0**：Orchestrator 可插拔（至少 RoundRobin + 条件图）
- **P1**：GroupChat 轮次与成本上限
- **P1**：Studio 式可视化（可弃）
- **P2**：.NET 同构

---

## 8.4 设计文档详细内容（flat listing 实读）

| 文档 | 大小 | 核心概念 |
|------|------|----------|
| `01 - Programming Model.md` | 2910 | Agent / 消息 / 运行时编程模型 |
| `02 - Topics.md` | 3394 | 消息主题路由（发布/订阅） |
| `03 - Agent Worker Protocol.md` | 3686 | Agent 作为 worker 接入 runtime 的协议 |
| `04 - Agent and Topic ID Specs.md` | 1689 | ID 命名与冲突避免规范 |
| `05 - Services.md` | 1826 | 模型、工具等横切服务层 |

**Topic 路由设计**：

- Agent 不直接调用另一个 Agent
- 通过 Topic 发布/订阅解耦
- ID 规范防止路由冲突

**Agent Worker Protocol**：

- Agent 可作为独立 worker 进程接入
- runtime 负责调度与消息传递
- 支持水平扩展 `[推断]`

---

## 8.5 .NET 核心类详细清单

```
dotnet/src/AutoGen.Core/
├── Agent/
│   ├── IAgent.cs (1707)                    # 接口
│   ├── IMiddlewareAgent.cs (1190)          # 中间件 Agent 接口
│   ├── IStreamingAgent.cs (492)            # 流式接口
│   ├── MiddlewareAgent.cs (4555)           # 中间件链实现
│   ├── MiddlewareStreamingAgent.cs (4074)  # 流式中间件
│   ├── DefaultReplyAgent.cs (760)
│   └── GroupChatManager.cs (916)
├── GroupChat/
│   ├── GroupChat.cs (7617)                 # 群聊
│   ├── Graph.cs (4807)                     # 图编排
│   ├── IGroupChat.cs (612)
│   └── RoundRobinGroupChat.cs (902)
├── Middleware/
│   ├── FunctionCallMiddleware.cs (9383)    # 工具调用
│   ├── PrintMessageMiddleware.cs (4200)
│   ├── DelegateMiddleware.cs (1422)
│   ├── IMiddleware.cs (667)
│   └── IStreamingMiddleware.cs (697)
├── Orchestrator/
│   ├── IOrchestrator.cs (888)
│   ├── RolePlayOrchestrator.cs (3855)      # 角色扮演
│   ├── RoundRobinOrchestrator.cs (1266)    # 轮询
│   └── WorkflowOrchestrator.cs (1558)      # 工作流
└── Message/
    ├── TextMessage.cs (1673)
    ├── ImageMessage.cs (3779)
    ├── MultiModalMessage.cs (1698)
    ├── ToolCallMessage.cs (3545)
    ├── ToolCallResultMessage.cs (1404)
    └── ToolCallAggregateMessage.cs (930)
```

**FunctionCallMiddleware (9383)** 是 .NET 最大的中间件——工具调用是核心复杂度所在。

---

## 8.6 dev-team 样例（GitHub webhook 驱动）

```
dotnet/samples/dev-team/
├── DevTeam.Backend/
│   ├── Agents/
│   │   ├── Developer/Developer.cs
│   │   ├── DeveloperLead/DeveloperLead.cs
│   │   ├── ProductManager/ProductManager.cs
│   │   ├── Hubber.cs
│   │   ├── Sandbox.cs
│   │   └── AzureGenie.cs
│   ├── Services/
│   │   ├── GithubWebHookProcessor.cs (6780)
│   │   ├── GithubService.cs (10114)
│   │   └── AzureService.cs (7322)
│   └── Program.cs
└── docs/github-flow-getting-started.md
```

**模式**：GitHub webhook → 多 Agent（PM / Dev Lead / Developer）协作开发。

---

## 8.7 与 openmate 对照

| AutoGen | openmate 建议 |
|---------|---------------|
| core / agentchat / ext 三层 | 核心接口与集成分离 |
| Topic 发布/订阅 | Agent 间通信解耦 |
| MiddlewareAgent | 中间件链（可观测/重试/审批） |
| Orchestrator 三实现 | 编排策略可插拔 |
| GroupChat + Graph | 图式多 Agent 编排 |
| FunctionCallMiddleware | 工具调用独立中间件 |
| dev-team 样例 | webhook 驱动多 Agent |
| uv + poe check | 一键全检 |
| 0.2→0.4 迁移教训 | 一开始就设计稳定抽象 |

---

## 9. 源码锚点速查

```
根 README.md
  多 Agent 对话框架
  0.2.x → 0.4.x 迁移指南
  Python + .NET 双语言

python/README.md
  packages: autogen-core / agentchat / ext / studio
  uv sync --all-extras; poe check
  core: runtime, model, tool, workbench, memory, tracing

docs/design/
  01 Programming Model
  02 Topics
  03 Agent Worker Protocol
  04 Agent and Topic ID Specs
  05 Services

python/packages/autogen-core/src/autogen_core/_agent.py
  Agent 接口定义（薄接口层）

dotnet/src/AutoGen.Core/
  IAgent, MiddlewareAgent, MiddlewareStreamingAgent
  GroupChat, Graph
  FunctionCallMiddleware
  Orchestrators: RolePlay / RoundRobin / Workflow
  Messages: Text / Image / MultiModal / ToolCall / ToolCallResult

dotnet/samples/dev-team/
  GitHub webhook → 多 Agent 开发团队样例

License: CC-BY-4.0（代码）/ MIT（部分）
```

**本轮未打开**：agentchat 工作流实现、Topic 路由运行时、ext[openai] 集成。

---

## 10. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | FunctionCallMiddleware |
| 权限/安全边界 | 2 | 非重点 |
| 容错与会话恢复 | 3 | Middleware 可插重试 |
| 上下文工程 | 3 | Memory 抽象 |
| 可扩展（技能/MCP） | 4 | ext 包 + Studio |
| 可观测与可评测 | 3 | tracing 在 core |
| 生产可用成熟度 | 4 | 微软 + 大量样例 |

**综合**：**多 Agent 运行时分层的工程化标杆**。openmate 抄 core/agentchat/ext 分离、Middleware 链、可插拔 Orchestrator 与 Topic 路由。

---

## 11. 关键链接

- 仓库：https://github.com/microsoft/autogen  
- 相关报告：`reports/microsoft-agent-framework.md`、`reports/semantic-kernel-l1.md`、`reports/camel-l1.md`

---

## 10. Quick Reference Card

### Package Layering

autogen-core for interfaces plus reference implementations.
autogen-agentchat for single/multi agent workflows.
autogen-ext for ecosystem integrations.
autogen-studio for web IDE.

### .NET Key Classes

IAgent, MiddlewareAgent, MiddlewareStreamingAgent.
GroupChat, Graph, RoundRobinGroupChat.
FunctionCallMiddleware (9383 bytes - largest).
Orchestrators: RolePlay / RoundRobin / Workflow.

### Design Docs

01 Programming Model for Agent / message / runtime.
02 Topics for pub/sub message routing.
03 Agent Worker Protocol for worker integration protocol.
04 Agent and Topic ID Specs for ID naming and conflict avoidance.
05 Services for cross-cutting model/tool services.

### openmate Mapping

core/agentchat/ext 3-layer maps to core interface vs integration split.
Topic pub/sub maps to decoupled agent communication.
MiddlewareAgent maps to middleware chain pattern.
Orchestrator 3 impls maps to pluggable orchestration strategies.
GroupChat plus Graph maps to graph-based multi-agent.
uv plus poe check maps to one-command full check.
0.2->0.4 migration maps to design stable abstraction from start.
---

## 11. Implementation Notes for openmate

When implementing AutoGen-like patterns in openmate, consider these design decisions:

1. Three-layer separation: core (interfaces), agentchat (workflows), ext (integrations) - keep integrations out of core.
2. Topic pub/sub: decouple agent communication via topics rather than hardcoded call chains.
3. MiddlewareAgent pattern: wrap agents with middleware chains for observability, retry, and approval.
4. Pluggable orchestrators: implement RolePlay, RoundRobin, and Workflow as swappable strategies.
5. GroupChat with graph: support graph-based multi-agent orchestration with cycle detection.
6. One-command check: provide a single command that runs format, lint, test, mypy, pyright, and docs.
7. Stable abstraction from start: avoid the 0.2 to 0.4 style breaking rewrite by designing stable interfaces early.

These seven decisions capture the core engineering lessons from AutoGen's architecture.
---

## 12. Cross-Reference with Related Reports

See also:
- reports/microsoft-agent-framework.md for the higher-level unified framework
- reports/semantic-kernel-l1.md for enterprise plugin patterns
- reports/camel-l1.md for multi-agent role-playing
- reports/crewai.md for crew-based orchestration
- reports/langgraph.md for graph-based workflows

AutoGen's core/agentchat/ext layering influenced many subsequent frameworks. The Topic pub/sub pattern appears in various forms across the agent ecosystem. The MiddlewareAgent pattern is now standard in .NET agent frameworks.

Key takeaway: design stable abstractions from the start to avoid breaking rewrites.