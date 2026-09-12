# MCP Client 开发规范 v1.2

> 创建日期：2026-09-09
> 更新日期：2026-09-10
> 状态：正式
> 变更：v1.2 新增 Streamable HTTP 传输支持（spec 2025-06-18）

## 1. 架构定位

MCP Client 是**独立服务**，与 ACP Proxy（8092）、A2A Server（8093）平级。

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  ACP Proxy  │     │  A2A Server │     │  MCP Client │
│   :8092     │     │   :8093     │     │   :8094     │
│ 前端↔Agent  │     │ Agent↔Agent │     │ Agent↔工具  │
└─────────────┘     └─────────────┘     └─────────────┘
```

**铁律：MCP 代码不放在 acp-proxy/ 下。** 独立目录 `mcp-client/`，独立进程，独立端口。

## 2. 协议规范

基于 MCP v1.0（spec 2025-06-18），JSON-RPC 2.0。

### 2.1 生命周期

1. **初始化**：Client → `initialize`（protocolVersion + capabilities + clientInfo）→ Server 回复 capabilities → Client 发 `notifications/initialized`
2. **操作**：`tools/list`（发现工具）、`tools/call`（调用工具）
3. **关闭**：关闭传输层（stdin/连接）

### 2.2 传输方式

| 传输 | 实现 | 状态 |
|------|------|------|
| **stdio** | 子进程 | ✅ 已实现 |
| **Streamable HTTP** | HTTP POST + SSE | ✅ 已实现 |

### 2.2.1 Streamable HTTP 协议细节

基于 MCP spec 2025-06-18，替代旧版 HTTP+SSE 传输。

**连接流程**：
1. Client POST `InitializeRequest` → Server URL
2. Server 返回 `InitializeResult`（含 `Mcp-Session-Id` header，可选）
3. Client POST `InitializedNotification`（期望 202 Accepted）
4. Client POST `tools/list` 获取工具列表

**请求 Header**：
- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`
- `MCP-Protocol-Version: 2025-06-18`
- `Mcp-Session-Id: xxx`（初始化后的请求）

**响应模式**：
- `Content-Type: application/json` → 单条 JSON-RPC 响应
- `Content-Type: text/event-stream` → SSE 流，多条消息，按 `id` 匹配

**会话管理**：
- Server 可在初始化时返回 `Mcp-Session-Id`，后续请求必须携带
- 404 响应表示会话过期，Client 必须重新初始化

**创建 Server 示例**：
```json
POST /api/mcp/servers
{"name":"remote-tools","transport":"streamable_http","url":"https://example.com/mcp"}
```

### 2.3 核心方法

```json
// 发现工具
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
// 返回：{tools: [{name, title, description, inputSchema}]}

// 调用工具
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tool_name","arguments":{"key":"val"}}}
// 返回：{content: [{type:"text", text:"..."}], isError: false}
```

## 3. 代码结构（实际实现）

```
mcp-client/
├── main.py           # 入口，FastAPI，端口 8094（60行）
├── connection.py     # 连接管理：MCPServerConnection(stdio) + StreamableHTTPConnection(HTTP)（~220行）
├── registry.py       # 多 Server 连接池 + 工具发现缓存 + 跨 Server 聚合（195行）
├── models.py         # Pydantic 数据模型（58行）
├── routes/
│   ├── __init__.py
│   ├── servers.py    # Server CRUD + connect/disconnect API（130行）
│   └── tools.py      # 工具发现 + 调用 API（38行）
└── requirements.txt  # fastapi, uvicorn
```

总计约 605 行 Python 代码。

## 4. REST API（已实现 ✅）

### 4.1 Server 管理

```
GET    /api/mcp/servers              # 列出所有已配置的 MCP Server（含状态和工具数量）
POST   /api/mcp/servers              # 添加 Server（body: {name, command, args, env}）
DELETE /api/mcp/servers/{id}         # 删除 Server（自动断开连接）
POST   /api/mcp/servers/{id}/connect # 连接 Server（启动 stdio 子进程 + MCP 握手 + 工具发现）
POST   /api/mcp/servers/{id}/disconnect  # 断开连接
```

