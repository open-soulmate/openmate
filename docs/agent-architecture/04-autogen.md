# 04. AutoGen深度架构分析

> 源码版本：microsoft/autogen (main branch, 2025)
> 框架定位：微软研究院出品的多智能体AI应用框架，基于消息传递与事件驱动架构
> 当前状态：已进入维护模式，由 Microsoft Agent Framework (MAF) 接替

---

## 1. 分层架构设计

AutoGen 采用**三层分层架构**，每一层有明确的职责边界，上层构建在下层之上：

- **Core API** (`autogen-core`)：消息传递、事件驱动 Agent、本地/分布式运行时
- **AgentChat API** (`autogen-agentchat`)：面向快速原型的高级 API，支持群聊等多 Agent 模式
- **Extensions API** (`autogen-ext`)：LLM 客户端、代码执行等扩展能力

从 README 中可以看到架构概览：

```
The autogen framework uses a layered and extensible design. Layers have clearly
divided responsibilities and build on top of layers below. This design enables
you to use the framework at different levels of abstraction, from high-level
APIs to low-level components.

- Core API implements message passing, event-driven agents, and local and
  distributed runtime for flexibility and power.
- AgentChat API implements a simpler but opinionated API for rapid prototyping.
- Extensions API enables first- and third-party extensions continuously
  expanding framework capabilities.
```

这种分层设计使得用户可以从不同抽象层级切入——直接用 Core API 构建底层消息驱动系统，或者用 AgentChat API 快速搭建多 Agent 协作原型。

---

## 2. Agent 协议基类（Protocol-based）

AutoGen 的 Agent 基类并非传统的抽象类，而是一个 **Python Protocol**（结构化子类型），定义了所有 Agent 必须实现的接口契约：

```python
@runtime_checkable
class Agent(Protocol):
    @property
    def metadata(self) -> AgentMetadata:
        """Metadata of the agent."""
        ...

    @property
    def id(self) -> AgentId:
        """ID of the agent."""
        ...

    async def bind_id_and_runtime(self, id: AgentId, runtime: "AgentRuntime") -> None:
        """Function used to bind an Agent instance to an AgentRuntime."""
        ...

    async def on_message(self, message: Any, ctx: MessageContext) -> Any:
        """Message handler for the agent. This should only be called by
        the runtime, not by other agents."""
        ...

    async def save_state(self) -> Mapping[str, Any]:
        """Save the state of the agent. The result must be JSON serializable."""
        ...

    async def load_state(self, state: Mapping[str, Any]) -> None:
        """Load in the state of the agent obtained from save_state."""
        ...

    async def close(self) -> None:
        """Called when the runtime is closed"""
        ...
```

**关键设计决策**：
- 使用 `@runtime_checkable` 装饰器，允许运行时 `isinstance` 检查
- `AgentId` 由 `type`（Agent 类型名）和 `key`（实例标识）组成，支持同一类型的多个实例
- `bind_id_and_runtime` 实现延迟绑定，Agent 在注册到运行时后才获得身份
- `on_message` 是统一的消息入口，所有通信都通过消息传递完成
- 内置状态持久化接口（`save_state` / `load_state`），支持 JSON 序列化

---

## 3. AssistantAgent：核心对话 Agent 实现

`AssistantAgent` 是最常用的 Agent 实现，继承自 `BaseChatAgent` 并实现 `Component` 接口支持声明式配置：

```python
class AssistantAgent(BaseChatAgent, Component[AssistantAgentConfig]):
    """An agent that provides assistance with tool use."""

class AssistantAgentConfig(BaseModel):
    """The declarative configuration for the assistant agent."""
    name: str
    model_client: ComponentModel
    tools: List[ComponentModel] | None = None
    workbench: List[ComponentModel] | None = None
    handoffs: List[HandoffBase | str] | None = None
    model_context: ComponentModel | None = None
    memory: List[ComponentModel] | None = None
    description: str
    system_message: str | None = None
    model_client_stream: bool = False
    reflect_on_tool_use: bool
    tool_call_summary_format: str
    max_tool_iterations: int = Field(default=1, ge=1)
    metadata: Dict[str, str] | None = None
    structured_message_factory: ComponentModel | None = None
```

