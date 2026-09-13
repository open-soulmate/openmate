# openai/openai-agents-python — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/openai/openai-agents-python  
> 抓取通道: cdn.jsdelivr.net/gh/openai/openai-agents-python@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent Runner / Guardrail / Handoff / Session / Sandbox 借鉴

---

## 0. 诚实性说明

- 成功拉取: `src/agents/run.py`（完整 Runner + AgentRunner，约 1600 行）、`src/agents/run_config.py`（完整 RunConfig + SandboxRunConfig + 常量）
- 所有常量与代码行为源码实读

---

## 1. 系统架构

### 1.1 定位

OpenAI Agents SDK 是官方 Agent 框架，核心是 **Agent Loop**（模型调用 → 工具执行 → 循环直到 final output），加上 Handoff、Guardrail、Tracing、Session 等生产级特性。

### 1.2 源码布局

| 路径 | 职责 |
|------|------|
| `src/agents/run.py` | Runner / AgentRunner 核心循环 |
| `src/agents/run_config.py` | RunConfig / SandboxRunConfig / 常量 |
| `src/agents/agent.py` | Agent 定义 |
| `src/agents/guardrail.py` | InputGuardrail / OutputGuardrail |
| `src/agents/handoffs.py` | Handoff 机制 |
| `src/agents/items.py` | RunItem / ModelResponse / InputItem |
| `src/agents/memory/` | Session / SessionInputCallback |
| `src/agents/run_context.py` | RunContextWrapper |
| `src/agents/tracing/` | Tracing 基础设施 |
| `src/agents/sandbox/` | Sandbox 运行时 |
| `src/agents/run_internal/` | 内部实现（run_loop / session_persistence / approvals 等） |

---

## 2. 核心常量（源码实读）

```python
DEFAULT_MAX_TURNS = 10
DEFAULT_MAX_MANIFEST_ENTRY_CONCURRENCY = 4
DEFAULT_MAX_LOCAL_DIR_FILE_CONCURRENCY = 4
DEFAULT_MAX_ARCHIVE_INPUT_BYTES = 1024 * 1024 * 1024        # 1 GiB
DEFAULT_MAX_ARCHIVE_EXTRACTED_BYTES = 4 * 1024 * 1024 * 1024 # 4 GiB
DEFAULT_MAX_ARCHIVE_MEMBERS = 100_000
```

Trace 敏感数据默认值：

```python
def _default_trace_include_sensitive_data() -> bool:
    val = os.getenv("OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA", "true")
    return val.strip().lower() in ("1", "true", "yes", "on")
```

---

## 3. Runner — 公开 API 入口

### 3.1 三个入口

```python
class Runner:
    @classmethod
    async def run(cls, starting_agent, input, *, context=None, max_turns=DEFAULT_MAX_TURNS, ...) -> RunResult:
        """异步运行，返回最终结果"""

    @classmethod
    def run_sync(cls, starting_agent, input, ...) -> RunResult:
        """同步包装，不能在已有 event loop 中调用"""

    @classmethod
    def run_streamed(cls, starting_agent, input, ...) -> RunResultStreaming:
        """流式运行，返回可迭代的结果对象"""
```

### 3.2 Agent Loop 语义（docstring 实读）

```
1. Agent 被调用，接收输入
2. 如果有 final output（类型匹配 agent.output_type），循环终止
3. 如果有 handoff，用新 agent 重新运行循环
4. 否则，执行 tool calls，重新运行循环
```

异常情况：
- `max_turns` 超限 → `MaxTurnsExceeded`（可被 error_handlers 处理）
- Guardrail tripwire → `InputGuardrailTripwireTriggered` / `OutputGuardrailTripwireTriggered`
- **只有第一个 agent 的 input guardrails 会被运行**

### 3.3 Error Data Redaction

```python
runner = DEFAULT_AGENT_RUNNER
redacted_error: BaseException | None = None
try:
    return await runner.run(...)
except BaseException as error:
    if not _is_error_data_redacted(error):
        raise
    _detach_data_redacted_error_traceback(error)
    redacted_error = error

# 清理所有局部变量引用
starting_agent = cast(Any, None)
input = cast(Any, None)
...
raise redacted_error from None
```

