# google/adk-python — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/google/adk-python  
> 抓取通道: cdn.jsdelivr.net/gh/google/adk-python@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent 树 / Callback 管道 / Plugin 系统 / 状态管理 借鉴

---

## 0. 诚实性说明

- 成功拉取: `src/google/adk/agents/base_agent.py`（完整 BaseAgent，约 700 行）
- 所有常量与代码行为源码实读

---

## 1. 系统架构

### 1.1 定位

Google ADK（Agent Development Kit）是 Google 的 Agent 开发框架，核心是 **Agent 树**（父子层级）+ **Callback 管道**（before/after/error）+ **Plugin 系统** + **Invocation Context** 传递。

### 1.2 源码布局

| 路径 | 职责 |
|------|------|
| `src/google/adk/agents/base_agent.py` | BaseAgent 基类 |
| `src/google/adk/agents/callback_context.py` | CallbackContext |
| `src/google/adk/agents/invocation_context.py` | InvocationContext |
| `src/google/adk/agents/context.py` | Context |
| `src/google/adk/agents/base_agent_config.py` | BaseAgentConfig |
| `src/google/adk/events/event.py` | Event |
| `src/google/adk/events/event_actions.py` | EventActions |
| `src/google/adk/features/` | FeatureName / experimental |
| `src/google/adk/telemetry/` | _instrumentation |
| `src/google/adk/utils/_callback_pipeline.py` | _normalize_callbacks / _run_callbacks / _stop_on_truthy |
| `src/google/adk/workflow/` | BaseNode |

---

## 2. BaseAgent — 核心基类（源码实读）

### 2.1 类声明

```python
class BaseAgent(BaseNode, abc.ABC):
    """Base class for all agents in Agent Development Kit."""

    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        extra='forbid',
    )
```

### 2.2 核心字段

```python
name: str
"""Agent name must be a Python identifier and unique within the agent tree.
Agent name cannot be "user", since it's reserved for end-user's input."""

description: str = ''
"""Description about the agent's capability.
The model uses this to determine whether to delegate control to the agent."""

parent_agent: Optional[BaseAgent] = Field(default=None, init=False, exclude=True)
"""Note that an agent can ONLY be added as sub-agent once."""

sub_agents: list[BaseAgent] = Field(default_factory=list)

before_agent_callback: Optional[BeforeAgentCallback] = None
after_agent_callback: Optional[AfterAgentCallback] = None
```

### 2.3 名称校验

```python
@field_validator('name', mode='after')
@classmethod
def validate_name(cls, value: str) -> str:
    if not value.isidentifier():
        raise ValueError(
            f'Found invalid agent name: `{value}`.'
            ' Agent name must be a valid identifier.'
        )
    if value == 'user':
        raise ValueError(
            "Agent name cannot be `user`. `user` is reserved for end-user's input."
        )
    return value
```

### 2.4 Sub-agent 唯一性校验

```python
@field_validator('sub_agents', mode='after')
@classmethod
def validate_sub_agents_unique_names(cls, value: list[BaseAgent]) -> list[BaseAgent]:
    seen_names: set[str] = set()
    duplicates: set[str] = set()
    for sub_agent in value:
        name = sub_agent.name
        if name in seen_names:
            duplicates.add(name)
        else:
            seen_names.add(name)
    if duplicates:
        duplicate_names_str = ', '.join(f'`{name}`' for name in sorted(duplicates))
        logger.warning(
            'Found duplicate sub-agent names: %s. '
            'All sub-agents must have unique names.',
            duplicate_names_str,
        )
    return value
```

**设计要点**: 重复名称只警告不报错（与 name 校验不同）。

### 2.5 Parent Agent 绑定

```python
def __set_parent_agent_for_sub_agents(self) -> BaseAgent:
    for sub_agent in self.sub_agents:
        if sub_agent.parent_agent is not None:
            raise ValueError(
                f'Agent `{sub_agent.name}` already has a parent agent, current'
                f' parent: `{sub_agent.parent_agent.name}`, trying to add:'
                f' `{self.name}`'
            )
        sub_agent.parent_agent = self
    return self
```

---

## 3. Callback 系统（源码实读）

### 3.1 类型定义

```python
_SingleAgentCallback: TypeAlias = Callable[
    [CallbackContext],
    Union[Awaitable[Optional[types.Content]], Optional[types.Content]],
]

BeforeAgentCallback: TypeAlias = Union[
    _SingleAgentCallback,
    list[_SingleAgentCallback],
]

AfterAgentCallback: TypeAlias = Union[
    _SingleAgentCallback,
    list[_SingleAgentCallback],
]
```

### 3.2 Callback 归一化

