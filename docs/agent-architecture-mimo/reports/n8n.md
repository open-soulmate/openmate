# n8n-io/n8n — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/n8n-io/n8n  
> 抓取通道: cdn.jsdelivr.net/gh/n8n-io/n8n@master  
> 版本快照: master @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供工作流 HA / Queue Mode / Error Workflow / Durable Scheduler 借鉴

---

## 0. 诚实性说明

- 成功拉取: `packages/cli/src/commands/worker.ts`（完整 Worker 命令）、`packages/cli/src/scaling/scaling.service.ts`（完整 ScalingService，含 Bull 队列、recovery、metrics、drain）。
- 未能直接拉取: Durable Scheduler 内部实现文件、Multi-Main leader election 具体代码（文档层面已覆盖）。
- 所有常量与代码行均为源码实读，非推测。

---

## 1. 系统架构

### 1.1 运行模式

| 模式 | 形态 | 适用 |
|---|---|---|
| **regular（默认）** | 单进程：UI + API + 触发器 + 执行 | 单机/小负载 |
| **queue** | main（触发/入队）+ worker（执行）+ Redis（队列）+ PG（持久化） | 生产横向扩展 |
| **queue + webhook processors** | 再拆一层 webhook 进程池 + LB | 高并发入站 |

### 1.2 源码布局（实测）

| 路径 | 职责 |
|------|------|
| `packages/cli/src/commands/worker.ts` | Worker 进程入口命令 |
| `packages/cli/src/scaling/scaling.service.ts` | Bull 队列管理、job 生命周期、recovery、metrics |
| `packages/cli/src/scaling/job-processor.ts` | Job 执行器 |
| `packages/cli/src/scaling/worker-server.ts` | Worker 健康检查 / metrics HTTP server |
| `packages/cli/src/scaling/worker-status.service.ee` | Worker 状态上报 |
| `packages/cli/src/scaling/queue-name.ts` | 队列名解析（worker pool） |
| `packages/cli/src/scaling/webhook-response-relay.ts` | 大响应 offload 中继 |
| `packages/cli/src/scaling/pubsub/` | Redis Pub/Sub（Publisher / Subscriber / PubSubRegistry） |
| `packages/cli/src/executions/execution-crash.service.ts` | 崩溃执行标记 |
| `packages/cli/src/executions/execution-persistence.ts` | 执行持久化 |

### 1.3 Worker 进程模型（源码实读）

`worker.ts` 关键结构：

```typescript
@Command({
  name: 'worker',
  description: 'Starts a n8n worker',
  examples: ['--concurrency=5'],
  flagsSchema,
})
export class Worker extends BaseCommand<z.infer<typeof flagsSchema>> {
  private concurrency: number;
  private scalingService: ScalingService;

  override needsCommunityPackages = true;
  override needsExpressionEngine = true;
  override needsTaskRunner = true;
  override seedsInstanceIdentity = true;
```

并发计算逻辑（`setConcurrency()`）：

```typescript
async setConcurrency() {
  const { flags } = this;
  const envConcurrency = this.globalConfig.executions.concurrency.productionLimit;
  this.concurrency = envConcurrency !== -1 ? envConcurrency : flags.concurrency;

  if (this.concurrency < 5) {
    this.logger.warn(
      'Concurrency is set to less than 5. THIS CAN LEAD TO AN UNSTABLE ENVIRONMENT. Please consider increasing it to at least 5 to make best use of the worker.'
    );
  }
}
```

**关键常量与规则**:
- 默认并发: `z.number().int().default(10)`（flagsSchema）
- 环境变量覆盖: `N8N_CONCURRENCY_PRODUCTION_LIMIT`（-1 表示不覆盖）
- 并发 < 5 时发出警告（可能导致不稳定）
- `QUEUE_WORKER_TIMEOUT` 已废弃，改用 `N8N_GRACEFUL_SHUTDOWN_TIMEOUT`
- 无效 `QUEUE_WORKER_TIMEOUT` 值会被拒绝：`Number.isInteger(parsed) && parsed > 0`

### 1.4 Worker 初始化链路

