# AutoGen

## 概述

AutoGen 是一个多Agent对话框架。

**仓库**: https://github.com/microsoft/autogen | **语言**: Python

## 核心架构

> 源码版本：microsoft/autogen (main branch, 2025)
> 框架定位：微软研究院出品的多智能体AI应用框架，基于消息传递与事件驱动架构
> 当前状态：已进入维护模式，由 Microsoft Agent Framework (MAF) 接替

AutoGen 采用**三层分层架构**，每一层有明确的职责边界，上层构建在下层之上：

- **Core API** (`autogen-core`)：消息传递、事件驱动 Agent、本地/分布式运行时
- **AgentChat API** (`autogen-agentchat`)：面向快速原型的高级 API，支持群聊等多 Agent 模式
- **Extensions API** (`autogen-ext`)：LLM 客户端、代码执行等扩展能力

从 README 中可以看到架构概览：

[详见源码]

这种分层设计使得用户可以从不同抽象层级切入——直接用 Core API 构建底层消息驱动系统，或者用 AgentChat API 快速搭建多 Agent 协作原型。

await self._add_messages_to_context(model_context, messages)

memory_events = await self._update_model_context_with_memory(
    memory=memory,
    model_context=model_context,
    agent_name=agent_name,
)

async for output_event in self._process_model_result(
    model_result=model_result,
    inner_messages=inner_messages,
    reflect_on_tool_use=reflect_on_tool_use,
    max_tool_iterations=max_tool_iterations,
    tool_call_summary_format=tool_call_summary_format,
    ...
):
    yield output_event
[详见源码]

**初始化流程**（`_init` 方法）展示了运行时注册的完整过程：

[详见源码]

群聊采用**管理器-参与者**模式：`GroupChatManager`（如 `RoundRobinGroupChatManager`）负责调度发言顺序，参与者通过 `ChatAgentContainer` 包装后注册到运行时。所有消息通过 Topic 广播实现上下文共享。

| 维度 | 设计选择 |
|------|----------|
| **Agent 定义** | Protocol（结构化子类型），非继承 |
| **通信模型** | 消息传递 + 发布/订阅（Topic-based） |
| **运行时** | 单线程 asyncio 队列，每消息独立 Task |
| **Agent 生命周期** | 工厂注册 + 懒加载实例化 |
| **消息拦截** | InterventionHandler 中间件链 |
| **多 Agent 编排** | 管理器-参与者模式，Topic 广播共享上下文 |
| **状态管理** | JSON 序列化，按名称（非 ID）存储 |
| **可扩展性** | Component + ComponentModel 声明式配置 |
| **工具集成** | FunctionTool / Workbench / MCP 协议 |
| **跨语言** | Core API 支持 Python + .NET 互操作 |

AutoGen 的核心哲学是**"一切皆消息"**——Agent 之间、Agent 与运行时之间、团队与参与者之间，所有交互都通过类型化的消息传递完成。这种设计带来了高度的解耦性和可测试性，但也意味着调试时需要追踪消息流而非直接的函数调用栈。

AutoGen 的架构设计体现了几个值得深入思考的工程哲学：

**"一切皆消息"的统一抽象**：这是 AutoGen 最核心的设计决策。无论是用户输入、Agent 间协作、工具调用结果还是终止信号，全部被建模为类型化的消息对象。这种统一抽象消除了同步/异步调用的边界，使得运行时可以自由调度消息的执行顺序和并发策略。代价是开发者需要适应"追踪消息流"而非"追踪调用栈"的调试思维。

**运行时与 Agent 的彻底解耦**：Agent Protocol 只定义了消息处理接口，不包含任何

## 关键技术

1. **异步 + 流式工具执行**：`asyncio.gather` 并行工具 + `asyncio.Queue` 流式事件，兼顾吞吐与实时性。
2. **组件化可序列化**：`AssistantAgentConfig`（Pydantic）+ `Component` 基类，Agent 可导出/导入 YAML/JSON。
3. **上下文可插拔**：把"送多少历史给模型"抽象为 `ChatCompletionContext`，用户可继承自定义（如过滤 reasoning model 的 thought）。
4. **反思两态**：`reflect_on_tool_use` 可开关"工具结果后再推理一次"，兼顾简洁（直接返回摘要）与质量（反思总结）。
5. **强约束手性**：handoff 与工具名去重校验（构造时 `ValueError`），`max_tool_iterations >= 1`。

