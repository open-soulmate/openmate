# Multica 源码级调研报告（Rank 51）

> 调研对象：`multica-ai/multica`
> 报告日期：2026-09-13　｜　数据基线：GitHub `main` 分支

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | Multica（Multiplexed Information and Computing Agent） |
| GitHub | https://github.com/multica-ai/multica |
| Star | 约 4.97w（清单快照 49,686） |
| 主要语言 | Go（后端/daemon/CLI）+ TypeScript/Next.js（Web/Electron 桌面）+ React Native（iOS） |
| 许可证 | Apache-2.0 + 额外托管/商用/品牌条款（见 LICENSE） |
| 一句话定位 | **把"AI 编码 Agent"当作与人类平权的一等团队成员的开源工作台：你像派活给同事一样给它派 issue，它自己领任务、在你可控的运行时上干活、边干边评论、干完交 PR 给人 review** |

**目标用户/场景**：已经在用 Claude Code / Codex / Cursor 等多个编码 Agent CLI 的软件团队，痛点是"每个 agent 一个终端标签页、会话结束就忘、反复重新解释上下文"。Multica 把人和 agent 放进同一块看板，服务端只做编排，真正执行 agent CLI 的进程跑在用户本地/云端的 daemon 上，代码不出本机。

**成熟度**：高且活跃。README 自述"most weekdays release, main moves quickly"。栈相当工程化——后端 `go.mod` 实测 Go 1.26.6，引入 chi/v5、pgx/v5、gorilla/websocket、go-redis/v9、robfig/cron/v3、prometheus/client_golang、openai-go/v3、cobra；前端 Next.js 16 App Router、Electron 复用同一 web UI 包、Expo/RN 做 iOS。**注**：清单中"多 agent 编排平台/Leader Squad"的定位与源码一致，但需澄清——Multica 本身不内置一个 LLM 推理 loop 去拆解子任务，它的"编排"是**工程编排层**（看板/队列/派发/回收），智能拆解能力由它驱动的第三方编码 agent CLI（如 Claude Code）完成。

---

## 2. 源码结构总览

仓库是多端 monorepo。关键定位（经 raw HTTP 200 校验）：

```
multica/
├── server/                  # Go 后端（module github.com/multica-ai/multica/server）
│   ├── cmd/server/main.go   # 【入口】HTTP/WS 服务启动、后台 worker、优雅停机
│   ├── internal/
│   │   ├── service/         # 核心业务：task.go(任务队列/认领/恢复)、autopilot.go
│   │   ├── daemonws/        # daemon ↔ server 的 WebSocket hub
│   │   ├── scheduler/       # DB 支撑的分布式 cron（sys_cron_executions）
│   │   ├── events/          # 进程内事件总线 events.New()
│   │   ├── realtime/        # Redis Stream 分片 relay（多节点广播）
│   │   ├── handler/         # chi 路由、heartbeat、webhook、channel supervisor
│   │   ├── dbreader/dbstartup/  # 读写分离路由、DB 启动重试
│   │   └── cli/errors.go    # CLI 错误翻译层（exit code 分级）
│   ├── pkg/db/generated/    # sqlc 生成的类型化查询
│   ├── pkg/llm/             # LLM 调用封装（重试预算）
│   └── pkg/featureflag/     # YAML 规则 + env 覆盖的特性开关
├── apps/
│   └── mobile/              # Expo/React Native iOS 客户端
└── (Next.js web、Electron desktop)
```

**核心源码文件（已下载通读关键段，HTTP 200）**：
- `server/cmd/server/main.go`（905 行，全文通读）
- `server/internal/service/task.go`（约 34 万字节，grep 关键段）
- `CLI_AND_DAEMON.md`、`README.md`、`server/go.mod`

