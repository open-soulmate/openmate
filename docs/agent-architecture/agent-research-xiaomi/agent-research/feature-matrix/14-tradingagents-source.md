# TradingAgents (#14, 104k★) 功能研究

> 源码：~/agent-research-src/TradingAgents（Python + LangGraph）
> 研究日期：2026-09-17 深夜轮
> 定位：金融多agent辩论框架。领域特定但**记忆工程是全部100个agent里最精细的之一**

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | **决策日志+延迟结果回填**：store_decision先记pending→结果出来后update_with_outcome把raw_return/alpha写回同一条目 | agents/utils/memory.py TradingMemoryLog | 没有 | hippo无此模式 | 完全没有 | **P0**。"先记决策、后补结果"是让记忆带真实反馈信号的最便宜方案。OpenSoul所有agent决策（工具选择/意图判断）都可套 |
| 2 | **as_of时间旅行过滤**：检索记忆时只取resolved日期≤as_of的条目，防回测从未来学答案（#1251 issue驱动） | memory.py get_past_context | 没有 | 没有 | 完全没有 | P1。任何做回放/回测/轨迹复盘的系统必需 |
| 3 | **同域/跨域检索预算**：n_same=5同ticker全量格式+n_cross=3跨ticker只取反思部分（_format_full vs _format_reflection_only两档粒度） | memory.py | 没有 | hippo检索无分档 | 完全没有 | P0。同类任务取全量、异类任务只取教训——token效率设计 |
| 4 | **记忆轮转保pending**：超max_entries时淘汰最旧的已resolved条目，pending永不淘汰 | memory.py _apply_rotation | 没有 | 没有 | 完全没有 | P1 |
| 5 | **结构化辩论协议**：多分析师(技术/基本面/新闻/情绪/宏观)→bull/bear研究员对抗→研究经理裁决→trader执行→risk mgmt否决，conditional_logic控制回合 | agents/、graph/conditional_logic.py | 没有 | 没有 | 完全没有 | P1。OpenSoul will/dag_planner可承载"对抗-裁决"节点类型 |
| 6 | **LangGraph checkpointer按标的分库**：每个ticker一个SQLite checkpoint库，防并发写争用，支持分析run断点续跑 | graph/checkpointer.py | 没有 | 没有 | 完全没有 | P1。"按任务实体分库防锁争用"对OpenSoul多agent并发有直接参考 |
| 7 | **数据源validator层**：market_data_validator+date_window统一校验，各数据源(alpha_vantage/fred/polymarket/reddit/stocktwits)错误归一errors.py | dataflows/ | 没有 | 没有 | 完全没有 | P2。外部数据接入的防御性模式 |
| 8 | **快/慢双LLM**：quick_thinking_llm做反思/格式化，deep做分析——同一框架内按任务配模型 | graph/reflection.py | 没有 | 部分（多provider无任务分级） | 部分有 | P1。与省钱诉求直接相关 |
| 9 | **rating.py打分工具化**：把"评级"做成结构化工具而非prompt约定 | agents/utils/rating.py | 没有 | intelligence部分 | 部分有 | P2 |
| 10 | **CLI+Web双壳**：Rich CLI + FastAPI静态Web（cli/static），同一graph两个界面 | cli/ | 部分 | — | 部分有 | P3 |

## 源码亮点
- memory.py整个文件就是"带反馈回路的记忆"参考实现：pending/resolved两态、tag行标记`| pending`、解析回填、轮转、时间过滤——250行讲清了生产级记忆日志怎么写。
- reflection.py把"反思"拆成两阶段：决策时只记录，结果出来后再用一次廉价LLM调用补反思——省token且反思有据。
- 每ticker一个checkpoint SQLite：连断点续跑的并发问题都想到了。

## 可复用设计（Top-3）
1. **延迟回填决策记忆**（#1+#2+#3）：OpenSoul hippo加一张decision_log表(pending/resolved/as_of)，agent每次关键决策写入，结果回填后成为带真实结果的few-shot素材——这是"系统一直不进化"痛点的最直接解法之一。
2. **对抗-裁决节点**（#5）：will/dag_planner加debate节点类型。
3. **双LLM分级**（#8）：反思/标题类任务走便宜模型。
