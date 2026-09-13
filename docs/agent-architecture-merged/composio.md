# Composio

## 概述

Composio 是一个Agent工具集成平台。

**仓库**: https://github.com/ComposioHQ/composio | **语言**: Python

## 核心架构

> **仓库**: [ComposioHQ/composio](https://github.com/ComposioHQ/composio) (26.2k ⭐)
> **定位**: 为 AI Agent 提供 1000+ 预认证工具集、会话管理、认证、触发器和沙箱执行环境
> **语言**: Python SDK + TypeScript SDK（monorepo）

Composio 采用 **Provider 泛型模式**，核心 `Composio` 类通过泛型参数 `TTool` 和 `TToolCollection` 实现框架无关的工具适配。默认使用 OpenAI 格式，但可以无缝切换到 Anthropic、LangChain 等任何框架。

[详见源码]

**设计亮点**: Session 是 per-user 隔离的。`SandboxSize` 定义了 4 级计算资源规格。工具可以通过 `preload` 机制预加载（避免运行时发现延迟），或通过 MCP 标签（`readOnlyHint`、`destructiveHint` 等）精细过滤。

Composio 允许用户定义本地自定义工具，与远程 Composio 工具在同一 Session 中混合执行。

[详见源码]

[详见源码]

**设计亮点**: V3 使用统一信封格式（`composio.*` 事件类型前缀），同一负载结构同时用于 Webhook 和 Pusher 实时通道。`type` 字段区分触发器事件和连接状态事件。

class MCPServerConfig(te.TypedDict):
    """Only needs toolkit slug and optional auth config."""
    toolkit: te.Required[str]  # e.g., gmail, slack, github
    auth_config_id: str

class MCPListResponse(te.TypedDict):
    """Paginated list response."""
    items: t.List[t.Any]
    current_page: int
    total_pages: int

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

## 关键技术

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
[详见源码]

**设计亮点**: Session 是 per-user 隔离的。`SandboxSize` 定义了 4 级计算资源规格。工具可以通过 `preload` 机制预加载（避免运行时发现延迟），或通过 MCP 标签（`readOnlyHint`、`destructiveHint` 等）精细过滤。

Composio 允许用户定义本地自定义工具，与远程 Composio 工具在同一 Session 中混合执行。

[详见源码]python

class ToolExecutionResponse(te.TypedDict):
    data: t.Dict
    error: t.Optional[str]
    successful: bool

def _serialize_arguments(arguments: t.Dict[str, t.Any]) -> t.Dict[str, t.Any]:
    """Serialize any Pydantic model instances in tool arguments to JSON-safe dicts.
    Prevents JSON serialization errors when arguments contain complex types."""
    if not _needs_serialization(arguments):
        return arguments
    return {k: _serialize_value(v) for k, v in arguments.items()}
[详见源码]

**设计亮点**: `ConnectionRequest.wait_for_connection` 实现了带超时的轮询等待，区分终态（`FAILED`/`EXPIRED`/`REVOKED`）和可恢复态（`INACTIVE`），避免在不可恢复的连接上浪费等待时间。

触发器系统支持 Webhook 和 Pusher 实时通道，V3 协议使用统一事件信封。

```python

Composio 对非幂等操作（如工具执行）实现了精细的重试策略控制。

```python

与 LangChain Tools、OpenAI Function Calling 等方案相比，Composio 的核心差异化在于三个层面：

1. **认证即服务**: 大多数工具框架将认证留给开发者自行处理，Composio 通过 `AuthConfigs` + `ConnectedAccounts` 两层抽象，将 OAuth 流程、Token 刷新、连接状态管理全部封装在平台层。开发者只需声明需要哪些 toolkit，用户通过 `link` 命令完成一次授权，后续的 Token 续期和过

## 对openmate的启示

> 仓库: https://github.com/ComposioHQ/composio  
> 抓取通道: cdn.jsdelivr.net/gh/ComposioHQ/composio@master  
> 版本快照: master @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供工具集成 / 生命周期钩子 / Webhook / OAuth 借鉴

---

| 符号 | 模块路径 |
|------|----------|
| Composio | `.sdk` |
| CustomTool, SessionContext | `.core.models.custom_tool_types` |
| ExperimentalToolkit | `.core.models.custom_tool` |
| SESSION_PRESET_DIRECT_TOOLS | `.core.models.tool_router_constants` |
| RemoteFile | `.core.models.tool_router_session_files` |
| before_execute, after_execute, before_file_upload, schema_modifier | `.core.models.tools` |
| Webhook* / Connection* / is_connection_expired_event | `.core.models.webhook_events` |
| Toolkit* | `.core.types` |
| __version__ | `.__version__` |

| 需求 | Composio 机制 | 可复用度 |
|------|---------------|----------|
| 工具统一接口 | Toolset 抽象 | **高** |
| OAuth 管理 | Connection + token 刷新 | **高** |
| 工具发现 | get_tools(apps=[...]) | **高** |
| 生命周期钩子 | before/after_execute + before_file_upload + schema_modifier | **高** |
| Webhook 事件 | ConnectionExpired/State | **高** |
| 自定义工具 | CustomTool + SessionContext | **高** |
| Schema 修改 | schema_modifier | **高** |
| 类型守卫 | is_connection_expired_event | 中 |
| Toolkit 版本化 | 4 个 Toolkit* 类型 | 中 |
| 会话预设 | SESSION_PRESET_DIRECT_TOOLS | 中 |
| 远程文件 | RemoteFile | 中 |
| 用户隔离 | user_id 参数 [文档] | 中 |

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（11-composio.md）
- MiMo报告（composio.md）
