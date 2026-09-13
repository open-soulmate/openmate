# Tradingagents Cn

## 概述

- **项目名称**：TradingAgents-CN（GitHub: https://github.com/hsliuping/TradingAgents-CN ），主要使用 Python（https://github.com/hsliuping/TradingAgents-CN）

## 核心架构

- tradingagents/
- ├── agents/               # ★ 多 Agent 层
- │   ├── analysts/         # 分析师团队
- │   │   china_market_analyst.py / fundamentals_analyst.py(21KB)
- │   │   market_analyst.py(21KB) / news_analyst.py / social_media_analyst.py

## 关键技术

- 1. **辩论式多 Agent**：牛熊研究员辩论 + 风控三方辩论，用对抗性提升决策质量，而非单 Agent 自说自话。
- 2. **分层职责清晰**：分析师（数据）→研究员（辩论）→交易员（决策）→风控（审批），角色解耦。
- 3. **数据缓存工程化**：4 层缓存 + 多数据源冗余，兼顾数据新鲜度与 API 限额。
- 4. **中文/A股本地化**：china_market_analyst、akshare/tushare/tdx/新浪，针对 A股生态优化。

## 对openmate的启示

- - **P0｜工具调用计数器防死循环**：openmate 的多步 Agent 必须给每类工具/每轮设调用次数上限（`tool_call_count`），超限强制收敛。预期：杜绝"反复调同一工具卡死"。
- - **P0｜辩论/多视角评审作为内置反思**：openmate 可在关键决策前引入"正方/反方/裁判"或"激进/保守/中立"多视角辩论，judge 综合。预期：决策更稳健、少踩单边偏见。
- - **P1｜分层角色解耦**：采集/分析/决策/审批分角色，每角色产出结构化报告供下游。预期：可单独替换、可观测每步。

## 参考来源

- 豆包
