# gpt-researcher 功能研究（第39号，cron第32轮）

> 仓库：assafelovic/gpt-researcher（29k星）。浅克隆331个py文件，核心=gpt_researcher/（单agent研究引擎）+ multi_agents/（LangGraph多agent报告流水线）。
> 对照验证：OpenSoul=/home/climbing/opensoul/src/（grep实测），OpenMate=/home/climbing/openmate/src/。

## 功能清单（20项）

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **Deep Research breadth×depth迭代树搜索**：每层生成N个SERP查询→并发抓取→提取learnings→基于learnings生成下一层查询，递归到depth上限 | skills/deep_research.py (649行) | ❌没有 | ❌没有（cortex/task_planner.py仅82行线性prompt计划） | 完全没有 | 核心算法独立可移植（无重依赖）：1个`deep_research.py`+并发gather，2-3天。OpenSoul cortex/新建research模块 |
| 2 | **Learning增量循环+引用映射**：每轮提取`{insight, sourceUrl}`结构化learnings，learning→citation字典贯穿全程 | deep_research.py: parse_research_results_response | ❌ | ❌ | 完全没有 | 与#1同做；citation字典是最终报告可信度的根，半天 |
| 3 | **多agent报告流水线（LangGraph）**：ChiefEditor→Editor.plan_research→**并行per-section**（Researcher→Writer→Reviewer→Reviser草稿循环，max_draft_revisions有界）→Publisher→**Fact-checker循环**（max_fact_check_revisions）→Visualizer→Human | multi_agents/agents/orchestrator.py+editor.py | ❌ | ❌ cortex/multi_agent.py仅88行串行玩具（Researcher/Analyzer/Writer各一次调用，无循环无审查无并行） | 完全没有 | 抄LangGraph结构（34轮已建议OpenSoul引langgraph）：StateGraph+bounded revision循环，1周 |
| 4 | **HITL计划审批双向通道**：plan生成后经websocket `human_feedback`事件征求用户意见，`receive_text()`阻塞收回复，max_plan_revisions有界防死循环；console无websocket时降级input() | multi_agents/agents/human.py | ❌OpenMate无"审计划"UI | ⚠️部分：trajectory/session_fsm.py有interrupt字样但无"研究中途等审批"场景 | 部分有 | OpenSoul侧：will引擎34轮interrupt/Command(resume)方案直接覆盖；OpenMate侧需新增计划审批卡片UI，2-3天 |
| 5 | **SourceCurator信源LLM评估排序**：抓取源按可信度/相关性让LLM打分排序，top-N入上下文，json_repair兜底失败回退未筛选源 | skills/curator.py (111行) | ❌ | ❌（33轮印证：无rerank无评估） | 完全没有 | 1天可移植；与rerank.py（本地bge-reranker）二选一或串联，Curator是"LLM粗筛"、reranker是"精排" |
| 6 | **Context压缩双机制**：①EmbeddingsFilter相似度过滤（langchain ContextualCompressionRetriever）②25k词预算trim_context_to_word_limit（**倒序保留最新**） | context/compression.py + deep_research.py | ❌ | ❌无embedding管道（FTS5+LIKE，33轮） | 完全没有 | ②词预算裁剪零依赖立即可抄（半天，长研究任务防爆上下文）；①需先建embedding层（33轮方案） |
| 7 | **双模型分工+reasoning_effort逐调用**：strategic_llm（查询生成/学习提取，配High reasoning）vs smart_llm（信源评估）vs fast_llm（摘要执行）；temperature逐场景（规划0.4/评估0.2） | config/ + 每个skill调用处 | ❌ | ❌（27轮LiteLLM印证：无复杂度路由） | 完全没有 | acp-proxy统一入口加`model_role`参数路由本地/云模型，2-3天（27轮方案的具体落地模板） |
| 8 | **逐步成本核算**：research_costs总额+step_costs分步字典，cost_callback贯穿每次LLM调用（含embedding成本估算utils/costs.py），websocket推送total_cost | agent.py:165,755-792 | ❌ | ❌（26/27轮双重印证） | 完全没有 | **用户痛点"我都不知道他们在干嘛"直接命中**。抄cost_callback模式：每次LLM调用回调记账，1-2天 |
| 9 | **WebSocket结构化研究事件流**：五类事件logs/images/path/citation/human_feedback，前端增量渲染研究进度（当前depth/breadth/completed_queries/total） | actions/utils.py stream_output + ResearchProgress | ⚠️部分：OpenMate聊天有文本流，但无结构化"研究进度卡" | ⚠️部分：websocket模块存在但无研究事件协议 | 部分有 | OpenMate新增research-progress组件（进度树+信源列表实时追加），3天；直击用户"可观测性"要求 |
| 10 | **7种报告类型×6种写作语气**：research/resource/outline/custom/detailed/subtopic/deep × Objective/Formal/Analytical/Persuasive/Informative/Explanatory | utils/enum.py | ❌ | ❌ | 完全没有 | 报告模板=prompt工程为主，1-2天可全量移植；对售前标书/方案场景价值极高（用户是售前工程师） |
| 11 | **Subtopic分解→子报告→聚合**：get_subtopics（max_subtopics限流）→每子主题独立GPTResearcher实例产SubtopicReport→DetailedReport拼合 | skills/writer.py:206 + agent.py | ❌ | ⚠️task_planner.py有分解prompt但无子任务实例化执行 | 部分有 | 与#1的树搜索同构，复用并发框架，2天 |
| 12 | **23+检索器插件**：tavily/google/bing/duckduckgo/brave/exa/arxiv/pubmed_central/semantic_scholar/openalex/searx/serper/serpapi/bocha/xquik/custom...统一BaseRetriever接口 | retrievers/（23个子目录） | ❌ | ⚠️间接有：intelligence/intent.py声明调宿主Hermes的web_search/web_extract工具；**自有检索器为零**，学术源(arxiv/pubmed/知网)完全没有 | 部分有 | 中文刚需：接bocha(博查，国内API)+自定义retriever基类，1-2天；学术检索对写方案/论文有价值 |
| 13 | **MCP三策略+去重检测**：mcp_strategy=parallel/sequential/one-per-query三档，_tavily_mcp_redundant_with_direct自动检测MCP与直连API重复 | skills/researcher.py:400-500 | ❌ | ⚠️部分：mcp-client(8094)已有但无策略概念、无去重 | 部分有 | OpenSoul mcp/server.py加strategy参数，1天（31轮per-user MCP同处改造） |
| 14 | **visited_urls跨子查询全局去重**：所有子查询/子代理共享visited set，_get_new_urls过滤后才抓取 | researcher.py:803 | ❌ | ❌ | 完全没有 | 半天；省抓取成本+防重复上下文 |
| 15 | **query_domains域名限定**：检索限定可信域（gov/edu等）+complement_source_urls混合补充 | agent.py init参数 | ❌ | ❌ | 完全没有 | 半天；投标场景可限定招标网站域名（与china-procurement-research skill呼应） |
| 16 | **图片生成两阶段管线**：①plan_image_concepts先让LLM从报告规划配图概念②并行generate_single_image（多provider）③嵌入报告+占位符处理+select_top_images选优 | skills/image_generator.py (772行) | ❌ | ⚠️vision/仅图表理解无生成（38轮印证） | 完全没有 | 38轮khoj"两步图表生成"结论的完整版源码；依赖图片生成API，2-3天 |
| 17 | **Visualizer Mermaid图表agent**：从研究数据提取结构→生成单个mermaid块（无合适数据返回'None'哨兵） | multi_agents/agents/visualizer.py (56行) | ⚠️部分：OpenMate如已渲染mermaid则前端有基础 | ❌无"数据→图表"生成 | 部分有 | 56行，半天可抄；与32轮E2B"图表结构化提取"互补 |
| 18 | **json_repair三级兜底解析**：JSON→正则提取```json块→行模式regex（Query:/Learning:/Question:逐行匹配），LLM输出永不因解析失败丢数据 | deep_research.py + utils | ❌ | ❌OpenSoul多处直接json.loads | 完全没有 | **通用基建**：json_repair库（pip）+3级fallback封装，1天；35轮_eval_condition安全化同批做 |
| 19 | **PromptFamily多语言家族**：prompt_family_mapping按语言切换全部prompt模板，报告语言≠界面语言 | prompts.py:879 | ❌ | ❌ | 完全没有 | 中文prompt家族=2天（prompt翻译为主）；国内交付刚需 |
| 20 | **可插拔vector_store后端wrapper**+文档loader族（azure/online/langchain）+报告源四选一（web/local/vectorstore/documents） | vector_store/ + document/ | ❌ | ❌（33轮印证无向量层） | 完全没有 | 战略依赖：先落地embedding层（33轮方案）再谈 |

## 源码亮点

1. **DeepResearch是"研究"与"写作"解耦的典范**：研究阶段产出`learnings[] + citations{}`纯结构化中间产物，写作阶段只消费learnings不接触原始网页——上下文天然压缩，且中间产物可持久化/复用/审计。OpenSoul应照此设计：`research_result = {learnings, citations, sources, progress}`落库。
2. **有界修订循环**是全仓库的统一模式：max_plan_revisions / max_draft_revisions / max_fact_check_revisions 三个计数器防止LLM互相审查死循环——比34轮langgraph的RetryPolicy更上位的"agent间循环也需要预算"设计。
3. **cost_callback注入**而非集中计算：每次create_chat_completion可传cost_callback，记账逻辑零侵入业务代码。抄这个模式进acp-proxy最干净。
4. **strategic/smart/fast三级模型命名**（不是"大/小"而是按用途）：strategic=生成查询和提取学习（要聪明）、smart=评估信源、fast=摘要大量网页（要便宜）。是27轮LiteLLM"复杂度路由"的最小可行版。
5. **哨兵值文化**：visualizer返回'None'字符串表示"无合适图表"，is_none_accept_response/is_human_plan_approval统一判定"用户说no"——处理LLM输出模糊性的实用技巧。

## 可复用设计（按性价比排序，与既有缺口合并）

| 优先级 | 功能 | 工时 | 依赖 | 备注 |
|--------|------|------|------|------|
| P0 | 成本核算cost_callback（#8） | 1-2天 | 无 | 与26/27轮结论合并，用户痛点 |
| P0 | json_repair三级解析（#18） | 1天 | pip json_repair | 通用基建，同时修_eval_condition |
| P0 | 词预算trim_context（#6②） | 半天 | 无 | 长研究防爆上下文 |
| P1 | Deep Research引擎（#1+#2+#14） | 3-5天 | 检索器（现有web_search即可启动） | **OpenSoul从"问答"升级"研究"的分水岭**；对售前标书/方案调研直击业务 |
| P1 | 双模型分工路由（#7） | 2-3天 | acp-proxy | 27轮LiteLLM方案落地模板 |
| P1 | SourceCurator信源筛选（#5） | 1天 | 无（纯LLM） | 可先做LLM版，reranker后补 |
| P2 | HITL计划审批+WebSocket研究事件流（#4+#9） | 3-5天 | OpenMate UI改造 | 可观测性+人工把关，用户明确诉求 |
| P2 | 报告类型×语气模板库（#10+#19） | 2-3天 | 无 | 售前场景直接可用 |
| P2 | 多agent报告流水线（#3+#11） | 1周 | langgraph引入 | 与34轮will引擎持久化同步规划 |
| P3 | 图片生成管线（#16）+Mermaid可视化（#17） | 2-4天 | 图片生成API | |
| P3 | 检索器插件+域名限定（#12+#15） | 2-3天 | API key | bocha国内源+招标网站域名限定 |

## 战略结论

gpt-researcher证明：**"深度研究"是一个可独立成立的产品能力**，不是聊天的附属。OpenSoul当前intelligence/intent.py虽声明了research意图，但落到cortex/只有88行玩具multi_agent和82行task_planner——意图识别到了，执行层是空的。最小闭环=DeepResearch引擎(#1)+citation(#2)+成本(#8)+进度流(#9)，合计约2周，即可让OpenSoul具备"给我写一份XX调研报告（附来源、可看进度、知道花了多少钱）"的完整能力。
