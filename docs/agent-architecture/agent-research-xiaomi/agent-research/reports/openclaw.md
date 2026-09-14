# OpenClaw 架构深度研究报告

> 仓库: https://github.com/openclaw/openclaw  
> 版本快照: v2026.9.4 / main branch  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate（混合编码 + 个人助手）重构提供稳定性/HA/自我进化借鉴

---

## 1. 系统架构

### 1.1 模块总览

OpenClaw 是一个 TypeScript monorepo（pnpm workspace），核心理念是 **trusted gateway + untrusted execution + deterministic policy**。

```
┌─────────────────────────────────────────────────────────────┐
│                    Gateway (唯一长驻进程)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │ WS Server │ │ HTTP     │ │ Cron     │ │ Plugin Registry  ││
│  │ :18789   │ │ /canvas  │ │ Scheduler│ │ (capability reg) ││
│  └────┬─────┘ └──────────┘ └──────────┘ └────────┬─────────┘│
│       │                                           │          │
│  ┌────▼──────────────────────────────────────────▼────────┐ │
│  │              Session Manager + SQLite Store             │ │
│  │  (state/openclaw.sqlite, agents/<id>/openclaw-agent.sqlite)│
│  └────┬──────────────────────────────────────────┬────────┘ │
│       │                                           │          │
│  ┌────▼────────────┐  ┌──────────────┐  ┌────────▼────────┐ │
│  │ Agent Loop      │  │ Tool Policy  │  │ Channel Adapters │ │
│  │ (embedded-agent │  │ + Exec       │  │ (WhatsApp/TG/    │ │
│  │  -runner)       │  │   Approvals  │  │  Slack/Discord/  │ │
│  │                 │  │ + Sandbox    │  │  Signal/iMessage)│ │
│  └────┬────────────┘  └──────────────┘  └─────────────────┘ │
│       │                                                     │
│  ┌────▼────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ LLM Transport   │  │ Memory Core  │  │ Skills Loader    │ │
│  │ (src/llm/)      │  │ + Dreaming   │  │ + Workshop       │ │
│  └─────────────────┘  └──────────────┘  └─────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket (role: node)
              ┌────────────▼────────────┐
              │  Nodes (macOS/iOS/      │
              │  Android/headless)      │
              │  camera/screen/location │
              └─────────────────────────┘
```

### 1.2 源码布局

| 路径 | 职责 |
|------|------|
| `src/agents/embedded-agent-runner/` | 内置 agent 循环 (`run.ts`, `run/`)、模型选择、provider 归一化、compaction、transcript 写入 |
| `src/agents/sessions/` | 会话持久化 (`session-manager.ts`)、资源加载、prompt 模板、skills、TUI 工具渲染 |
| `src/agents/agent-tools*.ts` | 内置工具定义、参数 schema、工具策略、before/after tool-call 适配器 |
| `src/agents/agent-hooks/` | 内置运行时 hooks：compaction safeguard、context pruning |
| `src/agents/harness/` | Harness 注册表、选择策略、生命周期 |
| `src/llm/` | 模型/provider 注册表、transport、流式实现 (`src/llm/providers/`) |
| `packages/agent-core/` | 可复用 agent 核心 (`@openclaw/agent-core`)：循环、harness 类型、消息、compaction、skills、session storage |
| `src/agents/runtime/` | 将 `@openclaw/agent-core` 接到 plugin SDK LLM runtime 的 facade |

### 1.3 进程模型

- **单 Gateway 进程** per host，是唯一打开 WhatsApp/Baileys session 的地方
- Clients (macOS app / CLI / Web UI / TUI) 通过 WebSocket 连接 Gateway (`127.0.0.1:18789`)
- Nodes 也走同一个 WS server，但声明 `role: node`，暴露 `camera.*`、`screen.record`、`location.get` 等命令
- Supervision: launchd/systemd 自动重启
- 状态目录锁防止多个 Gateway 或 `openclaw agent --local` 进程同时拥有同一状态目录

