# 67. BettaFish（微舆）— 多Agent舆情分析系统架构分析

> **GitHub**: https://github.com/666ghj/BettaFish  
> **Stars**: 42,173 | **Forks**: 7,618 | **License**: GPL-2.0  
> **语言**: Python | **框架**: 从零实现，不依赖任何Agent框架  
> **定位**: 人人可用的多Agent舆情分析助手，打破信息茧房，还原舆情原貌

---

## 一、项目概览与设计理念

BettaFish（微舆）是一个从零实现的多智能体舆情分析系统，覆盖国内外30+主流社媒平台与数百万条大众评论。项目名称取自"斗鱼"（Betta Fish），寓意"小而强大，不畏挑战"。其核心设计理念是：**不依赖LangChain、CrewAI等任何现有Agent框架**，用纯Python模块化设计构建完整的多Agent协作系统。

系统接收用户的自然语言分析需求后，自动启动多个专业Agent并行工作，通过"论坛"协作机制进行链式思维碰撞与辩论，最终生成交互式HTML研究报告。整个流程从数据采集、多模态分析、情感建模到报告渲染，形成完整的端到端闭环。

---

## 二、多Agent角色设计（10个维度分析）

### 1. Agent角色划分与职责边界

BettaFish采用**五Agent+一引擎**的架构模式，每个Agent拥有独立的工具集、LLM配置和思维模式：

| Agent | 职责 | 推荐模型 | 核心能力 |
|-------|------|----------|----------|
| **Query Agent** | 精准信息搜索 | DeepSeek | 国内外网页搜索，广度覆盖新闻与社媒 |
| **Media Agent** | 多模态内容分析 | Gemini-2.5-Pro | 视频/图片解析，抖音快手短视频内容提取 |
| **Insight Agent** | 私有数据库挖掘 | Kimi-K2 | PostgreSQL/MySQL舆情数据库深度查询 |
| **Report Agent** | 智能报告生成 | Gemini-2.5-Pro | 多轮章节生成，IR中间表示，HTML渲染 |
| **ForumEngine** | Agent协作主持人 | Qwen3 | 辩论引导、错误纠正、观点整合 |

关键设计决策：**每个Agent可以使用不同的LLM提供商**，只需兼容OpenAI调用格式即可。这种"异构LLM"策略使得系统可以针对不同任务选择最优模型——搜索用DeepSeek的推理能力，多模态用Gemini的视觉能力，主持人用Qwen3的中文理解能力。

### 2. 论坛协作机制（ForumEngine）

ForumEngine是BettaFish最具创新性的设计。它不是简单的多Agent顺序执行，而是引入了一个**辩论主持人模型**：

- **monitor.py（859行）**：日志监控核心，实时监听三个Agent的`SummaryNode`输出，通过文件位置追踪（`file_positions`）实现增量读取，使用线程安全的写锁（`write_lock`）管理forum.log
- **llm_host.py（262行）**：论坛主持人，基于Qwen3模型，具备六大能力——事件梳理、引导讨论、纠正错误、整合观点、趋势预测、推进分析
- **触发机制**：当Agent发言缓冲区达到阈值（`host_speech_threshold`），自动触发主持人发言
- **通信方式**：通过forum.log文件实现Agent间异步通信，`forum_reader`工具供各Agent读取主持人引导

主持人prompt设计精妙，明确区分了三个Agent的角色定位：
- **INSIGHT Agent**：专注私有数据库的历史数据和模式对比
- **MEDIA Agent**：关注媒体报道、图片、视频等视觉信息传播效果
- **QUERY Agent**：负责广度搜索与实时信息捕获

### 3. 数据采集层（MindSpider）

MindSpider是系统的数据采集引擎，采用分层架构：

- **BroadTopicExtraction**：话题提取模块，自动从新闻源获取当日热点话题
- **DeepSentimentCrawling**：深度舆情爬取，基于MediaCrawler核心实现多平台爬虫
- **支持平台**：微博、小红书、抖音、快手、B站等10+国内外社媒
- **数据存储**：SQLAlchemy ORM映射，支持PostgreSQL和MySQL，表结构通过`mindspider_tables.sql`定义

### 4. 情感分析中间件（SentimentAnalysisModel）

系统集成了**5种情感分析模型**，形成多层次的情感计算能力：

- **WeiboMultilingualSentiment**：多语言情感分析，支持22种语言，5级分类（非常负面→非常正面），基于`tabularisai/multilingual-sentiment-analysis`模型
- **BertChinese-Lora**：BERT中文LoRA微调模型
- **GPT2-Lora**：GPT-2 LoRA微调模型
- **WeiboSentiment_SmallQwen**：小参数Qwen3微调
- **WeiboSentiment_MachineLearning**：传统ML方法（SVM等）

情感分析器采用**延迟初始化+全局单例**模式，支持CUDA/MPS/CPU自动设备选择，具备优雅降级能力——当依赖缺失时自动禁用而非崩溃。

### 5. 关键词优化中间件（KeywordOptimizer）

