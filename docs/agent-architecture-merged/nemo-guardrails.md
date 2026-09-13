# Nemo Guardrails

## 概述

NeMo Guardrails 是 NVIDIA 开源的 LLM 对话应用可编程护栏（Programmable Guardrails）工具包，旨在为基于大语言模型的对话系统添加可配置、可审计的安全控制层。它不是简单的"过滤器"，而是一个完整的对话状态机运行时，通过自研的 Colang 语言定义对话流，实现对 LLM 输入/输出的精确管控。，主要使用 Python（https://github.com/NVIDIA/NeMo-Guardrails）

## 核心架构

- NeMo Guardrails 采用**分层拦截管线**（Pipeline）架构，将护栏插入应用代码与 LLM 之间。核心思想是：用户消息不直接发送给 LLM，而是经过一个由 Colang 驱动的状态机运行时，按预定义流程进行多阶段处理。
- 用户输入 → [Input Rails] → [Dialog Rails] → [Retrieval Rails] → LLM → [Execution Rails] → [Output Rails] → 用户
- - **LLMRails**：主入口类，继承自 `BaseGuardrails`，提供 `generate()` / `generate_async()` / `stream_async()` 三个同步/异步/流式接口
- - **RailsConfig**：基于 Pydantic 的配置模型，支持 YAML + Colang 双格式定义
- → Input Rails（校验 / 分类 / 拒绝）
- → Dialog Rails（话题路由 / 流程）
- → Retrieval Rails（知识库过滤）
- → Main LLM（或 passthrough_fn）

## 关键技术

- - 仓库：https://github.com/NVIDIA/NeMo-Guardrails
- - 相关报告：`reports/microsoft-agent-framework.md`、`reports/openai-agents.md`、`reports/hermes-agent.md`

## 对openmate的启示

- 1. **工具轨（execution rail）单独设防**：个人助手转账/删消息等工具入参与出参可拦截改写
- 2. **护栏配置目录化**：rails 与业务代码分离，可版本化与审计

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