```python
@property
def canonical_before_agent_callbacks(self) -> list[_SingleAgentCallback]:
    return _normalize_callbacks(self.before_agent_callback)

@property
def canonical_after_agent_callbacks(self) -> list[_SingleAgentCallback]:
    return _normalize_callbacks(self.after_agent_callback)
```

### 3.3 Before Agent Callback 处理

```python
async def _handle_before_agent_callback(self, ctx: InvocationContext) -> Optional[Event]:
    callback_context = CallbackContext(ctx)

    # 1. 先运行 plugin callbacks
    before_agent_callback_content = (
        await ctx.plugin_manager.run_before_agent_callback(
            agent=self, callback_context=callback_context
        )
    )

    # 2. 如果 plugin 没有覆盖，运行 canonical callbacks
    callbacks = self.canonical_before_agent_callbacks
    if not before_agent_callback_content and callbacks:
        before_agent_callback_content = await _run_callbacks(
            callbacks,
            _stop_on_truthy,
            callback_context=callback_context,
        )

    # 3. 处理覆盖内容
    if before_agent_callback_content:
        ret_event = Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            branch=ctx.branch,
            content=before_agent_callback_content,
            actions=callback_context._event_actions,
        )
        ctx.end_invocation = True  # 跳过 agent 运行
        return ret_event

    # 4. 处理状态变更
    if callback_context.state.has_delta():
        return Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            branch=ctx.branch,
            actions=callback_context._event_actions,
        )
    return None
```

**设计要点**:
- Plugin callbacks 优先于 canonical callbacks
- `_stop_on_truthy`: 第一个返回 truthy 的 callback 停止后续执行
- 返回 truthy content 时设置 `ctx.end_invocation = True`，跳过 agent 运行

### 3.4 After Agent Callback 处理

与 before 类似，但**不设置** `ctx.end_invocation = True`（agent 已经运行完毕）。

### 3.5 Error Callback

```python
async def _handle_agent_error_callback(
    self, invocation_context: InvocationContext, error: Exception
) -> None:
    """This is notification-only and best-effort: the triggering exception is
    always re-raised by the caller, and any exception from the callback itself
    is logged and suppressed so it can never mask the original error."""
    callback_context = CallbackContext(invocation_context)
    try:
        await invocation_context.plugin_manager.run_on_agent_error_callback(
            agent=self, callback_context=callback_context, error=error,
        )
    except Exception:
        logger.exception(
            'on_agent_error_callback raised; suppressing so the original agent error propagates.'
        )
```

**设计要点**: Error callback 是通知性的，异常被 suppress，原始错误总是 re-raise。

---

## 4. run_async() — 主执行入口（源码实读）

```python
async def run_async(self, parent_context: InvocationContext) -> AsyncGenerator[Event, None]:
    caller_ctx = context.get_current()

    async def _run() -> AsyncGenerator[Event, None]:
        ctx = self._create_invocation_context(parent_context)
        async with _instrumentation.record_agent_invocation(ctx, self):
            before_callback_completed = False
            after_callback_called = False
            try:
                event = await self._handle_before_agent_callback(ctx)
                before_callback_completed = True
                if event:
                    yield event
                if ctx.end_invocation:
                    return

                async with Aclosing(self._run_async_impl(ctx)) as agen:
                    async for event in agen:
                        yield event

                if ctx.end_invocation:
                    return

                after_callback_called = True
                if event := await self._handle_after_agent_callback(ctx):
                    yield event
            except asyncio.CancelledError:
                if (before_callback_completed and not after_callback_called
                        and not ctx.end_invocation):
                    try:
                        await self._handle_after_agent_callback(ctx)
                    except asyncio.CancelledError:
                        raise
                    except Exception:
                        logger.exception(
                            'after_agent_callback raised on cancellation;'
                            ' suppressing so original cancellation propagates.'
                        )
                raise
            except Exception as e:
                await self._handle_agent_error_callback(ctx, e)
                raise

    async with Aclosing(_with_caller_context(_run(), caller_ctx)) as agen:
        async for event in agen:
            yield event
```

**关键设计**:
- **Cancellation 时仍运行 after_agent_callback**（如果 before 已完成且 after 未调用）
- **Caller context 传播**: `_with_caller_context()` 在每个 yield 前后 attach/detach OpenTelemetry context
- **Error callback**: 所有异常都触发 `_handle_agent_error_callback`

---

## 5. run_live() — 实时对话入口

```python
@final
async def run_live(self, parent_context: InvocationContext) -> AsyncGenerator[Event, None]:
    """Entry method to run an agent via video/audio-based conversation."""
```