```
init()
  → initCrashJournal()
  → setConcurrency()
  → super.init()
  → DeprecationService.warn()
  → JwtService.initialize(DeploymentKeyRepository)
  → BinaryDataConfig.initialize(DeploymentKeyRepository)
  → initLicense()
  → check worker pool license
  → initCommunityPackages()
  → CredentialsOverwrites.init()
  → initBinaryDataService()
  → initDataDeduplicationService()
  → initExternalHooks()
  → initEventBus()
  → initScalingService()  ← 关键：创建 Bull 队列
  → initOrchestration()   ← 关键：Redis Pub/Sub
  → MessageEventBus.send(n8n.worker.started)
  → moduleRegistry.initModules()
  → PubSubRegistry.init()
  → executionContextHookRegistry.init()
  → LoadNodesAndCredentials.postProcessLoaders()
```

`run()` 方法中：

```typescript
// Register the job processor only after init() has fully completed,
// so that jobs cannot be pulled before all modules and their
// execution contexts are available.
this.scalingService.setupWorker(this.concurrency);
workerServer?.markAsReady();
```

**设计要点**: job processor 在所有模块初始化完毕后才注册，防止 worker 在依赖未就绪时拉取 job。

### 1.5 优雅关闭

```typescript
async stopProcess() {
  this.logger.info('Stopping worker...');
  try {
    await this.externalHooks?.run('n8n.stop');
    await Container.get(ActiveExecutions).shutdown();
  } catch (error) {
    await this.exitWithCrash('Error shutting down worker', error);
  }
  await this.exitSuccessFully();
}
```

---

## 2. ScalingService — Bull 队列核心（源码实读）

### 2.1 队列创建

```typescript
async setupQueue() {
  const { default: BullQueue } = await import('bull');
  const { RedisClientService } = await import('@/services/redis-client.service.js');
  const service = Container.get(RedisClientService);

  const bullPrefix = this.globalConfig.queue.bull.prefix;
  const prefix = service.toValidPrefix(bullPrefix);
  const settings = { ...this.globalConfig.queue.bull.settings, maxStalledCount: 0 };

  this.createBullQueue = (name: string) =>
    new BullQueue(name, {
      prefix,
      settings,
      createClient: (type) => service.createClient({ type: `${type}(bull)` }),
    });
```

**关键常量**:
- `maxStalledCount: 0` — **不自动重试 stalled job**（由 recovery 机制处理）
- 队列按 worker pool 命名：`resolveQueueName(instanceType, poolName)`
- 懒创建：`getOrCreateQueue(queueName)` 按需创建额外队列

### 2.2 MCP Session 集成（实测代码）

```typescript
const MCP_SESSION_TTL = 86400;  // 24小时
const getMcpSessionKey = (sessionId: string) =>
  `${this.globalConfig.redis.prefix}:mcp-session:${sessionId}`;

const mcpServer = McpServer.instance(this.logger);
const redisStore = new RedisSessionStore(
  {
    set: async (key, value, ttl) => await publisher.set(key, value, ttl),
    get: async (key) => await publisher.get(key),
    clear: async (key) => await publisher.clear(key),
  },
  getMcpSessionKey,
  MCP_SESSION_TTL,
);
mcpServer.setSessionStore(redisStore);
mcpServer.setExecutionStrategy(new QueuedExecutionStrategy(mcpServer.getPendingCallsManager()));
```

### 2.3 Worker Job 处理

```typescript
setupWorker(concurrency: number) {
  void this.defaultQueue.process(JOB_TYPE_NAME, concurrency, async (job: Job) => {
    try {
      this.eventService.emit('job-dequeued', { ... });
      if (!this.hasValidJobData(job)) {
        throw new UnexpectedError('Worker received invalid job', {
          extra: { jobData: jsonStringify(job, { replaceCircularRefs: true }) },
        });
      }
      await this.jobProcessor.processJob(job);
    } catch (error) {
      await this.reportJobProcessingError(ensureError(error), job);
    }
  });
}
```

**失败路径**: job 处理异常 → `reportJobProcessingError()` → 通过 `job.progress(msg)` 通知 main → `errorReporter.error()` → re-throw（Bull 标记 failed）

### 2.4 Job 消息协议

Worker 与 Main 通过 Bull 的 `global:progress` 通信，消息类型：

| kind | 方向 | 用途 |
|------|------|------|
| `send-chunk` | worker → main | 流式输出分片 |
| `respond-to-webhook` | worker → main | Webhook 响应中继 |
| `job-finished` | worker → main | 执行完成（含 success/error/status/lastNodeExecuted） |
| `job-failed` | worker → main | 执行失败 |
| `abort-job` | main → worker | 中止信号 |
| `mcp-response` | worker → main | MCP 工具响应 |