**入口/启动流程**：`main()` → `logger.Init()` → JWT_SECRET 生产安全校验（不安全直接拒启）→ 建 pgx 连接池 → `dbstartup.Retry(..., pool.Ping)` 带瞬态错误重试连库 → 可选只读 read replica → 建 `events.New()` 总线 + `realtime.NewHub()` + `daemonws.NewHub()` → 按 REDIS_URL 决定单节点内存 hub 还是 Redis 分片 relay → 装配 router/handler → 拉起一大批后台 goroutine（runtime sweeper、autopilot、scheduler、heartbeat、metrics、pprof）→ `srv.ListenAndServe()` → 等待信号后按 `shutdownSequence{...}.run()` 有序停机。

**代码规模**：后端单 task.go 即 34 万字节（≈数千行），是典型的成熟企业级服务体量，非玩具框架。

---

## 3. 系统架构分析

### 编排模式：工程编排（任务队列 + daemon 认领），而非 LLM 自推理循环（源码确认）

Multica 的"编排"与 ReAct/LangGraph 类框架根本不同：**它不跑 LLM 推理 loop，而是把编码任务塞进数据库队列，由分布在各机器上的 daemon 通过 WebSocket 领走，再由 daemon spawn 真正的 agent CLI 子进程执行**。

数据流（源码 + 文档确认）：

```
人/AI 建 issue ──► PostgreSQL agent_task_queue 表
                          │  server 经 daemonws Hub 发 WS wake 信号
                          ▼
        本地 daemon（用户机器）按 runtime 批量 claim 任务
                          │  创建隔离 workdir（git worktree）
                          ▼
              spawn claude/codex/... 子进程（26 选 1）
                          │  流式回传 stdout/事件，15s 心跳
                          ▼
        server 把 run/comment/状态写回 issue，人在 review gate 决定合入
```

**关键类/函数（源码确认）**：
- `service.TaskService`（task.go）：任务队列核心，`claimResponseRecoveryWindow = 90 * time.Second`（task.go:194）定义 daemon 崩溃后任务可被重新认领的恢复窗口。
- `RetrySourceContextQuickCreate(...)`（task.go:1707）：手工重试，在事务里 `CreateManualQuickCreateRetryTask`，注释明确"double-click or a race with automatic retry cannot mint two live attempts"——防并发双发。
- `SettleDeliveredDelegatedFailureRecoveries(...)`（task.go:2587 等多处）：委派失败回执结算。
- `realtime.NewShardedStreamRelay` / `NewDualWriteBroadcaster`（main.go:511/550）：多节点实时广播。
- `scheduler.NewManager` + `scheduler.AutopilotScheduleDispatchJob`（main.go:776/786）：把 cron 计划任务落库成可租约、可审计的分布式任务。

### 核心组件
- **Go 后端（编排面）**：chi 路由 + sqlc 生成查询 + pgx 池，无状态，状态全在 PostgreSQL。
- **daemon（执行面）**：与 CLI 同一二进制（`server/bin/multica`），跑在用户机器，WS 长连接到 server，负责探测本机 agent CLI、领活、隔离 workdir、看门狗。
- **PostgreSQL 17**：唯一事实源（issue/task/comment/metadata）。
- **Redis（可选）**：不设则单节点内存 Hub；设了则做多节点 fanout、channel lease、liveness。

---

## 4. 功能拆解

- **看板/Issue 模型**：issue 状态机 `backlog/todo/in_progress/in_review/done/blocked/cancelled`，actor_type 同时覆盖 member 与 agent（即清单所述 polymorphic actor）。元数据是 KV（≤50 键、8KB blob），注释明确劝阻把 `attempts` 之类运行期簿记写进去。
- **26 种 agent runtime 适配**：daemon 自动探测 PATH 上的 `claude/codex/cursor-agent/copilot/opencode/kimi/qwen/grok/...`；ACP 家族（Hermes/Kimi/Grok/Qoder 等）通过 ACP session 协议下发 MCP server（`mcp_config` 翻译成 `McpServer[]` 随 `session/new`/`session/resume`），而不改写 runtime 自己的配置文件。
- **Squad / Leader 委派**（清单已述）：leader agent 收任务、拆子任务、按技能标签路由给 member agent。**源码佐证有限**：本报告未逐行读 squad 路由实现，仅据 README/docs 与 task 队列模型推断，标为文档/推断。
- **Skills**：把已解决问题沉淀成 playbook，daemon 把绑定的 skill 物化进 per-task 目录（如 QwenPaw 写到 `<workdir>/skills/` + `skill.json`）。
- **Autopilot**：cron/webhook 触发的自动化（standup/audit/report），`mode=create_issue|run_only`。
- **Channels**：Slack/Lark/DingTalk/WeCom/Telegram 双向，由 `ChannelSupervisor` 持有 WS lease 驱动。
- **前端/后端**：Next.js/Electron/iOS 三端共享 web UI 包；后端纯 API + WS。

