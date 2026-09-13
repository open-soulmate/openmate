# 024 · bytedance/deer-flow 源码调研报告

> 调研日期：2026-09-13 ｜ 调研方式：README 2.0 全文精读（150KB，含架构/沙箱/记忆/子 Agent 实现细节）

## 1. 项目概述与定位

- **项目名称**：DeerFlow 2.0（🦌 DeerFlow）
- **GitHub**：https://github.com/bytedance/deer-flow
- **Star 数**：约 82,333（rank 24）
- **主要语言**：Python
- **一句话定位**：字节跳动开源的"Super Agent Harness"——从 Deep Research 框架重写而来，面向深度研究/编码等跨分钟到小时的长时程任务，提供"电池全含、可完全扩展"的 Agent 运行时（文件系统、记忆、技能、沙箱感知执行、规划并派发子 Agent）。
- **目标用户/场景**：需要长时间自主完成复杂多步任务的开发者/团队；既可即用，也可"拆开改造成自己的"。提供 Web 界面、TUI 终端工作台、嵌入式 Python 客户端、Scheduled Tasks 定时任务，以及 Telegram/Slack/飞书/微信 iLink/企业微信/钉钉等 IM 通道接入。
- **成熟度**：高且快速演进。2.0 为从零重写版，基于 LangGraph + LangChain，LangGraph Server（端口 2024），配套 PyPI/公网 Git/本地包三种安装方式，文档极详尽（含实现契约、benchmark、迁移脚本）。

## 2. 源码结构总览

README 中可定位的关键源码路径（文档引用，属"文档级确认"）：

- `backend/packages/harness/deerflow/agents/` —— Agent 工厂 `create_deerflow_agent(...)`、`RuntimeFeatures`
- `deerflow.subagents.SubagentRuntime` —— 子 Agent 运行时（`from deerflow.subagents import SubagentRuntime`）
- `backend/packages/harness/deerflow/agents/memory/backends/{mem0,honcho}/` —— 多记忆后端
- `backend/scripts/benchmark/context_snapshot/README.md` —— 子 Agent 上下文快照评估
- `docs/plans/2026-08-24-subagent-batch-capacity-implementation.md` —— 批处理容量实现契约
- `scripts/migrate_memory_markdown.py` —— v1→v2 记忆迁移 CLI
- `contracts/skill_review/` —— skill-reviewer 版本化 JSON 契约

**入口/启动流程**：`make` 一键（build+start）或两步启动；Gateway 以 Uvicorn worker 跑 LangGraph Server；嵌入式 Python 客户端通过 `chat / streaming / config` 调用，SSE 走 LangGraph SSE 协议（values / messages-tuple / end）。

**代码规模**：大型 Python 工程（`backend/packages/harness` monorepo），含 harness、sandbox provider（Local/Docker/AIO/K8s/E2B）、memory backends、skills 体系。

## 3. 系统架构分析

- **编排模式**：**Plan-and-Execute + Multi-Agent**（源码/文档证据：Lead Agent 规划并动态派发 sub-agents，子 Agent 异步并发执行后回报结构化结果，Lead 校验并综合）。底层是 **LangGraph 有状态图**，支持 checkpoint 暂停/恢复与人在环修订。
- **核心组件划分**：
  1. **Lead/Coordinator**：拆解目标，决定并行或串行，用"最少且有用"的子 Agent（"Sub-agents are an optimization, not the default"）。
  2. **SubagentRuntime**：统一管理子 Agent 并发容量（`max_running`、`max_concurrent_subagents`），普通 `task` 与持久化 `batch_task` 共享进程级容量。
  3. **Sandbox Provider 族**：Local / Docker / Docker+K8s（provisioner service）/ AIO / E2B，给每个任务独立文件系统视图（skills、workspace、uploads、outputs）。
  4. **Memory 层**：DeerMem（默认本地文件+SQLite FTS5/BM25）、可选 openviking / mem0 / honcho 后端。
  5. **Skills 体系**：渐进式加载的 Markdown 技能包（`SKILL.md`）。
