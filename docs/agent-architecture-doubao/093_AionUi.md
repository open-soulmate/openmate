# Rank 93：iOfficeAI/AionUi 源码级调研报告

## 1. 项目概述与定位

- **项目名称**：AionUi（GitHub: https://github.com/iOfficeAI/AionUi ）
- **Star 数**：约 32.8k（快照值）
- **主要语言**：TypeScript（Electron 桌面应用 + Express WebUI）
- **一句话定位**：开源 24/7 Cowork 应用——作为多种 CLI Agent（Claude Code、Codex、OpenCode、Gemini CLI 等 20+）的**统一 GUI 调度层**，把命令行 AI Agent 包装成现代聊天界面，并提供定时自动化、多通道接入与团队协作。
- **目标用户/场景**：想同时驾驭多个 CLI 编码 Agent、又不想手写终端的开发者；需要桌面 + Web 远程 + IM 多渠道统一入口的个人/小团队。
- **项目成熟度**：高。当前版本 v2.2.2，Apache-2.0，electron-vite + React 19 工程化完善，测试体系完整（vitest 单元 + contract + integration + playwright e2e，含 teams 团队生命周期/白名单/通信专项 e2e）。
- **分类**：其他（多 CLI Agent 的 GUI / 调度中间层），本身不实现推理，编排模式为 Multi-Agent（多 Agent 组队）。

## 2. 源码结构总览

```
AionUi/
├── package.json            # ★ workspaces、依赖、脚本（本次实际读取）
├── packages/
│   └── desktop/            # ★ Electron 主应用
│       └── src/
│           ├── process/    # ★ Electron 主进程（Node 侧）
│           │   ├── index.ts         # 主进程入口（本次实际读取）
│           │   ├── utils/
│           │   │   ├── initStorage.ts   # ★ better-sqlite3 存储初始化
│           │   │   └── initBridge.ts    # IPC 桥
│           │   └── services/   # 业务服务（agent/mcp/cron/database...）
│           └── renderer/       # React 渲染层
├── scripts/                # webui.ts / debug-mcp.ts / debug-custom-agent.ts
└── tests/                  # contract / integration / e2e(teams)
```

**核心源码文件（本次实际读取）**：根 `package.json`（全文依赖与脚本）；`packages/desktop/src/process/index.ts`（主进程入口）。

**入口/启动**：`main: ./out/main/index.js`；主进程 `initializeProcess()` → `initStorage()`（better-sqlite3）→ i18n；渲染层 React 通过 IPC 桥（`initBridge`）与主进程通信。Web 远程模式由 `scripts/webui.ts --remote`（Express）提供。

## 3. 系统架构分析

**编排模式：Multi-Agent 协作（架构确认）**。AionUi 自身**不写推理循环**，而是调度多个独立 CLI Agent。证据：package.json 依赖 `@agentclientprotocol/sdk`（ACP，Agent Client Protocol）与 `@modelcontextprotocol/sdk`（MCP）；e2e 测试目录 `tests/e2e/cases/teams/`（team-create / team-lifecycle / team-whitelist / team-communication）证明其有"团队（多 Agent 组队）"一等公民概念。

**三层架构（依赖证据 + 架构说明）**：
1. **原生 Agent 执行层**：直接 spawn/包装各 CLI Agent 进程，保留其自身模型/鉴权/工具——不重写推理。
2. **ACP 2.0 协议层**：通过 `@agentclientprotocol/sdk` 异步探测本地/内网 Agent、标准化消息流（会话、消息、工具事件）。
3. **界面层**：Electron/React 桌面 + Express WebUI 远程访问。

