# modelcontextprotocol/python-sdk — MCP 工具协议基础设施调研

> 目标：为 openmate 提供工具协议、资源/提示、传输层与权限模型参考。
> 来源：github.com/modelcontextprotocol/python-sdk、modelcontextprotocol.io 规范 2026-07-28。

---

## 1. 项目定位

MCP（Model Context Protocol）是 LLM 应用与外部数据/工具的**标准化集成协议**，类似“给 LLM 用的 HTTP API”。

- 传输无关的 JSON-RPC 2.0 消息
- Host（LLM 应用） / Client（连接器） / Server（能力提供方）三角
- Python SDK v2 重写，支持规范 2026-07-28 及更早版本
- TypeScript SDK 概念上同构（同一协议）

Python 要求 3.10+；安装：`pip install "mcp[cli]"` 或 `uv add "mcp[cli]"`。

---

## 2. 三大服务端原语（Server Features）

| 原语 | 控制方 | 说明 | 典型例子 |
|------|--------|------|----------|
| **Prompts** | 用户控制 | 模板/工作流，由用户选择调用 | 斜杠命令、菜单项 |
| **Resources** | 应用控制 | 结构化数据，由 Client 挂载管理 | 文件内容、git 历史 |
| **Tools** | 模型控制 | LLM 可自动发现并执行的函数 | API POST、写文件 |

控制层级决定了**权限边界**：Tools 必须有 human-in-the-loop；Resources 由应用策略决定是否注入；Prompts 由用户显式触发。

---

## 3. 工具协议（Tools）深度

### 3.1 发现与调用

```
Client → tools/list        （分页 + 缓存，ttlMs / cacheScope）
Server → tools[]           （name, title, description, inputSchema, outputSchema, annotations）
LLM    → 选择工具
Client → tools/call        （name, arguments）
Server → result            （content[] 或 structuredContent + isError）
```

### 3.2 能力协商

```json
{ "capabilities": { "tools": { "listChanged": true } } }
```

- `listChanged`：工具集变化时可推送 `notifications/tools/list_changed`
- 工具列表**不得**因连接内其他请求而变化，**可**因 per-request 授权范围变化
- 推荐确定性排序 → 提高 LLM prompt cache 命中

### 3.3 Schema

- `inputSchema`：JSON Schema（默认 2020-12），无参数时用 `{"type":"object","additionalProperties":false}`
- `outputSchema`：可选，结构化输出校验
- `x-mcp-header`：可将参数镜像为 HTTP 头（Streamable HTTP），便于代理/WAF 路由；**禁止**用于密码/密钥/PII
- 工具名：1–128 字符，`[A-Za-z0-9_.-]`，server 内唯一；跨 server 聚合时 Client 应做前缀消歧

### 3.4 有状态工具（无协议级 Session）

MCP **没有**隐式 per-connection 会话状态。跨调用状态必须：

1. 创建工具返回**显式 handle**（如 `basket_id`）
2. 后续调用以参数携带 handle
3. Handle 要求：
   - **授权**：handle 是名字不是能力，每次调用都校验权限
   - **不透明**：不编码内部结构，防猜测
   - **寿命**：在 description 中声明过期策略
   - **过期错误**：明确返回，让模型可重建

### 3.5 错误模型

| 类型 | 通道 | 例子 | 模型可自愈？ |
|------|------|------|--------------|
| Protocol Error | JSON-RPC error | 未知工具、请求畸形 | 弱 |
| Tool Execution Error | `result.isError: true` | 参数校验失败、业务错误 | 强（应反馈给 LLM） |

另有 **InputRequiredResult**：工具返回 `resultType: "input_required"`，通过 elicitation 请求补充输入后以 `inputResponses` + `requestState` 重试（新 JSON-RPC id）。

### 3.6 安全要求（规范 MUST/SHOULD）

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

**Trust & Safety**：tool annotations 在未受信 server 来源时视为 untrusted；始终应有 human 能否决工具调用。

---

## 4. Resources 与 Prompts（概要）

- **Resources**：URI 寻址数据，支持 text/binary，annotations（audience/priority/lastModified）
- **Prompts**：带参数的模板，用户侧触发
- Client 侧还有 **Elicitation**：Server 反向向用户要信息

