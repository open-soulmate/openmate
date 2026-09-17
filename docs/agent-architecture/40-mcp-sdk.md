# 40. MCP Python SDK 架构深度分析

> 基于 `modelcontextprotocol/python-sdk` v2 源码分析，协议版本 2026-07-28

## 概述

MCP Python SDK 是 Model Context Protocol 的官方 Python 实现，当前为 v2 版本——一次重大的架构重写，既支持 2026-07-28 规范及所有早期版本，也修复了长期存在的架构问题。SDK 同时提供 **Server** 和 **Client** 两套完整能力，支持 stdio、Streamable HTTP、SSE 三种标准传输方式。

---

## 1. 分层架构：四层分离

SDK 采用清晰的四层分层设计，每层职责明确、边界严格：

```
┌─────────────────────────────────────────┐
│  FastMCP 层 (MCPServer)                 │  装饰器 API，开发者面向
├─────────────────────────────────────────┤
│  Lowlevel Server 层 (Server)            │  构造函数 handler 注册
├─────────────────────────────────────────┤
│  Dispatcher 层 (JSONRPCDispatcher)      │  请求-响应关联、并发调度
├─────────────────────────────────────────┤
│  Transport 层 (stdio / StreamableHTTP)  │  字节流 ↔ 消息流
└─────────────────────────────────────────┘
```

**FastMCP 层**（`MCPServer`）提供最高级抽象——`@mcp.tool()`、`@mcp.resource()`、`@mcp.prompt()` 装饰器，开发者只需写带类型注解的 Python 函数，SDK 自动推导 JSON Schema、处理参数校验和协议交互。15 行代码即可构建完整 MCP Server。

**Lowlevel Server 层**（`Server` 类）通过构造函数注册 `on_list_tools`、`on_call_tool`、`on_list_resources` 等回调，提供对协议的精细控制。每个 handler 签名为 `(ctx: ServerRequestContext, params: TypedParams) -> Result`，params 类型由 `mcp_types` 包定义的 Pydantic 模型保证。

**Dispatcher 层**（`JSONRPCDispatcher`）实现 JSON-RPC 的请求-响应关联（request-id correlation）、每请求任务隔离（per-request task isolation）、取消/进度（cancellation/progress）信号传递，以及统一的异常-to-错误码边界。该层对 MCP 语义无感知——method 是字符串，params 是 `dict[str, Any]`。

**Transport 层**处理字节流与消息流的转换，支持 stdio（子进程管道）、Streamable HTTP（基于 Starlette ASGI）、SSE 三种标准传输。

---

## 2. Dispatcher 协议：请求调度的核心抽象

`Dispatcher` 是 SDK 中最关键的抽象之一，定义在 `mcp/shared/dispatcher.py`：

```python
class Dispatcher(Outbound, Protocol[TransportT_co]):
    async def run(self, on_request, on_notify, on_notify_intercept=None, ...): ...
    async def send_raw_request(self, method, params, opts=None) -> dict: ...
    async def notify(self, method, params, opts=None) -> None: ...
```

它将双工消息通道转化为两个能力：
- **出站 API**：`send_raw_request(method, params)` 和 `notify(method, params)`
- **入站泵**：`run(on_request, on_notify)` 驱动接收循环

设计上刻意**不感知 MCP 语义**——method 是字符串、params 和 result 是 dict。MCP 类型层（request/result 模型、能力协商、Context）位于其上；线编码（JSON-RPC、gRPC、进程内直接调用）位于其下。这种"中间层"设计使得同一套 MCP 逻辑可以在不同传输和协议编码上运行。

`CallOptions` 提供细粒度的每调用控制：`timeout`（超时秒数）、`cancel_on_abandon`（放弃时是否发送 `notifications/cancelled`）、`on_progress`（进度回调）、`resumption_token`（SSE 断线续传）、`headers`（HTTP 传输层提示）。

---

## 3. 传输层实现

### 3.1 stdio 传输

`mcp/client/stdio.py` 实现了子进程 stdio 传输。核心流程：

