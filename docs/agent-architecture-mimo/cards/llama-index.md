# LlamaIndex

## 一句话定位
从 RAG 数据框架演化为文档 Agent 平台：OSS 框架 + LlamaParse 文档解析/抽取。

## 核心架构（4点）
1. **core + integrations 分包**：`llama-index-core` 稳定内核，300+ 集成包按需安装
2. **数据连接器 → Index → Query Engine**：经典 RAG 管道
3. **Workflows / LlamaAgents**：事件驱动 Agent 编排与文档 Agent
4. **LlamaParse 云**：agentic OCR、结构化抽取、Index/Split

## 稳定性亮点
- 明确产品重心转向解析与抽取（ParseBench/ExtractBench 开源基准）
- 生产构建资产可 GitHub attestation 校验
- 持久化 storage_context，索引可落盘重载

## 对 openmate 借鉴
1. **Agent 是文档的新消费者**：个人助手优先做「读文件/网页→结构化」而不是全库 RAG
2. **core/integration 拆包**：内核小而稳，重型集成不绑死主仓

## 链接
https://github.com/run-llama/llama_index
