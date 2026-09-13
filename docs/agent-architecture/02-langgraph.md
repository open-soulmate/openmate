# LangGraph 架构深度分析

> **项目**: langchain-ai/langgraph  
> **Stars**: 41,548 | **Forks**: 7,018 | **License**: MIT  
> **定位**: 面向长时间运行、有状态 Agent 的底层编排框架  
> **灵感来源**: Google Pregel、Apache Beam、NetworkX

---

## 一、核心设计哲学：Pregel 计算模型

LangGraph 的核心是一个 **Bulk Synchronous Parallel (BSP)** 执行引擎，称为 `Pregel`。每个执行步骤分为三个阶段：

1. **Plan（规划）**: 确定本轮需要执行哪些 Actor（节点）
2. **Execute（执行）**: 并行执行所有选中的 Actor，直到全部完成、失败或超时
3. **Update（更新）**: 用 Actor 写入的值批量更新 Channel

```python
# pregel/main.py — Pregel 类的文档字符串（摘录）
class Pregel(PregelProtocol[StateT, ContextT, InputT, OutputT]):
    """Pregel manages the runtime behavior for LangGraph applications.

    Pregel combines **actors** and **channels** into a single application.
    **Actors** read data from channels and write data to channels.
    Pregel organizes the execution of the application into multiple steps,
    following the **Pregel Algorithm**/**Bulk Synchronous Parallel** model.

    Each step consists of three phases:
    - **Plan**: Determine which **actors** to execute in this step.
    - **Execution**: Execute all selected **actors** in parallel.
    - **Update**: Update the channels with the values written by the **actors**.
    """
```

这种设计意味着：**同一轮执行中，节点写入的 Channel 值对其他节点不可见**，只有进入下一轮时才生效。这从根本上避免了并发写入的竞争条件，是 LangGraph 保证确定性执行的关键。

---

## 二、Channel 体系：有状态通信原语

Channel 是 LangGraph 的核心抽象，所有节点间通信都通过 Channel 进行。BaseChannel 定义了统一的接口：

```python
# channels/base.py
class BaseChannel(Generic[Value, Update, Checkpoint], ABC):
    """Base class for all channels."""
    __slots__ = ("key", "typ")

    @property
    @abstractmethod
    def ValueType(self) -> Any:
        """The type of the value stored in the channel."""

    @property
    @abstractmethod
    def UpdateType(self) -> Any:
        """The type of the update received by the channel."""

    @abstractmethod
    def get(self) -> Value:
        """Return the current value of the channel.
        Raises `EmptyChannelError` if the channel is empty."""

    @abstractmethod
    def update(self, values: Sequence[Update]) -> bool:
        """Update the channel's value with the given sequence of updates.
        Called by Pregel for all channels at the end of each step."""

    def consume(self) -> bool:
        """Notify the channel that a subscribed task ran."""
        return False

    def finish(self) -> bool:
        """Notify the channel that the Pregel run is finishing."""
        return False
```

LangGraph 内置了四种 Channel 实现，各自服务于不同的状态管理场景：

### 2.1 LastValue — 最后值 Channel

最基础的 Channel，每个 step 只允许接收一个值，适用于普通状态字段：

```python
# channels/last_value.py
class LastValue(Generic[Value], BaseChannel[Value, Value, Value]):
    """Stores the last value received, can receive at most one value per step."""

    def update(self, values: Sequence[Value]) -> bool:
        if len(values) == 0:
            return False
        if len(values) != 1:
            raise InvalidUpdateError(
                f"At key '{self.key}': Can receive only one value per step. "
                "Use an Annotated key to handle multiple values."
            )
        self.value = values[-1]
        return True
```

### 2.2 BinaryOperatorAggregate — 归约 Channel

通过二元操作符（如 `operator.add`）累积值，适用于列表追加、数字累加等场景：

