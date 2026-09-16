# Cline (#22) 功能研究 — 源码深读

研究时间：2026-09-16
源码：~/agent-research-src/cline（浅克隆，monorepo）
重要背景：Cline 已从 VS Code 单体扩展重构为 monorepo（Bun workspaces）：`sdk/packages/{shared,llms,agents,core}` + `apps/{vscode,cli,cline-hub}`。经典 `Cline` 大类已拆掉——**无状态 agent loop 在 `@cline/agents`（agent-runtime.ts, 2349行），有状态编排/存储/checkpoint 在 `@cline/core`**，工具集也改名（run_commands / read_files / edit_file / apply_patch / search_codebase / skills / fetch_web_content）。依赖方向 strict：shared → llms → agents → core → apps，"stateful 逻辑不许下沉到 agents"。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **Git快照Checkpoint（含untracked三父提交）**：checkpoint-hooks.ts 每步工具执行后用 `git stash create` + 手工 `commit-tree` 合成第三父提交捕获 untracked 文件，快照存入**私有ref命名空间**（不出现在用户 `git stash list`），4种outcome（stash/head_clean/head_fallback/skipped） | 没有（trajectory页面的"checkpoint"只是图标名） | 没有（grep stash/commit-tree零命中） | **完全没有** | P0。OpenSoul在limb工具执行后挂钩，`git stash create`+commit-tree配方可直接照抄 |
| 2 | **Checkpoint事务性回滚**：checkpoint-restore.ts `beginWorktreeRestoreTransaction`——破坏性restore前 `stash push --include-untracked` 移入私有ref，`commit()/rollback()` 两段式；session-versioning-service 把**工作区回滚与LLM消息历史回滚绑定**（会话倒带到checkpoint点） | 没有 | 没有 | **完全没有** | P0。回滚必须"文件+对话"一起退，否则模型认知与磁盘不一致 |
| 3 | **Checkpoint内容对比**：checkpoint-diff.ts 按 ref `git show ref:path` 读取左右内容做per-file diff，含路径逃逸检查（diff路径不许超出workspace） | 没有 | 没有 | **完全没有** | P1（依赖#1） |
| 4 | **Hook系统10事件**：agent_start/resume/abort/end/error/tool_call/tool_result/prompt_submit/pre_compact/session_shutdown；HookControl 可 `cancel/review/overrideInput/systemPrompt/appendMessages/replaceMessages`——hook能改写工具输入、注入消息 | 没有（src/hooks/全是React hooks） | 没有（link/connector.py 的 hook 是外部webhook，非agent生命周期） | **完全没有** | P0。与OpenHands#1互证为行业标配；先做tool_call(PreToolUse)+tool_result(PostToolUse)+prompt_submit三个 |
| 5 | **三模式 Plan/Act/YOLO + 命令黑名单守卫**：runtime-builder 按 mode 组装；plan模式下 command-guard.ts 对 shell 命令做轻量AST解析（mask引号/heredoc/转义/注释后按分隔符切分），BLOCKED_COMMANDS 集（rm/mv/chmod/重定向写文件等40+命令）直接返回tool error | 没有 | 没有（immune只有IP黑白名单+RBAC，无命令级分析） | **完全没有** | P0（安全关键）。OpenSoul的execute工具接command-guard，plan模式先只做"只读"预设 |
| 6 | **ToolPolicy工具级策略+人工审批回调+连续失误熔断**：`Record<string,ToolPolicy>` 每工具策略，非auto-approve时 `requestToolApproval` 回调弹给客户端；`maxConsecutiveMistakes` 达上限回调终止 | permission页面是RBAC资源策略（role/resource/action），非工具执行审批 | 没有 | **完全没有** | P0。用户"审批"刚需；在cortex工具执行链加policy查表+审批回调 |
| 7 | **上下文溢出自动压缩恢复链**：agent-runtime 捕获 ContextWindowOverflowError → `prepareTurn` 强制compaction并**自动重试一次**；区分三种终态：无可压缩历史（系统提示词就超）、压缩后仍超、compaction管线不可用，各给不同终态错误；compaction状态持久化（session-compaction.ts） | 没有 | 部分：sessions_api.py 有 compacted 标志位，但无溢出检测→强制压缩→重试闭环 | **部分差距** | P1。补"溢出异常→压缩→重试一次→终态分类报错"闭环 |
| 8 | **FileContextTracker文件上下文追踪**：task metadata 持久化 files_in_context / model_usage / environment_history，记录哪些文件进过上下文、何时 | 没有 | 没有 | **完全没有** | P1。为#7压缩选择"保留哪些文件引用"提供数据 |
| 9 | **.clineignore保护文件**：ClineIgnoreController 用 gitignore 语法控制模型可见/可改的文件集合 | 没有 | 没有（grep clineignore/.ignore零命中） | **完全没有** | P1。OpenMate用户有本地文件保护诉求，实现成本低（pathspec库） |
| 10 | **MCP完整栈**：OAuth完整实现（本地callback server+PKCE，oauth.ts）、原生Streamable HTTP传输、**自动把旧条目的 `npx mcp-remote` 代理改写为原生传输**（remote-proxy.ts，防子进程偷开浏览器）、plugin可携带MCP server注册 | mcp页面（对接OpenSoul注册表） | 部分：mcp/server_registry.py（sqlite注册+seed），无OAuth、无streamable HTTP | **部分差距** | P1。先补streamable HTTP+OAuth；proxy改写逻辑是防坑好设计 |
| 11 | **Team多Agent运行时**：lead/teammate角色+rolePrompt+独立modelId/maxIterations；TeamMailbox消息、mission log、team task create/claim/complete/block、**TeamOutcome fragments评审流**（draft/reviewed/rejected，多agent产出片段经评审拼装）、shutdown_teammate工具 | 没有 | 部分：cortex/multi_agent_coord.py（register/heartbeat/file_conflict/send_message），无角色化、无任务认领、无outcome评审 | **部分差距** | P1。把multi_agent_coord升级为lead/teammate+task claim模型 |
| 12 | **文件式Cron自动化全链**：cron spec文件 → SqliteCronStore(cron.db) → CronMaterializer(spec→可运行) → CronRunner → CronReconciler(watcher对账) → **CronReportWriter（每次运行产出报告）** → schedule_tool（**LLM可自己创建定时任务**） | cron页面 | 部分：api/hermes_cron.py CRUD/pause/resume/run（代理hermes cron）+ will/proactive.py轮询观察器；无运行报告、无LLM自建schedule工具 | **部分差距** | P1。重点补 schedule_tool（LLM把任务固化为定时job）+ 运行报告落盘 |
| 13 | **Agenda任务工具+Focus Chain**：task-tool（todo域 create/list/claim/complete/block，规避Anthropic顶层oneOf限制的schema技巧）、agenda-task-manager持久化调度；**focus chain todo写成markdown文件**（`focus_chain_taskid_*.md`），用户直接编辑文件即更新任务清单 | 有todo UI（cortex-client TaskItem） | 部分：tasks/agenda无对应物，intelligence/intent仅todo字样 | **部分差距** | P1。todo落盘为可编辑md是低成本高体验设计 |
| 14 | **会话历史FTS5全文搜索**：session-history-search.ts 用 sqlite fts5 virtual table 索引全部历史会话，支持会话内搜索跳转 | search页面 | 部分：hippo/long_term_memory.py 有fts5，但那是记忆库非**会话历史**搜索 | **部分差距** | P2。sessions表加fts5 virtual table即可 |
| 15 | **Marketplace三原语统一**：mcp/skill/plugin 统一 MarketplaceEntry，安装/卸载链按类型分派（uninstallMarketplaceEntry），全局skill路径解析+安装检测 | marketplace页面 | 部分：api/marketplace.py 已有skill sources同步（前报告#8确认） | **部分差距** | P2。差在mcp/plugin统一原语和卸载链 |
| 16 | **Skills执行工具**：skills工具（skill名+args入schema），marketplace skill候选/全局路径/已装检测一体 | skills页面 | 部分：api/skills.py + gene | **部分差距** | P2 |
| 17 | **SQLite跨实例工作区锁**：SqliteLockManager（better-sqlite3+文件排他锁建库、stale lock 1分钟超时清理、instanceOwner归属）——防多窗口/多进程同时操作同一workspace | 没有 | 没有（fcntl/flock仅terminal_ws.py） | **完全没有** | P1。OpenSoul若多实例部署（NAS+本机）是前置条件 |
| 18 | **远程环境执行**：remote-environments/remote-helper（RemoteEnvironmentProfile、SSH目标、tunnel进程管理、远程命令执行） | 没有 | 没有 | **完全没有** | P2 |
| 19 | **命令执行控制器**：run-command-execution-controller（长命令流控/中断/退出码 CommandExitError）、输出裁剪常量（MAX_COMMAND_OUTPUT_CHARS等三档）、heredoc边界检测、PowerShell edition感知、超时分层（default_setting/configured_setting双来源遥测） | 部分：terminal_ws | 部分：limb是RPA任务执行器，无流式输出裁剪/中断控制器 | **部分差距** | P1。输出裁剪常量+超时分层可直接抄 |
| 20 | **Usage遥测**：model_usage按task持久化进metadata、usageDelta增量计算、逐请求telemetry（tool_name/iteration/durationMs） | spending页面 | 部分：gland/token_meter.py 有budget_limit计量 | **部分差距** | P2。差per-task model_usage记录链 |