### 1.4 LLM 调用链

```
Channel Inbound → Session Router → Command Queue (lane-aware FIFO)
  → Agent Loop (runEmbeddedAgent)
    → resolve model + auth profile
    → build system prompt (三层: buildAgentSystemPrompt → resolveAgentSystemPromptConfig → runtime adapters)
    → context engine assemble()
    → LLM provider stream (src/llm/providers/*)
    → tool execution loop (sandbox or host)
    → streaming events (assistant/tool/lifecycle)
    → transcript commit (SQLite, writer-claim fenced)
    → reply shaping → channel outbound
```

关键设计：
- **Agent Runtime 与 Provider 分离**：Provider 是认证/模型发现层（anthropic/openai），Agent Runtime 是执行循环层（openclaw 内置 / codex app-server / copilot SDK / claude-cli）
- Runtime 选择策略：model-scoped > provider-scoped > auto > openclaw fallback
- Codex app-server 可作为嵌入式 harness，OpenClaw 保留 channels/sessions/policy/state 所有权

---

## 2. Agent Loop / 工具系统 / 技能系统

### 2.1 Agent Loop

核心流程（`docs/concepts/agent-loop.md`）：

1. `agent` RPC 验证参数 → 解析 session → 持久化元数据 → 立即返回 `{ runId, acceptedAt }`
2. `agentCommand` 执行 turn：解析模型/thinking/verbose/trace 默认值 → 加载 skills snapshot → 调用 `runEmbeddedAgent`
3. `runEmbeddedAgent`：通过 per-session 和 global 队列序列化运行 → 解析模型+auth → 构建 OpenClaw session → 订阅 runtime events → 流式传输 delta → 强制运行超时
4. `subscribeEmbeddedAgentSession` 将 runtime events 桥接到 `agent` stream（tool/assistant/lifecycle）
5. `agent.wait` 等待 lifecycle end/error

**并发控制**：
- Runs 按 session key 序列化（session lane），可选通过 global lane
- 前 streaming 时记录 durable `activeWriterRunId` claim；每个 transcript append 提供 `expectedWriterRunId`，同步 commit 事务验证匹配
- SQLite writer queue 排序 per-agent mutations

**队列模式**（`docs/concepts/queue.md`）：
- `steer`（默认）：注入消息到活跃 runtime
- `followup`：排队等当前 run 结束
- `collect`：合并排队消息为单个 followup turn
- `interrupt`：中止活跃 run，运行最新消息
- Lane 系统：`main` (min(16, max(8, CPU)))、`subagent` (8)、`cron`、`cron-nested`、`nested`

**超时体系**：
| 超时 | 默认 | 说明 |
|------|------|------|
| `agent.wait` | 30s | 仅等待，不取消底层 run |
| Agent runtime | 172800s (48h) | 执行预算，到期 abort |
| Model idle (cloud) | 120s | 无响应 chunk 时 abort |
| Model idle (self-hosted) | 300s | |
| Provider HTTP | `timeoutSeconds` | 覆盖 connect/headers/body/SDK/stream idle |

### 2.2 工具系统

工具策略在 model call 之前执行：如果策略移除了工具，模型不会收到该工具的 schema。

**内置工具分类**（`docs/tools/index.md`）：

| 类别 | 代表工具 |
|------|---------|
| Runtime | `exec`, `process`, `terminal`, `code_execution` |
| Files | `read`, `write`, `edit`, `apply_patch` |
| Human input | `ask_user`, `secrets` |
| Web | `web_search`, `x_search`, `web_fetch` |
| Browser | `browser` |
| Messaging | `message` (共享工具，channel plugin 提供 action discovery) |
| Sessions | `sessions_*`, `subagents`, `session_status`, `get_goal`, `create_goal` |
| Automation | `cron`, `heartbeat_respond` |
| Gateway/Nodes | `gateway`, `nodes` |
| Media | `view_image`, `image_generate`, `music_generate`, `video_generate`, `tts` |
| Large catalogs | `tool_search`, `tool_describe`, Code Mode |

