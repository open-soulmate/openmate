# 020 · OpenHands/OpenHands 源码级调研报告

> 调研日期：2026-09-13 ｜ rank 20 / GitHub Top 100 AI Agent 第 20 位
> 核心项目。**重要结构变化**：本仓库已重构为 **Agent Canvas（TS 控制中心）**，真正的 Agent 循环/runtime 已拆到姊妹仓库 `OpenHands/software-agent-sdk`。本报告同时调研两者。

---

## 1. 项目概述与定位

| 项目 | 内容 |
|---|---|
| 名称 | OpenHands/OpenHands（现品牌 **Agent Canvas**） |
| GitHub | https://github.com/OpenHands/OpenHands |
| Star | 约 90,000+（初步清单） |
| 本仓库语言 | TypeScript（控制中心前端 + 本地编排）；Node ≥22.12 |
| 核心引擎 | Python（`software-agent-sdk`，MIT，arXiv 2511.03690，SWE-bench 77.6） |
| 最新 | Agent Canvas 1.18.0；软件 Agent SDK v1.47.0 |

**一句话定位**：自托管的"编码 Agent 指挥中心"——一个前端把 OpenHands/Claude Code/Codex/Gemini 等 ACP 兼容 Agent 接到本地/Docker/VM/云后端，可按计划或 webhook 触发自动化（发 Slack、把 GitHub issue 拆成任务）。

**目标用户**：想把多个编码 Agent 统一编排、跑在服务器上 7×24 的团队。

**成熟度**：beta、多仓库、企业用户（Apple/NVIDIA/Google/Netflix/TikTok…），生产级。

---

## 2. 源码结构总览（源码确认：两仓库 README）

OpenHands 已是**多仓库系统**：

```
OpenHands/OpenHands            # 本仓库：Agent Canvas 前端/控制中心/本地编排（TS）
└── @openhands/agent-canvas    # npm 包；--frontend-only / --backend-only 可拆分
        │ 消费
        ▼
OpenHands/typescript-client    # 浏览器兼容的 TS 客户端（Agent Server API）
        │ 调用
        ▼
OpenHands/software-agent-sdk   # ★ 权威实现：Python SDK + Agent Server
├── openhands.sdk              # LLM / Agent / Conversation / Tool / AgentContext
├── openhands.tools            # TerminalTool / FileEditorTool / TaskTrackerTool / MCP
├── openhands.agent_server     # REST + WebSocket API（多 Agent 单主机/端口）
├── openhands.*                # events / workspaces / agents / conversations
└── clients/typescript        # 浏览器 TS 客户端
        ▲ 调度
OpenHands/automation           # 调度、webhook、run history、分发
```

**入口（SDK，源码确认 README 示例）**：
```python
agent = Agent(llm=llm, tools=[TerminalTool, FileEditorTool, TaskTrackerTool])
conversation = Conversation(agent=agent, workspace=cwd)
conversation.send_message("...").run()
```

---

## 3. 系统架构分析

**编排模式：ReAct Agent + 事件流（event-stream）+ Conversation 抽象，可远程化。** 证据：
- **Agent 由 LLM + tools 构成**，在一个 Conversation 里跑；`workspace` 可以是本地目录，也可以是 Agent Server 上的**临时容器（Docker/K8s）**。
- **事件是一等公民**：SDK 明确"owns events"；Agent Server 通过 REST + WebSocket 把 Agent 活动事件推给前端，Agent Canvas 据此渲染——与 gemini-cli 的事件源架构同源。
- **多后端切换**：同一前端可连多个 Agent Server（本地笔记本 / Mac mini / VM / OpenHands Cloud），随时切换不丢焦点。
- **子 Agent/委派**：初步笔记提到 delegation / recall；SDK 支持多 Agent 做大型重构。

**核心组件**：LLM（统一抽象）、Agent、Conversation（会话/运行）、Tool（Terminal/FileEditor/TaskTracker/MCP）、Workspace（本地或容器）、AgentServer（REST/WS）、Automation（调度）。

