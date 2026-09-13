# LangChain 架构深度分析

> 基于 langchain-ai/langchain 源码分析，覆盖 langchain-core 与 langchain 两个核心包

## 1. 架构哲学：可组合的 Runnable 抽象

LangChain 的核心设计哲学是 **"一切皆 Runnable"**。所有组件——LLM、Prompt、OutputParser、Tool、Retriever——都继承自同一个泛型基类 `Runnable[Input, Output]`，从而获得统一的调用接口和组合能力。

```python
class Runnable(ABC, Generic[Input, Output]):
    """A unit of work that can be invoked, batched, streamed, transformed and composed."""

    name: str | None
    """The name of the `Runnable`. Used for debugging and tracing."""

    @abstractmethod
    def invoke(self, input: Input, config: RunnableConfig | None = None, **kwargs: Any) -> Output:
        """Transform a single input into an output."""

    async def ainvoke(self, input: Input, config: RunnableConfig | None = None, **kwargs: Any) -> Output:
        return await run_in_executor(config, self.invoke, input, config, **kwargs)
```

关键设计决策：
- **LCEL（LangChain Expression Language）**：通过 `|` 管道运算符实现声明式链式组合，`RunnableSequence`、`RunnableParallel` 是核心组合原语
- **同步/异步双模**：每个 Runnable 同时提供 `invoke/ainvoke`、`stream/astream`、`batch/abatch`，异步默认通过线程池桥接同步实现
- **Pydantic 驱动的 Schema**：输入/输出类型通过泛型参数自动推导，生成 JSON Schema 用于验证和文档

```python
def __or__(self, other) -> RunnableSerializable[Input, Any]:
    """Compose this Runnable with another object to create a RunnableSequence."""
    return RunnableSequence(self, coerce_to_runnable(other))

def pipe(self, *others, name=None) -> RunnableSerializable[Input, Other]:
    """Equivalent to RunnableSequence(self, *others) or self | others[0] | ..."""
    return RunnableSequence(self, *others, name=name)
```

## 2. Agent Loop：观察-行动循环

LangChain 的 Agent 采用经典的 **ReAct（Reasoning + Acting）** 模式。核心循环定义在 `langchain_core/agents.py` 中，通过两个关键数据结构驱动：

```python
class AgentAction(Serializable):
    """Represents a request to execute an action by an agent."""
    tool: str           # 要执行的工具名称
    tool_input: str | dict[Any, Any]  # 传递给工具的输入
    log: str            # LLM 的推理过程日志
    type: Literal["AgentAction"] = "AgentAction"

    @property
    def messages(self) -> Sequence[BaseMessage]:
        """Return the messages that correspond to this action."""
        return _convert_agent_action_to_messages(self)

class AgentFinish(Serializable):
    """Agents return an AgentFinish when they have reached a stopping condition."""
    return_values: dict[Any, Any]  # 最终返回值
    log: str                       # 完整的 LLM 预测文本
    type: Literal["AgentFinish"] = "AgentFinish"
```

Agent Loop 的核心流程：
1. LLM 根据 prompt 生成 `AgentAction`（选择工具和输入）
2. 执行工具，获得 observation
3. 将 observation 转换为消息返回给 LLM
4. LLM 决定下一步——要么生成新的 `AgentAction`，要么生成 `AgentFinish`

```python
def _convert_agent_observation_to_messages(agent_action, observation):
    """Convert agent observation to messages for the next iteration."""
    if isinstance(observation, str):
        content = observation
    else:
        try:
            content = json.dumps(observation, ensure_ascii=False)
        except Exception:
            content = str(observation)
    return [HumanMessage(content=content)]
```

## 3. 工具系统：BaseTool 与函数式工具

工具系统在 `langchain_core/tools/base.py` 中实现，`BaseTool` 同时继承 `RunnableSerializable`，使工具可以无缝嵌入 LCEL 链。

```python
class BaseTool(RunnableSerializable[str | dict[str, Any] | ToolCall, Any]):
    """Base class for all LangChain tools."""

    name: str
    """The unique name of the tool that clearly communicates its purpose."""

    description: str
    """Used to tell the model how/when/why to use the tool."""

    args_schema: Annotated[ArgsSchema | None, SkipValidation()] = Field(default=None)
    """Pydantic model class to validate and parse the tool's input arguments."""

    return_direct: bool = False
    """Whether to return the tool's output directly. Setting True means
    AgentExecutor will stop looping after this tool is called."""

    handle_tool_error: bool | str | Callable | None = False
    """Handle ToolException raised by tool execution."""

    response_format: Literal["content", "content_and_artifact"] = "content"
    """The tool response format."""
```

工具定义支持多种方式：
- 继承 `BaseTool` 实现 `_run` / `_arun`
- 使用 `@tool` 装饰器从函数自动生成 Schema
- 支持 `InjectedToolArg` 注入运行时参数（不暴露给 LLM）

