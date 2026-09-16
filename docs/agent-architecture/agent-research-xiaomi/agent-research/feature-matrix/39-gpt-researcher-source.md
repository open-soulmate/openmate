# GPT-Researcher (#39, 105k★) 功能研究 — 源码级

更新：2026-09-17 05:30
源码：~/agent-research-src/gpt-researcher（codeload tarball, 24MB, master）
核心包：gpt_researcher/（agent.py 739行 + skills/ 6个技能类 + context/ + mcp/ + retrievers/ 20种 + scraper/ 8种）

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **DeepResearchSkill：广度×深度递归研究**（generate_search_queries→并发N个子GPTResearcher实例→process_research_results提取learnings+citations+followUpQuestions→depth-1且breadth=max(2,breadth//2)递归） | skills/deep_research.py (438行) | 无 | 无 | 完全没有 | P0。delegate_task已有子agent地基，加breadth/depth参数+learnings聚合即可。~3天 |
| 2 | **ResearchProgress进度对象**（total_depth/total_breadth/current_query/completed_queries，on_progress回调逐查询推送WebSocket） | deep_research.py:39 | 无进度协议 | event_stream.py有事件流 | 部分有 | 定义ResearchProgress事件类型，前端渲染"深度2/广度3，已完成5/9查询"。**直击"不知道在干嘛"** |
| 3 | **子查询并发+Semaphore限流**（asyncio.Semaphore(concurrency_limit)+gather，共享visited_urls去重） | deep_research.py:236 | 无 | 无 | 完全没有 | 已有ResourceLock思想可复用（openhands调研）。P1 |
| 4 | **SourceCurator：LLM可信度排序来源**（smart_llm+temperature 0.2，按"relevance/credibility/reliability"排序取top-N，失败降级返回原始列表） | skills/curator.py (96行) | 无 | 无 | 完全没有 | P0，成本极低（一个prompt函数+一次LLM调用）。政企报告可信度刚需 |
| 5 | **ContextCompressor：上下文压缩检索**（RecursiveCharacterTextSplitter 1000/100 + EmbeddingsFilter similarity_threshold=0.35 + **小文档集快路径**：total_chars<COMPRESSION_THRESHOLD(8000)直接跳过压缩） | context/compression.py:85 | 无 | reflex/cache有similarity_threshold但用于语义缓存 | 完全没有 | P0。**快路径的"先算大小再决定要不要压缩"是可直接抄的成本优化** |
| 6 | **WrittenContentCompressor：按已写章节标题检索相似已写内容**（防重复写作） | context/compression.py:181 | 无 | 无 | 完全没有 | 长报告生成防重复。P2 |
| 7 | **20+检索器插件化**（tavily/serper/serpapi/google/bing/duckduckgo/exa/searx/searchapi/arxiv/semantic_scholar/pubmed_central/bocha/xquik/getxapi/custom…统一`get_retrievers(headers,cfg)`工厂） | retrievers/ | 无 | mcp/server_registry只有web_search一个 | 部分有 | OpenSoul是MCP思路（工具即插件），可加"检索源适配器"薄层。P1 |
| 8 | **8种scraper适配器**（beautiful_soup/browser/firecrawl/tavily_extract/pymupdf/arxiv/web_base_loader + 统一scraper.py分发） | scraper/ | 无 | 无（无scrape能力） | 完全没有 | web_extract已有思路，缺scrape分发器。P1 |
| 9 | **MCPToolSelector：按query动态选工具**（LLM从全部MCP工具选max_tools=3个相关工具，含fallback启发式） | mcp/tool_selector.py (203行) | 无 | mcp/是全量暴露 | 完全没有 | **工具多了必做**——上下文token省90%。与claude-code tool_search互证。P0 |
| 10 | **mcp_strategy三档**（fast=只对原始query跑MCP / deep=对所有子查询跑 / disabled；带旧名deprecated兼容层） | agent.py:216 | 无 | 无 | 完全没有 | 可观测的成本档位设计，配置项值得抄。P2 |
| 11 | **多报告类型**（research_report/subtopic_report/detailed_report/resource_report/outline_report/**deep_research**/custom_report，report_format=markdown|pdf|docx） | utils/enum.py + actions/report_generation.py (309行) | 无 | learn/api.py有course outline（课程场景） | 部分有 | 报告类型枚举+模板族。P1 |
| 12 | **逐步成本核算**（research_costs + step_costs{step: $} + add_costs回调贯穿每次LLM/embedding调用，estimate_embedding_cost） | agent.py:164 + context/compression.py | 无 | gland/token_meter有budget无逐步归因 | 部分有 | 升级为"每步成本"，与Langfuse逐span归因同族。P1 |
| 13 | **多智能体编辑部（LangGraph）**：ChiefEditorAgent(planner)→human→researcher团队→writer→publisher→**reviewer(OpenAI grader打分)→reviser(按批注重写)→再评审循环** | multi_agents/agents/*.py 8个Agent | 无 | will/dag_planner有DAG骨架 | 部分有 | reviewer→reviser的"生成-评审-修订"闭环可直接抄。P1 |
| 14 | **HumanAgent人审节点**（include_human_feedback时WebSocket `human_feedback`类型消息+receive_text阻塞等回复，条件边accept/revise） | multi_agents/agents/human.py | 无 | 无HITL协议 | 完全没有 | 与DeerFlow HITL表单互证，OpenMate缺交互协议。P0 |
| 15 | **query_domains域限定检索**（只搜指定域名，贯穿retriever+scraper） | agent.py:149 | 无 | 无 | 完全没有 | 政企"只查内部/可信源"刚需。P1 |
| 16 | **visited_urls跨子研究去重**（set贯穿递归传递给每个子研究者，_get_new_urls过滤） | researcher.py:742 | 无 | 无 | 完全没有 | P1，简单 |
| 17 | **ImageGenerator：LLM先"规划配图概念"再批量生成**（_plan_image_concepts用fast_llm从报告提取N个可视化概念→并发generate→按章节嵌入；provider=google/modelslab） | skills/image_generator.py (771行) | 无 | vision/chart_generator.py能画图但无"规划+嵌入报告"管线 | 部分有 | "先规划后生成"模式可抄。P2 |
| 18 | **PromptFamily提示词家族**（按语言/风格切换整套prompt，get_prompt_family工厂） | prompts.py | locales是i18n非prompt | echo/templates.py有模板 | 部分有 | 中文报告场景可做CN prompt family。P2 |
| 19 | **VectorStoreWrapper统一向量库接口**（load文档→1000/200切分→asimilarity_search+filter，接任意LangChain VectorStore） | vector_store/vector_store.py | 无 | hippo/memory_store有自有向量 | 部分有 | — |
| 20 | **研究来源结构化**（research_sources=[{title,url,content,images}] + research_images + add_references交叉引用 + table_of_contents） | agent.py:150 + actions/markdown_processing.py | 无 | 无 | 完全没有 | 报告带引用溯源，政企刚需。P1 |
| 21 | **subtopic分解**（get_subtopics→max_subtopics=5→每个子题独立研究→subtopic_report汇总；get_draft_section_titles先出章节草稿再逐节写） | writer.py:195/224 | 无 | will/dag_planner按step依赖分解（代码场景） | 部分有 | "先出目录再逐节写"是长文生成标准流程。P1 |
| 22 | **MCP三连接类型**（stdio/websocket/http + connection_token鉴权 + streaming.py流式工具结果） | mcp/client.py,streaming.py | 无 | mcp/有stdio+http | 部分有 | 缺token鉴权远程MCP。P1 |

## 源码亮点
- **递归研究的宽度衰减**：`new_breadth = max(2, breadth // 2)`，深度每降一级广度减半，天然树形收敛。参数可直接抄。
- **上下文快路径**：`if total_chars < 8000 and len(docs) <= max_results: 跳过整个embedding压缩管线`——**先算代价再决定要不要花**。
- **curator失败降级**：LLM返回非法JSON时直接返回原始source_data，研究永不因评分管线崩溃。
- **MCP配置向子研究者显式propagate**（agent.py:255注释专门说明），递归时不丢工具。
- **成本回调贯穿**：连embedding都有`estimate_embedding_cost`并入step_costs。
- 教训（源码注释自曝）：`all_context必须extend而非append`（list与str双形态），说明CURATE_SOURCES开关改变数据类型是易错点。

## 可复用设计
1. **ResearchProgress对象+on_progress回调** → OpenSoul event_stream加一类进度事件（最直接的可观测补丁）
2. **广度/深度递归研究** → 做成OpenSoul `will/` 的一种新DAG节点类型"research_task(breadth,depth)"
3. **SourceCurator** → 30行prompt+一次LLM调用，独立小模块，立即可加
4. **MCPToolSelector（按query选3个工具）** → 对应OpenSoul mcp/server全量暴露的问题，P0
5. **ContextCompressor快路径+阈值** → 语义检索前的成本闸门
6. **reviewer→reviser评审修订循环** → OpenSoul cortex/quality.py已有5维自评，升级为"评了就改"闭环

## 与OpenSoul现有资产的落位
- intelligence/intent.py 已有 `research` 意图 + tools=[web_search, web_extract, browser_exec] → 套上DeepResearchSkill即升级为深度研究
- event_stream.py 已有tts_stats等事件类型 → 加research_progress事件
- will/dag_planner.py 已解析step依赖 → 加research节点
