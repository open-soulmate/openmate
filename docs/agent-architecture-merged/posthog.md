# Posthog

## 概述

| GitHub | https://github.com/PostHog/posthog |，主要使用 Python（https://github.com/PostHog/posthog）

## 核心架构

- > 说明：受网络约束只读 README（见 §10）。
- posthog/  (monorepo)
- ├── products/            # 各子产品（analytics/replay/flags/experiments/error-tracking/logs/...）
- ├── ee/                  # 企业版（另有商业许可）
- ├── common/              # Django 后端公共层

## 关键技术

- 1. **把自己变成 agent 可读上下文（托管 MCP）**：不是"agent 调 PostHog API"，而是 PostHog 主动暴露 MCP，让编码 agent 用自然语言完成"查数据→下 flag→提 PR"全链路——把产品平台从"人看的看板"变成"agent 用的数据源"。
- 2. **同一用户模型统一所有工具**：分析/回放/flag/实验/错误/日志/AI obs 共用一套用户/事件模型，agent 查一次就能跨工具关联，不用在多个平台间跳。
- 3. **Self-driving mode 闭环**：信号→研究报告→PR，人只审阅合并——是"数据驱动自动修复"的产品化范式。
- 4. **AI observability 内置**：agent 应用的 traces/cost/latency 原生可观测，不必另接 Langfuse。
- 5. **MIT 开源 + 多 SDK**：几乎所有语言/框架都有 SDK，接入成本低。

## 对openmate的启示

- openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。
- - **【P0】把自己的可观测做成 agent 可读的 MCP/上下文源**：openmate 做 agent 产品，别只给人看后台。学 PostHog——把 traces、错误、用户行为通过 MCP 暴露，让编码 agent（或 openmate 自己的诊断 agent）用自然语言"查数据→定位问题→提修复"，而不是让开发自己翻日志。
- - **【P1】AI observability 原生内置**：openmate 多端 agent 的每次 LLM 调用，原生记录 traces/latency/cost，统一用户模型——调试"agent 为什么慢/贵/错"全靠它，别等上线后再补。

## 参考来源

- 豆包
