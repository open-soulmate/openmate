# OpenAI Codex CLI 架构报告

> 研究对象：https://github.com/openai/codex  
> 定位：OpenAI 官方轻量级终端编码 Agent（Rust 实现）  
> 研究日期：2026-09-13

---

## 1. 元信息

| 项 | 内容 |
|---|---|
| 仓库 | `openai/codex` |
| 语言 | Rust（`codex-rs` monorepo） |
| 许可 | Apache-2.0 |
| 安装 | `npm i -g @openai/codex` / Homebrew / 独立二进制 / curl 脚本 |
| 形态 | 本地终端 CLI + IDE 插件 + 桌面 App + 云端 Codex Web |
| 认证 | ChatGPT 账号登录（Plus/Pro/Business/Edu/Enterprise）或 API Key |
| 贡献政策 | 接受 Issue，**不接受外部代码 PR**（官方把控架构一致性） |
| 派生影响 | Open Interpreter Rust 版即以 Codex 为基座 fork |

### 产品矩阵

```
codex CLI (本地终端)  ──  codex app (桌面)  ──  IDE 插件  ──  Codex Web (云端)
         │
         └── exec 协议 / SDK  ←── 被 OI、第三方客户端复用
```

---

## 2. 架构

### 2.1 总体分层

```
┌─────────────────────────────────────────────┐
│  UI 层：TUI (ratatui) / CLI args / IDE / App │
├─────────────────────────────────────────────┤
│  Orchestrator：Agent Loop / Turn 管理 / 审批 │
├─────────────────────────────────────────────┤
│  Core：Tool 执行 / Sandbox / Session / Prompt │
├─────────────────────────────────────────────┤
│  Protocol：OpenAI Responses / Chat Completions│
├─────────────────────────────────────────────┤
│  OS Sandbox：Seatbelt / Landlock+seccomp / Win│
└─────────────────────────────────────────────┘
```

### 2.2 codex-rs 模块划分（公开结构）

| Crate | 职责 |
|---|---|
| `codex-tui` | 终端交互界面 |
| `codex-cli` | 命令行入口、参数解析 |
| `codex-core` | Agent 循环、工具、会话、审批 |
| `codex-exec` | 非交互 headless 执行 |
| `codex-protocol` | 事件流 / exec 协议 |
| `codex-sandbox` | 平台沙箱封装 |
| `codex-mcp` | MCP 客户端集成 |
| `codex-app-server` | 供 IDE / 桌面 App 连接的本地服务 |

### 2.3 运行模型

- 单一进程 Rust 二进制，启动即建立 session
- 模型通过 **Responses API**（首选）或 Chat Completions 交互
- 工具调用在本地 core 中执行，结果以事件流回写 TUI
- 支持 `codex exec` 无界面模式，输出结构化 JSONL

---

## 3. 核心机制

### 3.1 Agent Loop

```
User Prompt
    │
    ▼
┌──────────────┐
│ System Prompt │ ← 写入仓库 AGENTS.md、cwd、平台信息
└──────┬───────┘
       ▼
┌──────────────┐     tool_call      ┌─────────────┐
│  Model Turn  │ ─────────────────► │ Tool Router │
│  (LLM 推理)  │                    │ shell/file/ │
└──────┬───────┘                    │ apply_patch │
       │ final                      │ MCP tools   │
       ▼                            └──────┬──────┘
   User 看到结果                            │
       ▲                                    │
       │          Tool Observation          │
       └────────────────────────────────────┘
```

关键特征：
- **单会话多 Turn**：一个用户请求可触发多轮工具调用直至模型给出最终答复
- **工具优先**：内置 `shell`、文件读写、`apply_patch`、网络受限命令
- **中断友好**：TUI 可在任意 Turn 中断，已产生的 diff 保留

### 3.2 Sandbox（沙箱）

Codex 的安全核心是 **默认沙箱执行**，按平台分层：

| 平台 | 机制 | 说明 |
|---|---|---|
| macOS | **Seatbelt** (`sandbox-exec`) | profile 控制文件/网络/进程权限 |
| Linux | **Landlock + seccomp** | 文件系统 Landlock，系统调用 seccomp 过滤 |
| Windows | **Windows Sandbox** / AppContainer | 原生隔离；WSL 走 Linux 模型 |

沙箱能力分档（近似）：

| 模式 | 读 | 写 | 网络 | 用途 |
|---|---|---|---|---|
| `read-only` | 仓库内 | 否 | 否 | 审计、阅读 |
| `workspace-write` | 仓库内 | 仓库内 | 默认关 | 日常开发 |
| `danger-full-access` | 全盘 | 全盘 | 是 | 可信环境 |

设计原则：
- **fail-closed**：无法建立所需策略时拒绝执行，而非静默裸跑
- 沙箱与审批是**正交**的两层控制

### 3.3 Approval Modes（审批模式）

审批决定「何时停下来问人」：

| 策略 | 行为 |
|---|---|
| `untrusted` | 任何可能改状态的操作都询问 |
| `on-request` | 沙箱内直接跑；升级权限时询问 |
| `never` | 不询问，仅靠沙箱 |

产品层曾以用户可见档位暴露：

- **suggest**：只建议，不执行命令
- **auto-edit**：自动改文件，跑命令要确认
- **full-auto**：沙箱内自动执行命令与编辑

危险逃生口：`--yolo` / `--dangerously-bypass-approvals-and-sandbox`（应仅在外部 VM/容器中使用）。

