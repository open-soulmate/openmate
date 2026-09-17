# 05. OpenAI Agents Python SDK 架构深度分析

> **项目**: [openai/openai-agents-python](https://github.com/openai/openai-agents-python)
> **Stars**: 29.4k | **Forks**: 4.7k | **License**: MIT
> **创建时间**: 2025-03-11 | **Python**: 3.10+
> **定位**: 轻量级、强大的多 Agent 工作流框架，Provider-agnostic（支持 OpenAI Responses/Chat Completions API 及 100+ 其他 LLM）

---

## 目录

1. [核心数据模型：Agent 类设计](#1-核心数据模型agent-类设计)
2. [运行循环：Runner 与 AgentRunner](#2-运行循环runner-与-agentrunner)
3. [工具系统：多态 Tool 联合类型](#3-工具系统多态-tool-联合类型)
4. [FunctionTool：函数到工具的自动转换](#4-functiontool函数到工具的自动转换)
5. [Handoff 机制：Agent 间委托](#5-handoff-机制agent-间委托)
6. [Agent as Tool：Agent 嵌套调用](#6-agent-as-toolagent-嵌套调用)
7. [Guardrail 系统：输入/输出安全检查](#7-guardrail-系统输入输出安全检查)
8. [上下文传播：RunContextWrapper 与泛型](#8-上下文传播runcontextwrapper-与泛型)
9. [MCP 集成：Model Context Protocol 支持](#9-mcp 集成model-context-protocol-支持)
10. [架构哲学与设计模式总结](#10-架构哲学与设计模式总结)

---

## 1. 核心数据模型：Agent 类设计

OpenAI Agents SDK 的核心是一个 `dataclass` 驱动的 Agent 模型。它采用两层继承结构：`AgentBase` 定义共享字段，`Agent` 扩展完整功能。

```python
@dataclass
class AgentBase(Generic[TContext]):
    """Base class for `Agent` and `RealtimeAgent`."""
    name: str
    handoff_description: str | None = None
    tools: list[Tool] = field(default_factory=list)
    mcp_servers: list[MCPServer] = field(default_factory=list)
    mcp_config: MCPConfig = field(default_factory=lambda: MCPConfig())
```

`Agent` 类在 `AgentBase` 之上增加了完整的 Agent 行为配置：

```python
class Agent(AgentBase, Generic[TContext]):
    instructions: (
        str
        | Callable[
            [RunContextWrapper[TContext], Agent[TContext]],
            MaybeAwaitable[str],
        ]
        | None
    ) = None

    prompt: Prompt | DynamicPromptFunction | None = None
    handoffs: list[Agent[Any] | Handoff[TContext, Any]] = field(default_factory=list)
    model: str | Model | None = None
    model_settings: ModelSettings = field(default_factory=get_default_model_settings)
    input_guardrails: list[InputGuardrail[TContext]] = field(default_factory=list)
    output_guardrails: list[OutputGuardrail[TContext]] = field(default_factory=list)
    output_type: type[Any] | AgentOutputSchemaBase | None = None
    hooks: AgentHooks[TContext] | None = None
    tool_use_behavior: (
        Literal["run_llm_again", "stop_on_first_tool"] | StopAtTools | ToolsToFinalOutputFunction
    ) = "run_llm_again"
    reset_tool_choice: bool = True
```

**关键设计特点**：

- **泛型上下文**：`Generic[TContext]` 使 Agent 强类型化，上下文对象会传递给所有工具、handoff、guardrail
- **动态指令**：`instructions` 可以是静态字符串，也可以是 `(context, agent) -> str` 的动态函数
- **工具使用策略**：`tool_use_behavior` 提供四种模式——`run_llm_again`（默认，工具结果送回 LLM）、`stop_on_first_tool`（第一个工具输出即最终结果）、`StopAtTools`（指定工具名列表匹配时停止）、自定义函数
- **运行时校验**：`__post_init__` 中对所有字段做严格的类型校验

---

## 2. 运行循环：Runner 与 AgentRunner

SDK 采用双层 Runner 架构：`Runner` 是面向用户的入口类，`AgentRunner` 是内部实现。

```python
class Runner:
    @classmethod
    async def run(
        cls,
        starting_agent: Agent[TContext],
        input: str | list[TResponseInputItem] | RunState[TContext],
        *,
        context: TContext | None = None,
        max_turns: int | None = DEFAULT_MAX_TURNS,
        hooks: RunHooks[TContext] | None = None,
        run_config: RunConfig | dict[str, Any] | None = None,
        error_handlers: RunErrorHandlers[TContext] | None = None,
        previous_response_id: str | None = None,
        conversation_id: str | None = None,
        session: Session | None = None,
    ) -> RunResult:
        runner = DEFAULT_AGENT_RUNNER
        try:
            return await runner.run(starting_agent, input, **kwargs)
        except BaseException as error:
            if not _is_error_data_redacted(error):
                raise
            _detach_data_redacted_error_traceback(error)
            redacted_error = error
        # ... data redaction safety cleanup ...
        raise redacted_error from None
```

`Runner.run()` 的文档清晰描述了核心循环逻辑：

> 1. Agent 被调用，传入 input
> 2. 如果产生 final output（匹配 `agent.output_type`），循环终止
> 3. 如果发生 handoff，以新 Agent 重新运行循环
> 4. 否则执行 tool calls，重新运行循环

`AgentRunner._run_impl()` 是真正的执行引擎，处理：
- **RunState 管理**：支持从中断状态恢复（`is_resumed_state`）
- **Session 持久化**：与 `Session` 对象集成，自动管理对话历史
- **Server-managed conversation**：支持 `conversation_id`、`previous_response_id` 实现服务端对话管理
- **Tracing 集成**：通过 `TraceCtxManager` 自动跟踪每个 Agent span 和 task span
- **Guardrail 并行执行**：Input guardrails 在第一轮并行运行

```python
while True:
    # Input guardrails (first turn only)
    all_input_guardrails = (
        starting_agent.input_guardrails + (run_config.input_guardrails or [])
        if current_turn == 0 and not resuming_turn
        else []
    )
    sequential_guardrails = [g for g in all_input_guardrails if not g.run_in_parallel]
    parallel_guardrails = [g for g in all_input_guardrails if g.run_in_parallel]
    # ... execute guardrails, then model call, then process next step ...
```

---

## 3. 工具系统：多态 Tool 联合类型

SDK 的工具系统采用 Python 联合类型（Union Type）实现多态，涵盖 12 种工具类型：

```python
Tool = (
    FunctionTool
    | FileSearchTool
    | WebSearchTool
    | ComputerTool[Any]
    | HostedMCPTool
    | CustomTool
    | ShellTool
    | ApplyPatchTool
    | LocalShellTool
    | ImageGenerationTool
    | CodeInterpreterTool
    | ToolSearchTool
    | ProgrammaticToolCallingTool
)
```

每种工具类型都是独立的 `@dataclass`，具有明确的职责边界：

| 工具类型 | 用途 | 特点 |
|---------|------|------|
| `FunctionTool` | Python 函数包装 | 自动 JSON Schema 生成、strict mode |
| `FileSearchTool` | 向量存储搜索 | OpenAI Responses API 托管工具 |
| `WebSearchTool` | 网络搜索 | 支持位置过滤、搜索上下文大小 |
| `ComputerTool` | 计算机操作（屏幕截图/点击） | 泛型 Computer 生命周期管理 |
| `HostedMCPTool` | 远程 MCP 服务器工具 | LLM 自动 list/call，无需本地 round-trip |
| `ShellTool` | Shell 命令执行 | 支持本地/托管容器环境 |
| `ApplyPatchTool` | 文件差异补丁 | 统一 diff 格式的文件变更 |
| `CustomTool` | 自定义执行器 | 完全自定义的工具执行逻辑 |

工具还支持**来源追踪**：

```python
class ToolOriginType(str, Enum):
    FUNCTION = "function"
    MCP = "mcp"
    AGENT_AS_TOOL = "agent_as_tool"

@dataclass(frozen=True)
class ToolOrigin:
    type: ToolOriginType
    mcp_server_name: str | None = None
    agent_name: str | None = None
    agent_tool_name: str | None = None
```

---

## 4. FunctionTool：函数到工具的自动转换

`FunctionTool` 是最核心的工具类型，通过 `@function_tool` 装饰器实现从普通 Python 函数到 LLM 工具的自动转换。

```python
@dataclass
class FunctionTool:
    name: str                                    # LLM 看到的工具名
    description: str                             # 工具描述
    params_json_schema: dict[str, Any]           # JSON Schema
    on_invoke_tool: Callable[[ToolContext[Any], str], Awaitable[Any]]  # 调用入口
    strict_json_schema: bool = True              # 严格 JSON 模式
    is_enabled: bool | Callable[...] = True      # 动态启用/禁用
    tool_input_guardrails: list[ToolInputGuardrail[Any]] | None = None
    tool_output_guardrails: list[ToolOutputGuardrail[Any]] | None = None
    needs_approval: bool | Callable[...] = False  # Human-in-the-loop 审批
    timeout_seconds: float | None = None         # 超时控制
    timeout_behavior: ToolTimeoutBehavior = "error_as_result"
    defer_loading: bool = False                  # Responses API 延迟加载
```

`@function_tool` 装饰器的智能之处在于自动推断：

```python
@function_tool
def get_weather(city: str, unit: str = "celsius") -> str:
    """Get the current weather for a city.

    Args:
        city: The city name to get weather for.
        unit: Temperature unit, either 'celsius' or 'fahrenheit'.
    """
    return f"The weather in {city} is sunny, 25°{unit[0].upper()}"
```

装饰器自动完成：
1. 解析函数签名生成 JSON Schema
2. 从 docstring 提取工具描述和参数描述
3. 自动检测 docstring 风格（Google/NumPy/Sphinx）
4. 如果第一个参数是 `RunContextWrapper`，自动注入运行上下文
5. 包装错误处理：`_FailureHandlingFunctionToolInvoker` 统一处理异常

```python
class _FailureHandlingFunctionToolInvoker:
    async def __call__(self, ctx: ToolContext[Any], input: str) -> Any:
        try:
            return await self._invoke_tool_impl(ctx, input)
        except Exception as e:
            result = await maybe_invoke_function_tool_failure_error_function(
                function_tool=self._function_tool, context=ctx, error=e,
            )
            if result is None:
                raise
            self._on_handled_error(self._function_tool, e, input, ctx)
            return result
```

工具输出支持三种结构化类型：`ToolOutputText`（文本）、`ToolOutputImage`（图片，支持 URL/file_id）、`ToolOutputFileContent`（文件，支持 base64/URL/file_id）。

---

## 5. Handoff 机制：Agent 间委托

Handoff 是 OpenAI Agents SDK 实现多 Agent 协作的核心机制。它将 Agent 委托建模为一个特殊的工具调用。

```python
@dataclass
class Handoff(Generic[TContext, TAgent]):
    tool_name: str                                          # handoff 工具名
    tool_description: str                                   # 工具描述
    input_json_schema: dict[str, Any]                       # 参数 JSON Schema
    on_invoke_handoff: Callable[
        [RunContextWrapper[Any], str], Awaitable[TAgent]    # 返回目标 Agent
    ]
    agent_name: str                                         # 目标 Agent 名
    input_filter: HandoffInputFilter | None = None          # 输入过滤器
    nest_handoff_history: bool | None = None                # 是否嵌套历史
    is_enabled: bool | Callable[...] = True                 # 动态启用/禁用
```

Handoff 的核心数据结构 `HandoffInputData` 封装了传递给目标 Agent 的完整上下文：

```python
@dataclass(frozen=True)
class HandoffInputData:
    input_history: str | tuple[TResponseInputItem, ...]
    """调用 Runner.run() 之前的输入历史"""

    pre_handoff_items: tuple[RunItem, ...]
    """handoff 被触发的 Agent turn 之前生成的 items"""

    new_items: tuple[RunItem, ...]
    """当前 Agent turn 中新生成的 items，包括触发 handoff 的 item"""

    run_context: RunContextWrapper[Any] | None = None
    """handoff 触发时的运行上下文"""
```

**Handoff 的关键特性**：

1. **工具化建模**：每个 Handoff 被序列化为 LLM 可调用的工具，具有 `tool_name`、`tool_description` 和 `input_json_schema`
2. **输入过滤**：`input_filter` 函数可以过滤传递给下一个 Agent 的对话历史（例如移除旧消息或工具相关的输入）
3. **历史嵌套**：`nest_handoff_history` 控制是否将之前的对话历史嵌套到新 Agent 的输入中
4. **动态启用**：`is_enabled` 可以是函数，根据运行时状态动态决定是否允许该 handoff

```python
# Agent 中 handoff 的使用方式
agent = Agent(
    name="Triage Agent",
    instructions="Route to the right department.",
    handoffs=[
        billing_agent,           # 直接传递 Agent 实例
        Handoff(                 # 或显式构建 Handoff
            tool_name="transfer_to_support",
            tool_description="Transfer to support agent",
            input_json_schema={},
            on_invoke_handoff=lambda ctx, _: support_agent,
            agent_name="Support Agent",
        ),
    ],
)
```

---

## 6. Agent as Tool：Agent 嵌套调用

除了 Handoff（Agent 接管对话），SDK 还支持将 Agent 作为工具嵌套调用（原 Agent 继续控制对话）。

```python
def as_tool(
    self,
    tool_name: str | None,
    tool_description: str | None,
    custom_output_extractor: (
        Callable[[RunResult | RunResultStreaming], Awaitable[str]] | None
    ) = None,
    is_enabled: bool | Callable[...] = True,
    on_stream: Callable[[AgentToolStreamEvent], MaybeAwaitable[None]] | None = None,
    run_config: RunConfig | dict[str, Any] | None = None,
    max_turns: int | None = None,
    needs_approval: bool | Callable[...] = False,
    parameters: type[Any] | None = None,
) -> FunctionTool:
```

**Handoff vs as_tool 的关键区别**（源码注释原文）：

> 1. In handoffs, the new agent receives the conversation history. In this tool, the new agent receives generated input.
> 2. In handoffs, the new agent takes over the conversation. In this tool, the new agent is called as a tool, and the conversation is continued by the original agent.

`as_tool` 支持两种输入模式：
- **默认 JSON 输入**：LLM 生成一个 `{"input": "..."}` 的 JSON 字符串
- **结构化输入**：通过 `parameters` 参数指定 dataclass/Pydantic 模型，LLM 生成结构化参数

嵌套 Agent 运行时支持流式事件转发：

```python
class AgentToolStreamEvent(TypedDict):
    event: StreamEvent          # 嵌套 Agent 的流式事件
    agent: Agent[Any]           # 发出事件的 Agent
    tool_call: ResponseFunctionToolCall | None  # 原始 tool call
```

---

## 7. Guardrail 系统：输入/输出安全检查

Guardrail 系统提供可配置的安全检查，分为输入 guardrail 和输出 guardrail。

```python
# Agent 中的配置
input_guardrails: list[InputGuardrail[TContext]] = field(default_factory=list)
output_guardrails: list[OutputGuardrail[TContext]] = field(default_factory=list)
```

**执行时机**：
- **Input Guardrails**：仅在链中第一个 Agent 的第一轮运行，与 Agent 执行并行
- **Output Guardrails**：在 Agent 产生最终输出后运行

```python
# AgentRunner 中的 guardrail 执行逻辑
all_input_guardrails = (
    starting_agent.input_guardrails + (run_config.input_guardrails or [])
    if current_turn == 0 and not resuming_turn
    else []
)
sequential_guardrails = [g for g in all_input_guardrails if not g.run_in_parallel]
parallel_guardrails = [g for g in all_input_guardrails if g.run_in_parallel]
```

Guardrail 支持两种执行模式：
- **顺序执行**（`run_in_parallel=False`）：阻塞式，失败时可阻止后续执行
- **并行执行**（`run_in_parallel=True`）：与 Agent 执行并发，提高效率

此外，`FunctionTool` 级别也有自己的 guardrail：

```python
@dataclass
class FunctionTool:
    tool_input_guardrails: list[ToolInputGuardrail[Any]] | None = None
    """在调用工具之前运行的输入 guardrail"""
    tool_output_guardrails: list[ToolOutputGuardrail[Any]] | None = None
    """在工具调用之后运行的输出 guardrail"""
```

---

## 8. 上下文传播：RunContextWrapper 与泛型

SDK 通过泛型 `TContext` 实现类型安全的上下文传播。上下文是一个可变对象，在整个 Agent 运行过程中传递给所有组件。

```python
TContext = TypeVar("TContext", default=Any)

class RunContextWrapper(Generic[TContext]):
    context: TContext
    """用户创建的上下文对象"""
    usage: Usage
    """token 使用统计"""
```

上下文传播链路：

```
Runner.run(context=user_context)
  → RunContextWrapper(context=user_context)
    → Agent.instructions(ctx, agent) → str
    → FunctionTool.on_invoke_tool(ToolContext, json_str) → Any
    → Handoff.on_invoke_handoff(ctx, json_str) → Agent
    → InputGuardrail.run(ctx, agent, input) → result
    → OutputGuardrail.run(ctx, agent, output) → result
    → AgentHooks.on_start(ctx, agent) → None
```

`ToolContext` 是工具专用的上下文包装器，扩展了 `RunContextWrapper`：

```python
# 三种工具函数签名
ToolFunctionWithoutContext = Callable[ToolParams, Any]
ToolFunctionWithContext = Callable[Concatenate[RunContextWrapper[Any], ToolParams], Any]
ToolFunctionWithToolContext = Callable[Concatenate[ToolContext, ToolParams], Any]
```

如果工具函数的第一个参数是 `RunContextWrapper` 或 `ToolContext`，`@function_tool` 装饰器会自动注入，无需手动传递。

---

## 9. MCP 集成：Model Context Protocol 支持

SDK 深度集成了 Model Context Protocol（MCP），支持两种模式：

### 本地 MCP 服务器

```python
@dataclass
class AgentBase(Generic[TContext]):
    mcp_servers: list[MCPServer] = field(default_factory=list)
    mcp_config: MCPConfig = field(default_factory=lambda: MCPConfig())

class MCPConfig(TypedDict):
    convert_schemas_to_strict: NotRequired[bool]
    """尝试将 MCP schema 转换为 strict mode（尽力而为）"""
    failure_error_function: NotRequired[ToolErrorFunction | None]
    """MCP 工具失败时的错误消息生成函数"""
    include_server_in_tool_names: NotRequired[bool]
    """是否在工具名中包含服务器前缀，避免多 MCP 服务器命名冲突"""
```

### 托管 MCP 服务器

```python
@dataclass
class HostedMCPTool:
    tool_config: Mcp           # MCP 服务器 URL 和配置
    on_approval_request: MCPToolApprovalFunction | None = None
    """审批请求处理函数，LLM 可以自动 list 和 call 工具"""
```

MCP 与 Handoff 的集成通过 `_mcp_handoff_snapshot` 上下文变量实现，确保 MCP 工具的保留名称生成基于一致的 handoff 快照：

```python
_mcp_handoff_snapshot: contextvars.ContextVar[
    tuple[object, tuple[Handoff[Any, Any], ...]] | None
] = contextvars.ContextVar("mcp_handoff_snapshot", default=None)

@contextmanager
def _use_mcp_handoff_snapshot(
    self,
    enabled_handoffs: Sequence[Handoff[Any, Any]],
) -> Iterator[None]:
    token = _mcp_handoff_snapshot.set((self, tuple(enabled_handoffs)))
    try:
        yield
    finally:
        _mcp_handoff_snapshot.reset(token)
```

---

## 10. 架构哲学与设计模式总结

### 核心设计模式

| 模式 | 实现 | 说明 |
|------|------|------|
| **Dataclass-First** | `Agent`, `FunctionTool`, `Handoff`, `RunConfig` 全部是 `@dataclass` | 避免继承爆炸，利用 Python dataclass 的 `__post_init__` 做校验 |
| **Union Type 多态** | `Tool = FunctionTool \| FileSearchTool \| ...` | 12 种工具类型的联合，每种独立 dataclass |
| **泛型上下文** | `Generic[TContext]` 贯穿所有组件 | 编译期类型安全，运行时上下文传播 |
| **装饰器驱动** | `@function_tool` 自动推断 schema | 零样板代码，docstring → 工具描述 |
| **策略模式** | `tool_use_behavior` 四种策略 | `run_llm_again` / `stop_on_first_tool` / `StopAtTools` / 自定义函数 |
| **ContextVar 隔离** | `_mcp_handoff_snapshot` 等 | 并发安全的上下文变量，避免全局状态污染 |

### 与其他框架的对比定位

| 维度 | OpenAI Agents SDK | LangGraph | CrewAI | AutoGen |
|------|-------------------|-----------|--------|---------|
| 抽象层级 | Agent + Tool + Handoff | Graph + Node + Edge | Crew + Agent + Task | Agent + GroupChat |
| 状态管理 | RunState + Session | StateGraph | 无内置 | Conversation |
| 多 Agent | Handoff 委托 | 图边路由 | 顺序/层级 | 群聊对话 |
| 工具系统 | 12 种联合类型 | @tool 装饰器 | @tool 装饰器 | FunctionCall |
| Human-in-the-loop | `needs_approval` 字段 | `interrupt_before` | 无内置 | UserProxy |
| Provider 支持 | OpenAI 优先 + LiteLLM | 多 Provider | 多 Provider | 多 Provider |

### 架构亮点

1. **极简 API**：`Agent` + `Runner` 两个核心类即可构建完整工作流
2. **工具即一等公民**：Handoff 和 Agent-as-Tool 统一建模为工具调用
3. **安全内置**：Guardrail、Approval、Timeout、Error Function 全部内建
4. **Session 管理**：内置对话持久化，支持 `conversation_id` 服务端管理
5. **Tracing 原生**：每个 Agent/Turn/Task 自动创建 span，无需额外配置
6. **Sandbox Agent**：支持容器化长时间运行的 Agent 工作负载
7. **Realtime Agent**：支持语音 Agent（`gpt-realtime-2.1`）

### 局限性

- **OpenAI 倾斜**：部分功能（`prompt` 字段、`FileSearchTool`、`WebSearchTool`、托管 MCP）仅支持 OpenAI Responses API
- **无图编排**：不支持 LangGraph 式的有向图 DAG，多 Agent 协作仅通过 Handoff 链式委托
- **状态恢复复杂**：`RunState` 的 resume 逻辑涉及大量边界情况处理（从 `_run_impl` 的 700+ 行可见）
- **工具类型膨胀**：12 种工具类型的联合类型在模式匹配时需要完整的 `isinstance` 检查链

---

*分析基于 main 分支源码，agent.py (48KB)、run.py (50KB)、tool.py (80KB)、handoffs/__init__.py (15KB)*