**核心能力矩阵**：

| 能力 | 说明 |
|------|------|
| Tool Use | 支持 `FunctionTool`、`Workbench`（含 MCP）、并行工具调用 |
| Handoff | Agent 间交接，通过 `HandoffMessage` 触发 |
| Streaming | `model_client_stream=True` 启用 token 级流式输出 |
| Structured Output | `output_content_type` 指定 Pydantic 模型生成结构化响应 |
| Memory | 外部记忆存储集成 |
| Model Context | 可插拔的上下文窗口管理（`BufferedChatCompletionContext`、`TokenLimitedChatCompletionContext`） |
| Multi-step Tool | `max_tool_iterations` 控制多轮工具调用深度 |

---

## 4. 工具调用与反思机制

AssistantAgent 的工具调用流程在 `on_messages_stream` 中实现，核心逻辑分为多个步骤：

```python
# STEP 1: Add incoming messages to model context
await self._add_messages_to_context(model_context, messages)

# STEP 2: Update model context with memory content
memory_events = await self._update_model_context_with_memory(
    memory=memory,
    model_context=model_context,
    agent_name=agent_name,
)

# STEP 3: Generate a message ID for correlation
message_id = str(uuid.uuid4())

# STEP 4: Run the first inference
model_result = None
async for inference_output in self._call_llm(
    model_client=model_client,
    model_client_stream=model_client_stream,
    system_messages=system_messages,
    model_context=model_context,
    workbench=workbench,
    handoff_tools=handoff_tools,
    agent_name=agent_name,
    cancellation_token=cancellation_token,
    output_content_type=output_content_type,
    message_id=message_id,
):
    if isinstance(inference_output, CreateResult):
        model_result = inference_output
    else:
        yield inference_output  # Streaming chunk event

# STEP 5: Process the model output
async for output_event in self._process_model_result(
    model_result=model_result,
    inner_messages=inner_messages,
    reflect_on_tool_use=reflect_on_tool_use,
    max_tool_iterations=max_tool_iterations,
    tool_call_summary_format=tool_call_summary_format,
    ...
):
    yield output_event
```

**工具调用行为规则**：
- 模型返回工具调用 → 立即执行 → 可选反思（`reflect_on_tool_use`）
- `reflect_on_tool_use=False`：工具结果直接作为 `ToolCallSummaryMessage` 返回
- `reflect_on_tool_use=True`：工具结果送回模型做第二次推理，生成自然语言总结
- 多个工具调用并发执行（`asyncio.gather`），可通过模型客户端配置禁用
- `max_tool_iterations` 控制最大迭代轮数（默认 1），支持多步推理链

---

## 5. 消息传递与事件驱动运行时

`SingleThreadedAgentRuntime` 是 AutoGen Core 的核心运行时，基于单 asyncio 队列处理所有消息：

```python
class SingleThreadedAgentRuntime(AgentRuntime):
    """A single-threaded agent runtime that processes all messages using
    a single asyncio queue. Messages are delivered in the order they are
    received, and the runtime processes each message in a separate asyncio
    task concurrently."""

    def __init__(self, *, intervention_handlers=None, tracer_provider=None,
                 ignore_unhandled_exceptions=True):
        self._message_queue: Queue[
            PublishMessageEnvelope | SendMessageEnvelope | ResponseMessageEnvelope
        ] = Queue()
        self._agent_factories: Dict[str, Callable[[], Agent | Awaitable[Agent]]] = {}
        self._instantiated_agents: Dict[AgentId, Agent] = {}
        self._intervention_handlers = intervention_handlers
        self._background_tasks: Set[Task[Any]] = set()
        self._subscription_manager = SubscriptionManager()
        self._serialization_registry = SerializationRegistry()
```

运行时支持三种消息信封类型：

