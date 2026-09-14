# AnythingLLM

## 一句话定位
一体化私有 ChatGPT：文档对话 + AI Agent + 多用户权限，本地默认运行、零配置上手。

## 核心架构（4点）
1. **Monorepo 六段**：frontend(Vite+React) / server(Express) / collector(文档解析) / docker / embed / browser-extension
2. **动态模型路由**：按规则自动路由到最佳 provider 与模型
3. **智能技能选择**：无限工具但单次查询 token 降低最多 80%
4. **MCP + No-code Agent Builder**：兼容 MCP，可视化构建 Agent 流程

## 稳定性亮点
- 多向量库支持（LanceDB 默认/PGVector/Pinecone/Chroma/Weaviate/Qdrant/Milvus）
- Scheduled Tasks：cron 调度 + 完整 Agent 能力
- 多用户权限（Docker 版）+ 可嵌入聊天 widget

## 对 openmate 借鉴
1. **动态模型路由**：按任务复杂度/成本自动选模型，是降本关键
2. **Intelligent Tool Selection**：工具多不等于 token 多，智能筛选是工程重点

## 链接
https://github.com/Mintplex-Labs/anything-llm
