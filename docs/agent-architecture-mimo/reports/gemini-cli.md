# Google Gemini CLI 架构报告

> 研究对象：https://github.com/google-gemini/gemini-cli  
> 定位：Google 官方开源终端 AI Agent（TypeScript / Node.js）  
> 研究日期：2026-09-13

---

## 1. 元信息

| 项 | 内容 |
|---|---|
| 仓库 | `google-gemini/gemini-cli` |
| 语言 | TypeScript（NPM Workspaces monorepo） |
| 许可 | Apache-2.0 |
| 安装 | `npm i -g @google/gemini-cli` / npx / Homebrew / MacPorts / Conda |
| 免费额度 | 个人 Google 账号：60 req/min，1000 req/day |
| 认证 | Google OAuth / GEMINI_API_KEY / Vertex AI |
| 模型 | Gemini 3 系列，1M token 上下文窗口 |
| 发布通道 | preview（周）→ stable（周）+ nightly（日） |
| 状态提示 | 2026-06-18 起，免费层个人用户被引导至 Antigravity CLI；付费 Code Assist 与开源仓库仍在维护 |

### 包结构

| 包 | 职责 |
|---|---|
| `@google/gemini-cli` | 用户界面、命令解析；发布时打包为单一可执行 |
| `@google/gemini-cli-core` | Gemini API 交互、认证、缓存、工具注册；可独立复用 |

---

## 2. 架构

### 2.1 总体分层

```
┌──────────────────────────────────────────────────┐
│  packages/cli  — TUI / 命令 / 会话 UI / 配置加载   │
├──────────────────────────────────────────────────┤
│  packages/core — Agent 循环 / ToolRegistry / 模型 │
│                  MCP client / Hooks / Policy /    │
│                  Memory / Telemetry               │
├──────────────────────────────────────────────────┤
│  Gemini API（generateContent + function calling） │
├──────────────────────────────────────────────────┤
│  本地执行：Shell / FS / Web / MCP subprocess      │
└──────────────────────────────────────────────────┘
```

### 2.2 核心组件映射

| 组件 | 位置 | 职责 |
|---|---|---|
| `ToolRegistry` | `packages/core/src/tools/` | 注册、发现、启停所有工具 |
| `mcp-client.ts` | core/tools | MCP 发现与连接 |
| `mcp-tool.ts` | core/tools | 将 MCP 工具包装为本地 Tool |
| ReAct Loop | core client | 模型推理 ↔ 工具调用循环 |
| Hooks 引擎 | core | 在 Agent 生命周期点插入用户脚本 |
| Policy Engine | core | 细粒度工具参数级 allow/deny |
| Sandbox Manager | core+cli | 多后端隔离执行 |

### 2.3 配置分层（优先级从高到低）

1. Project：`.gemini/settings.json`
2. User：`~/.gemini/settings.json`
3. System：`/etc/gemini-cli/settings.json`
4. Extensions 提供的默认配置

---

## 3. 核心机制

### 3.1 Tools（工具系统）

内置工具全景：

| 类别 | 工具 |
|---|---|
| Execution | `run_shell_command`（可交互/后台） |
| File System | `glob` `grep_search` `list_directory` `read_file` `read_many_files` `replace` `write_file` |
| Interaction | `ask_user` `write_todos` |
| Planning | `enter_plan_mode` `exit_plan_mode` |
| Memory | `activate_skill` `get_internal_docs` |
| Web | `google_web_search` `web_fetch` |
| MCP | `list_mcp_resources` `read_mcp_resource` |
| Task Tracker（实验） | `tracker_create/update/get/list/add_dependency/visualize` |

工具安全分级：
- **Read 类**：通常自动执行
- **Mutator 类**（`replace` `write_file` `run_shell_command`）：需用户确认（显示 diff 或确切命令）
- 快捷触发：`@path` → `read_many_files`；`!cmd` → `run_shell_command`

### 3.2 ReAct Loop（推理-行动循环）

```
User Prompt
    │
    ▼
┌─────────────────┐
│ BeforeAgent Hook │ ← 可注入上下文 / 阻断本轮
└────────┬────────┘
         ▼
┌─────────────────┐   function call   ┌──────────────────┐
│  Model Turn      │ ────────────────► │ BeforeTool Hook  │
│  (Gemini 推理)   │                   │ Policy Engine    │
└────────┬────────┘                   │ 用户确认 / 沙箱  │
         │ 无工具调用                  └────────┬─────────┘
         ▼                                     ▼
┌─────────────────┐                   ┌──────────────────┐
│ AfterAgent Hook  │                   │ Tool 执行         │
│ 最终答复         │                   │ AfterTool Hook   │
└─────────────────┘                   └────────┬─────────┘
         ▲                                     │
         │           Tool Result               │
         └─────────────────────────────────────┘
```

