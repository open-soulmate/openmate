# Tradingagents

## 概述

| 名称 | TauricResearch/TradingAgents |，主要使用 Python（https://github.com/TauricResearch/TradingAgents）

## 核心架构

- tradingagents/
- │   ├── trading_graph.py     # ★ TradingAgentsGraph 主编排类
- │   ├── setup.py             #   GraphSetup.setup_graph() 构建 StateGraph
- │   ├── conditional_logic.py #   ConditionalLogic：辩论/风控轮次的条件边

## 关键技术

- 1. **双 LLM 档位分离成本/质量**：deep vs quick 两套 client，复杂推理与快速任务分流，经济。
- 2. **辩论即校准**：牛熊研究员 + 风控三方两轮辩论，各有独立 `*_history` 与 `judge_decision`，把"多空博弈/风险厌恶"结构化进图。
- 3. **可复现的记忆回路**：决策不是一次性的——落盘后等真实收益结算，再反思并回注下次同 ticker 分析。
- 4. **防"未来函数"的点在时间过滤**：`_memory_as_of(trade_date)` 让回测只用到 trade_date 前已结算的教训（#1251），是金融 Agent 少见的严谨。
- 5. **图形状签名**：`_run_signature()` 把 analyst 选择/辩论轮数/资产类型编进 checkpoint thread_id，形状变了就从头来，不串状态。

## 对openmate的启示

- **P0｜"先记录决策、后结算结果、再反思回注"的闭环记忆**
- - 借鉴什么：`store_decision` → 真实结果出来后 `reflect_on_final_decision` → 注入下次同任务提示。
- - 怎么用：openmate 把每次 Agent 任务结果先存为 pending，事后（拿到用户反馈/真实结果）生成一段反思，再在相似任务启动时注入上下文。这是低成本"经验沉淀"，比 RAG 向量库更贴合"对错"维度。

## 参考来源

- 豆包
