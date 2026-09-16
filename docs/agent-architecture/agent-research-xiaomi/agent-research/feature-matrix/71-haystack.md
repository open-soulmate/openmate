# Haystack (deepset) 功能研究

研究时间：2026-09-16（cron第26轮）
GitHub: https://github.com/deepset-ai/haystack （Apache-2.0，Python，production-ready RAG框架）
研究方式：shallow clone源码，逐一阅读haystack/模块

## 架构概述

Haystack是**生产级LLM应用框架**，核心是**Pipeline + Component**模型：
- 每个能力是一个Component（有类型化输入/输出端口）
- Pipeline用有向图连接组件，支持分支、循环、并行
- 组件可序列化/反序列化（带安全机制），可从模板构建
与LlamaIndex定位类似但更工程化：强调类型安全、可序列化、生产部署。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **类型化Component抽象**：每个组件声明输入/输出端口类型，管道连接时编译期检查 | ❌无 | 部分：will/工作流无类型检查 | 完全没有 | OpenSoul工作流若要产品化，类型化端口是正确方向（与MCP的typed tools思想一致） |
| 2 | **Pipeline引擎**（core/pipeline/）：有向图执行、分支、循环、并行、**断点调试**（breakpoint.py）、可视化（draw.py） | ❌无 | 部分：will/工作流 | 部分有 | 断点调试是亮点：管道执行可暂停检查中间状态 |
| 3 | **文档分块器族**（preprocessors/）：DocumentSplitter（多策略）、**EmbeddingBasedSplitter**（按语义相似度切）、HierarchicalSplitter（层级）、MarkdownHeaderSplitter、PythonCodeSplitter、RecursiveSplitter | ❌无 | ❌无 | 完全没有 | 与LlamaIndex研究结论一致，中英文分块器是RAG基础件 |
| 4 | **检索器族**（retrievers/）：BM25、向量（多backend）、SVM、TF-IDF、混合、DPR | ❌无 | 部分：GraphRAG | 部分有 | BM25+向量混合检索（hybrid）价值高 |
| 5 | **Ranker族**（rankers/）：LLM Ranker、**LostInTheMiddleRanker**（修正LLM"中间信息忽略"的位置偏差）、元数据分组Ranker | ❌无 | ❌无 | 完全没有 | lost_in_the_middle很实用：把最相关chunk放首尾，规避LLM位置偏见，零成本提升 |
| 6 | **评估器族**（evaluators/）：Faithfulness、ContextRelevance、DocumentMAP、DocumentMRR、**DocumentNDCG**、SAS（语义答案相似度）、LLMEvaluator | ❌无 | 部分：cortex/quality.py | 部分有 | MRR/NDCG是信息检索标准指标，RAG质量评估应引入 |
| 7 | **Agent + 工具调用**（components/agents/）：agent循环、工具调用、**Agent State管理**（state/：可插拔状态摘要策略，防止历史撑爆上下文） | ❌无 | ✅OpenSoul/Hermes已有完整agent能力 | 已有 | 已有更强实现 |
| 8 | **序列化安全**（serialization_security.py）：管道反序列化的模块allowlist机制，防任意代码执行 | ❌无 | ❌无（无管道序列化需求） | N/A | 如果将来做"工作流导入导出"，必须学这个：allowlist+unsafe显式声明 |
| 9 | **Component Caching**（components/caching/）：管道组件级结果缓存 | ❌无 | 部分：reflex缓存 | 部分有 | 语义缓存思路同LiteLLM研究 |
| 10 | **文档转换器族**（converters/）：PDF/HTML/DOCX/Markdown/图片OCR等30+格式→Document | ❌无 | 部分：现有文档解析 | 部分有 | 已够用，售前文档以docx/pdf为主 |
| 11 | **输出解析器**（builders/output_parsers）：LLM输出→结构化对象（多种schema） | ❌无 | 部分：acp-proxy工具调用解析 | 部分有 | 已有tool_calls机制覆盖 |
| 12 | **Joiners/Routers**：并行分支结果合并、按条件路由 | ❌无 | 部分：will/ | 部分有 | 工作流引擎基础件 |
| 13 | **API编排集成**（haystack-extras生态）：与FastAPI、docker部署模板 | ✅Next.js前端+FastAPI后端 | ✅ | 已有 | 已有 |
| 14 | **SuperComponent**（core/super_component.py）：把子管道封装为单个组件（组合复用） | ❌无 | ❌无 | 完全没有 | 工作流可复用块的概念，产品化时需要 |
| 15 | **DocumentWriter**：统一写入多向量库（Qdrant、Weaviate、PG…） | ❌无 | 部分：hippo入库 | 部分有 | 现阶段SQLite+本地向量够用 |

## 源码亮点

1. **Pipeline断点调试**（breakpoint.py）：管道执行到指定组件暂停，检查/修改中间数据后继续。RAG调试神器——OpenMate的"知识库调试页"可以做成这个形态。
2. **LostInTheMiddleRanker**：一行逻辑（重排为首尾优先），解决LLM长上下文"中间内容被忽略"问题。零成本可抄。
3. **序列化安全的三档设计**：per-call参数、进程级API、环境变量三层控制unsafe行为，且首次读取后冻结。做任何"动态加载"功能时的标准范式。
4. **Agent State的可插拔摘要**（agents/state/）：历史超阈值时用策略对象摘要压缩——接口比实现更值得抄。

## 可复用设计（针对OpenSoul）

- **LostInTheMiddle排序**（几小时可落地）：RAG检索后把chunk按相关度"首-尾-次首-次尾"重排再进上下文。
- **MRR/NDCG评估指标**：cortex/quality.py + benchmark目录增加检索质量指标，配合LlamaIndex研究的QA测试集形成完整RAG评估闭环。
- **混合检索**：BM25（rank_bm25库，纯Python）+向量检索分数融合（RRF），中文招标文档检索效果显著提升。
- **管道断点调试思想**：OpenSoul RAG链路每步输出落日志，OpenMate调试页可回放"检索了什么→重排后什么→最终进上下文什么"。

## 与OpenMate的对接

- 知识库调试视图（与LlamaIndex研究共用）：检索结果表格+rerank前后+分数列+最终上下文预览
