# Open WebUI 架构深度分析

> 项目地址：https://github.com/open-webui/open-webui
> Stars: 151,825+ | Forks: 22,204+ | Commits: 18,391+
> 版本：v0.11.3 | 许可证：Open WebUI License（自定义）

Open WebUI 是一个自托管的 AI 平台，定位为"AI 之家"（A Home for AI），支持 Ollama 和 OpenAI 兼容 API，提供功能丰富、用户友好的界面，可完全离线运行。以下从 10 个维度深入分析其架构设计。

---

## 1. 整体架构风格：前后端分离 + 模块化单体

Open WebUI 采用经典的**前后端分离**架构，但打包为单个 Docker 容器部署：

- **前端**：SvelteKit 5 + TypeScript + Tailwind CSS 4，构建后以静态文件嵌入 Python 后端
- **后端**：FastAPI (Python 3.11+)，提供 REST API + WebSocket + Socket.IO
- **部署**：单容器（Docker/K8s），前端静态文件由 FastAPI 的 `StaticFiles` 中间件直接服务

这种"编译时分离、运行时合一"的设计降低了部署复杂度——用户只需 `docker run` 一条命令即可启动完整服务，同时保持了开发时前后端独立迭代的灵活性。

顶层目录结构清晰地反映了这种二分：
```
open-webui/
├── src/           # 前端 SvelteKit 源码
│   ├── lib/       # 组件、API 客户端、stores、工具函数
│   └── routes/    # 页面路由（SvelteKit 文件路由）
├── backend/       # Python 后端
│   └── open_webui/  # 核心业务逻辑
├── Dockerfile
├── pyproject.toml   # Python 依赖管理
└── package.json     # Node.js 依赖管理
```

---

## 2. 后端架构：FastAPI + 分层路由

后端核心位于 `backend/open_webui/`，采用**路由分层**架构：

```
backend/open_webui/
├── main.py          # 应用入口，挂载路由和中间件
├── config.py        # 全局配置（环境变量驱动）
├── constants.py     # 常量定义
├── events.py        # 应用生命周期事件
├── tasks.py         # 定时任务（APScheduler）
├── functions.py     # 工具函数
├── routers/         # API 路由模块（核心业务）
├── models/          # SQLAlchemy ORM 模型
├── internal/        # 内部服务逻辑
├── retrieval/       # RAG 检索引擎
├── socket/          # WebSocket/Socket.IO 处理
├── storage/         # 文件存储抽象层
├── tools/           # 工具执行引擎
├── utils/           # 通用工具函数
└── migrations/      # Alembic 数据库迁移
```

**核心依赖栈**：
- **Web 框架**：FastAPI 0.136 + Uvicorn 0.51
- **ORM**：SQLAlchemy 2.0（异步模式，`asyncio` 扩展）
- **数据库**：SQLite（默认，aiosqlite）或 PostgreSQL（psycopg）
- **迁移**：Alembic
- **会话管理**：starsessions + Redis（可选，用于水平扩展）
- **定时任务**：APScheduler
- **实时通信**：python-socketio

路由层（`routers/`）按业务域拆分，每个路由模块负责一个功能领域（认证、聊天、知识库、模型管理等），通过 FastAPI 的 `APIRouter` 组织，最后在 `main.py` 中统一挂载。

---

## 3. 前端架构：SvelteKit 5 + 响应式 Store

前端使用 **SvelteKit** 框架（Svelte 5.53+），采用文件系统路由：

```
src/
├── lib/
│   ├── apis/        # API 客户端封装（与后端路由一一对应）
│   ├── components/  # Svelte 组件库
│   ├── stores/      # Svelte stores（全局状态管理）
│   ├── i18n/        # 国际化资源
│   ├── utils/       # 前端工具函数
│   ├── types/       # TypeScript 类型定义
│   ├── constants/   # 前端常量
│   └── workers/     # Web Workers（离线计算）
├── routes/
│   ├── (app)/       # 主应用路由组
│   ├── auth/        # 认证页面
│   ├── s/[id]/      # 共享链接页面
│   └── watch/       # 监控页面
└── app.html         # HTML 模板
```