- **数据流**：用户输入 → Lead Agent 规划 → 按需派发 `task`/`batch_task` 子 Agent（各自隔离上下文/工具/终止条件）→ 子 Agent 在沙箱读写文件、调工具（web_search/web_fetch/grep/read_file/bash）→ 结构化结果回传 → Lead 校验合成报告 → SSE 流式回推 UI。
- **关键类/函数**：`create_deerflow_agent(model, features=RuntimeFeatures(subagent=True), subagent_runtime=runtime)`；`SubagentRuntime.from_app_config(app_config, batch_repository=...)`；`task(context_mode="isolated"|"snapshot")`；`review_skill_package`。

## 4. 功能拆解

- **Skills & Tools**：技能是结构化能力模块（Markdown 定义 workflow/最佳实践/资源引用），渐进式按需加载以保持上下文精简；支持 `/skill-name` 斜杠激活；`allowed-tools` 策略在斜杠激活后对模型可见 schema 与工具执行双重过滤，"fail closed"。内置研究、报告、幻灯片、网页、图/视频生成技能。
- **Sandbox & File System**：每任务独立执行环境，可读写编辑文件、看图、（安全配置下）执行 shell；E2B 提供 warm pool 与溢出策略（wait/burst/reject）。
- **Agentic Browser Control**：浏览器自动控制。
- **IM 通道**：Telegram/Slack/飞书/微信/钉钉等网关接入。
- **Scheduled Tasks**：cron 定时调度，支持通过 API 预览 cron 触发实例。

## 5. 技术亮点与优势

1. **Super Agent Harness 定位**：不自缚于"框架"，而是提供开箱即用的完整运行时（FS/记忆/技能/沙箱/子 Agent），并保留"拆开改造"的可插拔性。
2. **上下文工程（Context Engineering）**：激进的会话内摘要——完成的子任务摘要化、中间结果落盘、压缩无关内容，长任务不爆上下文窗；子 Agent 上下文默认隔离，`snapshot` 模式可选带入父对话摘要。
3. **严格工具调用恢复**：provider/middleware 强制停止时，剥离裸 tool-call 元数据并为悬空 call 注入占位结果，避免严格校验 `tool_call_id` 的模型因历史畸形报错。
4. **SkillScan 确定性安全扫描**：LLM 扫描前先跑原生确定性扫描（无 Semgrep 依赖），CRITICAL 直接阻断（私钥/shell 执行），warning 才交 LLM 复核——安全与效率兼得。
5. **多后端可插拔记忆**：DeerMem/mem0/openviking/honcho 四后端，按 user_id 隔离，缺 user_id 时 fail closed 而非退化为共享工作区。

## 6. 稳定性机制【重点】

- **错误处理**：Provider/model 请求失败被上报为"失败的子 Agent 任务"而非成功结果，让 Lead 与 UI 可正确反应；交互式回合空结果会重试一次后显式报错（"visible error instead of silent success"）。
- **重试/超时**：E2B `wait` 策略等待 `acquire_timeout` 后**不自动重试整回合**，而是返回结构化错误由客户端调度重试（把重试权交给调用方，避免隐式雪崩）；mount 上传单次最多 512MiB / 2000 文件 / 120s 协作性截止，到期前预检、不中断进行中的 SDK 调用。
- **崩溃恢复**：LangGraph checkpoint 图支持暂停恢复；`batch_task` 持久化到 SQL（total/live/running 计数、重启恢复、有界结果）；子 Agent 执行 ID 服务端隔离，provider 复用 tool-call ID 也无法污染/取消他人后台任务。
- **状态一致性**：DeerMem 用 journaled writes + 共享 user 锁 + 乐观修订防丢失更新；事实路径按 `SHA-256(fact_id)` 前两字符分桶；缓存 token 组合 mtime/size/revision 防脏读；HTTP 409=冲突、500=损坏。
- **边界处理**：`max_concurrent_subagents=1` 时关闭并行路由指引；技能 fail closed（注册表失败或无有效技能时退到框架安全工具）；Lark 凭证目录 `0700`、凭证文件 `0600`、拒绝软链。

## 7. 高可用机制【重点】