InsightAgent的关键词优化器是一个精巧的中间件层：

- **核心功能**：将Agent生成的学术化/官方化搜索词，优化为贴近网民真实语言的数据库查询关键词
- **设计原则**：贴近网民语言、避免专业术语、简洁具体、情感丰富
- **质量控制**：内置"不良关键词"过滤列表（如"舆情"、"传播"、"倾向"等），强制关键词不含空格
- **容错机制**：三级降级——API正常→JSON解析→正则提取→原始查询分词

### 6. 报告生成引擎（ReportEngine）

ReportEngine是最复杂的Agent，采用**多阶段pipeline**架构：

```
模板选择 → 文档布局 → 篇幅规划 → 章节生成 → IR装订 → HTML渲染
```

**IR中间表示（Intermediate Representation）** 是核心设计：
- 定义了16种Block类型：heading、paragraph、list、table、swotTable、pestTable、blockquote、engineQuote、hr、code、math、figure、callout、kpiGrid、widget、toc
- 11种内联标记：bold、italic、underline、strike、code、link、color、font、highlight、subscript、superscript
- JSON Schema严格校验，确保章节生成→渲染的一致性

**DocumentComposer装订器**负责：
- 按order排序章节，补充默认chapterId
- 防止anchor重复，生成全局唯一锚点
- 注入IR版本与生成时间戳
- 合并metadata/themeTokens/assets供渲染器消费

### 7. 配置管理架构

采用**Pydantic Settings**统一管理，支持.env文件和环境变量自动加载：

- 每个Agent独立配置API_KEY、BASE_URL、MODEL_NAME
- 搜索工具支持AnspireAPI和BochaAPI两种后端切换
- GraphRAG可选集成（默认关闭）
- 运行时可通过`reload_settings()`热更新配置
- Flask主应用提供Web界面配置管理，自动同步到.env文件

### 8. 进程编排与Web服务

`app.py`（1350行）是系统编排中心：

- **Flask + SocketIO**：Web界面实时展示分析进度
- **多进程管理**：每个Agent作为独立Streamlit子进程启动，通过`start_streamlit_app()`管理生命周期
- **健康检查**：自动检测子进程状态，支持优雅关机（`_start_async_shutdown`）
- **日志聚合**：统一日志格式`[HH:MM:SS] [SOURCE] content`，ForumEngine实时监听并解析
- **SSE流式事件**：ReportEngine通过Server-Sent Events实时推送生成进度

### 9. 容错与鲁棒性设计

系统在多个层面实现了容错：

- **LLM调用重试**：`retry_helper.py`提供`with_graceful_retry`装饰器，支持指数退避
- **报告生成容错**：章节生成支持`CHAPTER_JSON_MAX_ATTEMPTS`次重试，遇到内容稀疏时自动选择最佳候选
- **情感分析降级**：依赖缺失时自动禁用，不影响主流程
- **关键词优化降级**：API失败→JSON解析失败→正则提取→原始查询分词，四级降级
- **进程异常处理**：防御性捕获`BrokenPipeError`、`ConnectionResetError`等网络异常
- **内容审查检测**：识别"inappropriate content"等审查关键词，自动跳过

### 10. 扩展性与可定制性

- **LLM即插即用**：任何兼容OpenAI格式的提供商均可接入
- **自定义报告模板**：支持上传.md/.txt格式模板，ReportEngine动态选择
- **自定义业务数据库**：通过`CustomBusinessDBTool`模式接入私有数据源
- **单Agent独立运行**：`SingleEngineApp/`提供每个Agent的独立Streamlit应用
- **Docker部署**：`docker-compose.yml`支持一键容器化部署
- **模块化工具集**：每个Engine的tools/目录独立，可自由增删工具

---

## 三、架构亮点与创新总结

1. **零框架依赖**：从Agent定义、工具调用、状态管理到协作机制全部手写，避免了框架抽象层的性能损耗和黑盒问题
2. **论坛式协作**：突破了传统多Agent的顺序/并行模式，引入辩论主持人实现真正的思维碰撞
3. **异构LLM策略**：不同Agent使用不同模型提供商，按任务特性选择最优模型
4. **IR中间表示**：报告生成采用结构化IR，章节生成与渲染解耦，支持多格式输出
5. **多层次情感计算**：5种模型覆盖从传统ML到大模型微调的全谱系
6. **渐进式降级**：从API调用到关键词提取，每层都有优雅降级策略

---

## 四、局限性与改进方向

- **文件式通信**：Agent间通过forum.log文件通信，在高并发场景下可能成为瓶颈，可考虑消息队列
- **单机部署**：当前架构面向单机，大规模部署需要引入分布式调度
- **监控可观测性**：缺乏统一的metrics/tracing系统，生产环境运维成本较高
- **测试覆盖**：tests/目录存在但覆盖范围有限，核心Agent逻辑缺少单元测试

---

*分析基于 BettaFish main 分支源码，42K+ Stars，2024年7月创建，1039次提交。*