**前端关键依赖**：
- **UI 框架**：Tailwind CSS 4 + bits-ui（无头组件库）
- **富文本编辑器**：TipTap 3（ProseMirror 内核）—— 用于 Notes 和聊天输入
- **终端模拟**：xterm.js 6
- **图表**：Chart.js 4 + Vega/Vega-Lite
- **代码编辑**：CodeMirror 6
- **协同编辑**：Yjs + y-prosemirror（CRDT 实时协作）
- **离线推理**：Pyodide（浏览器内 Python）+ @huggingface/transformers（浏览器内 ML）
- **3D/视觉**：@mediapipe/tasks-vision
- **流程图**：@xyflow/svelte

前端状态管理使用 Svelte 原生的 `stores`（`writable`/`derived`），而非 Redux 等外部库，保持了轻量级和声明式特性。

---

## 4. 数据库与存储层：多数据库 + 多云存储

Open WebUI 在数据持久化上有两个层面：

### 4.1 关系型数据库
- **SQLite**（默认）：单文件部署，零配置，适合个人/小团队
- **PostgreSQL**：生产环境推荐，支持水平扩展
- 通过 SQLAlchemy 2.0 异步引擎统一抽象，Alembic 管理 schema 迁移

### 4.2 向量数据库（RAG）
支持 **9 种**向量数据库后端：
- ChromaDB（默认，嵌入式）
- PGVector（PostgreSQL 扩展）
- Qdrant、Milvus、Elasticsearch、OpenSearch
- Pinecone、S3Vector、Oracle 23ai

这种多后端设计通过 `retrieval/` 模块的抽象层实现，上层业务代码不直接依赖具体向量数据库。

### 4.3 文件存储
`storage/` 模块提供统一的文件存储接口：
- 本地文件系统（默认）
- AWS S3
- Google Cloud Storage
- Azure Blob Storage

---

## 5. LLM 集成架构：Provider-Agnostic 抽象层

Open WebUI 的核心价值在于其 **Provider-Agnostic**（模型无关）设计：

- **Ollama 集成**：直接调用 Ollama HTTP API，管理本地模型生命周期
- **OpenAI 兼容 API**：通过 OpenAI SDK 统一接入 LMStudio、GroqCloud、Mistral、OpenRouter、vLLM 等
- **原生 SDK**：依赖中包含 `openai==2.29`、`anthropic==0.86`、`google-genai==1.66`，直接调用三大厂商 API
- **多模型并行**：支持同时调用多个模型，在同一对话中比较响应

这种设计使用户可以自由混合本地模型（通过 Ollama）和云端 API，无需修改前端代码。

---

## 6. 插件与扩展系统：5 种扩展类型 + MCP 协议

Open WebUI 的扩展能力是其区别于其他 AI 界面的关键特征，支持 **5 种插件类型**：

| 类型 | 用途 | 执行位置 |
|------|------|----------|
| **Filters** | 输入/输出过滤和转换 | 后端 |
| **Actions** | 自定义操作按钮 | 后端 |
| **Pipes** | 自定义模型管道（包装多个模型） | 后端 |
| **Tools** | 函数调用工具 | 后端 |
| **Skills** | 复合技能（工具+指令组合） | 后端 |

此外，通过 **MCP（Model Context Protocol）** 协议支持外部工具服务器：
- 原生 MCP 客户端集成
- MCPO（MCP over OpenAPI）桥接
- OpenAPI 工具服务器

插件系统使用 Python 的 `RestrictedPython` 进行沙箱执行，防止恶意代码逃逸。

---

## 7. RAG 知识库架构：多引擎 + 混合检索

知识库系统位于 `retrieval/` 模块，实现了完整的 RAG 管道：

### 文档摄入
- **多格式支持**：PDF（pypdf）、Word（python-docx）、PPT（python-pptx）、Excel（openpyxl）、Markdown、HTML
- **OCR 引擎**：支持 Tika、Docling、Azure Document Intelligence、Mistral OCR、PaddleOCR-vl
- **文本分割**：langchain-text-splitters

