# modelcontextprotocol/python-sdk + typescript-sdk — MCP 工具协议基础设施深度研究报告

> 仓库: https://github.com/modelcontextprotocol/python-sdk, https://github.com/modelcontextprotocol/typescript-sdk  
> 抓取通道: cdn.jsdelivr.net/gh/modelcontextprotocol/python-sdk@main  
> 版本快照: main @ 2026-09-13；规范 2026-07-28  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供工具协议、资源/提示、传输层与权限模型参考

---

## 0. 诚实性说明

- 成功拉取: `src/mcp/server/session.py`（完整 ServerSession，约 400 行）
- 未能直接拉取: TypeScript SDK 源码文件（仓库结构与 Python SDK 同构，协议层面结论基于规范 + Python SDK 实读）
- 所有代码引用为源码实读，行级锚点标注

---

## 1. 项目定位

MCP（Model Context Protocol）是 LLM 应用与外部数据/工具的**标准化集成协议**，类似"给 LLM 用的 HTTP API"。

- 传输无关的 JSON-RPC 2.0 消息
- Host（LLM 应用） / Client（连接器） / Server（能力提供方）三角
- Python SDK v2 重写，支持规范 2026-07-28 及更早版本
- TypeScript SDK 概念上同构（同一协议）

Python 要求 3.10+；安装：`pip install "mcp[cli]"` 或 `uv add "mcp[cli]"`。

---

## 2. ServerSession — 核心会话代理（源码实读）

### 2.1 类结构

```python
class ServerSession:
    """Per-request proxy for server-to-client requests and notifications.

    Built once per inbound request by the kernel's `_make_context`. Holds two
    `Outbound` channels: the request-scoped one (the per-request
    `DispatchContext`, which on streamable HTTP routes onto the originating
    POST's response stream) and the connection's standalone channel
    (`connection.outbound`).
    """
```

### 2.2 双通道模型

```python
def __init__(
    self,
    request_outbound: DispatchContext[Any],
    connection: Connection,
    *,
    request_meta: types.RequestParamsMeta | None = None,
) -> None:
    self._request_outbound = request_outbound
    self._connection = connection
    self._log_is_request_scoped = connection.protocol_version in MODERN_PROTOCOL_VERSIONS
    self._allowed_log_levels = allowed_log_levels(connection.protocol_version, request_meta)
```

**关键设计**: `related_request_id` 是通道选择器 — present 用 request-scoped，absent 用 standalone。永不跨越 `Outbound` Protocol。

### 2.3 能力协商

```python
@property
def client_capabilities(self) -> types.ClientCapabilities | None:
    """Prefer this over `client_params.capabilities`: on 2026-07-28+ the
    request envelope declares capabilities while client info stays optional.
    """
    return self._connection.client_capabilities
```

### 2.4 协议版本

```python
@property
def protocol_version(self) -> str:
    """Populated at `Connection` construction and overwritten once the
    handshake commits on the loop path; never `None`."""
    return self._connection.protocol_version
```

---

## 3. 三大服务端原语

| 原语 | 控制方 | 说明 | 典型例子 |
|------|--------|------|----------|
| **Prompts** | 用户控制 | 模板/工作流，由用户选择调用 | 斜杠命令、菜单项 |
| **Resources** | 应用控制 | 结构化数据，由 Client 挂载管理 | 文件内容、git 历史 |
| **Tools** | 模型控制 | LLM 可自动发现并执行的函数 | API POST、写文件 |

---

## 4. 工具协议深度

### 4.1 发现与调用

```
Client → tools/list        （分页 + 缓存，ttlMs / cacheScope）
Server → tools[]           （name, title, description, inputSchema, outputSchema, annotations）
LLM    → 选择工具
Client → tools/call        （name, arguments）
Server → result            （content[] 或 structuredContent + isError）
```

### 4.2 Schema 规范

- `inputSchema`: JSON Schema（默认 2020-12），无参数时用 `{"type":"object","additionalProperties":false}`
- `outputSchema`: 可选，结构化输出校验
- 工具名：1–128 字符，`[A-Za-z0-9_.-]`，server 内唯一

### 4.3 有状态工具（无协议级 Session）

MCP **没有**隐式 per-connection 会话状态。跨调用状态必须：

1. 创建工具返回**显式 handle**（如 `basket_id`）
2. 后续调用以参数携带 handle
3. Handle 要求：
   - **授权**：handle 是名字不是能力，每次调用都校验权限
   - **不透明**：不编码内部结构，防猜测
   - **寿命**：在 description 中声明过期策略
   - **过期错误**：明确返回，让模型可重建

### 4.4 错误模型

| 类型 | 通道 | 例子 | 模型可自愈？ |
|------|------|------|--------------|
| Protocol Error | JSON-RPC error | 未知工具、请求畸形 | 弱 |
| Tool Execution Error | `result.isError: true` | 参数校验失败、业务错误 | 强（应反馈给 LLM） |

