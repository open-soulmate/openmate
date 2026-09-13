# Swarms

## 概述

Swarms 的设计哲学是**"一个路由，多种拓扑"**。它不强制用户学习多种 API，而是通过 `SwarmRouter` 这个统一入口，用一个 `swarm_type` 字符串参数切换不同的多 Agent 编排策略。框架预置了 14 种以上的编排模式（SequentialWorkflow、ConcurrentWorkflow、AgentRearrange、MixtureOfAgents、GroupChat、HierarchicalSwarm、HeavySwarm、GraphWorkflow、RoundRobin、MajorityVoting、CouncilAsAJudge、LLMCouncil、DebateWithJudge、PlannerWorkerSwarm），并在 `structs/` 目录下提供了 60+ 个实现文件。，主要使用 Python（https://github.com/kyegomez/swarms）

## 核心架构

- Swarms 的设计哲学是**"一个路由，多种拓扑"**。它不强制用户学习多种 API，而是通过 `SwarmRouter` 这个统一入口，用一个 `swarm_type` 字符串参数切换不同的多 Agent 编排策略。框架预置了 14 种以上的编排模式（SequentialWorkflow、ConcurrentWorkflow、AgentRearrange、MixtureOfAgents、GroupChat、HierarchicalSwarm、HeavySwarm、GraphWorkflow、RoundRobin、MajorityVoting、CouncilAsAJudge、LLMCouncil、DebateWithJudge、PlannerWorkerSwarm），并在 `structs/` 目录下提供了 60+ 个实现文件。
- - **渐进式复杂度**：从 2 个 Agent 的顺序链到 60+ 结构的 DAG 编排，按需升级
- - **生产优先**：内置遥测（OpenTelemetry）、自动保存、fallback swarm 降级、批量/并发执行
- - **互操作性**：兼容 MCP 协议、LiteLLM 全模型支持、Agent Skills（Anthropic 格式）
- ┌──────────────────────────────────────────────────────────┐
- │  Agent（LLM + Tools + Memory + max_loops）                │
- ├──────────────────────────────────────────────────────────┤
- │  structs/  编排结构体                                     │

## 关键技术

- - README：https://github.com/kyegomez/swarms
- - Docs：https://docs.swarms.world
- - llms.txt：https://docs.swarms.world/llms.txt
- - 相关报告：`cards/swarms.md`、`reports/openclaw.md`、`reports/crewai.md`

## 对openmate的启示

- 1. **先固化拓扑枚举**：顺序/分诊/委员会各自失败语义不同，别用一个 for 循环硬扛
- 2. **多 Agent 必须共享预算与取消信号**：避免子 Agent 泄漏与死循环

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
