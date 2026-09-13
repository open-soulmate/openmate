# Cline 源码级调研报告（Rank 38）

> 调研对象：`cline/cline`
> 报告日期：2026-09-13　｜　数据基线：GitHub `main` 分支（`@cline/core` v0.0.82）

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | Cline |
| GitHub | https://github.com/cline/cline |
| Star | 约 6.6w（清单快照 67,909） |
| 主要语言 | TypeScript（Bun + Node 22  monorepo） |
| 许可证 | Apache-2.0 |
| 一句话定位 | **运行在 IDE / CLI / 桌面里的自主编码 Agent：模型决定下一步，工具层读写文件、执行命令、操作浏览器，每一步都要人批准** |

**目标用户/场景**：开发者在 VS Code / JetBrains / 终端中让 Agent 自主改代码、跑命令。最新版本已演进为**可复用 SDK**——同一份引擎驱动 CLI、桌面 App、VS Code 扩展、JetBrains 插件，并开放插件/MCP/多 Agent 团队。

**成熟度**：极高。已重构为 Bun workspaces monorepo（`package.json` 实测），核心以 `@cline/core`(0.0.82)、`@cline/agents`、`@cline/llms`、`@cline/shared` 多包发布，配 vitest 单测/e2e、biome lint、OpenTelemetry，是编码 Agent 领域工程化最彻底的项目之一。

---

## 2. 源码结构总览

通过下载根 `package.json` 确认，这是 **Bun workspaces monorepo**：

```
cline/
├── sdk/packages/
│   ├── agents/      # @cline/agents：浏览器安全的 Agent 循环（Agent/AgentRuntime）
│   ├── core/        # @cline/core：Node 运行时服务（会话/存储/MCP/工具/连接器/遥测）
│   ├── llms/        # @cline/llms：多模型提供商抽象与错误分类
│   └── shared/      # 共享契约（AgentMessage/Tool/Hook 类型、createTool）
├── apps/
│   ├── cli/         # 终端 CLI
│   ├── vscode/      # VS Code 扩展（含 webview-ui）
│   ├── cline-hub/   # 桌面/Hub
│   └── examples/
└── sdk/examples/plugins/   # 插件示例
```

**核心源码文件（已下载并通读关键段，HTTP 200 校验）**：
- `sdk/packages/agents/src/agent-runtime.ts`（64KB，**Agent 主循环所在**）
- `sdk/packages/core/src/index.ts`（1128 行导出清单，勾勒全系统边界）
- `sdk/packages/agents/src/index.ts`、`sdk/packages/core/package.json`

**入口流程**：`AgentRuntime.run(input)`（agent-runtime.ts:536）→ 装配 tools/plugins/hooks → 进入 `while(iteration<maxIterations)` 循环 → `generateAssistantMessageWithOverflowRecovery()` → 过滤 `tool-call` → `executeToolCalls()` → 回灌结果 → 直到模型不再要求工具。

---

## 3. 系统架构分析

### 编排模式：ReAct（工具调用循环）+ 可插拔 Hooks + 多 Agent 团队（源码确认）

核心就是一个**显式 ReAct 循环**（agent-runtime.ts:727）：

```ts
while (this.config.maxIterations === undefined ||
       this.state.iteration < this.config.maxIterations) {
  this.throwIfAborted();
  this.state.iteration += 1;
  const { message, finishReason } =
      await this.generateAssistantMessageWithOverflowRecovery();  // 含上下文溢出恢复
  const toolCalls = message.content.filter(p => p.type === "tool-call");
  if (toolCalls.length === 0) { ... finishRun("completed") ... return; }
  const toolMessages = await this.executeToolCalls(toolCalls);
  // 回灌 tool result，进入下一 iteration
}
throw new Error(`Agent runtime exceeded maxIterations (${...})`);
```

即：**模型出 assistant message → 若含 tool-call 就执行工具 → 把 tool result 作为新消息追加 → 再问模型**，直到无工具调用或达到 `maxIterations` 上限。

### 核心组件与交互

- **AgentRuntime（@cline/agents）**：无状态浏览器安全循环，只负责"生成→执行→回灌"，不直接碰文件系统。
- **ClineCore（@cline/core，`./ClineCore`）**：Node 侧运行时宿主，管会话、存储、MCP、工具、连接器、遥测。
- **Hooks 扩展点**（agent-runtime.ts:273-276）：`beforeModel / afterModel / beforeTool / afterTool` 四类钩子，插件可在这些点注入上下文、审计、策略。`appendContext` 块由 afterTool 收集、整合成一条 user 消息注入（agent-runtime.ts:826）。
- **工具层**：`createTool`（@cline/shared）定义工具；内建工具经 `createShellTool/createApplyPatchExecutor/createEditorExecutor`（core index）生成；外部工具走 MCP（`createMcpTools`）。
- **多 Agent 团队**：`AgentTeamsRuntime` / `createSpawnAgentTool` / `createDelegatedAgent`（core index `./extensions/tools/team`），协调者把任务拆给有独立上下文的专家 agent。

