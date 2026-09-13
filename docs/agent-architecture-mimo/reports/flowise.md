# Flowise 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/FlowiseAI/Flowise  
> 抓取通道: cdn.jsdelivr.net/gh/FlowiseAI/Flowise@main  
> 版本快照: main @ 2026-09-13（package.json v3.1.4；README 归档声明）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供可视化 Agent 构建、mono-repo 模块划分、执行安全边界、部署矩阵与归档教训借鉴

---

## 0. 诚实性说明

- **已打开实读**：
  - `package.json`（workspaces、engines、pnpm overrides、scripts）
  - `docker/.env.example`（全量环境变量矩阵）
  - `packages/server/src/index.ts`（App 类、端口绑定、webhook registry）
  - `packages/components/nodes/agentflow/utils.ts`（多模态消息、artifact、存储）
  - `packages/components/nodes/agentflow/*` 目录清单（Agent/LLM/Tool/Condition/HTTP 等）
- README 顶部：**Flowise has been archived**；Future of Flowise 见 discussions/6727。
- 本报告基于源码实读 + 归档 README；不发明行号。

---

## 1. 系统架构

### 1.1 Mono-repo 模块（package.json 实读）

```json
"version": "3.1.4",
"workspaces": ["packages/*", "flowise", "ui", "components", "api-documentation"],
"engines": { "node": "^24", "pnpm": "^10.26.0" }
```

| 包 | 职责 |
|----|------|
| `packages/server` | Express 后端 API、鉴权、队列、webhook |
| `packages/ui` | React + Vite 前端画布 |
| `packages/components` | 节点库：agents / agentflow / chatmodels / chains / documentloaders / tools / credentials |
| `packages/api-documentation` | swagger-ui 自动生成（`swagger.yml` 约 97KB） |
| `packages/worker` | BullMQ worker（`MODE=queue` 时） |

**已知构建坑（README + scripts）**：`pnpm build` 可能 exit 134（JS heap OOM）→ `NODE_OPTIONS=--max-old-space-size=4096`。  
`build:docker` 使用 `turbo run build --filter=!@flowiseai/agentflow --filter=!@flowiseai/observe`，说明 agentflow 包在 Docker 构建中被刻意排除。

### 1.2 进程模型与端口

`packages/server/src/index.ts` 实读：

```ts
export class App { ... }
const port = parseInt(process.env.PORT || '', 10) || 3000
server.listen(port, host, () => {
  logger.info(`⚡️ [server]: Flowise Server is listening at ${host ? 'http://' + host : ''}:${port}`)
})
```

- 默认 `:3000`。
- Webhook listener registry 在启动时初始化：`initWebhookListenerRegistry`。
- Worker 模式：`MODE=queue` + Redis（BullMQ）。

### 1.3 部署矩阵（README + docker/）

```
cd docker && cp .env.example .env && docker compose up -d
# 或
docker run -d --name flowise -p 3000:3000 flowise
```

云模板：AWS / Azure / Digital Ocean / GCP / Alibaba Cloud / Railway / Northflank / Render / HuggingFace Spaces / Elestio / Sealos / RepoCloud + Flowise Cloud。

---

## 2. 环境变量矩阵（docker/.env.example 实读，全量摘录关键项）

### 2.1 数据库

```
PORT=3000
# DATABASE_PATH=/your_database_path/.flowise
# DATABASE_TYPE=postgres
# DATABASE_PORT=5432
# DATABASE_HOST=""
# DATABASE_NAME=flowise
# DATABASE_USER=root
# DATABASE_PASSWORD=mypassword
# DATABASE_SSL=true
# DATABASE_REJECT_UNAUTHORIZED=true
```

### 2.2 Secret / 加密

```
# SECRETKEY_STORAGE_TYPE=local #(local | aws)
# FLOWISE_SECRETKEY_OVERWRITE=myencryptionkey
# SECRETKEY_AWS_ACCESS_KEY / SECRETKEY_AWS_SECRET_KEY / SECRETKEY_AWS_REGION / SECRETKEY_AWS_NAME=FlowiseEncryptionKey
# JWT_TOKEN_EXPIRY_IN_MINUTES=360
# JWT_REFRESH_TOKEN_EXPIRY_IN_MINUTES=43200
# JWT_ISSUER=Flowise
# JWT_AUDIENCE=Flowise
# PASSWORD_SALT_HASH_ROUNDS=10
# INVITE_TOKEN_EXPIRY_IN_HOURS=24
# PASSWORD_RESET_TOKEN_EXPIRY_IN_MINS=15
```

### 2.3 日志与安全净化

