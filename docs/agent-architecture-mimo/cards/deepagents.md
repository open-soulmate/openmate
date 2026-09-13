# Deep Agents

## 一句话定位
LangChain 深度 Agent 运行时：强调规划、子 Agent、文件系统式工作区与长程任务。

## 核心架构（4点）
1. **Planner**：先产出计划再执行，步骤可追踪
2. **Subagents**：深潜探索/实现，隔离上下文
3. **虚拟文件系统**：用文件作为工作记忆与产物
4. **LangGraph 底座**：可恢复状态图驱动循环

## 稳定性亮点
- 计划与执行分离，降低「边想边跑」失控
- 子 Agent 隔离避免主上下文爆炸
- 依赖 LangGraph checkpoint 的恢复语义

## 对 openmate 借鉴
1. **文件系统当工作记忆**：比不断塞 chat history 更稳、可审计
2. **Explore/Implement 子 Agent 分工**：主会话只保留决策摘要

## 链接
https://github.com/langchain-ai/deepagents
