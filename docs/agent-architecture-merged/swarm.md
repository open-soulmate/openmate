# Swarm

## 概述

Swarm 的设计哲学可以用三个词概括：**轻量、可控、可测**。整个框架的核心逻辑不到 200 行 Python 代码，却实现了完整的多智能体协调能力。这在 Agent 框架领域是极其罕见的——LangChain 的核心模块有数万行代码，AutoGen 的协调器也远比 Swarm 复杂。，主要使用 Python（https://github.com/openai/swarm）

## 核心架构

- `Swarm.run()` 方法是整个框架的核心，实现了一个简洁的事件循环：
- while 未超过最大轮次 and 存在活跃 Agent:
- 1. 调用 LLM 获取 completion（基于当前 history + 活跃 Agent 的 instructions）
- 2. 将 completion 追加到 history
- 3. 如果没有 tool_calls 或 execute_tools=False → 终止

## 关键技术

- 支持工具调用、记忆管理、沙箱执行等核心能力

## 对openmate的启示

- 1. **少即是多**：200 行代码即可实现多智能体编排的核心能力，证明了简单抽象的表达力
- 2. **Python 原生即接口**：函数返回 Agent 触发 handoff，参数注入 context_variables，这些都是 Python 语言特性的巧妙利用
- 3. **无状态设计**：每次调用独立，状态通过参数传递，天然适合分布式部署

## 参考来源

- 我们