数据流：用户输入 → normalize → 每轮 beforeModel 钩子 → 模型流式生成 → afterModel → 拆出 tool-call → beforeTool（含审批）→ 执行工具 → afterTool → 结果回灌 → 循环。

---

## 4. 功能拆解

- **工具系统**：`createTool({...})` 声明式注册；工具策略 `ToolPolicy`/自动批准可全局配置（`setToolAutoApproveGlobally`）；危险操作走 `requestDesktopToolApproval` 人工门控。
- **MCP 一等公民**：`createMcpTools`、`DEFAULT_MCP_CONNECT_TIMEOUT_MS`、`probeMcpServerConnection`、MCP settings 文件加锁（`McpSettingsLockTimeoutError`）。
- **命令执行安全**：`createShellExecutor` + `SubprocessSandbox` + `CommandExitError`；输出经 `truncateCommandOutput`/`MAX_COMMAND_OUTPUT_CHARS` 截断防爆上下文。
- **会话/存储**：`SqliteSessionStore`、`SqliteTeamStore`、`CoreSessionService`、会话图（`makeSubSessionId`/`makeTeamTaskSubSessionId`）。
- **插件/技能/规则/工作流**：`loadAgentPluginPackages`、`parseAgentSkillMarkdown`、`createRulesConfigDefinition`、`UnifiedConfigFileWatcher`（文件热更新）。
- **前端/后端划分**：agents 包浏览器可跑（纯循环），core 包承担 Node 能力；CLI/Vscode/Hub 三种 app 复用同一引擎。

---

## 5. 技术亮点与优势

1. **循环与能力彻底解耦**：Agent 循环在 `@cline/agents`（可在浏览器跑），文件/命令/MCP 在 `@cline/core`。同一引擎驱动 4 种端（IDE/CLI/桌面/JetBrains）——这是 openmate 多端最值得抄的架构。
2. **四类生命周期 Hooks**（beforeModel/afterModel/beforeTool/afterTool）把审计、策略、上下文注入做成横切关注点，插件生态（core index `createAgentHooksExtension`/`runHook`）即建立其上。
3. **上下文溢出自愈**：`generateAssistantMessageWithOverflowRecovery()` 名字即证据——上下文超限时触发 compaction 恢复而非直接失败；配套 `createContextCompactionPrepareTurn`、`SessionCompactionState`。
4. **工程化遥测**：原生接入 OpenTelemetry（logs/metrics/trace OTLP），`captureToolUsage/captureTokenUsage/captureMistakeLimitReached` 等数十个结构化事件。
5. **人在回路审批**：每步工具调用可审批、可自动批准分级（ToolPolicy），是"自主但可控"的编码 Agent 标杆。

---

## 6. 稳定性机制【重点】

- **迭代硬上限**：`while ... iteration < config.maxIterations`，超限直接 `throw new Error("Agent runtime exceeded maxIterations")`（agent-runtime.ts:870），杜绝无限循环。**源码确认**。
- **可中止运行**：`AbortController` + `abort(reason)`（:544），`throwIfAborted()` 每轮开头检查；中止抛 `AgentRuntimeAbortError`（:290），状态记 `lastError`。**源码确认**。
- **错误归一化与分类**：`catch` 块（:873）把任意 error 归一为 Error，区分 `ControlledStopError`（受控停止）与 `ContextWindowOverflowError`（映射为 `errorClass="context_window_exceeded"`），据此决定 status 是 `aborted` 还是 `failed`，并避免对同一 provider 错误重复上报遥测（`lastErrorReported` 守卫）。
- **空响应/不完整回合保护**：模型返回空 content 且无 modelToolActivity → 抛 "Model returned empty response"；`finishReason==="max-tokens"` 且无工具调用 → 抛 `MAX_TOKENS_INCOMPLETE_TURN_MESSAGE`（:783）。
- **上下文溢出恢复**：`generateAssistantMessageWithOverflowRecovery()`（:741）封装，配合 `ContextWindowOverflowError` 触发 compaction 重发。
- **连接器看门狗**：`ConnectorSupervisor`（core index）带 `RESTART_BASE_DELAY_MS/RESTART_MAX_DELAY_MS/RESTART_GIVE_UP_AFTER` 指数退避重启、`STOP_SIGTERM/SIGKILL_TIMEOUT_MS` 优雅停止超时——外部子进程崩溃自动拉起。**源码确认（导出常量名）**。
- **会话持久化与版本化**：`SqliteSessionStore` + `SessionVersioningService`（`SessionVersioningError`），会话快照 `createCoreSessionSnapshot`，重启可恢复。
- **边界/资源**：命令输出 `truncateCommandOutput` 截断；MCP 连接 `DEFAULT_MCP_CONNECT_TIMEOUT_MS` 与 `McpSettingsLockTimeoutError`。

---

## 7. 高可用机制【重点】

