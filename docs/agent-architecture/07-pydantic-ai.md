# 07 - PydanticAI 架构深度分析

> **项目**: [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai)
> **定位**: "How Python does AI" — 基于 Pydantic 类型系统的类型安全 AI Agent 框架
> **版本**: 2026 年 9 月 main 分支
> **源码分析**: agent/__init__.py, _agent_graph.py, tools.py, models/\_\_init\_\_.py, models/_abstract.py, _tool_execution.py

---

## 1. 整体架构概览

PydanticAI 的核心设计哲学是 **"typed end to end"** —— 从用户输入到 LLM 输出，全链路类型安全。其架构基于 `pydantic-graph` 库实现的有向图执行引擎，将 Agent 的运行时分解为三个核心节点的循环：

```
UserPromptNode → ModelRequestNode → CallToolsNode → ModelRequestNode → ... → End
```

Agent 类本身是一个泛型类，参数化了依赖类型 `AgentDepsT` 和输出类型 `OutputDataT`：

```python
# agent/__init__.py
class Agent(AbstractAgent[AgentDepsT, OutputDataT]):
    """Class for defining "agents" - a way to have a specific type of "conversation" with an LLM.
    Agents are generic in the dependency type they take AgentDepsT
    and the output type they return, OutputDataT.
    By default, if neither generic parameter is customised, agents have type Agent[object, str].
    """
    _model: models.Model | models.KnownModelName | str | None
    _name: str | None
    _description: TemplateStr[AgentDepsT] | str | None
    end_strategy: EndStrategy
    model_settings: AgentModelSettings[AgentDepsT] | None
    _output_type: OutputSpec[OutputDataT]
    _function_toolset: FunctionToolset[AgentDepsT]
    _output_toolset: OutputToolset[AgentDepsT] | None
    _user_toolsets: list[AbstractToolset[AgentDepsT]]
```

这种泛型设计使得 `Agent[int, str]` 表示"依赖 int 类型上下文、返回 str"的 Agent，编译期即可获得类型检查。

---

## 2. 图执行引擎（Graph Execution）

PydanticAI 的 Agent 循环不是简单的 while 循环，而是基于 `pydantic-graph` 的有向图。每个节点是一个 dataclass，`run()` 方法返回下一个要执行的节点：

```python
# _agent_graph.py
@dataclass
class GraphAgentState:
    """State kept across the execution of the agent graph."""
    message_history: list[_messages.ModelMessage] = dataclasses.field(default_factory=list)
    usage: _usage.RunUsage = dataclasses.field(default_factory=_usage.RunUsage)
    output_retries_used: int = 0
    run_step: int = 0
    run_id: str = dataclasses.field(default_factory=lambda: str(uuid7()))
    conversation_id: str = dataclasses.field(default_factory=lambda: str(uuid7()))
    metadata: dict[str, Any] | None = None
    last_max_tokens: int | None = None
    last_model_request_parameters: models.ModelRequestParameters | None = None
    pending_messages: list[_enqueue.PendingMessage] = dataclasses.field(default_factory=list)
    event_stream_buffer: list[_messages.AgentStreamEvent] = dataclasses.field(default_factory=EventStreamBuffer)
```

图的依赖（`GraphAgentDeps`）承载了所有运行时配置，包括模型、工具管理器、能力系统等：

```python
# _agent_graph.py
@dataclass
class GraphAgentDeps(Generic[DepsT, OutputDataT]):
    """Dependencies/config passed to the agent graph."""
    user_deps: DepsT
    model: models.Model
    model_selector: ModelSelector[DepsT] | None
    end_strategy: EndStrategy
    root_capability: AbstractCapability[DepsT]
    capabilities: dict[str, AbstractCapability[DepsT]]
    loaded_capability_ids: set[str]
    discovered_tool_names: set[str]
    tool_manager: ToolManager[DepsT]
    tracer: Tracer
```

图执行的三个核心节点：

- **UserPromptNode**: 处理用户输入、系统提示、指令，构建 `ModelRequest` 消息
- **ModelRequestNode**: 调用 LLM，获取 `ModelResponse`（支持流式和非流式）
- **CallToolsNode**: 执行工具调用，处理输出验证，决定是否继续循环

---

## 3. 模型抽象层（Model Abstraction）

PydanticAI 的模型抽象分为两层：`AbstractModel` 定义共享身份，`Model` 定义请求-响应接口。

