# AgentGPT

## 概述

AgentGPT 是一个自主AI Agent平台。

**仓库**: https://github.com/reworkd/AgentGPT | **语言**: Python | **License**: GPL

## 核心架构

> **项目**: [reworkd/AgentGPT](https://github.com/reworkd/AgentGPT) (35.8k⭐, 已归档)
> **定位**: 浏览器端自主 AI Agent 组装、配置与部署平台
> **技术栈**: Next.js 13 + FastAPI + LangChain + Prisma/SQLModel + MySQL

AgentGPT 采用经典的**前后端分离双层架构**，前端负责 Agent 运行循环的编排与 UI 交互，后端负责 LLM 调用、工具执行和持久化。

[详见源码]

**关键设计决策**: Agent 的运行循环（autonomous loop）跑在**浏览器前端**，后端仅作为 LLM 代理和工具执行层。这意味着 Agent 的生命周期管理、任务队列、暂停/恢复逻辑全部由前端 TypeScript 代码控制。

AgentGPT 的核心是一个 **Work Pipeline 模式**——`AutonomousAgent` 类维护一个 `workLog`（工作日志队列），按序执行工作单元。

[详见源码]

**生命周期状态机**: `offline → running ⇄ pausing ⇄ paused → stopped`

每个工作单元（AgentWork）是一个独立的步骤，执行完后可以通过 `next()` 链接下一个工作单元，形成流水线。初始工作单元是 `StartGoalWork`。

AgentGPT 定义了 7 种工作单元类型，每种封装一个原子操作：

| 工作单元 | 职责 | API 端点 |
|---------|------|---------|
| `StartGoalWork` | 根据目标生成初始任务列表 | `POST /api/agent/start` |
| `CreateTaskWork` | 根据执行结果生成后续任务 | `POST /api/agent/create` |
| `AnalyzeTaskWork` | 分析任务，选择执行策略和工具 | `POST /api/agent/analyze` |
| `ExecuteTaskWork` | 执行具体任务（流式输出） | `POST /api/agent/execute` |
| `SummarizeWork` | 汇总所有执行结果 | `POST /api/agent/summarize` |
| `ChatWork` | 与用户进行对话交互 | `POST /api/agent/chat` |

每个 Work 实现统一接口：
- `run()`: 执行核心逻辑
- `conclude()`: 执行完成后的收尾工作（更新 UI、消息）
- `next()`: 返回下一个工作单元（链式编排）
- `onError()`: 错误处理回调

AgentGPT 后端实现了可扩展的工具系统，位于 `platform/reworkd_platform/web/api/agent/tools/`：

| 工具文件 | 功能 |
|---------|------|
| `reason.py` | 推理工具（纯 LLM 思考） |
| `search.py` | 网络搜索（Serper API） |
| `sidsearch.py` | SID 搜索引擎 |
| `wikipedia_search.py` | Wikipedia 搜索 |
| `image.py` | 图像生成（Replicate） |
| `code.py` | 代码执行 |
| `conclude.py` | 结论生成 |
| `open_ai_function.py` | OpenAI Function Calling 适配 |

**工具选择机制**: 前端 `analyze` 阶段会将用户激活的工具名称发送到后端，后端通过 `Analysis` 类型返回决策：

[详见源码]

**样式**: TailwindCSS + HeadlessUI，schema 校验用 Zod（前端）+ Pydantic（后端）。

---

## 关键技术

1. **工作项职责链（AgentWork）抽象**：把规划/分析/对话/汇总建模成统一接口的 `AgentWork`，每个有 `run/next/conclude/onError`，循环引擎只认队列——解耦清晰、易扩展新工作项。
2. **可暂停/恢复的生命周期状态机**：`running/pausing/paused/stopped` 四态，`chat()` 运行中插入消息、`pauseAgent()` 优雅暂停，`lastConclusion` 记录"暂停前未 conclude 的工作项"以便恢复后补完。
3. **Plan-and-Solve 提示工程**：用固定 few-shot 例子把"目标→查询列表"的 JSON 数组结构化，早期就算力/模型弱也能稳定出任务。
4. **可插拔后端**：`agent_service` 目录下 `open_ai_agent_service` 与 `mock_agent_service` 并存，无 API Key 也能跑 mock 演示——降低体验门槛。

- **重试机制（源码确认）**：`runWork()` 用 `withRetries()` 包裹每个工作项；`RETRY_TIMEOUT = 2000`（毫秒）退避等待后重试；`shouldRetry = work.onError?.(e) || true`，即工作项可自定义是否重试。
- **错误分类（源码确认）**：`isRetryableError(e)`（`types/errors.ts`）判定错误是否可重试；**不可重试错误直接 `this.stopAgent()` 停掉整个 Agent**——即把致命错误（如鉴权失败）与瞬态网络错误区分开。
- **优雅暂停（源码确认）**：循环每步检查 `model.getLifecycle()`，遇 `pausing` 转 `paused` 并 `return`；退出前把当前工作项的 `conclude` 存进 `lastConclusion`，恢复时先补完——避免状态悬空。
- **边界控制**：任务数上限由 `start_goal_prompt` 的"max 5 queries"提示词约束（软性，非代码强约束）；`createTaskMessages` 用 `TIMOUT_SHORT=150ms` 在任务间制造可见间隔，让前端消息渲染不被刷屏。
- **不足（源码/推断）**：无检查点持久化到可恢复运行——刷新页面即丢运行态；无 token 级预算/熔断；重试无指数退避（固定 2s）。

- **前后端解耦**：LLM 推理集中在无状态 FastAPI 后端（`platform/`），前端崩溃不影响已发出的请求；但前端持有循环状态，**刷新即丢**，故无真正的崩溃恢复。
- **Mock 降级**：无 API Key 时用 `mock_agent_service.py`/`stream_mock.py`，保证演示链路不断。
- **并发模型**：单用户单 Agent，浏览器内单循环 `while`，无任务队列/分布式调度；不具备横向扩展能力（这是演示项目，非服务端多租户设计）。
- **可观测性**：仅前端消息流（`MessageService`），无结构化 trace/指标。

- **增量任务生成（源码确认，唯一的"自进化"痕迹）**：`create_tasks_prompt` 让 LLM 根据"刚完成的任务 + 结果"自动追加新任务，使 Agent 能在执行中动态调整计划——这是早期的"执行反馈→再规划"闭环，但**不沉淀经验、不评估、不跨会话记忆**。
- **无长期记忆**：向量记忆（Weaviate/Pinecone）在更晚/文档版提及，当前 main 代码未见持久化记忆模块；每轮从零规划。
- **无自我反思/评分回路**：无 LLM-as-judge、无基准测试、无用户反馈驱动的行为调整。`summarize_prompt` 强调"只使用给定信息、不编造"，是防幻觉约束而非进化机制。
- **结论**：自我进化能力弱，仅"边执行边补任务"这一原始闭环。

## 对openmate的启示

> 研究目的: 为 openmate（混合编码 + 个人助手）提供「命名即部署」UX 与目标驱动任务分解借鉴

> 对 openmate：AgentGPT 是 **「命名即部署」UX** 与 **目标→任务自分解** 的轻量实现。openmate 个人助手应抄上手门槛与目标驱动循环，而非其浅层稳定性。GPL-3.0 对闭源集成有传染风险，仅可读架构不可直接拷贝代码。

对比 OpenClaw：无 rate-limit 10 次尝试、无 90s 窗口 8 重试、无 exponential backoff + jitter、无 provider pacing。

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（63-agentgpt.md）
- 豆包（082_AgentGPT.md）
- MiMo报告（agentgpt-l1.md）
- MiMo卡片（agentgpt.md）
