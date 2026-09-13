# Prompt Engineering Guide

## 概述

- **项目名称**：Prompt Engineering Guide（https://github.com/dair-ai/Prompt-Engineering-Guide）

## 核心架构

- - **形态**：MDX/Markdown 内容 + 在线文档站（promptingguide.ai）。
- - **内容骨架**（README Guides 实证）：
- 1. **Introduction**：LLM 设置、Prompt 基础、Prompt 元素、设计技巧、示例。
- 2. **Techniques**：Zero/Few-Shot、Chain-of-Thought、Self-Consistency、Generate Knowledge、Prompt Chaining、Tree of Thoughts、RAG、ART（自动推理与工具使用）、APE（自动 Prompt 工程）、Active-Prompt、DSP、PAL、ReAct、Multimodal CoT、Graph Prompting。
- 3. **Applications**：Function Calling、数据生成、RAG 合成数据、代码生成、职场案例。

## 关键技术

- 1. **最全的 Prompt 技术索引**：从 Zero-Shot 到 ToT/ReAct/ART，一篇入门到进阶。
- 2. **与 RAG/Function Calling 结合**：不止孤立讲 prompt，还落到 RAG 与工具调用（Agent 的两大支柱）。
- 3. **自动 Prompt 工程（APE/Active-Prompt）**：涉及"自动优化 prompt"的前沿方向。
- 4. **权威且长尾**：DAIR.AI 背书，持续更新到上下文工程/AI Agent 课程。

## 对openmate的启示

- - **P0｜把 ReAct/CoT/Prompt Chaining 落成系统提示模板库**：openmate 开发 Agent 时，应建立结构化 prompt 技术库（Few-shot、CoT、Self-Consistency），按任务类型选用，而非每次手写提示。
- - **P1｜用 Self-Consistency 提升关键决策稳定性**：openmate 在高 stakes 决策（如自动操作前的判断）可多次采样自洽投票，降低单次幻觉。
- - **P1｜Function Calling 设计参考**：Applications 篇的 function calling 指南可指导 openmate 工具 schema 的清晰描述（工具描述质量直接决定调用准确率）。

## 参考来源

- 豆包