```python
# models/_abstract.py
class AbstractModel(ABC):
    """Shared identity for request-response and realtime models."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """The model name."""
        raise NotImplementedError()

    @property
    @abstractmethod
    def system(self) -> str:
        """The model provider, ex: openai.
        Use to populate the `gen_ai.system` OpenTelemetry semantic convention attribute.
        """
        raise NotImplementedError()

    @property
    def model_id(self) -> str:
        """The fully qualified model name in 'provider:model_name' format."""
        return f'{self.system}:{self.model_name}'

    @property
    def context_window(self) -> int | None:
        """The maximum number of tokens the model can handle at once."""
        return None
```

模型通过 `KnownModelName` 类型别名注册，支持 OpenAI、Anthropic、Google 等主流提供商。请求参数通过 `ModelRequestParameters` 数据类传递：

```python
# models/__init__.py
@dataclass(repr=False, kw_only=True)
class ModelRequestParameters:
    """Configuration for an agent's request to a model, specifically related to tools and output handling."""
    function_tools: list[ToolDefinition] = field(default_factory=list)
    native_tools: list[AbstractNativeTool] = field(default_factory=list)
    tool_visibility: dict[str, ToolVisibility] | None = None
    revealed_tool_names: set[str] = field(default_factory=set, repr=False)
    deferred_capability_ids: set[str] = field(default_factory=set, repr=False)
    output_mode: OutputMode = 'text'
    output_object: OutputObjectDefinition | None = None
    output_tools: list[ToolDefinition] = field(default_factory=list)
    allow_text_output: bool = True
    allow_image_output: bool = False
    instruction_parts: list[InstructionPart] | None = None
    thinking: ThinkingLevel | None = None
```

`ToolVisibility` 枚举了四种工具可见性策略：

```python
ToolVisibility = Literal['visible', 'deferred', 'withheld', 'via_history']
```

- `visible`: 普通工具定义，包含在请求中
- `deferred`: 声明但延迟加载 schema，直到被发现
- `withheld`: 完全不出现在请求中
- `via_history`: 通过对话历史中的工具添加通道传递

---

## 4. 工具系统（Tool System）

PydanticAI 的工具系统是类型驱动的。`Tool` 类从 Python 函数签名自动生成 JSON Schema：

```python
# tools.py
@dataclass(init=False)
class Tool(Generic[ToolAgentDepsT]):
    """A tool function for an agent."""
    function: ToolFuncEither[ToolAgentDepsT]
    takes_ctx: bool
    max_retries: int | None
    name: str
    description: str | None
    prepare: ToolPrepareFunc[ToolAgentDepsT] | None
    args_validator: ArgsValidatorFunc[ToolAgentDepsT, ...] | None
    docstring_format: DocstringFormat
    require_parameter_descriptions: bool
    strict: bool | None
    sequential: bool
    requires_approval: bool
    metadata: dict[str, Any] | None
    timeout: float | None
    defer_loading: bool
    include_return_schema: bool | None
    function_schema: _function_schema.FunctionSchema
```

工具函数有两种形态——带 `RunContext` 和不带：

```python
# tools.py
ToolFuncContext: TypeAlias = Callable[Concatenate[RunContext[AgentDepsT], ToolParams], Any]
"""A tool function that takes RunContext as the first argument."""

ToolFuncPlain: TypeAlias = Callable[ToolParams, Any]
"""A tool function that does not take RunContext as the first argument."""

ToolFuncEither: TypeAlias = ToolFuncContext[AgentDepsT, ToolParams] | ToolFuncPlain[ToolParams]
"""Either kind of tool function."""
```

工具的动态准备机制允许在运行时修改或省略工具：

```python
# tools.py
ToolPrepareFunc: TypeAlias = Callable[
    [RunContext[AgentDepsT], 'ToolDefinition'],
    Union[Awaitable['ToolDefinition | None'], 'ToolDefinition', None],
]
"""Definition of a function that can prepare a tool definition at call time.
Return None to omit this tool from a given step."""
```

---

## 5. 依赖注入（Dependency Injection）

PydanticAI 的依赖注入通过泛型 `AgentDepsT` 和 `RunContext` 实现。`RunContext` 在每次工具调用时注入，携带依赖、模型信息、使用量等：

