# anomalyco/opencode 架构研究报告

> 供 openmate（混合 coding + personal agent，需稳定性重构）参考
> 调研日期：2026-09-13
> 资料来源：opencode.ai 文档站、raw.githubusercontent.com（sst/opencode → anomalyco/opencode，dev 分支 v1.18.30）、package.json / core 源码

---

## 0 元信息

| 项 | 内容 |
|---|---|
| 项目名 | OpenCode |
| 仓库 | https://github.com/anomalyco/opencode（历史：sst/opencode） |
| 官网 | https://opencode.ai |
| 定位 | 开源 AI coding agent：TUI / Desktop / IDE / Web / CLI / Server 多形态 |
| 版本（调研时） | v1.18.30（`packages/opencode`） |
| 语言/运行时 | TypeScript + Bun（monorepo workspaces） |
| 许可 | MIT |
| 星标 | ~207k（用户给定；网页未复核具体数字） |
| 包管理器 | bun@1.3.14 |
| 核心依赖 | Vercel AI SDK（`ai` + 大量 `@ai-sdk/*`）、Effect 4.0.0-beta、drizzle-orm + SQLite、Hono/OpenAPI、@modelcontextprotocol/sdk、@opentui/*、solid-js、zod、tree-sitter、node-pty |
| 组织方 | Anomaly（anoma.ly），商业化路径：OpenCode Zen（托管模型列表）+ OpenCode Go（低成本订阅）+ Desktop + Console |
| 客户端矩阵 | TUI、Desktop App（Electron）、VS Code/IDE 插件、`opencode web`、`opencode run` 非交互、GitHub Action、GitLab Duo、ACP（Agent Client Protocol） |

### 0.1 一句话架构

**Headless HTTP Server（OpenAPI 3.1 + SSE 事件总线）作为唯一运行时内核，TUI/Desktop/Web/IDE 均为客户端**；Session 历史持久化在本地 SQLite，Agent Loop 通过 SessionRunner 驱动；工具经 Permission 门控后由 ToolRegistry 物化执行；LLM 通过 AI SDK + Models.dev 目录抽象 75+ provider。

---

## 1 系统架构

### 1.1 分层总览

```
┌─────────────────────────────────────────────────────────────┐
│  Clients: TUI / Desktop / Web / IDE / CLI run / GH Action   │
│  (packages/tui, packages/desktop, packages/app, sdk)        │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP + SSE (OpenAPI 3.1)
┌───────────────────────────▼─────────────────────────────────┐
│  Server (packages/server / opencode serve|web)              │
│  Auth: OPENCODE_SERVER_PASSWORD (basic)                     │
│  Endpoints: /session /message /event /config /provider ...  │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────▼─────────────────────────────────┐
│  Core Runtime (@opencode-ai/core) — Effect services         │
│  ├ Session + Message + Part (SQLite/drizzle)                │
│  ├ SessionRunner / SessionRunnerModel (agent loop)          │
│  ├ AgentV2 (primary/subagent)                               │
│  ├ ToolRegistry + ToolOutputStore + PermissionV2            │
│  ├ Catalog / Provider / Credential / Integration            │
│  ├ LSP / Formatter / PTY / FileWatcher / Snapshot(git)      │
│  └ Event bus → SSE                                          │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────▼─────────────────────────────────┐
│  LLM Layer (@opencode-ai/llm)                               │
│  protocols: anthropic-messages / openai-responses /         │
│             openai-compatible-chat / bedrock / gemini       │
│  providers + route + Auth                                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Monorepo 包结构（从 package.json / exports 反推）

| 路径 | 职责 |
|---|---|
| `packages/opencode` | CLI 入口 `bin/opencode`，yargs 子命令注册，聚合各 workspace |
| `packages/core` | **运行时核心**：session、agent、tool、permission、catalog、db、pty、lsp、compaction、snapshot |
| `packages/llm` | 协议与 provider 抽象（非 AI SDK 封装层的原生路径） |
| `packages/server` | HTTP/OpenAPI server |
| `packages/tui` | OpenTUI + SolidJS 终端 UI |
| `packages/sdk/js` | 从 OpenAPI 生成的 type-safe JS client（`@opencode-ai/sdk`） |
| `packages/plugin` | Plugin/Custom tool 类型与 `tool()` helper |
| `packages/schema` | 共享 schema |
| `packages/desktop` | Electron 桌面端（BETA） |
| `packages/app` / `packages/web` | Web 界面 + 文档站（Astro） |
| `packages/console` | 商业化 console（Anomaly 部署） |
| `packages/codemode` / `packages/protocol` | 协议相关 |

### 1.3 进程与形态

- 默认 `opencode` = 启动 **Server + TUI**（TUI 随机 port，也可 `--port/--hostname` 固定）
- `opencode serve`：纯 headless server（默认 127.0.0.1:4096）
- `opencode web`：server + 浏览器 UI
- `opencode attach <url>`：TUI 挂到远端 server
- `opencode run "..."`：非交互单次；可 `--attach` 复用 serve 避免 MCP 冷启动
- `opencode acp`：ACP 协议 stdin/stdout
- Server 同时发布 `/doc`（OpenAPI 3.1），SDK 由此生成

### 1.4 配置合并模型（稳定性关键）

优先级从低到高（**merge 而非 replace**）：

1. Remote config（`.well-known/opencode`，组织默认）
2. Global `~/.config/opencode/opencode.json`
3. `OPENCODE_CONFIG` 自定义路径
4. 项目 `opencode.json`（向上找到最近 git root）
5. `.opencode/` 目录（agents/commands/plugins/skills/tools/themes）
6. `OPENCODE_CONFIG_CONTENT` 内联
7. Managed settings（macOS `/Library/Application Support/opencode/`，Linux `/etc/opencode/`，Windows `%ProgramData%\opencode`）
8. macOS MDM `ai.opencode.managed` 偏好（最高，用户不可覆盖）

TUI 与 Server 配置拆分：`tui.json`（主题/keybind/attention）vs `opencode.json`（运行时）。

变量替换：`{env:VAR}`、`{file:path}`。

---

## 2 核心机制（Loop / 工具 / 上下文 / 状态）

### 2.1 Agent Loop

**设计要点：SessionRunner 驱动“可持久化的 continuation”，而不是裸 while 循环。**

源码锚点：`packages/core/src/session/runner/index.ts`、`.../runner/model.ts`

```ts
// Interface 摘要
interface {
  // 从已记录的 Session 历史里 drain 可执行的 durable work；
  // force=true 时即使无 eligible work 也做一次 provider attempt
  readonly run: (input: { sessionID; force: boolean }) => Effect<void, RunError>
}
```

RunError 联合类型明确列出失败面：

- `LLMError`
- `SessionRunnerModel.Error`（ModelNotSelected / ModelUnavailable / VariantUnavailable / UnsupportedApi / Integration.Authorization）
- `MessageDecodeError` / `ContextSnapshotDecodeError`
- `SystemContext.InitializationBlocked`
- `ToolOutputStore.Error`

**模型解析（SessionRunnerModel）**：

1. 从 Catalog 选 session 指定的 model，或 default，或第一个 supported
2. 解析 Integration connection → credential（api key / oauth）
3. 按 `model.api.type + package` 映射到协议 route：
   - `@ai-sdk/openai` → OpenAI Responses
   - `@ai-sdk/anthropic` → Anthropic Messages
   - `@ai-sdk/openai-compatible`（且有 baseURL）→ OpenAI Compatible Chat
4. Variant 覆盖 headers/body；limits 注入 context/output
5. 不支持的 API 显式 `UnsupportedApiError`（fail-fast，不静默）

**循环语义（从产品行为 + 源码推断）**：

1. 用户消息 → session 持久化
2. Runner 取历史 + system context + 物化 tools
3. 调 LLM stream → 产出 text / reasoning / tool_call parts
4. ToolCall 经 Permission → ToolRegistry.settle → ToolOutputStore.bound（截断/落盘）→ 结果写回 message
5. 若模型仍有 tool_call 则继续；否则 session idle
6. 触顶 context 时自动 compact（见 2.4）

隐藏系统 Agent：`compaction` / `title` / `summary`（primary 但 UI 不可选）。

### 2.2 Agent 类型

| Agent | Mode | 特征 |
|---|---|---|
| **build** | primary | 默认，全工具 |
| **plan** | primary | edit/bash 默认 `ask`，只读分析 |
| **general** | subagent | 复杂搜索/多步，可改文件；`@general` |
| **explore** | subagent | 快速只读代码探索 |
| **scout** | subagent | 外部文档/依赖仓库研究（managed cache clone） |
| compaction/title/summary | primary hidden | 系统内部 |

- Primary：Tab 切换
- Subagent：模型自动 Task 调用 或 用户 `@mention`
- 配置：`opencode.json` 的 `agent.{}` 或 Markdown frontmatter（`~/.config/opencode/agents/`、`.opencode/agents/`）
- `subagent_depth` 默认 1（禁止子 agent 再开子 agent）；可调 0/2
- `permission.task` 用 glob 控制可调用哪些 subagent；deny 的会从 Task 工具描述中移除（模型不会尝试）
- 用户始终可用 `@` 直接调 subagent（覆盖 agent task 权限）

Agent 选项：description、prompt（`{file:...}`）、model、temperature、top_p、steps（强制停止后要求总结）、permission、mode、hidden、color、透传 provider 参数（如 reasoningEffort）。

### 2.3 工具体系

**内置工具（built-in）**：

| 工具 | 权限键 | 说明 |
|---|---|---|
| bash | bash | shell；tree-sitter 解析命令做细粒度匹配 |
| read / write / edit / apply_patch | read / edit | edit 覆盖全部写操作 |
| grep / glob | grep / glob | 底层 ripgrep，尊重 .gitignore/.ignore |
| lsp | lsp | 实验性，`OPENCODE_EXPERIMENTAL_LSP_TOOL` |
| skill | skill | 按需加载 SKILL.md |
| todowrite/todoread | todowrite | subagent 默认禁用 |
| webfetch / websearch | webfetch / websearch | search 走 Zen 后端或 Exa/Parallel |
| question | question | 执行中向用户提问（header + options） |

**扩展三层**：

1. **Custom tools**：`.opencode/tools/*.ts`，`tool()` helper + Zod；文件名=工具名；多 export 变 `file_export`；同名覆盖内置
2. **MCP**：local（command 数组 + env + timeout 默认 5s）/ remote（url + headers + OAuth RFC 7591）；工具名前缀 `servername_`
3. **Plugins**：`.opencode/plugins/` 或 npm；钩子 `tool.execute.before/after`、`permission.asked`、`session.*`、`shell.env`、`experimental.session.compacting` 等

**ToolRegistry 源码要点**（`packages/core/src/tool/registry.ts`）：

- `materialize(permissions)`：按权限过滤后生成 LLM 可见的 ToolDefinition 列表
- `settle(input)`：按 identity 校验 **stale tool call**（防止工具热更新后旧调用误执行）
- 大输出经 `ToolOutputStore.bound` 截断/外置，再 `ToolOutput.toResultValue`
- `whollyDisabled`：`{"*": "deny"}` 整体下架工具

### 2.4 上下文与 Compaction

源码：`packages/core/src/session/compaction.ts`

**策略**：

- 默认 `auto: true`，`buffer ≈ 20_000` tokens，`keep.tokens ≈ 8_000`
- 触发：`estimate(system + messages + tools) > context - max(output, buffer)`
- 序列化对话：User/Assistant/Tool call+result（结果截断到 **2000 字符**）/System/Shell
- 摘要模板固定 Markdown：Objective / Important Details / Work State(Completed/Active/Blocked) / Next Move / Relevant Files
- 有 prior-summary 时做 **增量合并**（conversation 冲突时以新对话为准）
- 摘要输出 cap `SUMMARY_OUTPUT_TOKENS = 4096`
- 失败（provider error / 空摘要）→ 不 compact，返回 false（避免破坏会话）
- 事件：`session.compaction.started/ended`；插件可 `experimental.session.compacting` 注入或替换 prompt

**上下文注入**：

- `AGENTS.md`（项目）/ `~/.config/opencode/AGENTS.md`（全局）
- Claude Code 兼容：`CLAUDE.md`、`~/.claude/skills`（可 env 关闭）
- `instructions: []` 支持 glob + 远程 URL（5s 超时）
- Skills：按需 `skill` tool 加载，工具描述里只列 name+description（省 token）
- `small_model`：title 等轻任务用便宜模型

### 2.5 Session / 状态

**持久化**：

- SQLite（bun/node 双实现：`#db` / `#sqlite` import map）+ drizzle-orm
- 路径可 `opencode db path` 查看
- Session → Message → Part（text/reasoning/tool/file）
- 父子 session（subagent child sessions）；`session_child_*` 键位导航
- Fork：`POST /session/:id/fork`（可指定 messageID）
- Share：manual/auto/disabled；`opncd.ai/s/...`

**Undo/Redo / Snapshot**：

- 内部 **git snapshot 仓库** 跟踪 agent 文件变更
- `/undo` `/redo` 依赖项目是 git repo
- 大仓可 `snapshot: false` 关闭（代价：无法 UI 回滚）
- `session.diff` / `/session/:id/diff` 提供 FileDiff

**状态机（从 API 推断）**：

- session status 暴露在 `GET /session/status`
- `session.idle` / `session.error` / `session.status` / `session.updated` 事件
- abort：`POST /session/:id/abort`
- revert/unrevert：消息级回滚

**事件总线**：全局 SSE `/global/event` + 项目 `/event`；首事件 `server.connected`。插件与 SDK 订阅同一总线 → 多客户端一致。

### 2.6 权限系统（稳定性与安全核心）

- 三态：`allow` / `ask` / `deny`
- 默认 **宽松**：多数 allow；`doom_loop`、`external_directory` 默认 ask；`read` 默认 allow 但 **`.env` / `.env.*` deny**（`.env.example` allow）
- 对象语法细粒度：`{ "*": "ask", "git *": "allow", "rm *": "deny" }`；**last matching rule wins**
- 通配：`*`、`?`；支持 `~` / `$HOME` 展开
- `external_directory`：越出工作区的路径门禁（与 workspace 策略分离）
- **doom_loop**：同一 tool call + 相同输入重复 3 次 → 恢复提示
- Ask UI：`once` / `always`（按工具建议的 pattern 白名单，会话内）/ `reject`
- Agent 级覆盖与全局 merge，agent 优先
- `--auto`：自动批准非 deny 的 ask；可与 `opencode run` 连用
- Managed settings 可强制企业策略（MDM）

### 2.7 LLM Provider

- 基于 **Vercel AI SDK + Models.dev**，75+ provider
- 凭证：`~/.local/share/opencode/auth.json`（`/connect`、`auth login`）
- 支持 OAuth（Anthropic Pro/Max 明确禁止第三方订阅插件；官方支持 ChatGPT Plus、GitHub Copilot、GitLab Duo 订阅）
- 自定义 provider：`npm: "@ai-sdk/openai-compatible"` + baseURL + models map
- 本地：Ollama / LM Studio / llama.cpp / Atomic Chat
- 超时配置：`timeout` / `headerTimeout` / `chunkTimeout` / `setCacheKey`
- OpenCode Zen / Go：官方托管目录与订阅
- 新 LLM 原生路径：`packages/llm` protocols（anthropic-messages / openai-responses / openai-compatible-chat / bedrock-converse / gemini）+ `OPENCODE_EXPERIMENTAL_NATIVE_LLM`

### 2.8 TUI / CLI

- TUI：`@opentui/core|keymap|solid` + solid-js；配置 `tui.json`
- Leader 默认 `ctrl+x`；命令：connect/compact/details/editor/export/init/models/new/redo/sessions/share/themes/thinking/undo
- `@` 模糊文件引用（注入文件内容）；`!cmd` 直接跑 shell
- Attention：问题/权限/错误/完成时桌面通知+声音（终端失焦时通知）
- CLI 全量：agent/attach/auth/github/mcp/models/run/serve/session/stats/export/import/web/acp/plugin/pr/db/debug/uninstall/upgrade
- `opencode stats`：token 用量与成本
- `opencode export --sanitize`：脱敏导出

### 2.9 扩展与生态

- GitHub Action：`opencode github install|run`
- GitLab Duo Agent Platform（Premium/Ultimate）
- IDE：通过 `/tui` API 注入 prompt / 执行命令
- ACP：编辑器集成（Zed 等）
- Policies（experimental）：如 deny 某些 provider.use

---

## 3 稳定性 / 高可用

| 机制 | 说明 | 对 openmate 的意义 |
|---|---|---|
| **Server/Client 解耦** | 内核可 headless 常驻，客户端可挂可换 | 混合 agent 可复用同一 runtime，UI 崩溃不拖垮 loop |
| **SQLite 持久化 Session** | 消息/part 可恢复；export/import | 断电/重启后可 `--continue` |
| **durable work + SessionRunner** | “drain eligible work”，而非内存循环 | 易做重试与恢复点 |
| **显式错误类型** | ModelUnavailable 等 tagged errors | 可分类重试/降级 |
| **Compaction 失败不破坏** | 摘要失败返回 false 保持原上下文 | 避免“压缩反而丢上下文” |
| **ToolOutputStore 边界** | 大结果截断/外置（compaction 再截 2000） | 防上下文爆炸 |
| **Stale tool call 防护** | identity 校验 | 热更新/并发安全 |
| **doom_loop** | 3 次相同调用触发恢复 | 防工具死循环烧 token |
| **steps 上限** | agent steps 耗尽强制文本总结 | 成本与安全阀 |
| **Snapshot + undo/redo** | git 内部仓 | 文件级可回滚 |
| **Permission 默认 deny secrets** | `.env` | 基线安全 |
| **external_directory ask** | 出界默认询问 | 防越权写 |
| **Provider 超时分层** | timeout/header/chunk | 流式卡死可 abort |
| **MCP timeout 5s** | 工具发现不阻塞启动 | |
| **autoupdate / notify** | 可关 | |
| **--pure** | 不加载外部插件 | 现场排障 |
| **`process.exit` finally** | 避免 MCP docker 子进程悬挂 | 进程卫生 |
| **Managed config** | 企业强制策略 | |
| **事件可观测** | SSE + OpenTelemetry 依赖 + `opencode stats` + export | |
| **HTTP API 练习脚本** | `script/httpapi-exercise.ts` coverage/auth/effect | 测试纪律 |

**短板/风险（openmate 重构时注意）**：

- 默认权限过宽（coding 场景合理，personal agent 不宜）
- 大仓 snapshot 可能慢且占盘
- MCP 会吃上下文（官方也警告 GitHub MCP 等）
- Anthropic 订阅第三方插件合规风险（他们已剥离 bundled plugin）
- Effect 4 beta + 多 package patch 依赖，升级成本高
- Windows 体验弱（推荐 WSL）

---

## 4 自我进化

OpenCode **不是** 自修改代码的 agent，而是“可成长的配置 + 技能生态”：

1. **`/init` → AGENTS.md**：扫描项目生成/改进指令文件（build/lint/test、架构、约定）
2. **Agent Skills（SKILL.md）**：发现式加载；name/description 进工具描述，正文按需载入
3. **Custom Tools / Plugins**：用户扩展行为；钩子可改 bash 转义、注入 env、替换 compaction prompt
4. **Custom Commands**：模板 + `$ARGUMENTS` + 指定 agent/model
5. **Markdown Agents**：声明式新建 subagent（权限/模型/prompt）
6. **MCP 生态**：外部能力即插即用
7. **模型目录进化**：Models.dev + Zen 测试列表；小模型分工（small_model）
8. **Compaction 摘要模板**：结构化 Work State 使长任务跨压缩续作
9. **企业 Remote config**：组织级默认下发
10. **无内置**：自动改自己的 prompt/权重、经验回放、评测闭环——需产品层自建

对 openmate：若要“个人 agent 记忆进化”，可借鉴 Skills + AGENTS.md 分层，但长期记忆/偏好学习要另做。

---

## 5 对 openmate 的借鉴（P0 / P1 / P2）

### P0（稳定性重构必做）

1. **Runtime 与 UI 分离**：先立 headless server（HTTP+SSE 或至少进程内 event bus），coding UI / personal UI 都是客户端。openmate 混合场景最怕“一条 loop 绑死 TUI”。
2. **Session 持久化 + 显式状态机**：SQLite（或等价）存 message/part/tool 状态；提供 continue/fork/abort/export。
3. **统一 ToolRegistry + Permission 三态**：allow/ask/deny + last-match glob + agent 覆盖；personal 场景默认收紧（bash/edit 外部目录 ask）。
4. **Compaction 作为一等公民**：触顶自动压缩、失败可降级、保留 recent tail、固定摘要 schema（Objective/Work/Next）。
5. **错误类型化**：Model/Tool/Decode/Store 分开，便于重试策略与用户可读错误。
6. **Tool 输出边界**：硬截断 + 外置 store，避免单次工具结果打爆上下文。
7. **防呆**：doom_loop、steps cap、`.env` 默认拒绝、external_directory。

### P1（混合 agent 产品力）

1. **Primary vs Subagent 模型**：coding=build/plan；personal=researcher/executor/todo；`@` 调用 + depth 限制。
2. **Skill 按需加载**：不要把所有个人技能塞 system prompt；name+description 列表 + tool 拉取。
3. **small_model 分工**：标题、摘要、分类用便宜模型。
4. **Plugin 钩子**（tool.execute.before/after、session.idle、compacting）：个人自动化（日程、通知、笔记写入）挂在这里。
5. **Snapshot/Undo**：个人 agent 改文件同样需要；可仅对“受管目录”开启。
6. **SDK/OpenAPI**：脚本、手机端、其他 agent 编排 openmate 时用类型化客户端。
7. **配置分层**：remote/org → global → project → managed；变量 `{env}/{file}`。

### P2（差异化/远期）

1. Scout 型子 agent：依赖/外部文档只读研究（隔离 cache）。
2. Policies：provider/工具白名单的声明式合规。
3. Zen 式“已验证模型列表”：openmate 内部维护推荐模型与失败率。
4. Attention/桌面通知：个人 agent 异步完成提醒。
5. ACP/IDE 协议：若 openmate 要进编辑器。
6. 自建长期记忆与评测（OpenCode 未做，恰是 personal agent 机会）。

### 不建议照搬

- 默认 YOLO 权限（对个人 agent 危险）
- 一次性加载大量 MCP
- 过重的 monorepo + 多 AI SDK patch（openmate 可先用单一 provider 层）
- 把“自我进化”理解为改系统二进制；应做成可审计的配置/技能 PR 流

---

## 6 源码路径笔记

> 路径以 `dev` 分支为准；组织从 sst → anomalyco 迁移，raw 可用 `sst/opencode` 镜像路径。

### 入口与 CLI

| 路径 | 内容 |
|---|---|
| `packages/opencode/src/index.ts` | yargs 注册全部子命令；`AGENT=1` `OPENCODE=1`；finally `process.exit` |
| `packages/opencode/src/cli/cmd/*` | run/serve/web/attach/tui/acp/mcp/agent/... |
| `packages/opencode/bin/opencode` | bin |
| `packages/opencode/package.json` | v1.18.30；`#db` bun/node 双端 |

### Core 运行时

| 路径 | 内容 |
|---|---|
| `packages/core/package.json` | `@opencode-ai/core`；`#sqlite` `#pty` `#fff` 双实现；Effect + drizzle |
| `packages/core/src/session/runner/index.ts` | SessionRunner 接口：`run({sessionID, force})` |
| `packages/core/src/session/runner/model.ts` | 模型解析/variant/credential/协议 route 映射 |
| `packages/core/src/session/compaction.ts` | 自动压缩、摘要模板、token 估算、截断 2000 |
| `packages/core/src/session/message.ts`（推断） | Message/Part 状态 |
| `packages/core/src/session/schema.ts` | SessionSchema.ID 等 |
| `packages/core/src/tool/registry.ts` | materialize/settle/stale 检测/ToolOutputStore |
| `packages/core/src/tool/tool.ts`（推断） | definition/permission/settle |
| `packages/core/src/permission`（PermissionV2） | 规则集 last-match |
| `packages/core/src/agent`（AgentV2） | agent 定义与合并 |
| `packages/core/src/catalog` | 模型/provider 目录 |
| `packages/core/src/credential` / `integration` | 凭证与 OAuth 连接 |
| `packages/core/src/tool-output-store` | 大输出外置 |
| `packages/core/src/system-context` | 系统上下文初始化 |
| `packages/core/src/storage/db.*.ts`（opencode pkg） | DB 适配 |
| `packages/core/src/effect/layer-node.ts` | Effect Location node 装配 |

### LLM

| 路径 | 内容 |
|---|---|
| `packages/llm/src/protocols/anthropic-messages.ts` | Anthropic Messages |
| `packages/llm/src/protocols/openai-responses.ts` | OpenAI Responses |
| `packages/llm/src/protocols/openai-compatible-chat.ts` | 兼容 chat |
| `packages/llm/src/protocols/bedrock-converse.ts` / `gemini.ts` | 其他协议 |
| `packages/llm/src/providers/*` | anthropic/openai/azure/google/... |
| `packages/llm/src/route/index.ts` | route + Auth |

### 客户端 / SDK

| 路径 | 内容 |
|---|---|
| `packages/tui/src/index.tsx` | TUI 入口 |
| `packages/tui/src/config/*` `keymap.tsx` | tui.json、键位 |
| `packages/tui/src/context/*` | sdk/sync/theme/runtime |
| `packages/sdk/js/src/gen/types.gen.ts` | OpenAPI 生成类型（文档多处引用） |
| `packages/plugin` | `tool()`、Plugin 类型 |
| `packages/web/src/content/docs/*.mdx` | 文档源 |

### 文档站（调研抓取）

- `/docs/`、`/docs/agents/`、`/docs/tools/`、`/docs/providers/`、`/docs/permissions/`、`/docs/server/`、`/docs/sdk/`、`/docs/config/`、`/docs/tui/`、`/docs/cli/`、`/docs/plugins/`、`/docs/skills/`、`/docs/mcp-servers/`、`/docs/rules/`、`/docs/custom-tools/`

### 关键常量（compaction.ts）

```
DEFAULT_BUFFER = 20_000
DEFAULT_KEEP_TOKENS = 8_000
TOOL_OUTPUT_MAX_CHARS = 2_000
SUMMARY_OUTPUT_TOKENS = 4_096
```

### 依赖指纹（选摘）

- `ai` 6.x + `@ai-sdk/*`
- `effect` 4.0.0-beta.83（大量 patchedDependencies）
- `@modelcontextprotocol/sdk`
- `@opentui/*` + `solid-js`
- `drizzle-orm` + sqlite
- `tree-sitter-bash` / `tree-sitter-powershell`
- `@parcel/watcher`、`@lydell/node-pty`

---

## 7 评分（1–5，七维）

评分标准：5=同类标杆；4=优秀；3=合格；2=偏弱；1=缺失/不适用。

| 维度 | 分 | 依据 |
|---|---:|---|
| **架构清晰度 / 可扩展性** | **5** | Server 内核 + 多客户端；monorepo 边界清楚；OpenAPI/SDK；Plugin/Custom Tool/MCP 三层扩展 |
| **Agent Loop 表达力** | **4.5** | SessionRunner durable work、primary/subagent、plan/build、steps、hidden 系统 agent；扣 0.5：Effect 抽象陡、文档少 |
| **工具与权限模型** | **5** | 三态 + glob last-match + agent 覆盖 + external_directory + doom_loop + ask once/always；对 coding 略偏松但可配 |
| **上下文工程** | **5** | 自动 compaction、结构化摘要、增量合并、small_model、skills 按需、输出截断、AGENTS.md/instructions |
| **稳定性 / 可恢复性** | **4** | SQLite、snapshot/undo、显式错误、超时分层、持久 session；扣分：大仓 snapshot、默认权限、流式故障细节依赖 provider |
| **多 Provider / 模型适配** | **5** | AI SDK + Models.dev 75+、本地模型、OAuth 订阅、自定义 openai-compatible、Zen 已验证列表 |
| **产品完成度 / 生态** | **4.5** | TUI/Desktop/Web/IDE/GH/GL/ACP、stats、share、企业 managed config；扣分：Windows、Desktop 仍 BETA、商业化与开源边界复杂 |

**综合（未加权平均）：≈ 4.7 / 5**

### 对 openmate 的简要结论

OpenCode 是当前 **“终端优先、多客户端、强权限与强上下文管理”** 的 TypeScript coding agent 参考实现。openmate 稳定性重构应 **P0 抄它的内核边界**（Headless Server + 持久 Session + ToolRegistry/Permission + Compaction），**P1 抄它的多 Agent/Skill/Plugin 模型**，在 personal agent 侧自建长期记忆与更严默认权限，而不是重造 TUI。

---

## 附录：关键配置片段（便于对照实现）

### Permission

```json
{
  "permission": {
    "*": "ask",
    "bash": { "*": "ask", "git *": "allow", "rm *": "deny" },
    "edit": { "*": "deny", "notes/**": "allow" },
    "external_directory": { "~/personal/**": "allow" }
  }
}
```

### Compaction

```json
{ "compaction": { "auto": true, "prune": false, "reserved": 10000 } }
```

### Agent 覆盖

```json
{
  "agent": {
    "plan": { "permission": { "edit": "deny", "bash": "ask" } },
    "researcher": {
      "mode": "subagent",
      "description": "read-only research",
      "permission": { "edit": "deny", "task": { "*": "deny" } }
    }
  }
}
```

---

*报告结束。*