**设计要点**: 错误数据被 redacted 后，显式清空所有局部变量引用，防止敏感数据通过 traceback 泄露。

---

## 4. AgentRunner — 内部执行引擎

### 4.1 类声明

```python
class AgentRunner:
    """WARNING: this class is experimental and not part of the public API."""
```

### 4.2 run() 方法

```python
async def run(self, starting_agent, input, **kwargs) -> RunResult:
    run_config, owns_model_provider = _normalize_run_config_for_runner(kwargs.get("run_config"))
    try:
        try:
            return await self._run_impl(starting_agent, input, **kwargs)
        except BaseException as error:
            if not _is_error_data_redacted(error):
                raise
            _detach_data_redacted_error_traceback(error)
            redacted_error = error
    finally:
        if owns_model_provider:
            await _close_runner_owned_model_provider(run_config.model_provider)
```

### 4.3 _run_impl() 核心逻辑

```python
async def _run_impl(self, starting_agent, input, **kwargs) -> RunResult:
    # 1. 解析参数
    max_turns = kwargs.get("max_turns", DEFAULT_MAX_TURNS)
    hooks = validate_run_hooks(kwargs.get("hooks"))
    session = kwargs.get("session")
    conversation_id = kwargs.get("conversation_id")

    # 2. 恢复状态检查
    is_resumed_state = isinstance(input, RunState)

    # 3. Session 输入准备
    if server_manages_conversation:
        prepared_input, _ = await prepare_input_with_session(
            raw_input, session, ...,
            include_history_in_prepared_input=False,
            preserve_dropped_new_items=True,
        )
    else:
        (prepared_input, session_input_items_for_persistence) = await prepare_input_with_session(
            raw_input, session, ...,
        )

    # 4. OpenAI server-managed conversation tracker
    if conversation_id or previous_response_id or auto_previous_response_id:
        server_conversation_tracker = OpenAIServerConversationTracker(...)

    # 5. Trace 设置
    with TraceCtxManager(...):
        # 6. RunState 初始化或恢复
        # 7. Sandbox runtime
        # 8. Prompt cache key resolver
        # 9. 主循环
```

---

## 5. RunConfig — 全局运行配置（源码实读）

### 5.1 核心字段

```python
@dataclass
class RunConfig:
    model: str | Model | None = None
    model_provider: ModelProvider = field(default_factory=MultiProvider)
    model_settings: ModelSettings | None = None
    handoff_input_filter: HandoffInputFilter | None = None
    nest_handoff_history: bool = False
    handoff_history_mapper: HandoffHistoryMapper | None = None
    input_guardrails: list[InputGuardrail[Any]] | None = None
    output_guardrails: list[OutputGuardrail[Any]] | None = None
    tracing_disabled: bool = False
    tracing: TracingConfig | None = None
    trace_include_sensitive_data: bool = field(default_factory=_default_trace_include_sensitive_data)
    workflow_name: str = "Agent workflow"
    trace_id: str | None = None
    group_id: str | None = None
    trace_metadata: dict[str, Any] | None = None
    session_input_callback: SessionInputCallback | None = None
    call_model_input_filter: CallModelInputFilter | None = None
    tool_error_formatter: ToolErrorFormatter | None = None
    session_settings: SessionSettings | None = None
    reasoning_item_id_policy: ReasoningItemIdPolicy | None = None
    sandbox: SandboxRunConfig | None = None
    tool_execution: ToolExecutionConfig | None = None
    tool_not_found_behavior: ToolNotFoundBehavior = "raise_error"
    tool_name_collision_policy: ToolNameCollisionPolicy = "warn"
    output_guardrail_blocked_message: str | OutputGuardrailBlockedMessageFormatter | None = None
```

### 5.2 ToolExecutionConfig