```python
# tools.py — RunContext 提供运行时上下文
ToolFuncContext: TypeAlias = Callable[Concatenate[RunContext[AgentDepsT], ToolParams], Any]
```

Agent 的 `__init__` 接受 `deps_type` 参数用于类型推断：

```python
# agent/__init__.py — Agent 构造函数中的依赖类型声明
def __init__(
    self,
    model: models.Model | models.KnownModelName | str | None = None,
    *,
    output_type: OutputSpec[OutputDataT] = str,
    instructions: AgentInstructions[AgentDepsT] = None,
    system_prompt: str | Sequence[str] = (),
    deps_type: type[AgentDepsT] = object,
    ...
):
```

这意味着 `Agent[MyDB, MyOutput]` 在编译期就能检查工具函数的依赖类型是否匹配。

---

## 6. 输出类型系统（Output Type System）

PydanticAI 支持多种输出模式，通过 `OutputMode` 和 `OutputSpec` 控制：

```python
# models/__init__.py
output_mode: OutputMode = 'text'
output_object: OutputObjectDefinition | None = None
output_tools: list[ToolDefinition] = field(default_factory=list)
prompted_output_template: str | Literal[False] | None = None
allow_text_output: bool = True
allow_image_output: bool = False
```

输出工具（output_tools）是特殊的工具定义，用于结构化输出。`OutputToolset` 管理这些输出工具。当 `output_type` 是 Pydantic 模型时，框架自动生成一个输出工具，LLM 通过调用该工具返回结构化数据。

`OutputSchema` 负责将 Python 类型转换为 JSON Schema，并在收到 LLM 响应后验证输出。`OutputValidator` 允许添加自定义验证逻辑。

---

## 7. 工具执行引擎（Tool Execution）

工具执行在 `_tool_execution.py` 中实现，支持并行执行、重试、延迟审批等：

```python
# _tool_execution.py — 工具执行核心
from pydantic_ai.tool_manager import ToolManager, ValidatedToolCall
from .tools import DeferredToolRequests, DeferredToolResult, ToolApproved, ToolDenied, ToolKind
```

`EndStrategy` 定义了三种工具执行策略：

```python
# _agent_graph.py
EndStrategy = Literal['early', 'graceful', 'exhaustive']
```

- **`early`**: 输出工具按顺序执行，第一个成功即结束；跳过函数工具
- **`graceful`**（默认）: 按模型发出顺序执行，函数工具在输出工具之前完成；输出工具第一个成功即赢
- **`exhaustive`**: 所有工具并行执行，第一个有效输出按发出顺序成为最终结果

工具还支持延迟审批（`requires_approval`）和参数验证器（`args_validator`）：

```python
# tools.py
ArgsValidatorFunc: TypeAlias = (
    Callable[Concatenate[RunContext[AgentDepsT], ToolParams], Awaitable[None]]
    | Callable[Concatenate[RunContext[AgentDepsT], ToolParams], None]
)
"""A function that validates tool arguments before execution.
Raise ModelRetry to ask the model to correct the arguments and try again,
or ToolFailed to report a terminal failure."""
```

---

## 8. 能力系统（Capabilities）

PydanticAI 的能力系统（Capabilities）是其可扩展性的核心。能力通过 `AbstractCapability` 接口定义，可以在运行时注入工具、修改请求、处理事件：

```python
# agent/__init__.py — 能力在 Agent 中的注册
from ..capabilities import (
    AbstractCapability,
    AgentCapability,
    AgentModel,
    CombinedCapability,
    ModelSelection,
    ModelSelector,
    ToolSearch as ToolSearchCap,
)
```

能力系统支持：
- **延迟加载**（Deferred Capabilities）：按需加载能力，减少初始开销
- **工具搜索**（Tool Search）：能力可以动态发现和注册工具
- **模型选择**（Model Selection）：能力可以在运行时切换模型
- **组合能力**（Combined Capability）：多个能力可以组合成一个

```python
# models/__init__.py — 能力与工具可见性的交互
deferred_capability_ids: set[str] = field(default_factory=set, repr=False)
"""IDs of the run's capabilities that defer their loading.
Used to answer "may this tool be revealed yet?" """
```

---

## 9. 消息系统（Message System）

PydanticAI 使用丰富的消息类型层次结构来表示对话：