**工具策略层次**：
1. Global config (`tools.allow` / `tools.deny`)
2. Per-agent config (`agents.entries.*.tools`)
3. Channel policy
4. Provider restrictions
5. Sandbox rules
6. Plugin availability

**Code Mode / Tool Search**：实验性功能，允许在不向模型发送每个 schema 的情况下发现和调用大量工具目录。

### 2.3 技能系统

Skills 是 markdown 指令文件（`SKILL.md` + YAML frontmatter），教 agent 如何使用工具。

**加载优先级**（高→低）：
1. Workspace skills (`<workspace>/skills`)
2. Project agent skills (`<workspace>/.agents/skills`)
3. Personal agent skills (`~/.agents/skills`)
4. Managed/local skills (`<state-dir>/skills`)
5. Workshop skills (`<state-dir>/agents/<agentId>/agent/workshop-skills`)
6. Bundled skills + Custodian skills
7. Extra dirs + plugin skills

**Gating**：`metadata.openclaw` 中的 `requires.bins/env/config`、`os`、`always` 控制技能可见性。

**Token 影响**：每个 skill ~97 字符 + name/description/location 长度；超过 `skills.limits.maxSkillsPromptChars` 时自动截断。

**Skill Workshop**：Agent 发现可复用工作时，起草 proposal 而非直接写 SKILL.md。CLI: `openclaw skills workshop list/inspect/evaluate/apply`。

---

## 3. 稳定性 / 高可用

### 3.1 错误恢复

**模型请求恢复**（`docs/concepts/retry.md`）：
- Rate limits: 最多 10 次尝试
- 其他瞬态故障: 90 秒窗口内 8 次重试
- 指数退避 + jitter，起始 ~1s
- Provider pacing (`retry-after`, `retry-after-ms`) 设置最小等待
- Recovery 继续现有 transcript，附带指令保留已完成工作
- 订阅耗尽/日/周/月用量窗口直接走 auth-profile 或 model fallback

**通道发送重试**：
- 3 attempts, 10% jitter, min 400ms, max 30s
- Discord Gateway WebSocket: 最多 50 次重连，2s→30s 指数退避

**Compaction 恢复**：
- Auto-compaction 在接近 context limit 或 context-overflow error 时运行
- Overflow error patterns 匹配数十种 provider 特定字符串
- Compaction 失败时保留原始历史，不自动重新开始
- `safeguard` 模式（默认）：更严格的质量审计 + 修正重试

### 3.2 会话管理

**状态存储**：
- Runtime session rows + transcripts: `~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite`
- Archived transcripts: `~/.openclaw/agents/<agentId>/sessions/`
- Gateway state: `~/.openclaw/state/openclaw.sqlite`

**Writer Claim 机制**：
- 每个 admitted run 记录 durable `activeWriterRunId`
- 每个 transcript append/rewrite 提供 `expectedWriterRunId`
- 同步 commit 事务验证匹配，superseded run 不能 commit 陈旧数据

**Session 生命周期**：
- 默认无自动 reset（compaction 管理活跃上下文）
- Daily reset: 配置本地小时（默认 4 AM）
- Idle reset: 配置不活动分钟数
- Manual: `/new` 或 `/reset`

**Gateway 重启恢复**：
- 尝试自动继续被中断的 session
- 3 次失败启动 backend turn 耗尽恢复预算
- Replaying 时保留已记录的 tool calls 和 results
- 自动恢复耗尽后，transcript 仍可用，可用 Resume in new session

**Session Maintenance**：
- `maxEntries`: 5000 未归档 session rows
- `pruneAfter`: 30d 归档
- `archiveDashboardAfter`: 7d
- Pinned sessions 免疫自动维护

### 3.3 隔离

**Sandboxing**（`docs/gateway/sandboxing.md`）：
- 默认关闭；`agents.defaults.sandbox` 控制
- 后端：Docker / Podman / SSH / OpenShell / Crabbox
- Gateway 进程始终在 host；仅 tool execution 移入 sandbox
- Workspace access: `none` / `ro` / `rw`
- 模式: `all` / `non-main` / `off`

