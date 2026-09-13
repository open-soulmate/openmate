# AgentScope 架构深度分析

> GitHub: [agentscope-ai/agentscope](https://github.com/agentscope-ai/agentscope) | Stars: 23k+ | License: Apache-2.0
> 核心理念："Build and run agents you can see, understand and trust."

---

## 1. 设计哲学与定位

AgentScope 2.0 定位为 **production-ready、easy-to-use** 的 Agent 框架，其设计哲学与其他框架有本质区别：

- **不约束模型**：不靠严格的 prompt 模板和固定的编排逻辑来限制 LLM，而是充分利用模型自身的推理和工具调用能力
- **极简抽象**：只提供必要的抽象层（essential abstractions），随着模型能力提升不断简化
- **面向 Agentic LLM**：从 v1 的多智能体对话编排，转向 v2 的单 Agent 深度能力构建（ReAct、规划、记忆、RL 训练）

这与 LangChain 的"链式管道"、AutoGen 的"对话驱动"形成鲜明对比——AgentScope 2.0 更接近 **Claude Code / Codex 的工具型 Agent** 范式。

---

## 2. 整体架构分层

AgentScope 采用三层架构：

```
┌─────────────────────────────────────────────┐
│            Agent Service (部署层)            │
│  FastAPI 后端 · Web UI · 多租户 · Channels  │
│  RAG · MCP Hub · 持久化 · 调度 · 资源共享    │
├─────────────────────────────────────────────┤
│            Agent SDK (核心层)                │
│  Agent · Toolkit · Model · Context · Event  │
│  Memory · Pipeline · Middleware · Permission │
├─────────────────────────────────────────────┤
│            Infrastructure (基础设施)         │
│  Workspace/Sandbox · Tracing · Token · Tune │
│  MCP · A2A · Realtime · TTS · Embedding     │
└─────────────────────────────────────────────┘
```

**SDK 层** 是核心，提供 Agent 的构建积木；**Service 层** 是开箱即用的应用后端；**Infrastructure 层** 提供沙箱执行、可观测性、协议集成等底层能力。

---

## 3. Agent 核心抽象

AgentScope 的 Agent 核心是 `PipelineProtocol`：

```python
class PipelineProtocol(Protocol):
    """What a pipeline has to offer to go where an agent goes."""
    async def reply(
        self,
        *msgs: Msg | UserInterruptEvent | ExternalExecutionResultEvent,
    ) -> AsyncGenerator[AgentEvent | Msg, None]:
        """Reply to the given inputs and stream what happens."""
```

关键设计决策：
- **AsyncGenerator 流式输出**：Agent 的 reply 方法返回异步生成器，逐事件流式输出，支持实时中断和恢复
- **事件驱动**：不返回静态 Msg，而是返回 `AgentEvent | Msg` 的混合流，前端可实时渲染推理过程、工具调用、思考链
- **Protocol 而非 ABC**：使用 Python Protocol（结构化子类型），Agent 可以是任何实现了 reply 方法的对象

内置 Agent 类型：
- `ReActAgent`：核心 ReAct 循环（推理→行动→观察）
- `UserAgent`：人类用户代理
- `A2AAgent`：A2A 协议远程 Agent
- `RealtimeAgent`：实时语音 Agent

---

## 4. 消息与事件系统

这是 AgentScope 2.0 最精巧的设计之一，采用 **双轨制**：

### 消息 (Msg)
持久化的结构化消息，包含多个 Block：
- `TextBlock`：文本内容
- `DataBlock`：结构化数据（图片、文件等多模态）
- `ThinkingBlock`：思考过程
- `ToolCallBlock`：工具调用请求
- `HintBlock`：系统/团队注入的提示

### 事件 (Event)
实时流式事件，30+ 种类型，覆盖 Agent 执行全生命周期：
- `REPLY_START/END`：回复边界
- `MODEL_CALL_START/END`：模型调用
- `TEXT_BLOCK_START/DELTA/END`：流式文本
- `THINKING_BLOCK_START/DELTA/END`：流式思考
- `TOOL_CALL_START/DELTA/END`：工具调用流
- `TOOL_RESULT_START/TEXT_DELTA/DATA_DELTA/END`：工具结果流
- `REQUIRE_USER_CONFIRM`：需要用户确认
- `USER_INTERRUPT`：用户中断

所有事件基于 Pydantic BaseModel，带有 `id`、`created_at`、`metadata` 字段，支持序列化和持久化。

---

## 5. 工具系统 (Toolkit)

`Toolkit` 是 AgentScope 工具管理的核心，支持三层工具来源：

```python
class Toolkit:
    def __init__(
        self,
        tools: list[ToolBase] | None = None,        # Python 工具
        skills_or_loaders: ... = None,               # Agent Skills
        mcps: list[MCPClient] | None = None,         # MCP 服务器
        tool_groups: list[ToolGroup] | None = None,   # 工具组
    )
```

### 5.1 工具注册与发现
- 自动从 Python 函数的 docstring 和类型注解解析 JSON Schema
- 支持 Pydantic BaseModel 动态扩展 Schema
- 统一的流式执行接口（AsyncGenerator[ToolChunk]）

### 5.2 工具组 (ToolGroup)
- 分组管理工具，支持按组激活/停用
- 每组可配置 instructions（注入到 prompt）
- 内置 `Bash`、`Grep`、`Glob`、`Read`、`Write`、`Edit` 等编码工具

### 5.3 MCP 集成
- 直接注册 MCP 服务器的工具函数
- 支持 Streamable HTTP 传输
- 细粒度控制：可选择性注册单个 MCP 工具

### 5.4 Agent Skills
- 不是直接调用的工具，而是通过 `SkillViewer` 元工具读取指令
- Skills 包含指令、脚本、资源，Agent 需先读取再执行
- 支持从目录自动发现和注册

---

## 6. 模型层与上下文管理

### 模型抽象
支持主流 LLM 提供商：OpenAI、Anthropic、Gemini、DashScope（通义）、DeepSeek、Moonshot、Volcengine、xAI、Ollama。
同时支持 Embedding 模型和 TTS 模型。

### 上下文管理 (Context)
这是 AgentScope 2.0 的亮点功能：
- **自动压缩 (Compaction)**：当上下文窗口接近上限时自动压缩历史
- **工具结果卸载 (Tool-Result Offload)**：大型工具结果从上下文中卸载到外部存储
- **上下文注入 (Context Injection)**：通过内置中间件注入系统 prompt、RAG 检索结果、长期记忆

---

## 7. 中间件与 Hooks 系统

AgentScope 采用 **可组合中间件** 模式，在 Agent 循环的各个阶段插入逻辑：

```
用户输入 → [Middleware Chain] → Model Call → [Middleware Chain] → Tool Call → [Middleware Chain] → 输出
```

中间件覆盖的阶段：
- **Reply 钩子**：回复前后
- **Reasoning 钩子**：推理阶段
- **Acting 钩子**：行动阶段
- **Model Calling 钩子**：模型调用前后
- **Permission Checking**：权限检查
- **Context Compression**：上下文压缩
- **System Prompt**：系统提示注入

这种设计比 LangChain 的 LCEL 更灵活——中间件可以拦截、修改、跳过任何阶段。

---

## 8. 多 Agent 编排

### MsgHub（消息中心）
```python
async with MsgHub(
    participants=[agent1, agent2, agent3],
    announcement=Msg("Host", "Introduce yourselves.", "assistant")
) as hub:
    await sequential_pipeline([agent1, agent2, agent3])
    hub.add(agent4)
    hub.delete(agent3)
```

- 基于事件流的多 Agent 消息广播
- 动态添加/删除参与者
- 异步上下文管理器模式

### Pipeline（流水线）
- `sequential_pipeline`：顺序执行
- `PipelineProtocol`：统一的流式编排协议
- `GoalPipeline`：目标驱动的管道

### Agent Team（团队）
- Leader-Worker 编排模式
- 内置团队工具、任务规划
- 部署在 Agent Service 层

---

## 9. 权限与 Human-in-the-Loop

AgentScope 2.0 内置了细粒度的权限系统：

- **工具级权限控制**：对每个工具设置权限策略
- **资源访问控制**：控制 Agent 可访问的资源范围
- **确认模式 (Confirm)**：关键操作需要用户确认
- **绕过模式 (Bypass)**：信任模式下跳过确认
- **实时中断**：用户可随时 Ctrl+C 中断 Agent，记忆被保留，可无缝恢复

事件系统中的 `REQUIRE_USER_CONFIRM`、`USER_INTERRUPT`、`EXTERNAL_EXECUTION_RESULT` 事件实现了完整的 HITL 闭环。

---

## 10. 部署与运维

### Agent Service
基于 FastAPI 的开箱即用后端：
- **多租户多会话**：支持多个用户同时使用
- **IM 渠道集成**：飞书、钉钉、Discord
- **MCP & Skill Hub**：浏览 GitHub MCP Registry、ClawHub，一键安装
- **RAG 服务**：Blob 存储、索引 Worker、多租户检索
- **资源分组共享**：组织级别的模型、MCP、Skill、Workspace 共享
- **持久化**：SQL & NoSQL 存储 Agent 状态和会话
- **调度**：定时任务、Agent 唤醒、后台任务卸载

### Workspace / Sandbox
隔离执行环境，支持多种后端：
- 本地执行
- Docker 容器
- Apple Container
- Bubblewrap 沙箱
- E2B、OpenSandbox、Daytona
- Kubernetes

### 可观测性
- OpenTelemetry (OTel) 内置支持
- Tracing 模块追踪 Agent 执行链路
- Token 消耗统计

### Agentic RL 训练
独特的 RL 训练集成（通过 Trinity-RFT 库）：
- Frozen Lake 导航训练：成功率 15% → 86%
- 学会提问：准确率 47% → 92%
- 工具使用训练、多 Agent 博弈训练
- 数据增强：AIME-24 准确率 20% → 60%

---

## 源码目录结构

```
src/agentscope/
├── agent/          # Agent 核心（ReAct、User、A2A、Realtime）
├── message/        # Msg、Block（Text/Data/Thinking/ToolCall/Hint）
├── event/          # 30+ 事件类型（流式输出）
├── pipeline/       # 流水线编排（sequential、goal-driven）
├── tool/           # Toolkit、ToolGroup、内置工具、适配器
├── mcp/            # MCP 客户端集成
├── a2a/            # A2A 协议支持
├── model/          # LLM/Embedding/TTS 模型抽象
├── memory/         # 短期/长期记忆（InMemory、ReMe、Mem0）
├── formatter/      # 消息格式化（DashScope、OpenAI 等）
├── hooks/          # 中间件钩子
├── realtime/       # 实时语音
├── tts/            # 文字转语音
├── rag/            # RAG 检索增强
├── plan/           # 任务规划
├── session/        # 会话管理
├── token/          # Token 计数
├── tune/           # RL 微调
├── tuner/          # 训练器
├── tracing/        # OpenTelemetry 追踪
├── evaluate/       # 评估框架
├── embedding/      # Embedding 模型
├── types/          # 类型定义
└── _utils/         # 工具函数
```

---

## 总结

| 维度 | AgentScope 特点 |
|------|----------------|
| 设计哲学 | 不约束模型，利用模型自身能力 |
| 架构分层 | SDK → Service → Infrastructure 三层 |
| Agent 抽象 | AsyncGenerator 流式 Protocol，非继承 |
| 消息系统 | 双轨制：持久化 Msg + 流式 Event |
| 工具系统 | Toolkit 统一管理 Python/MCP/Skill 三类工具 |
| 上下文管理 | 自动压缩 + 工具结果卸载 + 上下文注入 |
| 中间件 | 可组合钩子，覆盖 Agent 循环全阶段 |
| 多 Agent | MsgHub 消息广播 + Pipeline 流水线 |
| 权限/HITL | 细粒度权限 + 实时中断 + 用户确认 |
| 部署 | FastAPI 后端 + 多种沙箱 + OTel + Agentic RL |

AgentScope 2.0 是一个从"多 Agent 对话编排"转向"单 Agent 深度能力"的框架，其事件驱动的流式架构、统一的 Toolkit 抽象、以及内置的 Agentic RL 训练能力，使其在生产就绪性方面领先于多数竞品。
