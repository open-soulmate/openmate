# 38. Agency Swarm 架构深度分析

> **项目**: [VRSEN/agency-swarm](https://github.com/VRSEN/agency-swarm)
> **定位**: 基于 OpenAI Agents SDK 的多智能体编排框架
> **许可证**: MIT
> **版本**: v1.x（完全重写，基于 OpenAI Agents SDK）
> **语言**: Python 3.12+

---

## 一、核心设计理念

Agency Swarm 的设计哲学源于一个直觉类比：**将 AI 多智能体系统映射为现实世界的组织架构**。框架的创始人 Arsenii Shatokhin（VRSEN）提出，通过"公司组织结构"的隐喻来构建 AI 代理机构，使代理之间的协作关系对开发者和用户都更加直观。

这一理念体现在三个核心原则上：

1. **角色专业化**：每个 Agent 拥有明确的职责描述（如 CEO、Developer、Virtual Assistant），就像公司中的岗位分工
2. **层级化通信**：Agent 之间的通信路径通过显式的 `communication_flows` 定义，模拟组织中的汇报关系
3. **自主性与可控性平衡**：Agent 在护栏（guardrails）内自主决策，同时人类可以通过入口 Agent 直接干预

v1.x 版本是基于 OpenAI Agents SDK 的完全重写，从 v0.x 的 Assistants API 黑盒模式转向了更透明、更可控的架构。

---

## 二、整体架构概览

Agency Swarm 的架构分为四层：

```
┌─────────────────────────────────────────────┐
│              应用层 (Application)             │
│   Web UI (FastAPI) / TUI / Programmatic API  │
├─────────────────────────────────────────────┤
│              编排层 (Agency)                  │
│   communication_flows / ThreadManager /      │
│   MasterContext / RunHooks                   │
├─────────────────────────────────────────────┤
│              智能体层 (Agent)                  │
│   Agent (wraps OpenAI Agents SDK Agent)      │
│   instructions / tools / model_settings      │
├─────────────────────────────────────────────┤
│              工具层 (Tools)                    │
│   @function_tool / BaseTool / OpenAPI / MCP  │
└─────────────────────────────────────────────┘
```

**Agency** 是顶层编排器，管理一组 Agent 实例，定义它们之间的通信规则，并提供对话持久化和运行入口。它本质上是一个"组织容器"。

**Agent** 是核心执行单元，封装了 OpenAI Agents SDK 的 `Agent` 类，增加了指令管理、工具加载、文件上传等能力。

**Tool** 是 Agent 执行动作的手段，支持三种定义方式：`@function_tool` 装饰器、`BaseTool` 类、OpenAPI Schema 转换。

---

## 三、Agent 模型设计

Agent 类是框架的核心构建块，每个 Agent 封装了以下关键属性：

| 属性 | 说明 |
|------|------|
| `name` | Agent 名称，用于标识和通信 |
| `instructions` | 系统提示词，可以是字符串或指向 `.md` 文件的路径，也支持动态生成函数 |
| `description` | 角色描述，供其他 Agent 了解该 Agent 的能力 |
| `model` | 使用的模型（如 `gpt-5.6-luna`），支持通过 LiteLLM 路由到第三方模型 |
| `model_settings` | 模型调优参数（temperature、max_tokens、reasoning effort 等） |
| `tools` | 工具列表，支持混合使用 `@function_tool` 和 `BaseTool` |
| `tools_folder` / `files_folder` / `schemas_folder` | 从文件夹自动加载工具、文件和 OpenAPI Schema |
| `output_type` | 结构化输出类型（Pydantic 模型），用于强制 Agent 返回特定格式 |
| `output_guardrails` / `input_guardrails` | 输入输出护栏，替代了 v0.x 的 `response_validator` |

Agent 的关键设计决策：

- **指令与代码分离**：`instructions` 可以外置为 Markdown 文件，便于非技术人员编辑
- **文件夹约定**：通过 `tools_folder`、`schemas_folder` 等约定目录结构，实现工具的自动发现和加载
- **结构化输出**：通过 `output_type` 支持 Pydantic 模型，确保 Agent 返回可解析的数据结构
- **Reasoning 支持**：通过 `Reasoning(effort="medium")` 控制推理深度

---

## 四、通信机制与编排模式

Agency Swarm 的核心创新在于其**显式通信流**机制。Agent 之间的通信路径通过 `communication_flows` 参数在 Agency 创建时声明：

```python
agency = Agency(
    ceo,
    communication_flows=[
        ceo > dev,      # CEO 可以向 Developer 发起对话
        ceo > va,       # CEO 可以向 Virtual Assistant 发起对话
        dev > va        # Developer 可以向 Virtual Assistant 发起对话
    ],
)
```

`>` 运算符定义了**有向通信路径**——左侧 Agent 可以主动与右侧 Agent 通信，但反之不行。这模拟了组织中的汇报关系。

框架提供两种核心编排模式：

### Orchestrator-Worker 模式（默认）
- 一个 Agent 作为编排者，将任务分配给多个 Worker Agent
- Worker 的响应汇编后返回给用户
- 适用场景：复杂多步骤任务，步骤之间相对独立
- 通过 `SendMessage` 工具实现——Agent 调用 `send_message` 将消息发送给目标 Agent

### Handoff 模式
- 控制权完全转移给另一个 Agent
- 适用场景：顺序工作流，每个步骤需要与用户紧密反馈
- 通过在 `communication_flows` 中指定 `Handoff` 类型实现

```python
communication_flows=[
    (triage_agent, billing_specialist, Handoff),    # Handoff
    (portfolio_manager, risk_analyst),               # 默认 SendMessage (Orchestrator-Worker)
]
```

---

## 五、工具系统架构

Agency Swarm 提供三种工具定义方式，从简到繁：

### 1. `@function_tool` 装饰器（推荐）
最简洁的方式，将普通函数转换为 Agent 工具。函数签名自动转换为参数 Schema，Docstring 作为工具描述。

### 2. `BaseTool` 类
基于 Pydantic 的类定义方式，适合需要复杂验证逻辑的工具。支持 `async def run()` 异步执行。字段通过 `Field` 定义并自动转换为参数描述。

### 3. OpenAPI Schema 转换
通过 `ToolFactory.from_openapi_schema()` 将 OpenAPI 规范自动转换为工具集，适合对接已有 REST API。

此外，框架内置了 `IPythonInterpreter`、`PersistentShellTool`、`LoadFileAttachment` 等常用工具，并支持 MCP（Model Context Protocol）服务器集成。

工具的设计原则：
- **独立性**：每个工具是自包含的，不依赖全局状态
- **可配置性**：通过参数控制工具行为
- **可组合性**：多个工具可以组合使用

---

## 六、状态管理与对话持久化

v1.x 从 v0.x 的 Assistants API 黑盒状态管理转向了完全由应用控制的持久化方案：

- **ThreadManager** + **MessageStore**：通过 `RunHooks` 和共享的 `MasterContext` 管理对话状态
- **回调式持久化**：通过 `load_threads_callback` 和 `save_threads_callback` 回调函数实现，开发者可以对接任意存储后端（数据库、文件等）
- **完整对话历史**：持久化所有消息，包括用户对话和 Agent 间的手动交接，而不仅仅是 Thread ID

```python
agency = Agency(
    agent1,
    communication_flows=[(agent1, agent2)],
    load_threads_callback=lambda: load_threads(chat_id),
    save_threads_callback=lambda messages: save_threads(messages, chat_id),
)
```

这种设计将持久化策略完全交给应用层，框架本身保持无状态，有利于水平扩展和多租户部署。

---

## 七、模型兼容性与扩展性

Agency Swarm 的模型支持分为两个层次：

### 原生支持（OpenAI）
- GPT-5 系列、GPT-4o 等
- 通过 Responses API 获得完整功能（Web Search、Computer Use、Reasoning）
- 原生支持 o3、o4-mini 等推理模型

### 第三方模型（通过 LiteLLM）
- Anthropic Claude、Google Gemini、Grok (xAI)、Azure OpenAI
- OpenRouter 网关支持
- 任何兼容 Chat Completions API 的提供者

模型配置通过 `model` 和 `model_settings` 参数控制，`ModelSettings` 支持 `temperature`、`top_p`、`max_tokens`、`reasoning` 等精细调优。

---

## 八、部署与生产就绪

框架提供多种运行模式：

| 模式 | 方法 | 适用场景 |
|------|------|---------|
| Web UI | `agency.copilot_demo()` | 开发调试、快速演示 |
| Terminal | `agency.tui()` | 本地交互、CLI 工具 |
| Async API | `agency.get_response()` | 生产后端服务 |
| Sync API | `agency.get_response_sync()` | 同步集成 |
| FastAPI | `agency.run_fastapi()` 或 `run_fastapi(agencies=...)` | 生产部署 |

生产部署的关键特性：
- **FastAPI 集成**：内置 FastAPI 端点，支持多个 Agency 共存
- **认证支持**：通过 `APP_TOKEN` 环境变量配置
- **流式响应**：`POST /get_response_stream` 支持 SSE 流式输出
- **成本追踪**：返回 `usage` 对象，包含 token 计数和成本估算
- **可观测性**：支持 OpenAI Tracing、Langfuse、AgentOps 三种观测平台

---

## 九、可观测性与调试

Agency Swarm 内建了完善的可观测性支持：

### OpenAI Tracing
无需额外依赖，通过 `trace()` 上下文管理器自动追踪 Agent 调用，可在 platform.openai.com/traces 查看。

### Langfuse
高级追踪和调试平台，通过 `@observe()` 装饰器集成，支持调用链可视化。

### AgentOps
专业的 Agent 监控和分析平台。

每个响应都包含 `usage` 对象：
```json
{
  "request_count": 1,
  "cached_tokens": 0,
  "input_tokens": 10,
  "output_tokens": 20,
  "total_tokens": 30,
  "total_cost": 0.0,
  "reasoning_tokens": null
}
```

TUI 中使用 `/cost` 命令可查看当前会话的使用量和成本。

---

## 十、架构评价与适用场景

### 优势
1. **直观的组织隐喻**：通过公司角色映射降低了多智能体系统的学习曲线
2. **显式通信控制**：`communication_flows` 提供了比自由对话更可控的协作模式
3. **灵活的持久化**：回调式设计不绑定特定存储，易于集成
4. **生产就绪**：内置 FastAPI、认证、流式、成本追踪等生产必需功能
5. **模型无关性**：通过 LiteLLM 支持几乎所有主流 LLM 提供者
6. **渐进式复杂度**：可以从简单的双 Agent 系统开始，逐步扩展

### 局限
1. **OpenAI 中心**：虽然支持第三方模型，但核心架构仍围绕 OpenAI API 设计，某些高级功能（Web Search、Computer Use）仅限 OpenAI
2. **通信开销**：Orchestrator-Worker 模式下，编排者的 token 消耗较高（需要汇总所有 Worker 的输出）
3. **调试复杂度**：多 Agent 级联调用时，错误追踪和调试仍然具有挑战性
4. **v1.x 迁移成本**：从 v0.x 到 v1.x 是完全重写，迁移工作量不可忽视

### 适用场景
- **客户服务**：Triage Agent 路由到专业 Agent（Billing、Technical）
- **内容生产**：CEO Agent 协调 Writer、Editor、Reviewer
- **数据分析**：Portfolio Manager 协调 Risk Analyst、Report Generator
- **开发辅助**：Architect Agent 分配任务给 Developer、Tester

### 不适用场景
- 需要高度动态、非预定义通信路径的场景（Agent Swarm 的通信流是静态声明的）
- 对延迟极度敏感的场景（多 Agent 级联会增加延迟）
- 需要复杂状态机或循环依赖的场景

---

## 附录：与其他框架对比

| 维度 | Agency Swarm | CrewAI | AutoGen | LangGraph |
|------|-------------|--------|---------|-----------|
| 通信模型 | 显式有向图 | 角色任务分配 | 自由对话 | 状态图 |
| 编排模式 | Orchestrator-Worker / Handoff | Sequential / Hierarchical | Group Chat | 自定义图 |
| 模型支持 | OpenAI 原生 + LiteLLM | 多提供者 | 多提供者 | 多提供者 |
| 工具系统 | Pydantic + OpenAPI + MCP | 自定义 | 自定义 | LangChain Tools |
| 状态管理 | 回调式持久化 | 内置 | 内置 | 检查点 |
| 生产部署 | FastAPI 内置 | 需自行搭建 | 需自行搭建 | LangServe |
| 学习曲线 | 中等 | 低 | 中等 | 较高 |