```python
# channels/binop.py
class BinaryOperatorAggregate(Generic[Value], BaseChannel[Value, Value, Value]):
    """Stores the result of applying a binary operator to the current value and each new value."""

    def update(self, values: Sequence[Value]) -> bool:
        if not values:
            return False
        if self.value is MISSING:
            self.value = values[0]
            values = values[1:]
        seen_overwrite: bool = False
        for value in values:
            is_overwrite, overwrite_value = _get_overwrite(value)
            if is_overwrite:
                if seen_overwrite:
                    raise InvalidUpdateError(
                        "Can receive only one Overwrite value per super-step."
                    )
                self.value = overwrite_value
                seen_overwrite = True
                continue
            if not seen_overwrite:
                self.value = self.operator(self.value, value)
        return True
```

这里可以看到 `Overwrite` 机制——即使使用了 reducer，也可以通过 `Overwrite(value=...)` 强制覆盖。

### 2.3 EphemeralValue — 临时值 Channel

只在紧邻的下一步可用，之后自动清除，适用于事件信号传递：

```python
# channels/ephemeral_value.py
class EphemeralValue(Generic[Value], BaseChannel[Value, Value, Value]):
    """Stores the value received in the step immediately preceding, clears after."""

    def update(self, values: Sequence[Value]) -> bool:
        if len(values) == 0:
            if self.value is not MISSING:
                self.value = MISSING
                return True
            else:
                return False
        if len(values) != 1 and self.guard:
            raise InvalidUpdateError(
                f"EphemeralValue(guard=True) can receive only one value per step."
            )
        self.value = values[-1]
        return True
```

### 2.4 LastValueAfterFinish — 完成后可见的 Channel

在 `finish()` 被调用后才对外可见，消费后自动清空，适用于输出控制：

```python
# channels/last_value.py
class LastValueAfterFinish(Generic[Value], BaseChannel[Value, Value, tuple[Value, bool]]):
    """Stores the last value received, but only made available after finish()."""

    def consume(self) -> bool:
        if self.finished:
            self.finished = False
            self.value = MISSING
            return True
        return False

    def finish(self) -> bool:
        if not self.finished and self.value is not MISSING:
            self.finished = True
            return True
        return False

    def get(self) -> Value:
        if self.value is MISSING or not self.finished:
            raise EmptyChannelError()
        return self.value
```

---

## 三、StateGraph：声明式图构建 API

`StateGraph` 是面向用户的高层 API，将类型化的 State 定义编译为 Pregel 执行图。它通过 Python 类型注解自动推断 Channel 类型：

```python
# graph/state.py — 关键导入和类定义
from langgraph.channels.base import BaseChannel
from langgraph.channels.binop import BinaryOperatorAggregate
from langgraph.channels.last_value import LastValue, LastValueAfterFinish
from langgraph.channels.ephemeral_value import EphemeralValue
from langgraph.channels.named_barrier_value import NamedBarrierValue
from langgraph.constants import END, START, TAG_HIDDEN
from langgraph.pregel import Pregel

class StateGraph:
    """声明式状态图构建器，将 TypedDict/Pydantic State 编译为 Pregel。"""
```

用户使用方式：

```python
from typing import Annotated
import operator
from typing_extensions import TypedDict
from langgraph.graph import StateGraph

class State(TypedDict):
    messages: Annotated[list, operator.add]  # 使用 reducer
    count: int  # 默认 LastValue

builder = StateGraph(State)
builder.add_node("agent", agent_fn)
builder.add_node("tools", tool_fn)
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
builder.add_edge("tools", "agent")
graph = builder.compile()
```

`Annotated[list, operator.add]` 告诉 StateGraph 使用 `BinaryOperatorAggregate` 而非 `LastValue`。

---

## 四、条件分支与路由

`BranchSpec` 实现了条件边的路由逻辑，支持三种路由模式：