```python
@dataclass
class ToolExecutionConfig:
    max_function_tool_concurrency: int | None = None
    """Maximum number of local function tool calls to execute concurrently.
    Set to None to preserve the default behavior, which starts all function tool calls
    emitted in a turn."""

    pre_approval_tool_input_guardrails: bool = False
    """Run function tool input guardrails before emitting a pending approval interruption."""

    def __post_init__(self) -> None:
        if self.max_function_tool_concurrency is not None and (
            self.max_function_tool_concurrency < 1
        ):
            raise ValueError("tool_execution.max_function_tool_concurrency must be at least 1")
```

### 5.3 工具行为策略

```python
ToolNotFoundBehavior = Literal["raise_error", "return_error_to_model"]
ToolNameCollisionPolicy = Literal["warn", "error"]
ReasoningItemIdPolicy = Literal["preserve", "omit"]
```

- `tool_not_found_behavior`: 默认 `"raise_error"`（抛 ModelBehaviorError）；`"return_error_to_model"` 返回模型可见的错误
- `tool_name_collision_policy`: 默认 `"warn"`（记录警告）；`"error"` 在模型调用前抛 UserError

---

## 6. SandboxRunConfig（源码实读）

```python
@dataclass
class SandboxRunConfig:
    client: BaseSandboxClient[Any] | None = None
    options: Any | None = None
    session: BaseSandboxSession | None = None
    session_state: SandboxSessionState | None = None
    manifest: Manifest | None = None
    snapshot: SnapshotSpec | SnapshotBase | None = None
    concurrency_limits: SandboxConcurrencyLimits = field(default_factory=SandboxConcurrencyLimits)
    archive_limits: SandboxArchiveLimits | None = None
    cwd: PurePath | None = None
```

### 6.1 SandboxConcurrencyLimits

```python
@dataclass
class SandboxConcurrencyLimits:
    manifest_entries: int | None = DEFAULT_MAX_MANIFEST_ENTRY_CONCURRENCY  # 4
    local_dir_files: int | None = DEFAULT_MAX_LOCAL_DIR_FILE_CONCURRENCY   # 4
```

### 6.2 SandboxArchiveLimits

```python
@dataclass
class SandboxArchiveLimits:
    max_input_bytes: int | None = DEFAULT_MAX_ARCHIVE_INPUT_BYTES         # 1 GiB
    max_extracted_bytes: int | None = DEFAULT_MAX_ARCHIVE_EXTRACTED_BYTES # 4 GiB
    max_members: int | None = DEFAULT_MAX_ARCHIVE_MEMBERS                 # 100_000
```

---

## 7. run_streamed() — 流式执行

### 7.1 RunState 恢复

```python
if is_resumed_state:
    run_state = cast(RunState[TContext], input)
    (conversation_id, previous_response_id, auto_previous_response_id) = (
        apply_resumed_conversation_settings(run_state=run_state, ...)
    )
    starting_input = run_state._original_input
    max_turns = run_state._max_turns  # 保留原始 max_turns
```

### 7.2 RunResultStreaming 初始化

```python
streamed_result = RunResultStreaming(
    input=copy_input_items(streamed_input),
    new_items=list(run_state._session_items) if run_state is not None else [],
    current_agent=schema_agent,
    raw_responses=run_state._model_responses if run_state is not None else [],
    final_output=None,
    is_complete=False,
    current_turn=run_state._current_turn if run_state is not None else 0,
    max_turns=max_turns,
    input_guardrail_results=(...),
    output_guardrail_results=(...),
    tool_input_guardrail_results=(...),
    tool_output_guardrail_results=(...),
    _current_agent_output_schema=output_schema,
    trace=new_trace,
    context_wrapper=context_wrapper,
    interruptions=[],
    _current_turn_persisted_item_count=(
        run_state._current_turn_persisted_item_count if run_state is not None else 0
    ),
    _original_input=(...),
)
```

### 7.3 后台循环

```python
async def run_loop() -> None:
    await _await_data_redacted_error_boundary(
        lambda: start_streaming(
            starting_input=input_for_result,
            streamed_result=streamed_result,
            starting_agent=starting_agent,
            max_turns=max_turns,
            hooks=hooks,
            context_wrapper=context_wrapper,
            run_config=run_config,
            error_handlers=error_handlers,
            ...
        )
    )

streamed_result.run_loop_task = asyncio.create_task(run_loop())
```

