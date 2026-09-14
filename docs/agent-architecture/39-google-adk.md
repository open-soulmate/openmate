# 39. Google ADK (Agent Development Kit) Python 架构深度分析

> **项目**: [google/adk-python](https://github.com/google/adk-python)
> **版本**: ADK 2.0 (2026)
> **许可证**: Apache 2.0
> **语言**: Python 3.10+

## 一、项目概述与设计哲学

Google Agent Development Kit (ADK) 是 Google 开源的、代码优先 (code-first) 的 AI Agent 开发框架，旨在将软件工程原则系统性地引入 AI Agent 构建流程。ADK 2.0 是一次重大架构升级，引入了图执行引擎 (Workflow Runtime)、Task API、Agent Config 等全新概念，从一个"Agent 脚手架"演进为一个完整的 Agent 操作系统。

ADK 的核心设计哲学是 **"软件工程原则应用于 Agent"**：模块化、可测试、可版本化、可部署。它不是简单的 LLM 包装器，而是一个涵盖 Agent 定义、工具管理、会话状态、记忆系统、制品存储、工作流编排、评估和部署的全栈框架。

## 二、整体架构拓扑

ADK 源码位于 `src/google/adk/`，包含 30 个子模块，架构层次清晰：

```
┌──────────────────────────────────────────────────┐
│              CLI / Web UI / API Layer              │
│         (cli/ + apps/ + runners.py)               │
├──────────────────────────────────────────────────┤
│              Workflow Runtime (graph engine)       │
│         (workflow/ — BaseNode, Workflow, Edge)     │
├──────────────────────────────────────────────────┤
│              Agent Layer                           │
│   (agents/ — BaseAgent → LlmAgent → Agent)        │
├────────────┬────────────┬────────────────────────┤
│  Flow Eng. │   Tools    │   Task API (delegation) │
│ (flows/)   │ (tools/)   │   (agents/ mode)        │
├────────────┴────────────┴────────────────────────┤
│           Model Abstraction Layer                  │
│         (models/ — BaseLlm, LLMRegistry)           │
├──────────────────────────────────────────────────┤
│     State / Memory / Artifacts / Auth / Events     │
│  (sessions/ memory/ artifacts/ auth/ events/)      │
├──────────────────────────────────────────────────┤
│     Plugins / Telemetry / Evaluation / A2A         │
│  (plugins/ telemetry/ evaluation/ a2a/)            │
└──────────────────────────────────────────────────┘
```

## 三、十大维度深度分析

### 维度 1：Agent 类型体系 — 三层继承模型

ADK 的 Agent 体系采用三层继承设计：

1. **`BaseNode`** (workflow 层): 最底层抽象，是图执行引擎中所有节点的基类。Agent 作为 Workflow 的节点参与图执行。
2. **`BaseAgent`** (agents/base_agent.py): Agent 基类，继承自 `BaseNode`，定义了所有 Agent 共有的属性和行为：
   - `name` / `description`: Agent 标识与能力描述
   - `sub_agents`: 子 Agent 列表（树形层级结构）
   - `parent_agent`: 父 Agent 引用（在 `model_post_init` 中自动设置）
   - `before_agent_callback` / `after_agent_callback`: Agent 级生命周期回调
   - `run_async()` / `run_live()`: 文本/实时两种执行入口
   - `clone()`: 深拷贝 Agent 树
3. **`LlmAgent`** (agents/llm_agent.py): LLM 驱动的 Agent，继承自 `BaseAgent`，是实际业务中最常用的类：
   - `model`: LLM 模型名（默认 `gemini-3.5-flash`）
   - `instruction` / `static_instruction` / `global_instruction`: 三级指令体系
   - `tools`: 工具列表（`ToolUnion` = `Callable | BaseTool | BaseToolset`）
   - 6 种回调钩子: `before_model_callback`, `after_model_callback`, `on_model_error_callback`, `before_tool_callback`, `after_tool_callback`, `on_tool_error_callback`
   - `mode`: 委托模式（`chat` | `task` | `single_turn`）

**关键设计决策**：Agent 同时是一个 Workflow 节点 (BaseNode)，这意味着 Agent 可以无缝嵌入图执行流，而不需要额外的适配器。

### 维度 2：工具系统 — 多态统一接口

ADK 的工具系统是其最灵活的模块之一。核心抽象是 `BaseTool`（tools/base_tool.py），定义了：

- `_get_declaration()`: 返回 `FunctionDeclaration`（OpenAPI 规范），用于告诉 LLM 工具的签名
- `run_async()`: 异步执行工具逻辑
- `process_llm_request()`: 将工具声明注入 LLM 请求
- `check_require_confirmation()`: HITL 工具确认机制

**ToolUnion 统一类型**：`Union[Callable, BaseTool, BaseToolset]`。在 `LlmAgent` 中，工具可以是：
- **普通函数**: 自动包装为 `FunctionTool`
- **BaseTool 实例**: 直接使用
- **BaseToolset**: 动态工具集，运行时解析（如 `MCPToolset`, `APIHubToolset`）
- **BaseNode (非 Agent)**: 自动包装为 `NodeTool`

内置工具极其丰富：`google_search`, `vertex_ai_search`, `load_artifacts`, `load_memory`, `transfer_to_agent`, `exit_loop`, `request_input`, `url_context`, `google_maps_grounding` 等。

**MCP 集成**: `MCPToolset` / `RemoteMcpServer` 支持 Model Context Protocol，可连接外部 MCP 服务器。

### 维度 3：Flow 执行引擎 — LLM 调用编排

`flows/` 目录是 ADK 的执行引擎核心。`BaseLlmFlow` 是 LLM 调用流程的基类，管理整个"LLM 调用 → 工具执行 → 结果返回"的循环。

两种 Flow 变体：
- **`SingleFlow`**: 纯单 Agent 执行，不允许转移控制权给其他 Agent
- **`AutoFlow`**: 支持 Agent 间转移（`transfer_to_agent`），自动管理子 Agent 恢复

Flow 引擎的关键能力：
- **回调管道**: `before_model_callback` → LLM 调用 → `after_model_callback` → 工具执行循环
- **动态指令路由**: `DYNAMIC_INSTRUCTION_ROUTING` 特性标志控制指令是作为 `system_instruction` 还是 `user content` 发送
- **输出 Schema 处理**: `_output_schema_processor` 将 LLM 输出转换为结构化 JSON
- **Live 模式**: 支持实时音频/视频流式交互
- **重连机制**: 最多 5 次重连尝试 (`DEFAULT_MAX_RECONNECT_ATTEMPTS`)
- **错误恢复**: `on_model_error_callback` 支持降级响应

### 维度 4：Workflow 图执行引擎

ADK 2.0 引入的图执行引擎（`workflow/`）是最大的架构创新。核心组件：

- **`BaseNode`**: 图中所有节点的基类，Agent 也是节点
- **`Workflow`**: 顶层编排容器，定义节点间的有向边 (Edge)
- **`Edge`**: 连接节点的边，支持条件路由
- **`FunctionNode`**: 无 LLM 的纯函数节点
- **`JoinNode`**: 扇入节点，合并多条路径
- **`START`**: 起始节点常量
- **`RetryConfig`**: 节点重试配置
- **`NodeTimeoutError`**: 节点超时错误

支持的执行模式：路由 (routing)、扇出/扇入 (fan-out/fan-in)、循环 (loops)、重试 (retry)、状态管理、动态节点、人在回路 (HITL)、嵌套工作流。

**Quick Start 示例** 展示了 Workflow 的简洁 API：
```python
root_agent = Workflow(
    name="root_agent",
    edges=[("START", generate_fruit_agent, generate_benefit_agent)],
)
```

### 维度 5：Task API — Agent 间委托

ADK 2.0 的 Task API 提供了结构化的 Agent-to-Agent 委托机制。`LlmAgent` 的 `mode` 字段定义了三种委托模式：

- **`chat`**: 标准聊天 Agent，通过 `transfer_to_agent` 可达
- **`task`**: 任务 Agent，与用户多轮对话完成任务
- **`single_turn`**: 单轮 Agent，无需与用户交互即完成任务

Task 委托通过 `isolation_scope` 实现事件隔离——委托的 Task Agent 只能看到自己 Task 的事件，看不到发起者的其他对话。`Event` 类的 `isolation_scope` 字段在内部标记了这种隔离。

Task API 还支持任务作为 Workflow 节点，以及混合委托模式。

### 维度 6：会话与状态管理

**Session 系统** (`sessions/`) 提供了多层状态管理：

- **`Session`**: 对话会话，包含事件历史和状态
- **`State`**: 会话状态，支持 Delta 更新
- **`BaseSessionService`**: 会话服务抽象基类
- 三种实现:
  - `InMemorySessionService`: 内存存储（开发/测试用）
  - `DatabaseSessionService`: SQLAlchemy 持久化（生产环境）
  - `VertexAiSessionService`: Vertex AI 托管会话

**Event 模型** (`events/event.py`) 是 ADK 的核心数据结构：
- 继承自 `LlmResponse`（包含 content、error_code 等 LLM 响应字段）
- 增加 `invocation_id`, `author`, `actions` (EventActions), `branch`, `isolation_scope`
- `NodeInfo`: 工作流节点元数据（path, run_id, name）
- `is_final_response()`: 判断是否为最终响应
- 支持 `message` 便利属性（别名 + setter）

### 维度 7：记忆系统

**Memory Service** (`memory/`) 提供长期记忆能力：

- **`BaseMemoryService`**: 抽象基类，定义两个核心方法：
  - `add_session_to_memory()`: 将整个会话添加到记忆
  - `add_events_to_memory()`: 增量添加事件到记忆（Delta 更新）
  - `search_memory()`: 搜索记忆
- **`SearchMemoryResponse`**: 搜索响应，包含 `MemoryEntry` 列表
- **`MemoryEntry`**: 记忆条目（Pydantic BaseModel）

记忆系统与会话系统解耦：会话管理单次对话的状态，记忆管理跨会话的长期知识。

### 维度 8：制品 (Artifact) 系统

**Artifact Service** (`artifacts/`) 管理 Agent 产生的文件制品：

- **`BaseArtifactService`**: 抽象基类
- 三种实现：
  - `InMemoryArtifactService`: 内存存储
  - `FileArtifactService`: 文件系统存储
  - `GcsArtifactService`: Google Cloud Storage 存储
- 模块采用懒加载 (`__getattr__` + `_LAZY_MEMBERS`)，避免导入重量级依赖

制品系统用于存储 Agent 生成的文件（如图片、文档、代码输出），与会话关联。

### 维度 9：模型抽象与多模型支持

**Model Layer** (`models/`) 提供了 LLM 的抽象层：

- **`BaseLlm`** (models/base_llm.py): LLM 基类（Pydantic BaseModel），定义：
  - `model`: 模型名称
  - `capabilities`: 模型能力声明（`LlmCapabilities`）
  - 支持子类覆盖能力声明
- **`LLMRegistry`**: 模型注册表，按名称查找 LLM 实现
- **`LlmRequest` / `LlmResponse`**: 统一的请求/响应模型
- **`BaseLlmConnection`**: 实时连接抽象

模型能力通过 `LlmCapabilities` 声明式管理，支持 `output_schema_and_tools` 等能力标志。默认模型为 `gemini-3.5-flash`，实时模式默认 `gemini-live-2.5-flash-native-audio`。

**关键设计**: ADK 虽然为 Gemini 优化，但通过 `BaseLlm` 抽象实现了模型无关性。任何符合接口的 LLM 都可以接入。

### 维度 10：插件系统与扩展机制

**Plugin System** (`plugins/`) 提供了可插拔的扩展点：

- **`BasePlugin`**: 插件基类
- **`PluginManager`**: 插件管理器
- 内置插件：
  - `LoggingPlugin`: 日志记录
  - `DebugLoggingPlugin`: 调试日志
  - `ReflectAndRetryModelPlugin`: 模型反思重试
  - `ReflectAndRetryToolPlugin`: 工具反思重试

**其他扩展机制**：
- **A2A** (`a2a/`): Agent-to-Agent 协议支持
- **Auth** (`auth/`): 认证与凭证管理（`BaseCredentialService`）
- **Telemetry** (`telemetry/`): OpenTelemetry 集成，`_instrumentation.record_agent_invocation()` 自动追踪 Agent 调用
- **Evaluation** (`evaluation/`): Agent 评估框架（`adk eval` CLI）
- **Code Executors** (`code_executors/`): 代码执行能力
- **Planners** (`planners/`): 规划器抽象（`BasePlanner`）

**Runner** (`runners.py`) 是整个框架的运行时入口，负责：
- 会话管理（创建/获取会话）
- InvocationContext 构建
- Agent 执行编排
- Live 模式事件交织
- 事件后处理与状态 Delta 计算
- 滑动窗口压缩 (compaction)

## 四、架构特色总结

| 特色 | 说明 |
|------|------|
| **Code-First** | 所有逻辑用 Python 定义，可测试、可版本化 |
| **Agent-as-Node** | Agent 同时是图节点，无缝嵌入 Workflow |
| **三级指令** | static_instruction → instruction → global_instruction，支持上下文缓存优化 |
| **六钩子回调** | before/after/on_error × model/tool，精细控制每个执行阶段 |
| **三种委托** | chat/task/single_turn，适应不同交互模式 |
| **懒加载** | 几乎所有子模块采用 `__getattr__` 懒加载，启动速度快 |
| **事件驱动** | Event 作为核心数据结构，统一 LLM 响应、工具调用、状态变更 |
| **隔离作用域** | `isolation_scope` 实现 Task 间事件隔离 |
| **模型无关** | BaseLlm 抽象 + LLMRegistry，支持任意 LLM 后端 |
| **部署灵活** | Docker / Cloud Run / Vertex AI Agent Engine 一键部署 |

## 五、与其他框架对比

- **vs LangChain**: ADK 更侧重 Agent 编排而非 Chain；内置 Workflow 图引擎；事件模型更成熟
- **vs AutoGen**: ADK 的 Task API 类似 AutoGen 的 GroupChat，但更结构化；ADK 有完整的状态/记忆/制品系统
- **vs CrewAI**: ADK 的 Agent 层级更灵活（树 + 图）；工具系统支持 MCP 协议
- **vs OpenAI Agents SDK**: ADK 的 Workflow 引擎和插件系统更强大；ADK 原生支持 Google 生态

## 六、核心源码文件索引

| 文件 | 职责 |
|------|------|
| `agents/base_agent.py` | Agent 基类，树形层级，回调管道 |
| `agents/llm_agent.py` | LLM Agent，工具绑定，模型配置，委托模式 |
| `flows/llm_flows/base_llm_flow.py` | LLM 调用流程引擎 |
| `flows/llm_flows/single_flow.py` | 单 Agent 执行流 |
| `flows/llm_flows/auto_flow.py` | 自动转移执行流 |
| `workflow/_base_node.py` | 图节点基类 |
| `workflow/_workflow.py` | Workflow 编排容器 |
| `tools/base_tool.py` | 工具基类 |
| `runners.py` | 运行时入口（2222 行） |
| `events/event.py` | 事件数据结构 |
| `sessions/session.py` | 会话模型 |
| `memory/base_memory_service.py` | 记忆服务基类 |
| `models/base_llm.py` | LLM 抽象基类 |
| `plugins/base_plugin.py` | 插件基类 |

---

*分析基于 google/adk-python main 分支 (2026)，通过 GitHub 源码直接提取。*
