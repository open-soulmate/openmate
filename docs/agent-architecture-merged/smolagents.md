# Smolagents

## 概述

SmolAgents 是 HuggingFace 推出的轻量级 Agent 框架，核心逻辑仅约 1,000 行代码（`agents.py`）。其最大特点是 **Code Agent** 模式——LLM 生成 Python 代码作为动作，而非传统的 JSON 工具调用字典。研究表明这种方式比传统工具调用减少 30% 的步骤数，并在困难基准上达到更高性能。，主要使用 Python（https://github.com/huggingface/smolagents）

## 核心架构

- `CodeAgent` 是 SmolAgents 的核心创新——LLM 输出 Python 代码片段，由安全的 Python 执行器执行。
- # agents.py — CodeAgent 的步骤执行
- def _step_stream(
- self, memory_step: ActionStep
- ) -> Generator[ChatMessageStreamDelta | ToolCall | ToolOutput | ActionOutput]:
- | 路径 | 职责 |
- |------|------|
- | `src/smolagents/agents.py` | MultiStepAgent 基类 + CodeAgent / ToolCallingAgent |

## 关键技术

- SmolAgents 提供 `@tool` 装饰器，允许用户将普通函数一步转换为 Tool 实例，大幅降低工具创建门槛。
- # tools.py — @tool 装饰器核心逻辑
- def tool(tool_function: Callable) -> Tool:
- Convert a function into an instance of a dynamically created Tool subclass.

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
- MiMo报告
