# 30. OpenClaw 深度架构分析

> 项目：[openclaw/openclaw](https://github.com/openclaw/openclaw)
> Stars: 389k | Forks: 81.7k | Commits: 88,688 | License: MIT
> 版本：2026.8.1 | 运行时：Node.js 24.16+ / 26.1+

OpenClaw 是一个运行在用户设备上、通过已有聊天渠道触达用户的 AI 助手平台。它将模型、工具、消息渠道和伴侣应用统一在一个 Gateway 之下，既可作为个人助手运行在单台笔记本上，也可作为团队共享部署。其核心架构哲学是：**可信网关、不可信执行、确定性策略**。

---

## 1. 整体架构与分层设计

OpenClaw 采用 **Gateway 中心化** 架构，所有组件围绕一个本地控制平面（Gateway）组织：

- **Gateway**：本地控制平面，管理会话、工具、事件和渠道连接。它是整个系统的核心枢纽，所有客户端（CLI、UI、TUI）和渠道（Telegram、WhatsApp、Slack 等）都通过 Gateway 进行通信。
- **Control UI**：Web 管理界面，连接到 Gateway 进行配置和交互。
- **CLI / TUI**：命令行和终端界面，提供开发者友好的交互方式。
- **Channels**：消息渠道适配层，将助手带到 WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage 等平台。
- **Companion Apps & Nodes**：伴侣应用层，在 macOS、iOS、Android、Windows、Linux 上提供语音、Canvas、摄像头、屏幕和设备本地操作。
- **Extensions**：插件扩展层，通过 Plugin SDK 实现新功能。

这种分层设计实现了 **关注点分离**：Gateway 只负责调度和路由，渠道只负责消息收发，模型只负责推理，工具只负责执行。任何一层都可以独立替换或扩展。

---

## 2. 技术栈与构建系统

OpenClaw 是一个 **TypeScript monorepo**，使用 pnpm workspace 管理：

- **包管理**：pnpm workspace，workspace 根目录定义了 `pnpm-workspace.yaml`，包含 `.`、`ui`、`packages/*`、`extensions/*`、`examples/*` 五个 workspace 组。
- **构建工具**：使用 [tsdown](https://github.com/nicepkg/tsdown)（基于 Rolldown/esbuild 的 TypeScript 打包器），配置文件为 `tsdown.config.ts` 和 `tsdown.ai.config.ts`。构建产物输出到 `dist/` 目录。
- **类型系统**：多套 `tsconfig` 分离关注点 —— `tsconfig.core.json`（Node 端生产代码，lib: ES2023）、`tsconfig.ui.json`（DOM/UI 代码）、`tsconfig.extensions.json`（插件代码）、`tsconfig.scripts.json`（构建脚本）。
- **测试框架**：Vitest 5，配置文件 `vitest.config.ts`。
- **代码质量**：OxLint（`.oxlintrc.json`）、OxFmt（`.oxfmtrc.jsonc`）、Semgrep（`.semgrepignore`）、pre-commit hooks。
- **运行时要求**：Node.js 24.16+ 或 26.1+，不支持 Node 22/23/25（SQLite TEXT 读取截断问题）。Bun 1.4+ 在提供 `node:sqlite` 时也可运行。

构建系统的关键设计是 **分层构建**：AI 包（`packages/ai`）独立构建，避免与主包图并行时产生冲突。插件系统有独立的构建入口，通过 `collectBundledPluginBuildEntries` 等函数动态收集。

---

## 3. 核心源码结构

从 `tsconfig.core.json` 的 `include` 配置可知，核心代码位于 `src/` 和 `packages/` 两个目录：

- **`src/`**：Gateway 核心逻辑，包括会话管理、工具调度、渠道路由、Agent 运行时等。入口为 `src/entry.ts`，编译后为 `dist/index.js`。
- **`packages/`**：可复用的内部包，其中最重要的是 `packages/ai`，提供统一的模型抽象层。
- **`extensions/`**：渠道和功能插件，每个插件是独立的 workspace 包。
- **`ui/`**：Control UI 前端代码。
- **`apps/`**：伴侣应用（macOS、iOS、Android）。
- **`skills/`**：内置技能定义。
- **`scripts/`**：构建和运维脚本，包含大量 `lib/` 工具函数。
- **`config/`**：配置模板和默认值。

从 `tsdown.config.ts` 可以看出，构建系统收集了大量入口点，包括 bundled plugins、channel config、plugin SDK、runtime process 等，说明系统规模相当庞大。

---

## 4. 模型抽象层（packages/ai）

`packages/ai` 是 OpenClaw 的模型抽象核心，从 `tsdown.ai.config.ts` 可以看到其入口点设计：

- **`index.ts`**：主入口，导出统一 API
- **`providers.ts`**：模型提供商注册与管理
- **`transports.ts`**：传输层抽象（HTTP/WebSocket/SSE）
- **`types.ts` / `provider-types.ts`**：类型定义
- **`validation.ts`**：输入输出验证
- **`event-stream.ts`**：流式事件处理
- **`diagnostics.ts`**：诊断工具

内部实现按提供商分离：
- `internal/anthropic.ts`：Anthropic Claude 适配
- `internal/openai.ts`：OpenAI 适配
- `internal/google-model-family.ts`：Google Gemini 适配
- `internal/retry-after.ts`：重试策略
- `internal/tool-schema.ts`：工具 Schema 转换
- `internal/runtime.ts`：运行时抽象

外部依赖明确声明为 `@anthropic-ai/sdk`、`@google/genai`、`@mistralai/mistralai`、`openai`、`typebox`，采用 ESM 格式输出，平台为 Node。

这种设计使得添加新模型提供商只需实现内部适配器，而上层 API 保持不变。

---

## 5. 插件与扩展体系

OpenClaw 的插件体系是其可扩展性的核心：

- **Plugin SDK**：从 `package.json` 的 `dist/plugin-sdk/` 排除列表可以看到大量 SDK 类型定义，包括 `agent-core`、`channel-*`、`browser-cdp`、`cli-*`、`codex-*` 等模块，说明插件可以访问几乎所有系统能力。
- **Bundled Plugins**：内置在 `extensions/` 目录，通过 `collectBundledPluginBuildEntries` 动态发现和构建。Docker 构建时可通过 `OPENCLAW_EXTENSIONS` 参数选择性包含。
- **ClawHub**：插件市场（clawhub.ai），社区贡献的插件通过此平台分发。
- **Custodian Skills**：`custodian-skills/` 目录包含系统维护技能。

插件构建有独立的声明文件收集机制（`collectPluginDeclarationSourceEntries`）和库存模块引用（`plugin-inventory-module-refs`），确保类型安全和依赖正确。

---

## 6. 安全模型

OpenClaw 的安全模型基于 **可信网关、不可信执行** 原则：

- **本地优先**：Gateway 运行在本地，不向项目发送遥测数据或跟踪标识符。
- **入站消息不可信**：所有入站消息被视为不可信输入。DM 渠道默认需要配对（pairing）机制。
- **工具沙箱**：工具默认在主机上运行，可配置沙箱隔离（Docker 容器）。
- **共享代理边界**：任何能操作代理的人都可以让代理执行其能力范围内的任何操作。会话归属和可见性是可用性功能，不是安全边界。
- **配置加密**：Auth profile 使用独立的密钥材料目录（`OPENCLAW_AUTH_PROFILE_SECRET_DIR`）。
- **容器安全**：Docker 部署时 drop `NET_RAW`/`NET_ADMIN` capabilities，启用 `no-new-privileges`。
- **安全披露**：通过 GitHub Security Advisory 私密报告，维护者包括 NVIDIA 和腾讯的安全研究人员。

从 `.env.example` 可以看到，Gateway Token 由 `openssl rand -hex 32` 生成，系统会拒绝使用文档中的示例占位符值。

---

## 7. 部署架构

OpenClaw 支持多种部署方式：

- **本地安装**：macOS/Linux 通过 curl 安装脚本，Windows 通过 PowerShell。安装器自动配置 Node.js 运行时。
- **npm 全局安装**：`npm install -g openclaw@latest --allow-scripts=openclaw`。
- **Docker**：多阶段构建，workspace-deps 阶段提取 `package.json` 优化缓存，运行时使用 `bookworm-slim` 精简镜像。`docker-compose.yml` 定义了 `openclaw-gateway` 和 `openclaw-cli` 两个服务，共享网络命名空间。
- **Fly.io**：`fly.toml` 配置了 `shared-cpu-2x` / 2048MB VM，主区域 `iad`，持久化存储挂载到 `/data`。
- **Render**：`render.yaml` 提供 Render 平台部署配置。

Docker 部署的关键设计：
- 环境变量显式覆盖容器内路径，防止宿主机路径泄漏（#77436 修复）
- Gateway 端口 18789、Bridge 端口 18790、MS Teams 端口 3978
- 健康检查通过 `dist/docker-healthcheck.js`
- 支持 OpenTelemetry 导出（OTLP HTTP/protobuf）

---

## 8. 开发者工作流与治理

OpenClaw 的开发者治理非常严格：

- **PR 限制**：每位作者最多 20 个 open PR，超出自动关闭。
- **代码审查**：`CODEOWNERS` 路由审查者，但不强制批准。维护/重构/测试 PR 不需要单独的 owner 批准，除非路径有显式的安全所有权。
- **贡献规则**：一个 PR = 一个 issue/主题；超过 5000 行变更的 PR 只在特殊情况下审查；不接受纯重构 PR。
- **现有方案前置检查**：提出任何自定义方案前，必须先检查是否有现有 OSS 项目、维护中的库、现有插件或免费平台已经解决了该问题。
- **Codex 硬门**：任何涉及 Codex 的裁决，必须亲自检查 `../codex` 源码，子代理报告、PR 文本、包装器等均不满足要求。
- **Live-verify 默认**：面向用户的行为必须通过真实流程进行上线前测试。
- **依赖冷却**：`pnpm-workspace.yaml` 中的 `minimumReleaseAge: 10080`（7 天）防止使用刚发布的新依赖。

`AGENTS.md` 中的 "Telegraph style" 规则体现了其对 AI 辅助开发的态度：欢迎 AI 辅助 PR，但要求严格的验证标准。

---

## 9. 配置与状态管理

OpenClaw 的配置系统设计精密：

- **配置文件**：`openclaw.json` 为主配置文件，支持 `$include` 指令从其他文件引入配置片段，可配置额外的 include 根目录。
- **环境变量优先级**：process env > `./.env` > `~/.openclaw/.env` > `openclaw.json` 的 `env` 块。已有的非空进程环境变量不会被 dotenv 覆盖。
- **状态目录**：`OPENCLAW_STATE_DIR`（默认 `~/.openclaw`）存储运行时状态、配置和工作区。
- **Schema 版本管理**：`package.json` 中声明 `schemaVersions.state: 15` 和 `schemaVersions.agent: 19`，说明状态和 Agent 配置有严格的版本化 Schema。
- **Doctor 迁移**：当配置变更使现有用户配置无效时，`openclaw doctor --fix` 能检测旧格式、解释问题、备份并重写为规范格式。核心配置由核心 doctor 代码修复，插件配置由插件的 doctor 契约修复。
- **配置兼容性**：不保留长期别名或兼容分支，只接受当前 Schema。

---

## 10. 社区与生态定位

OpenClaw 由 **OpenClaw Foundation**（非营利组织）开发，创始人 Peter Steinberger。项目从个人学习 AI 的实验演变而来，经历了 Warelay → Clawdbot → Moltbot → OpenClaw 的名称演变。

- **吉祥物**：Molty，一只太空龙虾 🦞
- **社区平台**：Discord（discord.gg/clawd）、X/Twitter（@openclaw）
- **生态组件**：ClawHub（插件市场）、team.openclaw.ai（团队部署实例）
- **贡献者**：称为 "clawtributors"
- **安全团队**：包括 NVIDIA 和腾讯的工程师和安全研究人员

项目愿景清晰：做一个**真正能做事的 AI**，运行在用户设备上，在用户已有的渠道中触达，尊重隐私和安全。当前优先级是安全与稳定默认值、Bug 修复、首次运行 UX，下一步是支持所有主流模型提供商、改进消息渠道支持、性能和测试基础设施、computer-use 和 agent harness 能力。

---

## 总结

OpenClaw 是一个架构成熟、治理严格的开源 AI 助手平台。其核心设计决策——Gateway 中心化、本地优先、可信网关/不可信执行——使其既能作为个人助手又能作为团队协作平台。TypeScript monorepo + pnpm workspace + tsdown 的构建体系支撑了庞大的代码库（88,688 commits）。插件 SDK 和 ClawHub 生态使其具备强大的可扩展性。严格的安全模型和开发者治理（PR 限制、依赖冷却、live-verify 默认）体现了生产级项目的成熟度。对于 OpenMate 而言，OpenClaw 的 Gateway 架构、多渠道适配层、模型抽象层和插件体系都提供了有价值的参考。
