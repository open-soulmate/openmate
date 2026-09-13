# langfuse/langfuse — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/langfuse/langfuse  
> 抓取通道: cdn.jsdelivr.net/gh/langfuse/langfuse@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent 可观测性 / Trace 模型 / 评估闭环 / 自进化 借鉴

---

## 0. 诚实性说明

- 成功拉取: `web/src/features/public-api/types/traces.ts`（完整 Trace API 类型）、`packages/shared/src/server/ingestion/types.ts`（完整 Ingestion 事件类型系统，约 500 行）
- 所有代码引用为源码实读

---

## 1. 项目定位

Langfuse 是**开源 LLM 工程平台**，覆盖开发、监控、评估、调试 AI 应用。

- MIT（`ee/` 目录除外）
- 自托管：docker compose / K8s Helm / Terraform
- 存储：ClickHouse（2026-01 起团队并入 ClickHouse）
- SDK：Python / JS/TS；OpenTelemetry 原生

---

## 2. Ingestion 事件类型系统（源码实读）

### 2.1 事件类型枚举

```typescript
export const eventTypes = {
  TRACE_CREATE: "trace-create",
  SCORE_CREATE: "score-create",
  EVENT_CREATE: "event-create",
  SPAN_CREATE: "span-create",
  SPAN_UPDATE: "span-update",
  GENERATION_CREATE: "generation-create",
  GENERATION_UPDATE: "generation-update",
  AGENT_CREATE: "agent-create",
  TOOL_CREATE: "tool-create",
  CHAIN_CREATE: "chain-create",
  RETRIEVER_CREATE: "retriever-create",
  EVALUATOR_CREATE: "evaluator-create",
  EMBEDDING_CREATE: "embedding-create",
  GUARDRAIL_CREATE: "guardrail-create",
  SDK_LOG: "sdk-log",
  DATASET_RUN_ITEM_CREATE: "dataset-run-item-create",
  // LEGACY
  OBSERVATION_CREATE: "observation-create",
  OBSERVATION_UPDATE: "observation-update",
} as const;
```

**设计要点**: 18 种事件类型，覆盖 Trace / Score / Observation（Span/Generation/Event）/ 语义化 Observation（Agent/Tool/Chain/Retriever/Evaluator/Embedding/Guardrail）/ Dataset / SDK Log。

### 2.2 ID Schema 限制

```typescript
export const idSchema = z
  .string()
  .min(1)
  .max(800)  // AWS S3 allows 1024 bytes for object keys
  .refine((id) => !id.includes("\r"), {
    message: "ID cannot contain carriage return characters",
  });
```

**限制**: ID 最长 800 字符，不能包含回车符。

### 2.3 Observation Level

```typescript
const ObservationLevel = z.enum(["DEBUG", "DEFAULT", "WARNING", "ERROR"]);
```

---

## 3. Usage / Cost 模型（源码实读）

### 3.1 新 Usage 模型

```typescript
export const Usage = z.object({
  input: z.number().int().nullish(),
  output: z.number().int().nullish(),
  total: z.number().int().nullish(),
  unit: z.enum(ModelUsageUnit).nullish(),
  inputCost: z.number().nullish(),
  outputCost: z.number().nullish(),
  totalCost: z.number().nullish(),
});
```

### 3.2 混合 Usage 兼容（OpenAI 格式自动转换）

```typescript
const MixedUsage = z.object({
  input: z.number().int().nullish(),
  output: z.number().int().nullish(),
  total: z.number().int().nullish(),
  unit: z.enum(ModelUsageUnit).nullish(),
  promptTokens: z.number().int().nullish(),      // OpenAI 旧格式
  completionTokens: z.number().int().nullish(),   // OpenAI 旧格式
  totalTokens: z.number().int().nullish(),        // OpenAI 旧格式
  inputCost: z.number().nullish(),
  outputCost: z.number().nullish(),
  totalCost: z.number().nullish(),
});

export const usage = MixedUsage.nullish()
  .transform((v) => {
    if (!v) return null;
    // OpenAI 格式 → 新格式
    if ("promptTokens" in v || "completionTokens" in v || "totalTokens" in v) {
      return {
        input: v.promptTokens,
        output: v.completionTokens,
        total: v.totalTokens,
        unit: ModelUsageUnit.Tokens,
      };
    }
    if (isEmpty(v)) return undefined;
    return v;
  })
  .pipe(Usage.nullish());
```

### 3.3 OpenAI Completion API Usage 解析

