# LibreChat 深度架构报告（openmate 参考级）

> 供 openmate 参考：**可恢复流（resumable streams）、中止/审批、并发限制、缓存命名空间**
> 调研日期：2026-09-13
> 资料来源：jsDelivr 实拉 `danny-avila/LibreChat@main`（GitHub raw 超时，改 CDN）
> 版本锚点：根 `package.json` → `"name": "LibreChat"`, `"version": "v0.8.8-rc3"`, `"packageManager": "npm@11.13.0"`

---

## 0. 验证状态（诚实）

| 类别 | 状态 |
|---|---|
| package.json / librechat.example.yaml / .env.example | ✅ 完整实拉 |
| api/server/services/Runs/StreamRunManager.js | ✅ 22324 B |
| api/server/services/Runs/RunManager.js | ✅ 6459 B |
| api/server/services/Runs/handle.js | ✅ 9457 B |
| api/server/middleware/abortMiddleware.js | ✅ 9741 B |
| api/server/middleware/abortRun.js | ✅ 3354 B |
| api/cache/getLogStores.js | ✅ 8623 B |
| api/cache/clearPendingReq.js | ✅ 1691 B |
| api/app/clients/BaseClient.js | ✅ 75678 B |
| api/app/clients/tools/util/handleTools.js | ✅ 26264 B |
| api/server/services/createRunBody.js | ✅ 3436 B |

**CDN 单文件 404（列表 API 显示存在，单文件拉不到）：**

- `api/models/Session.js`, `Transaction.js`, `Agent.js`
- `api/server/controllers/agents/run.js`
- `api/server/utils/streamResponse.js`
- `api/app/clients/OpenAIClient.js`, `AnthropicClient.js`, `llm/RunManager.js`

**报告策略：** 以下只引用 **已实拉** 文件中的路径、常量与行为；未拉到的文件不编造内部实现。

Monorepo workspaces：`api`, `client`, `packages/*`（package.json L6-10）。

---

## 1. 版本与部署形态

- npm workspaces + turbo build
- Redis 单机/集群脚本：`redis:single` / `redis:cluster`（package.json scripts）
- `USE_REDIS=true` + `USE_REDIS_CLUSTER=true` + `REDIS_URI`
- MongoDB：`MONGO_URI=mongodb://127.0.0.1:27017/LibreChat`（.env.example L30）
- Meilisearch：`MEILI_HOST=http://0.0.0.0:7700`（.env.example L712）

### 1.1 librechat.example.yaml 关键默认

| 项 | 值 | 行号 |
|---|---|---|
| `cache` | `true` | L8 |
| `registration` | 对象（可选） | L343 |
| `agents.recursion` 默认/最大 | 文档注释 defaults 25 / max 25 | L556-558 |
| `agents.maxSubagents` | `20`（注释示例） | L611 |
| `agents.capabilities` | `["deferred_tools","execute_code","file_search","web_search","artifacts","subagents","actions","context","skills","memory","ask_user_question","tools","chain","ocr"]` | L630 |
| resumable streams 注释 | `A deployment with Redis-backed resumable streams can run this on every replica.` | L214-215 |
| scheduled agents 注释 | 需要 `USE_REDIS_STREAMS=true` | L217 |
| stream smoothing | Agents SDK-backed providers 25ms default | L749 |

### 1.2 .env.example 会话/限制

| 变量 | 值 |
|---|---|
| `SESSION_EXPIRY` | `1000 * 60 * 15`（15 分钟） |
| `ALLOW_REGISTRATION` | `true` |
| `ALLOW_UNVERIFIED_EMAIL_LOGIN` | `true` |
| `LIMIT_CONCURRENT_MESSAGES` | 见 clearPendingReq |
| 违规分 | `TTS_VIOLATION_SCORE=0`, `STT_VIOLATION_SCORE=0`, `FILE_UPLOAD_VIOLATION_SCORE=0` |

---

## 2. 可恢复流与 Run 生命周期

### 2.1 StreamRunManager（`api/server/services/Runs/StreamRunManager.js`）

构造状态（L22-102）：

```js
this.index = 0;
this.steps = new Map();                 // RunStep
this.mappedOrder = new Map();
this.orderedRunSteps = new Map();       // StepToolCall
this.processedFileIds = new Set();
this.progressCallbacks = new Map();
this.run = null;
this.streamRate = fields.streamRate ?? Constants.DEFAULT_STREAM_RATE;
```

