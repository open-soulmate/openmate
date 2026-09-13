# 24. Open Interpreter 架构深度分析

> **项目地址**: https://github.com/OpenInterpreter/open-interpreter
> **当前版本**: Rust 重写版（基于 OpenAI Codex 分叉）
> **许可证**: Apache-2.0
> **分析日期**: 2026-09-13

## 一、项目演进概述

Open Interpreter 经历了一次根本性的架构跃迁。最初以 Python 实现的 "自然语言 → 代码执行" 概念起家，允许用户用自然语言控制计算机。当前版本已完全用 **Rust 重写**，基于 OpenAI 的 Codex 项目分叉而来，定位从"通用代码解释器"转变为"面向低成本模型优化的编码 Agent"。原 Python 版本已由社区维护为独立 fork（`endolith/open-interpreter`）。

这一转型意味着 Open Interpreter 不再是一个轻量级 Python 包，而是一个**系统级 Rust 应用**，拥有完整的 TUI（终端用户界面）、沙箱执行引擎、多模型 Harness 模拟系统和 ACP 协议支持。

## 二、整体架构：Crate 分层结构

项目核心位于 `codex-rs/` 目录，采用 Rust workspace 组织，主要 crate 包括：

| Crate | 职责 |
|-------|------|
| `codex-core` | 核心引擎：Agent 控制、会话管理、执行策略、沙箱、MCP、Harness |
| `codex-cli` | CLI 入口：登录、命令解析、子命令分发 |
| `codex-tui` | 终端界面：Ratatui TUI、Markdown 渲染、交互式审批 |
| `codex-protocol` | 协议定义：事件、消息、配置类型、权限模型 |
| `codex-sandboxing` | 沙箱实现：macOS Seatbelt、Linux Landlock/bwrap、Windows Restricted Token |
| `codex-exec-server` | 执行服务器：子进程管理、文件系统隔离 |
| `codex-mcp` | MCP（Model Context Protocol）运行时 |
| `codex-login` | 认证管理：OAuth、设备码、API Key |
| `codex-config` | 配置系统：TOML 分层加载、Profile 管理 |
| `codex-network-proxy` | 网络代理：域名级网络策略 |

这种分层设计实现了**关注点分离**——核心引擎不依赖任何 UI，TUI 只通过协议与核心通信。

## 三、Harness 模拟系统（核心创新）

这是 Open Interpreter 最独特的架构特征。`codex-rs/core/src/harness/` 目录包含多个 harness 实现：

```
harness/
├── claude_code.rs        # Claude Code 风格
├── kimi_code.rs          # Kimi K3 专用（Rust 重写）
├── kimi_cli.rs           # Kimi CLI 风格
├── deepseek_tui.rs       # DeepSeek TUI 风格
├── qwen_code.rs          # 通义千问编码风格
├── zcode.rs              # Z.AI/GLM 风格
├── swe_agent.rs          # SWE-Agent 风格
├── minimal.rs            # 最小化 harness
├── opencode.rs           # OpenCode 风格
├── guidance.rs           # 引导式
├── little_coder.rs       # 轻量编码器
├── pi.rs                 # Pi 风格
├── terminus_2.rs         # Terminus 风格
├── mini_swe_agent.rs     # 轻量 SWE-Agent
├── routing.rs            # 路由逻辑
├── request.rs            # 请求构建
└── session_skills.rs     # 会话技能
```

**设计哲学**：不同 LLM 提供商的最佳性能来自不同的 system prompt 格式、工具调用约定和上下文管理策略。Harness 系统通过**模拟各提供商推荐的 agent 框架**，让同一个代码库能在所有模型上获得最优表现。用户通过 `/harness` 命令切换。

## 四、Agent 与会话管理

`codex-rs/core/src/agent/` 模块负责 Agent 生命周期：

- **`agent_resolver.rs`**：Agent 角色解析，决定使用哪个 Agent 配置
- **`control.rs`**：`AgentControl` 结构，管理 Agent 运行状态
- **`registry.rs`**：Agent 注册表，管理嵌套 Agent 生成深度（默认最大深度 1，最大线程 6）
- **`role.rs`**：Agent 角色定义
- **`status.rs`**：Agent 状态跟踪

`CodexThread` 是会话的核心抽象，封装了：
- 双向消息流（提交 Op、接收 Event）
- 会话配置快照（模型、审批策略、沙箱策略、权限 Profile）
- 线程生命周期钩子（ready、resume、idle）
- MCP 工具调用能力
- Rollout 持久化（会话历史序列化）

关键的 `start_or_steer_turn()` 方法实现了智能的输入路由——如果线程空闲则启动新 turn，如果正在执行则转向（steer）当前 turn。

## 五、执行引擎与沙箱

执行引擎（`exec.rs` + `sandboxing/`）是安全性的核心：

**执行流程**：
1. `ExecParams` 描述命令、工作目录、环境变量、网络策略
2. `select_process_exec_tool_sandbox_type()` 根据权限 Profile 选择沙箱类型
3. `SandboxManager` 将命令转换为沙箱化的执行请求
4. `execute_exec_request()` 异步执行，支持 stdout/stderr 流式输出

**沙箱类型**（跨平台）：
- **macOS**: Seatbelt（`sandbox-exec`）
- **Linux**: Landlock + bwrap（Bubblewrap）
- **Windows**: Restricted Token + 私有桌面

**执行超时与取消**：
- `ExecExpiration` 支持超时、取消令牌、或两者组合
- 默认命令超时 10 秒（`DEFAULT_EXEC_COMMAND_TIMEOUT_MS`）
- 输出硬上限防止 OOM（`EXEC_OUTPUT_MAX_BYTES`）
- 子进程组管理，确保超时后正确清理所有子孙进程

