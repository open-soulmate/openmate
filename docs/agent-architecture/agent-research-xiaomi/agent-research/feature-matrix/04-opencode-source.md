# OpenCode (#4, 207k stars) 功能研究

研究时间：2026-09-16（源码级深读）
源码：~/agent-research-src/opencode（224MB，Bun + Effect-TS，30+包）
定位：开源 coding agent（对标 Cursor/Claude Code），TUI + Desktop + Web + SDK

## 架构核心

- **Effect-TS 全家桶**：服务以 `Context.Service` 声明、Layer 组装、Deferred 做人机交互挂起。
- **Session V2 持久准入**：`Session.prompt()` 先写入持久 `session_input` 行，再发**建议性** `SessionExecution.wake()`；序列化 runner 在安全边界把已准入输入提升为可见用户消息。复用 message ID 只在 Session+prompt+投递模式全匹配时做精确重试，冲突即失败。
- **分层依赖纪律**：Schema → Core/Protocol → Server；Client 只依赖 Schema/Protocol，永不依赖 Core/Server。
- 一个 provider turn 只允许**一次** `llm.stream(request)`，续跑前重放投影历史——禁止用内存 tool loop 编排。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **文件快照/时间旅行**（807行）：git 隐式对象库存 patch，`track/patch/restore/revert/diff/diffFull`，7天 prune、2MB 上限、Windows 长路径/crlf 全处理 | 无（只有 WorkspacePanel 展示） | 无（vital/collector 的 snapshot 是指标快照，非文件快照） | **完全缺** | 用户之前问过快照系统——这就是标准答案：`git hash-object`+`git apply`，不建 commit，纯对象库 |
| 2 | **Git Worktree 会话隔离**（623行）：每会话可开独立 worktree（名字+分支+附加启动脚本），事件总线广播 create/remove | 无 | 无（git_api 只读 worktree_status 字符） | **完全缺** | 多 agent 并发改同一仓库的正解；`git worktree add` 本身极简单，难在生命周期管理 |
| 3 | **工具级权限系统**：`ask/reply/list` + Deferred 挂起；**通配符规则集**（`permission`+`pattern` 双通配，`findLast` 取最后匹配规则，默认 `ask`）；批准可写成持久规则 | 有权限页但只是 **RBAC 用户角色**（policy: role/resource/action） | 有 casbin RBAC（同上，管的是用户不是工具） | **部分有但错位**：缺的是"agent 执行 `bash:rm *` 前问人"这一层 | 在 OpenSoul 加 tool-execution permission 层，复用 casbin 模型换 subject=tool；OpenMate 加审批气泡 |
| 4 | **Question 工具**：模型发结构化多选题（选项数组），Deferred 挂起等用户答复，可被 dismiss（RejectedError） | 有 task-choice-menu 组件雏形 | 有 ask_user 相关（未结构化） | **部分有** | 补 schema：questionID + options + deferred，与权限共用挂起模式 |
| 5 | **CodeMode 受限代码执行**：模型写一小段 JS，只能调用宿主提供的 schema 描述工具，**无环境文件系统/进程/网络/模块权限**；支持串行/并行/分支/循环 | 无 | 无 | **完全缺（重要）** | 这是"N次工具调用→1次代码执行"的 token 优化，也是安全执行不可信编排的解法；比给 execute_code 更安全 |
| 6 | **LSP 集成**（3311行）：真连 language server，结构化跳转/诊断/补全，非文本 grep | 无 | 无 | **完全缺** | coding 场景刚需；Python 侧接 pyright-langserver 即可起步 |
| 7 | **会话分享**：share 生成只读链接（share/src，442行） | 无 | 无（nest 只有跨租户会话开关） | **完全缺** | 对用户"可观测/汇报"诉求有用：一键生成会话只读链接给同事看 |
| 8 | **云同步 sync**：本地↔云端会话同步（schema 声明式） | 无 | 无 | **不适用**（用户禁止上传云端，明确跳过） | 记录：用户红线，不做 |
| 9 | **HTTP 录制回放**（http-recorder 包）：录制 LLM 请求/响应用于无 key 回归测试 | 无 | 部分（9个文件提到 replay，需核实性质） | **几乎完全缺** | 调 provider 适配层时极有用：录一次，之后 CI 无 key 回归 |
| 10 | **Session V2 持久准入**：输入先落盘再调度，崩溃后可恢复；advisory wake 只排空合法 inbox 行 | 无（前端直接发请求） | 部分（有 pipeline 但非准入/执行分离） | **完全缺** | 与 dsh 的 inbox/claim 同思想：**持久先于执行**，防"用户以为发出去了其实丢了" |
| 11 | **Background 后台任务**：`background/job.ts`，长任务转后台 | 无 | 无 | **完全缺** | 与 dsh jobs 同；比 Hermes 的 background terminal 更结构化 |
| 12 | **Patch 引擎**（686行）：结构化 diff 生成/应用（独立于 git 的 edit 表达） | 无 | 无 | **完全缺** | agent 改文件的核心基建；比整文件重写省 token 且可校验 |
| 13 | **统计站 stats**：独立 SolidStart 站 + Lambda，做 runtime/用量统计 | 无 | 部分（cost/token 有14个文件命中） | **部分有** | OpenSoul/vital 已有监控，补 per-session/per-model 成本聚合 |
| 14 | **Enterprise/控制面**（1519行）：集中管理、身份、策略下发 | 无 | 部分（nest 多租户 + users） | **部分有** | 企业售前相关，优先级中 |
| 15 | **IDE 集成 ide/**：编辑器桥接（VSCode 等） | 无 | 无 | **完全缺** | 用户场景偏办公，优先级低 |
| 16 | ACP / MCP / Skill / Plugin | 有 ACP 代理(8092) | 有 mcp(30)、skill(19) | **基本已有** | — |

## 源码亮点

1. **权限求值一行核心**：`rulesets.flat().findLast(rule => wildcard(permission) && wildcard(pattern)) ?? {action:'ask'}` —— 最后一条匹配规则赢，默认 ask。规则集分层（全局/项目/会话）即多个 ruleset 顺序叠加。

2. **Question/Permission 共用同一 Deferred 挂起模式**：`Map<ID, {info, deferred}>` + ask 时注册 + reply 时 resolve + dismiss 时 reject。OpenSoul 可一个基类复用。

3. **快照不建 commit**：`git hash-object -w` 写对象 + patch 记 `{hash, files[]}`，restore 用 `git apply`；prune 7天、总量 2MB 双限。

4. **CodeMode 的威胁模型**：不是"沙箱里跑代码"，而是"根本没有危险 API 可调"——只注入 schema 描述的工具函数。这比 Docker 沙箱轻一个数量级。

5. **Session V2 的重试语义**：message ID 复用只做"精确重试"，三元组（Session/prompt/投递模式）任一不符即失败，绝不静默产生重复执行。

## 可复用设计（OpenMate/OpenSoul 落地排序）

**P0**
1. 文件快照/restore（#1）——用户已问过快照系统，git 对象库方案 500 行内可成
2. 工具级权限审批（#3）——OpenSoul casbin 换 subject 即可，OpenMate 加审批 UI
3. Patch 引擎（#12）——省 token + 可校验，是 agent 改文件的基建

**P1**
4. CodeMode 受限执行（#5）——token 优化 + 安全
5. Question 结构化提问（#4）——与权限共用挂起模式
6. 持久准入 Session V2（#10）——可靠性基建

**P2**
7. Worktree 隔离（#2）、会话分享（#7）、HTTP 录制回放（#9）、LSP（#6）

**明确不做**：云同步（#8，用户禁止上传云端）
