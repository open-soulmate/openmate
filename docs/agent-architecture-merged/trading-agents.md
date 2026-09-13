# Trading Agents

## 概述

TradingAgents 是由 Tauric Research（UCLA/MIT 团队）开源的**多智能体 LLM 金融交易研究框架**。其核心设计理念是**模拟真实交易公司的组织架构**——将复杂的投资决策分解为多个专业化角色，通过结构化协作而非单一模型来完成交易判断。，主要使用 Python（https://github.com/TauricResearch/TradingAgents）

## 核心架构

- TradingAgents 是由 Tauric Research（UCLA/MIT 团队）开源的**多智能体 LLM 金融交易研究框架**。其核心设计理念是**模拟真实交易公司的组织架构**——将复杂的投资决策分解为多个专业化角色，通过结构化协作而非单一模型来完成交易判断。
- 与 FinMem、FinAgent 等单智能体系统不同，TradingAgents 复制了对冲基金的组织图：基本面分析师、情绪分析师、新闻分析师、技术分析师、多空研究员、交易员、风控团队和投资组合经理，每个角色由独立的 LLM 驱动。框架明确声明为**研究用途**，不构成投资建议，交易表现受模型选择、温度参数、数据质量等多因素影响。
- - 多智能体协作的结构化工作流
- - 混合通信协议：结构化输出 + 自然语言辩论
- _BOOL_TRUE  = ("true", "1", "yes", "on")
- _BOOL_FALSE = ("false", "0", "no", "off")
- `_coerce()` 对非法 bool 直接 `ValueError`（如 `treu`），**fail-loud 而非静默回落**——避免 unattended run 被悄悄配错。
- tradingagents/default_config.py

## 关键技术

- - https://github.com/TauricResearch/TradingAgents
- - https://arxiv.org/abs/2412.20138
- - 相关: `reports/langgraph.md`、`reports/crewai.md`、`reports/camel-l1.md`

## 对openmate的启示

- 1. **角色分解模式**：将复杂任务分解为专业化角色，每个角色独立 LLM 驱动，可应用于 OpenMate 的任务规划系统
- 2. **混合通信协议**：结构化数据（schema）在模块间传递，自然语言在模块内讨论，避免上下文退化
- 3. **辩论决策机制**：多空对抗 + 三方风控辩论的辩证推理模式，可迁移到任何需要权衡决策的场景
- 1. **角色分工+辩论机制**：比单一 Agent 更能减少偏见、提升决策质量
- 2. **决策日志+反思注入**：把历史决策与结果作为下次运行的上下文

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
