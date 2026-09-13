# AnythingLLM 深度架构报告（openmate 参考级）

> 供 openmate 参考：工作区隔离、向量库抽象、Agent 工具链上限
> 调研日期：2026-09-13
> 资料来源：jsDelivr 实拉 `Mintplex-Labs/anything-llm@master`
> 列表：1090 files

---

## 0. 验证状态

**实拉成功：**

| 路径 | 字节 |
|---|---|
| `server/index.js` | 6330 |
| `server/utils/agents/aibitat/index.js` | 50627 |
| `server/models/workspace.js` | 25690 |
| `server/models/workspaceChats.js` | 10555 |
| `server/models/systemSettings.js` | 44857 |
| `server/utils/helpers/index.js` | 29515 |
| `server/endpoints/chat.js` | 6694 |
| `server/utils/vectorDbProviders/lance/index.js` | 16587 |
| `server/utils/EmbeddingEngines/native/index.js` | 11397 |
| `server/utils/chats/index.js` | 5554 |
| `collector/index.js` | 6048 |
| `docker/docker-compose.yml` | 690 |

**未逐行核对但列表 API 确认存在：** prisma schema、frontend、大量 AiProviders。

---

## 1. 服务入口（`server/index.js` 全文要点）

```js
const FILE_LIMIT = "3GB";
app.use(bodyParser.text({ limit: FILE_LIMIT }));
app.use(bodyParser.json({ limit: FILE_LIMIT }));
app.use(bodyParser.urlencoded({ limit: FILE_LIMIT, extended: true }));
```

| 常量 | 值 |
|---|---|
| FILE_LIMIT | `"3GB"` |
| 默认端口 | `process.env.SERVER_PORT \|\| 3001` |
| HTTPS | `ENABLE_HTTPS` → bootSSL；否则 express-ws |
| 静态头 | `X-Frame-Options: DENY`，移除 `X-Powered-By` |
| robots.txt | `Disallow: /` |

挂载的 endpoint 模块（L82-109）：

system, extension, workspace, workspaceThread, chat, admin, modelRouter, invite, embedManagement, util, document, **agentWebsocket**, agentSkillWhitelist, agentFileServer, experimental, developer, communityHub, **agentFlow**, **mcpServers**, mobile, webPush, telegram, scheduledJobs, outlookAgent, googleAgentSkill, **memory**, embedded, browserExtension。

启动副作用：`patchSdkTimeouts()` + `modelPricing` 缓存刷新（L6-7）。

HTTP logger 仅 dev 且 `ENABLE_HTTP_LOGGER=true`。

---

## 2. AIbitat Agent 引擎（`server/utils/agents/aibitat/index.js`）

### 2.1 核心状态

```js
class AIbitat {
  emitter = new EventEmitter();
  skipHandleExecution = false;   // flow 直接回结果，跳过工具链
  _aborted = false;              // 循环边界检查
  abortController = new AbortController();  // 绑定所有 provider 请求
  maxRounds;
  _pendingCitations = [];
  _toolAttachments = [];         // 工具产出的图片
  _pendingClarifyingQuestionSurveys = [];
}
```

### 2.2 工具链上限（源码原文）

```js
static defaultMaxToolCalls() {
  const envMaxToolCalls = parseInt(process.env.AGENT_MAX_TOOL_CALLS, 10);
  return !isNaN(envMaxToolCalls) && envMaxToolCalls > 0 ? envMaxToolCalls : 10;
}
```

| 常量 | 默认 | 来源 |
|---|---|---|
| maxToolCalls | **10**（`AGENT_MAX_TOOL_CALLS` 可覆盖） | aibitat.js L87-91 |
| maxRounds | **100** | aibitat.js L99 注释 |
| interrupt | `"NEVER"` | L98 注释 |

### 2.3 中止语义

- `_aborted`：**循环边界检查**，abort 后不再发起 LLM 调用或新 turn
- `abortController.signal` 绑定到 `getProviderForConfig` 发出的每个 provider → **撕掉 in-flight LLM 请求**
- 触发源：用户 stop、socket 关闭、bail 命令

### 2.4 工具附件 / 引用缓冲

- `_pendingCitations`：工具执行期收集，响应 finalize 时刷给前端
- `_toolAttachments`：工具 `addToolAttachment()` 排队图片，以 user message 注入
- `_pendingClarifyingQuestionSurveys`：ask-user 调查结果，由 chat-history 插件 drain 进 `workspace_chats.response`

### 2.5 skipHandleExecution

flow 执行可直接返回结果到聊天，**阻止进一步 tool-call 链**。

---

## 3. Workspace 模型（`server/models/workspace.js`）

```js
VALID_CHAT_MODES: ["chat", "query", "automatic"]
```