1. 以新 session/进程组（POSIX）或 Job Object（Windows）spawn 服务器进程
2. `stdout_reader` 和 `stdin_writer` 两个异步任务桥接子进程管道与 session 的内存流
3. 关闭顺序严格遵循 MCP 规范：先关 stdin → 等待优雅退出（2秒）→ SIGTERM → SIGKILL
4. 关闭过程在 `CancelScope(shield=True)` 内执行，确保取消不会泄漏活进程

安全方面，`get_default_environment()` 只传递安全的环境变量（`HOME`、`PATH`、`TERM` 等），过滤以 `()` 开头的函数变量。

### 3.2 Streamable HTTP 传输

`StreamableHTTPServerTransport` 是基于 Starlette 的 HTTP 传输，关键特性：

- **会话管理**：通过 `mcp-session-id` header 维持有状态会话
- **SSE 流式响应**：每个 POST 请求建立独立 SSE 流，支持服务端主动推送
- **事件存储与续传**：`EventStore` 抽象类支持断线重连后的事件重放
- **JSON 响应模式**：可选单 JSON 响应（牺牲反向通道换取简单性）
- **空闲超时**：`idle_timeout` 参数控制会话过期
- **安全防护**：`TransportSecurityMiddleware` 提供 DNS rebinding 保护、CORS 控制、请求体大小限制

消息路由（`message_router`）根据 `related_request_id` 将出站消息分发到正确的请求流，无关联消息路由到 GET 流。

---

## 4. 客户端架构

`ClientSession`（`mcp/client/session.py`）是客户端核心，提供类型化的 MCP 操作：

```python
async def list_tools(self, ...) -> types.ListToolsResult
async def call_tool(self, name, arguments, ...) -> types.CallToolResult
async def list_resources(self, ...) -> types.ListResourcesResult
async def read_resource(self, uri, ...) -> types.ReadResourceResult
async def list_prompts(self, ...) -> types.ListPromptsResult
async def get_prompt(self, name, arguments, ...) -> types.GetPromptResult
```

客户端架构的几个关键设计：

- **能力协商**：`initialize` 握手时交换 capabilities，`discover` 提供扩展发现
- **协议版本兼容**：通过 `_later_revision_fields()` 检测高版本特有字段，防止跨版本约束违规
- **服务端请求回调**：支持 `sampling`（采样）、`elicitation`（信息抽取）、`list_roots`（根列表）三类服务端主动请求
- **工具结果校验**：`validate_tool_result` 使用 JSON Schema 校验工具返回值（延迟导入 `jsonschema`）
- **Header 传播**：`x-mcp-header` 注解的工具参数自动映射为 `Mcp-Param-*` 请求头

---

## 5. 上下文系统

每个入站请求都会构建 `ServerRequestContext`：

```python
@dataclass(kw_only=True)
class ServerRequestContext(Generic[LifespanContextT, RequestT]):
    session: ServerSession          # 连接级会话
    lifespan_context: LifespanT     # 服务级生命周期上下文
    protocol_version: str           # 协商的协议版本
    method: str                     # 请求方法名
    params: Mapping[str, Any]       # 原始参数
    request_id: RequestId | None    # 请求 ID
    meta: RequestParamsMeta | None  # 元数据
    request: RequestT | None        # 传输层请求对象（如 HTTP Request）
    close_sse_stream: ...           # SSE 流关闭回调
```

`Context` 类进一步扩展，提供 `lifespan`（服务级状态访问）、`connection`（连接级操作）、`session_id`、`headers` 等便捷属性。

**Lifespan 机制**通过 `asynccontextmanager` 实现服务级生命周期管理——启动时创建资源（如数据库连接池），关闭时清理。FastMCP 层的 lifespan 上下文可在所有 handler 中通过 `ctx.lifespan_context` 访问。

---

## 6. 中间件系统

SDK 提供两层中间件：

**ServerMiddleware** 运行在 Context 层，在 `ctx` 构建后、参数校验前执行：

```python
class ServerMiddleware(Protocol[_MwLifespanT]):
    async def __call__(self, ctx, call_next) -> HandlerResult: ...
```

