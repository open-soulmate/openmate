# STORM (#40, 78k★, Stanford OVAL) 功能研究 — 源码级

更新：2026-09-17 05:45
源码：~/agent-research-src/storm（codeload tarball, 6.6MB, main）
核心包：knowledge_storm/（storm_wiki/ 7模块 + collaborative_storm/ 12模块，DSPy实现，总计9238行）

STORM = 维基百科级长文生成器。核心论文思路：**多视角提问→对话式知识策展→大纲→逐节写作→润色**。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **PersonaGenerator多视角生成**（FindRelatedTopic→GenPersona→最多3个"不同立场的维基作者"persona） | storm_wiki/modules/persona_generator.py | 无 | mind/有情绪无persona | 完全没有 | P1。研究质量关键：多视角=覆盖盲区。~2天 |
| 2 | **视角引导对话模拟**（ConvSimulator：WikiWriter以persona提问↔TopicExpert带检索作答，max_turn轮，"Thank you so much"即自然终止） | knowledge_curation.py:25 | 无 | 无 | 完全没有 | P0。**"用对话逼出该问的问题"**比一次性生成query质量高得多 |
| 3 | **TopicExpert反幻觉管线**（question→QuestionToQuery生成多query→检索→**无结果时明说"我找不到信息"绝不编造**→AnswerQuestion→remove_uncompleted_sentences_with_citations删残句） | knowledge_curation.py:181 | 无 | cortex/quality.py有引用启发式(+0.05) | 完全没有 | P0。"删掉带引用的不完整句子"是极低成本的幻觉抑制 |
| 4 | **StormInformationTable**（所有对话轮的search_results按URL聚合→snippets去重→url_to_info字典；全文可导出带siting标记的信息块） | storm_dataclass.py:54 | 无 | vein/有内容寻址存储 | 部分有 | 研究中间产物标准化：**URL→Information{snippets,raw,meta}**。P1 |
| 5 | **两阶段大纲**（WritePageOutline直接生成 / WritePageOutlineFromConv从对话历史生成；clean_up_outline去重去序号规范） | outline_generation.py | 无 | learn/api.py有课程大纲 | 部分有 | 报告大纲模块。P1 |
| 6 | **逐节生成+引用标注**（generate_section逐节带information table上下文，正文插`[1][2]`引用；generate_article装配ArticleSectionNode树） | article_generation.py | 无 | 无 | 完全没有 | 政企报告刚需。P1 |
| 7 | **润色模块**（WriteLeadSection自动生成导语摘要 + PolishPage全文去重（可选一次额外LLM调用）；insert_or_create_section深度合并而非覆盖） | article_polish.py | 无 | 无 | 完全没有 | P2 |
| 8 | **ArticleTextProcessing引用工具箱**（parse_citation_indices / deduplicate_group合并重复引用`[1][1]`→`[1]` / update_citation_index重编号 / remove_citations / **remove_uncompleted_sentences_with_citations** / limit_word_count_preserve_newline） | utils.py:301-595 | 无 | 无 | 完全没有 | **可直接移植的纯函数库**，150行，立即可用 |
| 9 | **LM调用级磁盘缓存**（`~/.storm_local_cache` + functools.lru_cache双层，`cache=True`逐调用开关；缓存命中cost=None并显式标注） | lm.py:42,115 | 无 | reflex/cache.py是语义响应缓存非LLM调用缓存 | 部分有 | **研究类任务重复率高，磁盘缓存省真金白银**。P1 |
| 10 | **每模块独立LM**（STORMWikiLMConfigs：conv_simulator/question_asker/outline_gen/article_gen/article_polish 5个槽位各配模型，提问用便宜模型、写作用好模型） | storm_wiki/engine.py:21 | 无 | gland/router.py有provider路由无"按管线阶段分级" | 部分有 | 快/慢模型分级与TradingAgents互证。P1 |
| 11 | **逐调用用量日志**（log_usage + get_usage_and_reset：prompt/completion/cost累计，日志里删除api_key） | lm.py:210 | 无 | gland/token_meter有总量 | 部分有 | — |
| 12 | **统一Retriever接口+exclude_urls**（rm.py 1238行：You/Bing/Serper/Tavily/Exa/SearXNG/VectorRM(FAISS+Qdrant)/Azure/…，retrieve(queries, exclude_urls=[ground_truth_url])评测防泄漏） | rm.py | 无 | 无retriever抽象 | 完全没有 | 与gpt-researcher 20检索器互证 → OpenSoul缺"检索源抽象层"。P1 |
| 13 | **WebPageHelper网页清洗**（trafilatura抽取→urls_to_articles/urls_to_snippets双粒度→按词数阈值过滤掉空洞页面） | utils.py:633 | 无 | 无 | 完全没有 | P1 |
| 14 | **阶段CallbackHandler**（on_dialogue_turn_end/on_outline_generated等回调，openreview日志；前端demo靠它做实时展示） | modules/callback.py + collaborative callback.py | 无 | event_stream有事件流 | 部分有 | 与gpt-researcher ResearchProgress同族。P1 |
| 15 | **Co-STORM协作式研究（人机同场）**：Moderator Controller调度多个Expert（各带grounded answer）+ **真人用户随时插话**→ Information Insertion Module把新信息写入知识库 → Knowledge Base Summary防止上下文膨胀 | collaborative_storm/ 12模块 | 无 | 无 | 完全没有 | **"人可以随时插话进研究过程"**——最接近用户工作方式的研究模式。P1 |
| 16 | **GroundedQuestionGeneration/Answering**（问题必须锚定知识库内容生成，答案必须带出处） | collaborative_storm/modules/ | 无 | 无 | 完全没有 | P1 |
| 17 | **Runner分阶段+本地断点续跑**（run_knowledge_curation/run_outline_generation/run_article_generation/run_article_polishing可分开跑；`_load_information_table_from_local_fs`等从磁盘恢复上一阶段产物） | storm_wiki/engine.py:211-340 | 无 | marrow/backup.py是备份非阶段断点 | 完全没有 | **长研究任务必须**：跑到第3阶段崩了不用重跑前2阶段。P0 |
| 18 | **输入安全检查**（user_input_appropriateness_check / purpose_appropriateness_check，拒绝不当研究请求） | utils.py:714,769 | 无 | immune/有安全模块 | 部分有 | — |
| 19 | **DSPy声明式签名**（每个LLM步骤=Signature类：输入输出字段+docstring即prompt，可整体优化/换后端零改代码） | 全库 | 无 | echo/templates.py是字符串模板 | 部分有 | 声明式prompt工程思路。P2 |
| 20 | **QdrantVectorStoreManager**（本地/在线双模向量库构建+增量更新，作为RM的本地知识源） | utils.py:60 | 无 | hippo有向量存储 | 部分有 | — |