---

## 5. 技术亮点与优势

1. **"编排面/执行面"彻底分离**：server 无状态、只认数据库队列；agent 真正执行在用户机器的 daemon 子进程里，代码不出本机。这是"自托管 + 数据主权"与"集中编排"兼得的关键设计，也是它敢接 26 种异构 CLI 的根本原因。
2. **daemon 跟随二进制热重载而不中断任务**：daemon 周期性比对自身编译版本与 `multica --version`，发现不一致就等当前任务跑完再 `exec` 新二进制；**运行中的任务永不被打断**（CLI_AND_DAEMON.md 明确）。agent CLI 升级则只 re-probe 版本、重注册 runtime、不重启 daemon。
3. **共享 git 对象库 + worktree**：每个 task workdir 是 `.repos/` 裸克隆上的一个 `git worktree`，task 的 `.git` 只是指针；GC 时先 evict 无人引用的 repo 缓存，错了也只是下次重新 clone 而非失败。省磁盘、快。
4. **错误可观测到"每一次工具调用"**：execution log 时间戳回放每次 tool call/command/error，issue 维度聚合 token 用量（input/output/cache read-write），review gate 拦住直推 main。
5. **多端一套内核**：Web/Electron/iOS 共用 web UI，CLI/API 全部可脚本化，"agent 可以用和人一样的 CLI 反向驱动 Multica"。

---

## 6. 稳定性机制【重点】

- **启动期 DB 瞬态重试**：`dbstartup.Retry(startupCtx, retryOptions, pool.Ping)`，`retryOptions.ShouldRetry = dbstartup.IsTransientDatabaseError`，`OnRetry` 打日志（main.go:368-381）。连不上不裸崩，按瞬态错误分类重试。**源码确认**。
- **LLM 重试预算硬上限 + 启动即校验**：`maxLLMRetriesLimit = 5`（main.go:164），注释给出账：SDK 退避 0.5s 翻倍到 8s 封顶，6 次≈21s、10 次≈48s，而内部调用 deadline 只有 8s/20s，超 5 次只会把"可重试上游失败"变成"deadline 超时"。`parseLLMMaxRetries` 对非法值**直接拒绝启动**而非悄悄回退默认（main.go:175-196，引用 MUL-6364）。**源码确认**。
- **任务崩溃恢复窗口**：`claimResponseRecoveryWindow = 90 * time.Second`（task.go:194），注释要求它大于 daemon client.Timeout 的最坏情况，避免把还在干活的 daemon 误判崩溃而错误抢回任务。配合 `runDelegatedFailureRecoverySweeper`（main.go:713）周期性结算 `SettleDeliveredDelegatedFailureRecoveries`。**源码确认**。
- **防并发双发的手工重试**：`RetrySourceContextQuickCreate` 在单事务里完成"校验是否仍是原请求者 → 建重试任务 → 转移 source context → commit"，任何一步失败整体回滚（task.go:1736-1762）。**源码确认**。
- **daemon 看门狗套件**：`MULTICA_AGENT_IDLE_WATCHDOG` 默认 2h 无进展强杀、`TOOL_WATCHDOG` 工具调用卡住单独预算、Codex 有语义不活跃/首 turn/握手/turn-interrupt 各自超时（CLI_AND_DAEMON.md 配置表）。agent 超时默认 0（不限），由看门狗兜底。**文档确认，常量名来自配置文档**。
- **HTTP 抗 Slowloris**：`newMainHTTPServer` 设 `ReadHeaderTimeout: 5s`、`IdleTimeout: 120s`，且**故意把 Read/WriteTimeout 留 0** 以免杀掉 `/ws`、`/api/daemon/ws` 长连接（main.go:297-304 注释原话）。**源码确认**。
- **优雅停机有序化**：`shutdownSequence{StopAutopilot→DrainHTTP(10s)→StopOutboundRelay→CancelWorkers→StopHeartbeats→JoinWebhookWorker(5s)→...}.run()`，WeCom dispatcher 必须在 sweeper 取消前 drain（main.go:838-903）。**源码确认**。
- **CLI 错误翻译 + 分级 exit code**：`server/internal/cli/errors.go` 把 transport/HTTP 错误翻成一句可操作提示，exit code 0/1/2/3/4/5 对应成功/一般/网络/鉴权/未找到/校验。**文档 + 文件路径确认**。

