# Pydantic Ai

## 概述

PydanticAI 的核心设计哲学是 **"typed end to end"** —— 从用户输入到 LLM 输出，全链路类型安全。其架构基于 `pydantic-graph` 库实现的有向图执行引擎，将 Agent 的运行时分解为三个核心节点的循环：，主要使用 Python（https://github.com/pydantic/pydantic-ai）

## 核心架构

- PydanticAI 的核心设计哲学是 **"typed end to end"** —— 从用户输入到 LLM 输出，全链路类型安全。其架构基于 `pydantic-graph` 库实现的有向图执行引擎，将 Agent 的运行时分解为三个核心节点的循环：
- UserPromptNode → ModelRequestNode → CallToolsNode → ModelRequestNode → ... → End
- Agent 类本身是一个泛型类，参数化了依赖类型 `AgentDepsT` 和输出类型 `OutputDataT`：
- # agent/__init__.py
- class Agent(AbstractAgent[AgentDepsT, OutputDataT]):

## 关键技术

- PydanticAI 的工具系统是类型驱动的。`Tool` 类从 Python 函数签名自动生成 JSON Schema：
- @dataclass(init=False)
- class Tool(Generic[ToolAgentDepsT]):
- """A tool function for an agent."""

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