```python
@dataclass(kw_only=True)
class PublishMessageEnvelope:
    """发布消息到所有订阅了该 Topic 的 Agent"""
    message: Any
    cancellation_token: CancellationToken
    sender: AgentId | None
    topic_id: TopicId
    message_id: str

@dataclass(kw_only=True)
class SendMessageEnvelope:
    """点对点发送消息到特定 Agent"""
    message: Any
    sender: AgentId | None
    recipient: AgentId
    future: Future[Any]
    cancellation_token: CancellationToken
    message_id: str

@dataclass(kw_only=True)
class ResponseMessageEnvelope:
    """RPC 响应信封"""
    message: Any
    future: Future[Any]
    sender: AgentId
    recipient: AgentId | None
```

---

## 6. 消息分发与干预机制

消息处理的核心在 `_process_next` 方法中，通过 Python 3.10 的 `match/case` 模式匹配分发：

```python
async def _process_next(self) -> None:
    if self._background_exception is not None:
        e = self._background_exception
        self._background_exception = None
        self._message_queue.shutdown(immediate=True)
        raise e

    message_envelope = await self._message_queue.get()

    match message_envelope:
        case SendMessageEnvelope(message=message, sender=sender,
                                 recipient=recipient, future=future):
            if self._intervention_handlers is not None:
                for handler in self._intervention_handlers:
                    temp_message = await handler.on_send(
                        message, message_context=message_context,
                        recipient=recipient
                    )
                    if temp_message is DropMessage:
                        future.set_exception(MessageDroppedException())
                        return
                    message_envelope.message = temp_message
            task = asyncio.create_task(self._process_send(message_envelope))
            self._background_tasks.add(task)

        case PublishMessageEnvelope(message=message, sender=sender,
                                     topic_id=topic_id):
            # ... intervention handling and publish processing
            task = asyncio.create_task(self._process_publish(message_envelope))
            self._background_tasks.add(task)

        case ResponseMessageEnvelope():
            await self._process_response(message_envelope)
```

**InterventionHandler** 是一个强大的中间件机制，允许在消息到达 Agent 之前拦截、修改或丢弃消息：

```python
# 干预处理器可以：
# 1. 修改消息内容（返回新消息）
# 2. 丢弃消息（返回 DropMessage）
# 3. 抛出异常终止处理
# 4. 返回原始消息继续传递
```

---

## 7. Agent 注册与懒加载实例化

Agent 采用**工厂模式注册 + 懒加载实例化**，运行时不预先创建所有 Agent：

```python
async def register_factory(
    self, type: str, agent_factory: Callable[[], T | Awaitable[T]],
    agent_instance: Type[T]
) -> AgentId:
    agent_id = AgentId(type=type, key="default")
    if agent_id.type not in self._agent_factories:
        self._agent_factories[agent_id.type] = agent_factory
        self._agent_instance_types[agent_id.type] = type_func_alias(agent_instance)
    await agent_instance.bind_id_and_runtime(id=agent_id, runtime=self)
    self._instantiated_agents[agent_id] = agent_instance
    return agent_id

async def _get_agent(self, agent_id: AgentId) -> Agent:
    """懒加载：首次访问时才通过工厂创建 Agent 实例"""
    if agent_id in self._instantiated_agents:
        return self._instantiated_agents[agent_id]

    agent_factory = self._agent_factories[agent_id.type]
    agent = await self._invoke_agent_factory(agent_factory, agent_id)
    self._instantiated_agents[agent_id] = agent
    return agent
```

AgentId 的结构为 `(type, key)` 二元组，支持同一 Agent 类型的多个独立实例（如多个 AssistantAgent 各自独立运行）。

---

## 8. 订阅与 Topic 发布系统

AutoGen 实现了**基于 Topic 的发布-订阅**模式，Agent 通过 `TypeSubscription` 声明对特定 Topic 的兴趣：

```python
# Agent 注册订阅
await runtime.add_subscription(
    TypeSubscription(topic_type=agent_type, agent_type=agent_type)
)
# Agent 订阅群组 Topic
await runtime.add_subscription(
    TypeSubscription(topic_type=self._group_topic_type, agent_type=agent_type)
)
```

