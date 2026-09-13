# Signoz

## 概述

- **项目名称**：SigNoz（GitHub: https://github.com/SigNoz/signoz ），主要使用 TypeScript（https://github.com/SigNoz/signoz）

## 核心架构

- │   ├── query-service/      # ★ Go 查询后端
- │   │   └── app/
- │   │       ├── opamp/     # ★ OpAMP 远端管理 OTel Collector

## 关键技术

- 1. **OTel 原生 + ClickHouse**：用开放标准采集、用列式库做高基数存储，兼顾开放性与查询性能。
- 2. **Agent Native 无 schema 观测**：LLM/Agent 的推理步骤、工具调用、模型参数以任意属性记录，不要求固定埋点 schema。
- 3. **OpAMP 动态 pipeline**：采集端配置可远程调整，不必手动改 collector yaml。
- 4. **自托管**：数据不出私有环境，适合对数据敏感的企业。

## 对openmate的启示

- - **P0｜用 OpenTelemetry 标准做 Agent 可观测**：openmate 从第一天起就把每轮 LLM 调用、工具调用、token 用量、耗时、错误以 OTel span 属性记录（不写死 schema，自由属性）。预期：出问题能回溯、性能可优化。
- - **P0｜给"Agent 查自己"留一个查询接口/MCP**：openmate 的运行日志/trace 应能被 Agent 经 MCP 自然语言查询（"刚才那次为什么失败、花了多少钱"）。预期：Agent 可自我诊断。
- - **P1｜高基数查询用列式存储**：openmate 的 trace/事件数据（标签多、要即席过滤）别用关系库硬扛，考虑 ClickHouse 类列式存储。预期：日志查询快。

## 参考来源

- 豆包