```python
def create_schema_from_function(model_name, func, *, filter_args=None, parse_docstring=False):
    """Create a Pydantic schema from a function's signature."""
    sig = inspect.signature(func)
    # 使用 Pydantic 的 validate_arguments 自动推导参数 Schema
    validated = validate_arguments(func, config=_SchemaConfig)
    inferred_model = validated.model
```

## 4. 流式输出：多层流式架构

LangChain 的流式设计分为三个层次：

**第一层：基础 stream/astream**
```python
def stream(self, input: Input, config: RunnableConfig | None = None, **kwargs) -> Iterator[Output]:
    """Default implementation of stream, which calls invoke.
    Subclasses must override this method if they support streaming output."""
    yield self.invoke(input, config, **kwargs)
```

**第二层：astream_events（结构化事件流）**
```python
def astream_events(self, input, config=None, *, version="v2", **kwargs) -> AsyncIterator[StreamEvent]:
    """Generate a stream of events.
    A StreamEvent is a dictionary with:
    - event: 'on_[runnable_type]_(start|stream|end)'
    - name: The name of the Runnable
    - run_id: Randomly generated ID
    - parent_ids: IDs of parent runnables
    - data: Event-specific data (chunk, input, output)
    """
```

**第三层：astream_log（JSON Patch 差分流，已废弃）**
```python
async def astream_log(self, input, config=None, *, diff=True, **kwargs):
    """Stream all output from a Runnable as Log objects with Jsonpatch ops.
    Deprecated since 1.3.3, use astream instead."""
    warn_deprecated(since="1.3.3", message="astream_log is deprecated. Use astream instead.")
```

## 5. 错误处理：分层容错机制

LangChain 在工具层面实现了精细的错误处理策略：

```python
# 工具级错误处理
handle_tool_error: bool | str | Callable[[ToolException], ToolExceptionHandlerOutput] | None = False
handle_validation_error: bool | str | Callable[[ValidationError], str] | None = False

# 错误处理逻辑
except (ValidationError, ValidationErrorV1) as e:
    if not self.handle_validation_error:
        error_to_raise = e
    else:
        content = _handle_validation_error(e, flag=self.handle_validation_error)
        status = "error"
except ToolException as e:
    if not self.handle_tool_error:
        error_to_raise = e
    else:
        content = _handle_tool_error(e, flag=self.handle_tool_error)
        status = "error"
```

**Runnable 级别的重试和 Fallback：**
```python
# 通过 with_retry 装饰器添加重试策略
sequence = (
    RunnableLambda(add_one) |
    RunnableLambda(buggy_double).with_retry(
        stop_after_attempt=10,
        wait_exponential_jitter=False
    )
)

# batch 中的 return_exceptions 模式
def batch(self, inputs, config=None, *, return_exceptions=False, **kwargs):
    """return_exceptions: Whether to return exceptions instead of raising them."""
    def invoke(input_, config):
        if return_exceptions:
            try:
                return self.invoke(input_, config, **kwargs)
            except Exception as e:
                return e
        else:
            return self.invoke(input_, config, **kwargs)
```

## 6. 上下文管理：RunnableConfig

所有 Runnable 方法都接受 `RunnableConfig` 参数，用于传递执行上下文：

```python
class RunnableConfig(TypedDict, total=False):
    tags: list[str]           # 用于过滤和分类
    metadata: dict[str, Any]  # 追踪元数据
    callbacks: Callbacks      # 回调处理器
    run_name: str             # 运行名称
    max_concurrency: int      # 最大并发数
    recursion_limit: int      # 递归深度限制
    configurable: dict[str, Any]  # 可配置字段
```

可配置字段支持运行时动态替换组件：
```python
def config_schema(self, *, include=None) -> type[BaseModel]:
    """The type of config this Runnable accepts specified as a Pydantic model.
    To mark a field as configurable, see configurable_fields and
    configurable_alternatives methods."""
    config_specs = self.config_specs
    configurable = create_model_v2("Configurable", field_definitions={
        spec.id: (spec.annotation, Field(spec.default, title=spec.name))
        for spec in config_specs
    })
```

## 7. 记忆系统：消息体系

LangChain 定义了丰富的消息类型层次结构，支持多模态内容：

```python
# 核心消息类型（langchain_core/messages/__init__.py）
__all__ = (
    "AIMessage", "AIMessageChunk",           # AI 回复
    "HumanMessage", "HumanMessageChunk",      # 用户输入
    "SystemMessage", "SystemMessageChunk",    # 系统提示
    "ToolMessage", "ToolMessageChunk",        # 工具返回
    "FunctionMessage", "FunctionMessageChunk", # 函数调用
    "ChatMessage", "ChatMessageChunk",        # 自定义角色
    "RemoveMessage",                          # 消息修改器
    # 多模态内容块
    "TextContentBlock", "ImageContentBlock", "AudioContentBlock",
    "VideoContentBlock", "FileContentBlock", "DataContentBlock",
    "ReasoningContentBlock",  # 推理内容
    # 工具调用
    "ToolCall", "ToolCallChunk", "InvalidToolCall",
    "ServerToolCall", "ServerToolResult",
    # 消息操作工具函数
    "filter_messages", "trim_messages", "merge_message_runs",
    "convert_to_messages", "convert_to_openai_messages",
    "get_buffer_string",
)
```