```python
# graph/_branch.py
class BranchSpec(NamedTuple):
    path: Runnable[Any, Hashable | list[Hashable]]
    ends: dict[Hashable, str] | None
    input_schema: type[Any] | None = None

    @classmethod
    def from_path(cls, path, path_map, infer_schema=False) -> BranchSpec:
        # 支持三种 path_map 形式：
        # 1. dict: {"good": "node_a", "bad": "node_b"}
        # 2. list: ["node_a", "node_b"] → {name: name for name in list}
        # 3. None: 从函数返回值类型注解推断（Literal 类型）
        if isinstance(path_map, dict):
            path_map_ = path_map.copy()
        elif isinstance(path_map, list):
            path_map_ = {name: name for name in path_map}
        else:
            # 从 Literal 类型注解推断
            if rtn_type := get_type_hints(func).get("return"):
                if get_origin(rtn_type) is Literal:
                    path_map_ = {name: name for name in get_args(rtn_type)}
```

路由执行时，分支函数返回值被映射到目标节点，支持返回 `Send` 对象进行动态扇出：

```python
# graph/_branch.py — _finish 方法
def _finish(self, writer, input, result, config):
    if not isinstance(result, (list, tuple)):
        result = [result]
    if self.ends:
        destinations = [r if isinstance(r, Send) else self.ends[r] for r in result]
    else:
        destinations = cast(Sequence[Send | str], result)
    if any(dest is None or dest == START for dest in destinations):
        raise ValueError("Branch did not return a valid destination")
    if any(p.node == END for p in destinations if isinstance(p, Send)):
        raise InvalidUpdateError("Cannot send a packet to the END node")
    entries = writer(destinations, False)
```

---

## 五、NodeBuilder：底层节点构建器

`NodeBuilder` 是比 `StateGraph.add_node()` 更底层的 API，直接操作 Channel 订阅和写入：

```python
# pregel/main.py
class NodeBuilder:
    __slots__ = ("_channels", "_triggers", "_tags", "_metadata",
                 "_writes", "_bound", "_retry_policy", "_cache_policy", "_timeout")

    def subscribe_to(self, *channels: str, read: bool = True) -> Self:
        """Node will be invoked when any of these channels are updated."""
        if read:
            self._channels.extend(channels)
        self._triggers.extend(channels)
        return self

    def do(self, node: RunnableLike) -> Self:
        """Adds the specified node function."""
        if self._bound is not DEFAULT_BOUND:
            self._bound = RunnableSeq(self._bound, coerce_to_runnable(node))
        else:
            self._bound = coerce_to_runnable(node)
        return self

    def write_to(self, *channels, **kwargs) -> Self:
        """Add channel writes."""
        self._writes.extend(ChannelWriteEntry(c) if isinstance(c, str) else c for c in channels)
        self._writes.extend(
            ChannelWriteEntry(k, mapper=v) if callable(v) else ChannelWriteEntry(k, value=v)
            for k, v in kwargs.items()
        )
        return self

    def build(self) -> PregelNode:
        return PregelNode(
            channels=self._channels, triggers=self._triggers,
            writers=[ChannelWrite(self._writes)], bound=self._bound,
            retry_policy=self._retry_policy, cache_policy=self._cache_policy,
            timeout=self._timeout,
        )
```

这种 Builder 模式将"订阅哪些 Channel"、"执行什么逻辑"、"写入哪些 Channel"完全解耦。

---

## 六、中断与恢复（Human-in-the-Loop）

`interrupt()` 函数实现了人机协作模式——节点执行到一半暂停，等待外部输入后恢复：

```python
# types.py — interrupt() 函数
def interrupt(value: Any) -> Any:
    """Pause the graph and surface `value` to the client.
    On subsequent invocations within the same node, returns the value
    provided during the first invocation (resume)."""
    from langgraph.errors import GraphInterrupt

    conf = get_config()["configurable"]
    scratchpad = conf[CONFIG_KEY_SCRATCHPAD]
    idx = scratchpad.interrupt_counter()

    # 查找之前的 resume 值
    if scratchpad.resume:
        if idx < len(scratchpad.resume):
            conf[CONFIG_KEY_SEND]([(RESUME, scratchpad.resume)])
            return scratchpad.resume[idx]

    # 查找当前的 resume 值
    v = scratchpad.get_null_resume(True)
    if v is not None:
        assert len(scratchpad.resume) == idx
        scratchpad.resume.append(v)
        conf[CONFIG_KEY_SEND]([(RESUME, scratchpad.resume)])
        return v

    # 没有找到 resume 值，抛出中断异常
    raise GraphInterrupt((Interrupt.from_ns(value=value, ns=conf[CONFIG_KEY_CHECKPOINT_NS]),))
```

