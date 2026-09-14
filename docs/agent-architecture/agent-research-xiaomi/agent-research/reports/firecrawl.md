# firecrawl/firecrawl — Web 抓取 API / 异步长任务 / 自托管 调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/firecrawl/firecrawl（~180k★） |
| 文档 | https://docs.firecrawl.dev |
| 语言 | 主体 TypeScript（`apps/api`）+ Go SDK / 多语言 SDK |
| License | 主体 AGPL-3.0；部分 SDK/UI 为 MIT |
| 定位一句话 | 面向 Agent 的 Web 上下文 API：搜索、抓取、交互，输出 LLM-ready Markdown/结构化 JSON |
| 部署 | 托管云（firecrawl.dev）或 Docker Compose 自托管 |

> 对 openmate：Firecrawl 把「网页 → 干净上下文」做成可调用的长任务服务。**异步 Job ID + 轮询状态**（crawl/batch）、**Interact 会话（scrape_id 上多步点击）**、**Agent 端点（prompt → 结构化结果 + sources）**、自托管栈里 **NuQ PostgreSQL 队列 + Redis + RabbitMQ + Playwright** 对 openmate 的「研究/采集类长任务」参考价值高。

---

## 1. 系统架构

### 1.1 产品端点（v2）

| 端点 | 用途 |
|---|---|
| **Search** | 全网搜索并带回页面全文 |
| **Scrape** | URL → markdown / HTML / 截图 / 结构化 JSON；可带 Actions（click/scroll/write/wait） |
| **Interact** | 在已有 `scrape_id` 上用 prompt 或代码继续操作页面 |
| **Agent** | 自然语言描述数据需求，自动搜索/导航/取回；可 schema、可指定 URLs、可选 effort |
| **Crawl** | 整站爬取，返回 job ID，异步轮询 |
| **Map** | 快速发现站点全部 URL（可 search 过滤） |
| **Batch Scrape** | 批量 URL 异步抓取 |

### 1.2 自托管栈（docker-compose）

当前 revision Compose 运行：

- **Firecrawl API + Workers**
- **Playwright**（内置抓取引擎；basic fetch fallback）
- **Redis**、**RabbitMQ**
- **NuQ PostgreSQL**（默认队列后端；可选 `NUQ_BACKEND=fdb` → FoundationDB）
- 仅 API 默认发布到宿主机 `:3002`

官方 SELF_HOST 提示：

- 先用精确 tag，不要漂 `main`
- 首跑 `USE_DB_AUTHENTICATION=false`（完整鉴权需先备好 DB schema）
- 生产前自备：TLS、网络策略、NuQ/Redis/RabbitMQ **持久卷与备份**（根 Compose **默认无持久卷**）
- Queue Admin UI 默认关闭；开启需强 `BULL_AUTH_KEY`

K8s：`examples/kubernetes/cluster-install/` 与 Helm chart 作为起点，非生产完备架构。

---

## 2. 四个关键维度深潜

### 2.1 长任务 / 异步 Job

**Crawl 异步协议**（Batch 类似）：

```
POST /v2/crawl  → { "id": "123-456-789", "url": ".../crawl/{id}" }
GET  /v2/crawl/{id} → { status, total, completed, creditsUsed, data[] }
```

- SDK（Py/Node/Go/…）**自动轮询**直至完成
- 客户端可自行轮询；适合挂到 openmate 的 job runner
- 大站控制：`limit`、`scrapeOptions.formats`、include/exclude 路径

**Agent 端点**：一次 prompt 完成多步取数；`effort`（low/medium/high）调推理预算；`spark-*` 模型；支持 Pydantic/schema 结构化输出与 `sources[]`。

### 2.2 错误恢复 / 可靠性

| 机制 | 说明 |
|---|---|
| Job 状态机 | `scraping` / `completed` / `failed` 等；可对 failed 页重试 |
| 队列后端 | NuQ on PostgreSQL（默认）或 FoundationDB；API/Worker 分离 |
| 代理/限流/JS 页 | 云侧「我们处理 hard stuff」：轮换代理、编排、rate limit；自托管需自担 |
| Playwright fallback | 浏览器引擎失败可降级 basic fetch |
| robots.txt | 默认遵守；合规责任在用户 |
| P95 | 官方宣称 3.4s（云侧百万页基准） |

自托管恢复语义：**依赖你为 NuQ/Redis/RabbitMQ 配的持久化**；否则容器替换即丢队列与状态。

### 2.3 工具鉴权

- **API Key**：`Authorization: Bearer fc-...`；环境变量 `FIRECRAWL_API_KEY`
- 自托管默认 **无鉴权**（`USE_DB_AUTHENTICATION=false`）；对外暴露前必须自建完整鉴权设计
- 无「按终端用户 OAuth 连 Gmail/GitHub」语义——那是 Composio/n8n Credentials 的领域；Firecrawl 的 auth 是 **API 调用方 key + 站点侧登录态**（Actions/Interact 可在页面内登录后操作）

### 2.4 Agent 接入

- **MCP**：`npx -y firecrawl-mcp` + `FIRECRAWL_API_KEY`
- **CLI/Skills**：`npx -y firecrawl-cli@latest init --all --browser`；Claude Code / OpenCode 等可装
- **Agent Onboarding**：`curl -s https://firecrawl.dev/agent-onboarding/SKILL.md`
- 集成：n8n、Zapier、Lovable 等
- SDK 覆盖 Python / Node / Go / Java / Elixir / Rust / Ruby / .NET / PHP

---

## 3. 对 openmate 的可借鉴点

1. **P0 — 异步 Job 协议**：提交返回 `id`，客户端/SDK 轮询 `status/total/completed/data`；openmate 长采集任务应统一此形状。
2. **P0 — 执行器与 API 分离**：API 只收单入队，Worker 池消费；与 n8n queue mode 同构。
3. **P1 — Interact 会话句柄**：`scrape_id` 上多步操作，对应 openmate「浏览器会话」对象，避免每步新开页。
4. **P1 — Agent 端点抽象**：用户只给意图 + schema + sources，内部多跳导航；可作为 openmate「研究工具」的对外契约。
5. **P1 — 队列选型**：默认 NuQ-on-Postgres（少一个专用 MQ）；需要再上 Redis/RabbitMQ/FDB。
6. **P2 — 自托管诚实边界**：Compose 无持久卷、默认无鉴权——文档必须像 Firecrawl 一样写清「生产你负责什么」。
7. **License 注意**：AGPL-3.0 主体，若修改并对外提供服务需评估传染性；SDK 多为 MIT。

---

## 4. 参考链接

- README：https://github.com/firecrawl/firecrawl
- 自托管说明：https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md
- 自托管指南：https://docs.firecrawl.dev/contributing/self-host
- API Reference：https://docs.firecrawl.dev/api-reference/introduction
- MCP Server：https://github.com/firecrawl/firecrawl-mcp-server