**完整 AssistantStreamEvents 处理表（L77-101）：**

| 事件 | handler |
|---|---|
| ThreadCreated | handleThreadCreated |
| ThreadRunCreated / Queued / InProgress / RequiresAction / Completed / Failed / Cancelling / Cancelled / Expired | handleRunEvent |
| ThreadRunStepCreated / InProgress / Completed / Failed / Cancelled / Expired | handleRunStepEvent |
| ThreadRunStepDelta | handleRunStepDeltaEvent |
| ThreadMessageCreated / InProgress / Completed / Incomplete | handleMessageEvent |
| ThreadMessageDelta | handleMessageDeltaEvent |
| ErrorEvent | handleErrorEvent |

流控：`await sleep(this.streamRate)`（L359, L464）—— **客户端 SSE 节流**。

`addContentData`：把 content part 写入 `finalMessage.content[index]`；TEXT 且非 edited 时累加 `this.text`。

### 2.2 Run 等待轮询（`api/server/services/Runs/handle.js`）

```js
async function withTimeout(promise, timeoutMs, timeoutMessage) { ... Promise.race ... }

async function waitForRun({
  pollIntervalMs = 2000,
  timeout = 60000 * 3,        // 3 分钟
}) {
  const raceTimeoutMs = 3000;
  let maxRetries = 5;
  // 内层：retrieveRun 失败最多 5 次，每次 race 3s
  // 外层：总 timeout 180s，每 2s 轮询
}
```

| 常量 | 值 | 出处 |
|---|---|---|
| pollIntervalMs | 2000 ms | handle.js L58, L63 |
| 总 timeout | 180000 ms (3 min) | handle.js L59, L68 |
| raceTimeoutMs | 3000 ms | handle.js L80 |
| maxRetries | 5 | handle.js L81 |

Abort 探测：每轮查 `getLogStores(CacheKeys.ABORT_KEYS)`，key = `${userId}:${conversationId}`。

### 2.3 中止协议

#### abortMiddleware（`api/server/middleware/abortMiddleware.js`）

`abortMessage` 流程：

1. `abortKey` 解析：`conversationId = abortKey?.split(':')?.[0] ?? req.user.id`
2. Assistants 端点 → 转 `abortRun`
3. 否则 `GenerationJobManager.abortJob(conversationId)`（**streamId === conversationId**）
4. 失败且未发 headers → `res.status(204).send({ message: 'Request not found' })`
5. 成功：`countTokens(text)` + `spendCollectedUsage`

`spendCollectedUsage` 防双花（L20-26, L66-69 源码注释）：

> After spending, this function clears the collectedUsage array to prevent double-spending. The array is shared with AgentClient.collectedUsage.

```js
collectedUsage.length = 0;
```

#### abortRun（`api/server/middleware/abortRun.js`）

```js
const three_minutes = 1000 * 60 * 3;
```

1. `abortKey.split(':')` → `conversationId, latestMessageId`
2. UUID 校验失败 → 400
3. cache 查 `userId:conversationId` → `thread_id:run_id`
4. 无 run / 已 cancelled → 204
5. `cache.set(cacheKey, 'cancelled', three_minutes)`
6. `openai.beta.threads.runs.cancel`
7. 已是 CANCELLED/CANCELLING 错误 → `res.end()`
8. `recordUsage` 记账
9. `deleteMessages({ unfinished: true })` 删未完成消息
10. `checkMessageGaps` 补齐消息空洞
11. 发 `final: true` 事件

TODO 注释（L75）：

> a reconciling strategy between the existing intermediate message would be more optimal than deleting it

**openmate 启示：** 中止要 (a) 标记 cache 防重复 abort (b) 记 usage (c) 清理半成品 (d) 补齐消息洞 (e) 发 final 事件。

---

## 3. 缓存命名空间（`api/cache/getLogStores.js`）

完整 namespace 表（L22-74）：

