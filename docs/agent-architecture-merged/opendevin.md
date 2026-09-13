# Opendevin

## 概述

OpenHands 最初以 **OpenDevin** 之名诞生，定位为"AI 驱动的软件开发平台"。经过重大架构重构后，项目更名为 OpenHands，并从单一仓库拆分为 **多仓库架构**（multi-repo），形成了清晰的职责边界：，主要使用 Python（https://github.com/All-Hands-AI/OpenHands）

## 核心架构

- SDK 采用 **四包分离** 设计，每个包有明确的边界和可选性：
- 提供 Agent 框架的基础组件：
- - **Agent**：实现推理-行动（Reasoning-Action）循环
- - **Conversation**：管理对话状态和生命周期
- - **LLM**：Provider 无关的语言模型接口，内置重试和遥测

## 关键技术

- 预构建的标准化工具，遵循统一的 Action/Observation/Executor 模式：
- - `BashTool`：终端命令执行
- - `FileEditorTool`：文件编辑
- - `TaskTrackerTool`：任务追踪
- - `GrepTool`：代码搜索

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
