# BettaFish/微舆 功能研究（第41轮）

> 仓库：666ghj/BettaFish（42k星，Python，从0实现不依赖框架）
> 规模：174个py文件，核心~49k行（ReportEngine 26k + InsightEngine 5k + MindSpider 4k + MediaEngine 3.6k + QueryEngine 3.2k）
> 定位：多Agent舆情分析——5引擎流水线（Query/Media/Insight三路检索分析 → ForumEngine圆桌 → ReportEngine成文）+ MindSpider爬虫 + 本地微调情感模型

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **IR中间表示报告契约**：JSON Schema定义16种block（heading/paragraph/list/table/swotTable/pestTable/kpiGrid/widget/figure/callout/toc…）+12种inline mark，IR_VERSION版本化，IRValidator统一校验，章节生成/校验/渲染三处共享同一结构 | 无 | 无 | **完全没有** | 这是"LLM写长文档"的架构级正解：LLM产出结构化IR→校验→多渲染器。标书/方案文档生成直接受益。schema.py仅545行可整体移植，1-2天 |
| 2 | **一源多渲染器**：同一IR分别渲染HTML(6.5k行)/PDF(1.6k行)/Markdown(994行)/Chart→SVG(1.2k行) | 无（workspace只有文本预览） | 无（vision只有PNG图表） | **完全没有** | 先做Markdown+HTML两个渲染器（2-3天），PDF后置 |
| 3 | **图表三级修复管线**：ChartValidator(9类Chart.js图本地规则校验)→ChartRepairer本地规则修复→LLM API修复（调4个引擎的LLM），"宁愿不改也不要改错"原则；ChartReviewService单例跨渲染器共享修复状态+修复后回写IR文件+线程安全统计 | 无 | 无（chart_generator只产静态PNG，无校验） | **完全没有** | 校验+本地修复纯逻辑(730行)1-2天可移植；直接解决"LLM生成图表数据必出错"的痛点 |
| 4 | **表格独立校验器**：table_validator.py 516行，表格结构/列数/数据类型专项验证 | 无 | 无 | 完全没有 | 标书表格刚需，与#3同一管线复用 |
| 5 | **PDF布局优化器**：dataclass配置每类组件(KPI卡/提示框/表格)的字号/行距/内边距，文本宽度检测防溢出、色块边界自动调整、优化方案持久化可加载 | 无 | 无 | 完全没有 | python-docx场景对应"排版自适应"，1.4k行，可先抄溢出检测思路 |
| 6 | **WordBudgetNode篇幅规划**：写作前LLM先规划每章target/min/max字数+全局写作准则+强调点，写章节时作为约束传入 | 无 | 无 | 完全没有 | 直接命中用户"标书字数要求"场景，~200行，**半天可抄** |
| 7 | **模板选择节点**：LLM从模板目录候选中选择+理由，失败回退内置模板 | 无 | gene/templates.py仅静态模板 | 部分有 | 结合#1的模板Sections机制，1天 |
| 8 | **章节级生成-校验-重试闭环**：ChapterGenerationNode产出→IRValidator校验→失败带错误信息重试，三种受控异常分类（JsonParse/Content/Validation） | 无 | 无 | 完全没有 | 与39轮"有界修订循环"同族，但这里闭环在单章节粒度，1天 |
| 9 | **RobustJSONParser四级兜底**：清markdown包裹+清thinking内容(中文"让我想想/首先/分析"模式!)→本地语法修复(括号平衡/逗号补全/控制字符转义)→json_repair库→可选LLM修复，异常附raw_text | 无 | 无（_eval_condition裸eval，34/35轮已证） | **完全没有** | 763行，**立即可抄**——同时是OpenSoul eval安全化的现成方案，且中文思考前缀regex是中文LLM专属经验 |
| 10 | **本地微调情感模型族**：WeiboMultilingualSentiment五级分类(非常负面→非常正面)+概率分布；GPT2-LoRA/AdapterTuning/BertChinese-LoRA/SmallQwen四套微调代码+数据集落库 | 无 | mind/emotion.py是LLM情绪非文本情感分类 | 完全没有 | 舆情/客户反馈分析场景；OpenSoul可先接开源中文情感模型（如transformers现成checkpoint），2-3天 |
| 11 | **关键词优化中间件**：Agent生成的搜索词→LLM优化为贴近舆情库的关键词（含reasoning链） | 无 | 无 | 完全没有 | 检索质量提升通用件，适配任何搜索后端，~300行，**1天可抄** |
| 12 | **ForumEngine圆桌主持人**：LogMonitor实时监控3引擎log文件（记录读取位置/行数增量），regex识别SummaryNode输出并捕获多行JSON，缓冲agent发言每5条触发一次LLM主持人总结写入forum.log | 无 | 无（event_stream是系统probe轮询） | **完全没有** | 多agent并行时的"旁观者总结"模式——不要求agent互相通信，靠日志观察+定期聚合。与36轮Lobe表情回应、40轮Co-STORM圆桌汇合：**多agent系统需要第三方观察聚合层**。演示可观测性诉求的另类解法 |
| 13 | **三引擎反思式摘要**：FirstSummaryNode首次总结→ReflectionSummaryNode带历史反思迭代（paragraph.research.increment_reflection()计数） | 无 | cortex/reflector.py已有反思 | 部分有 | OpenSoul已有反思器，缺"反思次数上限+结构化increment计数"，半天 |
| 14 | **FileCountBaseline文件系统编排**：启动时记录三引擎md文件数基准落盘json，轮询检测增量判断"所有引擎是否就绪"，Web层据此提示 | 无 | 无 | 完全没有 | 脏但有效的零MQ跨进程编排；OpenSoul应做正经事件总线（nerve/events.py已有雏形），此方案仅作反面参考 |
| 15 | **流式事件+任务取消**：run()接受stream_handler回调按阶段标签emit；Flask /cancel/<task_id>路由，任务状态机pending/running/completed/error/cancelled，publish_event广播 | 部分有（OpenMate SSE） | 无（34轮已证cancel_execution是bug：只改标志不cancel Task） | 部分有 | 修复OpenSoul cancel bug时参照其状态机+终态集合{completed,error,cancelled} |
| 16 | **优雅重试装饰器**：with_graceful_retry(RetryConfig, default_return=...)——可重试HTTP状态码集合{408,409,425,429}+5xx，指数退避，失败返回默认值不抛出（搜索失败≠任务失败） | 无 | 无（link_gateway等处散落裸retry） | 完全没有 | ~100行通用工具，**半天可抄**，default_return设计让流水线对瞬时故障免疫 |
| 17 | **MindSpider两段爬虫**：BroadTopicExtraction（当日新闻→LLM主题抽取→DB去重入库）→DeepSentimentCrawling（平台爬虫+关键词管理器），SQLAlchemy异步MySQL/PG双支持，启动前config/DB连接预检 | 无 | 无 | 完全没有 | OpenSoul无任何爬虫；与38轮Khoj自动化、40轮STORM语料采集汇合：**持续情报采集是研究引擎的上游刚需**。战略项 |
| 18 | **Tavily新闻检索封装**：basic/deep/24h/week/按日期区间/配图六种新闻搜索方法+完整响应封装dataclass | 无 | 无（仅通用web_search） | 完全没有 | 按时间窗+配图的新闻检索是舆情/情报场景专用，可作OpenSoul sense层检索插件，1天 |
| 19 | **引擎归属引用块**：IR的engineQuote block+ENGINE_AGENT_TITLES映射——最终报告中可标注"Insight Agent说…" | 无 | 无 | 完全没有 | 多agent产出合成单一报告时的**归因机制**，与39轮citation映射互补（那个归因网页源，这个归因agent），半天 |
| 20 | **依赖优雅降级**：torch/transformers导入包try/except置AVAILABLE标志，缺依赖时SentimentResult带analysis_performed=False继续流水线 | 无 | 无（import失败即崩） | 完全没有 | 可选重型依赖的标准处理模式，半天 |

