# n8n-io/n8n — 工作流自动化 / Queue Mode HA / 错误工作流 调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/n8n-io/n8n（~204k★） |
| 文档 | https://docs.n8n.io（GitBook，页尾 `.md` 可取） |
| 语言 | TypeScript（pnpm mono-repo：`packages/cli` / `packages/core` / `packages/editor-ui` …） |
| License | Fair-code：Sustainable Use License + n8n Enterprise License（源可用、可自托管，非 OSI 开源） |
| 定位一句话 | AI 原生工作流 + Agent 自动化平台：可视化画布 + 自定义代码 + 1500+ 集成，自托管或 Cloud |
| 部署 | 一键脚本 / Docker / npm；queue mode 需 Redis + PostgreSQL |

> 对 openmate：n8n 是「平台级 HA 标杆」。**Queue Mode（main + worker + Redis + PG）**、**Multi-Main Leader 选举**、**Error Workflow（Error Trigger）**、**Wait 节点（按时间/外部 Webhook 暂停续跑）**、**Durable Scheduler（数据库背压 + misfire 策略 + reaper）** 已产品化，可直接映射 openmate 长任务与故障恢复。

---

## 1. 系统架构

### 1.1 运行模式

| 模式 | 形态 | 适用 |
|---|---|---|
| **regular（默认）** | 单进程：UI + API + 触发器 + 执行 | 单机/小负载 |
| **queue** | main（触发/入队）+ worker（执行）+ Redis（队列）+ PG（持久化） | 生产横向扩展 |
| **queue + webhook processors** | 再拆一层 webhook 进程池 + LB | 高并发入站 |

### 1.2 Queue Mode 执行链路

```
Trigger/Webhook → main 生成 execution ID（不执行）
  → 写入 Redis（Bull 队列）
  → worker 取 ID → 从 DB 读工作流 → 执行
  → 结果写回 DB → Redis 通知 main 完成
```

关键配置：

- `EXECUTIONS_MODE=queue`（main 与全部 worker）
- `N8N_ENCRYPTION_KEY` 必须一致（解密凭据）
- `QUEUE_BULL_REDIS_HOST/PORT`；可选 `USERNAME/PASSWORD/DB`
- worker 并发：`n8n worker --concurrency=10`（官方建议 ≥5，过低会打爆 DB 连接池）
- Redis 不可用阈值：`QUEUE_BULL_REDIS_TIMEOUT_THRESHOLD`（默认 10s）
- 优雅退出：`N8N_GRACEFUL_SHUTDOWN_TIMEOUT`（默认 30s，worker 在期限内跑完当前 job）

### 1.3 Webhook Processors + LB

- 独立 `n8n webhook` 进程；`/webhook/*` 与 `/webhook-waiting/*`（HITL send-and-wait）路由到 webhook 池
- 其余路径（编辑器 UI、内部 API、`/webhook-test/*`）只走 main
- 可用 `N8N_DISABLE_PRODUCTION_MAIN_PROCESS=true` 禁止 main 处理生产 webhook
- **大响应 offload**（≥2.34.0）：worker 响应经 Redis 中继，默认上限 64MiB（`N8N_WEBHOOK_RESPONSE_RELAY_SIZE_MAX`）；超限可 `N8N_WEBHOOK_RESPONSE_RELAY_OFFLOAD_ENABLED=true` + S3/Azure 二进制存储引用式回传

### 1.4 Multi-Main（Enterprise）

- 多 main 跑同一 queue；**leader** 执行 at-most-once 任务（timer/poller/IMAP/清理），**follower** 跑常规任务
- Leader key TTL 可配：`N8N_MULTI_MAIN_SETUP_KEY_TTL` / `CHECK_INTERVAL`
- 需 LB sticky sessions；所有进程同版本；`N8N_MULTI_MAIN_SETUP_ENABLED=true`

---

## 2. 四个关键维度深潜

### 2.1 错误恢复（Error Recovery）

**Error Workflow** 是一级公民：

1. 新建以 **Error Trigger** 开头的工作流
2. 原工作流 Settings → Error workflow 绑定
3. 执行失败时自动触发（可共用一个 handler 给多个工作流）

Error Trigger 默认载荷：

```json
{
  "execution": {
    "id": "231",
    "url": "https://n8n.example.com/execution/231",
    "retryOf": "34",
    "error": { "message": "...", "stack": "..." },
    "lastNodeExecuted": "Node With Error",
    "mode": "manual"
  },
  "workflow": { "id": "1", "name": "..." }
}
```

- trigger 节点本身失败时载荷结构不同（`trigger.error` + `WorkflowActivationError`）
- **Stop and Error** 节点可主动失败以强制进入 error workflow
- 节点级 **Retry on Fail**（次数 + 间隔）叠加使用
- Executions 面板可「加载历史执行数据」调试；Log streaming / OpenTelemetry 外送