```
# LOG_LEVEL=info #(error | warn | info | verbose | debug)
# LOG_SANITIZE_BODY_FIELDS=password,pwd,pass,secret,token,apikey,api_key,accesstoken,access_token,refreshtoken,refresh_token,clientsecret,client_secret,privatekey,private_key,secretkey,secret_key,auth,authorization,credential,credentials
# LOG_SANITIZE_HEADER_FIELDS=authorization,x-api-key,x-auth-token,cookie
```

### 2.4 代码执行沙箱边界（.env.example 明确警告）

```
# TOOL_FUNCTION_BUILTIN_DEP=crypto,fs
# WARNING: never add puppeteer or playwright here (or to ALLOW_BUILTIN_DEP) - their launch() APIs pass
# caller-controlled executablePath/args straight into child_process.spawn, giving sandboxed JS full OS
# command execution, and their file:// page navigation allows arbitrary host file read.
# TOOL_FUNCTION_EXTERNAL_DEP=moment,lodash,pg,mysql2,mongodb,ioredis,redis,typeorm,@zilliz/milvus2-sdk-node
# ALLOW_BUILTIN_DEP=false
```

### 2.5 存储

```
# STORAGE_TYPE=local (local | s3 | gcs | azure)
# BLOB_STORAGE_PATH=/your_storage_path/.flowise/storage
# S3_STORAGE_BUCKET_NAME / S3_ENDPOINT_URL / S3_FORCE_PATH_STYLE=false
# Azure: AZURE_BLOB_STORAGE_CONNECTION_STRING 或 ACCOUNT_NAME+KEY
```

### 2.6 队列（BullMQ）

```
# MODE=queue #(queue | main)
# QUEUE_NAME=flowise-queue
# QUEUE_REDIS_EVENT_STREAM_MAX_LEN=100000
# WORKER_CONCURRENCY=100000
# REMOVE_ON_AGE=86400
# REMOVE_ON_COUNT=10000
# REDIS_URL / REDIS_HOST=localhost / REDIS_PORT=6379
# ENABLE_BULLMQ_DASHBOARD=
```

### 2.7 安全 / Custom MCP

```
# HTTP_DENY_LIST=
# HTTP_SECURITY_CHECK=true
# PATH_TRAVERSAL_SAFETY=true
# CUSTOM_MCP_SECURITY_CHECK=true
# CUSTOM_MCP_PROTOCOL=sse #(stdio | sse) 'stdio' can run arbitrary commands on your server
# CUSTOM_MCP_ALLOWED_ENV_VARS= # empty = none allowed
# CUSTOM_MCP_ALLOWED_COMMANDS= # empty = none allowed. Set only: node|npx|python|python3|docker
# CUSTOM_MCP_TOOL_DESCRIPTION_MAX_LENGTH=1024
# CUSTOM_MCP_TOOL_NAME_MAX_LENGTH=128
# CUSTOM_MCP_ALLOWED_ABSOLUTE_SCRIPT_PATHS= #WARNING: Only add scripts YOU control
# TRUST_PROXY=true
# OAUTH2_SECURITY_CHECK=true
# OAUTH2_ALLOWED_TOKEN_DOMAINS=
# FLOWISE_FILE_SIZE_LIMIT=50mb
# CUSTOM_MCP_TOOLS_MAX_BYTES=524288
# CUSTOM_MCP_AUTHORIZE_TIMEOUT_MS=15000
# DISABLED_NODES=bufferMemory,chatOpenAI
# MIN_SCHEDULE_INTERVAL_SECONDS=60
```

### 2.8 Metrics

```
# ENABLE_METRICS=false
# METRICS_PROVIDER=prometheus # prometheus | open_telemetry
# METRICS_INCLUDE_NODE_METRICS=true
# METRICS_SERVICE_NAME=FlowiseAI
# METRICS_OPEN_TELEMETRY_METRIC_ENDPOINT=http://localhost:4318/v1/metrics
```

仓库内含 `metrics/otel/`、`metrics/prometheus/`、`metrics/grafana/`（app + server dashboard）。

---

## 3. Agentflow 节点系统（packages/components/nodes/agentflow/）

### 3.1 节点清单（jsDelivr flat listing 实读）

