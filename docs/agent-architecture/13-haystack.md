# 13. Haystack 架构深度分析

> **项目**: [deepset-ai/haystack](https://github.com/deepset-ai/haystack)
> **定位**: 开源 AI 编排框架，用于构建生产级 LLM 应用（RAG、Agent、语义搜索、多模态应用）
> **版本**: Haystack 3.0（2024年发布，重大重构版本）
> **许可证**: Apache-2.0
> **分析时间**: 2026-09

---

## 1. 核心架构理念：管道（Pipeline）驱动的组件编排

Haystack 的核心思想是将 AI 应用拆解为**可组合的组件（Component）**，通过**有向无环图（DAG）管道**连接。每个组件有明确的输入/输出接口，管道负责数据流转、调度执行。

### 1.1 Pipeline 调度引擎

Pipeline 是 Haystack 的心脏，负责根据执行图（graph）调度组件运行。核心运行循环采用**优先队列**机制：

```python
# haystack/core/pipeline/pipeline.py - Pipeline.run() 核心循环
while True:
    candidate = self._get_next_runnable_component(priority_queue, component_visits)

    # 如果没有可运行的组件，退出循环
    if candidate is None:
        break

    priority, component_name, component = candidate

    # 如果下一个组件被阻塞，检查管道是否可能被卡住
    if priority == ComponentPriority.BLOCKED:
        if self._is_pipeline_possibly_blocked(current_pipeline_outputs=pipeline_outputs):
            self._find_components_blocking_pipeline(
                priority_queue=priority_queue, component_visits=component_visits, inputs=inputs
            )
        # 总是退出循环，因为无法运行下一个组件
        break

    # 如果下一个组件已经调度，等待任务完成以取得进展
    if component_name in scheduled_components:
        async for partial_outputs in self._wait_for_tasks(
            running_tasks, scheduled_components, return_when=asyncio.FIRST_COMPLETED
        ):
            yield partial_outputs
        continue

    # HIGHEST 优先级组件必须单独运行
    if priority == ComponentPriority.HIGHEST:
        async for partial_outputs in self._run_component_in_isolation(...):
            yield partial_outputs
        continue

    # READY 优先级组件可以并发调度
    if priority == ComponentPriority.READY:
        self._schedule_component(...)
        # 尽可能调度更多 READY 任务
        while len(priority_queue) > 0 and not ready_sem.locked():
            peek_priority, peek_name = priority_queue.peek()
            if peek_priority != ComponentPriority.READY:
                break
```

### 1.2 组件执行模型

每个组件的运行被封装为独立的执行单元，支持同步和异步两种路径：

```python
# haystack/core/pipeline/pipeline.py - _run_component 静态方法
@staticmethod
def _run_component(
    component_name: str,
    component: dict[str, Any],
    inputs: dict[str, Any],
    component_visits: dict[str, int],
    parent_span: tracing.Span | None = None,
    *,
    break_point: Breakpoint | None = None,
) -> Mapping[str, Any]:
    instance: Component = component["instance"]

    with PipelineBase._create_component_span(
        component_name=component_name, instance=instance, inputs=inputs, parent_span=parent_span
    ) as span:
        inputs_copy = _deepcopy_with_exceptions(inputs)
        span.set_content_tag(_COMPONENT_INPUT, inputs)

        try:
            component_output = instance.run(**inputs_copy)
        except PipelineRuntimeError as runtime_error:
            raise runtime_error
        except Exception as error:
            raise PipelineRuntimeError.from_exception(component_name, instance.__class__, error) from error

        component_visits[component_name] += 1

        if not isinstance(component_output, Mapping):
            raise PipelineRuntimeError.from_invalid_output(component_name, instance.__class__, component_output)

        _validate_component_output_keys(component_name, component, component_output)
        return component_output
```

**关键设计**：
- **深拷贝输入**：防止 tracer 修改影响组件实际接收的值
- **访问计数**：`component_visits` 追踪每个组件的执行次数，支持循环图
- **断点支持**：可在组件执行前暂停，实现调试和状态快照
- **Tracing 集成**：自动创建 span，记录输入输出，支持 OpenTelemetry

---

## 2. Agent 组件：基于工具调用的自主代理

Haystack 3.0 引入了全新的 `Agent` 组件，取代了旧版的 `Agent` 实现，采用更清晰的**消息循环 + 工具调用**模式。

### 2.1 Agent 初始化与状态模式

```python
# haystack/components/agents/agent.py - Agent.__init__
@component
class Agent:
    def __init__(
        self,
        *,
        chat_generator: ChatGenerator,
        tools: ToolsType | None = None,
        system_prompt: str | None = None,
        user_prompt: str | None = None,
        exit_conditions: list[str] | None = None,
        state_schema: dict[str, Any] | None = None,
        max_agent_steps: int = 100,
        streaming_callback: StreamingCallbackT | None = None,
        raise_on_tool_invocation_failure: bool = False,
        tool_concurrency_limit: int = 4,
        hooks: dict[HookPoint, list[Hook]] | None = None,
    ) -> None:
        # 验证 chat_generator 是否支持 tools 参数
        self._chat_generator_supports_tools: bool = "tools" in inspect.signature(chat_generator.run).parameters
        if tools is not None and not self._chat_generator_supports_tools:
            raise TypeError(
                f"{type(chat_generator).__name__} does not accept tools parameter in its run method. "
                "The Agent component requires a chat generator that supports tools when tools are provided."
            )
```

**核心参数解读**：
- `chat_generator`：底层 LLM 聊天生成器，必须实现 `ChatGenerator` 协议
- `tools`：工具列表或 Toolset，支持运行时动态传入
- `exit_conditions`：退出条件列表，如 `["text"]` 表示生成纯文本时退出，`["search"]` 表示调用 search 工具后退出
- `state_schema`：自定义状态模式，工具可读写状态
- `hooks`：生命周期钩子，用于注入 guardrails 和自定义逻辑

### 2.2 Agent 运行循环

Agent 的 `run` 方法实现了核心的消息循环：

```python
# haystack/components/agents/agent.py - Agent.run() 核心循环
def run(self, messages: list[ChatMessage], ...) -> dict[str, Any]:
    exe_context = self._initialize_fresh_execution(
        messages=messages,
        streaming_callback=streaming_callback,
        requires_async=False,
        ...
    )

    with self._create_agent_span(tools=exe_context.tools) as span:
        _run_hooks(hooks=self.hooks, hook_point=BEFORE_RUN, state=exe_context.state)
        exe_context.counter = exe_context.state.data.get("step_count", 0)

        while exe_context.counter < self.max_agent_steps:
            if not self._run_step(exe_context=exe_context, agent_span=span):
                break
        else:
            logger.warning("Agent reached maximum agent steps of {max_agent_steps}, stopping.")
            exe_context.state.set("exit_reason", _EXIT_REASON_MAX_STEPS)

        _run_hooks(hooks=self.hooks, hook_point=AFTER_RUN, state=exe_context.state)
        result = _public_outputs(state=exe_context.state)
        if msgs := result.get("messages"):
            result["last_message"] = msgs[-1]
    return result
```

### 2.3 退出原因分类

Agent 定义了多种退出原因，便于下游路由：

```python
# haystack/components/agents/agent.py - 退出原因常量
_EXIT_REASON_TEXT = "text"           # 模型返回完整回复，无工具调用
_EXIT_REASON_LENGTH = "length"       # 模型返回不完整回复（token 限制）
_EXIT_REASON_CONTENT_FILTER = "content_filter"  # 内容过滤
_EXIT_REASON_MAX_STEPS = "max_agent_steps"       # 达到最大步数

# 运行时元数据状态键
_RUN_METADATA_STATE_KEYS: dict[str, dict[str, Any]] = {
    "step_count": {"type": int, "handler": replace_values},
    "token_usage": {"type": dict[str, Any], "handler": replace_values},
    "tool_call_counts": {"type": dict[str, int], "handler": replace_values},
    "exit_reason": {"type": str, "handler": replace_values},
}
```

---

## 3. 工具系统（Tool System）：多层级工具抽象

Haystack 的工具系统设计精巧，提供了从简单函数到复杂管道的多层次工具抽象。

### 3.1 Tool 数据类

`Tool` 是工具系统的核心数据类，使用 JSON Schema 定义参数：

```python
# haystack/tools/tool.py - Tool 数据类
@dataclass
class Tool:
    name: str                              # 工具名称
    description: str                       # 工具描述（LLM 用于决策）
    parameters: dict[str, Any]             # JSON Schema 参数定义
    function: Callable | None = None       # 同步调用函数
    async_function: Callable | None = None # 异步调用函数
    outputs_to_string: dict[str, Any] | None = None  # 输出转字符串配置

    def invoke(self, **kwargs) -> Any:
        """同步调用工具"""
        if self.function is None:
            raise ToolInvocationError("No sync function provided")
        return self.function(**kwargs)

    async def invoke_async(self, **kwargs) -> Any:
        """异步调用工具，无 async_function 时回退到线程池"""
        if self.async_function is not None:
            return await self.async_function(**kwargs)
        if self.function is not None:
            return await asyncio.to_thread(self.function, **kwargs)
        raise ToolInvocationError("No function provided")
```

### 3.2 @tool 装饰器：从函数创建工具

Haystack 提供了 `@tool` 装饰器，通过类型注解自动生成 JSON Schema：

```python
# haystack/tools/from_function.py - create_tool_from_function
def create_tool_from_function(
    function: Callable,
    name: str | None = None,
    description: str | None = None,
    inputs_from_state: dict[str, str] | None = None,
    outputs_to_state: dict[str, dict[str, Any]] | None = None,
    outputs_to_string: dict[str, Any] | None = None,
) -> "Tool":
    """
    从函数创建 Tool 实例。
    
    函数必须包含类型提示。参数的 Annotated 元数据将用作参数描述。
    """
    # 使用 Pydantic 从函数签名生成 JSON Schema
    # ...
```

使用示例：

```python
from haystack.tools import tool
from typing import Annotated, Literal

@tool
def search(query: Annotated[str, "The search query"]) -> str:
    '''Search for information on the web.'''
    return "Search results..."

@tool
def calculator(
    operation: Annotated[Literal["multiply", "percentage"], "The mathematical operation"],
    a: Annotated[float, "First number"],
    b: Annotated[float, "Second number"],
) -> float:
    '''Perform mathematical calculations.'''
    if operation == "multiply":
        return a * b
    elif operation == "percentage":
        return (a / 100) * b
    return 0
```

### 3.3 Toolset：工具集合与动态加载

`Toolset` 是工具的集合，支持静态组合和动态加载：

```python
# haystack/tools/toolset.py - Toolset 数据类
@dataclass
class Toolset:
    """
    相关工具的集合，可作为整体使用和管理。
    
    两个主要用途：
    1. 将相关工具分组在一起
    2. 作为动态工具加载的基类
    """
    tools: list[Tool] = field(default_factory=list)

    def warm_up(self) -> None:
        """预热工具集。子类可重写此方法从外部源加载工具。"""
        pass

    def __iter__(self):
        return iter(self.tools)
```

### 3.4 SearchableToolset：渐进式工具发现

`SearchableToolset` 实现了**渐进式技能发现**，工具描述仅在需要时进入上下文：

```python
# haystack/tools/searchable_toolset.py - SearchableToolset
class SearchableToolset(Toolset):
    """
    支持按需搜索的工具集。
    
    使用 InMemoryDocumentStore 索引工具描述，Agent 可以通过
    search_tools 动态发现相关工具，而不是一次性加载所有工具。
    """
    def __init__(self, catalog, top_k=10, ...):
        self._document_store = InMemoryDocumentStore(shared=False)
        documents = [
            Document(content=f"{tool.name} {tool.description}", meta={"tool_name": tool.name})
            for tool in self._catalog
        ]
        self._document_store.write_documents(documents, policy=DuplicatePolicy.OVERWRITE)
        self._bootstrap_tool = self._create_search_tool()
```

### 3.5 特殊工具类型

Haystack 还提供了多种高级工具类型：

```python
# haystack/tools/__init__.py - 工具系统导出
_import_structure = {
    "toolset": ["Toolset"],                    # 工具集合
    "searchable_toolset": ["SearchableToolset"],# 可搜索工具集
    "skills": ["SkillToolset"],                 # 技能工具集（渐进发现）
    "component_tool": ["ComponentTool"],        # 将组件包装为工具
    "pipeline_tool": ["PipelineTool"],          # 将管道包装为工具
    "agent_tool": ["AgentTool"],                # 将 Agent 包装为工具（嵌套代理）
}
```

---

## 4. 状态管理（State Management）

Agent 的状态管理是 Haystack 3.0 的重要创新，支持工具间的数据共享和持久化。

### 4.1 State 类

```python
# haystack/components/agents/state/state.py - State 类（推断）
class State:
    """
    Agent 的运行时状态。
    
    支持：
    - 类型安全的状态键
    - 合并策略（replace_values, merge_lists 等）
    - 工具通过 inputs_from_state / outputs_to_state 读写状态
    """
    def __init__(self, schema: dict[str, Any], data: dict[str, Any] | None = None):
        self._schema = schema
        self.data = data or {}
    
    def get(self, key: str, default=None):
        return self.data.get(key, default)
    
    def set(self, key: str, value: Any):
        self.data[key] = value
```

### 4.2 状态模式定义

Agent 的状态模式在初始化时解析，包含运行元数据和内部状态：

```python
# haystack/components/agents/agent.py - 状态模式解析
self.resolved_state_schema = dict(self.state_schema)
if self.resolved_state_schema.get("messages") is None:
    self.resolved_state_schema["messages"] = {"type": list[ChatMessage], "handler": merge_lists}

# 添加运行元数据键（只读输出）
for key, config in _RUN_METADATA_STATE_KEYS.items():
    self.resolved_state_schema[key] = dict(config)

# 添加内部状态键（运行控制，不对外暴露）
for key, config in _INTERNAL_STATE_KEYS.items():
    self.resolved_state_schema[key] = dict(config)
```

### 4.3 内部状态键

Agent 内部维护了一组保留状态键，用于运行控制：

```python
# haystack/components/agents/agent.py - 内部状态键
_INTERNAL_STATE_KEYS: dict[str, dict[str, Any]] = {
    "continue_run": {"type": bool, "handler": replace_values},    # 钩子设置为 True 继续运行
    "stop_run": {"type": str, "handler": replace_values},         # 钩子设置为停止
    "tools": {"type": list, "handler": replace_values},           # 当前步骤的工具列表
    "hook_context": {"type": dict[str, Any], "handler": replace_values},  # 请求级资源
    "context_tokens": {"type": int, "handler": replace_values},   # 近似上下文窗口大小
}
```

---

## 5. 生命周期钩子（Hooks）

Haystack 3.0 引入了完整的生命周期钩子系统，支持在 Agent 运行的关键节点注入自定义逻辑。

### 5.1 钩子点定义

```python
# haystack/hooks/protocol.py - 钩子点定义（推断）
VALID_HOOK_POINTS = {
    "before_run",    # 运行开始前（一次）
    "before_llm",    # 每次 LLM 调用前
    "before_tool",   # 工具执行前（模型请求工具调用后）
    "after_tool",    # 工具执行后（结果消息进入状态后）
    "on_exit",       # 即将退出时（可设置 continue_run=True 继续）
    "after_run",     # 运行结束后（一次）
}
```

### 5.2 钩子验证

```python
# haystack/components/agents/agent.py - _validate_hooks
def _validate_hooks(hooks: dict[HookPoint, list[Hook]]) -> None:
    for hook_point, hook_list in hooks.items():
        if hook_point not in VALID_HOOK_POINTS:
            raise ValueError(f"Invalid hook point '{hook_point}'. Valid: {', '.join(VALID_HOOK_POINTS)}")
        for h in hook_list:
            if not callable(getattr(h, "run", None)):
                if callable(h):
                    raise TypeError(
                        f"Hook registered for '{hook_point}' is callable but is not a Hook object. "
                        "If it is a function, wrap it with the @hook decorator."
                    )
                raise TypeError(f"Hook for '{hook_point}' must have a callable 'run(state)'")
            # 检查钩子的 allowed_hook_points 限制
            allowed_points = getattr(h, "allowed_hook_points", None)
            if allowed_points is not None and hook_point not in allowed_points:
                raise ValueError(f"Hook '{type(h).__name__}' only supports: {', '.join(allowed_points)}")
```

### 5.3 钩子使用示例

```python
from haystack.hooks import hook
from haystack.components.agents.state import State

@hook
def require_save(state: State) -> None:
    """on_exit 钩子：要求 Agent 在退出前必须调用 save_result 工具"""
    if state.get("tool_call_counts", {}).get("save_result", 0) == 0:
        state.set("messages", [ChatMessage.from_system("Call `save_result` before finishing.")])
        state.set("continue_run", True)  # 继续运行而不是退出

agent = Agent(
    chat_generator=OpenAIChatGenerator(),
    tools=[save_result],
    hooks={"on_exit": [require_save]},
)
```

---

## 6. 流式处理（Streaming）

Haystack 3.0 原生支持流式处理，Pipeline 和 Agent 都支持流式输出。

### 6.1 PipelineStreamHandle

```python
# haystack/core/pipeline/pipeline.py - PipelineStreamHandle
class PipelineStreamHandle:
    """
    Pipeline.stream() 返回的句柄。
    
    异步可迭代的 StreamingChunk 流。迭代结束后，result 持有最终管道输出。
    默认行为：如果消费者放弃迭代，底层管道任务被取消。
    """
    _END_OF_STREAM: ClassVar[_EndOfStream] = _EndOfStream()
    _CLEANUP_TIMEOUT_SECONDS: ClassVar[float] = 1.0

    def __init__(self, queue, task, cancel_on_abandon=True):
        self._queue = queue
        self._task = task
        self._cancel_on_abandon = cancel_on_abandon

    async def __aiter__(self) -> AsyncIterator[StreamingChunk]:
        try:
            while True:
                item = await self._queue.get()
                if item is self._END_OF_STREAM:
                    await self._task  # 等待任务完成以暴露异常
                    return
                yield cast(StreamingChunk, item)
        finally:
            if self._cancel_on_abandon:
                await self.aclose()

    @property
    def result(self) -> dict[str, Any]:
        """最终管道输出，仅在完整运行后可用"""
        if not self._task.done():
            raise RuntimeError("Pipeline has not finished; iterate the handle first.")
        if self._task.cancelled():
            raise RuntimeError("Pipeline was cancelled; no result available.")
        exc = self._task.exception()
        if exc is not None:
            raise exc
        return self._task.result()
```

### 6.2 并发工具执行

Agent 支持并发工具调用，通过 `tool_concurrency_limit` 控制：

```python
# haystack/components/agents/agent.py - 工具并发配置
tool_concurrency_limit: int = 4,  # 默认并发 4 个工具调用
tool_streaming_callback_passthrough: bool = False,  # 是否将流式回调传递给工具
```

---

## 7. 异步原生支持（Async-First）

Haystack 3.0 的一个重大改进是**原生异步支持**，同一个 Pipeline 可以同步或异步运行。

### 7.1 异步组件执行

```python
# haystack/core/pipeline/pipeline.py - _run_component_async
@staticmethod
async def _run_component_async(
    component_name: str,
    component: dict[str, Any],
    component_inputs: dict[str, Any],
    component_visits: dict[str, int],
    parent_span: tracing.Span | None = None,
    *,
    break_point: Breakpoint | None = None,
) -> Mapping[str, Any]:
    instance: Component = component["instance"]

    with PipelineBase._create_component_span(...) as span:
        component_inputs_copy = _deepcopy_with_exceptions(component_inputs)

        try:
            # 对于仅同步组件，通过 asyncio.to_thread 调度到线程池
            # 这会复制当前 contextvars 上下文，保留活跃的 tracing span
            outputs = await _execute_component_async(instance, **component_inputs_copy)
        except Exception as error:
            raise PipelineRuntimeError.from_exception(component_name, instance.__class__, error) from error

        component_visits[component_name] += 1
        return outputs
```

### 7.2 任务取消与清理

```python
# haystack/core/pipeline/pipeline.py - _cancel_in_flight_tasks
@staticmethod
async def _cancel_in_flight_tasks(running_tasks, scheduled_components) -> None:
    """
    取消所有进行中的任务并等待取消完成。
    
    注意：取消仅对原生异步组件有效。同步组件通过 asyncio.to_thread
    调度到线程，运行中的线程无法中断：取消任务会放弃 await，但线程
    会继续运行直到组件的 run() 返回。
    """
    for task in running_tasks:
        task.cancel()
    # return_exceptions=True 防止失败或取消的兄弟任务掩盖原始错误
    await asyncio.gather(*running_tasks.keys(), return_exceptions=True)
    for component_name in running_tasks.values():
        scheduled_components.discard(component_name)
    running_tasks.clear()
```

---

## 8. 断点与快照（Breakpoints & Snapshots）

Haystack 3.0 引入了断点机制，支持暂停管道执行、保存状态快照、恢复执行。

### 8.1 断点触发

```python
# haystack/core/pipeline/pipeline.py - 断点检查
if (
    isinstance(break_point, Breakpoint)
    and break_point.component_name == component_name
    and break_point.visit_count == component_visits[component_name]
):
    raise BreakpointException.from_triggered_breakpoint(break_point=break_point)
```

### 8.2 快照保存与恢复

```python
# haystack/core/pipeline/pipeline.py - 快照创建
pipeline_snapshot = _create_pipeline_snapshot(
    inputs=_deepcopy_with_exceptions(inputs),
    component_inputs=_deepcopy_with_exceptions(component_inputs_before_consume),
    break_point=saved_break_point,
    component_visits=component_visits,
    original_input_data=data,
    ordered_component_names=ordered_component_names,
    include_outputs_from=include_outputs_from,
    pipeline_outputs=pipeline_outputs,
)

# 附加到异常
error.pipeline_snapshot = pipeline_snapshot
full_file_path = _save_pipeline_snapshot(
    pipeline_snapshot=pipeline_snapshot,
    raise_on_failure=isinstance(error, BreakpointException),
    snapshot_callback=snapshot_callback,
)
error.pipeline_snapshot_file_path = full_file_path
```

### 8.3 从快照恢复

```python
# haystack/core/pipeline/pipeline.py - 快照恢复
if pipeline_snapshot:
    _validate_pipeline_snapshot_against_pipeline(pipeline_snapshot, self.graph)
    component_visits = pipeline_snapshot.pipeline_state.component_visits
    ordered_component_names = pipeline_snapshot.ordered_component_names
    data = _deserialize_value_with_schema(pipeline_snapshot.original_input_data)
    
    if pipeline_snapshot.pipeline_state.inputs_format == INTERNAL_INPUTS_FORMAT:
        inputs = _deserialize_value_with_schema(pipeline_snapshot.pipeline_state.inputs)
    else:
        # 旧版快照丢失了发送者信息，作为外部输入处理
        inputs = self._convert_to_internal_format(...)
        legacy_resume_component = pipeline_snapshot.break_point.component_name
```

---

## 9. Tracing 与可观测性

Haystack 深度集成了 OpenTelemetry tracing，支持端到端的执行追踪。

### 9.1 管道级 Tracing

```python
# haystack/core/pipeline/pipeline.py - 管道追踪
with tracing.tracer.trace(
    "haystack.pipeline.run",
    tags={
        "haystack.pipeline.input_data": data,
        "haystack.pipeline.metadata": self.metadata,
        "haystack.pipeline.max_runs_per_component": self._max_runs_per_component,
        "haystack.pipeline.execution_mode": "sync",
    },
) as span:
    # ... 执行循环 ...
    span.set_content_tag("haystack.pipeline.output_data", pipeline_outputs)
```

### 9.2 Agent 级 Tracing

```python
# haystack/components/agents/agent.py - Agent 追踪
def _create_agent_span(self, tools: ToolsType) -> Any:
    parent_span = tracing.tracer.current_span()
    return tracing.tracer.trace(
        "haystack.agent.run",
        tags={
            "haystack.agent.max_steps": self.max_agent_steps,
            "haystack.agent.tools": tools,
            "haystack.agent.exit_conditions": self.exit_conditions,
            "haystack.agent.state_schema": _schema_to_dict(self.resolved_state_schema),
        },
        parent_span=parent_span,
    )
```

### 9.3 工具级 Tracing

```python
# haystack/components/agents/tool_calling.py - 工具追踪
def _create_tool_span(tool, tool_call, parent_span):
    return tracing.tracer.trace(
        "haystack.agent.step.tool",
        tags={"haystack.tool.name": tool_call.tool_name, "haystack.tool.description": tool.description},
        parent_span=parent_span,
    )
```

---

## 10. 生态集成与扩展性

### 10.1 模型无关设计

Haystack 支持多种 LLM 提供商，通过统一的 `ChatGenerator` 协议抽象：

- OpenAI / Azure OpenAI
- Anthropic (Claude)
- Google (Gemini)
- Mistral / Cohere
- Hugging Face
- AWS Bedrock
- 本地模型（llama.cpp、Ollama 等）

### 10.2 组件扩展模式

Haystack 提供了多种扩展模式：

```python
# 1. ComponentTool：将 Haystack 组件包装为工具
from haystack.tools import ComponentTool

# 2. PipelineTool：将整个管道包装为工具
from haystack.tools import PipelineTool

# 3. AgentTool：将 Agent 包装为工具（嵌套代理）
from haystack.tools import AgentTool

# 4. Toolset 子类：动态加载工具
class RemoteServiceToolset(Toolset):
    def __init__(self, endpoint: str):
        self.endpoint = endpoint
        self._client = None
        super().__init__(tools=[])  # warm_up() 时加载

    def warm_up(self) -> None:
        if self._client is not None:
            return
        self._client = connect(self.endpoint)
        self.tools = self._client.fetch_tools()

    def to_dict(self):
        return {"type": generate_qualified_class_name(type(self)), "data": {"endpoint": self.endpoint}}
```

### 10.3 部署集成

Haystack 通过 **Hayhooks** 支持将管道部署为：
- REST API 服务
- MCP（Model Context Protocol）服务器
- OpenAI 兼容的 Chat Completion 端点

---

## 架构对比：Haystack vs 其他框架

| 维度 | Haystack | LangChain | AutoGen |
|------|----------|-----------|---------|
| **核心抽象** | Pipeline (DAG) + Component | Chain + Agent | Conversation + Agent |
| **工具系统** | JSON Schema + Toolset | Function Calling | Function Calling |
| **状态管理** | 显式 State + Schema | 隐式 Memory | 对话历史 |
| **钩子系统** | 6 个生命周期钩子 | Callbacks | 事件驱动 |
| **断点调试** | 原生支持（快照） | 有限 | 有限 |
| **流式处理** | 原生 AsyncIterator | 回调 | 回调 |
| **Tracing** | OpenTelemetry 深度集成 | LangSmith | 有限 |
| **并发工具** | 原生支持（信号量） | 有限 | 支持 |

---

## 总结

Haystack 3.0 的架构设计体现了以下核心理念：

1. **显式优于隐式**：所有数据流、状态变更、组件连接都是显式定义的
2. **生产就绪**：断点调试、Tracing、流式处理、异步支持都是生产级实现
3. **渐进式复杂度**：从简单 `@tool` 装饰器到完整 Pipeline，按需选择抽象层级
4. **可扩展性**：Toolset 子类、ComponentTool、PipelineTool、AgentTool 提供了丰富的扩展点
5. **上下文工程**：SearchableToolset 的渐进式工具发现、State 的显式管理，体现了对上下文窗口的精细控制

Haystack 适合需要**精细控制数据流**、**生产级可观测性**、**复杂工具编排**的场景，尤其是企业级 RAG 和多步骤 Agent 应用。
