# Multica

## 概述

| 项目名 | Multica（Multiplexed Information and Computing Agent） |，主要使用 TypeScript（https://github.com/multica-ai/multica）

## 核心架构

- 仓库是多端 monorepo。关键定位（经 raw HTTP 200 校验）：
- ├── server/                  # Go 后端（module github.com/multica-ai/multica/server）
- │   ├── cmd/server/main.go   # 【入口】HTTP/WS 服务启动、后台 worker、优雅停机
- │   ├── internal/

## 关键技术

- 1. **"编排面/执行面"彻底分离**：server 无状态、只认数据库队列；agent 真正执行在用户机器的 daemon 子进程里，代码不出本机。这是"自托管 + 数据主权"与"集中编排"兼得的关键设计，也是它敢接 26 种异构 CLI 的根本原因。
- 2. **daemon 跟随二进制热重载而不中断任务**：daemon 周期性比对自身编译版本与 `multica --version`，发现不一致就等当前任务跑完再 `exec` 新二进制；**运行中的任务永不被打断**（CLI_AND_DAEMON.md 明确）。agent CLI 升级则只 re-probe 版本、重注册 runtime、不重启 daemon。
- 3. **共享 git 对象库 + worktree**：每个 task workdir 是 `.repos/` 裸克隆上的一个 `git worktree`，task 的 `.git` 只是指针；GC 时先 evict 无人引用的 repo 缓存，错了也只是下次重新 clone 而非失败。省磁盘、快。
- 4. **错误可观测到"每一次工具调用"**：execution log 时间戳回放每次 tool call/command/error，issue 维度聚合 token 用量（input/output/cache read-write），review gate 拦住直推 main。
- 5. **多端一套内核**：Web/Electron/iOS 共用 web UI，CLI/API 全部可脚本化，"agent 可以用和人一样的 CLI 反向驱动 Multica"。

## 对openmate的启示

- openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。
- - **【P0】编排面(server) 与执行面(daemon) 分离**：openmate 已有 Web、要做桌面/手机——照抄 Multica"无状态 server 只认数据库队列 + 执行 agent 循环的 daemon 跑在端侧"。手机端资源受限，更应把"重的工具执行"放端侧 daemon，server 只做派活/聚合/审计。
- - **【P0】任务队列 + 崩溃恢复窗口 + 防双发重试**：直接借鉴 `claimResponseRecoveryWindow`（领活后给执行端一个 > 端到端延迟的宽限，超时才允许被别人抢回）和"重试必须在单事务里校验身份/状态再建任务"。移动端杀后台/断网极常见，这套是恢复正确性的关键。

## 参考来源

- 豆包
