# OpenLLMetry

## 一句话定位
Traceloop 开源 OpenTelemetry 集合：用 OTel 标准观测 LLM 应用与 Agent 链路。

## 核心架构（4点）
1. **OTel-native**：span/trace 对接现有可观测后端
2. **自动插桩**：主流 LLM SDK/框架低侵入接入
3. **语义约定**：prompt、completion、token、工具调用统一字段
4. **Traceloop 平台可选**：OSS 与托管观测分离

## 稳定性亮点
- 不绑定单一 APM 厂商，导出到任意 OTel collector
- 适合生产标准：采样、脱敏、保留策略可复用企业基建
- 覆盖模型调用与工具 span，便于性能归因

## 对 openmate 借鉴
1. **直接采用 OTel 语义**：自定义日志格式会锁死排障链路
2. **工具与 LLM 分 span**：超时/重试策略才能按层优化

## 链接
https://github.com/traceloop/openllmetry