## 源码亮点
- **Persona→提问→检索→作答的循环**：不是"生成N个query搜一遍"，而是**模拟一场采访**，问出的问题是上一轮答案引出的。这是STORM报告质量高于普通深度研究的根因。
- **反幻觉三件套**（全是廉价后处理）：`无检索结果→明说不知道`、`删带引用的残句`、`引用去重+重编号`。
- **5个阶段各自独立的LM与可独立运行/恢复**：管线工程化成熟度极高。
- **评测防泄漏设计**：`exclude_urls=[ground_truth_url]`贯穿检索接口——研究基建里少见的严谨。
- Co-STORM的**Information Insertion Module**（人说的话也要经过"插入知识库"这一步，而不是直接拼进prompt）——人机协作的信息治理。

## 可复用设计
1. **ArticleTextProcessing**（150行纯函数）→ 直接移植为OpenSoul `cortex/citation_utils.py`，立即提升报告质量
2. **阶段断点续跑**（每阶段产物落盘+可从磁盘加载）→ OpenSoul will/长任务必备
3. **LM磁盘缓存+cache逐调用开关** → reflex/cache扩展到LLM调用层
4. **persona引导研究** → 与gpt-researcher DeepResearchSkill互补：一个管广度递归，一个管视角覆盖
5. **Co-STORM人机同场研究** → OpenMate聊天界面天然适配，是最"产品化"的研究交互形态
6. **每阶段独立LM配置** → gland/router加"阶段→模型"映射表

## 与gpt-researcher的互补关系（两者合起来=完整深度研究）
| 维度 | gpt-researcher | STORM |
|---|---|---|
| 广度 | ✅ breadth×depth递归 | ❌ |
| 视角 | ❌ | ✅ persona采访 |
| 引用 | 弱（add_references） | ✅ 三件套工具箱 |
| 人审 | ✅ HumanAgent节点 | ✅ Co-STORM随时插话 |
| 断点 | ❌ | ✅ 分阶段续跑 |
| 工具 | ✅ MCP+20检索器 | 统一RM接口 |

→ OpenSoul深度研究应取"广度递归(STORM无) + persona采访 + 引用三件套 + 分阶段断点"的组合。
