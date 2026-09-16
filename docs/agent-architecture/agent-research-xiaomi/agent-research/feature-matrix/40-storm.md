# Stanford STORM 功能研究（第40轮，深度源码）

> 仓库：stanford-oval/storm（28k星，NAACL'24 + Co-STORM）
> 源码规模：52个py文件，14,390行（shallow clone实测 /tmp/storm）
> 核心结构：knowledge_storm/ = storm_wiki/（单人流水线）+ collaborative_storm/（Co-STORM圆桌）+ lm.py/rm.py/logging_wrapper.py + interface.py（5阶段抽象接口）
> 研究方式：逐模块阅读源码 + grep /home/climbing/opensoul/src 与 /home/climbing/openmate/src 验证

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **五阶段研究流水线**（知识策展→大纲→分节写作→润色，interface.py定义KnowledgeCurationModule/OutlineGenerationModule/ArticleGenerationModule/ArticlePolishingModule四个抽象） | 没有 | 没有（multi_agent.py仅88行玩具：Researcher/Writer单轮直调LLM，无检索接地、无阶段、无中间产物） | 完全没有 | 售前标书/方案文档的"研究→大纲→成文"是产品级能力。参考39轮gpt-researcher的最小闭环，STORM补上"大纲两遍法+分节并行写作" |
| 2 | **视角制导多persona并行研究**（persona_generator：LLM找相关wiki页面→读TOC生成N个编辑persona→ThreadPoolExecutor并行跑N场对话，默认+3视角，"Basic fact writer"兜底） | 没有 | 没有 | 完全没有 | 中标方案的多视角（技术/商务/评审专家）调研直接对应。1-2天：persona生成prompt+asyncio.gather并行 |
| 3 | **模拟"写作者↔专家"信息寻求对话**（ConvSimulator：WikiWriter按persona逐轮提问→TopicExpert问题→多query→检索→带引用作答→"Thank you"终止，max_conv_turn=3，历史近4轮全文+更早轮截断"Omit the answer"） | 没有 | 没有 | 完全没有 | 这是STORM质量核心：研究不是"搜一次"而是"带着视角追问"。可作为OpenSoul research意图的执行层核心 |
| 4 | **研究语料库本地语义检索**（StormInformationTable：url→snippets去重合并表，prepare_table_for_retrieval用SentenceTransformer('paraphrase-MiniLM-L6-v2')编码全部snippet，写每节时按节query余弦top-k取材） | 没有 | 没有（hippo为FTS5+LIKE+Jaccard，graphrag正则NER，全库无sentence-transformers） | 完全没有 | 与33轮mem0"检索层无语义向量"结论汇合——**研究语料/记忆检索共用一个本地embedding检索器**，一份基建两处受益。半天-1天 |
| 5 | **大纲两遍法**（WritePageOutline先参数知识直出draft大纲→WritePageOutlineFromConv拿对话精修为最终大纲；两者都落盘direct_gen_outline.txt/storm_gen_outline.txt供对比） | 没有 | 没有 | 完全没有 | 立即可抄：标书/方案章节大纲先直出再按调研材料修订，双大纲文件留档。0.5-1天 |
| 6 | **分节并行写作+按节取材**（ThreadPoolExecutor每节一个任务；用节大纲hashtag列表做query从信息表检索top-k→info限1500词→WriteSection带行内引用[1][2]生成；自动跳过introduction/conclusion节） | 没有 | 没有 | 完全没有 | 长文档生成的并行化+每节独立检索接地。2-3天 |
| 7 | **统一引用系统**（_merge_new_info_to_references：url→统一编号全局去重；update_section删除越界引用号、修剪未引用源、citation_idx_mapping重映射本节局部编号到全局编号；reorder_reference_index按正文出现顺序重排全部引用并同步reference表） | 没有 | 没有（cortex/quality.py仅+0.05"有引用"打分，无引用管理） | 完全没有 | **售前标书的"资料来源"痛点**。citation映射逻辑纯字符串处理，1天可移植，与39轮citation管线结论互为增量 |
| 8 | **文章树结构+润色**（StormArticle：ArticleSectionNode树，insert_or_create_section递归合并/trim_children；polish=独立LLM写lead section（≤4段带引用）+可选整页去重润色PolishPage） | 没有 | 没有 | 完全没有 | 长文"摘要先行+去重"润色pass。1天 |
| 9 | **阶段可断点续跑**（run(do_research/do_generate_outline/do_generate_article/do_polish_article四个开关)：跳过的阶段从磁盘artifact反序列化（conversation_log.json→InformationTable.from_conversation_log_file、outline文件、article+url_to_info.json），每阶段中间产物全部落盘） | 没有 | 没有（34轮：will/engine纯内存无持久化，同一结论第三次印证） | 完全没有 | **最高性价比**：长研究任务跑到第3阶段崩了不用从头来。设计=每阶段输入输出都是可序列化数据类。2-3天（与34轮工作流持久化合并做） |
| 10 | **分阶段独立LLM配置**（STORMWikiLMConfigs：conv_simulator/question_asker/outline/article_gen/polish五个槽位各配模型+max_tokens——提问用4o-mini 500tok、润色用4o 4000tok） | 没有 | 没有（27轮LiteLLM"按用途分工"结论的开源参考实现） | 完全没有 | 深研流水线各阶段复杂度不同，便宜模型干提问、贵模型干润色。配置类半天 |
| 11 | **LLM调用历史+成本落盘**（post_run：lm_configs.collect_and_reset_lm_history→llm_call_history.jsonl逐call记录，含litellm response_cost；LoggingWrapper：pipeline_stage→event_stack树状计时（time_usage/lm_usage/query_count），事件起止毫秒时间戳） | 部分（spending/page.tsx存在但为localStorage会话级） | 没有 | 基本没有 | 与27轮LiteLLM/52轮Langfuse结论汇合：**第4个独立实现印证**。LoggingWrapper的"阶段→事件栈→LLM用量"三层结构50行可抄进acp-proxy。1天 |
| 12 | **LLM磁盘缓存**（litellm.cache=Cache(disk_cache_dir=~/.storm_local_cache,type='disk') + @lru_cache包cached_litellm_completion；cache命中cost=None区分统计） | 没有 | 没有（reflex有对话缓存，无LLM响应磁盘缓存） | 完全没有 | 研究类任务高度重复query，磁盘缓存直接省钱提速。litellm自带，接线半天 |
| 13 | **Co-STORM圆桌讨论+话语管理**（DiscourseManager：TurnPolicySpec策略对象决定下一turn谁发言——simulated_user→pure_rag基线→moderator_override→连续N轮无提问强制moderator插话并重组知识库→专家round-robin（pop(0)+append轮转）+should_polish_utterance标志） | 没有 | 没有 | 完全没有 | 战略项："用户+A群组"页面若要做多agent圆桌，这就是开源最完整的turn管理参考。3-5天 |
| 14 | **对话中动态生成专家**（_update_expert_list_from_utterance：每轮提问后GenerateExpertModule按focus+background生成N个新专家角色并实例化CoStormExpert） | 没有 | 没有 | 完全没有 | 与8轮CrewAI静态角色对比：STORM专家团按话题动态组建。1-2天 |
| 15 | **分层知识库树+LLM导航插入**（KnowledgeBase/KnowledgeNode：线程安全insert（RLock）、uuid寻址；InsertInformationModule：逐层LLM导航选位置（_get_navigation_choice给出候选section让LLM选）+embedding排序兜底（choose_candidate_from_embedding_ranking）；ExpandNodeModule：找最浅未覆盖节点让LLM展开子节） | 没有 | 没有（hippo为扁平记忆，无层级树+导航插入） | 完全没有 | 研究知识的组织结构：树+自动归位+自动扩展。对标书素材库（按标书结构树归档资料）是刚需。3-5天 |
| 16 | **KB摘要注入对话**（KnowledgeBaseSummaryModule：树结构hashtag化→LLM生成"已讨论内容"brief summary，作为圆桌上文，替代全量历史） | 没有 | 部分（有记忆摘要类能力但无"树结构→摘要"注入管线） | 部分有 | 长会话上下文压缩的结构化方案，半天可抄 |
| 17 | **Warm Start冷启动**（WarmStartModule：hierarchical chat先把已有报告按节转录为模拟对话（ReportToConversation）、并行跑warmstart专家问答、生成初始KB+初稿大纲，再交给用户接管） | 没有 | 没有 | 完全没有 | "给我XX方案初稿"→自动预热后交人工微调，售前场景直接命中。2-3天 |
| 18 | **SimulatedUser自动实验**（co_storm_agents.SimulatedUser：带intent注入的假用户，配合rag_only_baseline_mode做全自动评估） | 没有 | 没有 | 完全没有 | 与35轮n8n agent-evals/36轮judge四源码汇合：**评估闭环的用户侧模拟器**。1-2天 |
| 19 | **输入适当性双检查**（utils.user_input_appropriateness_check：20词上限+字符白名单+LLM四类拒绝（敏感/非英文/个人经历/非研究目的）带编号理由；purpose_appropriateness_check防废话绕过） | 没有 | 部分（immune/仅web攻击+PII正则，25轮结论） | 部分有 | 与25轮NeMo结论合并：**LLM分类器式输入门控**是prompt级防护的最轻实现，拒绝理由编号返回用户可解释。0.5-1天 |
| 20 | **ground_truth_url防泄漏**（检索时exclude_urls排除标准答案URL——评估不作弊的工程纪律） | 不适用 | 没有 | 完全没有 | 做评估集时的必备细节，写评估runner时记住 |
| 21 | **回调事件流**（callback.BaseCallbackHandler：on_identify_perspective_start/end、on_information_gathering、on_direct_outline_generation_end、on_outline_refinement_end、on_dialogue_turn_end……streamlit前端据此实时渲染各阶段进度+中间产物） | 部分（OpenSoul event_stream.py是系统状态probe轮询，非流水线阶段事件） | 没有（research流水线本身不存在） | 基本没有 | 直接命中用户"我都不知道他们在干嘛"痛点：研究任务的阶段级事件流。与39轮"研究进度卡UI"合并，1天 |
| 22 | **检索器插件族**（rm.py：YouRM/BingSearch/SerperRM/VectorRM(Milvus)/StanfordOvalArxivRM + 示例中SearXNG；retriever.py统一线程池封装+exclude_urls） | 部分（OpenMate有web_search/web_extract） | 部分 | 部分有 | arXiv/SearXNG自托管检索器可补OpenSoul学术/隐私检索 |