- **错误捕获不崩循环（源码确认）**：`_execute_tool_call` 中 `json.loads(tool_call.arguments)` 失败时返回 `FunctionExecutionResult(content="Error: ...", is_error=True)` 而非抛异常——把工具参数错误转化为给模型的错误消息，让模型自我纠正。
- **取消控制（源码确认）**：`CancellationToken` 贯穿 `create/create_stream/call_tool` 全链路，可中途取消长任务。
- **显式并发约束（源码确认）**：docstring 明确警告"assistant agent is **not thread-safe or coroutine-safe**, 不应跨任务共享或并发调用"——把并发边界写进契约。
- **边界/输入校验（源码确认）**：构造时校验工具名/handoff 名唯一、`max_tool_iterations>=1`；流式 chunk 类型不符 `raise RuntimeError("Invalid chunk type")`；反射无文本结果 `raise RuntimeError`。
- **状态持久化（源码确认）**：`AssistantAgentState`（`state/_states.py`）支持 get/set_state，配合 `reset()`，为崩溃恢复/会话快照提供底座。
- **多 handoff 冲突保护**：多 handoff 同时触发只执行第一个并 warning，避免歧义。

- **容错**：工具错误作为 `is_error=True` 结果回灌，模型可重试/换方案；反思阶段强制 `tool_choice="none"` 防止反射时又触发工具死循环。
- **并发模型（源码确认）**：全 asyncio；工具调用 `asyncio.gather` 并发；流式用 `asyncio.Queue` 解耦生产消费。多 Agent runtime（autogen-core，含 Rust 实现）支持跨进程/分布式消息传递（`_worker_runtime.py` 35k、gRPC `agent_worker_pb2_grpc`）。
- **横向扩展**：worker runtime + gRPC 协议允许 Agent 跑在不同进程/机器上，由 runtime 路由消息，无状态可水平扩展。
- **资源管理**：`TokenLimitedChatCompletionContext` 限制送入模型的 token 量，避免上下文爆炸。
- **可观测性（源码确认）**：`event_logger = logging.getLogger(EVENT_LOGGER_NAME)` 记录每个 ToolCallRequest/Execution；事件对象（ThoughtEvent 等）天然构成可回放的执行轨迹。

- **反思循环（源码确认）**：`reflect_on_tool_use=True` 即内置 self-reflection——工具结果回来后再推理一次，让模型对工具输出做二次判断再作答。
- **记忆管理（源码确认）**：`Memory` 抽象（`autogen_core.memory`，如 `ListMemory`），推理前 `update_context` 注入；`MemoryQueryEvent` 让记忆注入可观测。
- **结构化自我纠错**：工具参数 JSON 解析错误以消息回灌，模型在下一轮修正——闭环式自我纠错。
- **终止条件即自反馈**：`conditions/_terminations.py`（22k）提供 Tex

## 对openmate的启示

> 仓库: https://github.com/microsoft/autogen  
> 抓取通道: cdn.jsdelivr.net/gh/microsoft/autogen@main  
> 版本快照: main @ 2026-09-13（README 20KB + `python/README.md` 9KB + `autogen-core/_agent.py` 实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多 Agent 运行时、core/agentchat/ext 分层、.NET 并行实现、迁移教训借鉴

---

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

core/agentchat/ext 3-layer maps to core interface vs integration split.
Topic pub/sub maps to decoupled agent communication.
MiddlewareAgent maps to middleware chain pattern.
Orchestrator 3 impls maps to pluggable orchestration strategies.
GroupChat plus Graph maps to graph-based multi-agent.
uv plus poe check maps to one-command full check.
0.2->0.4 migration maps to design stable abstraction from start.
---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（04-autogen.md）
- 豆包（043_autogen.md）
- MiMo报告（autogen.md）
