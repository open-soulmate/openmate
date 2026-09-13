# Superpowers

## 概述

- **项目名称**：superpowers（作者 obra，即 Jesse Vincent / structuredthinking 体系作者）（https://github.com/obra/superpowers）

## 核心架构

- 顶层结构（经 `git/trees/main?recursive=1` 核实）：
- superpowers/
- ├── skills/                      # 核心：技能（方法论资产）
- │   ├── using-superpowers/       # 元技能：强制"先调用技能再回答"
- │   ├── brainstorming/           # 设计先行头脑风暴（含本地可视化 server）

## 关键技术

- 1. **上下文隔离作为一等公民**：每个任务派发全新子代理、brief/报告/diff 全部走文件而非粘贴进控制器上下文。源码原话："A real session's dispatch hit 42k chars of which 99% was pasted history"——即用真实事故数据反推出"禁止粘贴历史"。
- 2. **双重独立评审防偏见**：任务级（spec+quality）与最终整支评审分离，且禁止控制器对评审者预判（"never instruct a reviewer to ignore..."），从提示层面消除评审者被"带节奏"。
- 3. **Ledger 作为崩溃恢复地图**：`progress.md` 首行写计划身份、每任务一行 `Task <N>: complete (commits a..b)`，compaction 后"信任 ledger 与 `git log` 而非记忆"。
- 4. **按任务复杂度选模型的成本纪律**：机械任务用便宜模型、设计/最终评审用最强模型、修复第 4-5 轮强制升一档，并提醒"turn count beats token price"（轮次比单次 token 价更贵）。
- 5. **多 harness 一份资产**：同一套 Markdown 经各 `*-plugin/` 清单同步到 10+ 宿主，`scripts/sync-to-codex-plugin.sh` 维持一致性。

## 对openmate的启示

- openmate 背景：Python 开发、已有 Web 版、规划桌面/手机多端的 AI Agent 应用。
- - **P0｜Ledger 检查点 + 状态机恢复**：openmate 的长任务/多步 agent 极容易在模型 compaction 或应用切后台后"失忆重跑"。借鉴 SDD 的 `progress.md`：把任务拆成带 `status` 的步骤，每完成一步把 `step_id + commit/产物指针 + 裁决` 落盘到本地 SQLite/JSON，重启后读账本而非读对话历史。预期收益：多端（桌面/手机）切后台/进程被杀后能精准续跑，避免重复消耗 token。
- - **P0｜子代理"文件交接、上下文隔离"协议**：openmate 已有 Web 版，若引入多 agent 编排，应强制"派发提示词只给 brief 路径、产物走文件、不把历史粘贴进子代理上下文"，并用"实现者禁止再派评审者"的层级约束防止评审成本爆炸。预期收益：长任务上下文不膨胀、token 成本可控。

## 参考来源

- 豆包