**数据流**：
```
用户/自动化/ webhook
 → Agent Canvas(TS) → typescript-client → Agent Server(REST/WS)
 → Conversation.run() → ReAct: observe → tool(terminal/edit/tracker) → action → ...
 → 事件流回推前端
```

---

## 4. 功能拆解

- **自带工具**：TerminalTool、FileEditorTool、TaskTrackerTool（任务追踪），MCP 外部工具。
- **技能/插件市场**：`AgentContext(load_public_skills=True)`，`OpenHands/extensions` 市场含 uv/deno 技能；按仓库标记（`uv.lock`/`deno.json`）自动加载对应包管理指引——**按仓库现状自动选技能**。
- **自动化**：与 Slack/GitHub/Linear/Notion 集成；定时或 webhook 触发。
- **多 Agent**：SDK 支持多个 Agent 协作做大重构。
- **容器工作区**：Agent 在隔离容器里执行，不碰宿主文件系统（除非显式 `--without-sandbox`）。
- **ACP 兼容**：可跑 Claude Code/Codex/Gemini 等第三方 Agent。

---

## 5. 技术亮点与优势

1. **前后端/引擎彻底解耦**：UI（Canvas TS）、客户端（TS client）、引擎（Python SDK）、调度（automation）四个仓库各自演进，靠 OpenAPI 契约衔接。
2. **本地与远程同构**：同一 Agent 可在本地目录或临时容器跑，API 一致——开发体验与生产部署无缝。
3. **事件流 + WebSocket**：前端订阅事件即可实时渲染 Agent 活动。
4. **技能按仓库标记自动加载**：`uv.lock` 存在就自动装 uv 技能，把"项目生态知识"按需注入。
5. **服务器常驻**：跑在服务器上时，笔记本关机 Agent 继续干活，可被 Slack/GitHub 触发——真"always-on engineering team"。

---

## 6. 稳定性机制【重点】（源码确认/部分）

- **沙箱隔离**：Agent 默认在 Docker 容器内跑（`ghcr.io/openhands/agent-canvas`），`PROJECTS_PATH` 显式挂载；README 对"无沙箱直跑宿主机"打 WARNING，把爆炸半径从架构上隔离。
- **工作区边界**：`Conversation(workspace=cwd)` 明确工作目录，Agent 只在挂载目录内活动。
- **API 契约回归**（源码确认，SDK CI）：`.github/workflows/api-breakage.yml`、`check_agent_server_rest_api_breakage.py`、`check_sdk_api_breakage.py`、`check_approval_drift.py`——把"破坏性 API 变更"做成 CI 门禁，多仓库靠契约不漂移。
- **人工审批（approval）**：`check_approval_drift` 表明有危险操作审批流；`on_stop.sh` hook 在 Agent 停止时触发后置动作。
- **运行中断恢复**：事件流持久化 + run history（automation 仓库）支撑断点续看。

**未在本轮读到**：Agent 循环内部的 max_iterations/重试退避具体实现（见第 10 节标注）。

---

## 7. 高可用机制【重点】（源码确认）

- **多 Agent Server 横向**：每个 Agent Server 单主机/端口跑多个 Agent；Canvas 可连多个 Server，故障/负载时切换。
- **容器化 + 无状态工作区**：临时容器可随时销毁/重建，失败工作区不污染。
- **服务器常驻**：Agent 跑在服务器，本地断连不影响执行；WebSocket 重连续看事件。
- **CI 完备**：SDK 有 30+ workflow（server/tests/integration/security-scan/run-eval），工程化成熟。
- **类型化客户端**：OpenAPI → TS 客户端自动生成，前后端类型一致，减少集成故障。

---

## 8. 自我进化机制【重点】（源码确认/部分推断）

