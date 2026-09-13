# Firecrawl — Deep Source Report

**Repo:** firecrawl/firecrawl  
**Branch analyzed:** `main`  
**Source verification:** LIVE via jsDelivr. Verified: `apps/api/src/controllers/v1/scrape.ts` (13KB), `apps/api/src/scraper/scrapeURL/index.ts` (65KB), `apps/api/src/services/queue-jobs.ts` (25KB), `apps/api/package.json` (7KB), README (25KB).  
**Date:** 2026-09-13

---

## 1. What it actually is

Firecrawl is a **web scraping API** that turns URLs into LLM-ready markdown/html. Architecture:

```
HTTP API (Express 5)
    → scrapeController
    → queue (NuQ / BullMQ / FoundationDB)
    → worker
    → scrapeURL engine waterfall
    → markdown / html / json / screenshot
```

It is **not** an agent — it's the tool layer agents call. Scale signals: GCS, Bigtable, Pub/Sub, Redis, FoundationDB, ClickHouse, Prometheus all in `package.json` dependencies.

---

## 2. Dependency stack (VERIFIED — `apps/api/package.json`)

Notable deps (real pins):

| Package | Version | Role |
|---------|---------|------|
| `bullmq` | ^5.56.7 | Job queue |
| `foundationdb` | ^2.0.1 | Alternate queue backend |
| `ioredis` | ^5.6.1 | Redis |
| `@google-cloud/storage` | ^7.21.0 | Job payload / artifacts |
| `@google-cloud/bigtable` | ^7.2.0 | Large storage |
| `@google-cloud/pubsub` | ^6.0.1 | Events |
| `@clickhouse/client` | ^1.8.1 | Analytics |
| `cheerio` | ^1.0.0-rc.12 | HTML parse |
| `jsdom` | ^29.1.1 | DOM |
| `undici` | 7.29.0 | HTTP |
| `puppeteer` / playwright | (via engines) | Browser scrape |
| `@mendable/firecrawl-rs` | workspace:* | **Rust core** (workspace) |
| `ai` | 6.0.86 | Vercel AI SDK (LLM extract/agent) |
| `@ai-sdk/openai` | 3.0.71 | LLM |
| `stripe`, `autumn-js` | | Billing |
| `prom-client` | ^15.1.3 | Metrics |
| `express` | 5.2.1 | HTTP |
| `redlock` | 5.0.0-beta.2 | Distributed locks |
| `rate-limiter-flexible` | 2.4.2 | Rate limits |
| `robots-parser` | ^3.0.1 | robots.txt |
| `pdf-parse`, `turndown`, `marked` | | Content transforms |
| `winston` | ^3.14.2 | Logs |
| `opentelemetry/*` | | Tracing |

**Rust workspace crate** `@mendable/firecrawl-rs` is the performance-critical scraper core. JS is the orchestration layer.

---

## 3. Scrape controller (VERIFIED — `controllers/v1/scrape.ts`)

### Request path

```typescript
export async function scrapeController(req, res, ...) {
  const jobId: string = uuidv7();
  // threat protection, permissions, key restrictions
  // zero-data-retention flag
  const { scrapeOptions, internalOptions } = fromV1ScrapeOptions(req.body, req.body.timeout);
```

### Timeout handling (REAL constants)

```typescript
const timeout = req.body.timeout;
// ...
if (timeout) {
  timeoutHandle = setTimeout(() => {
    aborter.abort(...);
  }, timeout * 0.667);   // abort at 66.7% of timeout
}

// default wait cap
timeout ?? 60_000   // 60 seconds default scrape timeout
```

**Two-phase timeout:**
1. Soft abort at **0.667 × timeout** (gives in-flight work a chance to finish/cleanup).
2. Hard default **60_000 ms** if client didn't specify.

### Queue vs inline

```typescript
const isDirectToBullMQ = ...;
if (!isDirectToBullMQ) {
  const reservation = await reserveKeylessCredits(...);
}
// lock, then:
const job: NuQJob<ScrapeJobData> = { ... };
const doc = await processJobInternal(job);  // or enqueue
```

Error mapping:

```typescript
const timeoutErr = (e.code === "SCRAPE_TIMEOUT" || e.code === "CONCURRENCY_QUEUE_TIMEOUT");
return res.status(timeoutErr ? 408 : 500).json({ ... });
```

**408** for timeouts, **500** otherwise. Clean HTTP semantics.

Also: `getJobPriority({ ... })` — dynamic priority before enqueue.

---