```typescript
const OpenAICompletionUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  prompt_tokens_details: z.record(...).nullish(),
  completion_tokens_details: z.record(...).nullish(),
}).strict().transform((v) => {
  const result = {
    input: prompt_tokens,
    output: completion_tokens,
    total: total_tokens,
  };
  // 详细 token 类型从 input/output 中减去
  if (prompt_tokens_details) {
    for (const [key, value] of Object.entries(prompt_tokens_details)) {
      result[`input_${key}`] = value;
      result.input = Math.max(result.input - (value ?? 0), 0);
    }
  }
  // completion_tokens_details 同理
  return result;
});
```

**设计要点**: `prompt_tokens_details`（如 `cached_tokens`）从 `input` 中减去，避免重复计算。

### 3.4 OpenAI Response API Usage 解析

```typescript
const OpenAIResponseUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  input_tokens_details: z.record(...).nullish(),
  output_tokens_details: z.record(...).nullish(),
}).strict().transform((v) => { ... });
```

### 3.5 UsageDetails 联合类型

```typescript
export const UsageDetails = z.union([
  OpenAICompletionUsageSchema,
  OpenAIResponseUsageSchema,
  RawUsageDetails,
]).nullish();
```

---

## 4. Environment 规范化（源码实读）

### 4.1 默认值

```typescript
export const DEFAULT_TRACE_ENVIRONMENT = "default" as const;
```

### 4.2 Public Environment Name

```typescript
const PublicEnvironmentName = z
  .string()
  .toLowerCase()
  .transform((val) => {
    // 剥离 "langfuse" 前缀（幂等，处理 "langfuselangfuse-x" 情况）
    const stripped = val.replace(/^(?:langfuse[-_]?)+/, "");
    const truncated = stripped.slice(0, 40);
    if (!truncated || !/^[a-z0-9-_]+$/.test(truncated)) {
      return DEFAULT_TRACE_ENVIRONMENT;
    }
    return truncated;
  })
  .catch(DEFAULT_TRACE_ENVIRONMENT)
  .default(DEFAULT_TRACE_ENVIRONMENT);
```

**限制**: 环境名最长 40 字符，只允许 `[a-z0-9-_]`，"langfuse" 前缀被剥离。

### 4.3 Internal Environment Name

```typescript
const InternalEnvironmentName = z
  .string()
  .transform((val) => {
    const truncated = val.slice(0, 40);
    if (!truncated || !/^[a-z0-9-_]+$/.test(truncated)) {
      return DEFAULT_TRACE_ENVIRONMENT;
    }
    return truncated;
  })
  .catch(DEFAULT_TRACE_ENVIRONMENT)
  .default(DEFAULT_TRACE_ENVIRONMENT);
```

**区别**: Internal 不剥离 "langfuse" 前缀（内部 trace 保持在 "langfuse-*" 命名空间）。

---

## 5. TraceBody（源码实读）

```typescript
const TraceBody = z.object({
  id: idSchema.nullish(),
  timestamp: stringDateTime,
  name: z.string().max(1000).nullish(),
  externalId: z.string().nullish(),
  input: z.any().nullish(),
  output: z.any().nullish(),
  sessionId: z.string().nullish(),
  userId: z.string().nullish(),
  environment: environmentSchema,
  metadata: jsonSchema.nullish(),
  release: z.string().nullish(),
  version: z.string().nullish(),
  public: z.boolean().nullish(),
  tags: z.array(z.string()).nullish(),
});
```

**限制**: `name` 最长 1000 字符。

---

## 6. Score 系统（源码实读）

### 6.1 BaseScoreBody

```typescript
const BaseScoreBody = z.object({
  id: idSchema.nullish(),
  name: NonEmptyString,
  traceId: z.string().nullish(),
  sessionId: z.string().nullish(),
  datasetRunId: z.string().nullish(),
  environment: environmentSchema,
  observationId: z.string().nullish(),
  comment: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  source: z.enum(["API", "EVAL", "ANNOTATION"]).default("API"),
  executionTraceId: z.string().nullish(),
  queueId: z.string().nullish(),
});
```

### 6.2 Score 数据类型（discriminatedUnion）