**关键依赖（源码确认，package.json）**：
- ACP：`@agentclientprotocol/sdk ^0.18.2`；
- MCP：`@modelcontextprotocol/sdk ^1.20.0`（`debug:mcp` 系列脚本支持 list/validate）；
- 定时任务：`croner ^9.1.0`（Cron 自动化）；
- 本地持久化：`better-sqlite3 ^12.4.1`（`packages/desktop/src/process/services/database/drivers/`）；
- WebUI 远程鉴权：`express ^5.1.0` + `express-rate-limit` + `bcryptjs` + `jsonwebtoken` + `tiny-csrf`；
- 多 IM 通道：`grammy`（Telegram）、`dingtalk-stream`（钉钉）、`@larksuiteoapi/node-sdk`（飞书）、`@wecom/aibot-node-sdk`（企业微信）、`@grammyjs/transformer-throttler`；
- 可观测/更新：`@sentry/electron`、`electron-updater`、`electron-log`；
- 实时通道：`ws ^8.18.3`、`eventemitter3`。

```mermaid
flowchart TD
 UI[Electron/React 桌面 + Express WebUI] -->|IPC/ws| CORE[AionCore 主进程服务]
 CORE -->|ACP 2.0| ACP[@agentclientprotocol/sdk]
 ACP --> CLI1[Claude Code] & CLI2[Codex] & CLIn[其他 20+ CLI Agent]
 CORE -->|croner| CRON[定时任务]
 CORE -->|MCP sdk| MCP[统一 MCP 配置]
 CORE --> DB[(better-sqlite3)]
 CORE -->|Telegram/钉钉/飞书/企微| IM[多IM通道]
```

## 4. 功能拆解

- **多 CLI Agent 统一 GUI**：把 20+ 命令行 Agent 接入统一聊天界面，保留各自鉴权/模型。
- **团队（Teams）**：多 Agent 组队，有生命周期、白名单、成员间通信（e2e 测试覆盖）。
- **Cron 自动化**：`croner` 驱动 24/7 定时触发 Agent 任务。
- **MCP 统一管理**：`debug:mcp list/validate`，把 MCP Server 配置同步到所有 Agent。
- **远程 WebUI**：Express 远程模式，带 JWT + CSRF + 限流。
- **多渠道接入**：Telegram/钉钉/飞书/企业微信。
- **文档/代码渲染**：内置 monaco/codemirror、mermaid、katex、docx/xlsx/pptx 解析。

## 5. 技术亮点与优势

1. **不重写推理，只做"调度 + 交互"**：直接复用成熟 CLI Agent 的模型能力，自身专注 GUI/调度/自动化——规避了与各家 Agent 内核重复造轮子。
2. **ACP 标准化接入**：用 `@agentclientprotocol/sdk` 屏蔽不同 CLI Agent 的差异，新增 Agent 走协议而非定制 hack。
3. **多端一体**：同一套 AionCore，桌面 Electron 与远程 Express WebUI 共用，配合 better-sqlite3 本地持久化。
4. **24/7 运维取向**：cron 定时、Sentry 崩溃上报、electron-updater 自动更新、多 IM 推送，是"常驻 Cowork"产品而非一次性对话。

## 6. 稳定性机制【重点】

> 说明：AionUi 是调度层，稳定性体现在进程/服务层面而非 LLM 重试。

- **本地 SQLite 持久化（依赖确认）**：`better-sqlite3` 在主进程 `initStorage()` 中初始化，会话/配置落盘，重启可恢复。
- **启动计时与隔离（源码确认，index.ts）**：`initializeProcess` 对 `initStorage` 等关键步骤打耗时点（`mark()`），便于启动性能定位；`configureChromium` 在最早期设置应用名与 Chromium flags，保证 dev 环境隔离。
- **原生模块架构一致性（源码确认，index.ts）**：打包后强制 `PREBUILDS_ONLY=1`，避免加载错误架构的 node 原生二进制（x64/arm64 混淆）。
- **远程 Web 安全基线（依赖确认）**：Express + `express-rate-limit`（限流防刷）+ `bcryptjs`（密码哈希）+ `jsonwebtoken`（会话）+ `tiny-csrf`（防 CSRF）——远程模式不是裸奔。
- **输入校验**：依赖 `zod ^3.25`，对配置/消息做 schema 校验。
- **注**：各 CLI Agent 自身的工具执行稳定性由各 Agent 负责，AionUi 不二次包装。

## 7. 高可用机制【重点】

