# BettaFish

## 概述

BettaFish 是一个Agent开发框架。

**仓库**: https://github.com/666ghj/BettaFish | **语言**: Python

## 核心架构

> **GitHub**: https://github.com/666ghj/BettaFish  
> **Stars**: 42,173 | **Forks**: 7,618 | **License**: GPL-2.0  
> **语言**: Python | **框架**: 从零实现，不依赖任何Agent框架  
> **定位**: 人人可用的多Agent舆情分析助手，打破信息茧房，还原舆情原貌

BettaFish（微舆）是一个从零实现的多智能体舆情分析系统，覆盖国内外30+主流社媒平台与数百万条大众评论。项目名称取自"斗鱼"（Betta Fish），寓意"小而强大，不畏挑战"。其核心设计理念是：**不依赖LangChain、CrewAI等任何现有Agent框架**，用纯Python模块化设计构建完整的多Agent协作系统。

系统接收用户的自然语言分析需求后，自动启动多个专业Agent并行工作，通过"论坛"协作机制进行链式思维碰撞与辩论，最终生成交互式HTML研究报告。整个流程从数据采集、多模态分析、情感建模到报告渲染，形成完整的端到端闭环。

系统集成了**5种情感分析模型**，形成多层次的情感计算能力：

- **WeiboMultilingualSentiment**：多语言情感分析，支持22种语言，5级分类（非常负面→非常正面），基于`tabularisai/multilingual-sentiment-analysis`模型
- **BertChinese-Lora**：BERT中文LoRA微调模型
- **GPT2-Lora**：GPT-2 LoRA微调模型
- **WeiboSentiment_SmallQwen**：小参数Qwen3微调
- **WeiboSentiment_MachineLearning**：传统ML方法（SVM等）

情感分析器采用**延迟初始化+全局单例**模式，支持CUDA/MPS/CPU自动设备选择，具备优雅降级能力——当依赖缺失时自动禁用而非崩溃。

采用**Pydantic Settings**统一管理，支持.env文件和环境变量自动加载：

- 每个Agent独立配置API_KEY、BASE_URL、MODEL_NAME
- 搜索工具支持AnspireAPI和BochaAPI两种后端切换
- GraphRAG可选集成（默认关闭）
- 运行时可通过`reload_settings()`热更新配置
- Flask主应用提供Web界面配置管理，自动同步到.env文件

`app.py`（1350行）是系统编排中心：

- **Flask + SocketIO**：Web界面实时展示分析进度
- **多进程管理**：每个Agent作为独立Streamlit子进程启动，通过`start_streamlit_app()`管理生命周期
- **健康检查**：自动检测子进程状态，支持优雅关机（`_start_async_shutdown`）
- **日志聚合**：统一日志格式`[HH:MM:SS] [SOURCE] content`，ForumEngine实时监听并解析
- **SSE流式事件**：ReportEngine通过Server-Sent Events实时推送生成进度

系统在多个层面实现了容错：

- **LLM调用重试**：`retry_helper.py`提供`with_graceful_retry`装饰器，支持指数退避
- **报告生成容错**：章节生成支持`CHAPTER_JSON_MAX_ATTEMPTS`次重试，遇到内容稀疏时自动选择最佳候选
- **情感分析降级**：依赖缺失时自动禁用，不影响主流程
- **关键词优化降级**：API失败→JSON解析失败→正则提取→原始查询分词，四级降级
- **进程异常处理**：防御性捕获`BrokenPipeError`、`ConnectionResetError`等网络异常
- **内容审查检测**：识别"inappropriate content"等审查关键词，自动跳过

1. **零框架依赖**：从Agent定义、工具调用、状态管理到协作机制全部手写，避免了框架抽象层的性能损耗和黑盒问题
2. **论坛式协作**：突破了传统多Agent的顺序/并行模式，引入辩论主持人实现真正的思维碰撞
3. **异构LLM策略**：不同Agent使用不同模型提供商，按任务特性选择最优模型
4. **IR中间表示**：报告生成采用结构化IR，章节生成与渲染解耦，支持多格式输出
5. **多层次情感计算**：5种模型覆盖从传统ML到大模型微调的全谱系
6. **渐进式降级**：从API调用到关键词提取，每层都有优雅降级策略

--

## 关键技术

ForumEngine是BettaFish最具创新性的设计。它不是简单的多Agent顺序执行，而是引入了一个**辩论主持人模型**：

- **monitor.py（859行）**：日志监控核心，实时监听三个Agent的`SummaryNode`输出，通过文件位置追踪（`file_positions`）实现增量读取，使用线程安全的写锁（`write_lock`）管理forum.log
- **llm_host.py（262行）**：论坛主持人，基于Qwen3模型，具备六大能力——事件梳理、引导讨论、纠正错误、整合观点、趋势预测、推进分析
- **触发机制**：当Agent发言缓冲区达到阈值（`host_speech_threshold`），自动触发主持人发言
- **通信方式**：通过forum.log文件实现Agent间异步通信，`forum_reader`工具供各Agent读取主持人引导

