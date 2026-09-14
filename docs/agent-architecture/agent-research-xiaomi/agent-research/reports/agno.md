# agno-agi/agno 架构调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/agno-agi/agno |
| 语言 | Python |
| License | Apache-2.0 |
| 定位一句话 | **Agent 平台框架与运行时**：SDK 构建 + AgentOS 服务化 + Web UI 管理，JWT RBAC 多租户开箱即用 |
| 商业 | Agno AgentOS（托管/自部署）；多云 starter 模板 |
| 文档 | docs.agno.com（含 MCP server 与 llms-full.txt） |

> 对 openmate：Agno 是「**平台化**」路线的代表——不仅编排 Agent，还提供 50+ 生产 API 端点、JWT RBAC、人类审批暂停、cron 调度、OpenTelemetry 观测。openmate 若要从库升级为可管理的 Agent 平台，Agno 的 AgentOS 分层是直接参考。

---

## 1. 系统架构

### 1.1 三层模型

```
┌─────────────────────────────────────────────────────┐
│ AgentOS UI（控制面：监控、审计、管理）                  │
├─────────────────────────────────────────────────────┤
│ AgentOS Runtime（50+ REST 端点 + SSE + WebSocket）    │
│  JWT RBAC · 多用户/多租户隔离 · MCP Server            │
├─────────────────────────────────────────────────────┤
│ Agno SDK                                            │
│  Agent · Team · Workflow                            │
│  Storage · Memory · Knowledge · Tools               │
└─────────────────────────────────────────────────────┘
```

### 1.2 核心抽象层级

| 抽象 | 用途 | 何时使用 |
|---|---|---|
| **Agent** | 单个执行体：构建上下文 → 跑模型 → 执行工具 → 返回 RunOutput | 单一领域、最小 token 成本 |
| **Team** | 多 Agent 协作（含嵌套 Team），leader 协调成员 | 需要专业化分工、路由/广播/任务列表 |
| **Workflow** | 编排 Agent/Team/函数的有序步骤（顺序、并行、循环、条件） | 固定控制流、可重复管线 |

### 1.3 部署模板

`agentos-railway` / `agentos-docker` / `agentos-aws` / `agentos-gcp` / `agentos-azure` / `agentos-fly` / `agentos-render` / `agentos-modal` / `agentos-helm`——同一 starter，仅部署脚本不同。

---

## 2. 核心机制深潜

### 2.1 Agent

```python
from agno.agent import Agent
from agno.models.openai import OpenAIResponses

agent = Agent(
    model=OpenAIResponses(id="gpt-5.4-mini"),
    tools=[...],
    db=SqliteDb(db_file="tmp/app.db"),
    add_history_to_context=True,
    num_history_runs=3,
)
agent.print_response("...", user_id="u1", session_id="s1")
```

**关键能力**：
- 工具可选；可加 memory、knowledge、storage、human-in-the-loop、guardrails
- Context Providers：从 Slack、Drive、wiki、MCP 拉实时数据
- 100+ Toolkit 集成（GitHub、Slack、Postgres 等）

### 2.2 状态与会话（Sessions）

| ID | 用途 | 生成规则 |
|---|---|---|
| `run_id` | 标识一次执行 | Agno 每次 run 新生成（除非显式提供） |
| `session_id` | 将相关 runs 归组为一个线程 | Agent 实例首次 run 时生成，之后复用 |
| `user_id` | 关联 run/session 到用户 | 应用提供或使用默认值 |

**持久化与模型上下文分离**：

| 配置 | 效果 |
|---|---|
| `db=...` | 持久化 session 记录、runs、state、消息 |
| `add_history_to_context=True` | 将同 session 历史消息加入下次模型请求 |
| `num_history_runs=N` | 按 run 数限制历史 |
| `num_history_messages=N` | 按消息数限制历史 |
| `session_state={...}` | 随 session 存储应用状态 |

Workflow session 另行追踪管线输入、输出与状态。

### 2.3 Team（多 Agent 协调）

```python
from agno.team import Team, TeamMode

team = Team(
    members=[
        Agent(name="English Agent", role="You answer in English"),
        Agent(name="Chinese Agent", role="You answer in Chinese"),
        Team(name="Germanic Team", members=[...]),  # 嵌套 Team
    ],
    mode=TeamMode.coordinate,
)
```

