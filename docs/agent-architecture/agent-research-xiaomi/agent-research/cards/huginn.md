# Huginn

## 一句话定位
自托管的可 hack 版 IFTTT/Zapier：Agent 消费与产生事件，沿有向图传播，2013 年至今仍在维护。

## 核心架构（3点）
1. **事件图模型**：Agent 创建/消费 Event，沿 DAG 传播，天然支持链式自动化
2. **丰富 Agent 类型**：网页抓取、Twitter/天气/IMAP/JIRA/MQTT/Slack 等数十种源与动作
3. **Agent Gem 扩展**：复杂 Agent 可写成外部 gem，通过 `ADDITIONAL_GEMS` 注入

## 稳定性亮点
- 全量 RSpec + headless Chrome 验收测试
- 出站请求可通过 egress proxy 限制，防内网穿透
- 数据自持：私有部署，数据不出本地

## 对 openmate 借鉴
1. **事件驱动 Agent 图**：比"单次对话"更适合持续监控/自动化场景
2. **Agent-as-Gem 插件化**：核心仓库保持通用，垂直场景外置为 gem

## 链接
https://github.com/huginn/huginn