恢复时通过 `Command(resume=...)` 注入值：

```python
graph.stream(Command(resume="some input from a human!!!"), config)
```

---

## 七、流式输出体系

LangGraph 支持 7 种流模式，每种都有对应的 TypedDict 定义：

```python
# types.py
StreamMode = Literal[
    "values", "updates", "checkpoints", "tasks", "debug", "messages", "custom"
]

class ValuesStreamPart(TypedDict, Generic[OutputT]):
    """stream_mode="values" — 每步后发射完整状态"""
    type: Literal["values"]
    ns: tuple[str, ...]
    data: OutputT
    interrupts: tuple[Interrupt, ...]

class MessagesStreamPart(TypedDict):
    """stream_mode="messages" — 逐 token 发射 LLM 消息"""
    type: Literal["messages"]
    ns: tuple[str, ...]
    data: tuple[AnyMessage, dict[str, Any]]

class TasksStreamPart(TypedDict):
    """stream_mode="tasks" — 任务开始/完成事件"""
    type: Literal["tasks"]
    ns: tuple[str, ...]
    data: TaskPayload | TaskResultPayload
```

使用 `StreamPart` 联合类型，消费者可以通过 `part["type"]` 做类型判别：

```python
async for part in graph.astream(input, version="v2"):
    if part["type"] == "values":
        part["data"]  # 完整状态
    elif part["type"] == "messages":
        part["data"]  # (message, metadata) 元组
```

---

## 八、持久化与检查点

Checkpoint 机制是 LangGraph 实现有状态执行的基础。`BaseCheckpointSaver` 定义了存储接口，Channel 的 `checkpoint()` / `from_checkpoint()` 负责序列化：

```python
# channels/base.py — Channel 的检查点方法
class BaseChannel(ABC):
    def checkpoint(self) -> Checkpoint | Any:
        """Return a serializable representation of the channel's current state."""
        try:
            return self.get()
        except EmptyChannelError:
            return MISSING

    @abstractmethod
    def from_checkpoint(self, checkpoint: Checkpoint | Any) -> Self:
        """Return a new identical channel, initialized from a checkpoint."""

    def copy(self) -> Self:
        """Return a copy of the channel.
        By default, delegates to checkpoint() and from_checkpoint()."""
        return self.from_checkpoint(self.checkpoint())
```

`Pregel.get_state()` 方法通过 Checkpointer 恢复完整的图状态快照：

```python
# pregel/main.py
def get_state(self, config: RunnableConfig, *, subgraphs: bool = False) -> StateSnapshot:
    checkpointer = ensure_config(config)[CONF].get(CONFIG_KEY_CHECKPOINTER, self.checkpointer)
    if not checkpointer:
        raise ValueError("No checkpointer set")
    saved = checkpointer.get_tuple(config)
    return self._prepare_state_snapshot(config, saved, ...)
```

支持三种持久化模式：

```python
# types.py
Durability = Literal["sync", "async", "exit"]
"""持久化模式:
- 'sync': 同步持久化，在下一步开始前完成
- 'async': 异步持久化，与下一步并行执行
- 'exit': 仅在图退出时持久化
"""
```

---

## 九、容错机制：重试与超时

LangGraph 内置了细粒度的重试和超时策略：