## 源码亮点

1. **interface.py的抽象纪律**：4个Stage Module接口+Retriever/Information/Article数据类全部先定义，storm_wiki与collaborative_storm两套实现共享——OpenSoul做research执行层时值得照抄这套"接口先行"结构。
2. **citation重映射是全文最精巧的纯逻辑**（storm_dataclass.update_section + reorder_reference_index，~100行）：本节局部[1][2]→全局编号→删未引用源→按正文序重排。零LLM零依赖，直接可抄。
3. **对话历史三级截断**：近4轮全文、更早轮"Omit the answer here due to space limit"、整段限2500词preserve_newline——比简单截尾聪明得多。
4. **lm.py双层缓存**：litellm磁盘cache（跨进程）+functools.lru_cache（进程内），cache命中cost=None不计入成本统计。
5. **LoggingWrapper事件栈**：pipeline_stage→child_events树，阶段互斥（重复start抛RuntimeError）防嵌套bug——可观测性实现的教科书。
6. **每阶段产物即文件**：conversation_log.json/raw_search_results.json/storm_gen_outline.txt/direct_gen_outline.txt/storm_gen_article.txt/url_to_info.json/run_config.json/llm_call_history.jsonl——研究过程100%可审计可复现。

## 可复用设计

| 设计 | 抄到哪 | 难度 | 价值 |
|------|--------|------|------|
| 引用统一编号+重映射+重排（#7纯逻辑） | OpenSoul research/报告生成模块 | 1天 | 标书"资料来源"刚需 |
| 本地embedding信息表+按节检索（#4） | OpenSoul hippo检索层升级（与33轮mem0结论共用） | 1-2天 | 记忆+研究双受益 |
| 阶段断点续跑+产物落盘（#9） | OpenSoul will持久化（34轮方案的具体参考实现） | 2-3天 | 重启不丢（唯一致命项第三次印证） |
| LLM调用历史jsonl+阶段计时树（#11） | acp-proxy插桩（27/52轮方案的最轻参考） | 1天 | "花了多少钱"直接可答 |
| litellm磁盘cache（#12） | acp-proxy LLM入口 | 0.5天 | 省钱提速 |
| LLM输入门控+编号拒绝理由（#19） | OpenSoul immune/ | 0.5-1天 | prompt级防护最轻实现 |
| 大纲两遍法（#5）+分节并行写作（#6） | OpenSoul research执行层（39轮闭环的STORM增量版） | 3-5天 | 方案/标书长文生成 |
| 阶段级回调事件流（#21） | OpenSoul event_stream + OpenMate研究进度卡 | 1天 | 用户可观测性 |
| KB树+导航插入+自动展开（#15） | OpenSoul hippo长期记忆结构升级 | 3-5天（战略） | 标书素材库/知识树 |
| Co-STORM DiscourseManager turn策略（#13） | OpenMate AI群组多agent圆桌（战略，先讨论后动手） | 3-5天 | 多agent协作质量 |

## 与前几轮结论的汇合（证据链更新）

- 持久化缺口：34轮LangGraph、35轮n8n、本轮STORM——**三源码印证**，阶段产物落盘是通用模式
- 成本/可观测：27轮LiteLLM、52轮Langfuse、39轮cost_callback、本轮STORM llm_call_history——**四源码印证**
- 语义检索缺口：33轮mem0、本轮STORM信息表——双源码印证，本地MiniLM嵌入是共同最小方案
- 评估闭环：35轮n8n、36轮LobeHub、39轮、本轮SimulatedUser——**四源码印证**
- 深研执行层为空：39轮gpt-researcher验证multi_agent.py仅88行，本轮再次确认（Researcher/Writer单轮无检索）——STORM补上了39轮缺的"大纲+分节成文"后半段