主持人prompt设计精妙，明确区分了三个Agent的角色定位：
- **INSIGHT Agent**：专注私有数据库的历史数据和模式对比
- **MEDIA Agent**：关注媒体报道、图片、视频等视觉信息传播效果
- **QUERY Agent**：负责广度搜索与实时信息捕获

系统集成了**5种情感分析模型**，形成多层次的情感计算能力：

- **WeiboMultilingualSentiment**：多语言情感分析，支持22种语言，5级分类（非常负面→非常正面），基于`tabularisai/multilingual-sentiment-analysis`模型
- **BertChinese-Lora**：BERT中文LoRA微调模型
- **GPT2-Lora**：GPT-2 LoRA微调模型
- **WeiboSentiment_SmallQwen**：小参数Qwen3微调
- **WeiboSentiment_MachineLearning**：传统ML方法（SVM等）

情感分析器采用**延迟初始化+全局单例**模式，支持CUDA/MPS/CPU自动设备选择，具备优雅降级能力——当依赖缺失时自动禁用而非崩溃。

InsightAgent的关键词优化器是一个精巧的中间件层：

- **核心功能**：将Agent生成的学术化/官方化搜索词，优化为贴近网民真实语言的数据库查询关键词
- **设计原则**：贴近网民语言、避免专业术语、简洁具体、情感丰富
- **质量控制**：内置"不良关键词"过滤列表（如"舆情"、"传播"、"倾向"等），强制关键词不含空格
- **容错机制**：三级降级——API正常→JSON解析→正则提取→原始查询分词

采用**Pydantic Settings**统一管理，支持.env文件和环境变量自动加载：

- 每个Agent独立配置API_KEY、BASE_URL、MODEL_NAME
- 搜索工具支持AnspireAPI和BochaAPI两种后端切换
- GraphRAG可选集成（默认关闭）
- 运行时可通过`reload_settings()`热更新配置
- Flask主应用提供Web界面配置管理，自动同步到.env文件

系统在多个层面实现了容错：

- **LLM调用重试**：`retry_helper.py`提供`with_graceful_retry`装饰器，支持指数退避
- **报告生成容错**：章节生成支持`CHAPTER_JSON_MAX_ATTEMPTS`次重试，遇到内容稀疏时自动选择最佳候选
- **情感分析降级**：依赖缺失时自动禁用，不影响主流程
- **关键词优化降级**：API失败→JSON解析失败→正则提取→原始查询分词，四级降级
- **进程异常处理**：防御性捕获`BrokenPipeError`、`ConnectionResetError`等网络异常
- **内容审查检测**：识别"inappropriate content"等审查关键词，自动跳过

1. **零框架依赖**：从Agent定义、工具调用、状态管理到协作机制全部手写，避免了框架抽象层的性能损耗和黑盒问题
2. **论坛式协作**：突破了传统多Agent的顺序/并行模式，引入辩论主持人实现真正的思维碰撞
3. **异构LLM策略**：不同Agent使用不同模型提供商，按任务特性选择最优模型
4. **IR中间表示**：报告生成采用结构化IR，章节生成与渲染解耦，支持多格式输出
5. **多层次情感计算**：5种模型覆盖从传统ML到大模型微调的全谱系
6. **渐进式降级**：从API调用到关键词提取，每层都有优雅降级策略

---

## 对openmate的启示

> 仓库: https://github.com/666ghj/BettaFish  
> 抓取通道: cdn.jsdelivr.net/gh/666ghj/BettaFish@main/README.md  
> 版本快照: main @ 2026-09-13（version badge **v1.2.1**）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多 Agent 论坛协作 / IR 报告管线 / 爬虫+分析分离 借鉴

---

| 需求 | BettaFish 机制 | 可复用度 |
|------|---------------|----------|
| 多 Agent 并行启动 | Query/Media/Insight 同时 | **高** |
| 论坛协作+主持人 | ForumEngine + llm_host | **高** |
| forum_reader 工具 | Agent 读论坛 | **高** |
| 反思轮次 | max_reflections=2 | **高** |
| IR 中间表示 | schema+validator+stitcher | **高** |
| 报告节点链 | 模板→布局→篇幅→章节→渲染 | **高** |
| 分块质量检测 | chapter 级 validator | **高** |
| 爬虫与分析分离 | MindSpider 独立 | **高** |
| 分 Agent LLM 配置 | 各自 KEY/BASE_URL/MODEL | **高** |
| 中间件（非纯 LLM） | Qwen 关键词优化、情感模型 | **高** |
| SQLAlchemy 只读封装 | utils/db.py | 高 |
| retry_helper | 网络重试 | 高 |
| 单 Agent Streamlit 独立调试 | SingleEngineApp 

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（67-bettafish.md）
- MiMo报告（bettafish-l1.md）
- MiMo卡片（bettafish.md）