中间件可以重写 `ctx.params`、记录日志、实现鉴权、限流等。对 `initialize` 和 `notifications/cancelled` 也生效。链式执行，外层先注册的先执行。

**Dispatcher 层的 `on_notify_intercept`** 是同步拦截器，在接收顺序（wire order）内同步执行，用于处理需要严格保序的通知（如 `subscriptions/listen` 的去复用）。返回 `True` 消费通知，避免进入异步 handler。

---

## 7. 认证与安全

SDK 内置完整的 OAuth 2.0 认证栈：

- **Bearer Token 验证**：`BearerAuthBackend` + `TokenVerifier` 接口
- **OAuth 授权服务器**：`OAuthAuthorizationServerProvider` 支持完整的 OAuth 流程
- **Protected Resource Metadata**：RFC 9728 兼容的资源服务器元数据端点
- **AuthContextMiddleware**：将认证信息注入请求上下文
- **传输安全**：CORS 控制、DNS rebinding 保护、请求体大小限制

认证通过 Starlette 的 `AuthenticationMiddleware` 集成，对 MCP 协议层透明。

---

## 8. 类型系统与 mcp_types

SDK 将类型定义分离到独立的 `mcp_types` 包，所有请求/响应/通知类型均为 Pydantic BaseModel：

- `JSONRPCRequest`、`JSONRPCResponse`、`JSONRPCError`、`JSONRPCNotification` — 消息基础类型
- `CallToolRequestParams`、`ListToolsResult`、`ReadResourceResult` 等 — MCP 业务类型
- `Implementation`（服务器/客户端身份）、`Icon`、`ErrorData` — 元数据类型

`jsonrpc_message_adapter` 提供统一的消息反序列化入口。类型定义与协议版本绑定，`MODERN_PROTOCOL_VERSIONS`、`KNOWN_PROTOCOL_VERSIONS` 等常量支持版本协商。

---

## 9. 异步运行时与并发模型

SDK 基于 **anyio** 构建，同时支持 asyncio 和 trio 后端：

- **内存流**：`anyio.create_memory_object_stream` 实现组件间通信
- **任务组**：`anyio.create_task_group` 管理并发任务的生命周期
- **取消作用域**：`CancelScope` 实现精细的取消控制（shield、deadline、move_on_after）
- **每请求隔离**：每个入站请求在独立 task 中处理，互不阻塞
- **上下文变量**：`contextvars` 在异步任务间传递上下文

关键并发模式：
- Dispatcher 的 receive loop 串行读取消息，但将每个 request dispatch 到独立 task
- `inline_methods`（如 `initialize`）在 receive loop 中同步执行，避免并发握手
- Streamable HTTP 的 `message_router` 串行分发出站消息，避免 head-of-line blocking

---

## 10. OpenTelemetry 可观测性

SDK 集成了 OpenTelemetry，通过 `OpenTelemetryMiddleware`（Starlette ASGI 中间件）和 `mcp.shared._otel` 模块提供：

- 自动 span 创建（`otel_span`）
- 跨服务的 trace context 传播（`inject_trace_context`）
- `SpanKind` 区分（SERVER/CLIENT/INTERNAL）
- 通过 `resync_tracer` 在异步上下文切换后恢复 tracer 状态

---

## 总结

MCP Python SDK v2 的架构体现了几个核心设计理念：

1. **关注点分离**：传输、协议、业务逻辑三层解耦，通过 Dispatcher 协议连接
2. **渐进式抽象**：从 Lowlevel Server 到 FastMCP，开发者按需选择控制粒度
3. **类型安全**：Pydantic 模型贯穿全栈，编译时和运行时双重校验
4. **协议版本兼容**：一套代码支持多版本规范，通过版本协商自动适配
5. **生产就绪**：内置认证、可观测性、安全防护、优雅关闭等生产必需能力
6. **异步原生**：anyio 抽象层同时支持 asyncio/trio，精细的取消和超时控制

这套架构使得 MCP Server 的开发体验类似于 Web 框架——声明式的装饰器、自动的协议处理、内置的安全和监控——同时保留了底层的完整控制能力。