**Stuck Session 诊断**：
- 2 分钟阈值分类长 `processing` sessions
- `session.long_running`: 有活跃工作但可能慢
- `session.stalled`: 无近期进展
- `session.stuck`: 可恢复的陈旧 session bookkeeping
- Abort 阈值: 至少 5 分钟且 3x 警告阈值

**Incognito Sessions**：
- 仅进程内存，不写磁盘
- Gateway 重启后消失
- 不运行自动 memory flush

### 3.4 幂等性

- WS API 对副作用方法 (`send`, `agent`) 要求 idempotency keys
- 服务端维护短期 dedupe cache
- Durable outbound queue: producer lease 60s，每 20s 续期
- 事务性 input durability: Control UI 输入在 ack 前写入 SQLite

---

## 4. 自我进化

### 4.1 记忆系统

**四层记忆文件**（`docs/concepts/memory.md`）：
| 文件 | 用途 |
|------|------|
| `USER.md` | 稳定偏好、沟通风格、关系、活跃项目上下文（指令式） |
| `MEMORY.md` | 长期记忆，durable 非 profile 事实和决策 |
| `memory/YYYY-MM-DD.md` | 每日笔记，运行中上下文和观察 |
| `DREAMS.md` | Dream Diary 和 dreaming sweep 摘要 |

**记忆工具**：`memory_search`（混合搜索：向量相似 + 关键词匹配）、`memory_get`、`intent`（事件条件 standing intents）

**Memory Engines**：Builtin (SQLite) / Honcho / LanceDB

### 4.2 Dreaming（背景记忆整合）

三阶段模型（默认开启，cron `0 3 * * *`）：

| 阶段 | 目的 | 持久写入 |
|------|------|---------|
| Light | 排序和暂存近期短期材料 | 无 |
| REM | 反思主题和反复出现的想法 | 无 |
| Deep | 评分和提升 durable 候选 | `MEMORY.md` |

**Deep Ranking 六信号**：
- Relevance (0.30), Frequency (0.24), Query diversity (0.15), Recency (0.15), Consolidation (0.10), Conceptual richness (0.06)

**安全门控**：
- Taint gate: `untrusted`/`system` provenance 的候选被结构性移除
- 阈值门: `minScore`, `minRecallCount`, `minUniqueQueries` 必须全部通过
- Consolidation 安全: 保留先前条目在 `maxPriorEntryLossFraction` (0.25) 内
- Rewrite preimages 存入 SQLite 支持回滚

### 4.3 Skill Workshop + Self-Learning

**Self-Learning**（`docs/tools/self-learning.md`）：
- 默认模式: `auto`
- **Immediate repair**: 前台 agent 发现 skill 错误时，同 turn 内起草 targeted patch
- **Experience review**: 实质性工作后，detached background review 找可复用技术
  - 条件: ≥10 model iterations、非 cron/heartbeat/subagent、30s quiet period
  - Reviewer 使用普通 file tools 在 Workshop 目录内工作
  - `auto` 直接应用，`propose` 暂存待审，`off` 禁用

**Workshop 生命周期**：
```
Agent 发现可复用工作 → 起草 proposal → 安全扫描 → hash 绑定 → 
  auto: 直接应用 / propose: 等待人工审核 → apply → 回滚捕获
```

### 4.4 Memory Flush + Compaction 协同

- Compaction 前自动运行 silent memory flush turn，提醒 agent 保存重要上下文
- Flush 使用私有对话副本，housekeeping 消息不出现于后续 turn
- 可配置独立的 flush model（如本地 ollama）

---

## 5. 权限 / 安全

### 5.1 分层安全模型