发布消息时，运行时通过 `SubscriptionManager` 查找所有订阅了该 Topic 的 Agent，然后并发调用它们的 `on_message`：

```python
async def _process_publish(self, message_envelope: PublishMessageEnvelope):
    responses: List[Awaitable[Any]] = []
    recipients = await self._subscription_manager.get_subscribed_recipients(
        message_envelope.topic_id
    )
    for agent_id in recipients:
        # 避免将消息发回给发送者
        if message_envelope.sender is not None and agent_id == message_envelope.sender:
            continue
        agent = await self._get_agent(agent_id)
        future = _on_message(agent, message_context)
        responses.append(future)

    await asyncio.gather(*responses)
```

`TopicId` 由 `type`（Topic 类型名）和 `source`（来源标识）组成，实现了灵活的多播通信。

---

## 9. 群聊编排（Group Chat Orchestration）

`BaseGroupChat` 是所有群聊模式的基类，它在 Core 运行时之上构建了 Agent 协作层：

```python
class BaseGroupChat(Team, ABC, ComponentBase[BaseModel]):
    """In a group chat team, participants share context by publishing
    their messages to all other participants."""

    def __init__(self, name, description, participants, group_chat_manager_name,
                 group_chat_manager_class, termination_condition=None,
                 max_turns=None, runtime=None, custom_message_types=None):
        # 每个 Team 实例有唯一 UUID
        self._team_id = str(uuid.uuid4())

        # Topic 命名约定
        self._group_topic_type = f"group_topic_{self._team_id}"
        self._group_chat_manager_topic_type = (
            f"{self._group_chat_manager_name}_{self._team_id}"
        )
        self._participant_topic_types = [
            f"{participant.name}_{self._team_id}" for participant in participants
        ]
        self._output_topic_type = f"output_topic_{self._team_id}"
```

**初始化流程**（`_init` 方法）展示了运行时注册的完整过程：

```python
async def _init(self, runtime: AgentRuntime) -> None:
    # 注册每个参与者
    for participant, agent_type in zip(self._participants,
                                        self._participant_topic_types):
        await ChatAgentContainer.register(
            runtime, type=agent_type,
            factory=self._create_participant_factory(
                self._group_topic_type, self._output_topic_type,
                participant, self._message_factory
            ),
        )
        # 参与者订阅自己的 Topic 和群组 Topic
        await runtime.add_subscription(
            TypeSubscription(topic_type=agent_type, agent_type=agent_type)
        )
        await runtime.add_subscription(
            TypeSubscription(topic_type=self._group_topic_type,
                           agent_type=agent_type)
        )

    # 注册群聊管理器
    await self._base_group_chat_manager_class.register(
        runtime, type=group_chat_manager_agent_type.type,
        factory=self._create_group_chat_manager_factory(...)
    )
    # 管理器订阅自身 Topic、群组 Topic 和输出 Topic
    await runtime.add_subscription(
        TypeSubscription(topic_type=self._group_chat_manager_topic_type,
                        agent_type=group_chat_manager_agent_type.type)
    )
    await runtime.add_subscription(
        TypeSubscription(topic_type=self._group_topic_type,
                        agent_type=group_chat_manager_agent_type.type)
    )
    await runtime.add_subscription(
        TypeSubscription(topic_type=self._output_topic_type,
                        agent_type=group_chat_manager_agent_type.type)
    )
```

群聊采用**管理器-参与者**模式：`GroupChatManager`（如 `RoundRobinGroupChatManager`）负责调度发言顺序，参与者通过 `ChatAgentContainer` 包装后注册到运行时。所有消息通过 Topic 广播实现上下文共享。

---

## 10. 团队运行与状态管理

`run_stream` 方法是团队执行的入口，展示了完整的生命周期管理：

