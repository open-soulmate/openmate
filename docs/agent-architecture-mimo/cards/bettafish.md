# BettaFish（微舆）

## 一句话定位
从零实现的创新型多智能体舆情分析系统，覆盖 30+ 社媒、数百万评论，破除信息茧房。

## 核心架构（5点）
1. **四引擎并行**：Query Agent（新闻广度）+ Media Agent（多模态）+ Insight Agent（私有库挖掘）+ Report Agent（报告生成）
2. **ForumEngine 论坛协作**：LLM 主持人引导多 Agent 辩论，链式思维碰撞
3. **MindSpider 爬虫系统**：话题提取 + 深度舆情爬取，7x24 作业
4. **微调模型中间件**：BERT/GPT-2 LoRA/Qwen3 微调情感分析，非纯 LLM
5. **Document IR 报告**：模板选择→布局→篇幅→章节→渲染 HTML/PDF

## 稳定性亮点
- Flask/SSE 流式 + Docker Compose 多服务编排
- 章节级 JSON 校验器，IR Schema 契约
- 单引擎可独立 Streamlit 运行调试

## 对 openmate 借鉴
1. **论坛辩论机制**：主持人 Agent 引导多 Agent 讨论，避免同质化
2. **LLM + 微调小模型混合**：情感分析等任务用小模型，降本增准

## 链接
https://github.com/666ghj/BettaFish