| 节点 | 大小 | 职责 |
|------|------|------|
| `Agent/Agent.ts` | 72598 | Agent 循环主节点 |
| `LLM/LLM.ts` | 40996 | LLM 调用节点 |
| `utils.ts` | 17660 | 多模态/artifact/存储共享工具 |
| `ConditionAgent/ConditionAgent.ts` | 24390 | 条件路由 Agent |
| `Condition/Condition.ts` | 13812 | 条件分支 |
| `HTTP/HTTP.ts` | 12947 | HTTP 调用节点 |
| `Tool/Tool.ts` | 11420 | 工具节点 |
| `ExecuteFlow/ExecuteFlow.ts` | 11175 | 子流程调用 |
| `HumanInput/HumanInput.ts` | 10407 | 人工输入/审批 |
| `Retriever/Retriever.ts` | 8240 | 检索节点 |
| `Start/Start.ts` | 7303 | 入口 |
| `CustomFunction/CustomFunction.ts` | 8528 | 自定义函数 |
| `Iteration/Iteration.ts` | 2104 | 迭代 |
| `Loop/Loop.ts` | 2937 | 循环 |
| `DirectReply/DirectReply.ts` | 1993 | 直接回复 |
| `StickyNote/StickyNote.ts` | 1038 | 画布注释 |
| `prompt.ts` | 4673 | Agentflow 提示词 |

### 3.2 utils.ts 关键常量与失败路径

```ts
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

const MIME_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  json: 'application/json', html: 'text/html', xml: 'application/xml'
}

const ARTIFACT_TYPES: Record<string, string> = {
  png: 'png', jpg: 'jpeg', jpeg: 'jpeg',
  html: 'html', htm: 'html', md: 'markdown', markdown: 'markdown',
  json: 'json', js: 'javascript', javascript: 'javascript',
  tex: 'latex', latex: 'latex', txt: 'text', csv: 'text', pdf: 'text'
}
```

**核心设计：轻量引用 vs base64 双版本**

1. `processMessagesWithImages`：把 `stored-file` 图片引用转成 base64 `image_url` 供 LLM 调用；原消息备份到 `transformedMessages`。
2. `revertBase64ImagesToFileRefs`：调用后把 base64 还原为 `stored-file` 引用，避免历史持久化膨胀。
3. `_imageFileRefs` 存在 `additional_kwargs`（不发送给 LLM API）。
4. `_isTemporaryImageMessage: true`：注入的历史图片临时消息，模型调用后剥离。

**失败路径**：

- `storedFileToBase64` 失败：`console.error('Failed to load image ...')`，跳过该图，不中断整体。
- `getPastChatHistoryImageMessages` 异常：fallback 为纯文本 + 可用 kwargs。
- `downloadContainerFile`（OpenAI container citation）：无 API key 返回 null；HTTP 非 2xx 返回 null。
- `saveBase64Image` / `saveGeminiInlineImage`：失败返回 null。

**normalizeMessagesForStorage**：把 LangChain `{lc, type, kwargs}` 归一为 `{role, content, name, tool_call_id, tool_calls, additional_kwargs, usage_metadata, id}`，避免 DB 膨胀。

---

## 4. Agent 循环与工具系统

### 4.1 节点即插件

- 每个节点实现 `INode`：`label`, `name`, `type`, `icon`, `category`, `baseClasses`, `inputs`, `outputs`, `init()`, `run()`, `clearSession()`.
- `components` 包通过 `nodes/` 目录自动发现；credentials 在 `credentials/*.credential.ts`。
- 社区节点：`SHOW_COMMUNITY_NODES=true`；可用 `DISABLED_NODES` 按名禁用。

### 4.2 执行模型

- Chatflow 序列化为节点图，server 端按依赖拓扑执行。
- Agentflow 是后加的「可视化 Agent 工作流」层（Agent / LLM / Tool / Condition / HumanInput / Loop）。
- 会话：server 侧存储；无一等 checkpoint/恢复 API（对比 OpenClaw 的 SQLite writer-claim）。

### 4.3 安全边界（归档前的最新加固）

- `ALLOW_BUILTIN_DEP=false` 默认拒绝任意 builtin。
- Custom MCP `stdio` 明确标注可执行任意命令，需 operator 显式开启 + allowlist。
- `PATH_TRAVERSAL_SAFETY=true`、`HTTP_SECURITY_CHECK=true` 默认开启。
- 文件上传上限 `FLOWISE_FILE_SIZE_LIMIT=50mb`。

---

## 5. 稳定性 / 教训

| 主题 | 做法/教训 |
|------|-----------|
| 模块化 | server / ui / components / worker 清晰拆分；turbo monorepo |
| 构建 | OOM 需调 heap；Docker 构建排除 agentflow/observe |
| 安全 | .env.example 把「puppeteer/playwright 禁止入 sandbox」写成大写 WARNING |
| 队列 | BullMQ + Redis；`WORKER_CONCURRENCY=100000` 过于激进，生产应下调 |
| 可观测 | Prometheus / OTel + Grafana 双 dashboard |
| **归档** | 可视化 Agent 赛道竞争激烈；主线停更 |

**归档风险**：

- 无持续安全更新承诺。
- 生态插件可能随归档停滞。
- 依赖 `@langchain/core@1.1.20`、`openai@6.19.0` 等 pinned resolution，未来 CVE 修复需 fork。