```python
# models/__init__.py — 消息类型导入
from ..messages import (
    ModelMessage, ModelRequest, ModelResponse,
    ModelRequestPart, ModelResponsePart,
    SystemPromptPart, UserPromptPart, ToolCallPart, ToolReturnPart,
    TextPart, ThinkingPart, InstructionPart,
    RetryPromptPart, FilePart, FileUrl, BinaryImage,
    CompactionPart, SpeechPart,
    FinalResultEvent, PartStartEvent, PartEndEvent,
    ModelResponseStreamEvent, ModelResponseState,
    FinishReason,
)
```

消息历史在 `GraphAgentState` 中维护，`UserPromptNode` 负责构建和清理：

```python
# _agent_graph.py — 消息历史管理
messages[:] = _clean_message_history(ctx.state.message_history)
ctx.state.message_history = messages
ctx.deps.new_message_index = len(messages)
```

中断的请求会自动修复悬挂的工具调用：

```python
# _agent_graph.py
messages[:] = _repair_dangling_tool_calls(messages, repair_last_response=True)
```

---

## 10. 运行生命周期（Run Lifecycle）

PydanticAI 的运行生命周期通过 `_run_lifecycle_hooks` 管理，支持 `wrap_run` 协作协议：

```python
# agent/__init__.py — 运行生命周期管理
@asynccontextmanager
async def _run_lifecycle_hooks(
    run_capability: AbstractCapability[Any],
    run_ctx: RunContext[Any],
    *,
    build_result: Callable[[], AgentRunResult[Any]],
    finalize: Callable[[AgentRunResult[Any]], Awaitable[None]],
    extract_error: Callable[[BaseException], BaseException] | None = None,
    result_ready: Callable[[], bool] | None = None,
    restore_context_on: AsyncExitStack | None = None,
) -> AsyncGenerator[_RunLifecycle]:
    """Dispatch run hooks around a caller-owned run body."""
```

`wrap_run` 协作协议的六个步骤：

1. `_do_run()` 调用 `before_run`，设置 `_run_ready`，然后等待 `_run_done`
2. `wrap_run` 通过能力中间件链包装 `_do_run`
3. 等待 `_run_ready`（处理开始）或 `_wrap_task` 完成（短路）
4. yield 给调用者执行运行体
5. 调用者完成后设置 `_run_done`
6. `_do_run` 恢复：成功返回结果或重新抛出错误

上下文变量通过 `contextvars` 传播，确保 `wrap_run` 设置的变量在调用者任务中可见：

```python
# agent/__init__.py — 上下文传播
for cv_pair in _wrap_context or ():
    context_tokens.append((cv_pair[0], cv_pair[0].set(cv_pair[1])))

def _restore_context_vars() -> None:
    for var, token in context_tokens:
        var.reset(token)
```

`ModelRequestNode` 同时支持流式和非流式请求，通过 `streaming` 字段区分：

```python
# models/__init__.py
class ModelRequestContext:
    streaming: bool = False
    """Whether the agent loop expects to iterate the model response as a stream.
    Set for streamed runs — run_stream(), run_stream_events(), iter()'s node streaming."""
```

---

## 架构总结

| 维度 | 设计选择 |
|------|----------|
| **执行模型** | 有向图（pydantic-graph），三节点循环 |
| **类型安全** | 泛型 Agent[AgentDepsT, OutputDataT]，全链路 Pydantic 验证 |
| **模型抽象** | AbstractModel + Model 双层，provider:model_name 字符串切换 |
| **工具系统** | 从函数签名自动生成 JSON Schema，支持动态准备和延迟加载 |
| **依赖注入** | RunContext 泛型注入，编译期类型检查 |
| **输出系统** | 多模式（text/tool/native/prompted），自动 JSON Schema 生成 |
| **执行策略** | early/graceful/exhaustive 三种 end_strategy |
| **能力系统** | AbstractCapability 接口，支持延迟加载、动态工具发现 |
| **消息系统** | 丰富的 Part 层次结构，支持流式事件 |
| **生命周期** | wrap_run 协作协议，ContextVar 跨任务传播 |

PydanticAI 的核心竞争力在于：**用 Python 的类型系统做 AI Agent 的编译期保障**。与 LangChain 的"字符串拼接"和 CrewAI 的"角色扮演"不同，PydanticAI 让 IDE 的自动补全和类型检查成为 Agent 开发的第一道防线。