`job-finished` 消息结构（v2）：

```typescript
if (msg.version === 2) {
  this.jobResults.set(msg.executionId, {
    success: msg.success,
    error: msg.error,
    status: msg.status,
    lastNodeExecuted: msg.lastNodeExecuted,
    usedDynamicCredentials: msg.usedDynamicCredentials,
    metadata: msg.metadata,
    startedAt: new Date(msg.startedAt),
    stoppedAt: new Date(msg.stoppedAt),
    waitTill: msg.waitTill ? new Date(msg.waitTill) : null,
  });
}
```

**设计要点**: `waitTill` 字段被保留，防止 main 将等待中的执行误判为已完成并删除。

### 2.5 停止 Job

```typescript
async stopJob(job: Job) {
  if (await job.isActive()) {
    await job.progress({ kind: 'abort-job' });  // 通知 worker
    return true;
  }
  await job.remove();  // 尚未被 worker 领取
  return true;
}
```

---

## 3. 优雅关闭 — Drain 机制（源码实读）

### 3.1 常量

```typescript
const DRAIN_POLL_INTERVAL_MS = 500;
const CANCEL_WRITE_BUDGET_SHARE = 0.5;
const MAX_CANCEL_WRITE_TIMEOUT_MS = 3 * Time.seconds.toMilliseconds;  // 3秒
```

### 3.2 Worker 关闭流程

```typescript
private async stopWorker() {
  await this.pauseAllQueues();

  const shutdownWindowMs =
    this.globalConfig.generic.gracefulShutdownTimeout * Time.seconds.toMilliseconds;
  const drainTimeoutMs = shutdownWindowMs * 0.8;  // 80% 用于 drain

  const start = Date.now();
  const hasQueuedJobsToDrain = () => this.getRunningJobsCount() !== 0;
  const hasInProcessExecutionsToDrain = () =>
    this.activeExecutions.getRunningExecutionIds().length !== 0;
  const isWithinDrainBudget = () => Date.now() - start < drainTimeoutMs;

  while (hasQueuedJobsToDrain() || (hasInProcessExecutionsToDrain() && isWithinDrainBudget())) {
    const remainingBudgetMs = drainTimeoutMs - (Date.now() - start);
    const sleepMs = hasQueuedJobsToDrain()
      ? DRAIN_POLL_INTERVAL_MS
      : Math.max(1, Math.min(DRAIN_POLL_INTERVAL_MS, remainingBudgetMs));
    await sleep(sleepMs);
  }

  // Cancel stragglers
  if (drainTimeoutMs > 0 && hasInProcessExecutionsToDrain() && !isWithinDrainBudget()) {
    const remainingWindowMs = Math.max(0, shutdownWindowMs - (Date.now() - start));
    const writeDeadlineMs = Math.min(
      MAX_CANCEL_WRITE_TIMEOUT_MS,
      Math.round(remainingWindowMs * CANCEL_WRITE_BUDGET_SHARE),
    );
    const cancelledExecutionIds =
      await this.activeExecutions.cancelRunningExecutions(writeDeadlineMs);
  }
}
```

**设计要点**:
- 80% 关闭窗口用于 drain，20% 留给 shutdown hooks
- 排队中的 job 等待**无界**（`hasQueuedJobsToDrain` 不受 budget 限制）
- in-process 执行受 budget 限制，超时后**取消**而非等待
- 取消写入有独立上限：`min(3s, remainingWindow * 0.5)`

---

## 4. Queue Recovery（源码实读）

### 4.1 Recovery 上下文

```typescript
private readonly queueRecoveryContext: QueueRecoveryContext = {
  batchSize: this.globalConfig.executions.queueRecovery.batchSize,
  waitMs: this.globalConfig.executions.queueRecovery.interval * 60 * 1000,
};
```

### 4.2 Leader 触发

```typescript
@OnLeaderTakeover()
private scheduleQueueRecovery(waitMs = this.queueRecoveryContext.waitMs) {
  this.queueRecoveryContext.timeout = setTimeout(async () => {
    try {
      const nextWaitMs = await this.recoverFromQueue();
      this.scheduleQueueRecovery(nextWaitMs);
    } catch (error) {
      this.logger.error('Failed to recover dangling executions from queue', { ... });
      this.scheduleQueueRecovery();  // 重试
    }
  }, waitMs);
}

@OnLeaderStepdown()
private stopQueueRecovery() {
  if (!this.queueRecoveryContext.timeout) return;
  clearTimeout(this.queueRecoveryContext.timeout);
}
```

