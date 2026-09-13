# SuperAGI

## 一句话定位
Dev-first 的自主 AI Agent 框架，面向开发者快速构建、管理与并发运行生产级 Agent。

## 核心架构（4点）
1. **Toolkits 市场**：Twitter/GitHub/Jira/Notion/搜索等工具包，可插拔扩展 Agent 能力
2. **GUI + Action Console**：图形界面管理 Agent，人工输入与权限确认控制台
3. **多向量库 + Agent 记忆**：支持 Pinecone 等多 Vector DB，Agent 可学习适应
4. **性能遥测 + Token 优化**：内置 Performance Telemetry 与 Token 用量管控

## 稳定性亮点
- Docker Compose 多服务编排（Redis/Celery/nginx），支持 GPU 本地 LLM
- Action Console 人工审批节点，避免 Agent 无监督执行危险操作
- 工作流基于 ReAct LLM 预定义步骤，流程可控

## 对 openmate 借鉴
1. **Toolkits 市场模式**：工具与 Agent 解耦，社区贡献工具包即可扩展能力
2. **Action Console 权限门控**：高风险操作前插入人工确认，是生产级稳定性的关键

## 链接
https://github.com/TransformerOptimus/SuperAGI
