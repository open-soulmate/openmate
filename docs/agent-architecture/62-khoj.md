# Khoj 架构深度分析

> **项目**: [khoj-ai/khoj](https://github.com/khoj-ai/khoj) — 37,292 Stars | AGPL-3.0
> **定位**: Your AI Second Brain — 自托管的个人AI助手，支持本地/云端LLM、文档问答、自动化研究
> **技术栈**: Python 3.10-3.12 / FastAPI + Django ORM / PostgreSQL + pgvector / sentence-transformers

---

## 1. 整体架构概览

Khoj 采用 **FastAPI + Django 混合架构**，这是一个非常独特的设计选择。FastAPI 作为 ASGI 应用服务器处理 HTTP/WebSocket 请求，而 Django 仅作为 ORM 层和管理后台使用（通过 `django.core.asgi` 挂载到 `/server` 路径下）。两者通过中间件桥接。

**核心启动流程**（`main.py`）：
1. 设置 Django 环境变量 → `django.setup()`
2. 执行数据库迁移 → `call_command("migrate")`
3. 收集静态文件 → `call_command("collectstatic")`
4. 创建 FastAPI 应用 → `FastAPI()`
5. 挂载 Django ASGI 应用到 `/server`
6. 配置路由、中间件、调度器
7. 启动 uvicorn 服务器

这种混合架构的优势在于：利用 Django 成熟的 ORM、迁移系统和管理后台，同时享受 FastAPI 的高性能异步处理和自动 API 文档生成。

---

## 2. 模块分层架构

源码位于 `src/khoj/`，分为 8 个核心模块：

```
src/khoj/
├── app/           # Django 配置（settings.py）
├── database/      # 数据层：models/ adapters/ migrations/
├── interface/     # 前端接口层（Web/CLI）
├── processor/     # 核心处理层（AI/搜索/工具）
│   ├── content/   # 文档解析（PDF/Markdown/Org/Notion等）
│   ├── conversation/ # 对话引擎（多模型适配）
│   ├── image/     # 图像生成
│   ├── operator/  # 计算机操作代理
│   ├── speech/    # 语音合成
│   └── tools/     # 外部工具（搜索/代码执行/MCP）
├── routers/       # API 路由层（FastAPI Router）
├── search_filter/ # 搜索过滤器（日期/文件/关键词）
├── search_type/   # 搜索引擎（语义搜索/全文搜索）
└── utils/         # 工具函数/配置/CLI
```

**分层职责**：
- **Routers** → HTTP 接口定义，请求验证，速率限制
- **Processor** → 业务逻辑核心，AI 对话、内容处理、工具调用
- **Database** → 数据持久化，Django ORM 模型和适配器模式
- **Search** → 向量搜索 + 关键词搜索的混合检索

---

## 3. 多模型 LLM 适配层

Khoj 的对话引擎支持 5 大 LLM 提供商，通过统一的对话处理层实现多模型切换：

| 提供商 | SDK | 模型示例 |
|--------|-----|----------|
| OpenAI | `openai` | GPT-4o, GPT-5, o3/o4-mini |
| Anthropic | `anthropic` | Claude Sonnet 4, Claude Opus 4 |
| Google | `google-genai` | Gemini 2.5 Pro/Flash |
| 本地模型 | OpenAI-compatible | Llama, Qwen, Mistral via Ollama |
| E2B | 代码沙箱 | 远程代码执行 |

**关键设计**：
- `model_to_prompt_size` 字典管理每个模型的上下文窗口大小（30K-120K tokens）
- `RetryableModelError` 异常实现了**模型故障自动降级**：当 OpenAI 限流、Anthropic API 错误、Gemini 502/503 时，自动切换到备选模型
- `is_retryable_exception()` 统一判断三种提供商的可重试异常类型
- 通过 `OPENAI_BASE_URL` 环境变量支持任意 OpenAI 兼容端点（Ollama、vLLM、LMStudio 等）

---

## 4. 语义搜索与向量检索

Khoj 使用 **sentence-transformers + pgvector** 实现语义搜索：

**EmbeddingsModel** 类支持三种推理后端：
1. **本地模式**（`LOCAL`）：使用 `SentenceTransformer` 加载模型到本地 GPU/CPU，默认 `thenlper/gte-small`
2. **HuggingFace 推理端点**（`HUGGINGFACE`）：远程 API 调用，带指数退避重试
3. **OpenAI 兼容端点**（`OPENAI`）：通过 OpenAI Embeddings API

**CrossEncoderModel** 用于重排序：
- 默认模型：`mixedbread-ai/mxbai-rerank-xsmall-v1`
- 支持 HuggingFace 推理端点或本地推理
- 使用 Sigmoid 激活函数输出相关性分数

**搜索流程**：
1. 用户查询 → `embed_query()` 生成查询向量
2. pgvector 近似最近邻检索 → 候选文档
3. CrossEncoder 重排序 → 精排结果
4. 搜索过滤器（日期/文件/关键词）进一步筛选

---

## 5. 深度研究（Research）Agent 架构

`research.py` 实现了一个**多轮迭代式研究代理**，这是 Khoj 最复杂的 Agent 系统：

**核心数据结构**：
- `ToolCall(name, args, id)` — 工具调用描述
- `ResearchIteration` — 单次研究迭代，包含查询、上下文、在线搜索结果、代码执行结果、Operator 结果
- `OperatorRun` — 计算机操作代理的执行轨迹

**研究流程**：
1. 接收用户查询 → 构建功能规划 prompt
2. LLM 推理 → 决定需要哪些信息源（工具选择）
3. 并行执行工具调用（搜索、代码执行、文件检索等）
4. 收集结果 → 构建 `ResearchIteration` 历史
5. 判断是否需要更多迭代 → 重复步骤 2-4
6. 汇总所有迭代结果 → 生成最终回答

**支持的工具**（`ConversationCommand` 枚举）：
- `SemanticSearchFiles` — 语义搜索用户文档
- `OnlineSearch` — 联网搜索（SearXNG/Exa）
- `ReadWebpage` — 网页内容提取
- `PythonCoder` — 代码执行（Terrarium/E2B 沙箱）
- `Operator` — 计算机操作代理
- MCP 工具 — 通过 MCP 协议扩展的外部工具

**并行工具调用**：`construct_iteration_history()` 支持将多个并行工具调用（`raw_response` 中的多个 `tool_use` 块）合并为一组 assistant+user 消息，保持对话历史的结构正确性。

---

## 6. Agent 系统与自定义 Agent

Khoj 允许用户创建**自定义 Agent**，每个 Agent 拥有独立的：
- 人格设定（persona/personality）
- 知识库（custom knowledge files）
- 聊天模型选择
- 工具访问权限
- 隐私级别（PUBLIC/PRIVATE）

**Agent 数据模型**（Django ORM）：
- `Agent` 模型存储 Agent 配置
- `AgentAdapters` 提供 Agent CRUD 操作
- 支持默认 Agent 和用户自定义 Agent
- Agent 与 Conversation 一对多关联

**隐私控制**：Private Agent 的对话只有创建者可见，Public Agent 可被所有用户使用。

---

## 7. 内容处理管线

`processor/content/` 处理多种文档格式的解析和索引：

| 格式 | 处理方式 |
|------|----------|
| PDF | PyMuPDF 解析 + RapidOCR 光学字符识别 |
| Markdown | 原生解析 |
| Org-mode | 原生解析（Emacs 生态） |
| Word (.docx) | docx2txt 提取 |
| Notion | Notion API 集成 |
| 图片 | OCR 文本提取 |
| 音频 | OpenAI Whisper 语音识别 |

**文本分块**：使用 `langchain-text-splitters` 进行智能分块，保持语义完整性。

**自动索引**：通过 APScheduler 每 22-25 小时自动更新内容索引，使用分布式进程锁确保多实例环境下只有一个 worker 执行索引任务。

---

## 8. 任务调度与自动化

Khoj 实现了完整的**分布式任务调度系统**：

**调度器架构**：
- `BackgroundScheduler`（APScheduler）作为后台调度器
- `DjangoJobStore` 将任务持久化到 PostgreSQL
- `ProcessLock` 机制实现分布式领导者选举

**领导者选举流程**：
1. 启动时检查 `SCHEDULE_LEADER` 进程锁
2. 如果锁不存在 → 创建锁（43200秒/12小时过期），成为领导者
3. 如果锁存在且有效 → 以 paused 模式启动调度器
4. 每 17 分钟 `wakeup_scheduler()` 检查领导者状态
5. 领导者过期后其他 worker 自动接管

**内置定时任务**：
- `update_content_index_regularly()` — 每 22-25 小时更新内容索引
- `upload_telemetry()` — 每 2 分钟上传遥测数据
- `delete_old_user_requests()` — 每 31 分钟清理过期速率限制记录

---

## 9. 认证与多端接入

`configure.py` 中的 `UserAuthenticationBackend` 实现了**多模式认证**：

**认证方式**：
1. **Session 认证** — Web 端登录（Django Session）
2. **Bearer Token 认证** — Desktop/Emacs/Obsidian 客户端（`KhojApiUser` 表）
3. **Client Application 认证** — WhatsApp/Twilio 集成（`ClientApplication` 表）
4. **匿名模式** — 使用默认用户（`--anonymous-mode` 启动参数）

**订阅层级**：
- `authenticated` — 基础认证用户
- `premium` — 订阅用户（更多配额）

**多客户端支持**：
- Web 浏览器（React 前端）
- Obsidian 插件（Desktop + iOS + Android）
- Emacs 集成
- 桌面应用（Electron/Tauri）
- WhatsApp（通过 Twilio）
- API 直接调用

**速率限制**：`ApiUserRateLimiter` 和 `ConversationCommandRateLimiter` 分别控制 API 调用和特定命令的频率。

---

## 10. 部署架构与扩展性

**Docker Compose 部署**包含 5 个服务：

| 服务 | 镜像 | 职责 |
|------|------|------|
| `database` | pgvector/pgvector:pg15 | 向量数据库 + 关系数据库 |
| `sandbox` | khoj-ai/terrarium | Python 代码执行沙箱 |
| `search` | searxng/searxng | 联网搜索引擎 |
| `computer` | khoj-ai/khoj-computer | 计算机操作代理环境 |
| `server` | khoj-ai/khoj | 主应用服务器 |

**扩展性设计**：
- **水平扩展**：多 worker 通过 ProcessLock 领导者选举协调任务
- **分布式数据库连接**：`AsyncCloseConnectionsMiddleware` 处理 sync/async 混合环境下的连接管理
- **可插拔搜索后端**：EmbeddingsModel 支持本地/远程推理切换
- **MCP 协议扩展**：通过 `MCPClient` 集成外部工具服务器
- **自定义沙箱**：支持 Terrarium（自托管）或 E2B（云端）代码执行环境

**生产部署特性**：
- Gunicorn + Uvicorn 多 worker 模式
- HTTPS 支持（SSL 证书配置）
- 自定义域名和反向代理支持
- Stripe 支付集成（可选）
- Twilio WhatsApp 集成（可选）
- S3/Boto3 文件存储（可选）

---

## 架构亮点总结

| 维度 | 设计特点 |
|------|----------|
| **Web 框架** | FastAPI + Django ORM 混合，兼顾性能和成熟度 |
| **数据库** | PostgreSQL + pgvector，关系+向量一体化 |
| **LLM 适配** | 5 大提供商统一接口 + 自动故障降级 |
| **搜索** | 语义搜索 + CrossEncoder 重排序 + 多维度过滤 |
| **Agent** | 多轮迭代研究 + 并行工具调用 + 自定义 Agent |
| **调度** | 分布式领导者选举 + APScheduler 持久化任务 |
| **认证** | 4 种认证模式覆盖 Web/API/客户端/匿名 |
| **部署** | 5 服务 Docker Compose + 水平扩展支持 |
| **工具扩展** | MCP 协议 + 代码沙箱 + 计算机操作代理 |
| **内容处理** | 10+ 格式解析 + OCR + Whisper 语音识别 |

Khoj 的架构展示了一个**从个人工具到企业级平台**的渐进式扩展路径：核心是语义搜索 + 多模型对话，通过 Agent 系统、工具扩展和分布式调度逐步增强能力。其 FastAPI+Django 混合架构虽然增加了复杂度，但完美平衡了开发效率（Django 生态）和运行性能（FastAPI 异步）的需求。