```python
# types.py
class RetryPolicy(NamedTuple):
    """节点重试策略"""
    initial_interval: float = 0.5      # 首次重试前等待时间（秒）
    backoff_factor: float = 2.0        # 退避因子
    max_interval: float = 128.0        # 最大重试间隔（秒）
    max_attempts: int = 3              # 最大尝试次数（含首次）
    jitter: bool = True                # 是否添加随机抖动
    retry_on: type[Exception] | Sequence[type[Exception]] | Callable = default_retry_on

@dataclass(frozen=True)
class TimeoutPolicy:
    """节点超时策略"""
    per_attempt: float | None = None   # 每次尝试的超时时间
    per_step: float | None = None      # 每步的超时时间
    max_execution: float | None = None  # 最大总执行时间

@dataclass(frozen=True)
class CachePolicy:
    """节点缓存策略"""
    key_func: Callable[..., str] = default_cache_key
    ttl: float | None = None
```

这些策略可以通过 `NodeBuilder` 链式设置：

```python
builder.add_node("agent", agent_fn, retry_policy=RetryPolicy(max_attempts=5))
# 或底层 API
NodeBuilder().subscribe_to("input").do(agent_fn).set_timeout(30.0).build()
```

---

## 十、`Overwrite` 机制与状态覆盖

当使用 `BinaryOperatorAggregate`（如 `Annotated[list, operator.add]`）时，正常更新会通过 reducer 累积。但有时需要**直接覆盖**整个值，`Overwrite` 数据类实现了这一能力：

```python
# types.py
@dataclass(slots=True)
class Overwrite:
    """Bypass a reducer and write the wrapped value directly."""

    value: Any
    """The value to write directly, bypassing any reducer."""

    type: Literal["__overwrite__"] = "__overwrite__"
    """Discriminator field — lets the channel reducer recognise an Overwrite
    even after JSON serialization."""
```

在 `BinaryOperatorAggregate.update()` 中，Overwrite 被特殊处理：

```python
# channels/binop.py
for value in values:
    is_overwrite, overwrite_value = _get_overwrite(value)
    if is_overwrite:
        if seen_overwrite:
            raise InvalidUpdateError("Can receive only one Overwrite value per super-step.")
        self.value = overwrite_value
        seen_overwrite = True
        continue
    if not seen_overwrite:
        self.value = self.operator(self.value, value)
```

`_get_overwrite` 函数支持三种识别形式：

```python
def _get_overwrite(value: Any) -> tuple[bool, Any]:
    if isinstance(value, Overwrite):
        return True, value.value                           # 1. 直接实例
    if isinstance(value, dict):
        if len(value) == 1 and OVERWRITE in value:
            return True, value[OVERWRITE]                  # 2. {"__overwrite__": value}
        if value.get("type") == OVERWRITE and "value" in value:
            return True, value["value"]                    # 3. JSON 反序列化后
    return False, None
```

---

## 架构总结

| 维度 | 设计选择 | 核心类/接口 |
|------|---------|------------|
| 计算模型 | BSP / Pregel 三阶段 | `Pregel` |
| 通信原语 | Channel（类型化状态容器） | `BaseChannel` |
| 状态定义 | TypedDict + Annotated reducer | `StateGraph` |
| 路由 | 条件边 + Send 动态扇出 | `BranchSpec` |
| 中断 | interrupt() + Command(resume) | `GraphInterrupt` |
| 流式 | 7 种 StreamMode | `StreamPart` |
| 持久化 | Channel checkpoint + Checkpointer | `BaseCheckpointSaver` |
| 容错 | 重试/超时/缓存策略 | `RetryPolicy`, `TimeoutPolicy` |
| 覆盖 | Overwrite 绕过 reducer | `Overwrite` |
| 底层 API | NodeBuilder Channel 订阅/写入 | `NodeBuilder` → `PregelNode` |

LangGraph 的核心洞察是：**将 Agent 执行建模为 Channel 上的 BSP 计算，用确定性的"计划-执行-更新"循环取代不可预测的回调链**。这使得状态持久化、断点恢复、流式输出、并发控制等生产级需求成为架构的自然延伸，而非事后补丁。
