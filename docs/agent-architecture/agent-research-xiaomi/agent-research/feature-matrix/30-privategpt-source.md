# PrivateGPT (#30, 37k★, imartinez/privateGPT→zylon-ai/private-gpt) 功能研究

> 研究级别：README+settings.yaml配置级（RAG平台，非agent编排框架，与OpenMate/OpenSoul竞合度中低，未做源码级clone）。
> 现状：由Zylon公司维护，定位"私有化AI网关"（completions+文档摄取+RAG管线+低层原语），LlamaIndex为底座，Qdrant默认向量库。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **双层API**：High-level（摄取/聊天全抽象RAG管线）+ Low-level（embeddings/chunks检索原语）——"网关"式分层 | 无 | 知识库API单层 | 部分有 | 分层思想可参考 |
| 2 | **chat loop_detection**（interval=10轮检测循环）+max_iterations=100 | 无 | 无 | 完全没有 | 与Khoj重复组合检测/deepseek loop guard/anything-llm loop-detect**四方互证**——OpenSoul cortex循环无检测，P0 |
| 3 | **deduplicate_context_in_history**：历史里的检索上下文去重（同一chunk不重复进上下文） | 无 | 无 | 完全没有 | 长会话token节约的廉价手段，立即可抄 |
| 4 | **condense_strategy可插拔**（condenser压缩历史策略）+maximum_history_length+maximum_context_length | 无 | gene模板有压缩概念 | 部分有 | 策略化配置 |
| 5 | **引用体系七开关**：allow_generate_citations/force_to_return_citations/return_missing_citations/numerical_shorter_citations等 | 无 | cortex/quality.py引用+0.05启发式 | 完全没有 | 与STORM引用三件套互证——OpenSoul引用是打分不是生成 |
| 6 | **skills卷挂载**：filesystems.namespaces.skills(root+default_mode=**ro只读**)——skills作为文件系统命名空间注入代码执行沙箱 | 无 | skills.py非卷挂载 | 完全没有 | **skills与代码执行沙箱的隔离集成**：只读挂载=skills不可被agent篡改（与Roo-Code RooProtectedController互证"agent不能改自己的规则"） |
| 7 | **code execution session卷**（rw模式，per-session持久卷） | 无 | 无 | 完全没有 | 与E2B/Daytona会话卷同思路 |
| 8 | **Docling视觉解析管线**：vision模式/retry/评估开关/batch/semaphore并发——扫描件文档解析工程化 | 无 | 无 | 完全没有 | 用户有扫描件PDF需求（本地ocrmypdf），Docling是开源替代线 |
| 9 | **offline_mode**（HF_HUB_OFFLINE一键全离线）+basic auth+CORS+SSL+proxy全套部署配置 | 无 | — | 部分有 | 政企离线部署核对清单 |
| 10 | **stream broker可插拔**（memory/过期时间）+observability mode配置 | 无 | 无 | 完全没有 | 小件 |
| 11 | **tldr**：长回答超1.5s先出摘要占位（tldr_timeout=300s）+**multiplexing_threshold=10**（并发复用阈值） | 无 | 无 | 完全没有 | "先给一句话再说全文"的体感优化 |
| 12 | **preprocess双管线**（documents/multimodal各自max_concurrency/return_type=user_message：预处理结果作为用户消息注入） | 无 | 无 | 完全没有 | — |

## 源码亮点（配置即规格）
- settings.yaml全部值支持`${ENV_VAR:default}`语法+注释指向settings.py类型定义——配置文件即文档。
- 摄取侧预算齐全：max_num_nodes/max_content_nodes(10000)/max_content_artifacts(20)/max_content_depth(200)/max_content_response_bytes(50MB)/max_content_concurrency(2)。

## 可复用设计
1. **skills只读卷挂载进沙箱**（#6）：OpenSoul若给agent代码执行能力，skills/模板目录以ro模式挂载是防自改的结构性方案。
2. **loop detection+context去重**（#2/#3）：两个都是<50行的廉价防护，OpenSoul cortex应标配。
3. 行业信号：PrivateGPT从"本地聊天工具"pivot成"企业私有AI网关"（Zylon商业版）——纯本地RAG工具的商业化出路是企业平台，与Continue停运教训同向。

## 已grep确认OpenMate/OpenSoul（本轮关键词）
loop_detect/deduplicate_context/condense_strategy/tldr/multiplexing：全部NONE。
部分：citations=cortex/quality.py启发式加分（非引用生成体系）；vision=无Docling级解析管线。
