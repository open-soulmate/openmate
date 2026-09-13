# Privategpt

## 概述

PrivateGPT 于 2023 年 5 月首次发布，是最早一批解决"隐私敏感场景下使用 LLM"问题的开源项目。其核心承诺：**数据永不离开执行环境**。项目经历了三个阶段：，主要使用 Python（https://github.com/zylon-ai/private-gpt）

## 核心架构

- PrivateGPT 采用经典的 **四层分层架构**：
- ┌─────────────────────────────────────────┐
- │          Gradio UI (可选)                │
- ├─────────────────────────────────────────┤
- │     High-Level API (RAG 封装)           │
- Positioning: API layer over OpenAI-compatible inference
- Ports: API 8080, UI /ui
- Spec: Anthropic / Claude API

## 关键技术

- - https://github.com/imartinez/privateGPT
- - https://github.com/zylon-ai/private-gpt
- - https://docs.privategpt.dev/
- - https://www.zylon.ai/
- - 相关: `reports/mcp.md`、`reports/openai-agents.md`、`reports/anything-llm-l1.md`

## 对openmate的启示

- - **组件化设计**：LLM/Embedding/VectorStore 分离是可复用的模式
- - **模型自动发现**：减少用户配置负担的理念值得借鉴
- - **进度通知机制**：`notify_progress` 上下文管理器可用于长任务 UI 反馈
- 1. **API 层与推理层分离**：模型可换，API 层稳定，是长期架构的关键
- 2. **Claude API 作为参考规范**：对齐成熟 API 设计，降低集成成本

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