### 3.4 Rollout（会话回放 / 事件流）

Codex 将完整会话落盘为 **rollout JSONL**：

```
~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl
```

每行一个事件：

| 事件类型 | 含义 |
|---|---|
| `session_meta` | 会话元数据（cwd、model、版本） |
| `response_item` | 模型消息 / 工具调用 / 工具结果 |
| `event_msg` | 状态、错误、token 统计 |
| `compacted` | 上下文压缩记录 |

价值：
- **可重放**：`codex resume` / 审计回放
- **可调试**：逐事件检查 Agent 决策链
- **可评测**：作为 offline eval 语料
- **可对接**：exec 协议与 SDK 以同一事件模型对外

### 3.5 项目上下文

- 自动读取仓库根 `AGENTS.md`（行业共享指令格式）
- `~/.codex/` 存全局配置、凭证、会话
- 支持 MCP 扩展外部工具

---

## 4. 稳定性

| 维度 | 评估 |
|---|---|
| 实现语言 | Rust：内存安全、低崩溃率、单二进制部署 |
| 沙箱成熟度 | Seatbelt / Landlock 均为 OS 级成熟机制 |
| 会话持久化 | JSONL append-only，崩溃后可恢复到最后一事件 |
| 上下文管理 | 长会话自动 compact，记录于 rollout |
| 发布节奏 | 与 OpenAI 模型同步迭代；独立 installer 双源（releases.openai.com + GitHub） |
| 贡献边界 | 不收外部 PR → 架构一致性高，但社区插件面窄 |
| 失败策略 | 沙箱 fail-closed；工具失败作为 observation 回灌模型自纠 |

**风险点**：
- 深度绑定 OpenAI 模型与 ChatGPT 账号体系
- 不收外部 PR，第三方只能通过 MCP/exec 协议扩展
- Windows 沙箱能力弱于 macOS/Linux

---

## 5. 自我进化

Codex 本身**不是**自我进化 Agent，但具备以下「可进化」接口：

| 机制 | 说明 |
|---|---|
| `AGENTS.md` | 用户可持续沉淀项目约定，下次会话自动注入 |
| Rollout 语料 | 历史会话可反哺 prompt/工具策略评测 |
| MCP | 外部服务器动态注册新工具，无需改核心 |
| exec 协议 | 被 OI 等 fork 复用，形成协议层演进 |
| 模型侧 | 依赖 OpenAI 模型本身的推理升级 |

无内建 Auto-Memory / Skills 提炼；自我进化主要发生在**模型与用户指令文件**两侧。

---

## 6. openmate 借鉴

### 高价值可直接移植

1. **Sandbox × Approval 正交双层**  
   openmate 应把「技术边界（沙箱）」与「人工介入时机（审批）」做成独立配置轴，而非混为一个开关。

2. **Rollout JSONL 事件日志**  
   - 会话可重放、可审计、可评测  
   - openmate 的 Hermes 日志可对齐此事件模型，便于回放调试与数据飞轮

3. **fail-closed 沙箱原则**  
   策略无法落地时拒绝执行，禁止静默降级为无沙箱。

4. **AGENTS.md 作为共享指令协议**  
   采用行业格式而非私有格式，降低迁移成本（OI 也已对齐）。

5. **exec / SDK 协议外置**  
   把 Agent 运行时做成可被 IDE、CI、桌面端复用的服务，而非单体 CLI。

### 建议架构草图（openmate）

```
openmate-core (agent loop + tools + sandbox)
    ├── rollout.jsonl (事件日志)
    ├── approval-policy (untrusted|on-request|never)
    ├── sandbox-mode (read-only|workspace-write|full)
    └── protocol: ACP / MCP / 自有 exec
         ▲
    TUI / IDE / CI / Desktop
```

---

## 7. 关键路径

| 路径 | 说明 |
|---|---|
| `codex-rs/` | Rust 主 monorepo |
| `codex-rs/core/` | Agent 循环、工具、会话核心 |
| `codex-rs/tui/` | 终端 UI |
| `codex-rs/exec/` | headless 执行 |
| `codex-rs/protocol/` | 事件与 exec 协议 |
| `docs/` | 贡献、安装、安全说明 |
| 官方文档 | https://developers.openai.com/codex |

---

## 8. 评分

| 维度 | 分数 (1-10) | 说明 |
|---|---|---|
| 架构清晰度 | 9 | Rust crate 分层干净，UI/Core/Protocol 分离 |
| 沙箱与安全 | 9 | OS 级沙箱 + 正交审批 + fail-closed |
| Agent 循环成熟度 | 8 | 多轮工具、可中断、上下文压缩完善 |
| 可扩展性 | 7 | MCP/exec 可扩展，但不收核心 PR |
| 自我进化 | 5 | 依赖 AGENTS.md + 模型升级，无内建记忆提炼 |
| 文档完整度 | 7 | 安全文档可达；部分开发者文档在独立站点且 403 |
| 对 openmate 参考价值 | **9** | 沙箱/审批/rollout 三件套高度可借鉴 |
| **综合** | **8.0** | 轻量、安全、协议化的标杆终端 Agent |

---

## 9. 一句话总结

> Codex CLI 以 Rust 单二进制实现了「OS 级沙箱 × 正交审批 × JSONL rollout」的轻量终端 Agent 范式，是 openmate 在安全边界与会话可观测性上的首选参照。