### 2.2 沙箱 / 隔离

- **Task Runners**：内部或外部 runner 进程执行 Code 节点；可 harden（文档 `harden-task-runners`）
- Code 节点可限制 external modules
- 凭据加密存储；**JWE 加密 OAuth 2.0 token**（≥新版）；加密密钥轮换（`rotate-encryption-keys`）
- SSRF 保护、节点黑名单、外部 hooks

### 2.3 长任务 / 长运行作业

| 机制 | 说明 |
|---|---|
| **Wait 节点** | 执行中途暂停：定时（rate limit）或等外部 webhook；恢复时数据不变 |
| **`/webhook-waiting/*`** | HITL「send and wait」节点（如 Slack 批准）专用端点 |
| **Sub-workflow** | 大流程拆子工作流调用 |
| **Schedule Trigger + Durable Scheduler** | 见下节 |
| **执行超时** | `configure-workflow-timeouts` 可设单次执行上限 |
| **二进制数据外存** | S3/Azure/filesystem/database，避免 worker 内存膨胀 |

**Durable Scheduler（≥2.36.0 正式）** — 长任务调度的 HA 底座：

- Schedule 触发从「各 main 内存 timer」改为 **数据库队列**
- 五阶段：Materialization（预写 upcoming runs）→ Execution（claim）→ **Recovery（reaper 回收崩溃实例的 claim）** → Retention → Owner Reconciliation
- **Misfire 策略**：宽限期默认 1min；超期后按节点策略丢弃 / 只跑最近一次 / 每条 rule 各补一次
- Poll Trigger 可选 durable（`N8N_SCHEDULER_POLL_TRIGGERS_ENABLED`）+ **durable poll cursors**（与 execution 同事务落库，防漏/重）
- Poll 超时 abandon（默认 45s）+ 拉宽重试间隔
- Prometheus：`tasks_due` / `oldest_pending_age` / `reclaimed` / `dead_lettered` / `lease_lost` 等，官方 Grafana dashboard

### 2.4 工具 / 凭据鉴权

- **Credentials 体系**：每工作流节点绑定；库中加密；owner 可加密密钥
- **OAuth 2.0**：支持 token exchange（OEM）、JWE 解密、credential overwrites（预配置 Microsoft OAuth，用户免注册 app）
- **External secrets**：从外部密钥库同步
- AI Agent 工具侧：LangChain 集成、MCP server 一键接入、`$fromAI()` 动态填参、**Human-in-the-loop for tools**（特定 tool 执行前要人批）
- Gateway credits（Cloud）：不自备 API key 调模型/三方服务

---

## 3. 生产运维要点

| 主题 | 要点 |
|---|---|
| 数据库 | 生产 queue mode 必须 PostgreSQL；SQLite 不支持分布式 |
| 健康检查 | worker `/healthz`、`/healthz/readiness`（`QUEUE_HEALTH_CHECK_ACTIVE`） |
| 指标 | Prometheus `/metrics`；Grafana 模板 |
| 可观测 | OpenTelemetry 执行 trace；Log streaming |
| 存储 | binary/execution 外存：S3 / Azure / filesystem（共享盘不推荐）/ database |
| 版本 | workflow history、n8n packages（`.n8np` 跨实例迁移）、source control |
| 安全 | MFA、SSO（SAML/OIDC）、审计、节点黑名单、SSRF、加密轮换 |

---

## 4. 对 openmate 的可借鉴点

1. **P0 — 主/Worker + Redis 队列**：openmate 长任务应将「触发/入队」与「执行」拆开；worker 可独立扩缩；`--concurrency` 控制并行度。
2. **P0 — Error Workflow 独立图**：失败不是日志而是可编排的补偿流（告警、重试、人工升级），Error Trigger 载荷结构可抄。
3. **P0 — Durable Scheduler 语义**：数据库预写 runs + claim + reaper + misfire 策略，解决「重启丢定时任务」与「多实例双跑」。
4. **P1 — Wait + webhook-waiting**：个人助理的「发消息等回复再继续」用等待点落盘续跑，而不是阻塞进程。
5. **P1 — 凭据共享加密密钥 + JWE OAuth**：多进程/多机部署时凭据一致性与 token 机密性。
6. **P2 — 大响应 offload 到对象存储**：工具结果过大时引用式传递，避免队列消息撑爆 Redis。

---

## 5. 参考链接

- Queue Mode：https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode.md
- Concurrency：https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/control-concurrency.md
- Error handling：https://docs.n8n.io/build/flow-logic/handle-errors-gracefully.md
- Wait：https://docs.n8n.io/build/flow-logic/wait.md
- Durable scheduler：https://docs.n8n.io/deploy/host-n8n/configure-n8n/durable-scheduler.md
- 文档总索引：https://docs.n8n.io/sitemap.md
