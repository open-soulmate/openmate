# OpenAI Agents JS

## 一句话定位
OpenAI 官方 Agents SDK 的 TypeScript/JavaScript 版：轻量 Agent、handoff、guardrails、tracing。

## 核心架构（4点）
1. **Agent + Tools**：指令、工具、模型配置
2. **Handoffs**：Agent 间任务移交
3. **Guardrails**：输入/输出校验与中断
4. **Tracing 内建**：与 OpenAI 平台观测衔接

## 稳定性亮点
- API 面刻意保持小，降低框架债
- 与 Responses/Chat 等 OpenAI 协议对齐
- Node/浏览器生态便于嵌入现有 JS 服务

## 对 openmate 借鉴
1. **Handoff 是一等概念**：个人助手转「编码专家/搜索专家」时要有显式移交载荷
2. **Guardrail 失败可中断**：坏输入直接停，而不是带病继续循环

## 链接
https://github.com/openai/openai-agents-js