消息系统的关键工具函数：
- `filter_messages`：按类型/名称/ID 过滤消息
- `trim_messages`：按 token 数裁剪上下文窗口
- `merge_message_runs`：合并连续的同类消息

## 8. 任务规划：图与链的组合

LangChain 通过图结构支持任务规划和可视化：

```python
def get_graph(self, config: RunnableConfig | None = None) -> Graph:
    """Return a graph representation of this Runnable."""
    graph = Graph()
    input_node = graph.add_node(self.get_input_schema(config))
    runnable_node = graph.add_node(self, metadata=config.get("metadata") if config else None)
    output_node = graph.add_node(self.get_output_schema(config))
    graph.add_edge(input_node, runnable_node)
    graph.add_edge(runnable_node, output_node)
    return graph
```

更复杂的 Agent 规划能力已迁移到 **LangGraph**，它提供了基于状态图的 Agent 编排框架，支持条件分支、循环、子图等高级模式。

## 9. 可观测性：回调系统与事件流

LangChain 的可观测性建立在回调系统之上：

```python
# 所有 Runnable 都支持 callbacks 参数
callbacks: Callbacks = Field(default=None, exclude=True)
tags: list[str] | None = None
metadata: dict[str, Any] | None = None

# 调试模式
from langchain_core.globals import set_debug
set_debug(True)  # 启用全局调试输出

# 或者使用 ConsoleCallbackHandler
from langchain_core.tracers import ConsoleCallbackHandler
chain.invoke(..., config={"callbacks": [ConsoleCallbackHandler()]})
```

事件流提供结构化的运行时信息：
```python
# StreamEvent schema
{
    "event": "on_chat_model_start",  # 事件类型
    "name": "model_name",            # 组件名称
    "run_id": "uuid",                # 运行 ID
    "parent_ids": [],                # 父组件 ID 链
    "tags": [],                      # 标签
    "metadata": {},                  # 元数据
    "data": {"chunk": ...}           # 事件数据
}
```

配套的 **LangSmith** 提供了生产级的追踪、评估和调试 UI。

## 10. 扩展机制：多层扩展点

LangChain 提供了丰富的扩展机制：

**Schema 扩展：** 自定义输入/输出 Schema，支持 `ConfigurableField` 运行时替换
```python
@property
def config_specs(self) -> list[ConfigurableFieldSpec]:
    """List configurable fields for this Runnable."""
    return []
```

**组合扩展：** 通过 `RunnableLambda` 包装任意函数
```python
sequence = RunnableLambda(lambda x: x + 1) | RunnableLambda(lambda x: x * 2)
```

**回调扩展：** 自定义 `BaseCallbackHandler` 监听所有生命周期事件
**工具扩展：** 通过 `@tool` 装饰器或继承 `BaseTool` 创建自定义工具
**集成扩展：** 通过 `langchain-community` 包扩展模型、向量存储、检索器等

```python
# 快速初始化不同提供商的模型
from langchain.chat_models import init_chat_model
model = init_chat_model("openai:gpt-5.5")  # 通过 provider:model 格式切换
```

---

## 总结

| 维度 | 核心设计 | 关键类/接口 |
|------|---------|------------|
| 架构哲学 | 一切皆 Runnable，LCEL 管道组合 | `Runnable`, `RunnableSequence` |
| Agent Loop | ReAct 观察-行动循环 | `AgentAction`, `AgentFinish` |
| 工具系统 | BaseTool + 函数式工具 + Schema 自动推导 | `BaseTool`, `@tool` |
| 流式输出 | 三层流式：stream → astream_events → astream_log | `StreamEvent` |
| 错误处理 | 工具级 handle_tool_error + Runnable 级 retry/fallback | `ToolException` |
| 上下文管理 | RunnableConfig 统一配置传递 | `RunnableConfig` |
| 记忆系统 | 分层消息类型 + 多模态内容块 | `BaseMessage` 体系 |
| 任务规划 | Graph 可视化 + LangGraph 状态图编排 | `Graph` |
| 可观测性 | 回调系统 + 结构化事件流 + LangSmith | `CallbackManager` |
| 扩展机制 | Schema/组合/回调/工具/集成五层扩展 | `ConfigurableField` |

LangChain 的架构演进路径清晰：从早期的 Chain 类层次 → LCEL 管道抽象 → LangGraph 状态图编排。核心 `langchain-core` 保持轻量和稳定，复杂的 Agent 编排能力逐步迁移到 LangGraph 和 Deep Agents 等上层框架。