### 检索策略
- **向量检索**：Embedding 模型（sentence-transformers）+ 向量数据库
- **BM25 关键词检索**：rank-bm25 库实现
- **混合搜索**：向量 + BM25 融合，支持 reranking
- **全上下文模式**：将完整文档注入上下文（适用于小文档）

### Web 搜索集成
支持 20+ 搜索引擎作为 RAG 外部数据源，包括 SearXNG、Google、Brave、Bing、DuckDuckGo、Tavily、Perplexity 等。

---

## 8. 认证与权限：企业级 RBAC

认证系统设计为生产就绪：

### 认证方式
- **本地账号**：bcrypt/argon2 密码哈希
- **OAuth/OIDC**：通过 authlib 支持任意 OAuth 提供商
- **LDAP/Active Directory**：ldap3 库集成
- **可信头（Trusted Headers）**：反向代理 SSO
- **SCIM 2.0**：自动用户配置（Okta、Azure AD、Google Workspace）

### 权限模型
- **RBAC**：管理员、普通用户等角色
- **用户组**：按组分配模型/知识库/功能访问权限
- **细粒度控制**：每个模型、知识库、工具都可以设置访问白名单

### 会话管理
- JWT 令牌（PyJWT + joserfc）
- Redis 会话存储（starsessions[redis]），支持多实例共享

---

## 9. 实时通信与协作

Open WebUI 在实时交互上有多个层次：

### WebSocket / Socket.IO
- `python-socketio` 服务端 + `socket.io-client` 客户端
- 用于聊天流式响应、实时状态更新
- Redis adapter 支持多节点广播

### 协同编辑
- **Yjs**（CRDT）+ **y-prosemirror**：Notes 功能的实时协同编辑
- 多用户可以同时编辑同一文档，自动冲突解决

### Channels（频道）
- 实时共享空间，团队和 AI 模型在同一时间线协作
- 支持线程、反应、置顶、访问控制

### 语音/视频
- 集成 Speech-to-Text（Whisper、OpenAI、Deepgram、Azure）
- Text-to-Speech（Azure、ElevenLabs、OpenAI、WebAPI）
- 支持免提语音/视频通话

---

## 10. 部署与运维：云原生 + 可观测性

### 部署方式
- **Docker**：单命令部署，提供 `:main`、`:cuda`、`:ollama` 标签
- **Kubernetes**：支持 kubectl、kustomize、helm chart
- **pip/uv**：`pip install open-webui`，作为 Python 包直接安装
- **桌面应用**：独立的 `open-webui/desktop` 项目（macOS/Windows/Linux）

### 水平扩展
- Redis 会话管理：多实例共享状态
- Socket.IO Redis adapter：WebSocket 消息广播
- 支持负载均衡器后的多 Worker/多节点部署

### 可观测性
- **OpenTelemetry**：内置 traces、metrics、logs 支持
- **使用分析**：管理员仪表盘追踪消息量、token 消耗、成本
- **模型评估**：内置 Arena、A/B 测试、ELO 排行榜

### 安全
- `.webui_secret_key` 密钥管理
- CORS 中间件配置
- 速率限制（通过插件实现）
- 负责任的安全披露流程

---

## 架构总结

Open WebUI 的架构设计体现了以下核心原则：

1. **极简部署**：单容器打包前后端，一条命令启动，降低自托管门槛
2. **Provider-Agnostic**：通过抽象层支持任意 LLM 提供商，避免厂商锁定
3. **渐进式复杂度**：SQLite → PostgreSQL，本地存储 → S3，单机 → K8s 集群
4. **插件驱动扩展**：5 种插件类型 + MCP 协议，覆盖过滤、工具、管道等场景
5. **企业就绪**：RBAC、LDAP/SSO、SCIM、审计、OpenTelemetry 一应俱全
6. **实时协作**：Yjs CRDT + Socket.IO + Channels，支持团队级 AI 协作

作为 GitHub 上 Star 数最高的 AI 界面项目（151K+），Open WebUI 证明了"自托管 AI 平台"的可行性，其架构为 OpenMate 等类似项目提供了极具价值的参考。