---

## 7. 高可用机制【重点】

- **读副本 + 被动熔断**：`DATABASE_REPLICA_URL` 可选，新连接池校验为只读；运行时由"请求驱动 fallback + 被动 circuit breaker"处理副本故障，**不跑后台 SQL 探活**（main.go:386-401 注释）。读走 `h.ReadSelector = dbreader.New(primary, replica, recorder)`。**源码确认**。
- **多节点水平扩展（Redis 分片 Stream relay）**：单节点时 `broadcaster = hub`（内存）；设了 REDIS_URL 就用 `NewShardedStreamRelay` + `NewDualWriteBroadcaster`，让多个 API 节点互相投递事件与 daemon wake（main.go:511-550）。模式支持 sharded/dual/legacy，cluster 模式强制 sharded。**源码确认**。
- **分布式 cron 不依赖单进程**：`sys_cron_executions` 表把周期任务（`rollup_task_usage_hourly`、`AutopilotScheduleDispatchJob`、插件 hook）变成**分布式租约 + 审计日志**，manager 提供崩溃恢复、occurrence 级幂等、lease theft、重试（main.go:762-796 注释原话）。底层 SQL 函数还持有 advisory lock 4246。**源码确认**。
- **runtime 存活与任务回收解耦**：`runRuntimeSweeper` 把失联 runtime 标记离线，队列里挂在它名下的活一次性退役；`runRuntimeGCSweeper` 7 天留存独立每小时跑，不阻塞 30s 存活 tick（main.go:700-717）。**源码确认**。
- **资源治理（daemon 侧 GC）**：`MULTICA_DAEMON_MAX_CONCURRENT_TASKS=20` 限并发；workspace GC 分级 TTL（done/cancelled 24h、completed-task 14d、orphan 72h、artifact 12h、repo 缓存 30d、Hermes memory 90d），task 临时目录用 `.task_lock` OS 建议锁判定存活而非年龄——"正在用的永不删，进程死了的下轮就清"。**文档确认**。
- **可观测性**：Prometheus（http/business/channelMedia/channelLease/wecom/dbRouting 多组指标）、pprof 独立端口、lumberjack 滚动日志、结构化 slog。metrics 非 loopback 时会告警提醒加网络隔离（main.go:623-628）。**源码确认**。
- **局限（如实）**：无状态 server 但事件 fanout 强依赖 Redis，未配 Redis 时锁死单节点；横向扩展是"多 API 节点 + Redis pub/sub"而非内建服务发现/自动负载均衡。

---

## 8. 自我进化机制【重点】

Multica 不是"会自学权重的 agent"，其"进化"全在**经验沉淀与复用**这一层：

