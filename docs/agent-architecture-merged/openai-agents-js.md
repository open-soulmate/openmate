# Openai Agents Js

## 概述

- 成功拉取: `README.md` 完整（概念、安装、三种 Agent、环境），主要使用 TypeScript（https://github.com/openai/openai-agents-js）

## 核心架构

- | # | 概念 | 说明 |
- |---|------|------|
- | 1 | **Agents** | LLM + instructions + tools + guardrails + handoffs |
- | 2 | **Sandbox Agents** | 配 filesystem workspace + sandbox，长任务（beta） |
- | 3 | **Realtime Agents** | 低延迟语音，tools/guardrails/handoffs/history |
- 1. **Agent + Tools**：指令、工具、模型配置
- 2. **Handoffs**：Agent 间任务移交
- 3. **Guardrails**：输入/输出校验与中断

## 关键技术

- - https://github.com/openai/openai-agents-js
- - https://openai.github.io/openai-agents-js
- - https://www.npmjs.com/package/@openai/agents
- - 相关: `reports/openai-agents.md`、`reports/agentops-l1.md`、`reports/mcp.md`

## 对openmate的启示

- 1. **Handoff 是一等概念**：个人助手转「编码专家/搜索专家」时要有显式移交载荷
- 2. **Guardrail 失败可中断**：坏输入直接停，而不是带病继续循环

## 参考来源

- MiMo报告
- MiMo卡片