```typescript
const ScoreBody = applyScoreValidation(
  z.discriminatedUnion("dataType", [
    // NUMERIC: 浮点数
    BaseScoreBody.extend({ value: z.number(), dataType: z.literal("NUMERIC"), configId: z.string().nullish() }),
    // CATEGORICAL: 字符串
    BaseScoreBody.extend({ value: z.string(), dataType: z.literal("CATEGORICAL"), configId: z.string().nullish() }),
    // BOOLEAN: 0 或 1
    BaseScoreBody.extend({
      value: z.number().refine((v) => v === 0 || v === 1),
      dataType: z.literal("BOOLEAN"), configId: z.string().nullish(),
    }),
    // CORRECTION: 字符串，无 config
    BaseScoreBody.extend({ value: z.string(), dataType: z.literal("CORRECTION"), configId: z.undefined().nullish() }),
    // TEXT: 字符串，有长度限制
    BaseScoreBody.extend({
      value: z.string().min(1).max(TEXT_SCORE_MAX_LENGTH),
      dataType: z.literal("TEXT"), configId: z.string().nullish(),
    }),
    // 无 dataType: 字符串或数字
    BaseScoreBody.extend({ value: z.union([z.string(), z.number()]), dataType: z.undefined(), configId: z.string().nullish() }),
  ]),
);
```

**6 种 Score 数据类型**: NUMERIC / CATEGORICAL / BOOLEAN / CORRECTION / TEXT / 无类型。

---

## 7. Generation Body（源码实读）

```typescript
const CreateGenerationBody = CreateSpanBody.extend({
  completionStartTime: stringDateTime,
  model: z.string().nullish(),
  modelParameters: z.record(z.string(), z.union([...]).nullish()).nullish(),
  usage: usage,
  usageDetails: UsageDetails,
  costDetails: CostDetails,
  promptName: z.string().nullish(),
  promptVersion: z.number().int().nullish(),
}).refine((value) => {
  // promptName 和 promptVersion 必须同时设置或同时不设
  if (!value.promptName && !value.promptVersion) return true;
  if (value.promptName && value.promptVersion) return true;
  return false;
});
```

**校验**: `promptName` 和 `promptVersion` 必须成对出现。

---

## 8. Public vs Internal Schema 工厂（源码实读）

```typescript
const createAllIngestionSchemas = ({ isPublic = true }: { isPublic: boolean }) => {
  const environmentSchema = isPublic ? PublicEnvironmentName : InternalEnvironmentName;
  // ... 创建所有 schema
  return { TraceBody, ScoreBody, ingestionEvent, ... };
};

const publicSchemas = createAllIngestionSchemas({ isPublic: true });
const internalSchemas = createAllIngestionSchemas({ isPublic: false });

export const createIngestionEventSchema = (isLangfuseInternal = false) => {
  return isLangfuseInternal
    ? internalSchemas.ingestionEvent
    : publicSchemas.ingestionEvent;
};
```

**设计要点**: 单一工厂函数生成 public/internal 两套 schema，仅 environment 验证逻辑不同。

---

## 9. DatasetRunItem（仅内部）

```typescript
const datasetRunItemCreateEvent = isPublic
  ? baseDatasetRunItemCreateEvent.refine(() => false, {
      message: "Dataset run item creation is only allowed for internal usage",
    })
  : baseDatasetRunItemCreateEvent;
```

**限制**: Dataset run item 创建仅限内部使用。

---

## 10. Trace API 类型（源码实读）

### 10.1 APITrace

```typescript
export const APITrace = z.object({
  id: z.string(),
  externalId: z.string().nullable(),
  timestamp: z.coerce.date(),
  name: z.string().nullable(),
  userId: z.string().nullable(),
  metadata: z.any(),
  release: z.string().nullable(),
  version: z.string().nullable(),
  projectId: z.string(),
  environment: z.string().default("default"),
  public: z.boolean(),
  bookmarked: z.boolean(),
  tags: z.array(z.string()),
  input: z.any(),
  output: z.any(),
  sessionId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
}).strict();
```

### 10.2 APIExtendedTrace

```typescript
const APIExtendedTrace = APITrace.extend({
  observations: z.array(z.string()).nullish(),
  scores: z.array(z.string()).nullish(),
  totalCost: z.number().nullish(),
  latency: z.number().nullish(),
  htmlPath: z.string(),
}).strict();
```

### 10.3 批量删除限制

```typescript
export const DeleteTracesV1Body = z.object({
  traceIds: z.array(z.string())
    .min(1, "At least 1 traceId is required.")
    .max(1000, "Cannot specify more than 1000 traces in a single request."),
}).strict();
```

---

## 11. 核心数据模型

```
Session (1) ──o── (n) Trace (1) ──o── (n) Observation
```

| 概念 | 含义 |
|------|------|
| **Observation** | 单步：LLM call、tool call、检索步骤等；可嵌套 |
| **Trace** | 一次完整请求，共享 `trace_id` |
| **Session** | 聚合多轮对话中的多条 trace |

---

## 12. 数据摄入与 HA

### 12.1 异步批处理

```
App ──createTrace()──► SDK ──enqueue──► 本地队列（非阻塞）
                                              │
                                    后台 Exporter 定时/按批
                                              │
                                              ▼
                                        Langfuse 后端
```

