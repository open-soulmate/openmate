# Firecrawl 源代码深度研究

研究时间：2026-09-16 03:45
源码：github.com/firecrawl/firecrawl（180k stars）

## 已读源代码文件

### 1. apps/api/src/services/queue-jobs.ts
- 队列系统核心实现
- ScrapeJobData：抓取任务数据
- 并发限制：getConcurrencyLimitActiveJobs, pushConcurrencyLimitActiveJob
- 任务队列：scrapeQueue.addJob(), scrapeQueue.addJobs()
- 超时处理：backlogTimeoutMs(), ScrapeJobTimeoutError
- A/B测试：abTestJob()
- 通知：sendNotificationWithCustomDays()
- 关键设计：队列+并发限制+超时+通知

### 2. apps/api/src/controllers/v1/scrape.ts
- 抓取控制器
- OpenTelemetry追踪：setSpanAttributes, recordSpanException
- 无密钥限制：keylessLimitBody, reserveKeylessCredits
- 积分系统：adjustKeylessCredits, logKeylessCreditUsage
- 关键设计：控制器+追踪+限流+积分

## 核心架构发现

### 1. 队列系统
- BullMQ：任务队列
- 并发限制：per-team限制
- 优先级：priority参数
- 超时：backlogTimeoutMs
- A/B测试：abTestJob()

### 2. 并发控制
- getConcurrencyLimitActiveJobs()：获取活跃任务
- pushConcurrencyLimitActiveJob()：推入活跃任务
- getEffectiveConcurrencyLimit()：获取有效限制
- getTeamQueueLimit()：获取团队队列限制

### 3. 追踪系统
- OpenTelemetry：分布式追踪
- Span：追踪span
- 属性：setSpanAttributes
- 异常：recordSpanException

### 4. 积分系统
- 无密钥：keylessLimitBody
- 积分：adjustKeylessCredits
- 预留：reserveKeylessCredits
- 日志：logKeylessCreditUsage

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 任务队列系统 | ❌ | ❌ | 大 | BullMQ+并发限制+优先级 |
| 并发控制 | ❌ | ❌ | 大 | per-team限制+活跃任务追踪 |
| 分布式追踪 | ❌ | ❌ | 大 | OpenTelemetry+Span |
| 积分系统 | ❌ | ❌ | 中 | 积分+预留+日志 |
| A/B测试 | ❌ | ❌ | 中 | abTestJob() |

## 可复用设计

1. **任务队列系统**：BullMQ+并发限制+优先级+超时
2. **并发控制**：per-team限制+活跃任务追踪+有效限制
3. **分布式追踪**：OpenTelemetry+Span+属性+异常
4. **积分系统**：积分+预留+日志+无密钥限制
5. **A/B测试**：abTestJob()