- **进程隔离与重启**：`SubprocessSandbox` 把命令/连接器放进子进程；`ConnectorSupervisor` 提供带退避与"放弃阈值"的崩溃重启（见上）。
- **无状态循环 + 持久化会话**：Agent 循环本身不持有持久状态，会话消息存 SQLite（`SqliteSessionStore`），可随时停、随时 `restore`（`RestoreSessionInput`）；checkpoint 机制（`checkpoint-diff`/`checkpoint-restore`/`findCheckpointForRun`）支持回到历史检查点对比 diff。
- **远程运行时/去中心化部署**：core 导出 `RuntimeHost`/`LocalRuntimeHost`/`RemoteRuntimeHost`/`HubRuntimeHost`，运行时可在本地也可在 Hub/远程（`ws` 依赖），即"引擎与宿主分离"，天然支持横向把 Agent 跑在远端。
- **并发/调度**：`cron/schedule-service`（package.json `verify:routines` 指向 `src/cron/schedule-service.test.ts`）支持定时自动化；多 Agent 团队由 `AgentTeamsRuntime` 编排，spawn 子 agent 拥有独立 session 图（`makeTeamTaskSubSessionId`）。
- **可观测性**：全量 OpenTelemetry traces/metrics/logs + PostHog 特性开关（`FeatureFlagsService`/`NoOpFeatureFlagsProvider` 降级）。
- **局限（如实）**：限流/重试细节在 `@cline/llms` 层，本报告未逐行读其 provider 重试实现，标为推断；横向扩展依赖外部 Hub，非内建分布式协调。

---

## 8. 自我进化机制【重点】

- **completion reminder 自修正**：当模型一轮不调工具但被认为未完成时，`getCompletionReminderMessages()`（:799）自动注入提醒消息并 `continue`，推动模型继续——一种"自我检查是否真的做完"的回路。
- **上下文压缩（长程记忆维护）**：`createContextCompactionPrepareTurn` + `SessionCompactionState`（可序列化、可投影），把超长会话压缩为摘要续跑，相当于"遗忘旧细节、保留要点"。
- **经验/检查点学习**：checkpoint-diff 让人类或策略能对比"某一步之前 vs 之后工作区变化"，作为复盘与回滚依据；`captureMistakeLimitReached` 事件把"犯错次数"纳入可观测。
- **工具学习**：README 明确支持"ask Cline to create custom tools on the fly"，配合 MCP 动态发现工具（`probeMcpServerConnection`）；插件系统可注册新工具。
- **未发现**：在线权重学习、自动 A/B 基准；其"进化"同样是符号式（压缩记忆、复盘、动态工具）。**推断**：复盘结论如何反哺后续 prompt 未见显式回路。

---

## 9. openmate 可借鉴点【重点】

openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。

- **【P0】"循环核心"与"能力宿主"分层**：照搬 `@cline/agents`（纯循环、无 I/O、可跑浏览器）与 `@cline/core`（文件/命令/网络）分离的思路。openmate 现有 Web 版、规划桌面/手机——把 Agent 主循环做成纯 Python 内核，各端只实现工具后端，就能真正一套引擎多端复用。
- **【P0】迭代上限 + 可中止 + 错误三分类**：直接照抄 `maxIterations` 硬闸、`AbortController` 式中止、以及 `ControlledStopError / ContextWindowOverflowError / 普通失败` 的状态机（aborted/failed/completed）。openmate 面向移动端必须能随时停、能区分"用户主动停"和"真出错"。
- **【P0】四类生命周期 Hooks**：把 beforeModel/afterModel/beforeTool/afterTool 做成插件点。openmate 后续加"费用审计、敏感操作审批、上下文注入"都应走 hook，而非硬编码进主循环。
- **【P1】上下文溢出自愈 + 会话 SQLite 持久化 + checkpoint**：移动端杀进程常见，照抄 `SqliteSessionStore` + `restore` + checkpoint-diff，让用户切后台/重开 App 后对话与工作区状态可恢复、可回滚。
- **【P1】子进程看门狗退避重启**：openmate 若跑本地命令/本地模型子进程，借鉴 `ConnectorSupervisor` 的 `base/max/give_up` 退避常量设计，避免崩溃抖动。
- **【P2】OpenTelemetry 结构化事件**：`captureToolUsage/captureTokenUsage` 这类细粒度事件，对多端产品排障和用量计费很有价值。

---

## 10. 源码验证标注

**源码直接阅读**：
- `sdk/packages/agents/src/agent-runtime.ts`（主循环 727–925 行、hooks/abort/error 分类、maxIterations、completion reminder、overflow recovery 调用）
- `sdk/packages/core/src/index.ts`（全文导出边界：ClineCore、SqliteSessionStore、ConnectorSupervisor、MCP、tools、telemetry、team、checkpoint、compaction）
- `sdk/packages/agents/src/index.ts`、根 `package.json`、`sdk/packages/core/package.json`（monorepo 布局、依赖、版本）

**文档/推断**：
- ConnectorSupervisor 的退避算法具体数值未读实现，仅据导出常量名推断。
- `@cline/llms` 层的 provider 重试/限流细节未读，仅据错误类名（ClinePassLimitError 等）推断。
- 多 Agent 团队内部消息协议未逐行读，仅据 team 模块导出推断。
- 星级/活跃度来自清单快照与 GitHub API 元信息。