```python
async def run_stream(self, *, task=None, cancellation_token=None,
                     output_task_messages=True):
    # 任务标准化
    if isinstance(task, str):
        messages = [TextMessage(content=task, source="user")]
    elif isinstance(task, BaseChatMessage):
        messages = [task]

    # 启动嵌入式运行时
    if self._embedded_runtime:
        assert isinstance(self._runtime, SingleThreadedAgentRuntime)
        self._runtime.start()

    # 延迟初始化
    if not self._initialized:
        await self._init(self._runtime)

    # 后台关闭任务
    if self._embedded_runtime:
        async def stop_runtime():
            await self._runtime.stop_when_idle()
            await self._output_message_queue.put(
                GroupChatTermination(
                    message=StopMessage(content="The group chat is stopped.",
                                       source=self._group_chat_manager_name)
                )
            )
        shutdown_task = asyncio.create_task(stop_runtime())

    # 发送启动消息给群聊管理器
    await self._runtime.send_message(
        GroupChatStart(messages=messages, output_task_messages=output_task_messages),
        recipient=AgentId(type=self._group_chat_manager_topic_type,
                         key=self._team_id),
    )

    # 从输出队列消费消息
    while True:
        message = await self._output_message_queue.get()
        if isinstance(message, GroupChatTermination):
            break
        yield message
```

**状态持久化**通过 `save_state` / `load_state` 实现，按 Agent 名称（而非 ID）存储，使状态可跨团队迁移：

```python
async def save_state(self) -> Mapping[str, Any]:
    agent_states: Dict[str, Mapping[str, Any]] = {}
    for name, agent_type in zip(self._participant_names,
                                 self._participant_topic_types):
        agent_id = AgentId(type=agent_type, key=self._team_id)
        agent_states[name] = await self._runtime.agent_save_state(agent_id)
    # 也保存管理器状态
    agent_id = AgentId(type=self._group_chat_manager_topic_type,
                       key=self._team_id)
    agent_states[self._group_chat_manager_name] = (
        await self._runtime.agent_save_state(agent_id)
    )
    return TeamState(agent_states=agent_states).model_dump()
```

---

## 架构总结

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

---

## 架构启示与设计哲学

AutoGen 的架构设计体现了几个值得深入思考的工程哲学：

**"一切皆消息"的统一抽象**：这是 AutoGen 最核心的设计决策。无论是用户输入、Agent 间协作、工具调用结果还是终止信号，全部被建模为类型化的消息对象。这种统一抽象消除了同步/异步调用的边界，使得运行时可以自由调度消息的执行顺序和并发策略。代价是开发者需要适应"追踪消息流"而非"追踪调用栈"的调试思维。

**运行时与 Agent 的彻底解耦**：Agent Protocol 只定义了消息处理接口，不包含任何运行时逻辑。运行时负责消息路由、Agent 实例化、生命周期管理和并发调度。这种分离使得同一个 Agent 实现可以运行在本地单线程运行时，也可以运行在分布式 gRPC 运行时上，无需修改任何业务代码。这是 Actor 模型在 AI Agent 领域的经典应用。

**声明式配置与命令式代码的融合**：通过 `Component` 和 `ComponentModel` 机制，Agent 的配置可以序列化为 YAML/JSON 并从配置文件加载，同时保留了 Python 代码的全部表达力。这使得 AutoGen Studio 等无代码工具可以可视化编排 Agent 工作流，而开发者仍可通过代码实现复杂的自定义逻辑。

**Topic 发布-订阅的灵活性**：相比直接的 Agent-to-Agent 调用，基于 Topic 的发布-订阅模式天然支持一对多广播、动态订阅和松耦合通信。群聊编排中的"管理器-参与者"模式正是这一机制的典型应用——管理器通过控制 Topic 的订阅关系来调度发言顺序，参与者只需向群组 Topic 发布消息即可实现上下文共享。

**状态管理的前瞻性**：内置的 `save_state` / `load_state` 接口和按名称（而非运行时 ID）存储状态的设计，使得 Agent 系统具备了检查点恢复、会话迁移和故障恢复的能力。这对于长时间运行的多 Agent 任务至关重要。

---

*本文档基于 AutoGen 源码 main 分支深度分析，涵盖十个维度的架构解析。AutoGen 已进入维护模式，其设计思想已融入 Microsoft Agent Framework，新项目建议使用 MAF 作为首选框架。*
