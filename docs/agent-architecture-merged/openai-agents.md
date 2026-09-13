# Openai Agents

## 概述

1. [核心数据模型：Agent 类设计](#1-核心数据模型agent-类设计)，主要使用 Python（https://github.com/openai/openai-agents-python）

## 核心架构

- OpenAI Agents SDK 的核心是一个 `dataclass` 驱动的 Agent 模型。它采用两层继承结构：`AgentBase` 定义共享字段，`Agent` 扩展完整功能。
- class AgentBase(Generic[TContext]):
- """Base class for `Agent` and `RealtimeAgent`."""
- | 路径 | 职责 |
- |------|------|
- | `src/agents/run.py` | Runner / AgentRunner 核心循环 |
- | `src/agents/run_config.py` | RunConfig / SandboxRunConfig / 常量 |
- | `src/agents/agent.py` | Agent 定义 |

## 关键技术

- SDK 的工具系统采用 Python 联合类型（Union Type）实现多态，涵盖 12 种工具类型：
- FunctionTool
- | FileSearchTool
- | WebSearchTool
- class ToolExecutionConfig:
- max_function_tool_concurrency: int | None = None
- """Maximum number of local function tool calls to execute concurrently.
- Set to None to preserve the default behavior, which starts all function tool calls

## 对openmate的启示

- - https://github.com/openai/openai-agents-python
- - https://openai.github.io/openai-agents-python/

## 参考来源

- 我们
- MiMo报告
