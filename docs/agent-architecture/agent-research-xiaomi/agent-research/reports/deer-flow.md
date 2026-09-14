# bytedance/deer-flow 架构调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/bytedance/deer-flow |
| 语言 | Python 3.12+ / Node.js 22+ |
| License | MIT |
| 定位一句话 | **Super Agent Harness**：编排子 Agent、记忆与沙箱的全栈研究/代码执行框架（2.0 全面重写） |
| 商业 | 字节跳动 / 火山引擎 Coding Plan；姊妹项目 LLM Space |
| 文档 | backend/README.md、backend/docs/CONFIGURATION.md、deerflow.tech |

> 对 openmate：DeerFlow 2.0 是目前开源界**工程完成度最高**的 super agent harness 之一——9 层中间件链、子 Agent 并发、沙箱隔离、长期记忆、多 Worker 租约恢复、调度任务、IM 接入。openmate 若要做「研究 + 代码执行」混合 Agent，DeerFlow 是首要对标。

---

## 1. 系统架构

### 1.1 全栈拓扑

```
┌─────────────────────────────────────────────────────┐
│ Nginx :2026（统一反代，same-origin，HttpOnly Cookie）  │
├──────────────────┬──────────────────────────────────┤
│ /api/langgraph/* │ /api/* + 前端静态资源              │
│ (LangGraph 兼容) │ (模型/MCP/技能/记忆/上传/工件)       │
├──────────────────┴──────────────────────────────────┤
│ Gateway API :8001（FastAPI + 内嵌 Agent Runtime）    │
│  Lead Agent（唯一 LangGraph 入口 lead_agent）        │
│  Middleware Chain（9 层）                            │
│  Tools（sandbox/builtin/community/MCP）              │
│  Subagents（异步后台线程池）                          │
│  Memory（LLM 抽取 + JSON 持久化）                     │
│  Checkpointer（SQLite / Postgres）                   │
├─────────────────────────────────────────────────────┤
│ Sandbox：Local / Docker / K8s Provisioner            │
│ 虚拟路径 /mnt/user-data/{workspace,uploads,outputs}  │
└─────────────────────────────────────────────────────┘
```

### 1.2 部署形态

| 形态 | 命令 | 说明 |
|---|---|---|
| 本地 Dev | `make dev` | Gateway + Frontend + Nginx 热重载 |
| Docker Dev | `make docker-start` | 源码挂载，自动检测 sandbox 模式 |
| Docker Prod | `make up` | 构建镜像，等待 `/health` |
| TUI | `deerflow` | 终端原生，嵌入 DeerFlowClient，无需 Gateway |
| LangGraph Studio | `uv run langgraph dev` | 仅开发调试 |

**推荐资源**：生产 8 vCPU / 16 GB 起步，多 Agent + 沙箱建议 16 vCPU / 32 GB。

---

## 2. 核心机制深潜

### 2.1 Lead Agent 与中间件链

唯一入口 `lead_agent`，9 层中间件按序执行：

| # | 中间件 | 职责 |
|---|---|---|
| 1 | ThreadDataMiddleware | 每线程隔离目录（workspace/uploads/outputs） |
| 2 | UploadsMiddleware | 注入新上传文件到对话上下文 |
| 3 | SandboxMiddleware | 获取沙箱环境 |
| 4 | SummarizationMiddleware | 接近 token 上限时摘要压缩（可选） |
| 5 | TodoListMiddleware | Plan 模式下追踪多步任务（可选） |
| 6 | TitleMiddleware | 首轮后自动生成对话标题 |
| 7 | MemoryMiddleware | 异步记忆抽取排队 |
| 8 | ViewImageMiddleware | 视觉模型注入图像数据（条件触发） |
| 9 | ClarificationMiddleware | 拦截澄清请求并中断执行（必须最后） |

**循环检测**：`loop_detection.enabled` 时检测重复工具调用集合与单工具频率；警告不跳过后续工具，硬限制则整批停止。

### 2.2 状态与持久化

| 组件 | 说明 |
|---|---|
| LangGraph Checkpointer | SQLite / Postgres，存储线程状态与检查点 |
| LangGraph Store | 与 checkpointer 共享 backend |
| checkpoint_delta | 增量快照，默认 `snapshot_frequency: 10` |
| checkpoint_cache | memory 或 redis，仅性能优化 |
| RunStore | 跨 Worker 持久化 run 历史 |
| ThreadState | 每线程隔离的 schema（workspace、sandbox id 等） |

**多 Worker 生产要求**（`GATEWAY_WORKERS > 1`）：
- Postgres 共享
- `stream_bridge.type: redis`
- `run_ownership.heartbeat_enabled: true`
- `run_events.backend: db`
- `sandbox.ownership.type: redis`（多 Worker 共享沙箱后端时）

### 2.3 恢复与容错（生产级）