特征：
- 标准 **Thought → Action → Observation** ReAct
- Todo 内置跟踪进度（`write_todos`）
- Plan Mode：只读研究态，产出计划待批准后再实现
- Subagents（实验）：`complete_task` 将结果返回父 Agent
- 上下文压缩、checkpointing、rewind 支持长会话

### 3.3 Extensions / MCP（扩展体系）

#### MCP 集成架构

```
settings.json mcpServers
        │
        ▼
 discoverMcpTools()  (mcp-client.ts)
        │  连接 Stdio / SSE / Streamable HTTP
        ▼
 拉取 tools/list → schema 清洗 → 命名空间注册
        │  FQN: mcp_{serverName}_{toolName}
        ▼
 DiscoveredMCPTool  (mcp-tool.ts)
        │  trust / includeTools / excludeTools
        ▼
 模型 function call → 确认 → 调用 MCP → llmContent + returnDisplay
```

关键能力：
- 三种传输：Stdio 子进程、SSE、Streamable HTTP
- 工具过滤：`includeTools` / `excludeTools`（exclude 优先）
- 环境脱敏：默认剥离 `*TOKEN*` `*SECRET*` 等敏感变量；需在 `env` 显式声明
- OAuth 2.0 远程 MCP：自动发现、浏览器授权、RFC 9207 issuer 校验
- MCP Prompts 可映射为 slash command
- `gemini mcp add/list/remove/enable/disable` 管理

#### Extensions

- 可打包工具、hooks、MCP、自定义命令
- 本地配置可覆盖 extension 的 MCP 设定（exclude 并集、include 交集 → 最严策略胜）

### 3.4 Hooks（生命周期钩子）

同步运行于 Agent 循环关键点：

| 事件 | 时机 | 可做 |
|---|---|---|
| `SessionStart` / `SessionEnd` | 会话起止 | 初始化 / 清理 |
| `BeforeAgent` / `AfterAgent` | 用户提交后 / 循环结束前 | 注上下文、阻断、重试 |
| `BeforeModel` / `AfterModel` | 请求 LLM 前后 | 改 prompt、mock、脱敏 |
| `BeforeToolSelection` | 选工具前 | 过滤可用工具 |
| `BeforeTool` / `AfterTool` | 工具执行前后 | 校验参数、拦截、后处理 |
| `PreCompress` / `Notification` | 压缩前 / 通知 | 状态保存、转发告警 |

协议：stdin JSON 入参，stdout **必须**为纯 JSON；exit 2 = 系统级阻断；调试走 stderr。

### 3.5 Sandbox（沙箱）

多后端：

| 后端 | 平台 | 强度 |
|---|---|---|
| Seatbelt (`sandbox-exec`) | macOS | 轻量 profile（permissive/restrictive/strict × open/proxied） |
| Docker / Podman | 跨平台 | 完整容器；工作区以**相同绝对路径**挂载 |
| Windows Native Sandbox | Windows | 低完整性级别（icacls Low Mandatory Level） |
| gVisor / runsc | Linux | 用户态内核，最强隔离 |
| LXC/LXD（实验） | Linux | 全系统容器（适合 Snapcraft） |

附加机制：
- **Tool-level sandboxing**：只沙箱工具执行，而非整个 CLI 进程
- **Sandbox Expansion**：命令因权限失败时弹出「扩容请求」，用户批准后单次放宽
- `SANDBOX_MOUNTS` 挂载工作区外路径
- `BUILD_SANDBOX=1` 基于项目 `.gemini/sandbox.Dockerfile` 自动构建镜像

### 3.6 Policy Engine

基于 TOML 规则对工具 JSON 参数做匹配：

```toml
[[rule]]
toolName = "write_file"
argsPattern = '"file_path":".*\.env"'
decision = "deny"
priority = 100
denyMessage = "Writing to .env files is not allowed."
```

与 Trusted Folders、MCP trust 叠加形成完整权限面。

---

## 4. 稳定性

| 维度 | 评估 |
|---|---|
| 语言/运行时 | Node.js + TS；生态丰富，但冷启动与内存高于 Rust 方案 |
| 发布治理 | preview → stable 两级晋升 + nightly；有 CI 与 behavioral evals |
| 可观测性 | OpenTelemetry：模型调用、工具调度、trace 可导出 Genkit/Jaeger/GCP |
| 会话可靠 | Checkpointing、Rewind、session resume、token caching |
| 企业能力 | Enterprise 配置、trusted folders、telemetry、GitHub Action |
| 生命线风险 | 免费层已迁 Antigravity CLI；开源核心仍在，但战略重心转移需关注 |
| 工具面稳定 | 核心 FS/shell 工具成熟；Task Tracker、Subagents、Auto Memory 仍标实验 |

**风险点**：
- 实验特性多，API 面可能变动
- Node 单文件打包体积大
- 产品战略向 Antigravity 过渡带来的不确定性

---

## 5. 自我进化

