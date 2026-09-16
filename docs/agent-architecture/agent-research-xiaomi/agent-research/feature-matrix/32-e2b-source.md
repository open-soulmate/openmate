# E2B 功能研究（#32, 沙箱运行时 SDK, TS+Python）

研究方式：`git clone --depth 1` → ~/agent-research-src/e2b（13MB）
重点：packages/js-sdk/src/sandbox/{index,sandboxApi,filesystem,commands,git,network,signature}.ts

E2B = **给 AI agent 的云端安全代码沙箱运行时**。核心是"每次 agent 要跑不可信代码，开一个
一次性隔离环境"。对 OpenSoul 价值在**把"执行不可信代码"从"目录级假沙箱"升级为"真隔离 + 
快照/分叉 + 网络策略 + 文件监视"**，直击安全与可观测两大痛点。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **真隔离沙箱**：容器/VM 级隔离 Linux 环境，create/connect/kill/setTimeout 生命周期 | ❌ | 🟡 mirror/sandbox.py 只是**目录级假沙箱**(变量+log+data_dir)，无进程/文件系统隔离 | 部分有→需重做 | **P0**。安全关键。现在 agent 跑脚本直接在宿主，无隔离。可接 E2B API 或自建 bwrap/容器 |
| 2 | **Snapshot + Fork**：createSnapshot 冻结沙箱 → fork N 个并行分叉(一次快照，各自成败独立)，用于并行探索/回测 | ❌ | 🟡 mirror/sandbox.py 有 snapshot_count 字段但非真快照；marrow/backup 是整库备份 | 完全没有 | **P0**。呼应"快照系统/时间旅行"。一次快照→并行试多条路→择优，agent 核心能力 |
| 3 | **文件系统监视**：fs.watch 返回 inotify 事件流(chmod/create/remove/rename/write) | ❌ | ❌ 无 inotify/watch | 完全没有 | P1。agent 感知文件变动实时反应，可观测性素材 |
| 4 | **PTY 交互终端**：commands/pty.ts 交互式伪终端(非一次性命令) | ❌ | 🟡 acp 有终端概念但无 PTY 隔离 | 部分有 | P1。长时间交互式进程(如 dev server) |
| 5 | **沙箱内 Git**：git/utils.ts 在沙箱内 clone/commit/diff | ❌ | 🟡 api/git_api.py 有 worktree 但非沙箱内 | 部分有 | 中。隔离环境里安全跑 git 操作 |
| 6 | **网络策略控制**：network.ts updateNetwork(allow/deny 域名) | ❌ | ❌ 无 updateNetwork | 完全没有 | **P0**。agent 外呼白名单，防数据外泄，政企合规。呼应 codex 网络策略代理 |
| 7 | **签名 URL 文件访问**：signature.ts 对 path+operation(read/write)+user+expiration 生成 sha256 签名 | ❌ | ❌ 无 signed_url | 完全没有 | 中。安全文件共享，凭证不外泄 |
| 8 | **持久卷 Volumes**：volume/ 跨沙箱持久存储 | ❌ | 🟡 vein 有内容寻址存储 | 部分有 | 中。agent 工作区持久化 |
| 9 | **Dockerfile→模板**：template/dockerfileParser + buildApi，把 Dockerfile 构建成可复用沙箱镜像 | ❌ | ❌ 无 dockerfile | 完全没有 | P1。环境可复现，"我上次那个环境" |
| 10 | **Code Interpreter (Jupyter)**：code-interpreter-python/js，内嵌内核执行代码 | ❌ | 🟡 limb/executor 跑脚本但无内核态 | 部分有 | 中。数据分析场景 |
| 11 | **MCP over Sandbox**：mcp.d.ts 沙箱内起 MCP server | ❌ | 🟡 mcp/server 已有 stdio MCP | 部分有 | 低。已有 MCP 生产能力 |
| 12 | **沙箱 Metrics**：SandboxMetricsOpts 资源用量 | ❌ | 🟡 vital 有运维指标 | 部分有 | 低 |
| 13 | **签名过期 + envd token**：沙箱内 API 双因子(签名+token)，URL 有时效 | ❌ | ❌ | 完全没有 | 中。安全细节 |
| 14 | **Sandbox Paginator**：分页列沙箱/快照 | ❌ | ❌ | 完全没有 | 低。工程细节 |

## 源码亮点

- **Fork from Snapshot 的并发模型**：`SandboxForkOpts{count}` — "所有 fork 从同一快照启动，快照只捕获一次无论 count，每个 fork 独立成败"。注释明确。**这套"一次快照→N 路并行探索"是 agent 高级能力**，可整体移植到 OpenSoul mirror/。
- **签名函数极简**（getSignature）：`(path, operation∈{read,write}, user, expiration, token)` → sha256。安全模型清晰：谁能对哪个文件做什么，带时效。可抄进 OpenSoul 文件共享层。
- **文件事件类型枚举**（CHMOD/CREATE/REMOVE/RENAME/WRITE）：inotify 语义标准化。agent 感知环境变化的基座。
- **updateNetwork 热更新**：沙箱跑起来后还能改网络策略（不是创建时定死）。灵活的安全控制。
- **双 SDK 严格 parity**（JS + sync/async Python，TASTE.md 设计原则）。与 Composio 同款工程纪律。

## 可复用设计

1. **Snapshot→Fork 并行探索**（一次冻结，N 路独立尝试）→ OpenSoul 试错型任务的核心模式，P0
2. **网络策略白名单热更新**（updateNetwork allow/deny 域名）→ agent 外呼管控，P0 合规
3. **签名 URL**（path+op+user+expiration → sha256）→ 安全文件共享
4. **文件事件流**（inotify 5 类）→ agent 环境感知
5. **Dockerfile→可复用模板**（环境可复现）

## OpenSoul 现状确认（grep）
- mirror/sandbox.py：**目录级"假沙箱"** — Sandbox dataclass 只有 variables/log/snapshot_count/data_dir/ttl，**无进程、文件系统、网络隔离**。与前几轮结论一致，是待重做的最短板
- snapshot 命中 = marrow/backup.py(整库备份) + mirror/sandbox.py(计数字段)，**均非真快照/分叉**
- 无 inotify/watch / pty / volume(vein 内容寻址是另一回事) / dockerfile / signed_url / updateNetwork / jupyter / code_interpreter
- 有：api/git_api.py(git)、acp(终端)、mcp/server(stdio MCP)、vein(存储)、vital(指标) —— 但都未接到隔离沙箱
- **结论**：OpenSoul"跑不可信代码"这条腿基本是空的，是相对 E2B 最大的单项差距
