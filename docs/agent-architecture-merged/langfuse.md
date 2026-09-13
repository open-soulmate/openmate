# Langfuse

## 概述

Langfuse 是一个LLM可观测性平台。

**仓库**: https://github.com/langfuse/langfuse | **语言**: Python

## 核心架构

> **项目**: [langfuse/langfuse](https://github.com/langfuse/langfuse)
> **定位**: 开源 LLM 工程平台（可观测性、评估、Prompt 管理、数据集）
> **技术栈**: Next.js + tRPC + Prisma + ClickHouse + Redis (BullMQ) + TypeScript
> **许可证**: MIT（`ee/` 目录为企业版，限制性许可）
> **背景**: YC W23，2026年1月被 ClickHouse 收购

Langfuse 采用经典的 **Web + Worker 双进程** 架构，辅以 ClickHouse 做分析型存储、PostgreSQL 做事务型存储、Redis/BullMQ 做任务队列。

[详见源码]

**核心设计原则**：写入路径（ingestion）通过队列异步化，读取路径走 ClickHouse OLAP 查询，事务型数据（用户、项目、Prompt 配置）走 PostgreSQL + Prisma。

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

Langfuse 最核心的架构决策是 **PostgreSQL + ClickHouse 双引擎**：

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

## 关键技术

1. **读写分离 + 异步批写**：ingestion 不直写 ClickHouse，先入 Redis 队列、worker 批量写——扛住高吞吐上报又不拖慢查询。
2. **存储分层各司其职**：Postgres 管事务一致性，ClickHouse 管分析型大宽表，S3 管大 blob，Redis 管队列——每种数据用最合适的存储。
3. **OpenTelemetry 原生**：不绑死自家 SDK，任何 OTel collector 都能接，生态广。
4. **字段级保护**：`LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES=2097152`（2MB）超大 observation 溢出保护。

- **进程自愈（源码确认）**：所有服务 `restart: always`；postgres/clickhouse/redis/minio 均配 healthcheck（`pg_isready`、`wget /ping`、`redis-cli ping`、`mc ready`），依赖按 `condition: service_healthy` 等就绪。
- **异步队列解耦（源码确认）**：ingestion 先入 Redis 队列（`LANGFUSE_INGESTION_QUEUE_DELAY_MS`），worker 批量落 ClickHouse（`..._CLICKHOUSE_WRITE_INTERVAL_MS`）——即使 ClickHouse 抖动，数据不丢、不阻塞上报。
- **队列不丢数据（源码确认）**：Redis `maxmemory-policy noeviction`——内存满时拒绝写入而非淘汰队列项，保证待处理任务不丢。
- **字段大小上限（源码确认）**：observation 字段超 2MB 触发 overflow 处理（`LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED`），防超大 payload 打爆存储。
- **凭证与加密（源码确认）**：`ENCRYPTION_KEY`（`openssl rand -hex 32`）、`SALT`、`NEXTAUTH_SECRET` 分离；LLM 连接有 host/IP 白名单（`LANGFUSE_LLM_CONNECTION_WHITELISTED_*`），防 SSRF。

- **Web/Worker 分离（源码确认）**：重异步活（批量写、评估、导出）在 worker，轻请求在 web；可独立水平扩 worker。
- **ClickHouse 集群（源码确认）**：`CLICKHOUSE_CLUSTER_ENABLED` / `CLUSTER_NAME`，OLAP 层可水平扩展。
- **本地绑定收敛攻击面**：除 web(3000)/minio(9090) 外，postgres/clickhouse/redis 全部绑 `127.0.0.1`，外部不可直连。
- **In-app Agent 限流（源码确认）**：`MAX_ACTIVE_RUNS_PER_USER` / `PER_ORG` 上限，单用户/单组织跑 Agent 不把系统打满；沙箱用 AWS Lambda microVM 隔离执行。
- **对象存储可换**：MinIO/Azure Blob/OCI 原生对象存储可切换，`FORCE_PATH_STYLE`，避免绑死 S3。

**对其观测主业务：不适用**（它是工具，不自己学习）。

- **作为"评估回路"的载体**：Langfuse 的核心价值恰恰是给 Agent 提供**自我进化所需的数据底座**——trace 全量留存 + LLM-as-judge 自动评分 + Prompt 版本对比，使"改一版 prompt → 看指标变化"成为可能。
- **内置 evaluator / in-app agent**：`LANGFUSE_AI_PROVIDER/MODEL` 配置后，worker 上跑 LLM 评估器自动给 trace 打分——这是把"自动评估"产品化。
- **结论**：Langfuse 自己不进化，但它是 Agent 进化的基础设施。

## 对openmate的启示

> 仓库: https://github.com/langfuse/langfuse  
> 抓取通道: cdn.jsdelivr.net/gh/langfuse/langfuse@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent 可观测性 / Trace 模型 / 评估闭环 / 自进化 借鉴

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（36-langfuse.md）
- 豆包（087_langfuse.md）
- MiMo报告（langfuse.md）