- **Skills 沉淀**：把一次跑通的解法固化为 playbook，后续所有 agent 任务自动绑定（daemon 把 skill 物化进 workdir；server 的 `LoadAgentSkillBundles` 给每个 agent 追加内置 skill）。这是显式的"经验复用"机制。**文档确认**。
- **Hermes 长期记忆（agent-scoped、runtime-local）**：Hermes agent 的 `memories/` 链接到 `<profile>/hermes-state/<agent-id>/`，跨任务/issue 保留；会话 transcript 落在 `<hermes-sessions>/<agent-id>/.../<issue-id>/`，跟进 turn 可 resume 真实对话。文档明确"并发任务对同一 memory 是 last-writer-wins"。**文档确认**。
- **Autopilot 定时自跑**：standup/audit/report 按 cron 自己跑，相当于把"例行复盘"自动化。
- **执行日志即复盘素材**：每次 run 的 tool call/error/token 全留痕，人或后续 agent 可 `run-messages --since` 增量回看。
- **未发现**：无在线权重学习、无自动 A/B、无反思打分回路；skill 如何被自动新增仍靠人整理。**推断**：复盘结论反哺 prompt 的自动回路未见。

---

## 9. openmate 可借鉴点【重点】

openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。

- **【P0】编排面(server) 与执行面(daemon) 分离**：openmate 已有 Web、要做桌面/手机——照抄 Multica"无状态 server 只认数据库队列 + 执行 agent 循环的 daemon 跑在端侧"。手机端资源受限，更应把"重的工具执行"放端侧 daemon，server 只做派活/聚合/审计。
- **【P0】任务队列 + 崩溃恢复窗口 + 防双发重试**：直接借鉴 `claimResponseRecoveryWindow`（领活后给执行端一个 > 端到端延迟的宽限，超时才允许被别人抢回）和"重试必须在单事务里校验身份/状态再建任务"。移动端杀后台/断网极常见，这套是恢复正确性的关键。
- **【P0】优雅停机 + 看门狗预算分离**：照抄 main.go 的有序 shutdown（先 drain 长连接、再停 worker、最后关池），以及"idle 看门狗 / tool 看门狗 / 首 turn 超时"分桶预算，而不是一个总 timeout。openmate 移动端不能让一个卡死的工具调用把进程拖死。
- **【P1】LLM 重试预算 = 延迟预算**：照抄"重试次数上限不是品味问题而是延迟预算"——先定各调用的 deadline，再反推最大重试次数并在启动时硬校验非法值。对移动端弱网尤其有用。
- **【P1】DB 支撑的分布式 cron/租约**：定时任务（openmate 的 cron 提醒、记忆整理）别用进程内 goroutine，落库成可租约、幂等、可 lease-theft 的任务，重启不丢、多开不重。
- **【P2】skill 物化进 per-task workdir + agent 级记忆存储**：技能随任务注入而非全局安装；长期记忆按 agent 隔离、按 runtime 本地存（注意 last-writer-wins 的并发坑）。

---

## 10. 源码验证标注

**源码直接阅读（HTTP 200 下载后通读/grep）**：
- `server/cmd/server/main.go`（全文 905 行：DB 重试、只读副本+被动熔断、Redis 分片 relay/双写、LLM 重试上限与启动校验、runtime sweeper/恢复 sweeper/GC sweeper、DB 调度器、HTTP 超时、有序 shutdown）
- `server/internal/service/task.go`（34 万字节，grep：`claimResponseRecoveryWindow=90s`、`RetrySourceContextQuickCreate` 事务、`SettleDeliveredDelegatedFailureRecoveries`、runtime_offline/runtime_recovery 状态）
- `server/go.mod`（依赖清单、Go 版本、模块名）

**文档/推断**：
- daemon 内部 spawn/看门狗具体实现（`server/internal/daemon*` 目录未直接命中），超时/GC/ACP 行为来自 `CLI_AND_DAEMON.md` 配置表，属文档确认而非逐行源码。
- Squad/Leader 委派的具体路由实现未读源码，仅据 README/docs 推断。
- daemonws/realtime/scheduler 仅读 main.go 中的接线与注释，未逐行读其内部算法。
- 星级/活跃度来自清单快照。
