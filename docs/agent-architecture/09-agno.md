# 09 - Agno 深度架构分析

> **项目**: [agno-agi/agno](https://github.com/agno-agi/agno)
> **定位**: Build, run, and manage agent platforms
> **Stars**: 42,131 | **Forks**: 5,903 | **License**: Apache-2.0
> **语言**: Python | **核心框架**: Pydantic

---

## 一、项目概览与分层架构

Agno 不仅仅是一个 Agent 框架，而是一个完整的 **Agent 平台运行时（AgentOS）**。它由三层构成：

1. **SDK 层** (`libs/agno/agno/`) — Agent 构建的核心 API
2. **运行时层** — 50+ REST/SSE/WebSocket 端点，提供生产级服务
3. **管理层** — Web UI 控制面，JWT RBAC，多租户隔离

源码目录结构清晰地反映了这种分层：

```
libs/agno/agno/
├── agent/          # Agent 核心（拆分为 _init, _run, _tools, _session 等子模块）
├── models/         # 模型抽象层（100+ 提供商适配）
├── tools/          # 工具系统（Toolkit + Function + @tool 装饰器）
├── memory/         # 记忆管理（MemoryManager + 优化策略）
├── session/        # 会话持久化
├── run/            # 运行时事件系统
├── knowledge/      # 知识库协议
├── db/             # 数据库抽象
└── ...
```

Agent 核心类采用 **模块拆分** 模式——`agent.py` 只是入口，实际逻辑分散在 `_init.py`、`_run.py`、`_tools.py`、`_session.py` 等子模块中，通过 `__init__.py` 的 re-export 组合在一起：

```python
# libs/agno/agno/agent/__init__.py
from agno.agent import (
    _default_tools,
    _init,
    _managers,
    _messages,
    _run,
    _session,
    _storage,
    _tools,
    _utils,
)
```

---

## 二、Agent 核心：Pydantic 驱动的状态机

### 2.1 Agent 类定义

Agent 是一个 **Pydantic BaseModel**，所有配置字段都有类型约束和默认值：

```python
# libs/agno/agno/agent/agent.py
class Agent:
    # 模型配置
    model: Optional[Model] = None
    fallback_config: Optional[FallbackConfig] = None

    # 身份
    name: Optional[str] = None
    id: Optional[str] = None          # 自动生成

    # 会话状态
    session_state: Optional[Dict[str, Any]] = None
    add_session_state_to_context: bool = False
    enable_agentic_state: bool = False  # 允许 Agent 动态更新 session_state

    # 知识库
    enable_agentic_knowledge_filters: Optional[bool] = False
    add_knowledge_to_context: bool = False

    # 历史消息
    store_history_messages: bool = False  # 完整上下文存储（二次存储增长）

    # 系统消息
    system_message: Optional[Union[str, Callable, Message]] = None

    # 上下文增强
    add_location_to_context: bool = False
    datetime_format: Optional[str] = None
```

### 2.2 初始化流程

初始化被拆到 `_init.py` 中，按职责细粒度拆分：

```python
# libs/agno/agno/agent/_init.py
def set_id(agent: Agent) -> None:
    if agent.id is None:
        agent.id = generate_id_from_name(agent.name)

def set_debug(agent: Agent, debug_mode: Optional[bool] = None) -> None:
    debug_level: Literal[1, 2] = (
        cast(Literal[1, 2], int(env))
        if (env := getenv("AGNO_DEBUG_LEVEL")) in ("1", "2")
        else agent.debug_level
    )
    if agent.debug_mode or debug_mode or getenv("AGNO_DEBUG", "false").lower() == "true":
        set_log_level_to_debug(level=debug_level)
    else:
        set_log_level_to_info()

def set_default_model(agent: Agent) -> None:
    if agent.model is None:
        from agno.models.openai import OpenAIResponses
        # 默认使用 OpenAI Responses API
```

这种 **细粒度初始化函数** 的设计模式使得每个子系统可以独立测试和扩展。

---

## 三、运行循环：同步/异步双模引擎

### 3.1 Run 循环核心

运行循环位于 `_run.py`，是一个完整的状态机，处理从输入验证到输出存储的全流程：

```python
# libs/agno/agno/agent/_run.py
"""Core run loop and execution helpers for Agent."""

from agno.run.agent import (
    RunCancelledEvent,
    RunCompletedEvent,
    RunInput,
    RunOutput,
    RunOutputEvent,
)
from agno.run.cancel import (
    register_run,
    raise_if_cancelled,
    cancel_run as cancel_run_global,
)
from agno.run.messages import RunMessages
from agno.run.requirement import RunRequirement
```

关键设计点：
- **同步/异步双模**：`run()` 和 `arun()` 共享相同的逻辑结构
- **取消机制**：通过 `register_run()` / `raise_if_cancelled()` 实现运行级取消
- **事件驱动**：`RunOutputEvent` 流式输出，支持 SSE

### 3.2 流式执行架构

Agno 的流式架构通过 Generator/AsyncGenerator 模式实现：

```python
# libs/agno/agno/models/base.py
# 工具执行结果通过 yield 逐事件推送
yield ModelResponse(
    content=f"{function_call.get_call_str()} completed in {function_call_timer.elapsed:.4f}s. ",
    tool_executions=[
        ToolExecution(
            tool_call_id=function_call_result.tool_call_id,
            tool_name=function_call.function.name,
            # ...
        )
    ],
)
```

---

## 四、模型抽象层：统一接口 + 提供商适配

### 4.1 基类设计

`Model` 是所有模型提供商的抽象基类，基于 Pydantic BaseModel：

```python
# libs/agno/agno/models/base.py
from pydantic import BaseModel

class Model(BaseModel):
    # 核心方法
    def invoke(self, **kwargs) -> ModelResponse: ...
    async def ainvoke(self, **kwargs) -> ModelResponse: ...
    def invoke_stream(self, **kwargs) -> Iterator[ModelResponse]: ...
    async def ainvoke_stream(self, **kwargs) -> AsyncIterator[ModelResponse]: ...
```

### 4.2 错误处理与重试机制

Agno 内置了完善的错误分类和重试策略：

```python
# libs/agno/agno/models/base.py
from agno.exceptions import (
    AgentRunException,
    ContextWindowExceededError,
    ModelProviderError,
    RetryableModelProviderError,
    RunCancelledException,
)

# 重试时注入指导消息
kwargs["messages"].append(
    Message(role="user", content=e.retry_guidance_message, temporary=True)
)
return self._invoke_with_retry(**kwargs, retry_with_guidance=True)
```

**关键设计**：重试时通过 `temporary=True` 的消息注入重试指导，不污染持久化历史。

### 4.3 Fallback 配置

```python
# libs/agno/agno/agent/agent.py
fallback_config: Optional[FallbackConfig] = None

# libs/agno/agno/models/fallback.py
# 支持级联 fallback：主模型失败 → 备选模型 → ...
async def acall_model_with_fallback(...)
def call_model_with_fallback(...)
```

---

## 五、工具系统：三层抽象

### 5.1 工具层次结构

Agno 的工具系统由三层抽象构成：

```
Toolkit (工具集) → Function (工具函数) → FunctionCall (工具调用)
```

```python
# libs/agno/agno/tools/__init__.py
from agno.tools.component import ComponentTool
from agno.tools.decorator import tool
from agno.tools.function import Function, FunctionCall
from agno.tools.toolkit import Toolkit

__all__ = [
    "tool",
    "ComponentTool",
    "Function",
    "FunctionCall",
    "Toolkit",
]
```

### 5.2 Toolkit：工具集管理

Toolkit 是工具的组织单元，支持自动注册、指令注入、连接管理：

```python
# libs/agno/agno/tools/toolkit.py
class Toolkit:
    _requires_connect: bool = False  # 需要连接管理（如数据库）

    def __init__(
        self,
        name: str = "toolkit",
        tools: Optional[Sequence[Union[Callable[..., Any], Function]]] = None,
        async_tools: Optional[Sequence[tuple[Callable[..., Any], str]]] = None,
        instructions: Optional[str] = None,
        add_instructions: bool = False,
        include_tools: Optional[list[str]] = None,
        exclude_tools: Optional[list[str]] = None,
        requires_confirmation_tools: Optional[list[str]] = None,
        stop_after_tool_call_tools: Optional[List[str]] = None,
        show_result_tools: Optional[List[str]] = None,
        cache_results: bool = False,
        cache_ttl: int = 3600,
        timeout: Optional[int] = None,
        auto_register: bool = True,  # 自动注册所有方法
    ):
```

**Toolkit 的去重机制**设计精巧——通过 `ToolkitKey` 基于名称+指令+函数表面（而非对象标识）进行去重，确保 `Agent.deep_copy()` 后的克隆体与原始体共享同一个逻辑 Toolkit：

```python
# libs/agno/agno/tools/toolkit.py
ToolkitKey = Tuple[str, Any, bool, frozenset, frozenset]

def _toolkit_key(toolkit: "Toolkit") -> ToolkitKey:
    sync_surface = frozenset(toolkit.get_functions())
    async_surface = frozenset(toolkit.get_async_functions())
    instructions = toolkit.instructions
    if instructions is not None and not isinstance(instructions, str):
        return (toolkit.name, id(toolkit), toolkit.add_instructions,
                sync_surface, async_surface)
    return (toolkit.name, instructions, toolkit.add_instructions,
            sync_surface, async_surface)
```

### 5.3 Function：工具函数封装

Function 是单个工具的封装，支持缓存、Hook 链、媒体注入：

```python
# libs/agno/agno/tools/function.py
class Function(BaseModel):
    name: str
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    entrypoint: Optional[Callable] = None

    # Hook 系统
    pre_hook: Optional[Callable] = None
    post_hook: Optional[Callable] = None
    tool_hooks: Optional[List[Callable]] = None

    # 控制标志
    requires_confirmation: bool = False
    external_execution: bool = False
    stop_after_tool_call: bool = False
    show_result: bool = False

    # 缓存
    cache_results: bool = False
    cache_ttl: int = 3600
```

### 5.4 工具缓存系统

Agno 实现了带安全校验的工具结果缓存：

```python
# libs/agno/agno/tools/function.py
CACHE_FORMAT = 2  # 缓存格式版本，变更时自动失效

def _make_private_dir(directory: Any) -> None:
    """创建缓存目录，拒绝他人可写的目录"""
    owner = os.geteuid()
    for level in (directory, directory.parent, directory.parent.parent):
        info = level.stat()
        if info.st_uid != owner:
            raise PermissionError(
                f"Refusing a cache directory owned by another user: {level}"
            )
        if info.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
            level.chmod(info.st_mode & ~(stat.S_IWGRP | stat.S_IWOTH))
```

缓存还通过 `_faithful()` 函数验证往返一致性——确保从缓存读回的值在类型和结构上与原始值完全一致：

```python
def _faithful(original: Any, rebuilt: Any, depth: int = 0) -> bool:
    """Equality alone is too weak: an IntEnum member equals the plain integer
    it was written as, and a hook that reads .name off it would work on the
    miss and fail on the hit. Every node has to come back as its own type."""
    if type(original) is not type(rebuilt):
        return False
    # 递归校验 BaseModel、dict、list、tuple 的类型一致性
```

---

## 六、会话管理：多类型 Session 模型

### 6.1 Session 类型体系

Agno 支持三种 Session 类型，对应不同的使用场景：

```python
# libs/agno/agno/agent/_session.py
from agno.db.base import SessionType

# 独立 Agent → AgentSession
# Team 成员 → TeamSession
# Workflow 成员 → WorkflowSession
loaded_session = cast(
    AgentSession,
    _storage.read_session(
        agent,
        session_id=session_id_to_load,
        session_type=SessionType.AGENT,
        user_id=user_id,
    ),
)
```

### 6.2 Session 缓存与持久化

Session 采用 **缓存 + 数据库** 双层存储：

```python
# libs/agno/agno/agent/_session.py
def get_session(agent, session_id=None, user_id=None, runs_limit=None):
    # 1. 先查缓存（有界读不缓存）
    if runs_limit is None and agent.cache_session:
        cached_session = agent._get_cached_session(session_id_to_load, user_id=user_id)
        if cached_session is not None:
            return cached_session

    # 2. 再查数据库
    if agent.db is not None:
        loaded_session = _storage.read_session(...)

    # 3. 写回缓存
    if loaded_session is not None and agent.cache_session and runs_limit is None:
        agent._set_cached_session(loaded_session)
```

**有界历史读取**（`runs_limit`）是一个重要的性能优化——只加载最近 N 轮的运行记录，避免上下文膨胀。

---

## 七、记忆系统：可插拔的优化策略

### 7.1 MemoryManager

记忆系统通过 `MemoryManager` 统一管理，支持多种优化策略：

```python
# libs/agno/agno/memory/__init__.py
from agno.memory.manager import MemoryManager, UserMemory
from agno.memory.strategies import (
    MemoryOptimizationStrategy,
    MemoryOptimizationStrategyFactory,
    MemoryOptimizationStrategyType,
    SummarizeStrategy,
)
```

### 7.2 Agent 级记忆集成

Agent 可以通过 `enable_agentic_memory` 开启自主记忆管理，Agent 会获得 `update_user_memory` 工具：

```python
# libs/agno/agno/agent/_tools.py
if agent.enable_agentic_memory:
    agent_tools.append(
        _default_tools.get_update_user_memory_function(
            agent, user_id=user_id, async_mode=False
        )
    )
```

---

## 八、工具解析与动态注册

### 8.1 运行时工具解析

`_tools.py` 负责在每次运行时解析和组装完整的工具列表：

```python
# libs/agno/agno/agent/_tools.py
def get_tools(agent, run_response, run_context, session, user_id=None):
    agent_tools = []

    # 1. 解析 callable 工厂
    resolve_callable_tools(agent, run_context)
    resolve_callable_knowledge(agent, run_context)
    resolved_tools = get_resolved_tools(agent, run_context)

    # 2. 连接需要连接管理的工具
    _init.connect_connectable_tools(agent)

    # 3. 添加用户提供的工具
    if resolved_tools is not None:
        agent_tools.extend(resolved_tools)

    # 4. 添加内置工具
    if agent.read_chat_history:
        agent_tools.append(_default_tools.get_chat_history_function(...))
    if agent.search_past_sessions:
        agent_tools.append(_default_tools.get_search_past_sessions_function(...))
    if agent.enable_agentic_memory:
        agent_tools.append(_default_tools.get_update_user_memory_function(...))
    if agent.enable_agentic_state:
        agent_tools.append(Function(
            name="update_session_state",
            entrypoint=_default_tools.make_update_session_state_entrypoint(agent),
        ))

    # 5. 添加知识库搜索工具
    if resolved_knowledge is not None and agent.search_knowledge:
        agent_tools.append(_default_tools.create_knowledge_search_tool(...))

    # 6. 添加学习机器工具
    if agent._learning is not None:
        agent_tools.extend(agent._learning.get_tools(...))

    # 7. 添加 Skills 工具
    if agent.skills is not None:
        agent_tools.extend(agent.skills.get_tools())

    return agent_tools
```

### 8.2 MCP 工具集成

异步工具解析支持 MCP（Model Context Protocol）工具的自动发现和连接：

```python
# libs/agno/agno/agent/_tools.py
async def aget_tools(agent, ...):
    # MCP 工具自动连接
    await _init.connect_mcp_tools(agent)

    for tool in resolved_tools:
        is_mcp_tool = hasattr(type(tool), "__mro__") and \
            any(c.__name__ == "MCPTools" for c in type(tool).__mro__)
        if is_mcp_tool:
            if tool.refresh_connection:
                is_alive = await tool.is_alive()
                if not is_alive:
                    await tool.connect(force=True)
                else:
                    await tool.build_tools()
```

---

## 九、工具执行：确认机制与外部执行

### 9.1 Human-in-the-Loop 确认

Agno 支持工具级别的确认机制，敏感操作需要人类审批：

```python
# libs/agno/agno/agent/_tools.py
async def ahandle_tool_call_updates(agent, run_response, run_messages, tools):
    _functions = {tool.name: tool for tool in tools if isinstance(tool, Function)}
    for _t in run_response.tools or []:
        # Case 1: 需要确认的工具
        if _t.requires_confirmation is True and _functions:
            if _t.confirmed is True and _t.result is None:
                async for event in arun_tool(...):
                    yield event
            else:
                reject_tool_call(agent, run_messages, _t, functions=_functions)
                _t.tool_call_error = True

        # Case 2: 需要外部执行的工具
        elif _t.external_execution_required is True:
            await asyncio.to_thread(
                handle_external_execution_update, ...
            )

        # Case 3: 需要用户输入的工具
        elif _t.requires_user_input is True:
            handle_user_input_update(agent, tool=_t)
```

### 9.2 审批审计

每次确认/拒绝都会创建审计记录：

```python
await _amaybe_create_audit_approval(
    agent, _t, run_response,
    "approved" if _t.confirmed is True else "rejected"
)
```

---

## 十、并发架构：线程池与异步任务

### 10.1 后台执行器

Agent 使用专用线程池处理后台任务：

```python
# libs/agno/agno/agent/agent.py
from concurrent.futures import ThreadPoolExecutor

@property
def background_executor(self):
    self._background_executor = ThreadPoolExecutor(
        max_workers=3, thread_name_prefix="agno-bg"
    )
    return self._background_executor
```

### 10.2 异步任务生命周期

流式执行中的后台任务通过强引用集合防止被 GC 回收：

```python
# libs/agno/agno/agent/_run.py
# Strong references to background tasks so they aren't garbage-collected mid-execution.
# See: https://docs.python.org/3/library/asyncio-task.html#asyncio.create_task
_background_tasks: set[asyncio.Task[None]]
```

### 10.3 学习机器的延迟初始化

学习系统采用延迟初始化模式，避免未使用时的开销：

```python
# libs/agno/agno/agent/agent.py
@property
def learning_machine(self) -> Optional[LearningMachine]:
    if (
        self._learning is None
        and not self._learning_init_attempted
        and self.learning is not None
        and self.learning is not False
    ):
        _init.set_learning_machine(self)
    return self._learning
```

---

## 架构总结

| 维度 | 设计选择 | 技术亮点 |
|------|---------|---------|
| **Agent 核心** | Pydantic BaseModel | 类型安全，自动序列化 |
| **模块拆分** | _init/_run/_tools/_session 子模块 | 高内聚低耦合 |
| **模型层** | 统一抽象 + Provider 适配 | Fallback 级联，重试指导注入 |
| **工具系统** | Toolkit → Function → FunctionCall 三层 | ToolkitKey 去重，缓存安全校验 |
| **会话管理** | Agent/Team/Workflow 三种 Session | 有界历史读取，缓存+DB 双层 |
| **记忆系统** | MemoryManager + 可插拔策略 | Agent 自主记忆管理 |
| **工具注册** | 运行时动态解析 | MCP 自动发现，callable 工厂 |
| **执行模式** | 同步/异步双模 Generator 流式 | SSE 事件流 |
| **安全机制** | 工具确认 + 外部执行 + 审计 | HITL 人机协作 |
| **并发模型** | ThreadPoolExecutor + asyncio Task | 强引用防 GC |

**核心洞察**：Agno 的架构哲学是 **"平台级 Agent 框架"**——它不只是提供 `agent.run()` 的封装，而是构建了一个从工具注册、会话持久化、记忆管理到生产部署的完整运行时。其模块拆分策略（`_init`/`_run`/`_tools`/`_session`）使得单个 Agent 类可以承载大量功能而不失控，同时通过 Pydantic 的类型系统保证了配置的正确性。
