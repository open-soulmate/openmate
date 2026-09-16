# Claude Code (#10, 145k★) 功能研究 — npm 源码逆向

源码获取方式：仓库不开源，从 npm 包逆向。
- `@anthropic-ai/claude-code@2.1.273` → 仅 7 个文件（install.cjs / cli-wrapper.cjs / bin/claude.exe / **sdk-tools.d.ts 168KB**）
- `@anthropic-ai/claude-agent-sdk@0.3.273` → **sdk.d.ts 9,313 行 + sdk-tools.d.ts 4,183 行 + sdk.mjs + bridge.mjs**

> 结论：Anthropic 把**全部工具 schema 和全部 SDK 类型都以 `.d.ts` 形式公开发布**。
> 这是本次 100 agent 调研中信息密度最高的一份源码——比绝大多数开源项目更能说明"行业标杆的完整功能面"。
> 缓存位置（已持久化）：`~/agent-research-src/claude-code-npm/agent-sdk/`（sdk.d.ts 465KB + sdk-tools.d.ts 168KB）
> 与 `~/agent-research-src/claude-code-npm/cli/`（sdk-tools.d.ts 168KB）

## 一、33 个 Hook 事件（`HOOK_EVENTS` 常量，完整枚举）

```
PreToolUse, PostToolUse, PostToolUseFailure, PostToolBatch,
Notification, UserPromptSubmit, UserPromptExpansion,
SessionStart, SessionEnd, Stop, StopFailure,
SubagentStart, SubagentStop,
PreCompact, PostCompact,
PreModelSwitch, PostModelSwitch,
PermissionRequest, PermissionDenied,
Setup, TeammateIdle, TaskCreated, TaskCompleted,
Elicitation, ElicitationResult,
ConfigChange, WorktreeCreate, WorktreeRemove,
InstructionsLoaded, CwdChanged, FileChanged, DirectoryAdded, MessageDisplay
```

## 二、内置工具清单（sdk-tools.d.ts 全量）

