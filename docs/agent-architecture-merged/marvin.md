# Marvin

## 概述

Marvin 是 Prefect 团队开发的 Python AI Agent 框架，定位为"环境智能库"（Ambient Intelligence Library）。其核心设计哲学是：**将复杂 AI 工作流分解为离散的、可观测的任务（Task），由专业化 Agent 执行，通过 Thread 管理对话上下文**。，主要使用 Python（https://github.com/prefecthq/marvin）

## 核心架构

- src/marvin/
- ├── __init__.py          # 公共 API 导出
- ├── agents/
- │   ├── actor.py         # Actor 抽象基类
- │   ├── agent.py         # Agent 实现

## 关键技术

- | 组件 | 技术选型 |
- |------|----------|
- | LLM 调用 | Pydantic AI（支持 OpenAI、Anthropic 等） |
- | 类型验证 | Pydantic + TypeAdapter |
- | 数据库 | SQLite + SQLAlchemy + aiosqlite |

## 对openmate的启示

- 1. **Task 作为一等公民**：OpenMate 可以借鉴 Task 的设计，将用户请求分解为带类型约束的任务单元。
- 2. **EndTurn 模式**：将 Agent 的"完成信号"抽象为工具调用，比硬编码的停止条件更灵活。
- 3. **渐进式 API**：`marvin.run()` → `Task` → `Orchestrator` 的三层 API 设计值得学习。

## 参考来源

- 我们
