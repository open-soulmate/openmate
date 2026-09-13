# Khoj

## 概述

Khoj 是一个个人AI助手。

**仓库**: https://github.com/khoj-ai/khoj | **语言**: Python | **License**: AGPL

## 核心架构

> **项目**: [khoj-ai/khoj](https://github.com/khoj-ai/khoj) — 37,292 Stars | AGPL-3.0
> **定位**: Your AI Second Brain — 自托管的个人AI助手，支持本地/云端LLM、文档问答、自动化研究
> **技术栈**: Python 3.10-3.12 / FastAPI + Django ORM / PostgreSQL + pgvector / sentence-transformers

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

源码位于 `src/khoj/`，分为 8 个核心模块：

[详见源码]

**分层职责**：
- **Routers** → HTTP 接口定义，请求验证，速率限制
- **Processor** → 业务逻辑核心，AI 对话、内容处理、工具调用
- **Database** → 数据持久化，Django ORM 模型和适配器模式
- **Search** → 向量搜索 + 关键词搜索的混合检索

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

**隐私控制**：Private Agent 的对话只有创建者可见，Public Agen

## 关键技术

1. **Agent/环境/模型三抽象正交（源码确认）**：`OperatorAgent`（模型）× `Environment`（动作环境）× 任务，换模型或换环境各改一侧，复用性强。
2. **轨迹续跑与中断（源码确认）**：`previous_trajectory`、`cancellation_event`、`interrupt_queue`、`RequestUserAction`——长任务可续、可被用户打断/介入。
3. **启动即迁移（源码确认）**：FastAPI 启动时跑 Django migrate/collectstatic，部署自愈。
4. **调度主选锁（源码确认）**：`ProcessLock.SCHEDULE_LEADER` 防止多实例重复跑定时任务。
5. **多端一等公民（源码确认）**：CORS 白名单直接为桌面/移动/WebView 客户端设计。

- **启动自愈迁移（源码确认，`main.py`）**：启动即 `call_command("migrate","--noinput")`、`collectstatic`，避免漏迁移导致启动失败；输出用 `redirect_stdout` 捕获不污染。
- **取消/中断双通道（源码确认，operator + api_chat）**：`cancellation_event: asyncio.Event` 在 operator 循环与 WebSocket 循环 `while ... not cancellation_event.is_set()` 每轮检查；`interrupt_queue: asyncio.Queue` 注入用户打断；`abort_message` 定义结束事件。
- **依赖校验前置（源码确认）**：`operate_environment` 校验视觉模型——无可用视觉模型时 `raise ValueError("No vision enabled chat model found...")` 明确报错，而非跑半程失败。
- **轨迹续跑保护（源码确认）**：`if previous_trajectory and previous_trajectory.response: previous_trajectory = None`——已有响应的旧轨迹不盲目复用，避免脏续跑。
- **错误抑制（源码确认，`main.py`）**：`warnings.filterwarnings("ignore", ...)` 屏蔽 HF/解析器的非 actionable 警告。
- **生产关闭文档（源码确认）**：`FastAPI(docs_url=None)` 生产关 Swagger，减少暴露面。
- **调度主选（源码确认）**：`ProcessLock.Operation.SCHEDULE_LEADER` + `shutdown_scheduler`（atexit）——单实例跑定时任务，退出时优雅停调度器。

- **分布式调度主选（源码确认）**：`ProcessLock`（Django DB 锁）+ `BackgroundScheduler`——多实例部署时仅 leader 跑定时任务，避免重复索引/自动化。
- **异步流式（源码确认）**：`StreamingResponse`、WebSocket 长连接循环、`asyncio.Event`/`asyncio.Queue`，长任务不阻塞 worker。
- **优雅关停（源码确认）**：`atexit` + `shutdown_scheduler()`，关服时停调度器。
- **多环境/多模型后端（源码确认）**：operator 可切 Browser/Computer 环境、Anthropic/OpenAI/Binary 模型——单点不可用可切换。
- **数据访问层隔离（源码确认）**：`database/adapters.py`（AgentAdapters/ConversationAdapters）封装 DB，便于替换/缓存。
- **可观测**：`rich.logging.RichHandler(rich_tracebacks=True)` 结构化日志；`routers/helpers` 的 `ChatEvent`、`get_message_from_queue` 做事件流。

- **个人记忆沉淀（源码确认）**：`UserMemory`、`relevant_memories`——从对话中沉淀用户级长期记忆，operator 调用时可带入相关记忆。
- **Operator 轨迹复用（源码确认）**：`OperatorRun` + `previous_trajectory`——

## 对openmate的启示

> 供 openmate 参考：第二大脑语义检索、Django+FastAPI 混合、沙箱代码执行、多服务 docker-compose
> 调研日期：2026-09-13
> 资料来源：jsDelivr 实拉 `khoj-ai/khoj@master`（列表 API 403，单文件可拉）
> 版本锚点：`pyproject.toml` → `name = "khoj"`, description `"Your Second Brain"`, `requires-python = ">=3.10, <3.13"`, license AGPL-3.0-or-later

---

```python
search_type_to_embeddings_type = {
    SearchType.Org: EntryType.ORG,
    SearchType.Markdown: EntryType.MARKDOWN,
    SearchType.Plaintext: EntryType.PLAINTEXT,
    SearchType.Pdf: EntryType.PDF,
    SearchType.Github: EntryType.GITHUB,
    SearchType.Notion: EntryType.NOTION,
    SearchType.All: None,
}
```

---

Khoj 对 openmate 的 **可移植层**（个人助手场景）：

| 抄什么 | 具体值/形态 |
|---|---|
| 聊天锁 | `threading.Lock()` 单机串行 |
| 查询缓存 | `defaultdict(LRU)` capacity **128** |
| 检索 top_k | **10** |
| 重排条件 | 结果 >1 条且 cross-encoder 可用 |
| 重排失败 | scores 全 0，不崩 |
| 沙箱 | 独立容器 + healthcheck 30s/10s/retries 2 |
| DB 依赖 | compose `service_healthy` 门闩 |
| LLM 重试 | tenacity |
| 遥测 | env 可关 |
| 会话范围 | file-filters 限制检索子集 |

**不要抄：** Django 全栈、Stripe 计费、khoj-computer VNC 容器（个人助手过重）。

**协议注意：** AGPL-3.0 — 设计可抄，代码勿直接拷贝进闭源 openmate。

**与 CowAgent 互补：** CowAgent 有混合权重 0.7/0.3 与 embedding 缺失降级；Khoj 有 cross-encoder 独立重排与 ProcessLock leader 选

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（62-khoj.md）
- 豆包（078_khoj.md）
- MiMo报告（khoj-l1.md）
- MiMo卡片（khoj.md）