### 4.3 Recovery 算法

```typescript
async recoverFromQueue() {
  const { waitMs, batchSize } = this.queueRecoveryContext;

  // 1. 从 DB 读取 in-progress 执行 ID
  const storedIds = await this.executionRepository.getInProgressExecutionIds(batchSize);
  if (storedIds.length === 0) return waitMs;

  // 2. 从 Bull 队列读取 active/waiting job
  const runningJobs = await this.findJobsByStatus(['active', 'waiting']);
  const queuedIds = new Set(runningJobs.map((job) => job.data.executionId));

  // 3. 差集 = dangling（DB 有但队列无）
  const danglingIds = storedIds.filter((id) => !queuedIds.has(id));
  if (danglingIds.length === 0) return waitMs;

  // 4. 标记为 crashed
  await this.executionCrashService.markAsCrashed(danglingIds);

  // 5. 如果用满了 batchSize，加速下一轮
  return storedIds.length >= batchSize ? waitMs / 2 : waitMs;
}
```

**设计要点**:
- Recovery 只在 leader 上运行（`@OnLeaderTakeover` / `@OnLeaderStepdown`）
- 自适应间隔：batch 满时下次间隔减半
- 语义：DB 说在跑但队列里没有 → 标记 crashed

---

## 5. Queue Metrics（源码实读）

```typescript
private readonly jobCounters = { completed: 0, failed: 0 };

private scheduleQueueMetrics() {
  if (!this.isQueueMetricsEnabled || this.queueMetricsInterval) return;

  this.queueMetricsInterval = setInterval(async () => {
    const pendingJobCounts = await this.getPendingJobCounts();
    this.eventService.emit('job-counts-updated', {
      ...pendingJobCounts,  // active, waiting
      ...this.jobCounters,  // completed, failed
    });
    this.jobCounters.completed = 0;
    this.jobCounters.failed = 0;
  }, this.globalConfig.endpoints.metrics.queueMetricsInterval * Time.seconds.toMilliseconds);
}
```

**指标**: `active` / `waiting` / `completed` / `failed`（每 interval 重置计数器）

---

## 6. Error Workflow

### 6.1 机制

1. 新建以 **Error Trigger** 开头的工作流
2. 原工作流 Settings → Error workflow 绑定
3. 执行失败时自动触发（可共用一个 handler 给多个工作流）

### 6.2 Error Trigger 载荷

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

---

## 7. Durable Scheduler（文档层面）

### 7.1 五阶段

| 阶段 | 职责 |
|------|------|
| Materialization | 预写 upcoming runs 到数据库 |
| Execution | Claim 机制领取任务 |
| **Recovery** | Reaper 回收崩溃实例的 claim |
| Retention | 清理过期数据 |
| Owner Reconciliation | 校正实例归属 |

### 7.2 Misfire 策略

- 宽限期默认 1min
- 超期后按节点策略：丢弃 / 只跑最近一次 / 每条 rule 各补一次

### 7.3 Poll Trigger Durable 模式

- `N8N_SCHEDULER_POLL_TRIGGERS_ENABLED` 启用
- Durable poll cursors 与 execution 同事务落库，防漏/重
- Poll 超时 abandon 默认 45s

### 7.4 Prometheus 指标

`tasks_due` / `oldest_pending_age` / `reclaimed` / `dead_lettered` / `lease_lost`

---

## 8. 沙箱 / 隔离

- **Task Runners**: 内部或外部 runner 进程执行 Code 节点
- 凭据加密存储；JWE 加密 OAuth 2.0 token
- SSRF 保护、节点黑名单、外部 hooks
- 加密密钥轮换（`rotate-encryption-keys`）

---

## 9. 超时 / 重试 / 限制汇总