```
┌─────────────────────────────────────┐
│ Channel Pairing (DM 默认 pairing)    │
├─────────────────────────────────────┤
│ Gateway Auth (shared-secret/token)   │
├─────────────────────────────────────┤
│ Tool Policy (allow/deny per agent)   │
├─────────────────────────────────────┤
│ Sandbox (Docker/OpenShell/SSH)       │
├─────────────────────────────────────┤
│ Exec Approvals (host command guard)  │
├─────────────────────────────────────┤
│ Elevated Exec (break-glass)          │
└─────────────────────────────────────┘
```

### 5.2 Exec Approvals

**策略 knob**：`tools.exec.mode`
| 值 | 行为 |
|----|------|
| `deny` | 阻止所有 host exec |
| `allowlist` | 仅运行 allowlisted 命令 |
| `ask` | allowlist + miss 时询问 |
| `auto` | 确定性 allowlist 直接运行；miss 时 allow/deny/ask |
| `full` | 无普通策略提示 |

**关键安全特性**：
- Approvals 只能收紧，不能放松 config-derived 安全
- `askFallback: deny`（默认）：无 UI 可达时阻止
- Allowlist per-agent，支持 `pattern` (glob) + `argPattern` (regex)
- Generated `allow-always` 条目绑定精确 argv + working directory
- 可执行文件绑定：resolved real-path identity + content hash for writable executables
- `strictInlineEval`: 识别 `python -c`, `node -e` 等 inline eval 形式

### 5.3 Pairing 和设备信任

- 所有 WS clients 包含 device identity on connect
- 新 device IDs 需要 pairing approval
- 所有 connects 必须签名 `connect.challenge` nonce
- Signature payload v3 绑定 `platform` 和 `deviceFamily`
- Non-local connects 仍需显式批准

### 5.4 SecretRefs

- Protected secret values 使用 handles，不进入模型上下文
- `secrets` tool 教模型 metadata-first discovery
- `openclaw secrets audit --check` 可在 CI 中运行

---

## 6. 对 openmate 重构的 P0/P1/P2 借鉴点

### P0（必须立即实施）

#### 6.1 Writer Claim + 事务性 Transcript 提交
**借鉴**: OpenClaw 的 `activeWriterRunId` + `expectedWriterRunId` 机制  
**文件**: `src/agents/embedded-agent-runner/run.ts`, session-manager  
**实施**:
- 每个 admitted run 记录 durable writer claim
- 每个 transcript append 验证 expectedWriterRunId
- SQLite 事务确保 superseded run 不能 commit 陈旧数据
- 防止 Gateway 重启后数据竞争

#### 6.2 Lane-aware 队列 + Session 序列化
**借鉴**: `docs/concepts/queue.md` 的 lane 系统  
**实施**:
- Per-session lane 保证一次只有一个 agent run 接触给定 session
- Global lane (main) 限制整体并发
- Background lanes (cron/subagent) 隔离后台工作
- 4 种队列模式: steer/followup/collect/interrupt

#### 6.3 分层超时体系
**借鉴**: agent-loop.md 的超时表  
**实施**:
- Agent runtime 超时 (执行预算)
- Model idle 超时 (cloud 120s / self-hosted 300s)
- Provider HTTP 超时
- `agent.wait` 超时 (仅等待，不取消)
- Stuck session 诊断 (long_running / stalled / stuck)

#### 6.4 Schema 版本化 + Migration Guard
**借鉴**: `package.json` 中 `openclaw.schemaVersions: { state: 17, agent: 20 }`  
**实施**:
- 状态 schema 版本化
- `doctor` 命令拥有迁移
- 升级前检查兼容性
- 拒绝在不兼容状态上启动

### P1（近期实施）

#### 6.5 Plugin/Capability 注册模型
**借鉴**: `docs/plugins/architecture.md`  
**文件**: `OpenClawPluginApi`, capability registration  
**实施**:
- 定义 capability contracts（core-owned, typed, small）
- Vendor plugins 注册实现
- Channel/feature plugins 消费共享 contracts
- CI import guards 强制边界
- Plugin shapes: plain-capability / hybrid-capability / hook-only / non-capability

