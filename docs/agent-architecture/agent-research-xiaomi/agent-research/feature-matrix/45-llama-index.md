# LlamaIndex 功能研究

研究时间：2026-09-16（cron第26轮）
GitHub: https://github.com/run-llama/llama_index （MIT，Python，monorepo：core + 615个integration包）
研究方式：shallow clone源码，逐一阅读llama-index-core模块

## 架构概述

LlamaIndex是**数据框架**：把私有数据接入LLM应用。核心管道：
```
数据源(readers/615种) → ingestion pipeline(解析/分块/去重/缓存) → 索引(indices) 
→ 检索(retrievers) → 后处理(postprocessor: rerank/过滤) → 响应合成 → 评估(evaluation)
```
- core + integrations双层：core定义抽象，integrations实现具体存储/LLM/reader
- agent层：AgentRunner、子问题引擎、工作流引擎（workflows/）

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **Ingestion Pipeline**（ingestion/pipeline.py）：文档→分块→嵌入→入库的标准管道，带**缓存去重**（相同doc自动跳过）和增量更新 | ❌无 | 部分：hippo长期记忆+GraphRAG有简单入库 | 完全没有 | 知识库功能的基础件。管道抽象：source→transformations[]→sink，每步幂等 |
| 2 | **615个数据连接器**（readers/）：PDF、Notion、Slack、Confluence、数据库、网页… | ❌ | 部分：现有文档读取（docx/pdf/markdown） | 部分有 | 售前场景优先补：招标网站、企业微信、SharePoint连接器 |
| 3 | **节点解析器族**（node_parser/）：SentenceSplitter、SemanticSplitter（按语义切）、Markdown切分、代码切分、层级切分 | ❌无 | ❌无（入库未做精细分块） | 完全没有 | 高价值。中文文档用SentenceSplitter（按标点+窗口），技术文档用MarkdownHeaderTextSplitter |
| 4 | **检索后处理器族**（postprocessor/）：**LLM Rerank**、**sBERT Rerank**、RankGPT、时间衰减（node_recency）、元数据替换、PII过滤、相似度阈值 | ❌无 | ❌无 | 完全没有 | 高价值高优先。检索Top-K→rerank重排→取Top-N，RAG质量立涨。本地sBERT rerank零成本可跑 |
| 5 | **评估指标族**（evaluation/）：faithfulness（忠实度）、answer relevancy、context relevancy、correctness、semantic similarity、**pairwise对比**、batch_runner批量评估 | ❌无 | 部分：cortex/quality.py有通用质量评估 | 部分有 | 把faithfulness/context_relevancy两个指标抄进cortex/quality.py，RAG输出自动打分 |
| 6 | **合成数据集生成**（evaluation/dataset_generation.py）：从文档自动生成QA测试集 | ❌无 | ❌无 | 完全没有 | 亮点：招标文件→自动生成QA→评估RAG质量闭环 |
| 7 | **聊天记忆族**（memory/）：ChatMemoryBuffer（窗口）、ChatSummaryMemoryBuffer（自动摘要压缩）、**VectorMemory**（向量检索历史）、ComposableMemory、Memory Blocks可组合 | ❌无 | 部分：hippo/记忆系统+reflex缓存 | 部分有 | ChatSummaryMemoryBuffer思路可借鉴：对话超窗口自动摘要，防上下文爆炸 |
| 8 | **多索引类型**（indices/）：向量、关键词、树、知识图谱、SQL、文档摘要、组合索引 | ❌无 | 部分：cortex/graphrag.py（知识图谱） | 部分有 | GraphRAG已有正则NER实体抽取，缺向量索引标准化 |
| 9 | **Workflow引擎**（workflows/）：事件驱动的步骤编排，支持并行、分支、循环、类型化step间传递 | ❌无 | 部分：will/工作流 | 部分有 | will/是Python硬编码工作流，缺声明式事件驱动。与NeMo Colang结论可合并考虑 |
| 10 | **子问题查询引擎**（question_gen/ +递归检索）：复杂问题拆解为子问题分别检索再综合 | ❌无 | 部分：cortex/task_planner.py任务拆解 | 部分有 | task_planner已有拆解，缺"拆解→并行检索→综合"的RAG专用链路 |
| 11 | **响应合成器族**（response_synthesizers/）：compact/refine/tree_summarize/accumulate多种LLM答案合成策略 | ❌无 | ❌无 | 完全没有 | refine策略（逐chunk迭代完善答案）对长文档QA很有用 |
| 12 | **Structured Data提取**（program/ + extractors/）：从非结构化文本抽取结构化JSON/schema、自动摘要、关键词、标题、QA对 | ❌无 | 部分：cortex/graphrag.py有NER+关系抽取 | 部分有 | graphrag已覆盖实体；可补"LLM schema抽取"（从招标文件抽参数表） |
| 13 | **Callback/Instrumentation系统**（instrumentation/）：dispatcher+span handler，事件级可观测性插桩 | ❌无 | ❌无 | 完全没有 | 与Langfuse研究结论一致：统一trace插桩点 |
| 14 | **Composability组合**：索引作为其他索引的文档（树状组合），知识树 | ❌ | ❌ | 完全没有 | 低优先级 |
| 15 | **缓存层**（ingestion/cache.py + embeddings缓存）：嵌入结果缓存，重复文档零成本 | ❌无 | ❌无 | 完全没有 | 中价值：知识库更新时只处理增量，省embedding成本 |
| 16 | **Playground**（playground/）：本地交互式测试RAG管道 | ❌无 | ❌无 | 完全没有 | OpenMate可加"知识库调试"页面：上传文档→调参数→看检索结果 |
| 17 | **Router Query Engine**：LLM根据问题类型路由到不同查询引擎 | ❌ | 部分：intelligence/意图识别 | 部分有 | 意图识别已有，扩展为"路由到不同检索策略" |
| 18 | **Hybrid Search**（向量+关键词融合，fusion retriever） | ❌无 | ❌无 | 完全没有 | 中高价值：中文场景BM25+向量混合检索效果显著优于纯向量 |