---

## 5. Elicitation — 反向用户交互（源码实读）

### 5.1 Form 模式

```python
async def elicit_form(
    self,
    message: str,
    requested_schema: types.ElicitRequestedSchema,
    related_request_id: types.RequestId | None = None,
) -> types.ElicitResult:
    """Send a form mode elicitation/create request."""
    return await self.send_request(
        types.ElicitRequest(
            params=types.ElicitRequestFormParams(
                message=message,
                requested_schema=requested_schema,
            ),
        ),
        types.ElicitResult,
        metadata=ServerMessageMetadata(related_request_id=related_request_id),
    )
```

### 5.2 URL 模式

```python
async def elicit_url(
    self,
    message: str,
    url: str,
    elicitation_id: str,
    related_request_id: types.RequestId | None = None,
) -> types.ElicitResult:
    """Send a URL mode elicitation/create request.

    This directs the user to an external URL for out-of-band interactions
    like OAuth flows, credential collection, or payment processing.
    """
```

### 5.3 完成通知

```python
async def send_elicit_complete(
    self,
    elicitation_id: str,
    related_request_id: types.RequestId | None = None,
) -> None:
    """Send an elicitation completion notification.

    This should be sent when a URL mode elicitation has been completed
    out-of-band to inform the client that it may retry any requests
    that were waiting for this elicitation.
    """
```

---

## 6. 日志消息 — 版本感知的请求级 opt-in（源码实读）

```python
@deprecated("The logging capability is deprecated as of 2026-07-28 (SEP-2577).")
async def send_log_message(
    self,
    level: types.LoggingLevel,
    data: Any,
    logger: str | None = None,
    related_request_id: types.RequestId | None = None,
) -> None:
    """On 2026-07-28+ delivery is a per-request opt-in: nothing is sent
    unless this request's `_meta` carried the reserved log-level key, and
    entries below the requested level are dropped (debug-logged). What is
    sent rides this request's stream regardless of `related_request_id` -
    the spec forbids `notifications/message` on any stream but the one
    carrying the response. Handshake versions send unconditionally.
    """
    if level not in self._allowed_log_levels:
        _logger.debug("dropped notifications/message at %r: not opted in at that level on this request", level)
        return
```

**设计要点**: 2026-07-28+ 日志是 per-request opt-in，非连接级。旧版本（handshake）无条件发送。

---

## 7. Sampling — 已废弃（源码实读）

```python
@deprecated("The sampling capability is deprecated as of 2026-07-28 (SEP-2577).")
async def create_message(
    self,
    messages: list[types.SamplingMessage],
    *,
    max_tokens: int,
    ...
) -> types.CreateMessageResult | types.CreateMessageResultWithTools:
```

三个重载：无 tools → `CreateMessageResult`；有 tools → `CreateMessageResultWithTools`；有 tool_choice → 同上。

验证链：`validate_sampling_tools(self.client_capabilities, tools, tool_choice)` → `validate_tool_use_result_messages(messages)`

---

## 8. Progress 报告（源码实读）

```python
async def report_progress(
    self, progress: float, total: float | None = None, message: str | None = None
) -> None:
    """Report progress for the inbound request this session is scoped to.

    A no-op when the caller did not request progress. Dispatcher-agnostic:
    on JSON-RPC the held `DispatchContext` emits ``notifications/progress``
    against the caller's token; on the in-process direct dispatcher it
    invokes the caller's callback directly.
    """
    await self._request_outbound.progress(progress, total, message)
```

---

## 9. 变更通知

```python
async def send_tool_list_changed(self) -> None:
    await self.send_notification(types.ToolListChangedNotification())

async def send_resource_list_changed(self) -> None:
    await self.send_notification(types.ResourceListChangedNotification())

async def send_prompt_list_changed(self) -> None:
    await self.send_notification(types.PromptListChangedNotification())
```

---

## 10. 传输层

| Transport | 说明 |
|-----------|------|
| **stdio** | 换行分隔 JSON-RPC，跑在 Client 拉起的子进程标准流上 |
| **Streamable HTTP** | 单一 MCP endpoint，每条消息 HTTP POST；响应为 JSON 或 request-scoped SSE |
| Custom | 允许，但必须保留 JSON-RPC 格式与消息模式 |

要点：
- 消息 MUST 为 UTF-8
- 取消：stdio 用 `notifications/cancelled`；Streamable HTTP 关闭响应流
- **2026-07-28 重大变化**：无连接级 session + initialize 握手；Server 不能再主动发起 JSON-RPC 请求

---

## 11. Extensions

- **Tasks**: 长时任务异步执行、轮询、durable handle
- **Skills over MCP**: 结构化 Agent 工作流指令
- **MCP Apps**: 对话内嵌 UI（图表、表单）

---

