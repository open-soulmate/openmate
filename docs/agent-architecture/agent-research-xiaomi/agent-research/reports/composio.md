# ComposioHQ/composio — Agent 工具目录 / 鉴权 / Session 调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/ComposioHQ/composio（~30k★，默认分支 `next`） |
| 文档 | https://docs.composio.dev |
| 语言 | TypeScript SDK（`ts/packages/core`）+ Python SDK（`python/`）+ CLI |
| License | MIT |
| 定位一句话 | 给 AI Agent 提供 1000+ 预鉴权 toolkits、按用户 session、鉴权、triggers 与沙箱 workbench |
| 形态 | 托管后端（`backend.composio.dev` API v3.1）+ 客户端 SDK + Provider 适配器 + 托管 MCP endpoint |

> 对 openmate：Composio 把「工具调用 + OAuth + 按用户隔离 + 运行时工具发现」做成产品。**Session = 运行时上下文（user + toolkits + auth + execution state）**、**Meta Tools（搜索/鉴权/执行，避免一次塞几百个 schema）**、**Connect Link / COMPOSIO_MANAGE_CONNECTIONS 暂停鉴权再重试** 是 openmate 工具层最值得抄的设计。

---

## 1. 系统架构

### 1.1 核心概念

| 概念 | 说明 |
|---|---|
| **User** | 应用侧稳定 ID（推荐 DB UUID）；连接与执行都挂在该 ID 下，天然多租户隔离 |
| **Toolkit** | 某服务的工具集合（如 `github`） |
| **Tool** | 单个动作，命名 `{TOOLKIT}_{ACTION}`（如 `GITHUB_CREATE_ISSUE`），带 input/output schema |
| **Session** | 一次 agentic run 的作用域：user + 可用 toolkits + 鉴权配置 + connected accounts + 执行状态 |
| **Connected Account** | 用户在某 toolkit 上的已连账号（可多份：工作 Gmail / 个人 Gmail） |
| **Auth Config** | 鉴权配置（managed app 或自建 OAuth app） |
| **Provider** | 把 Composio 工具适配成某框架原生格式（OpenAI / Claude Agent SDK / LangChain / CrewAI…） |

### 1.2 Session 生命周期

```python
session = composio.create(user_id="user_123")   # 新 session_id
tools   = session.tools()                       # 默认给 meta tools
# ... agent 多轮 ...
session = composio.use("session_id")            # 多轮复用，服务端持久、不过期
session.update(toolkits=["gmail","slack"], ...) # 就地改范围
```

- 每次 `create()` 新 session_id；存下 id 用 `use()` 复用
- Session 作用域含：执行日志、tool memory、MCP state、workbench 文件
- 也可 **direct execution**（`tools.get/execute`）：无运行时发现，适合确定性脚本

### 1.3 Meta Tools（上下文管理关键）

默认 session 不加载上千 tool 定义，而是给少量固定 meta tools：

1. `COMPOSIO_SEARCH_TOOLS` — 运行时按 use case 搜工具
2. 鉴权管理 — 必要时引导连接
3. 执行 — 在同一 session 上下文内调用

已知确切工具时可用 **direct tools preset**，跳过搜索但保留 session 鉴权。

**执行路径约束**：session 工具必须经 `session.execute()` 或 `provider.handle_tool_calls(session=session)`；走 user-id 直通路径会报 `can only be called inside a tool-router session`。

---

## 2. 四个关键维度深潜

### 2.1 工具鉴权（产品最深）

| 能力 | 细节 |
|---|---|
| **Managed apps（默认）** | OAuth toolkit 用 Composio 托管 app；可 BYO app 自定义 branding/scopes |
| **Connect Link** | `session.authorize()` 生成连接链接；或 agent 走 `COMPOSIO_MANAGE_CONNECTIONS` |
| **对话内暂停鉴权** | agent 可暂停 → 提示用户连接 → 完成后 **重试同一 tool call** |
| **Token 管理** | Composio 管 OAuth redirect、token exchange、refresh；连接持久，后续 session 免再认证 |
| **多账号** | 同 user 同 toolkit 可连多账号；session 创建时指定 `connected_accounts` |
| **稳定 user_id 规范** | 推荐 DB 主键；避免 email；生产禁用 `default` |

### 2.2 错误恢复 / 长任务

- **Session 持久化**：崩溃/重启后 `composio.use(session_id)` 续上下文（工具范围、鉴权、workbench 状态）
- **鉴权失败不是终点**：语义是「缺连接」→ 授权流 → 重试，而不是硬失败
- **Triggers**：事件驱动（webhook 类）入口，支撑长时监听型任务
- **Remote Sandbox Workbench**：session 作用域的远端沙箱；agent 可读文件、搜输出、写 Python、批量调 Composio 工具，**避免超长 tool response 塞爆模型上下文**
- 客户端侧重试/幂等需自建；SDK 负责轮询类操作的便捷封装

### 2.3 隔离

- **用户级**：userID 下连接与执行隔离
- **Session 级**：toolkits 白名单、auth_configs、connected_accounts 可收窄
- **Sandbox 级**：workbench 文件/变量/中间结果仅 session 内可见
- 托管后端负责密钥存储；本地 SDK 不落 OAuth secret

### 2.4 可观测 / 生态

- 执行日志挂在 session
- REST API `v3.1`（`/tools`、`/tools/execute/{slug}`、version 参数选 toolkit 版本）
- CLI：`composio search` / `execute` / `link` / `run`
- 每个 session 可暴露 **hosted MCP endpoint**（`mcp: true`）
- Provider 矩阵覆盖 OpenAI Agents、Anthropic、Claude Agent SDK、Vercel AI、Google ADK、LangChain/Graph、LlamaIndex、Mastra、CrewAI、AutoGen、Cloudflare Workers 等

---

## 3. 集成模式速查

```typescript
// TypeScript + OpenAI Agents
const composio = new Composio({ provider: new OpenAIAgentsProvider() });
const session  = await composio.create("user_123");
const tools    = await session.tools();
// Agent tools=tools → session.execute 由 provider helper 路由
```

```python
# Python
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
session = composio.create(user_id="user_123")
tools   = session.tools()
```

MCP：`session.mcp.url` + headers，任意 MCP 客户端可接。

---

## 4. 对 openmate 的可借鉴点

1. **P0 — Session 抽象**：一次任务 = user + 工具集 + 鉴权 + 执行状态的可恢复句柄；openmate 长任务应有等价 session_id 并可 `resume`。
2. **P0 — Meta tools 运行时发现**：不要把全部工具 schema 塞进上下文；给 search/auth/execute 三元组。
3. **P0 — 对话内 OAuth 暂停与重试**：鉴权作为「可恢复的工具前置条件」，而非抛错终止 agent loop。
4. **P1 — 多账号 connected accounts**：个人助理常见「工作/个人」双 Gmail、双 GitHub。
5. **P1 — Sandbox workbench 吸收大输出**：长工具结果落文件，agent 用检索而不是全量回灌。
6. **P2 — user_id 规范与 `default` 禁令**：文档层强制稳定标识，避免多用户数据串号。
7. **风险**：核心能力依赖托管云；自托管/离线需自建鉴权与工具目录。

---

## 5. 参考链接

- Session 概念：https://docs.composio.dev/docs/how-composio-works
- Quickstart / README：https://github.com/ComposioHQ/composio
- Docs 索引：https://docs.composio.dev/llms.txt
- MCP sessions：https://docs.composio.dev/docs/sessions-via-mcp
- CLI：https://docs.composio.dev/docs/cli