### 4.2 工具操作

```
GET    /api/mcp/servers/{id}/tools   # 列出该 Server 的工具（含 inputSchema）
POST   /api/mcp/tools/call           # 调用工具
  body: {"server_id": "xxx", "tool_name": "read_file", "arguments": {"path": "/tmp/test.txt"}}
  返回: {"content": [{"type": "text", "text": "..."}], "structured_content": {...}, "is_error": false}
GET    /api/mcp/tools/all            # 聚合所有已连接 Server 的工具列表
```

### 4.3 健康检查

```
GET    /api/mcp/health               # {"status":"ok","component":"mcp-client"}
GET    /api/mcp/status               # 所有 Server 连接状态概览
```

## 5. 核心实现

### 5.1 连接管理（connection.py）

- `MCPServerConnection` 类：管理单个 stdio 子进程
- JSON-RPC request/response 通过 id 匹配（asyncio.Future）
- stdout 逐行读取（newline-delimited, UTF-8）
- 写锁防止并发写冲突
- 超时机制（默认 30s）
- 优雅关闭：terminate → wait → kill

### 5.2 连接池（registry.py）

- `MCPRegistry` 类：管理多个 Server 连接
- 内存存储 Server 配置（dict，无数据库）
- 连接时自动 `tools/list` 缓存工具列表
- 支持按 server_id 查找工具
- 支持跨 Server 工具聚合（`list_all_tools()`）

### 5.3 数据模型（models.py）

```python
class ServerConfig(BaseModel):
    id: str                  # UUID（自动生成）
    name: str                # 用户定义名称
    transport: str = "stdio" # 传输方式（第一期只有 stdio）
    command: str             # 可执行命令（如 "npx", "uv"）
    args: list[str] = []    # 命令参数
    env: dict[str, str] = {} # 环境变量（可选）
    auto_connect: bool = False  # 启动时自动连接
    status: str = "disconnected"  # disconnected | connecting | connected | error
    tools: list[dict] = []   # 缓存的工具列表
    error: str | None = None # 错误信息
```

## 6. 与 Agent 集成

Agent（如 SoulMate）通过 HTTP 调用 MCP Client：

```
Agent → HTTP POST :8094/api/mcp/tools/call → MCP Client → stdio → MCP Server → 结果返回
```

**Agent 不直接管理 MCP 连接**，只通过 REST API 调用。

## 7. 启动与部署

```bash
# 启动
cd ~/openmate/mcp-client && PYTHONPATH=. python main.py --port 8094

# 健康检查
curl http://127.0.0.1:8094/api/mcp/health
```

### 依赖

```
fastapi
uvicorn
```

## 8. 已验证的测试流程

1. ✅ 健康检查：`GET /api/mcp/health`
2. ✅ 添加 Server：filesystem MCP（`npx -y @modelcontextprotocol/server-filesystem /tmp`）
3. ✅ 连接 Server：stdio 子进程启动 + MCP initialize 握手
4. ✅ 工具发现：14 个工具（read_file, write_file, list_directory, etc.）
5. ✅ 工具调用：`list_directory("/tmp")` 返回目录列表

## 9. Pitfalls

1. **不要把 MCP 代码放在 acp-proxy/ 下** — 独立服务，和 A2A 一样
2. **不要用数据库存工具缓存** — 内存缓存，连接时刷新
3. **不要让 Agent 直接管 MCP 连接** — Agent 只调 REST API
4. **stdio 子进程要设超时** — 默认 30s，防止 Server 卡死
5. **子进程崩溃要检测** — 检查 returncode，更新 status
6. **JSON-RPC id 要唯一** — 用递增计数器，不要用随机数
7. **不要忽略 notifications** — Server 可能发 notification（无 id），跳过即可
8. **写锁** — stdin 写入需要加锁，防止并发请求乱序
