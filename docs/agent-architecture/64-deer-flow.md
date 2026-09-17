# 64. DeerFlow 架构深度分析

> **项目**: [bytedance/deer-flow](https://github.com/bytedance/deer-flow) (⭐ 82K+)
> **版本**: 2.0（完全重写，与 v1 无共享代码）
> **定位**: 开源长周期 Super Agent Harness，支持研究、编码、创作
> **技术栈**: Python 3.12+ / LangGraph / LangChain / FastAPI / Next.js

---

## 1. 整体架构设计

DeerFlow 采用**三层分离架构**：Nginx 反向代理 → Gateway API（FastAPI） → Lead Agent（LangGraph）。

```
Nginx (2026) ──┬── /api/langgraph/* ──→ Gateway LangGraph API
               ├── /api/* (其他)      ──→ Gateway REST API (8001)
               └── / (非API)          ──→ Next.js 前端 (3000)
```

核心设计理念是**"Super Agent Harness"**——不是框架（framework），而是一个**运行时容器**（harness），为 Agent 提供执行所需的一切基础设施：文件系统、记忆、技能、沙箱、子 Agent 调度能力。从 v1 的 Deep Research 工具演进到 v2 的通用 Agent 平台，这一架构转型体现了 ByteDance 对 Agent 系统的深刻理解：Agent 不缺推理能力，缺的是**执行基础设施**。

---

## 2. Lead Agent 与 LangGraph 图

DeerFlow 的运行时入口是 `lead_agent`，通过 `make_lead_agent(config)` 创建，基于 LangGraph 构建。核心特点：

- **单 Agent 入口**：不使用多 Agent 路由，而是由一个 Lead Agent 统一调度
- **动态模型选择**：支持在运行时切换 LLM，包括 thinking 模式和 vision 支持
- **工具编排**：通过 LangGraph 的节点/边机制，将工具调用编排为有向图
- **子 Agent 委派**：Lead Agent 可以通过 `task()` 工具将子任务委派给子 Agent 并行执行

这种"单入口 + 子 Agent"的模式比纯多 Agent 路由更可控，避免了 Agent 间通信的复杂性。LangGraph 提供了状态管理和检查点机制，使得长时间运行的任务可以中断和恢复。

---

## 3. 中间件链（Middleware Chain）

DeerFlow 定义了 9 个有序中间件，每个处理一个横切关注点，执行顺序严格固定：

| # | 中间件 | 职责 |
|---|--------|------|
| 1 | ThreadDataMiddleware | 创建每线程隔离目录（workspace/uploads/outputs） |
| 2 | UploadsMiddleware | 将上传文件注入对话上下文 |
| 3 | SandboxMiddleware | 获取沙箱执行环境 |
| 4 | SummarizationMiddleware | 接近 token 限制时压缩上下文 |
| 5 | TodoListMiddleware | 跟踪多步骤计划任务 |
| 6 | TitleMiddleware | 自动生成对话标题 |
| 7 | MemoryMiddleware | 异步提取对话记忆 |
| 8 | ViewImageMiddleware | 为 vision 模型注入图片数据 |
| 9 | ClarificationMiddleware | 拦截澄清请求，中断执行（必须最后） |

这一设计将关注点分离做到了极致。每个中间件独立可测试，顺序保证了依赖关系的正确性（如沙箱必须在文件操作之前就绪，澄清必须最后执行）。**循环检测**机制同时检查重复工具调用集和单工具频率，防止 Agent 陷入死循环。

---

## 4. 沙箱系统（Sandbox & File System）

沙箱是 DeerFlow 的核心差异化能力，提供**每线程隔离的执行环境**：

- **抽象接口**：`execute_command`、`read_file`、`write_file`、`list_dir`
- **两种 Provider**：`LocalSandboxProvider`（本地文件系统）和 `AioSandboxProvider`（Docker 容器）
- **虚拟路径映射**：`/mnt/user-data/{workspace,uploads,outputs}` → 线程特定物理目录
- **技能路径**：`/mnt/skills` → `deer-flow/skills/` 目录

沙箱系统的亮点在于**虚拟路径翻译**——Agent 看到的是统一的路径结构，实际底层可以是本地目录、Docker 容器甚至 Kubernetes Pod。`AioSandboxProvider` 支持活跃缓存和预热池，通过异步生命周期钩子避免阻塞事件循环。文件写入通过 `str_replace` 实现读-改-写的序列化，保证并发安全。

CSV/TSV 文件可以作为表格预览，支持最多 200 行 50 列的分页浏览。文本制品支持 HTTP byte-range 流式加载，初始加载 1MB，超大文件需要显式加载全文。

---

## 5. 子 Agent 系统（Sub-Agents）

DeerFlow 的子 Agent 系统实现了异步任务委派和并发执行：

- **内置 Agent**：`general-purpose`（完整工具集）和 `bash`（命令行专家）
- **并发控制**：每轮最多 3 个子 Agent，15 分钟超时
- **执行方式**：后台线程池 + 状态追踪 + SSE 事件推送
- **工作流**：Agent 调用 `task()` 工具 → 执行器后台运行子 Agent → 轮询完成状态 → 返回结果

子 Agent 的设计遵循了**"委托而非路由"**的原则。Lead Agent 是唯一的决策者，子 Agent 只是执行单元。这种模式避免了多 Agent 之间的协调开销，同时通过并发执行提高了吞吐量。子 Agent 的结果通过 SSE 事件实时推送到前端，保证了用户对长时间任务的可见性。

---

## 6. 记忆系统（Long-Term Memory）

记忆系统是 DeerFlow v2 的重要新增，提供跨对话的 LLM 驱动持久化上下文保留：

- **自动提取**：分析对话内容，提取用户上下文、事实和偏好
- **作用域安全写入**：中间件提取只存储持久的、描述性的用户级事实
- **原子替换**：矛盾移除只在替换内容通过作用域/置信度门控后才执行
- **结构化存储**：用户上下文（工作/个人/关注）、历史、带置信度评分的事实
- **去抖更新**：批量更新以最小化 LLM 调用
- **系统提示注入**：Top 事实 + 上下文注入 Agent 提示词
- **运行级记忆身份**：通过 SHA-256 身份标识有效的隐藏记忆块

记忆存储为 JSON 文件，基于 mtime 的缓存失效。单文件操作是真正增量的——upsert/delete 只读写和索引被访问的事实文件。这种设计在保持简单性的同时，实现了高效的增量更新。

---

## 7. 工具生态系统（Tool Ecosystem）

DeerFlow 的工具生态分为五层：

| 类别 | 工具 |
|------|------|
| **沙箱工具** | `bash`、`ls`、`read_file`、`write_file`、`str_replace` |
| **内置工具** | `present_files`、`ask_clarification`、`view_image`、`task`（子 Agent） |
| **社区工具** | Tavily（搜索）、Jina AI（抓取）、Crawl4AI、Firecrawl、fastCRW、DuckDuckGo |
| **MCP 工具** | 任何 MCP Server（stdio/SSE/HTTP 传输） |
| **技能工具** | 通过系统提示注入的领域特定工作流 |

技能系统是工具生态的核心扩展机制。技能以 `SKILL.md` 文件定义，支持从 `.skill` 归档安装，支持公共和自定义两种类别。技能加载时递归发现 `skills/{public,custom}` 下的嵌套 `SKILL.md`。`SkillScan` 提供原生离线确定性扫描，在 LLM 技能扫描器之前运行，`CRITICAL` 级别发现会阻断安装。

---

## 8. Gateway API 与前端

Gateway 是基于 FastAPI 的 REST API，提供前端集成所需的所有端点：

- **模型管理**：`GET /api/models` 列出可用 LLM
- **MCP 配置**：`GET/PUT /api/mcp/config` 管理 MCP Server 配置
- **技能管理**：`GET/PUT /api/skills`、`POST /api/skills/install`
- **记忆管理**：`GET /api/memory`、`POST /api/memory/reload`
- **线程管理**：上传文件、列出制品、删除线程数据
- **流式响应**：SSE 事件流支持实时推送 Agent 执行状态

前端基于 Next.js 构建，支持多种部署模式：本地前台、本地守护进程、Docker 开发、Docker 生产。Nginx 作为统一入口，将 `/api/langgraph/*` 重写为 `/api/*` 路由到 Gateway，非 API 请求路由到前端。浏览器登录使用 `HttpOnly` 会话 cookie，支持"保持登录"选项。

---

## 9. 部署与运维

DeerFlow 提供了完善的部署方案：

- **Docker 部署**（推荐）：`make docker-init` → `make docker-start`，支持热重载
- **本地开发**：`make setup` → `make dev`，交互式配置向导
- **生产部署**：`make up`，构建本地镜像，等待 `/health` 端点就绪
- **多 Worker 支持**：需要 PostgreSQL + Redis Stream Bridge + 租约心跳
- **数据库迁移**：Alembic 自动升级，Gateway 启动时自动执行 `alembic upgrade head`

部署规模建议：

| 目标 | 起步 | 推荐 |
|------|------|------|
| 本地评估 | 4 vCPU / 8 GB | 8 vCPU / 16 GB |
| Docker 开发 | 4 vCPU / 8 GB | 8 vCPU / 16 GB |
| 长期运行 | 8 vCPU / 16 GB | 16 vCPU / 32 GB |

多 Worker 部署需要额外的 Redis 协调：SSE 投递和 `Last-Event-ID` 重放跨 Worker 共享，租约和解使用原子接管声明保证只有一个恢复者。运行取消可以通过任意 Worker 接受，非所有者 Worker 持久化中断请求，所有者在租约续期时观察并执行取消。

---

## 10. IM 频道与 ACP 集成

DeerFlow 支持多种即时通讯渠道和外部 Agent 协议：

**IM 频道**：
- **飞书**：流式响应，单卡片原地更新，快速连续问题排队处理
- **Slack/Telegram**：使用最终 `runs.wait()` 响应路径
- **Discord**：专用事件循环，有序注册和清理，防止关闭时挂起
- **微信**：通过 QR 码引导绑定

**ACP（Agent Communication Protocol）集成**：
- 支持 Codex CLI、Claude Code OAuth、MiniMax Code 等外部 Agent
- 通过 `invoke_acp_agent` 在每线程 ACP 工作空间中调用
- 转发已启用的 MCP Server 给外部 Agent

**可观察性**：
- LangSmith：LangChain 回调，支持 user_id、trace_name、tags
- Langfuse：OpenTelemetry 提供者
- Monocle：基于 OpenTelemetry 的 Agent 追踪，支持文件/控制台/S3/GCS 导出

---

## 总结

DeerFlow 的架构设计体现了几个关键洞察：

1. **Harness 优于 Framework**：提供运行时基础设施而非抽象接口，让 Agent 专注于任务而非环境搭建
2. **单入口 + 子 Agent**：避免多 Agent 路由的复杂性，保持决策集中
3. **中间件分离**：9 个有序中间件将横切关注点模块化，便于独立测试和维护
4. **沙箱虚拟化**：统一路径接口适配多种后端，为 Agent 提供一致的执行环境
5. **记忆即上下文**：将跨对话记忆作为系统提示的一部分注入，而非独立的检索系统

DeerFlow v2 的成功（82K+ Stars）证明了 Super Agent Harness 这一范式的市场认可度。它不是一个需要用户组装的框架，而是一个开箱即用的 Agent 运行时——这正是从 Deep Research 工具到通用 Agent 平台的关键转型。
