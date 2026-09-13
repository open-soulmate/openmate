# 027 · datawhalechina/hello-agents 源码调研报告

> 调研日期：2026-09-13 ｜ 调研方式：README 全文精读 ｜ 注：本项目为**开源教程（学习材料），非可运行的 Agent 系统**

## 1. 项目概述与定位

- **项目名称**：Hello-Agents《从零开始构建智能体》
- **GitHub**：https://github.com/datawhalechina/hello-agents
- **Star 数**：约 78,645（rank 27）
- **主要语言**：中文 Markdown 教程（示例代码为 Python）
- **一句话定位**：Datawhale 社区出品的系统性智能体（Agent）学习教程，"从基础理论到实际应用，全面掌握智能体系统的设计与实现"。
- **目标用户/场景**：想从 LLM"使用者"蜕变为 Agent"构建者"的开发者；强调构建 AI Native Agent（而非 Dify/Coze/n8n 这类流程驱动的软件工程类 Agent）。
- **成熟度**：章节 1–16 全部 ✅，配在线阅读（github.io / datawhale.cc 国内加速）、社区博客、Extra-Chapter 扩展，活跃的中文开源课程。
- **重要定性**：**不是独立生产级 Agent 系统**，无编排运行时；本章按规范对 Agent 专属章节标注"不适用"，重点提炼其对 openmate 的架构教学参考价值。

## 2. 源码结构总览

- **内容结构**（README 内容导航实证）：`docs/chapter1…chapter16/*.md` 分章组织；每章含正文、可运行示例代码与实验。
- **章节体系**（五部分）：
  1. 基础（ch1–3）：智能体定义/类型/范式、发展史、LLM 基础。
  2. 构建 Agent（ch4–7）：**ReAct、Plan-and-Solve、Reflection 经典范式手把手实现**；低代码平台（Coze/Dify/n8n）；框架实践（AutoGen、AgentScope、LangGraph）；**从 0 构建自研框架 HelloAgents**。
  3. 高级（ch8–12）：记忆与检索/RAG、上下文工程、通信协议（MCP/A2A/ANP）、Agentic-RL（SFT→GRPO）、性能评估。
  4. 案例（ch13–15）：智能旅行助手（MCP+多智能体）、DeepResearch 复现、赛博小镇（Agent×游戏）。
  5. 毕业设计（ch16）：完整多智能体应用。
- **配套自研框架**：[HelloAgents](https://github.com/jjyaoao/helloagents)（基于 OpenAI 原生 API 从零构建）。
- **代码规模**：教学示例级，非生产工程。

## 3. 系统架构分析

- **编排模式**：**不适用（教程仓库本身）**。但教程内容系统覆盖 ReAct / Plan-and-Execute(Plan-and-Solve) / Reflection / Multi-Agent 等全部主流范式（ch4、ch13、ch16）。
- **对 Agent 架构的参考**：ch4 直接实现 ReAct/Plan-and-Solve/Reflection；ch8 记忆+RAG；ch9 上下文工程；ch10 通信协议；ch12 评估——这恰是一个生产级 Agent 产品所需能力的知识图谱。
- **关键认知**：教程明确区分两派——"软件工程类 Agent"（流程驱动、LLM 作后端）vs"AI Native Agent"（真正以 AI 驱动），并聚焦后者。

## 4. 功能拆解

- 16 章教程 + Extra-Chapter（面试题、上下文工程补充、Dify 教程、FAQ、Agent Skills vs MCP 对比、GUI Agent、环境配置）。
- 综合案例：旅行助手、DeepResearch、赛博小镇、毕业设计。
- 教学价值：从原理→框架→自研→高级主题→真实案例的完整学习路径。

## 5. 技术亮点与优势

1. **理论+实战并重**：不止讲框架用法，更教"从 0 写自己的 Agent 框架"（ch7 + HelloAgents）。
2. **覆盖最完整的高级主题**：上下文工程、MCP/A2A/ANP 协议、Agentic-RL（GRPO）、性能评估——这些是多数教程缺失的。
3. **AI Native 视角**：明确反对"把 LLM 当文本补全节点的流程胶水"，主张真正以模型为核心。
4. **中文开源、免费、社区驱动**：适合国内开发者快速上手。

## 6. 稳定性机制

- **不适用**：教程仓库无运行时，无错误处理/重试/状态持久化的生产实现。其 ch4 实现的 Reflection 范式（自我反思修正）可视为对"反思式稳定性"的教学演示。

## 7. 高可用机制

- **不适用**：无并发调度/横向扩展。教学中涉及 AutoGen/AgentScope/LangGraph 框架，间接覆盖多 Agent 编排。

## 8. 自我进化机制

- **不适用（仓库本身）**。但其 ch8 记忆与检索、ch9 上下文工程、ch11 Agentic-RL、ch12 性能评估，正是 Agent"记忆—学习—评估"自我进化链的理论体系。

## 9. openmate 可借鉴点

- **P0｜按"原理→自研→高级"分层构建**：openmate 不应直接套框架，而应像 ch7 一样先用 OpenAI 原生 API 把 Agent 主循环/工具分发写一遍，再决定引入 LangGraph/AutoGen——这与 learn-claude-code 的"harness 思维"一致。
- **P1｜补全上下文工程与评估章节**：openmate 规划 Soul/Mate 层时，应参考 ch9（上下文工程）与 ch12（评估指标/基准测试），把"长期运行的情境理解"和"可量化评估"纳入设计，而非只堆功能。
- **P1｜协议对齐 MCP/A2A**：ch10 的 MCP/A2A/ANP 协议解析提示 openmate 多端互联应优先走标准协议，而非私有 RPC。
- **P2｜Agentic-RL 路线图**：若 openmate 未来要做模型层进化，ch11 的 SFT→GRPO 全流程是现成学习路径。

## 10. 源码验证标注

- **文档直接读取**：README（项目定位、五部分 16 章内容导航表、Extra-Chapter、HelloAgents 自研框架链接）。
- **源码不可得**：未拉取 `docs/chapter*/*.md` 正文与示例代码逐行阅读；本章架构评价基于目录结构与章节目录推断其教学深度。