- **Agent 进程隔离**：被调度的 CLI Agent 是独立子进程，其崩溃不影响 AionCore 主进程；主进程只负责转发与 UI。
- **Sentry 崩溃上报**：`@sentry/electron` 捕获主/渲染进程崩溃，远程可观测。
- **自动更新**：`electron-updater` 走增量更新，`electron-log` 记录运行日志。
- **限流与背压**：IM 通道用 `@grammyjs/transformer-throttler` 做限流背压，避免上游 API 打爆。
- **多实例**：`AIONUI_MULTI_INSTANCE=1` 支持多实例 dev。
- **分布式**：桌面端单用户为主；远程 WebUI 模式靠 Express 水平扩展，但不是集群化 Agent 编排平台。

## 8. 自我进化机制【重点】

**不适用/较弱**。AionUi 是调度与交互层，本身：
- 不做 LLM 反思、不评估工具输出质量、不从反馈自动调整 prompt；
- "进化"发生在它调度的下游 CLI Agent 内部，AionUi 只负责把消息和文件传进传出。
- 唯一接近的是 **MCP 工具的统一热同步**与**技能/配置的持久化**，以及团队（Teams）配置可复用——属于显式配置管理，而非自动自学习。

## 9. openmate 可借鉴点【重点】

- **P0｜"GUI ↔ Core"进程分离 + IPC/WS 契约**：openmate 规划桌面/手机多端，应把 Agent 运行时放独立 Core 进程，UI 只经 IPC（桌面）/ WebSocket（远程）通信。AionUi 的 `process/index.ts` + `initBridge` + 渲染层分离就是现成范本。预期：UI 崩溃不丢会话、多端复用同一 Core。
- **P0｜本地 SQLite 作为会话/配置底座**：openmate 用 better-sqlite3 在启动早期 `initStorage()` 初始化，会话、工具配置、MCP 清单全落盘。预期：重启恢复、跨会话历史。
- **P1｜远程模式安全基线四件套**：若 openmate 提供 Web 远程访问，照搬 Express + rate-limit + bcrypt 密码哈希 + JWT + CSRF。预期：远程不裸奔。
- **P1｜用协议适配层接入多种 Agent/工具，而非硬编码**：openmate 要接多种后端 Agent 或模型时，用 ACP 这类标准协议屏蔽差异，新增对象走协议。预期：接入成本低。
- **P2｜Cron + 多 IM 推送做"24/7 Cowork"**：openmate 若要做常驻助手，加定时任务（croner）+ 结果推送到 Telegram/飞书。预期：从"对话工具"升级为"主动服务"。
- **P2｜Sentry + 自动更新 + 结构化启动耗时点**：桌面端必备。预期：可观测、可自愈升级。

## 10. 源码验证标注

**源码直接阅读（cdn.jsdelivr.net @main）**：
- 根 `package.json` 全文：版本 v2.2.2、workspaces、`@agentclientprotocol/sdk`、`@modelcontextprotocol/sdk`、`croner`、`better-sqlite3`、Express 安全四件套、各 IM SDK、Sentry/updater、脚本（webui/debug-mcp/teams e2e）、`aioncoreVersion v0.2.2`、`main: out/main/index.js`。
- `packages/desktop/src/process/index.ts`：主进程入口、`initStorage`/`initBridge`/i18n、`PREBUILDS_ONLY`、启动耗时打点。

**来自文档/推断**：
- ACP 2.0 异步批量探测本地/内网 Agent 的具体实现、团队（Teams）的调度逻辑、MCP 配置如何同步到各 Agent，依据官方/已查证架构说明与 e2e 测试目录命名，未逐行读 `services/agent/*` 与 `services/mcp/*` 源码（本次目录树接口因仓库过大多次失败，未能列出 services 子文件清单）。
- 各 CLI Agent 的具体接入 adapter 未读。

**源码不可得/未深入**：`packages/desktop/src/process/services/` 下 agent/acp/mcp/cron 的具体实现文件，因 jsDelivr 目录树接口对超大仓库返回失败、GitHub tree 被 robots 禁止，本次未逐文件展开；建议后续单独精读 ACP adapter 与 cron 服务。