## 源码亮点

1. **架构哲学：不做通用agent框架，做垂直流水线**。5引擎共享同一套nodes/state/llms骨架（大量代码同构复制——QueryEngine/MediaEngine结构几乎一致），这是"宁可重复不抽象"的取舍，换来了每引擎可独立替换prompts和工具。
2. **IR是全场最佳设计**（ir/schema.py + validate_ir.py 613行 + JSON解析763行）：LLM写长文档的失败面全被收敛到"IR校验失败→重试"一个口子，渲染层拿到的永远是合法结构。ALLOWED_BLOCK_TYPES白名单制，additionalProperties:True保持向前兼容。
3. **图表修复的工程克制**：三级升级（校验→本地修→LLM修），每级记录method='none/local/api'和changes列表，ReviewStats统计修复率——不是"LLM万能"而是"规则优先LLM兜底"。
4. **ForumEngine的旁观者模式**：引擎间零耦合，靠tail日志+正则提取+主持人定期聚合形成"圆桌感"。实现糙（文件锁+行位置记录）但思想新：多agent协作不必然需要消息总线。
5. **中文LLM工程细节**：RobustJSONParser的thinking前缀正则含"让我想想/首先/分析/根据"；输入适当性20词上限（40轮STORM同款）；情感五级分类贴合中文舆情惯例。

## 可复用设计（按性价比排序）

| 优先级 | 项目 | 工作量 | 受益模块 |
|--------|------|--------|----------|
| P0 | RobustJSONParser四级解析 | 1天 | OpenSoul eval安全化+所有LLM JSON输出 |
| P0 | with_graceful_retry重试装饰器 | 0.5天 | 全部外部API调用 |
| P0 | WordBudgetNode篇幅规划 | 0.5-1天 | 标书/方案文档生成 |
| P1 | IR契约+IRValidator+HTML渲染器 | 3-5天 | OpenSoul报告生成执行层（39/40轮研究引擎的输出端） |
| P1 | 图表校验+本地修复 | 1-2天 | 任何LLM生成图表场景 |
| P1 | 关键词优化中间件 | 1天 | 检索质量 |
| P1 | 引擎归因引用块(engineQuote) | 0.5天 | 多agent报告合成 |
| P2 | 本地中文情感模型接入 | 2-3天 | 客户反馈/舆情/群聊情绪 |
| P2 | 圆桌观察聚合层(日志监控+主持人) | 2-3天 | AI群组/多agent可观测性 |
| P2 | 持续情报采集(两段爬虫) | 1-2周 | 研究引擎上游、客户动态监控 |
| P3 | PDF布局优化器 | 3-5天 | 文档导出 |

## 跨轮印证
- 持久化缺口：MindSpider全部中间产物落DB（34/35/40轮后第四印证）
- 评估闭环：图表ReviewStats+修复率统计是轻量评估的又一形态（35/36/38/39/40轮后第五印证，但此轮为"产物质量评估"非"agent行为评估"——新维度）
- 可观测性：stream_handler阶段事件+ForumEngine日志聚合（27/52/39/40轮后第六印证）
- json_repair：39轮gpt-researcher三级兜底与本轮四级解析独立实现趋同——**该抄了**