默认新建：

```js
chatMode: "automatic",
// 其他字段可 additionalFields
```

校验规则：

- `chatMode` 必须在 `VALID_CHAT_MODES` 内
- 更新时若 `chatProvider === "default"` → 同时清空 `chatModel`（防混淆）
- 切到 anythingllm-router 时 chatModel 不使用

### 3.1 向量库抽象（`server/utils/helpers/index.js`）

```js
const vectorSelection = getExactly ?? process.env.VECTOR_DB ?? "lancedb";
```

支持：Pinecone, Chroma, ChromaCloud, **LanceDb（默认）**, Weaviate, QDrant, Milvus, Zilliz, AstraDB, PGVector。

LLM 默认：`process.env.LLM_PROVIDER ?? "openai"`。

`promptWindowLimit` / `compressMessages` 是 provider 接口的一部分（helpers 注释 L40-48）。

---

## 4. Docker（`docker/docker-compose.yml` 全文）

```yaml
services:
  anything-llm:
    container_name: anythingllm
    cap_add: [SYS_ADMIN]
    volumes:
      - "./.env:/app/server/.env"
      - "../server/storage:/app/server/storage"
      - "../collector/hotdir/:/app/collector/hotdir"
      - "../collector/outputs/:/app/collector/outputs"
    user: "${UID:-1000}:${GID:-1000}"
    ports: ["3001:3001"]
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

- 单容器架构（server + collector 同镜像）
- `SYS_ADMIN` 能力（浏览器/沙箱类工具需要）
- 持久卷：storage + collector hotdir/outputs

---

## 5. Collector 管道（列表 + `collector/index.js`）

独立 Node 服务处理文档：

- `processSingleFile/convert/`: asPDF, asDocx, asEPub, asXlsx, asAudio, asImage, asMbox, asOfficeMime, asTxt
- `processLink/`: 网页抓取
- extensions: Confluence, DrupalWiki, ObsidianVault, PaperlessNgx, RepoLoader(GitHub/GitLab), WebsiteDepth, YoutubeTranscript
- WhisperProviders: ffmpeg / localWhisper / OpenAiWhisper
- OCRLoader

---

## 6. 失败路径汇总

| 场景 | 行为 | 出处 |
|---|---|---|
| 用户中止 | `_aborted` 循环边界 + AbortController 撕 in-flight 请求 | aibitat.js L36-48 |
| 工具链过长 | maxToolCalls 默认 10 截断 | aibitat.js L87-91 |
| flow 要直返结果 | skipHandleExecution=true 阻止后续工具 | aibitat.js L19-29 |
| chatProvider 被清空 | update 时连带清 chatModel | workspace.js L254-259 |
| 无效 chatMode | 校验拒绝 | workspace.js L96-97 |
| 无 HTTPS | express-ws 加载 | server/index.js L75-79 |
| 生产静态资源 | X-Frame-Options DENY | server/index.js L123 |
| 向量库未设 | 默认 lancedb | helpers.js L88 |
| HTTP logger | 仅 dev + 显式 env | server/index.js L55-63 |

---

## 7. openmate 设计抄袭清单

### P0

1. **`AGENT_MAX_TOOL_CALLS=10`** 默认工具链上限（可 env 覆盖）。
2. **AbortController 会话级绑定**：abort 撕掉所有 in-flight LLM 请求，而不仅是设标志位。
3. **`_aborted` 在循环边界检查**，不依赖 provider 回调。
4. **Body limit 3GB**（个人助手可降到 50-100MB，但要有显式上限）。
5. **Workspace VALID_CHAT_MODES = chat/query/automatic** 三模式。
6. **VECTOR_DB 默认 lancedb**，统一 `getVectorDbClass()` 工厂。

### P1

7. **工具缓冲区**：citations / attachments / clarifying surveys 分别缓冲，finalize 时统一 drain。
8. **skipHandleExecution**：flow 类任务可旁路工具链。
9. **maxRounds=100** 会话轮次上限。
10. **Provider 切换时联动清空 model 字段**。
11. **Collector 独立进程** + hotdir/outputs 卷。
12. **agentWebsocket + mcpServers + memory 独立 endpoint 模块**。

### P2

13. Agent Flows（可视化流程）+ executor。
14. 多向量库热切换。
15. SYS_ADMIN 容器能力给浏览器工具。
16. browser extension / telegram / webPush 旁路通道。
17. modelPricing 缓存启动刷新。

---

## 8. AIbitat 构造参数全文（aibitat.js L97-126）

```js
constructor({
  chats = [],
  interrupt = "NEVER",
  maxRounds = 100,
  maxToolCalls = AIbitat.defaultMaxToolCalls(),  // 默认 10
  provider = "openai",
  handlerProps = {},
}) {
  this.defaultInterrupt = interrupt;
  this.maxRounds = maxRounds;
  this.maxToolCalls = maxToolCalls;
  this.handlerProps = handlerProps;
  this.defaultProvider = { provider, ... };
  this.provider = this.defaultProvider.provider;
  this.model = this.defaultProvider.model;
}
```

| 参数 | 默认 | 说明 |
|---|---|---|
| interrupt | `"NEVER"` | 中断模式 |
| maxRounds | `100` | 最大轮次 |
| maxToolCalls | `10` | 单响应工具链上限 |
| provider | `"openai"` | 默认 provider tag |
| handlerProps | `{}` | 继承给 aibitat 的额外 props |

provider setter 强制 string tag（L144-152）；错误信息：`Use aibitat.providerInstance to get/store the provider instance.`

Abort 注释（L44-46）：

> Session-wide AbortController. Its signal is bound to every provider handed out by `getProviderForConfig` so an abort tears down in-flight LLM requests.

Providers 可在会话级注册 abort listener（L128 注释）。

---

## 9. Collector 管道（`collector/index.js` 全文 6048 B）

### 9.1 常量与端口

```js
const FILE_LIMIT = "3GB";           // 与 server 相同
const COLLECTOR_PORT = getCollectorPort();
```

启动时 `wipeCollectorStorage()` 清临时存储。

### 9.2 路由表

| 路由 | 中间件 | 作用 |
|---|---|---|
| `POST /process` | verifyPayloadIntegrity | processSingleFile |
| `POST /parse` | verifyPayloadIntegrity | parseOnly=true |
| `POST /process-link` | verifyPayloadIntegrity | processLink 抓网页 |
| `POST /util/get-link` | verifyPayloadIntegrity | getLinkText |
| `POST /util/convert-audio-to-wav` | verifyPayloadIntegrity | 音频转 wav |
| `POST /process-raw-text` | verifyPayloadIntegrity | 纯文本入库 |
| `GET /accepts` | — | 返回 ACCEPTED_MIMES |
| `extensions(app)` | — | Confluence/GitHub/Obsidian 等 |

### 9.3 路径穿越防护

```js
const targetFilename = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, "");
```

**openmate P0：** 任何用户可控文件名必须 `path.normalize` + 剥离前导 `..`。

### 9.4 失败返回统一

处理异常时 **HTTP 仍 200**，body 为 `{ success: false, reason: "A processing error occurred.", documents: [] }`——客户端靠 success 字段而非状态码。

### 9.5 进程错误重启

```js
.on("error", function (_) {
  process.once("SIGUSR2", () => process.kill(process.pid, "SIGUSR2"));
  process.on("SIGINT", () => process.kill(process.pid, "SIGINT"));
});
```

---

## 10. Native Embedder（`server/utils/EmbeddingEngines/native/index.js`）

```js
class NativeEmbedder {
  static defaultModel = "Xenova/all-MiniLM-L6-v2";
  #fallbackHost = "https://cdn.anythingllm.com/support/models/";
```

| 项 | 值 |
|---|---|
| 默认模型 | `Xenova/all-MiniLM-L6-v2` |
| 模型缓存目录 | `STORAGE_DIR/models` 或 `server/storage/models` |
| 并发 | `maxConcurrentChunks`（来自 modelInfo） |
| 分块长度 | `embeddingMaxChunkLength` |
| 单例约束 | 同模型 **只创建一个 pipeline**（注释：no-op 重复创建） |
| 离线兜底 | Mintplex CDN 托管模型，防 HF 下载失败 |

---

## 11. workspaceChats 模型（`server/models/workspaceChats.js`）

| 方法 | 作用 |
|---|---|
| `new({ response })` | `safeJSONStringify(response)` 落库；失败返回 `{ chat: null, message }` |
| `forWorkspaceByUser` | 默认 thread（thread_id: null） |
| `forWorkspaceByApiSessionId` | 按 API session 查 |
| `forWorkspace` | 工作区默认 thread |
| `markHistoryInvalid(workspaceId, user)` | 标记历史无效 |
| `markThreadHistoryInvalid` | 线程级失效 |

所有方法 catch 后 `console.error` 并返回结构化错误，不抛。

---

## 12. 与 openmate 的差异

- AnythingLLM 是 **多租户 RAG 工作区产品**，不是个人 IM 助手。openmate 应抄其 workspace 隔离与工具上限，不要抄其 admin/invite/embed 管理面。
- AIbitat 比 nanobot AgentLoop 更重（多 agent 图），个人助手可只用其单 agent 路径 + abort 语义。
- Collector 与 server 同镜像但分端口；openmate 可合并为单进程内的模块，保留接口边界。
