# Firecrawl

## 概述

Firecrawl 是一个网页抓取工具。

**仓库**: https://github.com/firecrawl/firecrawl | **语言**: Python

## 核心架构

> **项目**: [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl)
> **Stars**: 179K+ | **Forks**: 9.7K | **License**: AGPL-3.0
> **定位**: 面向 AI Agent 的 Web 上下文 API——搜索、抓取、交互，规模化运行

Firecrawl 采用 **monorepo** 结构，核心目录布局如下：

[详见源码]

**运行时由以下微服务组成**：
1. **API Server** — Express.js 主服务，处理所有 HTTP 请求
2. **Playwright Service** — 独立的浏览器渲染微服务（端口 3000）
3. **Redis** — 缓存、限流、分布式锁
4. **PostgreSQL (nuq-postgres)** — 持久化存储（队列后端、任务状态）
5. **BullMQ Workers** — 异步任务处理（深度研究、LLMs.txt 生成、计费、预抓取）

Firecrawl 的 API 层采用 **多版本并存** 策略：

```typescript
// index.ts 中的路由注册
app.use(v0Router);        // 旧版兼容
app.use("/v1", v1Router); // v1 API
app.use("/v2", v2Router); // v2 API（当前主版本）
app.use("/labs", labsRouter);        // 实验性功能
app.use("/exchange", exchangeRouter); // 交换/市场
app.use(adminRouter);                // 管理后台
```

**核心端点**（6 大功能）：
| 端点 | 功能 | 特点 |
|------|------|------|
| `/v2/scrape` | 单页抓取 | 支持 Markdown/HTML/截图/JSON/音频/视频 |
| `/v2/crawl` | 全站爬取 | 异步任务，返回 job ID，支持 webhook 回调 |
| `/v2/search` | 网络搜索 | 聚合搜索结果 + 全文抓取 |
| `/v2/map` | URL 发现 | 快速发现站点所有 URL |
| `/v2/agent` | 自主数据采集 | LLM 驱动，描述需求即可获取数据 |
| `/v2/scrape/{id}/interact` | 页面交互 | AI 驱动的点击、导航、操作 |

**Zod Schema 验证**贯穿所有请求和响应，v2 类型定义在 `controllers/v2/types.ts` 中，使用 `z.strictObject` 防止未识别字段。

Firecrawl 的架构体现了 **"面向 AI 的 Web 基础设施"** 这一设计理念：

| 维度 | 设计选择 | 意义 |
|------|----------|------|
| 语言 | TypeScript (Node.js) | 全栈统一，异步 I/O 适合高并发网络请求 |
| 架构模式 | Monorepo + 微服务 | API 服务 + Playwright 服务独立扩展 |
| 核心算法 | 多引擎 Waterfall | 自动降级，最大化成功率 |
| 数据处理 | Transformer Pipeline | 灵活的格式转换和 LLM 增强 |
| 队列系统 | BullMQ + NUQ 双队列 | 轻量任务用 Redis，核心任务用 PostgreSQL |
| 限流 | Redis + 多级计划 | 精细化流量控制 |
| 安全 | 威胁保护 + 零数据保留 | 企业级安全合规 |
| AI 集成 | Agent + MCP + Skills | 原生支持 AI Agent 生态 |
| 可观测性 | OTel + Winston + PostHog | 全链路追踪 |
| 部署 | Docker Compose + K8s | 灵活的部署选项 |

Firecrawl 从一个简单的"网页转 Markdown"工具，演进为一个完整的 **Web 上下文 API 平台**，其架构演进路径值得所有面向 AI 的基础设施项目参考。

## 关键技术

Firecrawl 自我定位为"The context API to search, scrape, and interact with the web at scale"。它不是传统意义上的爬虫框架，而是一个 **面向 AI Agent 的 Web 数据基础设施层**。其核心使命是：将互联网上的任意网页转化为干净的 Markdown、结构化 JSON 或截图，供 LLM/Agent 消费。

与传统爬虫（Scrapy、Crawlee）不同，Firecrawl 的设计哲学是 **API-first + Agent-native**：
- 提供 REST API 而非库调用，任何语言都能通过 HTTP 接入
- 内置 LLM 提取（structured extraction）、交互式操作（Interact）、自主数据采集（Agent）等 AI 原生能力
- 提供 10+ 语言 SDK（Python、Node.js、Go、Java、Rust、Ruby、.NET、PHP、Elixir）
- 提供 MCP Server、CLI Skills 等 Agent 集成入口

Firecrawl 内置了 **Web 威胁保护**层（`lib/threat-protection/`）：

- **URL 安全检查** — `checkUrl()` 对每个请求的 URL 进行威胁检测
- **Google Web Risk** — 集成 Google Web Risk API 进行恶意 URL 识别
- **URL 规范化** — `canonicalizeUrl()` 统一 URL 格式避免绕过
- **重定向复查** — 跟踪重定向链，对每个重定向目标重新检查
- **不安全域名阻断** — `UnsafeDomainBlockedError` 阻止访问已知恶意域名
- **零数据保留** — `zeroDataRetention` 模式支持不存储抓取数据（合规需求）
- **SIEM 日志** — 安全事件通过 RabbitMQ 发送到 SIEM 系统
- **Prompt 注入检测** — 检测并阻止 LLM 提取中的 prompt 注入攻击

**DNS 安全**：
- `cacheableLookup` 安装到全局 HTTP/HTTPS agent，提供 DNS 缓存
- 支持 TLS 跳过验证（`skipTlsVerification` flag）

---

## 对openmate的启示

1. **Soft abort at 0.667 × timeout** — cleanup window before hard kill.
2. **`WaterfallNextEngineSignal`** as control flow — explicit next-engine, not exception roulette.
3. **Typed scrape error taxonomy** (12+ classes) — enables precise retry and HTTP mapping.
4. **408 vs 500 mapping** for timeout vs server error.
5. **Backlog deadline differs by job class** (crawl vs monitoring vs scrape).
6. **Per-team concurrency + separate crawl pool** — noisy-neighbor isolation.
7. **Large async jobs intentionally outlive requests** — document it, handle in timeout path.
8. **Rust core + TS orchestration

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（57-firecrawl.md）
- MiMo报告（firecrawl.md）