| 机制 | 行为 |
|---|---|
| **Run 租约（Lease）** | Worker 定期心跳续约；续约失败重试至最后确认租约过期，然后取消本地执行、抑制 checkpoint/完成钩子/投递回执 |
| **孤儿恢复** | 协调器原子 takeover claim，重查租约；只有一个协调器能报告恢复成功 |
| **取消跨 Worker** | 非 owner Worker 持久化 interrupt 请求，owner 在续约时观察并执行；首个接受的请求胜出 |
| **SSE gap 事件** | 重连游标被修剪或订阅者落后时，发出机器可读 `gap` 事件，UI 重载持久状态 |
| **沙箱孤儿清理** | `sandbox.ownership.type: redis` 时用租约防止误杀活跃 peer 的沙箱 |
| **调度任务持久化** | due 执行持久化为 `queued`，Gateway 重启后仍存活；`scheduler.queue_timeout_seconds` 超时失败 |
| **配置原子写** | MCP/skill 更新原子替换 `extensions_config.json`，中断写入不会留下截断文件 |

### 2.4 工具体系

| 类别 | 工具 |
|---|---|
| Sandbox | `bash`、`ls`、`read_file`、`write_file`、`str_replace` |
| Built-in | `present_files`、`ask_clarification`、`view_image`、`task`（子 Agent） |
| Community | Tavily、Jina、Crawl4AI、Firecrawl、DuckDuckGo |
| MCP | stdio / SSE / HTTP；OAuth（client_credentials、refresh_token）；工具名默认加 `<server>_` 前缀防冲突 |
| Skills | 领域工作流，通过系统提示注入；`SKILL.md` 递归发现 |
| ACP Agents | Codex ACP、MiniMax Code 等外部编码 Agent |

**工具路由**：`routing` 提示软性偏好特定 MCP 工具；`tool_search` 延迟 MCP schema 时可自动提升 top-k。

**文件写安全**：`str_replace` 按 `(sandbox.id, path)` 串行化 read-modify-write。

### 2.5 子 Agent 协调

- **内置**：`general-purpose`（全工具集）、`bash`（命令专家，仅 shell 可用时暴露）
- **并发**：每轮最多 3 个子 Agent，15 分钟超时
- **执行流**：`task()` 工具 → 后台线程池执行 → 轮询完成 → SSE 事件 → 返回结果
- **预算**：`subagents.max_total_per_run` 限制总量

### 2.6 长期记忆

- **自动抽取**：分析对话提取用户上下文、事实、偏好
- **范围安全写入**：只存持久、描述性的用户级事实；矛盾移除与合并事实在缺少范围元数据时 fail-closed
- **原子替换**：矛盾移除关联替换时，替换需通过范围/置信度门控、去重、事实上限裁剪
- **防抖更新**：批量更新减少 LLM 调用
- **注入**：Top facts + context 注入 Agent 提示
- **存储**：JSON 文件 + mtime 缓存失效

### 2.7 生产模式亮点

| 模式 | 实现 |
|---|---|
| **认证与会话** | HttpOnly Cookie；「保持登录」仅 HTTPS/localhost；密码不入浏览器存储 |
| **管理员 = 代码执行** | stdio MCP 注册限制在 allowlist（npx/uvx），文档明确「Gateway admin 等价于主机代码执行」 |
| **工件交付** | `/mnt/user-data/outputs` 下产出必须 `present_files` 至少一个 + 终态 `run.delivery` 回执 |
| **安全默认** | 仅绑定 127.0.0.1；公开部署需 IP 白名单 + 反代预认证 + VLAN 隔离 |
| **可观测** | LangSmith / Langfuse / Monocle 三选或双报；缺凭证时显式报错而非静默禁用 |
| **调度任务** | cron/interval/once；多实例需 `scheduler.multi_instance` + 共享 Postgres + 心跳 |
| **支持包** | `make support-bundle` 生成脱敏诊断 + issue 草稿 |
| **阻塞 IO 检测** | `make detect-blocking-io` 静态扫描事件循环阻塞风险 |

---

## 3. 对 openmate 的借鉴

| 维度 | 借鉴点 |
|---|---|
| 中间件链 | 9 层有序中间件处理横切关注点，比散落的 hook 更可维护 |
| 多 Worker 恢复 | 租约 + 心跳 + 原子 takeover + SSE gap，是分布式 Agent 运行时的完整参考 |
| 子 Agent | 每轮 3 并发 + 总量预算 + 后台线程池 + 超时，轻量可控 |
| 记忆范围安全 | fail-closed 缺元数据写入、原子替换，避免脏记忆污染 |
| 安全姿态 | 默认 loopback、admin=代码执行、工件强制交付回执 |
| TUI 嵌入 | 同一 config/checkpointer/skills，终端与 Web 线程互通 |

---

## 4. 版本与生态快照（截至 2026-09）

- DeerFlow 2.0：2026-02 发布，全面重写，与 v1 无共享代码；v1 在 `1.x` 分支维护
- 技术栈：LangGraph 1.0.6+、LangChain 1.2.3+、FastAPI 0.115+
- 推荐模型：Doubao-Seed-2.0-Code、DeepSeek v3.2、Kimi 2.5
- IM 通道：Feishu（流式卡片）、Slack、Telegram、Discord