---

## 6. 对 openmate 的借鉴

### 6.1 直接可抄（P0）

1. **轻量文件引用 + 按需 base64 双版本**（`_imageFileRefs` / `revertBase64ImagesToFileRefs`）：会话存储不膨胀。
2. **normalizeMessagesForStorage**：剥离 LangChain 序列化壳。
3. **LOG_SANITIZE_BODY_FIELDS / HEADER_FIELDS**：默认净化敏感字段。
4. **Custom MCP 双协议 + allowlist**（stdio 危险 / sse 相对安全）。
5. **components 插件边界**：第三方集成独立演进。

### 6.2 应避免的坑

- **不要押注已归档上游**为长期基座。
- `WORKER_CONCURRENCY=100000` 是 demo 值，不是生产值。
- `pnpm build` OOM：monorepo 前端构建重，CI 要预设 heap。
- Node ^24 + pnpm ^10 约束：运行时矩阵要文档化。

### 6.3 重构优先级

- **P0**：多模态消息双版本（stored-file ↔ base64）
- **P0**：敏感字段日志净化默认集
- **P0**：工具沙箱 allowlist（builtin/external/command 三层）
- **P1**：可视化层与核心 loop 解耦（可弃）
- **P1**：队列模式与 worker 分离
- **P2**：完整可视化编排（可选）
- **P2**：OTel + Grafana 双 dashboard

---

## 7. 源码锚点速查

```
package.json
  version 3.1.4
  workspaces: packages/*, flowise, ui, components, api-documentation
  engines: node ^24, pnpm ^10.26.0
  turbo 1.10.16
  resolutions: @langchain/core 1.1.20, openai 6.19.0, axios 1.15.0

packages/server/src/index.ts
  class App
  PORT default 3000
  initWebhookListenerRegistry

docker/.env.example
  JWT_TOKEN_EXPIRY_IN_MINUTES=360
  JWT_REFRESH_TOKEN_EXPIRY_IN_MINUTES=43200
  PASSWORD_SALT_HASH_ROUNDS=10
  FLOWISE_FILE_SIZE_LIMIT=50mb
  CUSTOM_MCP_TOOLS_MAX_BYTES=524288
  CUSTOM_MCP_AUTHORIZE_TIMEOUT_MS=15000
  CUSTOM_MCP_TOOL_DESCRIPTION_MAX_LENGTH=1024
  CUSTOM_MCP_TOOL_NAME_MAX_LENGTH=128
  MIN_SCHEDULE_INTERVAL_SECONDS=60
  QUEUE_REDIS_EVENT_STREAM_MAX_LEN=100000
  REMOVE_ON_AGE=86400
  REMOVE_ON_COUNT=10000
  ALLOW_BUILTIN_DEP=false
  WARNING: never add puppeteer or playwright to TOOL_FUNCTION_BUILTIN_DEP

packages/components/nodes/agentflow/utils.ts
  IMAGE_EXTENSIONS = ['png','jpg','jpeg','gif','webp']
  _imageFileRefs / _isTemporaryImageMessage
  processMessagesWithImages / revertBase64ImagesToFileRefs
  normalizeMessagesForStorage
  downloadContainerFile → api.openai.com/v1/containers/{id}/files/{id}/content

packages/components/nodes/agentflow/
  Agent.ts 72KB, LLM.ts 41KB, utils.ts 18KB
  HumanInput, ConditionAgent, HTTP, Tool, ExecuteFlow, Loop, Iteration

License: Apache-2.0
归档: discussions/6727
```

**本轮未打开**：图执行引擎内部、chatflow 反序列化、鉴权 JWT 实现、Agent.ts 全文（72KB）。

---

## 8. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 3 | 可视化节点；Agentflow 强化 |
| 权限/安全边界 | 3 | MCP allowlist + 沙箱 WARNING 明确；归档后风险升 |
| 容错与会话恢复 | 2 | 非主线 |
| 上下文工程 | 4 | stored-file ↔ base64 双版本是亮点 |
| 可扩展（技能/MCP） | 4 | components + Custom MCP |
| 可观测与可评测 | 3 | Prometheus/OTel + Grafana |
| 生产可用成熟度 | 2 | **已归档** |

**综合**：**可视化 Agent 构建的历史标杆**。openmate 抄多模态双版本、日志净化、MCP allowlist 与部署摩擦设计；不抄归档栈为基座。

---

## 9. 关键链接

- 仓库：https://github.com/FlowiseAI/Flowise  
- 归档说明：discussions/6727  
- 相关报告：`reports/langflow.md`、`reports/dify.md`、`reports/fastgpt-l1.md`
