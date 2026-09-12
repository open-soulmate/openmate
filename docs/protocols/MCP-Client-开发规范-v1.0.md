# MCP Client 开发规范 v1.0

> 创建日期：2026-09-09
> 状态：正式

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

| 传输 | 实现 | 说明 |
|------|------|------|
| **stdio** | 子进程 | Client 启动 Server 子进程，stdin/stdout 通信 |
| **Streamable HTTP** | HTTP POST | Server 暴露 `/mcp` 端点，Client POST JSON-RPC |

**第一期只实现 stdio**，Streamable HTTP 后续迭代。

### 2.3 核心方法

```json
// 发现工具
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
// 返回：{tools: [{name, title, description, inputSchema}]}

// 调用工具
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tool_name","arguments":{"key":"val"}}}
// 返回：{content: [{type:"text", text:"..."}], isError: false}
```

## 3. 代码结构

```
mcp-client/
├── main.py                  # 入口，FastAPI，端口 8094
├── server.py                # MCP Client 核心逻辑
├── connection.py            # 单连接管理（stdio 子进程 + JSON-RPC）
├── registry.py              # 多 Server 连接池 + 工具发现缓存
├── models.py                # 数据模型（ServerConfig, Tool, ToolResult）
├── routes/
│   ├── servers.py           # Server CRUD API
│   └── tools.py             # 工具发现 + 调用 API
└── requirements.txt
```

## 4. REST API 设计

### 4.1 Server 管理

```
GET    /api/mcp/servers              # 列出所有已配置的 MCP Server
POST   /api/mcp/servers              # 添加 Server
GET    /api/mcp/servers/{id}         # 获取单个 Server 详情
DELETE /api/mcp/servers/{id}         # 删除 Server
POST   /api/mcp/servers/{id}/connect # 连接 Server（启动子进程 + 握手）
POST   /api/mcp/servers/{id}/disconnect  # 断开连接
```

### 4.2 工具操作

```
GET    /api/mcp/servers/{id}/tools   # 列出该 Server 的工具
POST   /api/mcp/tools/call           # 调用工具
  body: {server_id, tool_name, arguments}
  返回: {content: [...], isError: false}
```

### 4.3 健康检查

```
GET    /api/mcp/health               # 服务健康状态
GET    /api/mcp/status               # 所有 Server 连接状态
```

## 5. 核心实现要求

### 5.1 连接管理（connection.py）

- 每个 MCP Server 一个子进程
- JSON-RPC request/response 通过 id 匹配（asyncio.Future）
- stdout 逐行读取（newline-delimited, UTF-8）
- 子进程崩溃自动检测 + 状态更新
- 超时机制（默认 30s）

### 5.2 连接池（registry.py）

- 管理多个 Server 连接
- 工具发现结果缓存（连接时自动 `tools/list`）
- 支持按 server_id 查找工具
- 支持跨 Server 工具聚合（`list_all_tools()`）

### 5.3 Server 配置（models.py）

```python
class ServerConfig:
    id: str           # UUID
    name: str         # 用户定义名称
    transport: str    # "stdio" | "streamable_http"
    command: str      # stdio: 可执行命令（如 "npx", "uv"）
    args: list[str]   # stdio: 命令参数
    env: dict[str, str]  # 环境变量
    url: str          # HTTP: Server URL
    auto_connect: bool  # 启动时自动连接
    status: str       # "disconnected" | "connecting" | "connected" | "error"
    tools: list[Tool] # 缓存的工具列表
```

## 6. 与 Agent 集成

### 6.1 ACP Proxy 集成方式

Agent（如 SoulMate）需要调用外部工具时：
1. Agent 通过 HTTP 调用 MCP Client（:8094）的 `tools/call`
2. MCP Client 转发到对应的 MCP Server 子进程
3. 结果返回给 Agent

**Agent 不直接管理 MCP 连接**，只通过 REST API 调用。

### 6.2 Agent 工具注入

MCP Client 提供 `GET /api/mcp/tools/all` 聚合所有已连接 Server 的工具列表，Agent 可以将这些工具注入到 LLM function-calling schema 中。

## 7. 前端集成

### 7.1 MCP 页面增强

现有 `/mcp` 页面已有 Server 管理 UI，需要增加：
1. **真实连接**：connect/disconnect 调用 MCP Client API（:8094）
2. **工具列表**：从 MCP Client 获取，不是从数据库
3. **工具测试面板**：选择工具 → 填参数 → 调用 → 显示结果
4. **连接状态实时更新**：WebSocket 或轮询

### 7.2 API 域名

前端调用 MCP Client 的 base URL：`http://${hostname}:8094`

## 8. 启动与部署

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
mcp>=2.0.0
```

## 9. 与现有代码的关系

### 可复用

- `acp-proxy/agent/mcp_client.py` 中的 `MCPServerConnection` 和 `MCPClient` 类
  - **搬移到** `mcp-client/connection.py` 和 `mcp-client/registry.py`
  - **从 acp-proxy 中删除**

### 不复用

- `acp-proxy/mcp/server.py` — 这是管控平面，和 MCP Client 无关
- `opensoul/src/mcp/server_registry.py` — 数据库 stub，用新的 registry 替代

## 10. 开发步骤（MiMo 执行）

### Step 1：创建 mcp-client/ 独立服务
- 从 acp-proxy/agent/mcp_client.py 提取核心代码
- 创建 FastAPI 入口 main.py（端口 8094）
- 实现 connection.py + registry.py

### Step 2：实现 REST API
- servers.py：Server CRUD + connect/disconnect
- tools.py：工具发现 + 调用

### Step 3：连接前端
- 修改前端 MCP 页面，调用 :8094 API
- 添加工具测试面板

### Step 4：清理 acp-proxy
- 删除 acp-proxy/agent/mcp_client.py
- 确认无其他代码依赖

### Step 5：测试验证
- 启动 MCP Client 服务
- 添加一个测试 MCP Server（如 filesystem）
- 验证 connect → list_tools → call_tool 完整流程

## 11. Pitfalls

1. **不要把 MCP 代码放在 acp-proxy/ 下** — 独立服务，和 A2A 一样
2. **不要用数据库存工具缓存** — 内存缓存，连接时刷新
3. **不要让 Agent 直接管 MCP 连接** — Agent 只调 REST API
4. **stdio 子进程要设超时** — 默认 30s，防止 Server 卡死
5. **子进程崩溃要检测** — asyncio.create_subprocess_exec 的 returncode
6. **JSON-RPC id 要唯一** — 用递增计数器，不要用随机数
7. **不要忽略 notifications** — Server 可能发 notification（无 id），要处理
8. **环境变量要隔离** — 不要把父进程 env 全传给子进程