## 源码亮点

1. **transformations管道的可插拔设计**：每个处理步骤（解析、分块、嵌入）是独立Transformation对象，管道按序执行+缓存断点。OpenSoul入库代码应重构成此模式。
2. **postprocessor作为独立阶段**：检索和生成之间的"后处理"是正式概念（rerank、过滤、替换），不是散落的if。OpenSoul的RAG链路缺这一层。
3. **evaluation的双模式**：单独评估（每个指标一个类）+ batch_runner批量跑。faithfulness实现=LLM判断"答案中的每个claim是否被上下文支持"，可直接抄。
4. **memory_blocks**：记忆分块（static facts / recent messages / vector-retrieved），可组合——和OpenSoul hippo的分层记忆思想一致，可对照校准。

## 可复用设计（针对OpenSoul）

- **Rerank后处理**（最高价值，1-2天）：
  ```
  opensoul/src/cortex/rerank.py
  - 本地bge-reranker-base（CPU可跑，用户无GPU顾虑需验证）
  - 接口：rerank(query, nodes, top_n) -> nodes
  - 插入现有RAG检索后、进上下文前
  ```
- **faithfulness评估**：抄llama_index/evaluation/faithfulness.py的prompt+解析逻辑，接cortex/quality.py，GraphRAG答案自动标注"忠实/存疑"。
- **Ingestion缓存去重**：文档入库前算内容哈希，命中跳过——知识库增量更新的基础。
- **ChatSummaryMemoryBuffer**：对话记忆超阈值自动摘要成一条系统消息，防止长对话上下文爆炸（现有reflex压缩可对照）。
- **QA测试集生成器**：从用户已有文档（标书、方案）生成QA对，作为RAG回归测试集，配合benchmark目录。

## 与OpenMate的对接

- 知识库页面增加"调试"视图：检索Top-K可视化、rerank前后对比、faithfulness分数
- 文档入库显示管道进度（解析→分块→嵌入各阶段实时状态，满足"类tail日志流"要求）