基础：Bash / FileRead / FileWrite / FileEdit / Glob / Grep / NotebookEdit / REPL / TodoWrite / WebFetch / WebSearch
计划与隔离：EnterPlanMode / ExitPlanMode / **EnterWorktree / ExitWorktree**
子 agent 与任务：Agent / TaskCreate / TaskGet / TaskList / TaskUpdate / TaskOutput / TaskStop
目标与技能进化：**ProposeGoal / ProposeSkills**
调度与唤醒：CronCreate / CronList / CronDelete / **ScheduleWakeup**
观测与通知：**Monitor / PushNotification / ReadNotifications / RemoteTrigger / SendFeedback**
MCP：Mcp / ListMcpResources / ReadMcpResource / ReadMcpResourceDir / RefreshMcpTools
协作与产物：**Workflow / Projects / ClaudeDesign / ReportFindings / Artifact / AskUserQuestion / ShowOnboardingRolePicker**

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|------|------|------|------|
| 1 | **33 个 Hook 事件**（见上），每个 hook 输入是结构化 `*HookInput`，输出 `HookJSONOutput` 可**异步或同步**返回决策；含 `HookCallbackMatcher`（按工具名/参数匹配注册） | 无 | 部分（link/connector.py 有 hook 字样但是连接器，非生命周期钩子） | **部分有** | **P0**。前 4 轮（codex/gemini/langchain/opencode）已三方印证；本轮给出**权威完整事件清单**，直接照抄命名。OpenSoul 落 `nerve/hooks.py` |
| 2 | **ProposeGoal 工具**：agent 提出可验收的目标条件（≤500 字，**必须让独立 evaluator 能从对话中验证**，如 "all tests pass, bun test exits 0"），默认弹审批框；`ask_user=false` 仅当用户原话已明确该目标，且须在 transcript 里可见、可 `/goal clear` | 无 | 部分（will/dag_planner 有目标但无"可验收条件+独立评估"） | **部分有** | **P0**。与 LobeChat GoalSupervisor 二方互证。关键纪律：**条件必须可由第三方独立验证** |
| 3 | **ProposeSkills 工具**：agent 主动提议 skill（`kind: new\|improvement`，1-3 条批量），字段含 `description`（<200 字符，决定何时被使用）、`evidence`（**观察到该流程的 memory 文件路径**）、**`skillMd`（完整 SKILL.md 原文，improvement 时必须先读现有 SKILL.md 并保留全部值得保留的内容）** → 用户审阅卡片保存 | 无 | 部分（gene/skill_learner 自动学但无"提议→审阅卡片"） | **部分有** | **P0**。与 LobeChat self-iteration 二方互证，但 Claude Code 更进一步——**提议里就带完整 SKILL.md 正文**，用户一键保存。用户"没有进化"痛点的最直接解法 |
| 4 | **ScheduleWakeup 工具**：agent 自己决定"多久后再醒"（delaySeconds 被 runtime 钳到 [60,3600]），必须给出 `reason`（一句话，进 telemetry + 展示给用户）；**`noop` 字段**：true=这次检查什么都没发生，false=有进展；**连续 noop 被折叠显示并统计 streak**；`stop=true` 结束循环 | 无 | 无（will/proactive 有调度，但 agent 不能自主定延迟） | **完全没有** | **P0**。这是"可观测性"的教科书设计：**agent 自报 noop + 连续 noop 折叠 + streak 计数**，用户一眼看到"它在干嘛/是不是空转"。直接解用户"我都不知道他们在干嘛" |
| 5 | **Monitor 工具**：agent 注册监控器，`command`（每行 stdout=一个事件，退出即结束）或 `ws`（每帧=一个事件，关闭即结束），`timeout_ms` 默认 5 分钟、上限 30 分钟，到期通知 agent 可重新武装 | 无 | 部分（immune/intrusion 有监控但不暴露给 agent） | **部分有** | **P1**。把"进程/日志流监控"变成一等工具 |
| 6 | **文件回退 RewindFilesResult**：`enableFileCheckpointing` 选项 + `canRewind / filesChanged / insertions / deletions / **skippedLinks**`；skippedLinks 专门统计**因 symlink/hardlink/父目录指向变化/备份不可读而拒绝恢复的文件数**，并在注释里详细区分 dryRun 与真实 rewind 的字段语义 | 无 | 无（marrow/backup.py 是备份非按 checkpoint 回滚） | **完全没有** | **P0**。安全关键。**链接安全拒绝**这一层是绝大多数快照系统都漏掉的 |
| 7 | **上下文用量分类明细 `SDKContextUsage`**：`total_tokens / raw_max_tokens / percentage / over_limit{tokens_over, kind: hard_limit\|compaction_window}` + 四类明细数组：**`mcp_tools[]`（每个 MCP 工具多少 token）、`memory_files[]`（每个记忆文件 token + 来源标签）、`agents[]`（每个 agent 定义 token + source）、`skills[]`（含 plugin_name）** | 无 | 部分（token_meter 只有总量） | **部分有** | **P0**。用户"不知道上下文被什么吃掉了"——这是唯一见到的**逐项 token 归因**。OpenSoul `cortex/token_attribution.py` |
| 8 | **Settings 溯源 `ProvenanceEntry`**：每个设置值记录 `source` + 绝对路径 + `policyOrigin`（helper/remote/plist/hklm/file/parent/hkcu） | 无 | 无 | 完全没有 | **P1**。"这个配置到底哪来的"——多层配置叠加系统的标配，排查成本直降 |
| 9 | **权限五档模式**：`default / acceptEdits / bypassPermissions / plan / dontAsk / auto`（6 个）+ `PermissionUpdate`（addRules 等）+ **`PermissionUpdateDestination`：userSettings / projectSettings / localSettings / session / cliArg**（权限规则可"记住到哪一层"） | 无 | 部分（immune 有 casbin 但是用户 RBAC 非工具级，前轮已确认） | **部分有** | **P0**。"本次允许 / 本会话允许 / 本项目允许 / 用户级允许"四层目的地是工具审批的标准答案 |
| 10 | **沙箱三段配置 `SandboxSettings`**：`network`（allowedDomains/deniedDomains/**strictAllowlist**/allowUnixSockets/allowLocalBinding/allowMachLookup/**httpProxyPort/socksProxyPort/tlsTerminate{caCertPath,caKeyPath}**）+ `filesystem`（allowWrite/denyWrite/denyRead/allowRead/**allowManagedReadPathsOnly**）+ **`credentials`**（files/envVars，`mode: deny\|mask`，支持 **JWT decode + maskClaims + maskDuplicates + injectHosts + onExtractNoMatch: deny\|error\|warn**） | 无 | 部分（mirror/sandbox.py 目录级） | **部分有** | **P0**。**凭证脱敏做到 JWT claim 级**（只遮特定 claim 而非整串）+ `injectHosts`（把凭证注入到指定 host 的请求）—— 这是企业级机密管理的完整答案 |
| 11 | **Per-agent 隔离配置 `AgentDefinition`**（21 个字段）：`tools / disallowedTools`（**支持 `mcp__server` / `mcp__server__*` / `mcp__*` 服务器级通配**）、`model`（可 `inherit`）、`mcpServers`（agent 私有 MCP）、`skills`（预加载）、`initialPrompt`（作为主线程 agent 时自动首轮）、`maxTurns`、`background`、`omitClaudeMd`（**子 agent 不加载用户/项目/本地指令文件，只保留 managed 策略文件**）、**`memory` scope（user/project/local → `~/.claude/agent-memory/<agentType>/`）**、`effort`、`permissionMode`、**`observer` + `observerMessage`** | 无 | 部分（nest/ 有子 agent 但配置面窄） | **部分有** | **P0**。**`observer` 字段是全新设计**：每个 agent 运行时自动 spawn 一个只读观察者 agent，接收活动摘要、通过 ObserverReport 工具上报，**绝不参与任务** |
| 12 | **子 agent 独立记忆目录**：`~/.claude/agent-memory/<agentType>/`（user）/ `.claude/agent-memory/<agentType>/`（project）/ `.claude/agent-memory-local/<agentType>/`（local） | 无 | 部分（hippo 记忆全局，无按 agentType 分目录） | **部分有** | **P1**。低成本：按 agent 类型分记忆目录 |
| 13 | **会话存储全套 API**：`listSessions / getSessionInfo / getSessionMessages / forkSession / importSessionToStore / renameSession / tagSession / foldSessionSummary / deleteSession / listSubagents / getSubagentMessages`；`SDKSessionInfo` 含 **`gitBranch` / `cwd` / `tag` / `customTitle` / `firstPrompt` / `fileSize`**；`SessionStore` / `InMemorySessionStore` 可插拔 | 无 | 部分（sessions_api 只有 compacted 标志位，前轮已确认无 fork/tag） | **部分有** | **P0**。**forkSession + tagSession + foldSessionSummary** 前几轮（pi/open-webui）已互证，本轮是官方权威实现 |
| 14 | **会话内 cron `SessionCronSummary`**：每个会话可挂 cron（`schedule` + `recurring` + `prompt`，**prompt 截断到 1000 字并追加 "… [+N chars]" 标记**）；一次性 wakeup 的 `recurring=false`（cron 字段编码单次触发时间） | 无 | 部分（vital 有 cron 但不在会话维度） | **部分有** | **P1**。把 cron 绑到会话上下文 |
| 15 | **Workflow 工具（脚本化编排）**：脚本必须以 `export const meta = { name, description, phases }`（**纯字面量，禁止计算值**）开头，正文用 `agent()/parallel()/pipeline()/phase()`；支持 `args`（原样暴露为全局，**注释明确警告不要传 JSON 字符串否则 args.filter 会坏**）、`scriptPath`（**每次调用都把脚本持久化到会话目录并返回路径**，迭代时用 Write/Edit 改该文件再以同 scriptPath 重调）、**`resumeFromRunId`（未改动的 agent() 调用直接返回缓存结果，只重跑被编辑或新增的）** | 无 | 部分（will/dag_planner 有 DAG） | **部分有** | **P0**。**`resumeFromRunId` 的"按 (prompt,opts) 哈希做结果缓存"** 是长时多 agent 任务的杀手锏——改一个节点只重跑该节点 |
| 16 | **Projects 工具（项目知识库 CRUD）**：`project_info/read/search/write/delete` + `project_memory_list/read`；**`local_path` 让工具自己读文件上传，"contents never enter your context"**；**`present_to_user`** 标记这份文档是用户要看的交付物 | 无 | 部分（api/marketplace 有 skill 同步，非项目文档库） | **部分有** | **P1**。"文件内容不进上下文"的上传通道 + "交付物标记"都很实用 |
| 17 | **SendFeedback 工具（结构化反馈上报）**：`type: bug\|idea\|missing_capability` + **`failure_mode` 14 个枚举**（instruction_following / destructive_actions / code_quality / repetition_and_looping / model_regression / overconfidence_and_hallucination / context_and_memory / overeager / over_correction / stopping_short / dispute_or_decline / **subagent_overspawn** / tone_or_preachiness / excessive_questions）+ 固定格式（What happened / What the user said / Repro / Evidence / Cause 仅在已验证时） | 无 | 无 | **完全没有** | **P1**。**14 个 failure_mode 是极有价值的失败模式分类法**，可直接用于 OpenSoul 的自我评估与回归测试用例生成。"subagent_overspawn"（子 agent 过度生成）这类细分非常专业 |
| 18 | **RemoteTrigger 工具**：`list/get/create/update/run/**create_webhook_trigger**/list_runs/get_run_log`，webhook 触发器 + 运行日志分页（cursor） | 无 | 部分（api 有 webhook 但非 agent 可管理的触发器） | **部分有** | **P1** |
| 19 | **PushNotification + ReadNotifications**：`status: "proactive"`，正文 <200 字（**注释说明移动端会截断**） | 无 | 部分（gateway 多平台推送） | 部分有 | P2 |
| 20 | **6 档 effort**：`low/medium/high/xhigh/max` 或整数；`ThinkingConfig = ThinkingAdaptive \| ThinkingEnabled \| ThinkingDisabled`；`maxThinkingTokens` | 无 | 部分（cortex 无 effort 分档） | **部分有** | **P1**。按任务难度分配推理预算是成本控制的关键 |
| 21 | **`maxBudgetUsd` / `taskBudget`**：单次任务预算上限 | 无 | 部分（token_meter 有 budget 无 USD） | 部分有 | P1 |
| 22 | **模型拒绝降级**：`SDKModelRefusalFallbackMessage` / `SDKModelRefusalNoFallbackMessage` + `fallbackModel` 选项 | 无 | 无（gland/router 有 cooldown 无 refusal 降级） | **完全没有** | **P1**。"模型拒答"要与"模型错误"分开处理并触发降级链 |
| 23 | **`SDKRateLimitInfo` / `SDKRateLimitEvent`**：限流事件独立消息类型 | 无 | 部分（immune/rate_limiter 是自家限流非上游限流） | **部分有** | P2 |
| 24 | **Elicitation 双 hook**（`Elicitation` + `ElicitationResult`）+ `onElicitation` / `onUserDialog` / `supportedDialogKinds` / `UserDialogRequest/Result` | 无 | 无（前轮已确认 opensoul 无 elicit） | **完全没有** | **P1**。与 LobeChat AskUserBridge 二方互证 |
| 25 | **Worktree 隔离**（`EnterWorktree/ExitWorktree` 工具 + `WorktreeCreate/Remove` hook） | 无 | 部分（api/git_api.py 有 worktree 但非 agent 工具） | **部分有** | P1 |
| 26 | **插件系统**：`SdkPluginConfig` + `SDKPluginInstallMessage` + `pluginDelivery` + `plugins` + **`reloadPlugins` 控制请求**（还有 reloadSkills / reloadOutputStyles） | 无 | 部分（plugin_loader.py） | **部分有** | P2 |
| 27 | **`toolAliases`**：工具别名映射 | 无 | 无 | 完全没有 | P3 |
| 28 | **`excludeDynamicSections`**：可排除系统提示中的动态段 | 无 | 无 | 完全没有 | P2 |
| 29 | **`SDKMirrorErrorMessage`**：镜像错误独立消息 | 无 | 无 | 完全没有 | P3 |
| 30 | **`SDKFilesPersistedEvent`**：文件持久化事件 | 无 | 无 | 完全没有 | P2 |
| 31 | **`perTaskStopAffordance`** + `EXIT_REASONS` / `ExitReason` / `TerminalReason`：退出原因结构化 | 无 | 无 | 完全没有 | P2 |
| 32 | **`SYSTEM_PROMPT_DYNAMIC_BOUNDARY`** + `AgentBuilderContextInjector` 类边界常量 | 无 | 无 | 完全没有 | P3 |
| 33 | **账户多后端**：`apiProvider: firstParty/bedrock/vertex/foundry/anthropicAws/anthropicGoogleCloud/mantle/**gateway**`（企业网关） | 无 | 部分（gland 多 provider） | 部分有 | P1。国内政企"gateway"模式尤其相关 |
| 34 | **`FastModeState` / `FastModeDisabledReason`**：快慢模式切换有状态与禁用原因 | 无 | 无 | 完全没有 | P2 |

## 源码亮点

1. **"提议—审阅—落盘"三段式贯穿目标与技能**（ProposeGoal / ProposeSkills）。
   ProposeSkills 的注释原文："For an improvement this replaces the existing skill's SKILL.md entirely,
   **so read that skill's current SKILL.md first and include everything worth keeping**, not only the changes."
   —— 直接把"别把原来的丢了"写进工具文档。

2. **noop 自报 + streak 折叠**（ScheduleWakeup）。让 agent 明确区分"我查了但没事"和"我推进了"。
   连续 noop 在终端里折叠显示并计数。**这是解决"用户不知道 agent 在干嘛"的最优雅方案。**

3. **Observer agent**：子 agent 运行时自动挂一个只读观察者，收活动摘要、用 ObserverReport 上报、
   **绝不参与任务**。监督与执行彻底分离，且是 per-agent 声明式的。

4. **凭证脱敏到 JWT claim 级**（SandboxSettings.credentials）：
   `mode: mask` + `decode: jwt` + `maskClaims: [...]` + `maskDuplicates` + `injectHosts` +
   `onExtractNoMatch: deny|error|warn`。这不是"把密钥遮掉"，而是"只遮敏感 claim，其余可读，且只注入到指定 host"。

5. **上下文逐项 token 归因**（SDKContextUsage）：MCP 工具 / 记忆文件 / agent 定义 / skill，
   每项多少 token 一目了然，还区分 `hard_limit` 与 `compaction_window` 两种超限性质。

6. **Workflow 的 `resumeFromRunId`**：按 (prompt, opts) 做结果缓存，脚本改一处只重跑一处。
   把"多 agent 编排"从一次性脚本变成可增量迭代的工程。

7. **RewindFilesResult.skippedLinks**：明确处理 symlink/hardlink/父目录指向变化/备份不可读
   四类拒绝恢复，并区分 dryRun 与真实 rewind 的字段语义。安全工程的细节水准。

8. **设置溯源**（ProvenanceEntry + PolicySettingsOrigin 7 种来源）：每一个配置值都能回答
   "是谁在哪一层设的"。

## 可复用设计

| 设计 | 直接复用到 | 难度 | 价值 |
|------|-----------|------|------|
| 33 个 Hook 事件命名与输入/输出 schema | OpenSoul `nerve/hooks.py` | 中 | **极高** |
| ProposeSkills（含完整 SKILL.md + evidence 路径） | OpenSoul `gene/skill_proposer.py` | 中 | **极高** |
| ProposeGoal（可验收条件 + 独立 evaluator） | OpenSoul `will/goal.py` | 中 | 极高 |
| ScheduleWakeup（noop 自报 + streak 折叠） | OpenSoul `will/wakeup.py` + OpenMate 折叠 UI | 中 | **极高** |
| SDKContextUsage 逐项 token 归因 | OpenSoul `cortex/token_attribution.py` + OpenMate 面板 | 中 | **极高** |
| RewindFilesResult + skippedLinks | OpenSoul `marrow/checkpoint.py` | 中高 | 高 |
| SandboxSettings.credentials（JWT claim 级脱敏） | OpenSoul `immune/secret_masker.py` | 中 | 高 |
| 权限四层目的地（user/project/local/session） | OpenSoul 工具审批 | 中 | 高 |
| AgentDefinition.observer（只读观察者 agent） | OpenSoul `nest/observer.py` | 中 | 高 |
| Workflow resumeFromRunId 结果缓存 | OpenSoul `will/dag_planner` 升级 | 中 | 高 |
| 14 个 failure_mode 分类法 | OpenSoul 自评估 + 回归用例生成 | **低** | 高 |
| ProvenanceEntry 设置溯源 | OpenSoul config_manager | 低 | 中 |
| 6 档 effort + ThinkingConfig | OpenSoul gland | 低 | 中 |
| 模型拒答降级链 | OpenSoul gland/router | 中 | 中 |
| 子 agent 按 agentType 分记忆目录 | OpenSoul hippo | **低** | 中 |

## 与前几轮的收敛结论

**五方互证（codex × gemini-cli × langchain × opencode × LobeChat × claude-code）→ OpenSoul 必须补的 P0：**

1. **工具审批流**（本轮给出 6 模式 + 4 层目的地的权威答案）
2. **生命周期 Hook 系统**（本轮给出 33 事件的权威清单）
3. **会话 fork / tag / 摘要折叠**（本轮给出完整 API 面）
4. **技能自提议→审阅→落盘**（本轮 + LobeChat 双方独立实现，且 Claude Code 版更完整）
5. **目标可验收条件 + 独立评估**（本轮 + LobeChat 双方独立实现）
6. **上下文可观测性**（本轮逐项 token 归因 + noop streak 折叠，直击用户两大痛点）
7. **沙箱凭证脱敏**（本轮 JWT claim 级，codex 有 keyring 脱敏）
8. **文件 checkpoint 回滚**（本轮含链接安全）