与 `run_async()` 结构完全相同，只是调用 `_run_live_impl()` 而非 `_run_async_impl()`。标记为 `@final`，子类不能覆盖。

---

## 6. Agent 树导航

### 6.1 Root Agent

```python
@property
def root_agent(self) -> BaseAgent:
    root_agent = self
    while root_agent.parent_agent is not None:
        root_agent = root_agent.parent_agent
    return root_agent
```

### 6.2 查找 Agent

```python
def find_agent(self, name: str) -> Optional[BaseAgent]:
    if self.name == name:
        return self
    return self.find_sub_agent(name)

def find_sub_agent(self, name: str) -> Optional[BaseAgent]:
    for sub_agent in self.sub_agents:
        if result := sub_agent.find_agent(name):
            return result
    return None
```

### 6.3 Clone

```python
def clone(self: SelfAgent, update: Mapping[str, Any] | None = None) -> SelfAgent:
    if update is not None and 'parent_agent' in update:
        raise ValueError('Cannot update `parent_agent` field in clone.')

    allowed_fields = set(self.__class__.model_fields)
    if update is not None:
        invalid_fields = set(update) - allowed_fields
        if invalid_fields:
            raise ValueError(f'Cannot update nonexistent fields...')

    cloned_agent = self.model_copy(update=update)

    # Rebind callbacks that are methods of this agent
    def _rebind(value: object) -> object:
        if inspect.ismethod(value) and value.__self__ is self:
            return value.__func__.__get__(cloned_agent)
        return value

    # Shallow copy list fields
    for field_name in cloned_agent.__class__.model_fields:
        if field_name == 'sub_agents':
            continue
        if update is not None and field_name in update:
            continue
        field = getattr(cloned_agent, field_name)
        if isinstance(field, list):
            setattr(cloned_agent, field_name, [_rebind(item) for item in field])
        elif inspect.ismethod(field):
            setattr(cloned_agent, field_name, _rebind(field))

    # 递归 clone sub_agents
    if update is None or 'sub_agents' not in update:
        cloned_agent.sub_agents = []
        for sub_agent in self.sub_agents:
            cloned_sub_agent = sub_agent.clone()
            cloned_sub_agent.parent_agent = cloned_agent
            cloned_agent.sub_agents.append(cloned_sub_agent)
    else:
        for sub_agent in cloned_agent.sub_agents:
            sub_agent.parent_agent = cloned_agent

    cloned_agent.parent_agent = None
    return cloned_agent
```

**设计要点**:
- Agent 自身方法作为 callback 时被 rebind 到 clone
- List 字段浅拷贝（防共享）
- sub_agents 递归 clone
- clone 的 parent_agent 置 None

---

## 7. Agent State 系统

```python
@experimental(FeatureName.AGENT_STATE)
class BaseAgentState(BaseModel):
    model_config = ConfigDict(extra='forbid')

AgentState = TypeVar('AgentState', bound=BaseAgentState)

def _load_agent_state(self, ctx: InvocationContext, state_type: Type[AgentState]) -> Optional[AgentState]:
    if ctx.agent_states is None or self.name not in ctx.agent_states:
        return None
    else:
        return state_type.model_validate(ctx.agent_states.get(self.name))

def _create_agent_state_event(self, ctx: InvocationContext) -> Event:
    event_actions = EventActions()
    if (agent_state := ctx.agent_states.get(self.name)) is not None:
        event_actions.agent_state = agent_state
    if ctx.end_of_agents.get(self.name):
        event_actions.end_of_agent = True
    return Event(
        invocation_id=ctx.invocation_id,
        author=self.name,
        branch=ctx.branch,
        actions=event_actions,
    )
```

---

## 8. Node 接口

```python
@override
async def _run_impl(self, *, ctx: Context, node_input: Any) -> AsyncGenerator[Any, None]:
    """Runs the agent as a node."""
    async for event in self.run_async(parent_context=ctx.get_invocation_context()):
        if event.author:
            ctx.event_author = event.author
        if not event.node_info.path and event.author == self.name:
            event.node_info.path = ctx.node_path
        yield event
```

---

## 9. Config 系统（已废弃路径）

```python
@classmethod
@deprecated('BaseAgent.from_config is deprecated...')
@experimental(FeatureName.AGENT_CONFIG)
def from_config(cls, config, config_abs_path) -> SelfAgent:
    from .config_agent_utils import _AgentConfigMapper
    mapper = _AgentConfigMapper(config_abs_path)
    kwargs = mapper.map(data, cls)
    if getattr(cls, '_parse_config', None) is not None:
        kwargs = cls._parse_config(config, config_abs_path, kwargs)
    return cls(**kwargs)
```

---

## 10. OpenTelemetry Context 传播

