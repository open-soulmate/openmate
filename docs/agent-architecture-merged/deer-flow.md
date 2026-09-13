# DeerFlow

## 概述

DeerFlow 是一个深度研究Agent工作流。

**仓库**: https://github.com/bytedance/deer-flow | **Stars**: 82K | **语言**: Python | **License**: MIT

## 核心架构

> **项目**: [bytedance/deer-flow](https://github.com/bytedance/deer-flow) (⭐ 82K+)
> **版本**: 2.0（完全重写，与 v1 无共享代码）
> **定位**: 开源长周期 Super Agent Harness，支持研究、编码、创作
> **技术栈**: Python 3.12+ / LangGraph / LangChain / FastAPI / Next.js

DeerFlow 采用**三层分离架构**：Nginx 反向代理 → Gateway API（FastAPI） → Lead Agent（LangGraph）。

```
Nginx (2026) ──┬── /api/langgraph/* ──→ Gateway LangGraph API
               ├── /api/* (其他)      ──→ Gateway REST API (8001)
               └── / (非API)          ──→ Next.js 前端 (3000)
```

核心设计理念是**"Super Agent Harness"**——不是框架（framework），而是一个**运行时容器**（harness），为 Agent 提供执行所需的一切基础设施：文件系统、记忆、技能、沙箱、子 Agent 调度能力。从 v1 的 Deep Research 工具演进到 v2 的通用 Agent 平台，这一架构转型体现了 ByteDance 对 Agent 系统的深刻理解：Agent 不缺推理能力，缺的是**执行基础设施**。

沙箱是 DeerFlow 的核心差异化能力，提供**每线程隔离的执行环境**：

- **抽象接口**：`execute_command`、`read_file`、`write_file`、`list_dir`
- **两种 Provider**：`LocalSandboxProvider`（本地文件系统）和 `AioSandboxProvider`（Docker 容器）
- **虚拟路径映射**：`/mnt/user-data/{workspace,uploads,outputs}` → 线程特定物理目录
- **技能路径**：`/mnt/skills` → `deer-flow/skills/` 目录

沙箱系统的亮点在于**虚拟路径翻译**——Agent 看到的是统一的路径结构，实际底层可以是本地目录、Docker 容器甚至 Kubernetes Pod。`AioSandboxProvider` 支持活跃缓存和预热池，通过异步生命周期钩子避免阻塞事件循环。文件写入通过 `str_replace` 实现读-改-写的序列化，保证并发安全。

CSV/TSV 文件可以作为表格预览，支持最多 200 行 50 列的分页浏览。文本制品支持 HTTP byte-range 流式加载，初始加载 1MB，超大文件需要显式加载全文。

DeerFlow 的子 Agent 系统实现了异步任务委派和并发执行：

- **内置 Agent**：`general-purpose`（完整工具集）和 `bash`（命令行专家）
- **并发控制**：每轮最多 3 个子 Agent，15 分钟超时
- **执行方式**：后台线程池 + 状态追踪 + SSE 事件推送
- **工作流**：Agent 调用 `task()` 工具 → 执行器后台运行子 Agent → 轮询完成状态 → 返回结果

子 Agent 的设计遵循了**"委托而非路由"**的原则。Lead Agent 是唯一的决策者，子 Agent 只是执行单元。这种模式避免了多 Agent 之间的协调开销，同时通过并发执行提高了吞吐量。子 Agent 的结果通过 SSE 事件实时推送到前端，保证了用户对长时间任务的可见性。

记忆系统是 DeerFlow v2 的重要新增，提供跨对话的 LLM 驱动持久化上下文保留：

- **自动提取**：分析对话内容，提取用户上下文、事实和偏好
- **作用域安全写入**：中间件提取只存储持久的、描述性的用户级事实
- **原子替换**：矛盾移除只在替换内容通过作用域/置信度门控后才执行
- **结构化存储**：用户上下文（工作/个人/关注）、历史、带置信度评分的事实
- **去抖更新**：批量更新以最小化 LLM 调用
- **系统提示注入**：Top 事实 + 上下文注入 Agent 提示词
- **运行级记忆身份**：通过 SHA-256 身份标识有效的隐藏记忆块

记忆存储为 JSON 文件，基于 mtime

## 关键技术

**DeerFlow 2.0 是 ground-up rewrite，与 v1 无共享代码。**

- README 明确：*"DeerFlow 2.0 is a ground-up rewrite. It shares no code with v1."*
- 原 Deep Research 框架维护在 **`main-1.x` 分支**（`tree/main-1.x`）。
- 旧路径 `src/graph/builder.py`、`src/graph/nodes.py` 等 **在 main 分支不存在**（CDN 404）。
- jsDelivr `data.jsdelivr.com` 的 flat listing 仍是 v1 陈旧索引——**不能信任**。
- **已实读**：
  - `README.md`（148932 bytes，DeerFlow 2.0 全量）
  - `backend/README.md`（26803 bytes，架构 + 项目结构）
  - `config.example.yaml`（145864 bytes，配置全量）
  - `backend/packages/harness/deerflow/sandbox/sandbox.py`（9177 bytes）
  - `backend/packages/harness/deerflow/subagents/executor.py`（95128 bytes）

9 个中间件，**严格顺序**：

| # | Middleware | 职责 |
|---|-----------|------|
| 1 | **ThreadDataMiddleware** | 创建 per-thread 隔离目录（workspace, uploads, outputs） |
| 2 | **UploadsMiddleware** | 注入新上传文件到对话上下文 |
| 3 | **SandboxMiddleware** | 获取沙箱环境用于代码执行 |
| 4 | **SummarizationMiddleware** | 接近 token 上限时压缩上下文（可选） |
| 5 | **TodoListMiddleware** | plan 模式下跟踪多步任务（可选） |
| 6 | **TitleMiddleware** | 首次交换后自动生成会话标题 |
| 7 | **MemoryMiddleware** | 异步记忆提取排队 |
| 8 | **ViewImageMiddleware** | 为视觉模型注入图片数据（条件） |
| 9 | **ClarificationMiddleware** | 拦截澄清请求并中断执行（**必须最后**） |

**Loop 检测**（`loop_detection.enabled`）：

- 检查重复 tool-call 集合 + 单工具频率
- 警告不跳过批次其余部分
- 硬限制优先，停止整批
- 警告级批次完整计数，下次模型请求收到瞬时提示

[详见源码]yaml
memory:
  # enabled, storage, debounce, facts limits
```

- 异步提取
- 范围安全写入（scope/confidence 门控）
- 原子替换（矛盾移除仅在替换通过门控后执行）
- 5 秒异步注入截止
- strict/fail_closed 读失败会停轮

支持的 Provider（`use` 类路径）：

| Provider | use 路径 |
|----------|----------|
| OpenAI | `langchain_openai:ChatOpenAI` |
| Anthropic | `langchain_anthropic:ChatAnthropic` |
| DeepSeek | `deerflow.models.patched_deepseek:PatchedChatDeepSeek` |
| MiniMax | `deerflow.models.patched_minimax:PatchedChatMiniMax` |
| Ollama | `langchain_ollama:ChatOllama`（**原生**，非 OpenAI 兼容） |
| vLLM | `deerflow.models.vllm_provider:VllmChatModel` |
| Codex CLI | `deerflow.models.openai_codex_provider:CodexChatModel` |
| Claude Code | `deerflow.models

## 对openmate的启示

> 仓库: https://github.com/bytedance/deer-flow  
> 抓取通道: cdn.jsdelivr.net/gh/bytedance/deer-flow@main  
> 版本快照: main @ 2026-09-13（DeerFlow 2.0 ground-up rewrite）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 super agent harness、中间件链、沙箱、子代理、记忆与调度借鉴

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（64-deer-flow.md）
- 豆包（024_deer-flow.md）
- MiMo报告（deer-flow.md）