**网络代理**：
- `NetworkProxy` 实现域名级网络策略
- 每个环境可独立配置网络代理
- 策略决定哪些域名可访问

## 六、配置系统

配置系统（`config/mod.rs`）极其复杂，反映了产品的丰富功能：

**分层加载**：
- 系统级配置 → 用户级 `~/.openinterpreter/config.toml` → 项目级配置 → CLI 覆盖
- `ConfigLayerStack` 管理配置层的合并优先级

**核心配置项**：
- 模型与提供商选择
- 审批策略（`AskForApproval`）
- 权限 Profile（只读、工作区、完全访问）
- 沙箱模式（SandboxMode）
- MCP 服务器配置
- 特性开关（Features）
- Token 预算管理
- 多 Agent 配置（最大并发线程、超时等）

**Profile V2 系统**：支持命名配置 Profile，每个 Profile 可有独立的配置文件（`<name>.config.toml`）。

## 七、TUI 终端界面

TUI（`codex-rs/tui/`）是用户直接交互的界面，基于 Ratatui 构建，模块超过 100 个：

**核心模块**：
- `app.rs`：主应用循环
- `chatwidget.rs`：聊天界面组件
- `composer_input.rs`：输入组件
- `markdown_render.rs`：Markdown 实时渲染
- `diff_render.rs`：代码差异渲染
- `exec_cell.rs`：执行结果展示
- `approval_events.rs`：审批交互
- `streaming.rs`：流式输出处理

**高级功能**：
- 多 Agent 协作界面（`collaboration_modes.rs`、`multi_agents.rs`）
- 会话恢复与归档（`session_resume.rs`、`session_archive_commands.rs`）
- 文件搜索（`file_search.rs`）
- Vim 搜索模式（`vim_search.rs`）
- 剪贴板集成（`clipboard_copy.rs`、`clipboard_paste.rs`）
- 宠物动画（`pets.rs`）
- 主题选择（`theme_picker.rs`）
- 团队协作（`branch_summary.rs`、`goal_display.rs`）

## 八、协议与互操作性

Open Interpreter 实现了多个标准协议：

**ACP（Agent Client Protocol）**：
- 通过 `interpreter acp` 命令启动 ACP 兼容模式
- 可被任何 ACP 兼容编辑器调用
- 标准化的 Agent-客户端通信

**Codex Exec Protocol**：
- 完全兼容 OpenAI Codex SDK
- 一行代码替换：`new Codex({ codexPathOverride: "interpreter" })`
- 事件驱动的消息模型（`Event`、`EventMsg`、`Op`）

**MCP（Model Context Protocol）**：
- `McpManager` 管理 MCP 服务器连接
- 工具发现、调用、资源读取
- 支持 MCP 技能依赖管理

**AGENTS.md 兼容**：
- 读取项目级 `AGENTS.md` 作为 Agent 指令
- 共享 `.agents/skills` 目录
- 可移植性优先设计

## 九、可移植性与生态集成

Open Interpreter 明确以**可移植性**为核心设计目标：

- **共享标准**：优先使用 AGENTS.md、`.agents/skills`、MCP、ACP 等开放标准
- **最小锁定**：产品特有存储仅限 `~/.openinterpreter` 中的配置和运行时状态
- **技能目录**：新技能写入 `.agents/skills` 或 `~/.agents/skills`，旧目录仅兼容读取
- **计算机使用**：内置 QA 技能，支持通过 `agent-browser` 操作 Web 应用，通过 `trycua` 操作原生应用

## 十、与同类项目的架构对比

| 维度 | Open Interpreter (Rust) | Claude Code | Cursor Agent | Aider |
|------|------------------------|-------------|--------------|-------|
| 语言 | Rust | TypeScript | TypeScript | Python |
| Harness 模拟 | 14+ 种 | 无（原生） | 无 | 无 |
| 沙箱 | 跨平台原生 | macOS/Linux | 无 | 无 |
| ACP 支持 | ✅ | ✅ | ❌ | ❌ |
| Codex 兼容 | ✅（分叉） | ❌ | ❌ | ❌ |
| MCP | ✅ | ✅ | 部分 | ❌ |
| 多 Agent | ✅（V2） | ✅ | ❌ | ❌ |
| 开源 | Apache-2.0 | ❌ | ❌ | Apache-2.0 |

**核心差异化**：
1. **Harness 模拟**是独有特性——通过 Rust 重写各提供商推荐的 agent 框架，让低成本模型也能发挥最佳性能
2. **Codex 协议兼容**使其成为 Codex 的直接替代品
3. **跨平台沙箱**提供了比同类产品更强的安全保障
4. **可移植性优先**的设计哲学避免了生态锁定

## 总结

Open Interpreter 的 Rust 重写代表了 AI coding agent 领域的一个重要方向：**通过系统级优化和协议标准化，在低成本模型上实现高性能**。其 Harness 模拟系统是解决"不同模型需要不同 agent 框架"这一问题的创新方案。分层的 crate 架构确保了可维护性，而 ACP/Codex/MCP 的多协议支持则最大化了生态兼容性。

对于 OpenMate 而言，Open Interpreter 的以下设计值得借鉴：
1. **Harness 抽象层**：将模型特定的 prompt/工具格式封装为可切换的 harness
2. **分层沙箱**：操作系统级的安全隔离而非应用层模拟
3. **协议优先**：通过标准协议（ACP、MCP）实现互操作，而非私有 API
4. **配置分层**：系统 → 用户 → 项目 → CLI 的配置合并策略
