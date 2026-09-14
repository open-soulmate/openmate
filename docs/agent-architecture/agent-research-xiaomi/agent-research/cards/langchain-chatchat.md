# Langchain-Chatchat

## 一句话定位
基于 Langchain 的中文友好、可离线部署的本地知识库问答与 Agent 应用。

## 核心架构（3点）
1. **模型接入层**：支持 Xinference/Ollama/LocalAI/FastChat/OneAPI，兼容 OpenAI SDK
2. **RAG 流水线**：加载→分割→向量化→top-k 匹配→prompt 注入→LLM 生成
3. **Agent 模式**：针对 ChatGLM3/Qwen 优化，支持自动/半自动/手动三种工具调用方式

## 稳定性亮点
- 0.3.x 全面重构：统一 File RAG（BM25+KNN）、数据库对话、多模态、文生图
- YAML 配置热更新，无需重启
- 支持 CPU/GPU/NPU/MPS 异构硬件

## 对 openmate 借鉴
1. **中文场景优先**：文档处理/检索针对中文优化，是本地化产品的差异点
2. **Agent 三档调用**：自动/单工具解析/手动填参，适配不同模型能力水平

## 链接
https://github.com/chatchat-space/Langchain-Chatchat