**四种 TeamMode**：

| 模式 | 行为 | 典型场景 |
|---|---|---|
| **coordinate**（默认） | leader 分解任务、委派成员、综合结果 | 通用协作 |
| **route** | 路由到单一专家并直接返回其响应 | 分诊/转接 |
| **broadcast** | 同一任务委派给所有成员并综合 | 多视角分析 |
| **tasks** | 运行任务列表循环直至目标完成 | 复杂多步目标 |

**Callable Factories**：`tools`/`knowledge`/`members` 可传函数，在 run setup 时解析；注入 `agent`/`team`/`run_context`/`session_state`；按 custom key > user_id > session_id 缓存。

**注意**：leader 与成员各自发起模型调用，增加延迟、token 与协调状态。

### 2.4 Workflow

```python
content_workflow = Workflow(
    name="Content Creation",
    steps=[researcher, writer],  # Agent/Team/Function/嵌套 Workflow 自动包装
)
```

| Step 执行器 | 说明 |
|---|---|
| Agent | 带工具与指令的 AI 执行器 |
| Team | 协作组 |
| Function | 自定义 Python 函数，通过 StepInput 访问所有先前输出 |
| Workflow | 嵌套子管线 |

**容器**：`Steps`、`Parallel`、`Loop`、`Condition`、`Router`。

**输入传递**：Function step 可访问全部先前输出；Agent/Team/嵌套 Workflow step 接收最近一次输出。

### 2.5 工具与人类审批

- **Toolkit 模式**：预构建工具包 + 自定义函数
- **Human approval**：运行可暂停等待用户确认；需管理员审批的工具可阻塞
- **MCP Server**：AgentOS 自身可作为 MCP server 暴露

### 2.6 生产模式

| 能力 | 实现 |
|---|---|
| **生产 API** | 50+ 端点，SSE + WebSocket |
| **安全** | JWT RBAC、多用户/多租户隔离开箱即用 |
| **观测** | OpenTelemetry tracing、run history、审计日志 |
| **调度** | cron 调度 + 后台任务，无外部基础设施 |
| **接口** | Slack、Telegram、WhatsApp、Discord、AG-UI、A2A |
| **存储** | 自有数据库存 session、memory、knowledge、traces |
| **部署** | 任何能跑容器的云 |
| **学习闭环** | simulations + usage data 反馈优化 |

### 2.7 恢复语义

Agno 的恢复主要依赖 **session 持久化**：
- 会话中断后以相同 `session_id` 重新 run，历史可注入
- Human approval 暂停 = 可恢复的运行暂停点
- 无 MetaGPT 式「消息级删除重触发」或 DeerFlow 式「租约 takeover」的细粒度恢复
- 长时任务依赖 Workflow step 设计而非框架级 checkpoint

---

## 3. 对 openmate 的借鉴

| 维度 | 借鉴点 |
|---|---|
| 三层分层 | SDK（构建）/ Runtime（服务）/ UI（管理）职责清晰，避免库与平台混杂 |
| TeamMode | coordinate/route/broadcast/tasks 四模式覆盖主流协调语义，比单一 handoff 更丰富 |
| Session 三 ID | run/session/user 分离 + 持久化与上下文注入分离，多租户友好 |
| Callable Factories | 按上下文动态生成 tools/members，缓存可配 |
| 平台能力 | JWT RBAC、OTel、cron、IM 接入是「库 → 平台」的最小完整集 |
| 局限 | 恢复粒度较粗；复杂 DAG/循环不如 LangGraph/DeerFlow 灵活 |

---

## 4. 版本与生态快照（截至 2026-09）

- 主线持续迭代，文档站提供 MCP server（docs.agno.com/mcp）与 llms-full.txt
- AgentOS starter 模板覆盖 Railway/Docker/AWS/GCP/Azure/Fly/Render/Modal/Helm
- 遥测：每 run 一个事件，不含 prompt/输出；`AGNO_TELEMETRY=false` 可关
- 社区：X @AgnoAgi、Newsletter、Discord/GitHub Discussions