---

## 8. run_sync() — 同步包装

```python
def run_sync(self, starting_agent, input, **kwargs) -> RunResult:
    already_running_loop = ...
    if already_running_loop is not None:
        raise RuntimeError(
            "AgentRunner.run_sync() cannot be called when an event loop is already running."
        )

    policy = asyncio.get_event_loop_policy()
    try:
        default_loop = policy.get_event_loop()
    except RuntimeError:
        default_loop = policy.new_event_loop()
        policy.set_event_loop(default_loop)

    if default_loop.is_closed():
        default_loop = policy.new_event_loop()
        policy.set_event_loop(default_loop)

    # Intentionally leave the default loop open for subsequent runs
    task = default_loop.create_task(self.run(...))

    try:
        return default_loop.run_until_complete(task)
    except BaseException as error:
        if not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                default_loop.run_until_complete(task)
        raise
    finally:
        if not default_loop.is_closed():
            with contextlib.suppress(RuntimeError):
                default_loop.run_until_complete(default_loop.shutdown_asyncgens())
```

**设计要点**: 同步 API 在已有 event loop 中会抛 RuntimeError。循环故意保持打开状态，因为 Session 实例会在调用间缓存 loop-bound 原语。

---

## 9. Guardrail 系统

### 9.1 类型

```python
InputGuardrail = ...   # 输入 guardrail
OutputGuardrail = ...  # 输出 guardrail
ToolInputGuardrailResult = ...  # 工具输入 guardrail 结果
ToolOutputGuardrailResult = ... # 工具输出 guardrail 结果
```

### 9.2 运行时机

- Input guardrails: 只在第一个 agent 上运行
- Output guardrails: 在最终输出上运行
- Tool input guardrails: 可选在 approval 前运行（`pre_approval_tool_input_guardrails`）

### 9.3 被阻止的输出

```python
OutputGuardrailBlockedMessageFormatter = Callable[
    [OutputGuardrailBlockedMessageArgs[Any]], str | None
]
# Keep this formatter synchronous. Awaiting application code at that boundary
# can leave the rejected output reachable through cancellation traceback locals.
```

---

## 10. Session 系统

### 10.1 SessionInputCallback

```python
session_input_callback: SessionInputCallback | None = None
"""Defines how to handle session history when new input is provided.
- None (default): The new input is appended to the session history.
- SessionInputCallback: A custom function that receives the history and new input,
  and returns the desired combined list of items.
"""
```

### 10.2 Server-managed conversation

```python
server_manages_conversation = (
    conversation_id is not None
    or previous_response_id is not None
    or auto_previous_response_id
)
```

当 server 管理对话时：
- `include_history_in_prepared_input=False`
- `preserve_dropped_new_items=True`
- Session 不持久化（`session_persistence_enabled = session is not None and server_conversation_tracker is None`）

---

## 11. Tracing

### 11.1 TraceCtxManager

```python
with TraceCtxManager(
    workflow_name=trace_workflow_name,
    trace_id=trace_id,
    group_id=trace_group_id,
    metadata=trace_metadata,
    tracing=trace_config,
    disabled=run_config.tracing_disabled,
    trace_state=run_state._trace_state if run_state is not None else None,
    reattach_resumed_trace=is_resumed_state,
):
```

### 11.2 敏感数据控制

- `trace_include_sensitive_data`: 默认从环境变量 `OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA` 读取，默认 `true`
- 设置为 `false` 时仍创建 span，但不包含敏感数据

---

## 12. 超时 / 重试 / 限制汇总