## 4. scrapeURL engine waterfall (VERIFIED — `scraper/scrapeURL/index.ts`)

This file is 65KB — the heart of scraping.

### Engine selection

```typescript
import { getEngineForUrl } from "../WebScraper/utils/engine-forcing";
import { scrapeURLWithEngine, getEngineMaxReasonableTime } from "./engines";
```

Flags derived from URL path:

```typescript
if (lowerPath.endsWith(".pdf") || lowerPath.includes(".pdf/")) {
  flags.add("pdf");
}
// document types take precedence over PDF
// raster images → OCR via FirePDF when parsers configured
```

### Timeout composition

```typescript
options.timeout !== undefined
  ? setTimeout(
      () => abortController.abort(new ScrapeJobTimeoutError()),
      options.timeout,
    )
  : ...

// also:
composeTimeoutProcessing
tier: "scrape",
timesOutAt: new Date(Date.now() + options.timeout),
```

### Failure taxonomy (imported error classes)

```
EngineError
NoEnginesLeftError
PDFAntibotError
PDFFetchProxyError
PDFInsufficientTimeError
PDFOCRRequiredError
PDFPrefetchFailed
EngineSnipedError
WaterfallNextEngineSignal      // control-flow: try next engine
EngineUnsuccessfulError
ScrapeRetryLimitError
ScrapeJobTimeoutError
NoCachedDataError
```

`WaterfallNextEngineSignal` is the **explicit "try next engine"** signal — waterfall is cooperative, not exception-driven chaos.

### Retry tracking

```typescript
import { ScrapeRetryTracker } from "./retryTracker";
```

Per-scrape retry ledger. `ScrapeRetryLimitError` when exhausted.

### Large PDF by-reference path

```typescript
// Large PDFs handed off by GCS reference
// fire-pdf/async.ts cancel policy: jobs outlive abandoned scrapes BY DESIGN
largePdfProcessing?: {
  jobScrapeId: string;
  // remaining estimate for timeout message
}
```

**Design choice:** async FirePDF jobs **intentionally outlive** the scrape request. `SCRAPE_TIMEOUT` must distinguish "caller gone, work continues" vs "work died".

### Lockdown mode

```typescript
// Lockdown forces index-only engines and ignores every request-time feature.
// Return empty so the fallback threshold never filters index engines out.
```

### Meta object

```typescript
type Meta = {
  id: string;
  scrapeURL: string;
  options: ScrapeOptions & { skipTlsVerification: boolean };
  // logs, feature flags, abortHandle, winnerEngine, threat protection trail
}
```

`buildMetaObject` assembles everything engines need. `applyScrapeOptionsDefaults(options)` fills defaults.

### Internal options

```typescript
type InternalOptions = {
  disableSmartWaitCache?: boolean;
  saveScrapeResultToGCS?: boolean;
  v1Agent?: ScrapeOptionsV1["agent"];
  v1JSONAgent?: ...;
  isPreCrawl?: boolean;
  isParse?: boolean;  // from /v2/parse
}
```

---

## 5. Queue jobs (VERIFIED — `services/queue-jobs.ts`)

### Backlog timeout (REAL function)

```typescript
function backlogTimeoutMs(data: ScrapeJobData): number {
  if (data.crawl_id) return MAX_BACKLOG_TIMEOUT_MS;
  if (data.monitoring) return MONITOR_CHECK_STALE_TIMEOUT_MS;
  return data.scrapeOptions.timeout ?? 60 * 1000;
}
```

| Job type | Backlog deadline |
|----------|------------------|
| Crawl child | `MAX_BACKLOG_TIMEOUT_MS` (imported constant) |
| Monitoring check | `MONITOR_CHECK_STALE_TIMEOUT_MS` |
| One-off scrape | scrape timeout or **60s** |

Imported from `../lib/concurrency-limit`:
```
MAX_BACKLOG_TIMEOUT_MS
getEffectiveConcurrencyLimit
getConcurrencyLimitActiveJobs
getConcurrencyQueueJobsCount
getCrawlConcurrencyLimitActiveJobs
getTeamQueueLimit
QueueFullError
pushConcurrencyLimitedJob(s)
pushConcurrencyLimitActiveJob
pushCrawlConcurrencyLimitActiveJob
cleanOldConcurrencyLimitEntries
```

**Per-team concurrency limits** are first-class (`getTeamQueueLimit`). Crawl jobs have a separate concurrency pool from one-off scrapes.

### Enqueue