```python
async def _with_caller_context(
    agen: AsyncGenerator[_T, None],
    caller_ctx: context.Context,
) -> AsyncGenerator[_T, None]:
    """Wraps an async generator to attach caller_ctx around each yield."""
    async with Aclosing(agen) as a:
        async for item in a:
            token = context.attach(caller_ctx)
            try:
                yield item
            finally:
                context.detach(token)
```

**设计要点**: 每次 yield 前 attach caller context，yield 后 detach。确保下游消费者看到正确的 OTel context。

---

## 11. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| name 校验 | Python identifier，不能是 "user" | base_agent.py validate_name |
| sub_agents 重复名 | 警告（不报错） | base_agent.py validate_sub_agents_unique_names |
| parent_agent 唯一 | 一个 agent 只能是一个 agent 的 sub_agent | __set_parent_agent_for_sub_agents |
| before callback 返回 truthy | 跳过 agent 运行，设 end_invocation=True | _handle_before_agent_callback |
| after callback 返回 truthy | 生成额外 event，不跳过 | _handle_after_agent_callback |
| error callback 异常 | suppress，原始错误 re-raise | _handle_agent_error_callback |
| Cancellation 时 | 仍运行 after_agent_callback | run_async |
| clone 时 parent_agent | 置 None | clone() |
| run_live | @final，子类不能覆盖 | run_live |

---

## 12. 失败路径

```
Agent name 不是 Python identifier
  → ValueError("Found invalid agent name...")

Agent name 是 "user"
  → ValueError("Agent name cannot be `user`...")

Sub-agent 已有 parent
  → ValueError("Agent `{name}` already has a parent agent...")

clone 时更新 parent_agent
  → ValueError("Cannot update `parent_agent` field in clone.")

clone 时更新不存在的字段
  → ValueError("Cannot update nonexistent fields...")

_run_async_impl 未实现
  → NotImplementedError

before callback 返回 truthy
  → ctx.end_invocation = True → 跳过 agent

Cancellation during agent run
  → 运行 after_agent_callback（best-effort）→ re-raise CancelledError

Error during agent run
  → _handle_agent_error_callback（suppress 回调异常）→ re-raise 原始错误
```

---

## 13. 对 openmate 的可借鉴点

### P0 — Agent 树模型
- 父子层级：parent_agent / sub_agents
- 名称唯一性校验（identifier + 不能是 "user"）
- 树导航：root_agent / find_agent / find_sub_agent

### P0 — Callback 管道
- before / after / error 三层
- Plugin callbacks 优先于 canonical callbacks
- `_stop_on_truthy`: 第一个 truthy 停止后续
- before 返回 truthy 时跳过 agent 运行

### P0 — Cancellation 安全
- CancelledError 时仍运行 after_agent_callback
- Error callback 异常被 suppress，原始错误总是 re-raise

### P1 — OpenTelemetry Context 传播
- `_with_caller_context()` 在每个 yield 前后 attach/detach
- 确保下游消费者看到正确的 OTel context

### P1 — Clone 语义
- Agent 自身方法作为 callback 时 rebind 到 clone
- List 字段浅拷贝
- sub_agents 递归 clone
- clone 的 parent_agent 置 None

### P2 — Agent State
- @experimental FeatureName.AGENT_STATE
- BaseAgentState 基类 + TypeVar
- 通过 InvocationContext.agent_states 传递

---

## 14. 源码锚点速查

```
src/google/adk/agents/base_agent.py
  class BaseAgent(BaseNode, abc.ABC)
    name: str (validator: isidentifier, != "user")
    description: str = ''
    parent_agent: Optional[BaseAgent]
    sub_agents: list[BaseAgent]
    before_agent_callback / after_agent_callback
    validate_name(): identifier + != "user"
    validate_sub_agents_unique_names(): warning only
    __set_parent_agent_for_sub_agents(): raise if already has parent
    run_async(): before → _run_async_impl → after
    run_live(): @final, before → _run_live_impl → after
    _handle_before_agent_callback(): plugin → canonical → _stop_on_truthy
    _handle_after_agent_callback(): plugin → canonical → _stop_on_truthy
    _handle_agent_error_callback(): suppress, re-raise original
    clone(): rebind methods, shallow copy lists, recursive sub_agents
    root_agent: walk up parent_agent
    find_agent() / find_sub_agent(): DFS
    _load_agent_state() / _create_agent_state_event()
    _run_impl(): BaseNode interface
  _with_caller_context(): OTel context attach/detach per yield
  class BaseAgentState(BaseModel): @experimental
```

---

## 15. 参考链接

- https://github.com/google/adk-python
- https://google.github.io/adk-docs/