#### 6.6 Tool Policy 在 Model Call 前执行
**借鉴**: 工具策略层次  
**实施**:
- Policy 移除的工具不进入模型 schema
- 多层: global → per-agent → channel → provider → sandbox → plugin
- `tools.allow` / `tools.deny` 语义

#### 6.7 Exec Approvals + Allowlist
**借鉴**: `docs/tools/exec-approvals.md`  
**实施**:
- `tools.exec.mode`: deny/allowlist/ask/auto/full
- Per-agent allowlist: pattern + argPattern
- `askFallback: deny` 默认
- 可执行文件绑定 (real-path + content hash)
- `strictInlineEval` 检测

#### 6.8 Compaction + Memory Flush 协同
**借鉴**: `docs/concepts/compaction.md` + `docs/concepts/memory.md`  
**实施**:
- Auto-compaction 在 context limit 附近触发
- Compaction 前 silent memory flush
- Overflow error pattern matching
- Safeguard 模式: 质量审计 + 修正重试
- Tool call/result 配对保持在 compaction split point

#### 6.9 Context Engine 可插拔
**借鉴**: `docs/concepts/context-engine.md`  
**实施**:
- 4 个生命周期: ingest / assemble / compact / afterTurn
- Legacy engine 默认 (pass-through)
- Plugin engine 可注册
- Failure isolation: 引擎失败时 quarantine 并降级到 legacy
- `ownsCompaction` 控制内置 auto-compaction

### P2（中期规划）

#### 6.10 Dreaming 记忆整合
**借鉴**: `docs/concepts/dreaming.md`  
**实施**:
- Light → REM → Deep 三阶段
- 6 信号加权评分 (relevance/frequency/query-diversity/recency/consolidation/conceptual-richness)
- Taint gate 移除 untrusted/system 候选
- 阈值门: minScore + minRecallCount + minUniqueQueries
- Rewrite preimages 支持回滚
- Dream Diary 供人工审查

#### 6.11 Skill Workshop + Self-Learning
**借鉴**: `docs/tools/self-learning.md`  
**实施**:
- Proposal queue: agent 起草 → 安全扫描 → hash 绑定 → auto/propose/off
- Immediate repair: 同 turn 修复错误 skill
- Experience review: ≥10 iterations + 30s quiet → detached background review
- Workshop ownership: 文件工具限制在 workshop 目录

#### 6.12 Sandbox 多后端
**借鉴**: `docs/gateway/sandboxing.md`  
**实施**:
- Docker / Podman / SSH / OpenShell 后端
- Workspace access: none/ro/rw
- Mode: all/non-main/off
- Per-agent sandbox override
- `openclaw sandbox list/explain/recreate` 调试

#### 6.13 Multi-Channel Adapter 统一模型
**借鉴**: Channel plugin SDK  
**实施**:
- 共享 `message` tool in core
- Channel plugins 提供 action discovery + execution
- `describeMessageTool()` 统一 discovery
- 封闭 action vocabulary (core-owned)
- Inbound envelope → session router → agent loop → outbound pipeline

#### 6.14 Observability
**借鉴**: OpenTelemetry + Prometheus + Audit Ledger  
**实施**:
- OTel export to SIEM
- Prometheus metrics
- Bounded audit ledger: lifecycle + tool start/terminal events, metadata-only
- `openclaw security audit --deep`
- Structured diagnostic states (session.long_running/stalled/stuck)

---

## 7. 评分