Gemini CLI 在三者中自我进化机制最完整：

### 5.1 Auto Memory（实验）

```
本地 session transcript (~/.gemini/tmp/<project>/chats/)
        │
        ▼  后台扫描（idle ≥3h 且 ≥10 条用户消息）
 提取 Agent（preview Flash）
        │  脱敏 secrets → 草稿
        ▼
 Review Inbox（项目本地）
   ├── memory .patch
   └── SKILL.md 草稿
        │
   用户 /memory inbox 审核
        ▼
  Apply → 更新 GEMINI.md / 提升 skill
```

安全边界：
- **不能**直接改活的 memory/settings/凭证/项目 GEMINI.md
- Patch 先 dry-run；人工批准后原子应用
- 候选默认宁缺毋滥

### 5.2 Agent Skills

- 目录：`.gemini/skills/`（项目）与 `~/.gemini/skills/`（用户）
- `activate_skill` 按需加载过程性专业知识
- 可被 Auto Memory 自动起草并晋升

### 5.3 其他

| 机制 | 作用 |
|---|---|
| `GEMINI.md` 层级上下文 | 项目持久指令 |
| Checkpointing / Rewind | 从历史状态恢复继续进化 |
| Token caching | 降本，支撑更长自主循环 |
| Memory import processor | 从外部源导入记忆 |

---

## 6. openmate 借鉴

### 高价值可直接移植

1. **ToolRegistry + 工具安全分级**  
   Read 自动、Mutator 确认；openmate 可做同款「工具风险标签 → 审批策略」映射。

2. **Hooks 同步拦截点模型**  
   BeforeAgent/BeforeTool/AfterTool 等 10+ 事件 + 严格 JSON 协议 + exit code 语义，是企业策略挂载的成熟范式。

3. **MCP 双层架构**  
   Discovery（`mcp-client`）与 Execution（`mcp-tool`）分离；FQN 命名空间；env 脱敏；trust/include/exclude 过滤。

4. **Sandbox Expansion（渐进扩容）**  
   权限失败 → 解释原因 → 用户批准单次放宽，优于「失败即停」或「一键全开」。

5. **Policy Engine 参数级规则**  
   用 `argsPattern` 正则匹配工具 JSON 参数，实现「禁止写 .env」这类细粒度策略。

6. **Auto Memory 人工审核收件箱**  
   自动提炼 + 人审晋升，是 openmate 做自我进化时可直接套用的安全模板。

7. **Plan Mode**  
   只读研究态与实现态分离，降低复杂任务误改风险。

### 建议架构草图（openmate）

```
openmate-cli (UI)
    │
openmate-core
    ├── ReAct Loop + Hooks 钩子总线
    ├── ToolRegistry（风险分级）
    │     ├── built-in tools
    │     └── MCP discovery/execution
    ├── Policy Engine (argsPattern)
    ├── Sandbox（多后端 + expansion）
    ├── Auto-Memory（inbox 人审）
    └── Telemetry (OTel)
```

---

## 7. 关键路径

| 路径 / 入口 | 说明 |
|---|---|
| `packages/cli/` | UI、命令、会话 |
| `packages/core/src/tools/` | 工具与 MCP 核心 |
| `docs/reference/tools` | 工具参考 |
| `docs/cli/sandbox` | 多后端沙箱 |
| `docs/tools/mcp-server` | MCP 集成 |
| `docs/hooks/` | 生命周期钩子 |
| `docs/cli/auto-memory` | 自我进化 |
| `docs/reference/policy-engine` | 参数级策略 |
| 官方站 | https://geminicli.com/docs/ |

---

## 8. 评分

| 维度 | 分数 (1-10) | 说明 |
|---|---|---|
| 架构清晰度 | 8 | cli/core 分包清楚，工具与 MCP 分层合理 |
| 工具生态 | 9 | 内置工具全 + MCP/Extensions/Hooks 三层扩展 |
| 沙箱与安全 | 9 | 5 种沙箱后端 + Policy + Trusted Folders + 扩容 |
| ReAct 循环 | 8 | 标准循环 + Plan/Todo/Subagent/Checkpoint |
| 自我进化 | 9 | Auto Memory + Skills + 人审收件箱最完整 |
| 文档完整度 | 10 | 文档站极其完善，可直接当教材 |
| 稳定性/生命线 | 7 | 免费层迁 Antigravity 带来战略不确定 |
| 对 openmate 参考价值 | **9** | Hooks/MCP/Policy/Auto-Memory 四大模块可抄 |
| **综合** | **8.6** | 扩展性与自我进化最强的开源终端 Agent |

---

## 9. 一句话总结

> Gemini CLI 以 TypeScript core 构建了「ReAct 循环 + 分级工具 + Hooks 总线 + 多后端沙箱 + Auto-Memory 人审」的全功能终端 Agent，是 openmate 在扩展性与自我进化上最值得对标的产品。