```typescript
async function _addScrapeJobToConcurrencyQueue(jobId, priority = 0, ...) {
  await scrapeQueue.addJob(jobId, {
    priority,
    backloggedTimesOutAt: Date.now() + backlogTimeoutMs(webScraperOptions),
    concurrencyLimited: true,
  });
  await pushConcurrencyLimitedJob(teamId, { id: jobId, priority, ... }, backlogTimeoutMs(...));
}
```

Batch variant `_addScrapeJobsToConcurrencyQueue` uses `addJobs` (plural) for efficiency.

### Queue backends (from imports)

```typescript
import { NuQJob, scrapeQueue } from "./worker/nuq";
import {
  fdbEnqueueScrapeJobs,
  resolveJobBackend,
  scrapeQueue as routedScrapeQueue,
  scrapeQueueFdb,
  withFdbTimeout,
} from ...
```

**Dual backend:** NuQ (default) and FoundationDB. `resolveJobBackend` routes. `withFdbTimeout` wraps FDB ops.

Also: `abTestJob` from `./ab-test` — A/B testing of job paths.

---

## 6. Crawling (from controller + queue code)

- `crawl_id` present → child of a crawl.
- Separate `getCrawlConcurrencyLimitActiveJobs` / `pushCrawlConcurrencyLimitActiveJob`.
- Crawl children use `MAX_BACKLOG_TIMEOUT_MS` (not scrape timeout) — parents may live long.

---

## 7. Threat protection & security

From `scrape.ts`:

```typescript
const threatProtection = await resolveThreatProtection({ ... });
const permissions = checkPermissions(req.body, req.acuc?.flags, { ... });
const keyRestriction = await checkKeyFormatRestriction(...);
const zeroDataRetention = ...;
```

`robots-parser` in deps — robots.txt respect is available (policy not fully verified).

`allowed_domains` / similar options exist in scrape options (browser-use-like allowlist pattern).

---

## 8. Observability

- OpenTelemetry exporter in deps (`@opentelemetry/exporter-trace-otlp-proto`).
- `prom-client` for Prometheus metrics.
- `winston` structured logs with child loggers (`_logger.child({ scrapeId, ... })`).
- ClickHouse for analytics.
- `logRequest({ ... })` async fire-and-forget in controller.

---

## 9. What OpenClaw-class systems can learn

1. **Soft abort at 0.667 × timeout** — cleanup window before hard kill.
2. **`WaterfallNextEngineSignal`** as control flow — explicit next-engine, not exception roulette.
3. **Typed scrape error taxonomy** (12+ classes) — enables precise retry and HTTP mapping.
4. **408 vs 500 mapping** for timeout vs server error.
5. **Backlog deadline differs by job class** (crawl vs monitoring vs scrape).
6. **Per-team concurrency + separate crawl pool** — noisy-neighbor isolation.
7. **Large async jobs intentionally outlive requests** — document it, handle in timeout path.
8. **Rust core + TS orchestration** — perf-critical path in Rust, control plane in TS.
9. **Dual queue backend (NuQ + FDB)** with resolver — migration/HA without rewrite.
10. **ScrapeRetryTracker** as per-job ledger — not global counter.

---

## 10. Honest gaps

- Engine implementations (`scraper/scrapeURL/engines/*`) not fetched — actual Playwright/scrapling/pdf engine internals unknown.
- `MAX_BACKLOG_TIMEOUT_MS` numeric value not extracted (imported from `lib/concurrency-limit`).
- `MONITOR_CHECK_STALE_TIMEOUT_MS` numeric value not extracted.
- Worker execution loop (`services/worker.ts`) returned 89-byte stub.
- Crawl orchestration (`controllers/v1/crawl.ts`) not fetched.
- Rust crate source (`firecrawl-rs`) not fetched.
- jsDelivr may lag `main`.

---

## 11. Source citations (CDN URLs used)

- `https://cdn.jsdelivr.net/gh/firecrawl/firecrawl@main/apps/api/src/controllers/v1/scrape.ts`
- `https://cdn.jsdelivr.net/gh/firecrawl/firecrawl@main/apps/api/src/scraper/scrapeURL/index.ts`
- `https://cdn.jsdelivr.net/gh/firecrawl/firecrawl@main/apps/api/src/services/queue-jobs.ts`
- `https://cdn.jsdelivr.net/gh/firecrawl/firecrawl@main/apps/api/package.json`
- `https://cdn.jsdelivr.net/gh/firecrawl/firecrawl@main/README.md`

---

*Report depth: controller timeouts, waterfall error model, queue backlog policy, and dependency stack are source-verified. Engine internals and numeric queue constants marked as gaps.*