| Namespace | Store | TTL |
|---|---|---|
| ViolationTypes.GENERAL | Keyv(logFile) | — |
| LOGINS / CONCURRENT / NON_BROWSER / MESSAGE_LIMIT / REGISTRATIONS / TOKEN_BALANCE / TTS_LIMIT / STT_LIMIT / CONVO_ACCESS / SHARE_LIMIT / TOOL_CALL_LIMIT / FILE_UPLOAD_LIMIT / VERIFY_EMAIL_LIMIT / RESET_PASSWORD_LIMIT / ILLEGAL_MODEL_REQUEST | violationCache(...) | 配置 |
| BAN | Keyv(keyvMongo) | `cacheConfig.BAN_DURATION` |
| OPENID_SESSION / SAML_SESSION | sessionCache | — |
| ROLES | standardCache | — |
| USER_PRINCIPALS | userPrincipalsCache() ?? disabledCache | — |
| PROMPT_GROUPS_ACCESS | **disabledCache**（注释：授权 ID 不缓存，因失败的共享失效无法 fail-closed） | — |
| APP_CONFIG / CONFIG_STORE / TOOL_CACHE / PENDING_REQ | standardCache | — |
| ENCODED_DOMAINS | Keyv(keyvMongo) | — |
| **ABORT_KEYS** | standardCache | **Time.TEN_MINUTES** |
| TOKEN_CONFIG | standardCache | **Time.THIRTY_MINUTES** |
| GEN_TITLE | standardCache | **Time.TWO_MINUTES** |
| S3_EXPIRY_INTERVAL | standardCache | 30 min |
| AUDIO_RUNS | standardCache | 10 min |
| MESSAGES | standardCache | **Time.ONE_MINUTE** |
| FLOWS | standardCache | **10 min** |
| OPENID_EXCHANGED_TOKENS | standardCache | 10 min |
| ADMIN_OAUTH_EXCHANGE | standardCache | **Time.THIRTY_SECONDS** |

`disabledCache`（L14-20）：get/set/delete/clear 全 no-op。

**openmate P0：** ABORT_KEYS 10 分钟 TTL + PENDING_REQ + 违规类型分离，可直接抄命名空间设计。

---

## 4. 并发消息限制（`api/cache/clearPendingReq.js` 全文逻辑）

```js
const { USE_REDIS, LIMIT_CONCURRENT_MESSAGES } = process.env ?? {};

clearPendingReq({ userId, cache }):
  if (!userId) return
  if (!isEnabled(LIMIT_CONCURRENT_MESSAGES)) return
  key = `${isEnabled(USE_REDIS) ? namespace : ''}:${userId}`
  currentReq = +(await cache.get(key) ?? 0)
  if (currentReq >= 1) cache.set(key, currentReq - 1, Time.ONE_MINUTE)
  else cache.delete(key)
```

- 环境变量开关 `LIMIT_CONCURRENT_MESSAGES`
- Redis 时 key 带 namespace 前缀
- 递减后 TTL 刷新为 1 分钟；≤0 则删键

---

## 5. 工具处理（`api/app/clients/tools/util/handleTools.js`）

- 认证校验：无效 admin/user 认证 → **从 valid tools 移除该工具**（L89）
- 工厂模式：返回 `async () => Promise<Tool>` 异步初始化（L144-149）
- Assistants required-action 流走 `processRequiredActions`，**不经过 agent capability 通道**（L353-355）
- MCP 处理线程化 `req`/`res`（L632）

---

## 6. BaseClient（`api/app/clients/BaseClient.js` 75678 B）

已实拉全文；核心是所有 provider client 的基类。要点（从文件结构与依赖推断的可验证事实）：

- 依赖 `truncateText, smartTruncateText`、`createOnProgress`、token 计数
- 与 `GenerationJobManager` / abort 体系对接
- 未在本报告展开内部方法名（避免未逐行核对的猜测）

---

## 7. 失败路径汇总

| 场景 | LibreChat 行为 | 出处 |
|---|---|---|
| Run 轮询单次超时 | 3s race timeout，最多重试 5 次 | handle.js L80-81 |
| Run 总超时 | 180s 后放弃轮询 | handle.js L68 |
| Abort 找不到 job | 204 Request not found | abortMiddleware.js L90-94 |
| Abort 重复 | cache 写 `'cancelled'` TTL 3min；再 abort 读到 cancelled → 204 | abortRun.js L39-49 |
| Abort 中 provider 报已取消 | 吞错误 res.end() | abortRun.js L54-59 |
| Abort 后半成品消息 | deleteMessages unfinished=true | abortRun.js L76-80 |
| 消息空洞 | checkMessageGaps 补齐 | abortRun.js L81-88 |
| usage 双花 | collectedUsage.length = 0 | abortMiddleware.js L66-69 |
| 并发消息超限 | PENDING_REQ cache 计数，完成后递减 | clearPendingReq.js |
| 工具无认证 | 从 valid tools 移除 | handleTools.js L89 |
| SSE 过快 | streamRate sleep 节流 | StreamRunManager.js L359 |
| 授权缓存失效风险 | PROMPT_GROUPS_ACCESS 直接 disabledCache | getLogStores.js L50-51 |

