# Ruflo

## 概述

| 项目名 | Ruflo（曾用名 claude-flow） |，主要使用 TypeScript（https://github.com/ruvnet/ruflo）

## 核心架构

- 经 README（raw HTTP 200）确认，它是 **npm 包 + 插件体系**：
- ├── plugins/
- │   ├── ruflo-core/        # 基础：server、health check、插件发现
- │   ├── ruflo-swarm/       # 多 agent 团队协调

## 关键技术

- 1. **寄生式编排**：不重造 Agent 循环，复用 Claude Code/Codex 已有的工具与审批——工程上极轻，借力成熟宿主。
- 2. **蜂群拓扑 + 共识**：把分布式系统的 Raft/Gossip/拜占庭容错搬进 agent 编排（文档宣称）。
- 3. **自学习闭环**：Learning Loop 把每次任务结果回写记忆，agent "越用越聪明"。
- 4. **跨机联邦**：零信任跨机器协作。
- 5. **对 openmate**：展示了"在成熟 Agent 宿主之上做编排层"的另一范式（与 MetaGPT/cline 的自带循环形成对照）。

## 对openmate的启示

- - **【P1】"寄生编排层"思路**：openmate 已有 Web 版 Agent，若未来要做多 agent，不必重造循环，可在现有 Agent 外包一层"路由→派发→记忆回写"的编排层，成本低。
- - **【P1】学习闭环回写记忆**：把每次任务结果（尤其成功案例）结构化写入向量记忆，供后续相似任务检索——比纯对话历史更"越用越聪明"。
- - **【P2】三级成本路由**：按任务难度选模型/路由，openmate 多模型时可借鉴，简单任务走便宜模型。

## 参考来源

- 豆包
