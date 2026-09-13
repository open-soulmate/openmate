# Medusa

## 概述

- **项目名称**：Medusa（GitHub: https://github.com/medusajs/medusa ），主要使用 TypeScript（https://github.com/medusajs/medusa）

## 核心架构

- ├── .claude/              # ★ 面向编码 Agent 的资产（源码确认）
- │   ├── agents/           # codebase-analyzer / codebase-locator /
- │   │                     # codebase-pattern-finder / web-search-researcher
- │   ├── commands/         # create_plan / implement_plan / research

## 关键技术

- 1. **Workflow 即一等公民**：把"重试、补偿、持久化、可恢复"从业务代码里抽出来成为引擎能力，开发者只需声明 step + compensation。
- 2. **模块化单体**：既享受单库部署/单事务的简单，又保留模块边界可拆——比微服务简单、比巨石可维护。
- 3. **把"如何改这个代码库"教给 Agent**：`.claude/agents` + `.claude/skills` 不是玩具，而是把团队的代码定位/评审/分诊方法论结构化，让外部编码 Agent 一来就按规范干活。
- 4. **契约式扩展**：模块 API、Data Model、Workflow 都是显式契约，Agent 生成代码有章可循，降低"自由发挥式改坏系统"的风险。

## 对openmate的启示

- - **P0｜长任务用"持久化 Workflow + Step 级重试 + Compensation"骨架**：openmate 的 Agent 多步任务（检索→分析→写文件→调用外部 API）不要写成无状态一次性脚本。仿 Medusa：每步声明"做什么 + 失败怎么回滚 + 重试几次"，状态落库。预期：进程崩溃能续跑、失败不产生脏状态。
- - **P0｜Saga 补偿思维**：openmate 每执行一个有副作用的工具（发邮件、写文件、调支付），同步定义一个"撤销动作"。任一步失败时自动反向补偿。预期：Agent 误操作可自愈、不留半成品。
- - **P1｜把"如何改 openmate 代码库"写成 `.claude/agents`+`.claude/skills`**：openmate 自己也用编码 Agent 开发，应沉淀 `codebase-locator`/`reviewing-prs` 这类技能文件，让任何编码 Agent（包括未来的自己）按团队规范干活。预期：AI 辅助开发质量稳定、不跑偏。

## 参考来源

- 豆包