- **TaskTrackerTool**：内建任务追踪工具，Agent 自己维护待办清单并勾选——结构化自管理。
- **技能市场自动加载**：按仓库标记（uv.lock/deno.json）自动选技能，是"上下文按项目自适应"。
- **delegation/recall**（初步笔记）：子 Agent 委派与记忆召回，用于大型多 Agent 任务；本轮未读源码细节。
- **eval 体系**：`.github/workflows/run-eval.yml` + SWE-bench 77.6，有基准评估回路（人/CI 驱动）。

---

## 9. openmate 可借鉴点【重点】

**P0｜前端/客户端/引擎/调度四分离 + OpenAPI 契约**
- 借鉴什么：UI、TS 客户端、Python Agent 引擎、调度服务分开仓库，靠 OpenAPI 契约衔接。
- 怎么用：openmate Web/桌面/手机共用一个"Agent Server"REST+WebSocket 契约，三端只是不同客户端；引擎升级不破坏端。
- 预期收益：多端演进解耦、可独立迭代。

**P0｜本地与远程工作区同构（容器沙箱）**
- 借鉴什么：同一 Agent 既能在用户本机目录跑，也能在 Docker 容器跑，API 一致。
- 怎么用：openmate 桌面端用本地工作区，云端/手机端用容器化工作区；Agent 代码不分叉。
- 预期收益：一套 Agent 内核覆盖多端部署形态。

**P1｜事件流 + WebSocket 实时推送**
- 借鉴什么：Agent 所有活动走事件流，前端订阅渲染，断线按事件续看。
- 怎么用：openmate 移动端弱网/切后台后，重连接最后事件 id 续，不重跑。
- 预期收益：多端实时性与断线恢复。

**P1｜按仓库/项目标记自动加载技能**
- 借鉴什么：检测 `uv.lock`/`deno.json` 等标记，自动注入对应技能指引。
- 怎么用：openmate 打开项目时检测其技术栈标记，自动挂载对应工具/技能，而非每次手动选。
- 预期收益：开箱即用、上下文精准。

**P2｜API 破坏性变更 CI 门禁**
- 借鉴什么：REST/SDK 接口改动自动跑 breakage 检查。
- 怎么用：openmate 改 Agent API 时，CI 跑契约回归，避免三端同时崩。
- 预期收益：长期 API 稳定。

---

## 10. 源码验证标注

**源码直接阅读**：
- `OpenHands/OpenHands` README：Agent Canvas 定位、`@openhands/agent-canvas` 1.18.0、`--frontend-only/--backend-only`、Docker 沙箱、`PROJECTS_PATH`、多后端、ACP、四仓库边界表（OpenHands/OpenHands ↔ software-agent-sdk ↔ typescript-client ↔ automation）。
- `software-agent-sdk` README（v1.47.0）：Python/TS/REST API、`Agent(llm, tools)`、`Conversation(agent, workspace).send_message().run()`、本地或 Docker/K8s 工作区、REST+WebSocket、`AgentContext(load_public_skills=True)`、按 `uv.lock/deno.json` 自动加载技能、SWE-bench 77.6、arXiv 2511.03690。
- SDK 文件树（jsdelivr @1.47.0）：`.github/workflows/` 30+ CI（api-breakage/run-eval/tests/server/security-scan）、`.openhands/hooks/on_stop.sh`、`.agents/skills/*/SKILL.md`、`.github/scripts/check_*_breakage.py`。

**文档/推断**：
- ReAct 循环的 observe→action、max_iterations、重试退避、delegation/recall 细节来自初步架构笔记与 SDK README 的"events/workspaces/conversations"所有权声明，**本轮未读取 `openhands/sdk/` 下 agent 循环 .py 源码**（路径多次 404，monorepo 过大）。
- "event-driven architecture"为依据"SDK owns events + REST/WebSocket"的合理推断。

**源码不可得**：
- `openhands-sdk/openhands/sdk/agent.py` raw 返回 404（路径在新 monorepo 中已变，未定位到确切循环文件）；
- 未读取 agent_server、tools、events 的具体实现；GitHub API 本轮持续限流，未复核 star 数。