- **短命进程必须显式 `flush()`**，否则 trace 丢失

### 12.2 OpenTelemetry 原生

- 不锁定 Langfuse SDK
- 可同时导出到 Datadog 等

---

## 13. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| ID 最大长度 | **800** 字符 | types.ts idSchema |
| ID 不能含 | `\r`（回车） | types.ts idSchema |
| Trace name 最大长度 | **1000** 字符 | types.ts TraceBody |
| Environment 最大长度 | **40** 字符 | types.ts PublicEnvironmentName |
| Environment 字符集 | `[a-z0-9-_]` | types.ts |
| Environment 默认值 | `"default"` | types.ts DEFAULT_TRACE_ENVIRONMENT |
| 批量删除上限 | **1000** traces/请求 | traces.ts |
| Score 数据类型 | 6 种 | types.ts ScoreBody |
| 事件类型 | **18** 种 | types.ts eventTypes |
| Observation Level | 4 种 | types.ts |
| Score source | 3 种 | types.ts |
| promptName/promptVersion | 必须成对 | types.ts CreateGenerationBody |
| DatasetRunItem | 仅内部 | types.ts |
| TEXT score 长度 | TEXT_SCORE_MAX_LENGTH | types.ts |

---

## 14. 失败路径

```
ID 超过 800 字符
  → Zod 校验失败

ID 包含回车符
  → Zod refine 失败

Environment 名无效字符
  → 回退到 "default"

Environment 名超 40 字符
  → 截断

批量删除 > 1000 traces
  → Zod 校验失败

promptName 设置但 promptVersion 未设
  → Zod refine 失败

BOOLEAN score value 非 0/1
  → Zod refine 失败

TEXT score 超长
  → Zod 校验失败

短命进程不 flush
  → 队列未发送 → trace 静默丢失

公开 API 创建 DatasetRunItem
  → refine(() => false) 失败
```

---

## 15. 对 openmate 的可借鉴点

### P0 — Trace 模型
- Session → Trace → Observation 三层结构
- 18 种事件类型覆盖 Agent/Tool/Chain/Retriever/Evaluator/Embedding/Guardrail
- 属性下放：user_id / session_id / env / version 自动传播

### P0 — Usage/Cost 归一化
- OpenAI Completion / Response / 自定义三种格式统一
- `prompt_tokens_details` 从 input 中减去避免重复
- Cost 独立于 Usage

### P0 — Environment 规范化
- 小写 + 字符集限制 + 长度限制 + 前缀剥离
- Public vs Internal 双 schema

### P1 — Score 系统
- 6 种数据类型（NUMERIC/CATEGORICAL/BOOLEAN/CORRECTION/TEXT/无类型）
- 3 种来源（API/EVAL/ANNOTATION）
- discriminatedUnion 类型安全

### P1 — 异步批处理 + 显式 flush
- 长驻服务：后台 exporter
- 短命任务：shutdown hook 必须 `flush()`

### P2 — Schema 工厂模式
- 单一工厂函数生成 public/internal 两套 schema
- 仅 environment 验证逻辑不同

---

## 16. 源码锚点速查

```
packages/shared/src/server/ingestion/types.ts
  idSchema: min=1 max=800, no \r
  eventTypes: 18 种
  ObservationLevel: DEBUG/DEFAULT/WARNING/ERROR
  Usage: input/output/total/unit/inputCost/outputCost/totalCost
  MixedUsage: + promptTokens/completionTokens/totalTokens
  OpenAICompletionUsageSchema: prompt_tokens_details 从 input 减去
  OpenAIResponseUsageSchema: input_tokens_details 从 input 减去
  DEFAULT_TRACE_ENVIRONMENT = "default"
  PublicEnvironmentName: lowercase, strip langfuse prefix, max 40, [a-z0-9-_]
  InternalEnvironmentName: 不剥离 prefix
  TraceBody: name max=1000
  ScoreBody: 6 种 dataType
  CreateGenerationBody: promptName/promptVersion 成对
  createAllIngestionSchemas(): public/internal 工厂
  datasetRunItemCreateEvent: 仅内部

web/src/features/public-api/types/traces.ts
  APITrace: 17 字段
  APIExtendedTrace: + observations/scores/totalCost/latency/htmlPath
  DeleteTracesV1Body: max 1000
```

---

## 17. 参考链接

- https://github.com/langfuse/langfuse
- https://langfuse.com/docs/tracing
- https://langfuse.com/docs/observability/data-model
- https://langfuse.com/docs/evaluation/overview
- https://langfuse.com/self-hosting