- **容错/隔离**：沙箱三级隔离（Local 托管边界 / Docker/AIO / K8s provisioner / E2B）；远程代码经沙箱与主进程隔离。
- **并发与调度**：`SubagentRuntime` 进程级容量控制；并发父回合各自独立子 Agent 执行 ID；批处理 SQL 队列 + thread-scoped UI 面板。
- **横向扩展**：多 worker Gateway 通过 Redis ownership（共享 capacity Hash，按 `sandbox.ownership.key_prefix`）做部署级硬上限，replicas+burst 为全局上限；不一致 worker fail closed；技能 enable 态在多 worker 间重读对齐。
- **资源管理**：E2B VM 保留 slot 直到 E2B 确认销毁；warm pool 预热；bounded executor 限定获取型协程；mount 有总量与文件数上限。
- **可观测性**：`verification.receipts_enabled` 工具收据账本（达预算保留最新）；token 用量回注 dispatch 步骤；`rejected_by_scope_gate` 指标 + 高拒绝率告警。

## 8. 自我进化机制【重点】

- **反思循环**：子 Agent 回报结构化结果，Lead 校验合成；工具收据账本做可追溯（provenance）层。
- **记忆管理**：DeerMem 默认在 `middleware` 模式下，每条候选事实按 scope/durability/authority 分类，**确定性写入门**只持久化 durable、描述性、user 级事实；去重防止重复偏好无限累积。
- **记忆遗忘/更新**：达 `max_facts` 时默认按 confidence 驱逐；可启用 `hybrid-v1`（65% 置信 + 25% 显式确认新鲜度 + 10% 查询热度），并保留 10% 修正槽；`fact_eviction_shadow_enabled` 可影子评估不实际驱逐。
- **自反馈**：`factsToReinforce` 由 LLM 返回 + 确定性消息处理双重确认（最近 6 条过滤消息中命中强化模式）才视为用户强化。
- **工具学习**：`tool_search` / `describe_skill` 框架内发现工具；skill-creator CLI + skill-reviewer 只读评审技能包质量。
- **持续学习**：跨会话沉淀用户画像、写作风格、技术栈、常用工作流，本地存储、用户可控。

## 9. openmate 可借鉴点

- **P0｜Plan-and-Execute + 受限子 Agent 并发**：openmate 的桌面/多端 Agent 应采用 Lead 规划 + 子 Agent 并发，但务必设 `max_concurrent_subagents` 与"最少有用子 Agent"原则，避免无脑 fan-out 烧 token——这是长时程任务稳定性的关键。
- **P0｜上下文工程三板斧**：会话内摘要 + 中间结果落盘 + 无关内容压缩。openmate 在长任务（如批量文档处理）中应把"中间产物写文件系统、只把摘要入上下文"作为默认策略。
- **P0｜严格 tool-call 恢复**：为严格校验 `tool_call_id` 的模型（GPT/Claude 兼容）准备"悬空 call 占位结果注入"，这是很多自研 harness 容易踩的坑。
- **P1｜确定性记忆写入门 + 混合驱逐**：openmate 的 Soul 层记忆可借鉴"先分类 scope/durability/authority 再确定性写入"，避免垃圾事实堆积；hybrid-v1 驱逐（置信+确认+热度）比纯 LRU 更智能。
- **P1｜fail-closed 工具/技能策略**：工具 schema 与执行双重过滤、注册失败退到安全工具，是生产级 Agent 的安全底线。
- **P2｜沙箱 warm pool + Redis 全局容量**：若 openmate 未来做服务端化，E2B 式预热池 + Redis 共享 capacity Hash 是多 worker 限流范本。

## 10. 源码验证标注

- **文档/源码引用（README 直接引用源码路径与类名）**：`create_deerflow_agent`、`SubagentRuntime`、`task(context_mode=...)`、`review_skill_package`、`memory/backends/{mem0,honcho}`、`migrate_memory_markdown.py`、`contracts/skill_review/`、LangGraph SSE 协议。
- **文档描述**：全部功能章节（Skills/Sandbox/Sub-Agents/Memory/Context Engineering/Scheduled Tasks）均来自 README 2.0 正文。
- **源码不可得**：未直接拉取 `.py` 源文件逐行阅读（GitHub API 限流 + 单文件预算），故具体函数实现体、行号未标注；本章架构判断以 README 中明确引用的代码符号为准，属"文档级确认"而非逐行源码确认。