| 维度 | 分数 (1-5) | 说明 |
|------|-----------|------|
| **工具策略** | 5 | 多层 allow/deny、per-agent、channel policy、provider restrictions、sandbox rules、Code Mode/Tool Search 大目录支持。策略在 model call 前执行，被移除的工具不进 schema。 |
| **权限安全** | 5 | 分层安全模型（pairing → gateway auth → tool policy → sandbox → exec approvals → elevated）。Exec approvals 支持 allowlist+argPattern+文件绑定+strictInlineEval。SecretRefs 隔离凭据。默认 sandbox off 但 hardening 路径完整。 |
| **容错恢复** | 5 | 多层超时、模型请求恢复（rate limit 10次/瞬态8次/90s窗口）、compaction overflow recovery、Gateway 重启恢复、writer claim fencing、session stuck 诊断+自动恢复、durable outbound queue + producer lease。 |
| **上下文工程** | 5 | 三层 system prompt 组装、可插拔 context engine、compaction (safeguard mode)、memory flush、skills snapshot、bootstrap file injection with budget、prompt cache boundary 分离稳定/易变内容、identifier preservation。 |
| **可扩展** | 5 | Plugin capability model (~150 SDK entrypoints)、channel/provider/speech/media/embedding 全部插件化、Agent Runtime 可替换 (codex/copilot/claude-cli)、context engine slot、memory plugin slot、ClawHub registry。 |
| **可观测** | 4 | OpenTelemetry、Prometheus、audit ledger (metadata-only)、session diagnostics (long_running/stalled/stuck)、`/context list`、`/status`、`openclaw doctor`、Control UI System busyness overlay。扣分：events 不 replay，clients 需在 gap 时 refresh。 |
| **生产成熟度** | 5 | 390k+ stars、OpenClaw Foundation (501c3) 管理、NVIDIA NemoClaw 分发、OpenAI/Amazon/Red Hat/GitHub 赞助、647 公开安全 advisories、signed releases、npm provenance、Teams deployment 文档、schema versioned state (state:17, agent:20)。 |

**综合**: 34/35 ≈ 4.9/5

---

## 8. 关键文件路径索引

| 主题 | 路径 |
|------|------|
| Agent Loop | `docs/concepts/agent-loop.md`, `src/agents/embedded-agent-runner/run.ts` |
| 工具系统 | `docs/tools/index.md`, `src/agents/agent-tools*.ts` |
| 技能系统 | `docs/tools/skills.md`, `docs/tools/self-learning.md` |
| 队列 | `docs/concepts/queue.md` |
| Session | `docs/concepts/session.md`, `src/agents/sessions/session-manager.ts` |
| Compaction | `docs/concepts/compaction.md` |
| Context Engine | `docs/concepts/context-engine.md` |
| Memory | `docs/concepts/memory.md`, `docs/concepts/dreaming.md` |
| Sandbox | `docs/gateway/sandboxing.md` |
| Exec Approvals | `docs/tools/exec-approvals.md` |
| Security | `docs/start/why-openclaw.md`, `docs/gateway/security/` |
| Plugin Architecture | `docs/plugins/architecture.md` |
| Agent Runtimes | `docs/concepts/agent-runtimes.md` |
| Retry | `docs/concepts/retry.md` |
| System Prompt | `docs/concepts/system-prompt.md` |
| Gateway Architecture | `docs/concepts/architecture.md` |
| Runtime Architecture | `docs/agent-runtime-architecture.md` |

---

## 9. 核心设计模式总结

1. **Trusted Gateway / Untrusted Execution**: Gateway 持有 credentials/channels/sessions，execution 可移入 sandbox/node/cloud worker
2. **Policy as Code**: 拒绝是结构性的，不是模型被要求遵守的请求；approval paths fail closed
3. **Writer Claim Fencing**: durable claim + expectedWriterRunId 防止 stale transcript commits
4. **Lane-aware Queue**: per-session serialization + global concurrency cap + background isolation
5. **Capability Registration**: core 定义 contracts，plugins 注册实现，channels 消费共享 contracts
6. **Layered Timeout**: runtime budget / model idle / provider HTTP / wait-only，各自独立
7. **Compaction + Memory Flush**: 上下文压缩前自动持久化重要信息
8. **Dreaming**: background memory consolidation with score gates + taint gates + reviewable diary
9. **Skill Workshop**: proposal queue between agent and skill directory, with security scanning
10. **Schema Versioned State**: state schema + agent schema 版本化，doctor 拥有迁移
