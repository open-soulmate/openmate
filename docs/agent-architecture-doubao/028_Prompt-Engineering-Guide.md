# 028 · dair-ai/Prompt-Engineering-Guide 源码调研报告

> 调研日期：2026-09-13 ｜ 调研方式：README 全文精读 ｜ 注：本项目为**教程/资源合集，非 Agent 系统**

## 1. 项目概述与定位

- **项目名称**：Prompt Engineering Guide
- **GitHub**：https://github.com/dair-ai/Prompt-Engineering-Guide
- **Star 数**：约 78,263（rank 28）
- **主要语言**：MDX / Markdown（文档站 promptingguide.ai）
- **一句话定位**：DAIR.AI 维护的提示工程、上下文工程、RAG 与 AI Agent 的权威教程、论文、lecture、notebook 与工具资源合集。
- **目标用户/场景**：所有与 LLM 打交道的研究者与开发者——想系统掌握如何设计"稳健有效、能与 LLM 和工具交互"的提示。
- **成熟度**：极高。2023-02 即登 Hacker News #1，2024-01 突破 300 万学习者，支持 13 种语言，已衍生 DAIR.AI Academy 付费课程与企业培训/咨询服务。
- **重要定性**：**纯知识库/学习资源，无可执行 Agent 系统或编排运行时**；Agent 专属章节标注"不适用"，重点提炼提示工程/Agent 设计的参考价值。

## 2. 源码结构总览

- **形态**：MDX/Markdown 内容 + 在线文档站（promptingguide.ai）。
- **内容骨架**（README Guides 实证）：
  1. **Introduction**：LLM 设置、Prompt 基础、Prompt 元素、设计技巧、示例。
  2. **Techniques**：Zero/Few-Shot、Chain-of-Thought、Self-Consistency、Generate Knowledge、Prompt Chaining、Tree of Thoughts、RAG、ART（自动推理与工具使用）、APE（自动 Prompt 工程）、Active-Prompt、DSP、PAL、ReAct、Multimodal CoT、Graph Prompting。
  3. **Applications**：Function Calling、数据生成、RAG 合成数据、代码生成、职场案例。
- **代码规模**：文档/notebook 资源集，无生产工程代码。

## 3. 系统架构分析

- **编排模式**：**不适用**——无运行时。
- **对 Agent 架构的参考价值（关键）**：它把几乎所有 Agent 推理范式以教程形式讲透：**ReAct**（techniques/react）、**Tree of Thoughts**、**Prompt Chaining**、**ART（自动推理+工具使用）**、**Function Calling**、**RAG**。这些正是构建 Agent 编排层所需的"心智模型库"。

## 4. 功能拆解

- 系统讲解 Prompt 元素与设计技巧。
- 15+ 种 Prompt 技术逐一配示例/notebook。
- 应用篇覆盖 Function Calling、代码生成、RAG 数据合成。
- 配套 lecture（YouTube）、newsletter、Discord、13 语言翻译。

## 5. 技术亮点与优势

1. **最全的 Prompt 技术索引**：从 Zero-Shot 到 ToT/ReAct/ART，一篇入门到进阶。
2. **与 RAG/Function Calling 结合**：不止孤立讲 prompt，还落到 RAG 与工具调用（Agent 的两大支柱）。
3. **自动 Prompt 工程（APE/Active-Prompt）**：涉及"自动优化 prompt"的前沿方向。
4. **权威且长尾**：DAIR.AI 背书，持续更新到上下文工程/AI Agent 课程。

## 6. 稳定性机制

- **不适用**：文档项目无运行时错误处理。但其讲解的 Self-Consistency（多次采样自洽）、Prompt Chaining（分步降错）、Active-Prompt（主动选择不确定样本人工标注）本质上是**提升 LLM 输出稳定性的策略**，可供 Agent 层借鉴。

## 7. 高可用机制

- **不适用**：无并发/调度。

## 8. 自我进化机制

- **不适用（仓库本身）**。但其 **APE（Automatic Prompt Engineer）** 与 **Active-Prompt** 章节，讲解的正是"自动优化/迭代 prompt"的自反馈思想，对 openmate 的 prompt 层自迭代有参考。

## 9. openmate 可借鉴点

- **P0｜把 ReAct/CoT/Prompt Chaining 落成系统提示模板库**：openmate 开发 Agent 时，应建立结构化 prompt 技术库（Few-shot、CoT、Self-Consistency），按任务类型选用，而非每次手写提示。
- **P1｜用 Self-Consistency 提升关键决策稳定性**：openmate 在高 stakes 决策（如自动操作前的判断）可多次采样自洽投票，降低单次幻觉。
- **P1｜Function Calling 设计参考**：Applications 篇的 function calling 指南可指导 openmate 工具 schema 的清晰描述（工具描述质量直接决定调用准确率）。
- **P2｜APE/Active-Prompt 自迭代**：长期看，openmate 可引入"根据失败案例自动改进提示"的回路。

## 10. 源码验证标注

- **文档直接读取**：README（Guides 三大板块链接列表、技术清单、学习者规模、语言数、课程/服务）。
- **源码不可得**：未拉取 MDX 正文与 notebook 代码；技术细节判断基于 README 目录与业界共识。