---

## 5. 传输层（Transports）

协议语义在所有 transport 上一致；transport 只是**绑定**（framing / 元数据 / 取消）。

| Transport | 说明 |
|-----------|------|
| **stdio** | 换行分隔 JSON-RPC，跑在 Client 拉起的子进程标准流上 |
| **Streamable HTTP** | 单一 MCP endpoint，每条消息 HTTP POST；响应为 JSON 或 request-scoped SSE |
| Custom | 允许，但必须保留 JSON-RPC 格式与消息模式；可靠双向字节流建议复用 stdio framing |

要点：

- 消息 MUST 为 UTF-8
- 协议元数据在 body 的 `_meta.io.modelcontextprotocol/*`；Streamable HTTP 可镜像到 HTTP 头
- 取消：stdio 用 `notifications/cancelled`；Streamable HTTP 关闭响应流
- **2026-07-28 重大变化**：无连接级 session + initialize 握手；Server 不能再主动发起 JSON-RPC 请求；旧版有兼容矩阵

---

## 6. Python SDK v2 用法速览

### Server（15 行）

```python
from mcp.server import MCPServer

mcp = MCPServer("Demo")

@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

@mcp.resource("greeting://{name}")
def greeting(name: str) -> str:
    return f"Hello, {name}!"
```

类型注解即 Schema，无需手写 JSON Schema / 校验 / 协议解析。

### Client（10 行）

```python
from mcp import Client

async with Client("http://localhost:8000/mcp") as client:
    result = await client.call_tool("add", {"a": 1, "b": 2})
    print(result.structured_content)
```

URL → Streamable HTTP；也可 stdio 子进程或自定义 transport。

CLI：`mcp dev` / `mcp run` / `mcp install`。

---

## 7. Extensions（可选扩展）

- **Tasks**：长时任务异步执行、轮询、durable handle
- **Skills over MCP**：结构化 Agent 工作流指令
- **MCP Apps**：对话内嵌 UI（图表、表单）

---

## 8. openmate 应借鉴的设计

### 8.1 工具协议

1. **三原语分权**：openmate 的“能力”应拆成 Tool（模型可调）/ Resource（应用注入）/ Prompt（用户触发），权限与审批策略分开。
2. **显式 Schema + 结构化输出**：inputSchema/outputSchema 双向校验，崩溃后重放可验证。
3. **有状态 handle 模式**：跨调用状态（沙箱、会话、事务）用显式不透明 handle，带 TTL 与过期错误——**无隐式 session 状态 = 崩溃恢复友好**。
4. **双错误通道**：协议错误（不可恢复） vs 执行错误（`isError`，可喂给 LLM 自愈）。
5. **listChanged + 确定性排序**：工具热插拔通知 + 缓存友好。
6. **InputRequired / elicitation**：长时工具可中断等待用户输入后续跑。

### 8.2 权限 / 安全

- 默认 human-in-the-loop：敏感工具调用前确认
- 未信 server 的 annotations 不可作为安全依据
- Server 侧强制：校验、ACL、限流、输出净化
- Client 侧：超时、审计日志、展示输入防外泄

### 8.3 HA / 崩溃恢复

- **传输解耦**：stdio 适合本地子进程崩溃隔离；Streamable HTTP 适合多实例/负载均衡
- **无连接状态**：新规范去掉 session，每请求自包含 → 更易水平扩展与故障切换
- **取消语义标准化**：崩溃时可明确取消 in-flight 请求
- **per-request 能力协商**：工具列表可随授权变化，支持多租户

### 8.4 工具隔离

- 工具进程独立（stdio 子进程）或独立 HTTP 服务 → Agent 主进程崩溃不拖垮工具
- 与沙箱（E2B/Daytona）组合：危险代码执行工具后端指向沙箱
- handle 授权模型：每个 handle 每次调用都验权，防止权限提升

### 8.5 落地建议

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

## 9. 参考链接

- https://github.com/modelcontextprotocol/python-sdk
- https://modelcontextprotocol.io/specification/2026-07-28
- https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
- https://py.sdk.modelcontextprotocol.io/
