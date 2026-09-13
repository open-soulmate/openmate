# 36 - Langfuse 架构深度分析

> **项目**: [langfuse/langfuse](https://github.com/langfuse/langfuse)
> **定位**: 开源 LLM 工程平台（可观测性、评估、Prompt 管理、数据集）
> **技术栈**: Next.js + tRPC + Prisma + ClickHouse + Redis (BullMQ) + TypeScript
> **许可证**: MIT（`ee/` 目录为企业版，限制性许可）
> **背景**: YC W23，2026年1月被 ClickHouse 收购

---

## 1. 系统总体架构

Langfuse 采用经典的 **Web + Worker 双进程** 架构，辅以 ClickHouse 做分析型存储、PostgreSQL 做事务型存储、Redis/BullMQ 做任务队列。

```
┌─────────────────────────────────────────────────────┐
│                   SDK (Python/JS)                    │
│  @observe() / OpenAI wrapper / LangChain callback   │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / OTLP
                       ▼
┌──────────────────────────────────────────────────────┐
│              Web Server (Next.js App)                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  tRPC    │  │ REST API │  │ Next.js Pages/App │  │
│  │ (internal)│  │ (public) │  │   (React UI)      │  │
│  └────┬─────┘  └────┬─────┘  └───────────────────┘  │
│       │              │                                │
│       ▼              ▼                                │
│  ┌─────────────────────────┐  ┌──────────────────┐  │
│  │    Prisma ORM (PG)      │  │  ClickHouse Client│  │
│  │  users/orgs/projects    │  │  traces/obs/scores│  │
│  │  prompts/datasets/config│  │  (analytics OLAP) │  │
│  └─────────────────────────┘  └──────────────────┘  │
└──────────────────────┬───────────────────────────────┘
                       │ BullMQ Jobs
                       ▼
┌──────────────────────────────────────────────────────┐
│              Worker (独立 Node.js 进程)                │
│  ┌─────────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Ingestion   │ │ Eval     │ │ Batch Export     │  │
│  │ Queue       │ │ Queue    │ │ Queue            │  │
│  ├─────────────┤ ├──────────┤ ├──────────────────┤  │
│  │ Experiment  │ │ Monitor  │ │ Data Retention   │  │
│  │ Queue       │ │ Queue    │ │ Queue (EE)       │  │
│  ├─────────────┤ ├──────────┤ ├──────────────────┤  │
│  │ OTel        │ │ Webhook  │ │ In-App Agent     │  │
│  │ Ingestion   │ │ Queue    │ │ Run Queue        │  │
│  └─────────────┘ └──────────┘ └──────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**核心设计原则**：写入路径（ingestion）通过队列异步化，读取路径走 ClickHouse OLAP 查询，事务型数据（用户、项目、Prompt 配置）走 PostgreSQL + Prisma。

---

## 2. Monorepo 结构与模块划分

Langfuse 使用 pnpm workspace + Turborepo 管理 monorepo：

| 目录 | 职责 |
|------|------|
| `web/` | Next.js 前端 + API 服务（主应用） |
| `worker/` | 独立 BullMQ Worker 进程 |
| `packages/shared/` | 共享类型、Prisma Client、常量、加密工具 |
| `packages/config-eslint/` | 共享 ESLint 配置 |
| `packages/config-typescript/` | 共享 TS 配置 |
| `packages/eslint-plugin/` | 自定义 ESLint 规则 |
| `packages/langfuse-skills/` | 内置 AI 技能包 |
| `packages/in-app-agent-sandbox-runtime/` | 应用内 Agent 沙箱运行时 |

`packages/shared` 是粘合层——导出 Prisma Client 单例、ClickHouse 表定义（`observationsTable`、`eventsTable`）、领域类型、加密函数。Web 和 Worker 都依赖它，确保类型一致性。

---

## 3. 数据存储架构（双引擎）

Langfuse 最核心的架构决策是 **PostgreSQL + ClickHouse 双引擎**：

### PostgreSQL（事务型，via Prisma）
- 用户、组织、项目、API Key
- Prompt 版本管理
- 数据集定义与实验配置
- Score 配置、模型定义
- RBAC 权限、审计日志
- Feature Flag、Entitlement

Prisma Client 采用**单例模式**（`PrismaClientSingleton`），生产环境全局复用连接池。敏感字段（如 `remoteExperimentSecretKey`、`encryptedCredential`）通过 Prisma 的 `omit` 机制默认从查询结果中排除。

### ClickHouse（分析型）
- Traces（调用链）
- Observations（LLM 调用、Span、Event）
- Scores（评估分数）
- 高吞吐写入 + 列式聚合查询

这种分离让 Langfuse 能在 ClickHouse 上做复杂的分析查询（如按模型统计 token 消耗、按时间窗口聚合延迟），同时在 PostgreSQL 上保证事务一致性。

---

## 4. Web 层架构（Next.js + tRPC + REST）

Web 应用基于 Next.js，同时暴露两套 API：

### tRPC（内部 API）
- `web/src/server/api/root.ts` — 路由聚合
- `web/src/server/api/trpc.ts` — tRPC 初始化
- `web/src/server/api/routers/` — 20+ 路由模块：
  - `traces.ts`、`observations.ts`、`scores.ts` — 核心可观测性数据
  - `sessions.ts` — 用户会话追踪
  - `models.ts` — 模型配置管理
  - `monitors.ts` — 监控规则
  - `dashboardWidgets.ts` — 仪表盘组件
  - `comments.ts` — 协作评论
  - `public.ts` — 公开 API 桥接

### REST Public API
- `web/src/features/public-api/` — 面向外部的 RESTful API
- 使用 `withMiddleware` + `createAuthedAPIRoute` 模式
- Zod schema 做类型校验
- 提供 OpenAPI spec 和 Postman collection

### 前端页面
- `web/src/pages/` — Next.js Pages Router（混合使用 App Router）
- `web/src/features/` — **80+ 功能模块**，按领域组织：
  - `traces/`、`sessions/`、`datasets/` — 核心可观测性
  - `prompts/`、`playground/` — Prompt 管理与测试
  - `evals/`、`experiments/` — 评估与实验
  - `auth/`、`rbac/`、`entitlements/` — 认证授权
  - `in-app-agent/`、`mcp/` — 应用内 Agent
  - `dashboard/`、`chart-view/`、`widgets/` — 可视化

---

## 5. Worker 架构（BullMQ 任务队列）

Worker 是独立的 Node.js 进程，通过 BullMQ（Redis）接收任务。包含 **28 种队列**：

| 队列 | 职责 |
|------|------|
| `ingestionQueue` | 核心数据摄入（traces/observations） |
| `otelIngestionQueue` | OpenTelemetry 协议数据摄入 |
| `evalQueue` | LLM-as-a-Judge / 代码评估 |
| `experimentQueue` | 数据集实验执行 |
| `monitorQueue` | 监控规则执行 |
| `batchExportQueue` | 批量数据导出 |
| `batchActionQueue` | 批量操作（删除等） |
| `webhooks` | Webhook 事件推送 |
| `notificationQueue` | 通知发送 |
| `dataRetentionQueue` | 数据保留策略（EE） |
| `cloudUsageMeteringQueue` | 云服务计量（EE） |
| `inAppAgentRunQueue` | 应用内 Agent 执行 |
| `eventPropagationQueue` | 事件传播 |
| `entityChangeQueue` | 实体变更处理 |

Worker 使用 `workerManager.ts` 统一管理所有队列的生命周期，`shardedQueueRegistry.ts` 支持队列分片以应对高吞吐场景。

---

## 6. 集成生态与 SDK 设计

Langfuse 的集成分为三个层次：

### SDK 层
- **Python SDK**: `@observe()` 装饰器 + OpenAI wrapper + LangChain/LlamaIndex callback
- **JS/TS SDK**: 类似模式，支持 Vercel AI SDK、Mastra 等

### Drop-in 替换层
- `langfuse.openai` — 替换 OpenAI SDK，自动追踪所有调用
- LangChain callback handler — 零代码集成
- LlamaIndex callback system

### 协议层
- **OpenTelemetry (OTLP)** — 原生支持，`otelIngestionQueue` 专门处理
- **REST API** — 直接调用

这种分层设计让用户可以从「一行代码集成」到「完全自定义追踪」平滑过渡。

---

## 7. 企业版（EE）与开源策略

Langfuse 采用 **MIT + EE** 模式：

- 核心功能（tracing、prompt management、evals、datasets）完全开源 MIT
- `web/src/ee/` 和 `worker/src/ee/` 包含企业版功能：
  - 数据保留策略（`dataRetention/`）
  - 云服务计量（`cloudUsageMetering/`）
  - 费用告警（`cloudSpendAlerts/`）
  - 使用量阈值（`usageThresholds/`）
  - Postgres 导出（`meteringDataPostgresExport/`）

EE 目录在 `web/src/features/` 中也有对应入口（`entitlements/`、`payment-banner/`），通过 feature flag 控制可见性。

---

## 8. 部署架构

### 自托管
- **Docker Compose** — 5 分钟本地启动（`docker-compose.yml`）
- **Kubernetes Helm** — 生产推荐
- **Terraform** — AWS / Azure / GCP 模板

两个独立 Dockerfile：
- `web/Dockerfile` — Next.js 应用（Alpine Linux）
- `worker/Dockerfile` — BullMQ Worker（Alpine Linux）

基础设施依赖：
- PostgreSQL（事务存储）
- ClickHouse（分析存储）
- Redis（BullMQ 队列）

### Langfuse Cloud
- 托管服务，分 EU / US 区域
- 免费额度慷慨，无需信用卡

---

## 9. 关键设计模式

### 数据摄入流水线
```
SDK → HTTP/OTLP → Web API → BullMQ (ingestionQueue/otelIngestionQueue)
    → Worker 消费 → ClickHouse 写入
```
写入完全异步化，SDK 端 fire-and-forget，不阻塞用户应用。

### Prisma Client 单例
```typescript
export class PrismaClientSingleton {
  private static instance: PrismaClient;
  public static getInstance(): PrismaClient { ... }
}
```
开发环境用 `globalThis` 缓存避免热重载时连接泄漏，生产环境用静态单例。

### Feature Flag + Entitlement
- `web/src/features/feature-flags/` — 功能开关
- `web/src/features/entitlements/` — 付费功能边界
- `web/src/features/feature-previews/` — 预览功能

### tRPC + Zod 类型安全
内部 API 全链路类型安全：tRPC router → Zod schema → Prisma 类型 → 前端推导。

---

## 10. 与其他 LLM 可观测性平台的对比

| 维度 | Langfuse | LangSmith | Helicone | Arize Phoenix |
|------|----------|-----------|----------|---------------|
| 开源 | ✅ MIT 核心 | ❌ 闭源 | 部分开源 | ✅ Apache 2.0 |
| 自托管 | ✅ Docker/K8s | ❌ | ❌ | ✅ |
| 存储引擎 | ClickHouse+PG | 专有 | 专有 | SQLite/PG |
| OTel 原生支持 | ✅ | ❌ | 部分 | ✅ |
| Prompt 管理 | ✅ 内置 | ✅ | ❌ | ❌ |
| 数据集/实验 | ✅ 内置 | ✅ | ❌ | ✅ |
| 评估框架 | LLM-as-Judge+Code | LLM-as-Judge | ❌ | LLM-as-Judge |
| Playground | ✅ | ✅ | ❌ | ❌ |
| 多语言 SDK | Python+JS/TS | Python+JS | Python+JS | Python |

**Langfuse 的核心竞争力**：
1. **完全开源 + 自托管** — 数据不出企业
2. **ClickHouse 引擎** — 分析查询性能碾压同类
3. **功能完整度** — 可观测性 + Prompt 管理 + 评估 + 数据集 + Playground 一站式
4. **集成广度** — 支持 20+ 框架/平台的无缝集成
5. **被 ClickHouse 收购** — 底层引擎深度优化的想象空间

---

## 总结

Langfuse 是当前最成熟的开源 LLM 工程平台。其架构的精髓在于：

1. **双存储引擎**：PostgreSQL 保证事务一致性，ClickHouse 提供分析性能
2. **异步摄入**：所有数据写入通过 BullMQ 队列，不阻塞用户应用
3. **Monorepo 共享类型**：`packages/shared` 确保 Web/Worker 类型一致
4. **Feature 模块化**：80+ 独立 feature 模块，按领域组织
5. **开放集成**：从 SDK 装饰器到 OTel 协议，覆盖所有集成场景

对于构建 LLM 应用的团队，Langfuse 提供了从开发到生产全生命周期的可观测性基础设施。
