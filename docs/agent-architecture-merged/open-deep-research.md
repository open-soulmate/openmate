# Open Deep Research

## 概述

Open Deep Research 是 LangChain 团队开源的**深度研究 Agent**，定位为"简单、可配置、完全开源"的自动化深度调研系统。它在 [Deep Research Bench Leaderboard](https://huggingface.co/spaces/Ayanami0730/DeepResearch-Leaderboard) 上取得了第 6 名的成绩（RACE Score 0.4344），与商业深度研究产品（如 Perplexity Pro、Gemini Deep Research）处于同一梯队。，主要使用 Python（https://github.com/langchain-ai/open_deep_research）

## 核心架构

- Open Deep Research 是 LangChain 团队开源的**深度研究 Agent**，定位为"简单、可配置、完全开源"的自动化深度调研系统。它在 [Deep Research Bench Leaderboard](https://huggingface.co/spaces/Ayanami0730/DeepResearch-Leaderboard) 上取得了第 6 名的成绩（RACE Score 0.4344），与商业深度研究产品（如 Perplexity Pro、Gemini Deep Research）处于同一梯队。
- 核心设计理念是**"苦涩教训"（Bitter Lesson）**——与其用复杂的工程技巧优化研究流程，不如让模型更强、搜索更广、并发更多。这一理念体现在架构的极简主义上：整个系统只有一个主图（graph），没有复杂的路由逻辑，核心研究能力完全依赖于 LLM 的推理能力和搜索工具的信息覆盖度。
- | 层级 | 技术选型 | 作用 |
- |------|----------|------|
- | 字段 | 默认 | UI 元数据 min/max |
- |------|------|-------------------|
- | max_structured_output_retries | **3** | 1–10 |
- | allow_clarification | **True** | boolean |

## 关键技术

- `think_tool` 是一个**空操作工具**，其核心价值不是执行任何操作，而是**强制 LLM 在工具调用之间插入显式推理**：
- @tool(description="Strategic reflection tool for research planning")
- def think_tool(reflection: str) -> str:
- return f"Reflection recorded: {reflection}"
- - https://github.com/langchain-ai/open_deep_research
- - https://huggingface.co/spaces/Ayanami0730/DeepResearch-Leaderboard
- - https://github.com/langchain-ai/deep_research_from_scratch
- - 相关: `reports/langgraph.md`、`reports/gpt-researcher.md`、`reports/storm.md`、`reports/mcp.md`

## 对openmate的启示

- 1. **三层嵌套图**的设计模式值得借鉴：主流程 → 任务调度 → 具体执行
- 2. **四模型分工**的经济模型可以复用：摘要用小模型、推理用强模型
- 3. **think_tool** 的反思机制是低成本高收益的质量提升手段
- 1. **研究类任务用「问题树 + 子报告」**，最后再综合
- 2. **工具结果带 provenance**：个人助手引用链接/文件路径，可点开验证

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
