# Openllmetry

## 概述

OpenLLMetry 是 Traceloop 公司开源的一套 **OpenTelemetry 扩展**，专门为 LLM/GenAI 应用提供完整的可观测性能力。它的核心理念是：**不要为 LLM 应用发明新的可观测性协议，而是扩展已有的 OpenTelemetry 标准**。，主要使用 Python（https://github.com/traceloop/openllmetry）

## 核心架构

- OpenLLMetry 是 Traceloop 公司开源的一套 **OpenTelemetry 扩展**，专门为 LLM/GenAI 应用提供完整的可观测性能力。它的核心理念是：**不要为 LLM 应用发明新的可观测性协议，而是扩展已有的 OpenTelemetry 标准**。
- 这意味着 LLM 应用的 traces、metrics、logs 可以直接输出到 Datadog、Honeycomb、New Relic、Grafana、Sentry 等任何支持 OpenTelemetry 的后端，无需厂商锁定。该项目的语义约定（semantic conventions）已被 OpenTelemetry 官方采纳，成为 GenAI 可观测性的事实标准。
- OpenLLMetry 的架构分为 **四层**，从上到下依次为：
- ┌─────────────────────────────────────────────┐
- pip install traceloop-sdk
- Traceloop.init() / Traceloop.init(disable_batch=True)
- Backends (25): Traceloop, Axiom, Azure App Insights, Braintrust, Dash0,
- Datadog, Dynatrace, GCP, Grafana, Highlight, Honeycomb, HyperDX,

## 关键技术

- - https://github.com/traceloop/openllmetry
- - https://github.com/traceloop/openllmetry-js
- - https://traceloop.com/docs/openllmetry/introduction
- - 相关: `reports/agentops-l1.md`、`reports/langfuse.md`、`reports/mcp.md`

## 对openmate的启示

- > Our semantic conventions are now part of OpenTelemetry!
- 1. **直接采用 OTel 语义**：自定义日志格式会锁死排障链路
- 2. **工具与 LLM 分 span**：超时/重试策略才能按层优化

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
