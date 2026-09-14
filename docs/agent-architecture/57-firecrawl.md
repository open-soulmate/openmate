# 57 - Firecrawl 架构深度分析

> **项目**: [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl)
> **Stars**: 179K+ | **Forks**: 9.7K | **License**: AGPL-3.0
> **定位**: 面向 AI Agent 的 Web 上下文 API——搜索、抓取、交互，规模化运行

---

## 一、项目定位与核心价值

Firecrawl 自我定位为"The context API to search, scrape, and interact with the web at scale"。它不是传统意义上的爬虫框架，而是一个 **面向 AI Agent 的 Web 数据基础设施层**。其核心使命是：将互联网上的任意网页转化为干净的 Markdown、结构化 JSON 或截图，供 LLM/Agent 消费。

与传统爬虫（Scrapy、Crawlee）不同，Firecrawl 的设计哲学是 **API-first + Agent-native**：
- 提供 REST API 而非库调用，任何语言都能通过 HTTP 接入
- 内置 LLM 提取（structured extraction）、交互式操作（Interact）、自主数据采集（Agent）等 AI 原生能力
- 提供 10+ 语言 SDK（Python、Node.js、Go、Java、Rust、Ruby、.NET、PHP、Elixir）
- 提供 MCP Server、CLI Skills 等 Agent 集成入口

---

## 二、整体架构：Monorepo + 多服务

Firecrawl 采用 **monorepo** 结构，核心目录布局如下：

```
firecrawl/
├── apps/
│   ├── api/                    # 核心 API 服务 (Node.js/TypeScript)
│   │   └── src/
│   │       ├── controllers/    # v0/v1/v2 路由控制器
│   │       ├── scraper/        # 抓取引擎核心
│   │       ├── services/       # 队列、限流、计费、日志等服务
│   │       ├── routes/         # Express 路由定义
│   │       ├── lib/            # 工具库
│   │       └── db/             # 数据库连接
│   └── playwright-service-ts/  # Playwright 浏览器微服务
├── firecrawl-cli/              # CLI 工具
├── firecrawl-cli-skills/       # CLI 技能包
├── firecrawl-skills/           # Agent Skills
├── firecrawl-workflows/        # 工作流定义
├── skills/                     # 构建技能（SDK集成）
├── examples/                   # 示例代码
└── docker-compose.yaml         # 本地部署编排
```

**运行时由以下微服务组成**：
1. **API Server** — Express.js 主服务，处理所有 HTTP 请求
2. **Playwright Service** — 独立的浏览器渲染微服务（端口 3000）
3. **Redis** — 缓存、限流、分布式锁
4. **PostgreSQL (nuq-postgres)** — 持久化存储（队列后端、任务状态）
5. **BullMQ Workers** — 异步任务处理（深度研究、LLMs.txt 生成、计费、预抓取）

---

## 三、API 层设计：版本化 + 多路由

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

---

## 四、抓取引擎：Waterfall 降级 + 多引擎竞争

这是 Firecrawl 最核心的架构设计。抓取层位于 `src/scraper/scrapeURL/`，采用 **多引擎 waterfall（瀑布流降级）** 模式：

**可用引擎**（位于 `engines/` 目录）：
| 引擎 | 用途 |
|------|------|
| `fire-engine` | 核心引擎（远程浏览器集群，Cloud 专属） |
| `playwright` | 本地 Playwright 浏览器 |
| `fetch` | 原生 HTTP fetch（轻量快速） |
| `pdf` | PDF 文档专用处理 |
| `document` | Office 文档等格式处理 |
| `wikipedia` | Wikipedia 优化引擎 |
| `index` | 缓存索引命中 |

**Waterfall 机制**：
1. 根据 URL 特征和请求参数，`buildFallbackList()` 构建引擎优先级列表
2. 按优先级依次尝试各引擎
3. 某引擎失败时抛出 `WaterfallNextEngineSignal`，自动切换到下一引擎
4. 所有引擎均失败则抛出 `NoEnginesLeftError`
5. 引擎选择受 **Feature Flags** 影响（如 `actions`、`screenshot`、`stealthProxy`、`waitFor` 等）

```typescript
// Feature Flags 示例
if (options.actions !== undefined && options.actions.length > 0) {
  flags.add("actions");
}
if (hasFormatOfType(options.formats, "screenshot")) {
  flags.add("screenshot");
}
if (options.proxy === "stealth" || options.proxy === "enhanced") {
  flags.add("stealthProxy");
}
```

**引擎强制**机制（`engine-forcing`）支持按 URL 指定特定引擎，用于 A/B 测试和调试。

---

## 五、抓取流水线：Transformer Pipeline

