# 43. Moltbot (OpenClaw) 架构深度分析

> **仓库**: [moltbot/moltbot](https://github.com/moltbot/moltbot) (重定向至 openclaw/openclaw)
> **定位**: 个人 AI 助手网关 — 跨平台、多通道、可扩展
> **主语言**: TypeScript (91.5%) | **许可证**: MIT
> **规模**: 377K+ Stars, 370+ 贡献者, 200+ 发布版本
> **最后更新**: 2026-06-08

---

## 1. 项目定位与核心理念

OpenClaw（原 Moltbot）是一个**自托管的个人 AI 助手平台**。其核心理念是"Your own personal AI assistant. Any OS. Any Platform."——用户在自己的设备上运行 Gateway 控制面，通过已有的聊天通道（WhatsApp、Telegram、Slack、Discord、WeChat、Signal 等 20+ 平台）与 AI 交互。

与 ChatGPT/Claude 等 SaaS 产品不同，OpenClaw 强调 **"own your data"**——所有数据、会话、记忆都存储在用户自己的机器上。Gateway 只是控制面，产品本身就是助手体验。

**关键设计决策**：
- 单用户架构（非多租户），优化个人使用场景
- Gateway 作为"always-on"后台守护进程运行
- 支持 macOS/iOS/Android 语音交互 + 实时 Canvas 渲染
- 通过 `openclaw onboard` CLI 引导式安装

---

## 2. 整体架构分层

OpenClaw 采用**高度模块化的 monorepo 架构**，`src/` 目录下有 **80+ 个子模块**，每个模块职责清晰：

```
┌─────────────────────────────────────────────┐
│              CLI Layer (入口)                 │
│  entry.ts → cli/ → commands/ → wizard/       │
├─────────────────────────────────────────────┤
│            Gateway (控制面)                   │
│  gateway/ — HTTP server, auth, sessions,     │
│  agent-turn, health, portals, MCP HTTP       │
├─────────────────────────────────────────────┤
│           Agent Runtime (核心引擎)            │
│  agents/ — harness, command, failover,       │
│  embedded-agent-runner, ACP binding          │
├─────────────────────────────────────────────┤
│          Channel Adapters (通道层)            │
│  channels/ — 20+ 平台适配器                   │
│  routing/ — 消息路由与分发                     │
├─────────────────────────────────────────────┤
│          LLM Provider Layer                  │
│  llm/ — 多模型抽象层                          │
│  provider-runtime/ — provider 生命周期        │
│  model-catalog/ — 模型注册表                  │
│  model-picker/ — 模型选择策略                  │
├─────────────────────────────────────────────┤
│          Context & Memory                    │
│  context-engine/ — 上下文管理引擎              │
│  memory/ + memory-host-sdk/ — 记忆系统        │
│  sessions/ — 会话状态与转录                    │
├─────────────────────────────────────────────┤
│          Extension Layer                     │
│  plugins/ + plugin-sdk/ — 插件系统            │
│  skills/ — 技能/workflow 系统                  │
│  mcp/ — MCP 协议集成                          │
│  hooks/ — 生命周期钩子                         │
├─────────────────────────────────────────────┤
│          Media & Tools                       │
│  image-generation/ video-generation/         │
│  music-generation/ tts/ media-understanding/ │
│  web-search/ web-fetch/ browser-lifecycle/    │
└─────────────────────────────────────────────┘
```

---

## 3. 启动流程与入口机制

入口文件 `src/entry.ts` 是一个精心设计的多阶段启动器：

1. **Compile Cache 优化**：`enableOpenClawCompileCache()` 加速 Node.js ESM 模块解析
2. **ESM Resolve Fast Path**：`installDistEsmResolveFastPath()` 安装快速路径拦截器
3. **进程重生 (Respawn)**：`buildCliRespawnPlan()` + `runCliRespawnPlan()` 支持运行时升级自重启
4. **Profile 系统**：`parseCliProfileArgs()` + `applyCliProfileEnv()` 支持多配置 profile
5. **Container 目标**：`parseCliContainerArgs()` 支持 Docker 容器化部署
6. **版本快速路径**：`tryHandleRootVersionFastPath()` 避免完整模块加载
7. **Help 快速路径**：`tryHandleRootHelpFastPath()` 预计算帮助文本

启动链：`entry.ts → runMainOrRootHelp() → runCli()`，Gateway 通过 `gateway/boot.ts` 的 `runBootOnce()` 执行 BOOT.md 引导检查。

**BOOT.md 机制**：Gateway 启动时在 workspace 目录查找 `BOOT.md`，将其内容作为系统指令发送给 Agent 执行，实现启动时自检、通知等自动化任务。

---

## 4. Agent 运行时架构

`src/agents/` 是整个系统的核心，包含 **200+ 个文件**，实现了完整的 Agent 生命周期管理：

### 4.1 执行模型

Agent 命令通过 `agentCommand()` → `agentCommandInternal()` 执行，支持三种入口：

- **`agentCommand()`**：本地 CLI 入口
- **`agentCommandFromSystem()`**：系统内部调用（BOOT.md、cron 等）
- **`agentCommandFromIngress()`**：通道/gateway 入站调用

### 4.2 会话生命周期

```
prepareAgentCommandExecution()
  → beginSessionWorkAdmission()    // 获取工作许可（防止并发冲突）
    → prepareEmbeddedSessionState()  // 准备会话状态
      → runEmbeddedAgentAttempt()    // 执行 Agent 尝试
        → finalizeEmbeddedAgentCommand()  // 清理与持久化
```

关键机制：
- **Lifecycle Generation**：通过 `captureAgentRunLifecycleGeneration()` 追踪运行代次，防止过期操作
- **Session Work Admission**：基于身份的并发控制，确保同一会话不会被并发修改
- **Restart Recovery**：`resolveCommandRecoveryOptions()` + `buildCurrentRunRestartRecoveryClaim()` 实现崩溃恢复
- **Compaction Rotation**：会话压缩轮转，防止上下文窗口溢出

### 4.3 子 Agent 与 ACP

`src/agents/command/acp-execution.ts` 实现了 ACP（Agent Communication Protocol）子 Agent 执行：
- `runAcpAgentCommand()` 调度 ACP Agent
- 支持嵌套 Agent（subagent lane）
- `AGENT_LANE_SUBAGENT` 标识子 Agent 通道

### 4.4 MCP 集成

`src/agents/` 中有大量 `agent-bundle-mcp-*` 文件，实现了完整的 MCP（Model Context Protocol）集成：
- **Manager 生命周期**：`agent-bundle-mcp-manager-lifecycle.ts`
- **运行时配置**：`agent-bundle-mcp-runtime-config.ts`
- **工具物化**：`agent-bundle-mcp-tools.ts`
- **请求上下文**：`agent-bundle-mcp-request-context.ts`

---

## 5. Gateway 网关架构

`src/gateway/` 是 HTTP/WebSocket 网关层，包含 **400+ 个文件**：

### 5.1 核心职责

- **认证与授权**：`auth.ts`, `auth-token-resolution.ts`, `auth-mode-policy.ts`
- **会话管理**：`chat-*.ts` 系列文件处理聊天生命周期
- **Agent 调度**：`agent-command-policy.ts`, `agent-list.ts`, `agent-prompt.ts`
- **通道健康监控**：`channel-health-monitor.ts`, `channel-health-policy.ts`
- **审批流**：`approval-channel-custody.ts`, `approval-web-push.ts`
- **Board 系统**：`board-host-tools.ts`, `board-http.ts`, `board-sandbox.ts`

### 5.2 桌面集成

`src/gateway/desktop/` 提供桌面端集成能力，支持原生窗口、通知、系统托盘等。

### 5.3 MCP HTTP

`src/gateway/mcp-http/` 暴露 MCP 协议的 HTTP 端点，允许外部工具通过标准 MCP 协议与 Gateway 交互。

---

## 6. 通道适配器系统

OpenClaw 支持 **20+ 聊天平台**，每个平台通过 `src/channels/` 下的适配器模块接入：

| 类别 | 平台 |
|------|------|
| 即时通讯 | WhatsApp, Telegram, Signal, WeChat, QQ, LINE, Zalo |
| 企业协作 | Slack, Discord, Microsoft Teams, Google Chat, Feishu, Mattermost |
| 开放协议 | Matrix, Nostr, IRC, Nextcloud Talk, Synology Chat |
| 原生平台 | iMessage (macOS), WebChat |

通道适配器通过 `src/routing/` 的消息路由层统一调度，支持：
- 消息格式转换（Markdown ↔ 平台原生格式）
- 媒体附件处理（图片、语音、视频）
- 群组/DM 区分与 mention 过滤
- 多账户支持

---

## 7. LLM Provider 抽象层

`src/llm/` + `src/provider-runtime/` + `src/model-catalog/` + `src/model-picker/` 构成了多模型抽象层：

### 7.1 Provider 架构

- **Provider Entry**：`provider-entry.ts` 定义 provider 接口
- **Provider Stream**：`provider-stream.ts` 实现流式响应
- **Provider Auth**：支持 API Key 和 OAuth 两种认证模式
- **Provider Transport**：HTTP 传输层，含重试、超时、SSRF 防护

### 7.2 模型选择

- **Model Catalog**：注册表式模型管理
- **Model Picker**：根据任务类型、成本、延迟自动选择最优模型
- **Claude Model Runtime**：`claude-model-runtime.ts` 专门优化 Claude 系列
- **Live Model Switch**：运行时热切换模型，无需重启

### 7.3 支持的 Provider

从 `package.json` 的 exports 可见，支持 OpenAI、Anthropic、Google、xAI、Mistral、MiniMax 等主流 provider，以及通过 `provider-browser-auth` 的浏览器认证方式。

---

## 8. 插件与技能系统

### 8.1 插件 SDK

`src/plugin-sdk/` 暴露了 **200+ 个类型安全的 API 模块**，涵盖：
- 通道配置与目标解析
- 会话绑定与目录管理
- 媒体生成（图片、视频、音乐）
- Provider 工具与认证
- 审批流与安全策略

插件通过 `src/plugins/` 的运行时管理，支持：
- 动态加载/卸载
- 生成代次作用域（`withPluginRuntimeGenerationScope`）
- 状态持久化（`plugin-state-runtime.ts`）

### 8.2 技能系统

`src/skills/` 实现技能/workflow 系统，允许用户定义可复用的任务流程。技能通过 `src/flows/` 的流编排引擎执行。

### 8.3 Hooks 系统

`src/hooks/` 提供生命周期钩子，支持在 Agent 执行的各个阶段注入自定义逻辑。Gateway 层的 `hooks-mapping.ts` 将钩子映射到具体的执行边界。

---

## 9. 记忆与上下文引擎

### 9.1 Context Engine

`src/context-engine/` 是上下文管理引擎，负责：
- 上下文窗口压缩（防止 token 溢出）
- 上下文可见性控制（`context-visibility-runtime.ts`）
- 轨迹管理（`src/trajectory/`）

### 9.2 Memory System

`src/memory/` + `src/memory-host-sdk/` 构成分层记忆系统：
- **Session Memory**：会话内短期记忆
- **Host Memory**：跨会话持久记忆，通过 `memory-host-sdk` 提供宿主接口
- **Embedding**：向量嵌入支持语义搜索
- **Session Cards**：`src/session-cards/` 会话摘要卡片

### 9.3 Session Transcripts

`src/sessions/` 管理会话转录：
- 完整对话历史持久化
- 基于 SQLite 的存储（`sqlite-runtime.ts`）
- 转录搜索与回放

---

## 10. 基础设施与运维

### 10.1 安全体系

- **Secrets 管理**：`src/secrets/` 独立的密钥管理系统
- **SSRF 防护**：`ssrf-dispatcher.ts`, `ssrf-runtime-internal.ts`
- **审计日志**：`src/audit/` 记录所有敏感操作
- **沙箱**：`sandbox.ts` 隔离执行环境
- **速率限制**：`auth-rate-limit.ts`

### 10.2 可观测性

- **子系统日志**：`createSubsystemLogger()` 统一日志框架
- **启动追踪**：`gatewayEntryStartupTrace` 启动性能追踪
- **健康检查**：`src/gateway/health/` HTTP 健康端点
- **通道健康监控**：`channel-health-monitor.ts` 实时监控通道状态

### 10.3 部署模式

- **本地 CLI**：`openclaw onboard` 引导安装
- **Docker**：`src/docker-healthcheck.ts`, `src/docker-setup.e2e.test.ts`
- **Nix**：独立的 `nix-openclaw` 仓库
- **Windows Hub**：原生 Windows 桌面应用
- **Node Host**：`src/node-host/` 远程节点托管

### 10.4 定时任务

`src/cron/` 实现 cron 引擎，支持定时执行 Agent 任务、健康检查、自动维护等。与 BOOT.md 机制配合，实现完整的自动化运维。

---

## 总结

OpenClaw/Moltbot 是一个**工程化程度极高**的个人 AI 助手平台，其架构特点：

| 维度 | 特征 |
|------|------|
| 规模 | 80+ 子模块，400+ gateway 文件，200+ agent 文件 |
| 通道覆盖 | 20+ 聊天平台，统一适配器模式 |
| 模型抽象 | 多 provider、运行时热切换、自动模型选择 |
| 扩展性 | 插件 SDK（200+ API）+ 技能系统 + Hooks |
| 安全性 | SSRF 防护、沙箱、审计日志、速率限制 |
| 可靠性 | 崩溃恢复、会话压缩轮转、通道健康监控 |
| 部署灵活性 | CLI/Docker/Nix/Windows/远程节点 |

对于 OpenMate 的参考价值：OpenClaw 的**通道适配器模式**、**Agent 生命周期管理**、**插件 SDK 设计**、以及**记忆分层架构**都值得深入学习。
