# 51. Marvin 架构深度分析

> **项目**：[prefecthq/marvin](https://github.com/prefecthq/marvin)
> **定位**：Ambient Intelligence Library — Python AI Agent 框架
> **版本**：3.x（合并了 ControlFlow 引擎）
> **License**：Apache-2.0
> **Stars**：6.1k+

---

## 一、项目概览与设计哲学

Marvin 是 Prefect 团队开发的 Python AI Agent 框架，定位为"环境智能库"（Ambient Intelligence Library）。其核心设计哲学是：**将复杂 AI 工作流分解为离散的、可观测的任务（Task），由专业化 Agent 执行，通过 Thread 管理对话上下文**。

Marvin 3.0 是一个重大版本，将 Marvin 2.0 的开发者体验（DX）与 ControlFlow 的强大 Agent 引擎合并。它不再是一个独立的 Agent 框架，而是构建在 **Pydantic AI** 之上的高层抽象层，提供类型安全的结构化输出和多 Agent 编排能力。

关键特性：
- 🧩 以 Task 为中心的架构
- 🤖 专业化 Agent 配置
- 🔒 类型安全的结果验证（基于 Pydantic）
- 🎛️ 灵活的控制与自治平衡
- 🕹️ 多 Agent 协作（Team/Swarm）
- 🧵 Thread 管理对话历史
- 🔗 与 Prefect 工作流引擎集成

---

## 二、核心抽象层：四大支柱

### 2.1 Task — 任务单元

Task 是 Marvin 的核心工作单元，采用 `@dataclass` 实现：

```python
@dataclass(kw_only=True, init=False)
class Task(Generic[T]):
    instructions: str                    # 任务指令
    result_type: ResultType[T]           # 期望的结果类型
    actor: Actor | None                  # 执行者
    tools: list[Callable]                # 可用工具
    memories: list[Memory]               # 可用记忆
    state: TaskState                     # 状态机
    depends_on: set[Task]                # 依赖关系
    subtasks: set[Task]                  # 子任务
    result_validator: Callable | None    # 结果验证器
```

Task 的状态机：`PENDING → RUNNING → SUCCESSFUL / FAILED / SKIPPED`

Task 的关键设计：
- **类型安全**：`result_type` 支持 Pydantic TypeAdapter 进行运行时验证
- **分类快捷方式**：`result_type=["red", "blue"]` 自动转换为 `Labels` 类型
- **依赖管理**：通过 `depends_on` 和 `subtasks` 建立任务 DAG
- **Context 管理**：支持 `with task:` 语法设置当前任务上下文
- **EndTurn 机制**：每个 Task 生成 `MarkTaskSuccessful`、`MarkTaskFailed`、`MarkTaskSkipped` 工具，Agent 通过调用这些工具来结束任务

### 2.2 Agent — 智能执行者

Agent 继承自 Actor 抽象基类，是 LLM 配置的封装：

```python
@dataclass(kw_only=True)
class Agent(Actor):
    name: str                            # 随机名称
    model: KnownModelName | Model | None # LLM 模型
    model_settings: ModelSettings        # 模型参数
    tools: list[Callable]                # 工具列表
    memories: list[Memory]               # 记忆模块
    mcp_servers: list[Any]               # MCP 服务器
    prompt: str | Path                   # 提示模板
```

Agent 的核心方法是 `get_agentlet()`，它创建一个 Pydantic AI Agent 实例：
- 将 Marvin 工具转换为 Pydantic AI 工具
- 将 EndTurn 工具包装为 `ToolOutput`
- 支持单个或多个 EndTurn 工具（Union 类型）

### 2.3 Thread — 对话上下文

Thread 管理对话历史，使用 SQLite 持久化：

```python
@dataclass
class Thread:
    id: str                              # UUID
    parent_id: str | None                # 父线程
```

Thread 的关键能力：
- **消息管理**：`add_user_message`、`add_agent_message`、`add_system_message`、`add_info_message`
- **LLM 调用追踪**：记录每次 LLM 调用的 usage 和消息
- **上下文管理**：`with thread:` 语法设置当前线程
- **SQLite 持久化**：通过 SQLAlchemy + aiosqlite 存储消息历史

### 2.4 Orchestrator — 编排引擎

Orchestrator 是 Marvin 的核心运行时，负责任务编排和 Agent 执行：

```python
@dataclass(kw_only=True)
class Orchestrator:
    tasks: list[Task]
    thread: Thread
    handlers: list[Handler | AsyncHandler]
```

编排循环：
1. 获取所有就绪任务（`get_all_tasks(_filter="ready")`）
2. 确定当前 Actor
3. 收集工具、EndTurn 工具、记忆
4. 构建系统提示和消息历史
5. 创建 Pydantic AI Agentlet
6. 执行 Agent 迭代（`agentlet.iter()`）
7. 处理事件流
8. 保存消息到 Thread
9. 处理 EndTurn 结果
10. 循环直到所有任务完成或达到最大轮次

---

## 三、EndTurn 机制 — 任务完成的优雅设计

EndTurn 是 Marvin 最精妙的设计之一，它将任务完成抽象为工具调用：

```python
class EndTurn:
    async def run(self, thread: Thread, actor: Actor) -> None: ...

class MarkTaskSuccessful(MarkTask): ...
class MarkTaskFailed(MarkTask): ...
class MarkTaskSkipped(MarkTask): ...
class PlanSubtasks(EndTurn): ...
class DelegateToActor(EndTurn): ...
```

每个 Task 动态生成 EndTurn 工具类（通过 `create_mark_task_successful` 等工厂函数），这些工具：
- 包含任务的 `result_type` 作为参数类型
- 调用时自动验证结果
- 触发状态转换

---

## 四、高层函数 API — 开发者友好接口

Marvin 提供了一系列高层函数，底层全部基于 Task + Agent 实现：

| 函数 | 功能 | 实现方式 |
|------|------|----------|
| `marvin.run()` | 执行任意任务 | 创建 Task → run_tasks_async |
| `marvin.classify()` | 分类数据 | Task + Labels 类型 |
| `marvin.extract()` | 提取结构化数据 | Task + result_type |
| `marvin.cast()` | 类型转换 | Task + TypeAdapter |
| `marvin.generate()` | 生成数据 | Task + conlist 约束 |
| `marvin.summarize()` | 文本摘要 | Task |
| `marvin.plan()` | 任务规划 | Task + PlanSubtasks |
| `marvin.say()` | 对话式响应 | Task |
| `marvin.fn()` | 装饰器函数 | Task 包装 |

这些函数都遵循统一模式：
1. 构建 prompt
2. 创建 Task（带 result_type）
3. 调用 `task.run_async()`
4. 返回验证后的结果

---

## 五、多 Agent 协作模式

### 5.1 Team

Team 是多 Agent 容器，管理 Agent 间的协作：

```python
@dataclass(kw_only=True)
class Team(Actor):
    members: list[Actor]
    active_member: Actor
    delegates: dict[Actor, list[Actor]]
```

Team 通过 `DelegateToActor` EndTurn 工具实现 Agent 间的委派。当前 Agent 可以选择将任务委派给其他 Agent。

### 5.2 Swarm

Swarm 是 Team 的特化，允许所有 Agent 互相委派：

```python
class Swarm(Team):
    def __post_init__(self):
        self.delegates = {
            member: [m for m in self.members if m is not member]
            for member in self.members
        }
```

### 5.3 其他 Team 模式

- **RoundRobinTeam**：轮询切换活跃 Agent
- **RandomTeam**：随机选择活跃 Agent

注意：Team 功能目前已被标记为 deprecated（2025年9月后移除），建议使用独立 Agent + 显式协调。

---

## 六、记忆系统

Memory 模块提供向量数据库集成：

```python
@dataclass(kw_only=True)
class Memory:
    key: str                             # 唯一标识
    instructions: str | None             # 使用说明
    provider: MemoryProvider             # 向量数据库提供者
    auto_use: bool                       # 自动查询
```

支持的提供者：
- **Chroma**：ephemeral / persistent / cloud
- **LanceDB**
- **Postgres**（pgvector）
- **Qdrant**

Memory 自动生成三个工具供 Agent 使用：
- `add_memory__{key}`：添加记忆
- `delete_memory__{key}`：删除记忆
- `search_memories__{key}`：搜索记忆

---

## 七、事件系统与 Handler

Marvin 使用事件驱动架构，通过 Handler 处理各种事件：

```python
class Event: ...
class OrchestratorStartEvent(Event): ...
class OrchestratorEndEvent(Event): ...
class OrchestratorErrorEvent(Event): ...
class ActorStartTurnEvent(Event): ...
class ActorEndTurnEvent(Event): ...
```

内置 Handler：
- **PrintHandler**：默认的控制台输出
- **QueueHandler**：用于流式处理的队列

用户可以自定义 Handler 来实现日志、监控、UI 更新等功能。

---

## 八、模板系统

Marvin 使用 Jinja2 模板系统生成提示：

- `task.jinja`：任务提示模板
- `agent.jinja`：Agent 提示模板
- `team.jinja`：Team 提示模板
- `system.jinja`：系统提示模板
- `memory.jinja`：记忆提示模板

Template 基类支持从文件路径或字符串加载，渲染时传入对应的上下文变量。

---

## 九、技术栈与依赖

| 组件 | 技术选型 |
|------|----------|
| LLM 调用 | Pydantic AI（支持 OpenAI、Anthropic 等） |
| 类型验证 | Pydantic + TypeAdapter |
| 数据库 | SQLite + SQLAlchemy + aiosqlite |
| 数据库迁移 | Alembic |
| 模板引擎 | Jinja2 |
| CLI | Typer |
| 输出美化 | Rich |
| MCP 集成 | FastMCP |
| 可选集成 | Prefect（工作流引擎）、ChromaDB、Qdrant |

核心依赖链：`marvin → pydantic-ai → pydantic → OpenAI/Anthropic API`

---

## 十、架构评价与启示

### 10.1 优势

1. **Task-Centric 设计**：将 AI 工作流分解为离散任务，每个任务有明确的目标、类型约束和状态管理，这是比传统 Chain/Graph 更自然的抽象。

2. **EndTurn 机制的优雅**：通过将任务完成抽象为工具调用，Agent 可以自然地"选择"如何结束一个任务（成功/失败/跳过/规划子任务），这是对 ReAct 模式的精妙扩展。

3. **类型安全的结果验证**：利用 Pydantic TypeAdapter 在运行时验证 LLM 输出，确保结果符合预期类型，这是生产环境的关键需求。

4. **渐进式复杂度**：从 `marvin.run("简单任务")` 开始，逐步增加 Agent、Tools、Thread、Memory，API 复杂度与需求成正比。

5. **Pydantic AI 作为底层**：不重复造轮子，利用 Pydantic AI 的模型抽象、工具系统和 MCP 支持，专注于高层编排逻辑。

### 10.2 局限

1. **Team 功能不成熟**：已被标记为 deprecated，多 Agent 协作仍需更成熟的方案。

2. **数据库依赖**：SQLite 持久化增加了部署复杂度，对于简单场景可能过重。

3. **单 Actor 限制**：Orchestrator 的主循环目前主要处理单 Actor 场景，多 Actor 编排需要通过 Team 间接实现。

4. **模板系统耦合**：Jinja2 模板与核心逻辑耦合较深，自定义提示需要了解模板结构。

### 10.3 对 OpenMate 的启示

1. **Task 作为一等公民**：OpenMate 可以借鉴 Task 的设计，将用户请求分解为带类型约束的任务单元。

2. **EndTurn 模式**：将 Agent 的"完成信号"抽象为工具调用，比硬编码的停止条件更灵活。

3. **渐进式 API**：`marvin.run()` → `Task` → `Orchestrator` 的三层 API 设计值得学习。

4. **记忆系统架构**：Memory + Provider 的抽象模式可以复用到 OpenMate 的知识管理中。

---

## 附录：核心源码结构

```
src/marvin/
├── __init__.py          # 公共 API 导出
├── agents/
│   ├── actor.py         # Actor 抽象基类
│   ├── agent.py         # Agent 实现
│   ├── team.py          # Team/Swarm 实现
│   └── names.py         # 随机名称库
├── tasks/
│   └── task.py          # Task 核心实现
├── engine/
│   ├── orchestrator.py  # 编排引擎
│   ├── end_turn.py      # EndTurn 机制
│   ├── events.py        # 事件定义
│   ├── llm.py           # LLM 消息工具
│   └── streaming.py     # 流式处理
├── fns/
│   ├── run.py           # run/run_async
│   ├── classify.py      # classify
│   ├── extract.py       # extract
│   ├── cast.py          # cast
│   ├── generate.py      # generate
│   ├── summarize.py     # summarize
│   ├── plan.py          # plan
│   ├── say.py           # say
│   └── fn.py            # fn 装饰器
├── memory/
│   ├── memory.py        # Memory 抽象
│   └── providers/       # 向量数据库提供者
├── handlers/            # 事件处理器
├── templates/           # Jinja2 模板
├── utilities/           # 工具函数
├── database.py          # SQLite 持久化
├── settings.py          # 配置管理
├── prompts.py           # 模板引擎
├── thread.py            # Thread 实现
└── cli/                 # Typer CLI
```

---

*分析基于 Marvin main 分支源码（2025年9月），基于 Pydantic AI 构建的 Task-Centric Agent 框架。*