| 项 | 默认 | 来源 |
|----|------|------|
| `DEFAULT_MAX_TURNS` | **10** | run_config.py |
| `DEFAULT_MAX_MANIFEST_ENTRY_CONCURRENCY` | **4** | run_config.py |
| `DEFAULT_MAX_LOCAL_DIR_FILE_CONCURRENCY` | **4** | run_config.py |
| `DEFAULT_MAX_ARCHIVE_INPUT_BYTES` | **1 GiB** | run_config.py |
| `DEFAULT_MAX_ARCHIVE_EXTRACTED_BYTES` | **4 GiB** | run_config.py |
| `DEFAULT_MAX_ARCHIVE_MEMBERS` | **100_000** | run_config.py |
| `tool_not_found_behavior` | `"raise_error"` | run_config.py |
| `tool_name_collision_policy` | `"warn"` | run_config.py |
| `trace_include_sensitive_data` | 环境变量，默认 `true` | run_config.py |
| `max_function_tool_concurrency` | None（无限制） | run_config.py |
| `nest_handoff_history` | `False` | run_config.py |

---

## 13. 失败路径

```
max_turns 超限
  → MaxTurnsExceeded（可被 error_handlers 处理）

Input guardrail tripwire
  → InputGuardrailTripwireTriggered

Output guardrail tripwire
  → OutputGuardrailTripwireTriggered

Tool not found + raise_error
  → ModelBehaviorError

Tool not found + return_error_to_model
  → function_call_output error → 模型继续

Tool name collision + error
  → UserError（模型调用前）

run_sync 在已有 event loop 中
  → RuntimeError

Error data redacted
  → 清空所有局部变量 → re-raise redacted_error

Sandbox manifest 并发超限
  → SandboxConcurrencyLimits 校验

Archive 解压超限
  → SandboxArchiveLimits 校验
```

---

## 14. 对 openmate 的可借鉴点

### P0 — Agent Loop 标准模式
- 模型调用 → 工具执行 → 循环直到 final output
- max_turns 上限防止无限循环
- Handoff 机制：agent 间转移控制权

### P0 — Guardrail 分层
- Input / Output / Tool-input / Tool-output 四层
- Tripwire 模式：触发即中断
- 被阻止输出的 formatter 必须同步（防 traceback 泄露）

### P0 — Error Data Redaction
- 敏感错误数据在 re-raise 前清空所有局部变量引用
- 防止通过 traceback 泄露

### P1 — Session 持久化
- SessionInputCallback 控制历史合并策略
- Server-managed conversation 与 client-side session 互斥
- RunState 支持中断恢复

### P1 — Sandbox 隔离
- SandboxRunConfig 独立配置
- 并发限制：manifest_entries=4, local_dir_files=4
- Archive 限制：1GiB 输入 / 4GiB 解压 / 100k 成员

### P2 — Tracing
- TraceCtxManager 管理 trace 生命周期
- 敏感数据开关（环境变量控制）
- workflow_name / trace_id / group_id 三级标识

---

## 15. 源码锚点速查

```
src/agents/run_config.py
  DEFAULT_MAX_TURNS = 10
  DEFAULT_MAX_MANIFEST_ENTRY_CONCURRENCY = 4
  DEFAULT_MAX_LOCAL_DIR_FILE_CONCURRENCY = 4
  DEFAULT_MAX_ARCHIVE_INPUT_BYTES = 1 GiB
  DEFAULT_MAX_ARCHIVE_EXTRACTED_BYTES = 4 GiB
  DEFAULT_MAX_ARCHIVE_MEMBERS = 100_000
  _default_trace_include_sensitive_data()
  class RunConfig
  class ToolExecutionConfig
  class SandboxRunConfig
  class SandboxConcurrencyLimits
  class SandboxArchiveLimits
  ToolNotFoundBehavior = Literal["raise_error", "return_error_to_model"]
  ToolNameCollisionPolicy = Literal["warn", "error"]

src/agents/run.py
  class Runner: run / run_sync / run_streamed
  class AgentRunner: run / _run_impl / run_sync / run_streamed
  _sandbox_memory_rollout_id()
  _sandbox_memory_input()
  DEFAULT_AGENT_RUNNER = AgentRunner()
```

---

## 16. 参考链接

- https://github.com/openai/openai-agents-python
- https://openai.github.io/openai-agents-python/
