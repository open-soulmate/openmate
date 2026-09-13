# Promptflow

## 概述

PromptFlow 的核心设计哲学是**将 LLM 应用抽象为有向无环图（DAG）或 Python 函数**，然后围绕这一抽象构建完整的开发工具链。项目采用**分层包结构**，源码位于 `src/` 下共 10 个子包：，主要使用 Python（https://github.com/microsoft/promptflow）

## 核心架构

- PromptFlow 的核心设计哲学是**将 LLM 应用抽象为有向无环图（DAG）或 Python 函数**，然后围绕这一抽象构建完整的开发工具链。项目采用**分层包结构**，源码位于 `src/` 下共 10 个子包：
- | 包名 | 职责 |
- | `promptflow-tracing` | 底层追踪（OpenTelemetry 集成） |
- | `promptflow-core` | 核心运行时：Flow 定义、Executor、连接管理、Serving |
- 概念: Flow / Tool / Connection / Run / Evaluation
- 双模式: DAG Flow + Flex Flow
- VS Code + CLI + Python SDK
- Azure AI 集成

## 关键技术

- Tool 是 Flow 的基本构建单元。PromptFlow 定义了三种内置工具：
- - **LLM Tool**：封装 LLM 调用，支持 Jinja2 模板渲染 prompt
- - **Python Tool**：执行任意 Python 函数
- - **Prompt Tool**：纯字符串 prompt 拼接
- 工具系统的关键设计是**Tool Resolver**（`_tool_resolver.py`），它负责：
- - 仓库：https://github.com/microsoft/promptflow
- - 相关报告：`reports/langflow.md`、`reports/flowise.md`、`reports/microsoft-agent-framework.md`

## 对openmate的启示

- 1. **Flow 文件即可复现实验**：把 prompt/工具/模型参数固化成 DAG，便于 diff 与回滚
- 2. **批量评估先于上线**：改 prompt 必须过数据集指标，而不是肉眼看两轮

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
