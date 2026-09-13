# 11. Composio 架构深度分析

> **仓库**: [ComposioHQ/composio](https://github.com/ComposioHQ/composio) (26.2k ⭐)
> **定位**: 为 AI Agent 提供 1000+ 预认证工具集、会话管理、认证、触发器和沙箱执行环境
> **语言**: Python SDK + TypeScript SDK（monorepo）

---

## 1. 整体架构：Provider 泛型 + Session 模型

Composio 采用 **Provider 泛型模式**，核心 `Composio` 类通过泛型参数 `TTool` 和 `TToolCollection` 实现框架无关的工具适配。默认使用 OpenAI 格式，但可以无缝切换到 Anthropic、LangChain 等任何框架。

```python
# sdk.py - 核心 SDK 类定义
class Composio(t.Generic[TTool, TToolCollection], WithLogger):
    """
    Generic parameters:
        TTool: The individual tool type returned by the provider
        TToolCollection: The collection type returned by get_tools
    """

    tools: "Tools[TTool, TToolCollection]"

    @t.overload
    def __init__(
        self: "Composio[OpenAITool, OpenAIToolCollection]",
        provider: None = None,
        **kwargs: te.Unpack[SDKConfig],
    ) -> None:
        """Initialize with default OpenAI provider."""
        ...

    @t.overload
    def __init__(
        self,
        provider: BaseProvider[TTool, TToolCollection],
        **kwargs: te.Unpack[SDKConfig],
    ) -> None:
        """Initialize with an explicit provider. Types are inferred from the provider."""
        ...
```

**设计亮点**: 通过 `@t.overload` 实现两个初始化路径——无 provider 时默认 OpenAI 类型，有 provider 时自动推断泛型参数。这意味着 `Composio(provider=AnthropicProvider())` 会自动得到 `Composio[ToolParam, list[ToolParam]]` 类型。

---

## 2. HTTP 客户端：Stainless 生成器 + 运行时环境检测

HTTP 客户端基于 Stainless 自动生成的 API 客户端包装，增加了运行时环境检测和请求拦截能力。

```python
# client/__init__.py - 运行时环境自动检测
def _detect_runtime_environment() -> str:
    """Detect the runtime environment where the code is executing."""
    try:
        import google.colab
        return "GOOGLE_COLAB"
    except ImportError:
        pass
    try:
        shell = get_ipython().__class__.__name__
        if shell == "ZMQInteractiveShell":
            return "JUPYTER_NOTEBOOK"
    except NameError:
        pass
    if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return "AWS_LAMBDA"
    if os.path.exists("/.dockerenv"):
        return "DOCKER"
    return "LOCAL"

# 每个请求自动注入遥测头
def _prepare_request(self, request: Request) -> None:
    ctx = self.request_ctx.get()
    request.headers["x-request-id"] = ctx.get("id") or uuid4().hex
    request.headers["x-framework"] = ctx["provider"]
    request.headers["x-source"] = "PYTHON_SDK"
    request.headers["x-runtime"] = HttpClient._runtime_env
```

**设计亮点**: `_detect_runtime_environment()` 检测 12+ 种运行环境（Colab、Jupyter、AWS Lambda、Docker 等），并注入 `x-runtime` 头用于遥测分析。使用 `contextvars.ContextVar` 实现协程安全的请求上下文传播。

---

## 3. Provider 体系：Agentic vs Non-Agentic 双分支

Provider 体系分为两条继承路径，对应不同的工具执行模型。

```python
# core/provider/base.py - 基础 Provider 抽象
class BaseProvider(t.Generic[TTool, TToolCollection]):
    name: str
    execute_tool: ExecuteToolFn  # 由 SDK 注入

    def set_execute_tool_fn(self, execute_tool_fn: ExecuteToolFn) -> None:
        self.execute_tool = execute_tool_fn

    def resolve_tool_call_execution_target(
        self, *, user_id: t.Optional[str], session: t.Optional[ToolCallSession],
    ) -> ToolCallExecutionTarget:
        """Exactly one of user_id or session."""
        if (user_id is None) == (session is None):
            raise ValueError("Provide exactly one of user_id or session")
        if session is not None:
            return session
        return t.cast(str, user_id)

# core/provider/agentic.py - Agentic Provider（Agent SDK 类型，如 OpenAI Agents）
class AgenticProvider(BaseProvider[TTool, TToolCollection]):
    def __init_subclass__(cls, name: str) -> None:
        cls.name = name

    def wrap_tool(self, tool: Tool, execute_tool: AgenticProviderExecuteFn) -> TTool:
        raise NotImplementedError

# core/provider/none_agentic.py - Non-Agentic Provider（纯 API 类型，如原始 OpenAI）
class NonAgenticProvider(BaseProvider[TTool, TToolCollection]):
    def wrap_tool(self, tool: Tool) -> TTool:  # 无 execute_tool 参数
        raise NotImplementedError
```

**设计亮点**: `AgenticProvider` 的 `wrap_tool` 接收 `execute_tool` 回调，因为它需要将执行能力嵌入工具对象本身（Agent 会调用工具）；`NonAgenticProvider` 不需要，因为调用方自行处理执行。这通过 `__init_subclass__(cls, name: str)` 实现声明式注册。

---

## 4. ToolRouter Session：会话级工具管理

ToolRouter 是 Composio 最核心的会话管理机制，提供隔离的 MCP 端点、工具发现、认证和执行。

```python
# core/models/tool_router.py - Session 创建配置
class ToolRouterToolkitsEnableConfig(te.TypedDict, total=False):
    """Configuration for enabling specific toolkits in tool router session."""
    enable: t.List[str]

class ToolRouterToolsTagsConfig(te.TypedDict, total=False):
    """Configuration for filtering tools by MCP tags."""
    tags: ToolRouterConfigTags

# 沙箱资源规格
SandboxSize = t.Literal["standard", "medium", "large", "xlarge"]
# +----------+------+------+
# | Tier     | vCPU | RAM  |
# +----------+------+------+
# | standard | 1    | 1 GB |
# | medium   | 2    | 2 GB |
# | large    | 4    | 4 GB |
# | xlarge   | 8    | 8 GB |
# +----------+------+------+
```

```python
# core/models/tool_router_session.py - Session 执行路由
COMPOSIO_MULTI_EXECUTE_TOOL = "COMPOSIO_MULTI_EXECUTE_TOOL"
DIRECT_CUSTOM_TOOL_DESCRIPTION_PREFIX = "[Direct tool - call directly, no search needed beforehand.]"
MAX_PARALLEL_WORKERS = 5

@dataclass
class ToolRouterSessionPreloadConfig:
    """Preloaded tools configured for a tool router session."""
    tools: t.Union[t.List[str], t.Literal["all"]]
```

**设计亮点**: Session 是 per-user 隔离的。`SandboxSize` 定义了 4 级计算资源规格。工具可以通过 `preload` 机制预加载（避免运行时发现延迟），或通过 MCP 标签（`readOnlyHint`、`destructiveHint` 等）精细过滤。

---

## 5. 自定义工具系统：装饰器 + 本地/远程混合执行

Composio 允许用户定义本地自定义工具，与远程 Composio 工具在同一 Session 中混合执行。

```python
# core/models/custom_tool.py - 装饰器 API
"""
Usage::

    from pydantic import BaseModel, Field
    from composio import Composio

    composio = Composio()

    class GrepInput(BaseModel):
        pattern: str = Field(description="Pattern to search for")

    @composio.experimental.tool()
    def grep(input: GrepInput, ctx):
        \"\"\"Search for a pattern in local files.\"\"\"
        return {"matches": []}

    dev_tools = composio.experimental.Toolkit(
        slug="DEV_TOOLS",
        name="Dev Tools",
        description="Local dev utilities",
    )

    @dev_tools.tool()
    def search_code(input: GrepInput, ctx):
        \"\"\"Search developer resources.\"\"\"
        return {"results": []}
"""

# Slug 验证确保不与内部前缀冲突
def _validate_slug(slug: str, context: str) -> str:
    upper = slug.upper()
    if upper.startswith("LOCAL_"):
        raise ValidationError(f'{context}: slug must not start with "LOCAL_"')
    if upper.startswith("COMPOSIO_"):
        raise ValidationError(f'{context}: slug must not start with "COMPOSIO_"')
    return slug
```

**设计亮点**: 自定义工具使用 `LOCAL_` 前缀进行内部路由区分。`ExperimentalToolkit` 允许将多个工具组织为一个 toolkit。执行时自动路由：本地工具在进程内执行，远程工具发送到后端。

---

## 6. 工具执行管线：Modifiers（前置/后置钩子）

工具执行支持前置/后置修改器（Modifiers），用于参数注入、结果变换和文件上传保护。

```python
# core/models/tools.py - Modifiers 系统
class ToolExecutionResponse(te.TypedDict):
    data: t.Dict
    error: t.Optional[str]
    successful: bool

# _modifiers.py 中定义的修饰器类型：
# before_execute  - 执行前参数注入/变换
# after_execute   - 执行后结果变换
# before_file_upload - 文件上传前的安全检查
# schema_modifier - 工具 Schema 动态修改

def _serialize_arguments(arguments: t.Dict[str, t.Any]) -> t.Dict[str, t.Any]:
    """Serialize any Pydantic model instances in tool arguments to JSON-safe dicts.
    Prevents JSON serialization errors when arguments contain complex types."""
    if not _needs_serialization(arguments):
        return arguments
    return {k: _serialize_value(v) for k, v in arguments.items()}
```

**设计亮点**: `_serialize_arguments` 递归处理 Pydantic 模型嵌套，解决 discriminated union schema 等复杂类型的 JSON 序列化问题。`before_file_upload` 与 `sensitive_file_upload_protection` 配合，阻止敏感路径上传。

---

## 7. 认证管理：AuthConfigs + ConnectedAccounts

认证分为两层：`AuthConfigs` 定义认证方案（OAuth/API Key 等），`ConnectedAccounts` 管理具体的用户连接。

```python
# core/models/connected_accounts.py - 连接请求与等待
class ConnectionRequest(Resource):
    DEFAULT_WAIT_TIMEOUT = 60.0

    def wait_for_connection(
        self, timeout: t.Optional[float] = None,
    ) -> connected_account_retrieve_response.ConnectedAccountRetrieveResponse:
        timeout = self.DEFAULT_WAIT_TIMEOUT if timeout is None else timeout
        deadline = time.time() + timeout
        while deadline > time.time():
            connection = self._client.connected_accounts.retrieve(nanoid=self.id)
            self.status = connection.status
            if self.status == "ACTIVE":
                return connection
            if self.status in _TERMINAL_CONNECTION_STATES:
                raise exceptions.SDKError(
                    message=f"Connection {self.id} entered terminal state "
                            f"{self.status!r} before becoming active",
                )
            time.sleep(1)
        raise exceptions.ComposioSDKTimeoutError(
            message=f"Timeout while waiting for connection {self.id} to be active",
        )

_TERMINAL_CONNECTION_STATES: t.FrozenSet[str] = frozenset(
    {"FAILED", "EXPIRED", "REVOKED"}
)
```

```python
# core/models/auth_configs.py - 认证方案 CRUD
class AuthConfigs(Resource):
    def create(self, toolkit: str, options: auth_config_create_params.AuthConfig) -> AuthConfig:
        return self._client.auth_configs.create(
            toolkit={"slug": toolkit}, auth_config=options
        ).auth_config

    def get(self, nanoid: str) -> auth_config_retrieve_response.AuthConfigRetrieveResponse:
        return self._client.auth_configs.retrieve(nanoid)
```

**设计亮点**: `ConnectionRequest.wait_for_connection` 实现了带超时的轮询等待，区分终态（`FAILED`/`EXPIRED`/`REVOKED`）和可恢复态（`INACTIVE`），避免在不可恢复的连接上浪费等待时间。

---

## 8. 触发器与 Webhook：V3 事件协议

触发器系统支持 Webhook 和 Pusher 实时通道，V3 协议使用统一事件信封。

```python
# core/models/triggers.py - V3 事件结构
class WebhookPayloadV3(te.TypedDict):
    """V3 webhook payload - generic envelope for all composio.* events."""
    id: str
    timestamp: str
    type: str  # e.g., 'composio.trigger.message', 'composio.connected_account.expired'
    metadata: t.Dict[str, str, t.Any]
    data: t.Dict[str, t.Any]

class WebhookTriggerPayloadV3(te.TypedDict):
    """V3 trigger-specific webhook payload."""
    id: str
    timestamp: str
    type: str
    metadata: WebhookTriggerPayloadV3Metadata
    data: t.Dict[str, t.Any]

PUSHER_AUTH_URL = "{base_url}/api/v3/internal/sdk/realtime/auth?source=python"
```

**设计亮点**: V3 使用统一信封格式（`composio.*` 事件类型前缀），同一负载结构同时用于 Webhook 和 Pusher 实时通道。`type` 字段区分触发器事件和连接状态事件。

---

## 9. MCP 集成：托管 MCP 端点

每个 Session 可以暴露一个托管的 MCP（Model Context Protocol）端点，供 Claude、Cursor 等 MCP 客户端直接连接。

```python
# core/models/mcp.py - MCP 服务器管理
class MCPServerConfig(te.TypedDict):
    """Only needs toolkit slug and optional auth config."""
    toolkit: te.Required[str]  # e.g., gmail, slack, github
    auth_config_id: str

class MCPListResponse(te.TypedDict):
    """Paginated list response."""
    items: t.List[t.Any]
    current_page: int
    total_pages: int

# 使用示例
"""
>>> server = composio.experimental.mcp.create(
...     'personal-mcp-server',
...     toolkits=[
...         {'toolkit': 'github', 'auth_config_id': 'auth_abc123'},
...         {'toolkit': 'slack', 'auth_config_id': 'auth_def456'}
...     ],
...     allowed_tools=['GITHUB_CREATE_ISSUE', 'SLACK_SEND_MESSAGE']
... )
"""
```

**设计亮点**: MCP 端点是 Session 级别的，每个用户会话拥有独立的 MCP URL。`allowed_tools` 提供白名单级别的工具访问控制，避免暴露不必要的工具给客户端。

---

## 10. 非幂等写入保护：without_retries 机制

Composio 对非幂等操作（如工具执行）实现了精细的重试策略控制。

```python
# client/__init__.py - 非幂等写入的重试保护
@property
def without_retries(self) -> te.Self:
    """A cached sibling client that never retries requests.

    Used for non-idempotent writes (tools.execute / tools.proxy),
    where a silent retry after a read timeout can duplicate a side effect
    (e.g. send an email twice). Reads keep the default retry behaviour.

    Scope: only tools.execute / tools.proxy route through this today.
    Other non-idempotent writes (auth_configs.create / update / delete,
    mcp.update / delete, connected_accounts.delete / refresh, link.create)
    keep the default retries — most are naturally idempotent on retry, and
    the durable fix is backend-honoured idempotency keys.

    The sibling is cached rather than rebuilt per call so a fresh client is
    not constructed on every execute/proxy (the hottest path).
    """
    if self._without_retries is None:
        self._without_retries = self.with_options(max_retries=0)
    return self._without_retries
```

```python
# client/__init__.py - copy/with_options 的 provider 透传修复
def copy(self, *, _extra_kwargs: t.Mapping[str, t.Any] = {}, **kwargs: t.Any) -> te.Self:
    """Clone the client, re-injecting the required `provider` keyword.

    The Stainless-generated copy rebuilds the client without passing `provider`,
    which this subclass requires — so the inherited copy/with_options raise TypeError.
    Threading `provider` through `_extra_kwargs` makes them work again.
    """
    return super().copy(
        _extra_kwargs={
            "provider": self.provider,
            "_strict_response_validation": self._strict_response_validation,
            **_extra_kwargs,
        },
        **kwargs,
    )
with_options = copy  # Re-alias to this override
```

**设计亮点**: `without_retries` 使用惰性缓存模式——首次访问时创建一个 `max_retries=0` 的客户端副本并缓存，后续调用直接复用。注释明确指出作用域仅限 `tools.execute`/`tools.proxy`，其他非幂等写入暂不处理（依靠后端幂等键）。`copy` 方法的 `_extra_kwargs` 透传解决了 Stainless 代码生成器不传递 `provider` 参数的已知问题。

---

## 架构总结

| 维度 | 设计模式 | 核心价值 |
|------|---------|---------|
| SDK 入口 | 泛型 Provider + 类型推断 | 一个类适配 15+ 框架 |
| HTTP 客户端 | Stainless 生成 + 遥测拦截 | 自动化 API 客户端 + 运行时追踪 |
| Provider 体系 | Agentic/Non-Agentic 双分支 | 支持有/无执行能力的工具封装 |
| 会话管理 | ToolRouter Session + MCP | per-user 隔离、资源规格可配 |
| 自定义工具 | 装饰器 + 本地/远程混合路由 | 用户工具与平台工具无缝集成 |
| 工具执行 | Modifiers 管线 | 前置/后置钩子、安全保护 |
| 认证 | AuthConfig + ConnectedAccount 两层 | 方案定义与实例化分离 |
| 触发器 | V3 统一事件信封 | Webhook + Pusher 双通道 |
| MCP 集成 | 托管 MCP 端点 | Session 级 MCP URL + 工具白名单 |
| 容错 | 非幂等写入零重试 + 惰性缓存 | 防止副作用重复（如重复发邮件） |

**核心架构洞察**: Composio 的本质是一个 **工具虚拟化层**——它将 1000+ 第三方 API 统一为标准化工具，通过 Provider 模式适配任意 Agent 框架，通过 Session 模式实现用户级隔离和认证管理。ToolRouter 是其最核心的创新，它将工具发现、认证、执行、沙箱统一在一个会话上下文中，Agent 只需关注"调用什么工具"而非"如何连接和认证"。

---

## 与其他工具平台的对比启示

与 LangChain Tools、OpenAI Function Calling 等方案相比，Composio 的核心差异化在于三个层面：

1. **认证即服务**: 大多数工具框架将认证留给开发者自行处理，Composio 通过 `AuthConfigs` + `ConnectedAccounts` 两层抽象，将 OAuth 流程、Token 刷新、连接状态管理全部封装在平台层。开发者只需声明需要哪些 toolkit，用户通过 `link` 命令完成一次授权，后续的 Token 续期和过期处理完全自动化。

2. **Session 级工具隔离**: 每个用户拥有独立的 ToolRouter Session，工具列表、认证状态、沙箱环境互不干扰。这使得多租户 Agent 服务的实现变得简单——`composio.create(user_id="alice")` 和 `composio.create(user_id="bob")` 各自拥有完全隔离的工具执行环境。

3. **元工具模式（Meta Tools）**: 默认情况下，Session 不会将全部 1000+ 工具定义加载到上下文（那会消耗大量 Token），而是提供一组元工具用于运行时发现和认证。Agent 先通过元工具搜索需要的工具，再认证和执行，这是一种"按需加载"的上下文优化策略。

对于 OpenMate 的参考价值：Composio 的 Provider 泛型模式值得借鉴——如果 OpenMate 需要支持多个 LLM 框架的工具格式，可以通过类似的泛型抽象层实现一次定义、多框架适配。ToolRouter Session 的概念也可以应用于 OpenMate 的插件系统，为每个用户会话提供隔离的工具执行环境。