## 12. 安全要求（规范 MUST/SHOULD）

Server MUST：
- 校验全部 tool inputs
- 实现访问控制
- 限流 tool 调用
- 净化 tool 输出

Client SHOULD：
- 敏感操作需用户确认
- 调用前向用户展示 tool 输入（防数据外泄）
- 校验 tool 结果
- 实现调用超时
- 记录审计日志

---

## 13. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| 工具名长度 | 1–128 字符 | 规范 |
| 工具名字符集 | `[A-Za-z0-9_.-]` | 规范 |
| 日志级别 opt-in | per-request `_meta` | session.py L60-64 |
| Sampling | deprecated 2026-07-28 | session.py @deprecated |
| Roots | deprecated 2026-07-28 | session.py @deprecated |
| Logging | deprecated 2026-07-28 | session.py @deprecated |
| Elicitation form | elicit_form() 推荐 | session.py |
| Elicitation URL | elicit_url() + send_elicit_complete() | session.py |

---

## 14. 失败路径

```
Server 发送日志但级别未 opt-in
  → _logger.debug("dropped notifications/message")
  → 静默丢弃

Sampling tools 但 client 不支持
  → validate_sampling_tools() 抛 MCPError

Tool result 结构不合法
  → validate_tool_use_result_messages() 抛 ValueError

无 back-channel 时 server 发起请求
  → NoBackChannelError

Client result 不匹配 result_type
  → pydantic.ValidationError

请求超时
  → CallOptions timeout 生效
```

---

## 15. 对 openmate 的可借鉴点

### 15.1 工具协议

1. **三原语分权**: Tool（模型可调）/ Resource（应用注入）/ Prompt（用户触发），权限与审批策略分开
2. **显式 Schema + 结构化输出**: inputSchema/outputSchema 双向校验
3. **有状态 handle 模式**: 跨调用状态用显式不透明 handle，带 TTL 与过期错误
4. **双错误通道**: 协议错误 vs 执行错误（`isError`，可喂给 LLM 自愈）
5. **listChanged + 确定性排序**: 工具热插拔通知 + 缓存友好
6. **Elicitation**: 长时工具可中断等待用户输入后续跑（form 模式 / URL 模式）

### 15.2 权限 / 安全

- 默认 human-in-the-loop：敏感工具调用前确认
- 未信 server 的 annotations 不可作为安全依据
- Server 侧强制：校验、ACL、限流、输出净化
- Client 侧：超时、审计日志、展示输入防外泄

### 15.3 HA / 崩溃恢复

- **传输解耦**: stdio 适合本地子进程崩溃隔离；Streamable HTTP 适合多实例/负载均衡
- **无连接状态**: 新规范去掉 session，每请求自包含 → 更易水平扩展与故障切换
- **取消语义标准化**: 崩溃时可明确取消 in-flight 请求
- **per-request 能力协商**: 工具列表可随授权变化，支持多租户

### 15.4 工具隔离

- 工具进程独立（stdio 子进程）或独立 HTTP 服务 → Agent 主进程崩溃不拖垮工具
- 与沙箱（E2B/Daytona）组合：危险代码执行工具后端指向沙箱
- handle 授权模型：每个 handle 每次调用都验权，防止权限提升

### 15.5 落地建议

```
短期：用 MCP 定义 openmate 工具面（Tool/Resource/Prompt 三分类）
      危险操作强制确认 + isError 反馈 LLM
中期：Streamable HTTP 传输 + 有状态 handle（沙箱/会话 ID）
      工具服务独立部署，可水平扩展
长期：Tasks 扩展做长时任务；Skills 做可复用 Agent 流程
不要：依赖隐式连接状态（新规范已去掉）
不要：把 tool annotations 当可信安全声明
```

---

## 16. 源码锚点速查

```
src/mcp/server/session.py
  class ServerSession                    # per-request proxy
  __init__: 双通道 (request_outbound + connection.outbound)
  _log_is_request_scoped = protocol_version in MODERN_PROTOCOL_VERSIONS
  send_request(): typed request + validate
  send_notification(): typed notification
  check_client_capability()
  send_log_message(): per-request opt-in, deprecated 2026-07-28
  create_message(): sampling, deprecated 2026-07-28, 3 overloads
  list_roots(): deprecated 2026-07-28
  elicit_form(): form mode elicitation
  elicit_url(): URL mode elicitation
  send_elicit_complete(): completion notification
  report_progress(): dispatcher-agnostic
  send_tool_list_changed()
  send_resource_list_changed()
  send_prompt_list_changed()
  send_resource_updated()
  send_ping()
```

---

## 17. 参考链接

- https://github.com/modelcontextprotocol/python-sdk
- https://github.com/modelcontextprotocol/typescript-sdk
- https://modelcontextprotocol.io/specification/2026-07-28
- https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
- https://py.sdk.modelcontextprotocol.io/