抓取结果经过一个 **Transformer 流水线**处理：

```
原始 HTML/内容 → Transformer Pipeline → 最终 Document
```

流水线阶段包括：
1. **内容提取** — `onlyMainContent` 模式提取正文，去除导航/广告/侧边栏
2. **格式转换** — HTML → Markdown（`html-to-markdown`）、HTML → 结构化 JSON
3. **LLM 提取** — 使用 OpenAI/自定义模型进行结构化数据提取（`llmExtract`）
4. **截图生成** — 页面截图（全页或视口）
5. **变更追踪** — `changeTracking` 模式对比历史版本
6. **摘要生成** — LLM 生成页面摘要
7. **品牌信息** — 提取品牌元素

后处理器（`postprocessors`）在转换完成后执行最终清理。

---

## 六、认证与权限体系

Firecrawl 实现了完整的 **多租户认证体系**：

- **API Key 认证** — 团队级别 API Key，支持格式限制（`checkKeyFormatRestriction`）
- **Keyless 模式** — 无需注册即可使用（有限额度），通过 `isKeylessConfigured()` 判断
- **OAuth 令牌自省** — 支持 OAuth 2.0 Token Introspection
- **权限检查** — `checkPermissions()` 根据团队标志（TeamFlags）控制功能访问
- **Agent Auth Discovery** — `applyAgentAuthDiscoveryHeader()` 支持 Agent 自动发现认证方式

**计费系统**（`services/billing/`）：
- 按操作消耗积分（credits）
- 支持 Autumn 计费服务集成
- 预扣/对账机制（`reserveKeylessCredits` / `adjustKeylessCredits`）

---

## 七、限流与并发控制

**多层限流**设计（`services/rate-limiter.ts`）：

```typescript
// 基础限流（每分钟）
const BASE_RATE_LIMITS = {
  Scrape: 10,
  Map: 10,
  Crawl: 2,
  Search: 10,
  Extract: 2,
  Browser: 2,
  BrowserExecute: 10,
};
```

- **Redis 限流** — 基于 `rate-limiter-flexible` 库，使用 Redis 存储
- **计划分级** — Free/Hobby/Standard/Growth/Scale/Enterprise 六级
- **乘数机制** — Autumn 的 `rate_limits` 功能提供乘数，实际限制 = 基础值 × 乘数
- **组织级覆盖** — 支持按组织自定义限流值

**并发控制**（`team-semaphore.ts`）：
- 每个团队有独立的并发信号量
- `teamConcurrencySemaphore.withSemaphore()` 确保团队级并发不超过限制
- 超限任务排队等待，而非直接拒绝

---

## 八、队列与异步处理

Firecrawl 使用 **双队列系统**：

1. **BullMQ**（Redis 后端）— 用于轻量级异步任务：
   - `generateLlmsTxtQueue` — LLMs.txt 生成
   - `deepResearchQueue` — 深度研究
   - `billingQueue` — 计费处理
   - `precrawlQueue` — 预抓取

2. **NUQ**（PostgreSQL/FoundationDB 后端）— 用于核心抓取任务：
   - 支持 PostgreSQL 或 FoundationDB 作为后端（`NUQ_BACKEND` 环境变量切换）
   - 提供持久化和更强的一致性保证

**Bull Board** 集成提供队列监控仪表盘（`/admin/{BULL_AUTH_KEY}/queues`）。

---

## 九、威胁保护与安全

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

## 十、可观测性与运维

**日志体系**：
- Winston 结构化日志（`lib/logger`）
- 请求级日志追踪（`logRequest`、`logJob`）
- PostHog 分析集成（`services/posthog.ts`）

**分布式追踪**：
- OpenTelemetry 集成（`otel.ts`、`lib/otel-tracer`）
- `withSpan()` / `setSpanAttributes()` 贯穿整个请求链路
- 支持零数据保留请求的 trace 过滤

**成本追踪**：
- `CostTracking` 类追踪每次抓取的成本
- 按引擎、格式、LLM 调用分别计费

**健康检查**：
- `/e2e-test` 端点返回 200 OK
- `/is-production` 端点报告环境状态
- 系统监控（`services/system-monitor.ts`）

**优雅关闭**：
```typescript
const exitHandler = async () => {
  // 1. 等待 GCE 负载均衡器排空（K8s 环境）
  // 2. 关闭 HTTP 服务器
  // 3. 关闭 NUQ 队列
  // 4. 关闭 Webhook 队列
  // 5. 关闭 Indexer 队列
  // 6. 关闭 PubSub 日志
  // 7. 关闭 Tracing
};
```

---

## 架构总结

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