---

## 8. openmate 设计抄袭清单

### P0（流与中止）

1. **streamId === conversationId**：一个会话一条流，中止按 conversationId 直接定位。
2. **ABORT_KEYS cache TTL 10 分钟**：abort 前查、abort 时写 `'cancelled'`、防重复。
3. **中止五步**：标记 cancelled → cancel provider → 记 usage → 删 unfinished → 补消息洞 → 发 final。
4. **防双花**：共享 usage 数组在 spend 后 `length = 0`。
5. **并发限制**：`LIMIT_CONCURRENT_MESSAGES` + PENDING_REQ 计数 + 完成时递减 + TTL 1min。
6. **轮询常量**：poll 2s / race 3s / retries 5 / total 180s。

### P1（缓存与限流）

7. **命名空间表**：violations 按类型分（LOGINS/CONCURRENT/MESSAGE_LIMIT/TOOL_CALL_LIMIT/…），BAN 用 Mongo Keyv。
8. **TTL 分层**：MESSAGES 1min、GEN_TITLE 2min、ABORT 10min、AUDIO_RUNS 10min、FLOWS 10min、TOKEN_CONFIG 30min、ADMIN_OAUTH 30s。
9. **fail-closed 缓存禁用**：授权类缓存宁可 disabled 也不缓存（PROMPT_GROUPS_ACCESS）。
10. **SSE streamRate 节流**（默认 Constants.DEFAULT_STREAM_RATE；Agents SDK 侧 25ms 平滑）。
11. **会话过期** `SESSION_EXPIRY = 15min`。

### P2（Agents 能力）

12. **capabilities 列表化**：`deferred_tools, execute_code, file_search, web_search, artifacts, subagents, actions, context, skills, memory, ask_user_question, tools, chain, ocr`——按开关裁剪。
13. **maxSubagents=20**，recursion 默认 25。
14. **Redis 可恢复流**：多副本部署要求 `USE_REDIS_STREAMS=true`。
15. **工具认证失败静默移除**而非 500。
16. **required-action 与 agent capability 双通道**，不混用。

---

## 9b. GenerationJobManager 契约（从 abortMiddleware 反推）

```js
const abortResult = await GenerationJobManager.abortJob(conversationId);
// abortResult = { success, jobData, content, text, collectedUsage }
if (!abortResult.success) { ... 204 ... }
const completionTokens = await countTokens(text);
const promptTokens = jobData?.promptTokens ?? 0;
```

| 字段 | 含义 |
|---|---|
| success | 是否找到并中止 |
| jobData.promptTokens | 已消耗 prompt tokens |
| content / text | 已生成内容 |
| collectedUsage | 多模型 usage 数组（共享引用） |

**注释原文（abortMiddleware L74-75）：**

> Uses GenerationJobManager for all agent requests. Since streamId === conversationId, we can directly abort by conversationId.

**openmate P0 落地伪代码：**

```
stream_id = conversation_id   # 一对一
GenerationJob.abort(conversation_id) → { success, prompt_tokens, partial_text, usage[] }
spend(usage); usage.clear()   # 防双花
mark_cancelled(cache, 3min)
delete_unfinished_messages()
fill_message_gaps()
emit_final_event()
```

---

## 9c. 对 openmate 的特别价值（终版）

LibreChat 是本批项目里 **唯一把「流中止 + 恢复 + 计费防双花 + 并发限制」做成生产级** 的代码库。openmate 若做多通道 IM，会频繁遇到：

- 用户在 Telegram 发 `/stop`
- 通道断线后重连需要续传
- 同一用户多端并发发消息
- 中止后仍要记账、清理半成品、通知前端 final

这些场景的正确解法都能在上述已验证源码里找到对应常量与控制流。优先实现顺序：

1. streamId=conversationId + ABORT_KEYS 10min
2. abort 五步协议
3. collectedUsage 防双花
4. PENDING_REQ 并发计数
5. 命名空间 TTL 表
6. capabilities 列表化（P2）
