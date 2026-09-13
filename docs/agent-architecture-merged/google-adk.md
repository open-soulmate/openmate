# Google ADK

## 概述

Google ADK 是一个Google Agent开发套件。

**仓库**: https://github.com/google/adk-python | **语言**: Python

## 核心架构

> **项目**: [google/adk-python](https://github.com/google/adk-python)
> **版本**: ADK 2.0 (2026)
> **许可证**: Apache 2.0
> **语言**: Python 3.10+

Google Agent Development Kit (ADK) 是 Google 开源的、代码优先 (code-first) 的 AI Agent 开发框架，旨在将软件工程原则系统性地引入 AI Agent 构建流程。ADK 2.0 是一次重大架构升级，引入了图执行引擎 (Workflow Runtime)、Task API、Agent Config 等全新概念，从一个"Agent 脚手架"演进为一个完整的 Agent 操作系统。

ADK 的核心设计哲学是 **"软件工程原则应用于 Agent"**：模块化、可测试、可版本化、可部署。它不是简单的 LLM 包装器，而是一个涵盖 Agent 定义、工具管理、会话状态、记忆系统、制品存储、工作流编排、评估和部署的全栈框架。

ADK 源码位于 `src/google/adk/`，包含 30 个子模块，架构层次清晰：

[详见源码]

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

**Memory Service** (`memory/`) 提供长期记忆能力：

- **`BaseMemoryService`**: 抽象基类，定义两个核心方法：
  - `add_se

## 关键技术

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

**Memory Service** (`memory/`) 提供长期记忆能力：

- **`BaseMemoryService`**: 抽象基类，定义两个核心方法：
  - `add_session_to_memory()`: 将整个会话添加到记忆
  - `add_events_to_memory()`: 增量添加事件到记忆（Delta 更新）
  - `search_memory()`: 搜索记忆
- **`SearchMemoryResponse`**: 搜索响应，包含 `MemoryEntry` 列表
- **`MemoryEntry`**: 记忆条目（Pydantic BaseModel）

记忆系统与会话系统解耦：会话管理单次对话的状态，记忆管理跨会话的长期知识。

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

| 文件 | 职责 |
|------|------|
| `agents/base_agent.py` | Agent 基类，树形层级，回调管道 |
| `agents/llm_agent.py` | LLM Agent，工具绑定，模型配置

## 对openmate的启示

> 仓库: https://github.com/google/adk-python  
> 抓取通道: cdn.jsdelivr.net/gh/google/adk-python@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent 树 / Callback 管道 / Plugin 系统 / 状态管理 借鉴

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（39-google-adk.md）
- MiMo报告（google-adk.md）