| 项 | 默认 | 来源 |
|----|------|------|
| Worker 并发 | **10** | worker.ts flagsSchema |
| 最低推荐并发 | **5** | worker.ts setConcurrency() |
| Drain 轮询间隔 | **500ms** | scaling.service.ts DRAIN_POLL_INTERVAL_MS |
| 取消写入上限 | **3s** | scaling.service.ts MAX_CANCEL_WRITE_TIMEOUT_MS |
| 取消写入预算占比 | **50%** | scaling.service.ts CANCEL_WRITE_BUDGET_SHARE |
| Drain 预算占比 | **80%** of shutdown window | scaling.service.ts stopWorker() |
| Bull maxStalledCount | **0** | scaling.service.ts setupQueue() |
| MCP Session TTL | **86400s** (24h) | scaling.service.ts MCP_SESSION_TTL |
| Graceful shutdown | **30s** (默认) | N8N_GRACEFUL_SHUTDOWN_TIMEOUT |
| Redis 超时阈值 | **10s** | QUEUE_BULL_REDIS_TIMEOUT_THRESHOLD |
| Queue recovery batchSize | 可配 | queueRecovery.batchSize |
| Queue recovery interval | 可配 (分钟) | queueRecovery.interval |

---

## 10. 失败路径

```
Worker 启动时 Redis 不可用
  → ECONNREFUSED 被 RedisClientService.retryStrategy 处理
  → Lua scripts 初始化失败 → process.exit(1)（不可恢复）

Job 执行异常
  → reportJobProcessingError()
  → job.progress({kind:'job-failed'}) 通知 main
  → errorReporter.error()
  → re-throw → Bull 标记 failed

Drain 超时
  → 取消 in-process 执行（writeDeadline = min(3s, remaining*0.5)）
  → 记录 cancelled execution IDs

Queue recovery 发现 dangling
  → executionCrashService.markAsCrashed(danglingIds)
  → 如果 batch 满，下次间隔减半

Worker pool 未授权
  → process.exit(1)
```

---

## 11. 对 openmate 的可借鉴点

### P0 — 主/Worker + Redis 队列
- 将「触发/入队」与「执行」拆开
- Worker 可独立扩缩；`--concurrency` 控制并行度
- `maxStalledCount: 0` + 自有 recovery 机制（不依赖 Bull 的 stalled 重试）

### P0 — Error Workflow 独立图
- 失败不是日志而是可编排的补偿流
- Error Trigger 载荷结构可直接抄

### P0 — Durable Scheduler 语义
- 数据库预写 runs + claim + reaper + misfire 策略
- 解决「重启丢定时任务」与「多实例双跑」

### P1 — Drain 机制
- 80% 关闭窗口用于 drain，20% 留给 hooks
- 排队 job 无界等待，in-process 执行受 budget 限制后取消
- 取消写入有独立上限防止长时间阻塞

### P1 — Queue Recovery
- DB vs Queue 差集检测 dangling
- 自适应间隔（batch 满时减半）
- Leader-only 执行

### P2 — 大响应 offload
- Worker 响应经 Redis 中继，默认上限 64MiB
- 超限可 offload 到 S3/Azure

---

## 12. 源码锚点速查

```
packages/cli/src/commands/worker.ts
  flagsSchema: concurrency default=10
  setConcurrency(): envConcurrency !== -1 ? envConcurrency : flags.concurrency
  concurrency < 5 → warn
  init(): 完整初始化链路
  run(): setupWorker(concurrency) 在 init 完成后
  stopProcess(): externalHooks + ActiveExecutions.shutdown()

packages/cli/src/scaling/scaling.service.ts
  DRAIN_POLL_INTERVAL_MS = 500
  CANCEL_WRITE_BUDGET_SHARE = 0.5
  MAX_CANCEL_WRITE_TIMEOUT_MS = 3 * Time.seconds.toMilliseconds
  MCP_SESSION_TTL = 86400
  setupQueue(): BullQueue with maxStalledCount: 0
  setupWorker(): queue.process(JOB_TYPE_NAME, concurrency, handler)
  stopWorker(): drain 80% budget, cancel stragglers
  recoverFromQueue(): DB vs Queue 差集 → markAsCrashed
  scheduleQueueRecovery(): @OnLeaderTakeover
  scheduleQueueMetrics(): setInterval → emit job-counts-updated
  registerWorkerListeners(): global:progress → abort-job
  registerMainOrWebhookListeners(): send-chunk / respond-to-webhook / job-finished / job-failed / mcp-response
  handleMcpResponse(): service → DB fetch → McpService; trigger → McpServer
```

---

## 13. 参考链接

- Queue Mode: https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode.md
- Concurrency: https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/control-concurrency.md
- Error handling: https://docs.n8n.io/build/flow-logic/handle-errors-gracefully.md
- Wait: https://docs.n8n.io/build/flow-logic/wait.md
- Durable scheduler: https://docs.n8n.io/deploy/host-n8n/configure-n8n/durable-scheduler.md
