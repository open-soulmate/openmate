# Agno (原 Phidata) 架构深度分析

> **项目**: [agno-agi/agno](https://github.com/agno-agi/agno)
> **Stars**: 39.8k+ | **Forks**: 6k+ | **License**: Apache-2.0
> **创建时间**: 2023 (原 Phidata) → 2025-01-31 更名为 Agno | **Python**: 3.10+
> **定位**: 生产级 Agent 平台框架与运行时——Build, Run, and Manage Agent Platforms

---

## 目录

1. [三层架构：Framework / AgentOS / Control Plane](#1-三层架构framework--agentos--control-plane)
2. [核心执行原语：Agent / Team / Workflow](#2-核心执行原语agent--team--workflow)
3. [无状态实体模型（V2 架构革新）](#3-无状态实体模型v2-架构革新)
4. [模型抽象层：40+ Provider 统一接口](#4-模型抽象层40-provider-统一接口)
5. [工具系统与 100+ 集成](#5-工具系统与-100-集成)
6. [知识系统：Agentic RAG 架构](#6-知识系统agentic-rag-架构)
7. [会话、记忆与学习子系统](#7-会话记忆与学习子系统)
8. [AgentOS 运行时：生产级 API 服务](#8-agentos-运行时生产级-api-服务)
9. [事件流与可观测性](#9-事件流与可观测性)
10. [架构哲学与设计模式总结](#10-架构哲学与设计模式总结)

---

## 1. 三层架构：Framework / AgentOS / Control Plane

Agno 最显著的架构特征是**三层分离**，将开发、运行、管理三个关注点彻底解耦：

| 层级 | 组件 | 职责 |
|------|------|------|
| **Layer 1** | SDK (Framework) | 提供 Agent、Team、Workflow 三大原语，开发者编写逻辑 |
| **Layer 2** | AgentOS (Runtime) | 将 Agent 注册为 FastAPI 服务，提供 REST API + SSE + WebSocket |
| **Layer 3** | Control Plane (UI) | Web 管理界面，监控、审计、调试、评估 |

这种设计的核心理念是**"Own your agent stack"**——所有数据（会话、记忆、知识、Trace）都存储在用户自己的基础设施中（SQLite/Postgres），而非框架托管。

```text
┌──────────────────────────────────────────────────┐
│           Control Plane (AgentOS UI)             │
│   监控 · 审计 · 调试 · 评估 · 模拟测试         │
├──────────────────────────────────────────────────┤
│           AgentOS Runtime (FastAPI)              │
│   REST API (50+ endpoints) · SSE · WebSocket     │
│   JWT RBAC · Scheduling · Background Jobs        │
├──────────────────────────────────────────────────┤
│              SDK (Framework Layer)               │
│   Agent · Team · Workflow · Model · Tools        │
│   Knowledge · Memory · Sessions · Guardrails     │
└──────────────────────────────────────────────────┘
```

与 LangChain 需要自行组装生产层不同，Agno 的 AgentOS 直接提供了开箱即用的生产运行时，这是其最大的差异化优势。

---

## 2. 核心执行原语：Agent / Team / Workflow

Agno 提供三种可组合的执行原语，形成层级化的编排体系：

### Agent（原子单元）

Agent 是最基本的执行单元，将一个 LLM 与工具、记忆、知识封装在一起：

```python
from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.duckduckgo import DuckDuckGoTools

agent = Agent(
    name="Research Agent",
    model=OpenAIChat(id="gpt-4o"),
    tools=[DuckDuckGoTools()],
    instructions="Always include sources",
    markdown=True,
)
agent.run("What's happening in AI this week?")
```

Agent 的关键属性包括：`model`（主模型）、`fallback_models`（故障回退）、`tools`（工具列表）、`knowledge`（知识库）、`memory_manager`（长期记忆）、`checkpoint`（状态持久化策略）、`session_state`（会话状态字典）。

### Team（多智能体协作）

Team 协调多个 Agent 或子 Team 协同工作，支持四种执行模式：

| 模式 | 行为 |
|------|------|
| `coordinate` | Team Leader 分析任务后委托给合适的成员，综合结果 |
| `route` | Team Leader 根据查询类型路由到单一最合适的成员 |
| `broadcast` | 将同一任务广播给所有成员，并行执行后汇总 |
| `tasks` | 基于任务列表的动态分配 |

```python
from agno.team.team import Team

team = Team(
    name="Research Team",
    mode="coordinate",
    model=Claude(id="claude-sonnet-4-20250514"),
    members=[web_agent, news_agent],
    share_member_interactions=True,
    add_team_history_to_members=True,
)
```

Team 还支持 `enable_agentic_context`（让 Leader 自主搜索上下文）和 `success_criteria`（成功标准判断）。

### Workflow（确定性编排）

Workflow 是纯 Python 编写的确定性编排程序，支持六种步骤类型：

- **Step**：单一工作单元（Agent、Team 或 Callable）
- **Steps**：顺序步骤列表
- **Parallel**：并行执行的独立步骤
- **Loop**：迭代执行
- **Condition**：条件分支
- **Router**：动态步骤选择

```python
class CacheWorkflow(Workflow):
    agent = Agent(model=OpenAIChat(id="gpt-4o-mini"))

    def run(self, message: str) -> Iterator[RunResponse]:
        if self.session_state.get(message):
            yield RunResponse(content=self.session_state.get(message))
            return
        yield from self.agent.run(message, stream=True)
        self.session_state[message] = self.agent.run_response.content
```

Agno 的设计哲学是："没有框架或步骤式方法能给你纯 Python 的灵活性和可靠性"——用 `while/for` 做循环，用 `if/else` 做条件，用 `try/except` 做异常处理。

---

## 3. 无状态实体模型（V2 架构革新）

Agno V2 引入了**无状态实体模型**，这是与 V1 最根本的架构变化：

| 维度 | V1（已废弃） | V2（当前） |
|------|-------------|-----------|
| 状态位置 | Agent 实例属性 | 数据库表 |
| `session_state` | 实例上的可变对象 | 已移除（通过数据库访问） |
| `run_response` | 实例上的最后响应对象 | 已移除（从返回值捕获） |
| 多次运行 | 状态在实例上累积 | 每次运行独立 |
| 存储参数 | `storage` + `memory`（分开） | `db`（统一） |
| 会话持久化 | 可选 | 始终通过 `db` |

核心执行模式变为 **Load-Execute-Save**：
1. 从数据库加载状态
2. 执行 Agent 逻辑
3. 将结果写回数据库

这意味着 Agent 实例本身不持有运行时状态，可以水平扩展——多个实例可以服务同一组会话，无需共享内存或粘性会话。

V1 到 V2 的迁移涉及类名变更：`PgStorage` → `PostgresDb`，`SqlStorage` → `SqliteDb`，`MongoDbStorage` → `MongoDb` 等。存储和记忆从分离的参数统一为单一的 `db` 参数。

---

## 4. 模型抽象层：40+ Provider 统一接口

Agno 通过 `Model` 基类（`libs/agno/agno/models/base.py`）提供统一的多态接口：

```python
class Model(ABC):
    """所有 LLM Provider 的基类"""

    def invoke(self, ...) -> ModelResponse: ...      # 同步调用
    async def ainvoke(self, ...) -> ModelResponse: ...  # 异步调用
    def invoke_stream(self, ...) -> Iterator[ModelResponse]: ...  # 同步流式
    async def ainvoke_stream(self, ...) -> AsyncIterator[ModelResponse]: ...  # 异步流式
```

**支持的 Provider 包括**：

| 类别 | Provider |
|------|---------|
| 主流商业 | OpenAI、Anthropic Claude、Google Gemini、AWS Bedrock、Azure AI Foundry |
| 开源推理 | Groq、DeepSeek、Together、Fireworks、Mistral |
| 本地部署 | Ollama、LM Studio、llama.cpp |
| 其他 | Cohere、IBM WatsonX、HuggingFace |

使用时可以简单地传字符串或完整模型类：

```python
# 简洁方式
agent = Agent(model="openai:gpt-4o")

# 完整配置
agent = Agent(model=OpenAIChat(id="gpt-4o", temperature=0.7))
```

**弹性机制**：支持两层容错——`retries`（单模型重试，支持指数退避）和 `fallback_models`（主模型失败后自动切换到备选模型列表）。

---

## 5. 工具系统与 100+ 集成

Agno 的工具系统分为三个层次：

### 基础函数工具

任何 Python 函数都可以通过类型注解自动转为工具：

```python
def get_weather(city: str, unit: str = "celsius") -> str:
    """Get weather for a city."""
    return f"25°{unit[0].upper()} in {city}"

agent = Agent(tools=[get_weather])
```

### Toolkit（工具包）

预构建的 100+ 工具集成，覆盖 GitHub、Slack、Postgres、DuckDuckGo、Exa 等：

```python
from agno.tools.github import GitHubTools
from agno.tools.slack import SlackTools
```

### MCP 集成（MCPTools）

Agno 原生支持 Model Context Protocol，既是 MCP 消费者也是 MCP 服务器：

```python
from agno.tools.mcp import MCPTools

agent = Agent(
    tools=[MCPTools(command="npx -y @modelcontextprotocol/server-filesystem /tmp")]
)
```

MCPTools 支持 `requires_confirmation_tools`，特定 MCP 工具需要人工审批后才能执行。

### Callable Factories（动态工具）

工具可以根据运行时上下文动态生成：

```python
def get_tools(run_context: RunContext):
    if run_context.session_state.get("type") == "finance":
        return [YFinanceTools()]
    return []
```

---

## 6. 知识系统：Agentic RAG 架构

Agno 的知识系统实现了**Agentic RAG**模式——Agent 在运行时自主决定何时搜索知识库：

### 架构组成

```text
用户文档 → Reader（解析） → Chunker（分块） → Embedder（向量化） → Vector DB（存储）
                                                                        ↓
Agent ← search_knowledge_base() ← 相似度检索 ← 查询向量 ← 用户问题
```

### 双数据库设计

- **Contents DB**：存储文档元数据（名称、描述、类型、状态、访问计数）
- **Vector DB**：存储嵌入向量，支持 PgVector、LanceDB 等 20+ 向量数据库

### 两种检索模式

| 模式 | 配置 | 行为 |
|------|------|------|
| Agentic RAG | `search_knowledge=True`（默认） | Agent 自主调用 `search_knowledge_base()` 工具 |
| 传统 RAG | `add_knowledge_to_context=True` | 系统自动将相关引用注入上下文 |

还支持自定义 `knowledge_retriever` 函数实现完全控制。

---

## 7. 会话、记忆与学习子系统

Agno 提供三层持久化能力：

### Sessions（会话）

`AgentSession`、`TeamSession`、`WorkflowSession` 存储在 `BaseDb` 中，按 `session_id` + `user_id` 作用域隔离。支持 `num_history_runs` 控制注入到上下文中的历史消息数量。

### Memory（记忆）

`MemoryManager`（`libs/agno/agno/memory/manager.py`）管理用户级长期记忆：

- `enable_agentic_memory=True`：Agent 可以自主保存和检索用户偏好
- 记忆以结构化方式存储，支持跨会话持久化

### Learning（学习）

`LearningMachine` 使 Agent 能够从交互中持续学习：

- 从反馈和结果中提取模式
- 自动更新 Agent 行为
- 支持评估（evals）和模拟测试

此外还有 **Compression**（压缩长会话以适配上下文窗口）和 **Context Providers**（从 Calendar、Gmail、Drive、GitHub、Slack、MCP 注入实时数据）。

---

## 8. AgentOS 运行时：生产级 API 服务

AgentOS 是 Agno 的生产运行时层，将 Agent/Team/Workflow 注册为 FastAPI 应用：

```python
from agno.os import AgentOS
from agno.db.postgres import PostgresDb

agent_os = AgentOS(
    agents=[agent],
    db=PostgresDb(db_url="postgresql://..."),
)
app = agent_os.get_app()
```

### 核心能力

| 能力 | 说明 |
|------|------|
| **REST API** | 50+ 端点，支持 SSE 和 WebSocket |
| **安全** | JWT-based RBAC，多用户多租户隔离 |
| **调度** | 内置 Cron 调度和后台任务 |
| **人工审批** | `human-approval` 机制——暂停运行等待用户确认，阻塞需要管理员批准的工具 |
| **接口** | 通过 Slack、Telegram、WhatsApp、Discord、AG-UI、A2A 暴露 Agent |
| **MCP 服务器** | Agent 自动暴露为 MCP 服务器 |
| **部署** | Docker、Railway、AWS、GCP、Azure、Fly、Render、Helm |

### 无状态可扩展设计

FastAPI 运行时不持有任何状态。长时间运行的 Agent（如等待审批）不会阻塞线程——它们将状态检查点写入数据库，审批通过后恢复执行。这使得可以在负载均衡器后水平扩展 Pod。

---

## 9. 事件流与可观测性

Agno 通过 `RunEvent` 和 `TeamRunEvent` 枚举提供细粒度事件流：

| 事件 | 含义 |
|------|------|
| `RunStarted` | 执行生命周期开始 |
| `RunContent` | 内容增量块（流式文本） |
| `ToolCallStarted / Completed` | 函数调用生命周期 |
| `ModelRequestStarted / Completed` | 与 LLM Provider 的直接交互 |
| `ReasoningStarted / Completed` | 推理步骤（o1/DeepSeek 等） |

**可观测性栈**：
- OpenTelemetry 原生集成
- 运行历史和审计日志
- 通过 AgentOS UI 提供 Trace 可视化
- 支持 `tracing=True` 将执行日志管道到可观测性栈

**消息模型**（`Message` 类）支持多模态内容：文本、图片、视频、音频、文件，角色包括 `system`、`user`、`assistant`、`tool`。

---

## 10. 架构哲学与设计模式总结

### 核心设计哲学

1. **性能优先**：Agent 创建约 3.2 微秒，内存占用约 5.2 KiB（tracemalloc 测量），比 LangGraph 快约 10,000 倍、内存低约 50 倍
2. **无状态实体**：V2 的 Load-Execute-Save 模式使所有实体天然可水平扩展
3. **纯 Python 编排**：Workflow 不使用 DSL 或 YAML，直接用 Python 控制流——"没有框架能给你纯 Python 的灵活性"
4. **三层分离**：开发（SDK）/ 运行（AgentOS）/ 管理（Control Plane）彻底解耦
5. **数据主权**：所有数据存储在用户自己的基础设施中

### 与其他框架的定位差异

| 维度 | Agno | LangChain | CrewAI | OpenAI Agents |
|------|------|-----------|--------|--------------|
| 生产运行时 | ✅ 内置 AgentOS | ❌ 需自建 | ❌ 需自建 | ❌ 需自建 |
| 无状态设计 | ✅ V2 原生 | ❌ | ❌ | 部分 |
| 多 Agent 协作 | ✅ Team（4 模式） | LangGraph | ✅ Crew | ✅ Handoff |
| 工作流编排 | ✅ Workflow（6 步骤） | LangGraph | ❌ | ❌ |
| MCP | ✅ 双向 | ✅ | ✅ | ✅ |
| 性能 | 极高 | 中等 | 中等 | 高 |

### 适用场景

Agno 最适合需要**从原型快速过渡到生产**的团队——它解决了"Agent 能在 Notebook 里跑，但无法上线"的核心痛点。三层架构意味着开发者用 SDK 写逻辑，用 AgentOS 部署为 API，用 Control Plane 监控，全程不离开 Agno 生态。

### 潜在局限

- AgentOS UI 完整体验依赖 `os.agno.com` 托管服务
- V1 到 V2 迁移有较大的 breaking changes
- 模型切换时跨 Provider 的消息格式兼容性仍需注意
- 相比 LangChain 的生态规模，第三方集成的广度仍有差距

---

> **参考来源**: GitHub agno-agi/agno, docs.agno.com, DeepWiki 架构分析, ChatForest 评测
> **分析时间**: 2026-09
