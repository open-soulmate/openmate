# TradingAgents

## 一句话定位
多 Agent LLM 金融交易框架，镜像真实交易公司角色分工：分析师→研究员辩论→交易员→风控→组合经理。

## 核心架构（4点）
1. **分析师团队**：基本面/情绪/新闻/技术四类专职分析师
2. **研究员辩论**：Bull/Bear 研究员结构化辩论，平衡收益与风险
3. **交易员+风控+组合经理**：三层决策，组合经理最终批准/否决
4. **LangGraph 编排**：图状态机驱动，支持 checkpoint 恢复

## 稳定性亮点
- 决策日志持久化：每次运行追加到 memory，下次注入反思与历史教训
- Look-ahead 修复：数据访问合约确保无未来信息泄漏
- 多 Provider：OpenAI/Google/Anthropic/DeepSeek/Qwen/GLM/MiniMax/Ollama/Azure

## 对 openmate 借鉴
1. **角色分工+辩论机制**：比单一 Agent 更能减少偏见、提升决策质量
2. **决策日志+反思注入**：把历史决策与结果作为下次运行的上下文

## 链接
https://github.com/TauricResearch/TradingAgents