## 源码亮点

- **monorepo分层纪律**：shared→llms→agents→core单向依赖，agents包严格无状态（无session/storage），AGENTS.md写明"改哪层的代码路由到哪个包"。对OpenMate/OpenSoul/acp-proxy三仓边界划分直接可抄。
- **Checkpoint的git工程**：`git stash create`不带untracked → 手工commit-tree合成第三父提交补上；快照ref藏在私有命名空间不污染用户stash列表；restore前必先stash当前现场（可commit可rollback）——每个细节都是踩坑后的心智。
- **command-guard的务实安全观**：明说"这不是shell解释器，抓不全（如python -c写文件），只拦模型最常见的文件修改手法"——mask引号/heredoc后再split防误报，黑名单好加。比追求完备AST更实用。
- **ContextWindowOverflowError三终态分类**：无可压缩内容 / 压缩后仍超 / 无压缩管线，错误消息直接告诉用户下一步怎么办（减附件/换大窗口/开新会话），并且自动重试只做一次防死循环。
- **Anthropic schema兼容技巧**：task-tool顶层不许oneOf → 对外advertise扁平object、execute内部再严格校验各域字段。
- **MCP remote-proxy改写**：识别老marketplace条目的 `npx mcp-remote <url>` 形态自动升级为原生streamable HTTP——防子进程副作用（偷开浏览器）、防OAuth重复处理。
- **Focus Chain文件即UI**：todo列表是workspace里的md文件，用户用任何编辑器改完即生效，注释里写明"Edit this markdown file to update your focus chain list"。

## 可复用设计

1. **Checkpoint配方**（stash create + commit-tree第三父 + 私有ref + 事务性restore + 消息历史绑定回滚）→ OpenSoul limb工具执行链，整套照抄，是"改坏了能退"的底座
2. **HookControl能力集**（cancel/overrideInput/appendMessages/replaceMessages）→ 比OpenHands的allow/deny更进一步，hook可以改写而非只拦截；OpenSoul cortex挂载点按此设计
3. **command-guard黑名单+mask预处理** → OpenSoul执行工具的plan模式守卫，一天工作量
4. **上下文溢出→强制压缩→重试一次→终态分类** → OpenSoul sessions compacted标志位升级为完整闭环
5. **ToolPolicy查表+requestToolApproval回调+连续失误熔断** → OpenMate审批UI + OpenSoul cortex策略引擎的契约
6. **Focus Chain md文件即清单** → OpenMate todo改造，零后端成本
7. **Cron: LLM可自建schedule + 运行报告落盘** → OpenSoul hermes_cron/proactive 升级方向
