# Open Deep Research (#90, 5k★, LangChain官方) 功能研究

研究时间：2026-09-16（cron自动轮次）
源码：codeload tarball → ~/agent-research-src/odr（6.4MB，tar校验OK，源码级；核心仅2356行）
定位：LangGraph实现的深度研究agent——supervisor+并行子研究员+每研究员压缩+最终报告。**"深度研究"参考实现里最小而完整的一个**，与Khoj/GPT-Researcher/STORM形成第四方。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **clarify_with_user前置澄清门**：研究开始前LLM判断是否需要向用户提问澄清范围——allow_clarification开关，不清楚→提问→__end__等用户 | deep_researcher.py:60-118 | 无 | intelligence/intent.py有意图识别 | 部分有 | "研究前先问清楚"的HITL节点，120行；与DeerFlow Clarification表单卡互证 |
| 2 | **write_research_brief结构化研究简报**：用户原始请求→LLM转写为结构化brief→supervisor按brief研究 | :118-178 | 无 | 无 | 完全没有 | "需求→简报"中间产物，用户可审——比直接开跑可控 |
| 3 | **supervisor循环+三工具**：think_tool（战略反思记录，继续循环）+ConductResearch（并行委派子研究员）+ResearchComplete（显式完成）；max_researcher_iterations硬上限+无工具调用即退出 | :178-330 | 无 | 无 | 完全没有 | **think_tool第二方确认**（swarms auto模式互证）；"完成靠显式工具而非模型说完了"与deepagents Rubric互证 |
| 4 | **并发研究单元限流+溢出礼貌拒绝**：max_concurrent_research_units（默认5）截断本轮超出的ConductResearch调用→返回"请少开几个"的错误tool message——**教模型自我限流** | :270-300 | 无 | 无 | 完全没有 | 比硬拒绝优雅：溢出请求变成模型可见的反馈 |
| 5 | **compress_research每研究员压缩**：每个子研究员研究完→独立compression_model把全部tool输出蒸馏成"compressed_research+raw_notes"→只把压缩结果回传supervisor | :511-607 | 无 | 无 | 完全没有 | **supervisor上下文永不爆炸的结构性原因**——每个子agent出口自带压缩器，与Goose large_response/DeepAgents外置互证（第四方：工具/子agent结果压缩） |
| 6 | **execute_tool_safely**：工具调用统一安全包装（异常不炸全局） | :427 | 无 | limb/executor | 部分有 | |
| 7 | **MCPConfig工具过滤**：MCP server配置带tools白名单+auth_required——不是全量暴露server工具 | configuration.py:25-38 | 无 | mcp/server全量暴露 | 完全没有 | 与GPT-Researcher MCPToolSelector（按query选3个）互证：**MCP工具需要过滤层** |
| 8 | **x_oap_ui_config元数据→配置即UI**：每个配置字段的metadata声明控件类型（slider/number/boolean+min/max/step+description）→LangGraph Studio自动生成配置面板 | configuration.py全文 | 无 | 无 | 完全没有 | **"schema即表单"**——OpenSoul配置页/OpenMate设置面板可抄此协议，配置代码即UI定义 |
| 9 | **多provider模型per-stage**：clarify/brief/supervisor/researcher/compression/summary各阶段独立model配置+max_structured_output_retries（默认3） | configuration.py | 无 | gland/router单模型链 | 完全没有 | 第N方确认"每阶段独立LLM"（STORM五槽位/TradingAgents快慢/AutoGPT） |
| 10 | **SearchAPI枚举四选一**：anthropic/openai/tavily/none——含"不用搜索"档 | configuration.py | 无 | 无 | 完全没有 | |
| 11 | **Deep Research Bench评测harness**：pydantic评分器族（OverallQuality/Relevance/Structure/Correctness/GroundednessClaim逐claim判定）+pairwise_evaluation对比评测+supervisor_parallel_evaluation多线程批量 | tests/evaluators.py等 | 无 | benchmark/evaluator 5维自评 | 完全没有 | **GroundednessClaim逐claim引用核查**——报告防幻觉的可执行标准，可抄进cortex/quality.py |
| 12 | **legacy双实现保留**：plan-and-execute（含HITL）+supervisor-researcher两版旧实现放src/legacy不删——架构演进的活教材 | src/legacy/ | 无 | 无 | — | |

## 源码亮点
1. **每研究员出口压缩**是全项目最聪明的一行架构：supervisor的上下文只增长"每子任务一段压缩摘要"，researcher内部再长也进不来。OpenSoul multi_agent.py（88行流水线）正是缺这个出口阀。
2. **2356行做出完整深度研究产品**——比GPT-Researcher（2万行）小一个量级但覆盖：澄清→简报→supervisor→并行研究→压缩→报告→评测。**功能密度标杆**。
3. **配置metadata协议**（x_oap_ui_config）：pydantic Field.metadata里写UI控件描述，前端读schema渲染表单——配置和UI永不失同步。

## 可复用设计
1. **P0：子agent出口压缩**——OpenSoul multi_agent/multi_agent_coord升级第一刀：每个协作agent的输出先过压缩器再进协调者。
2. **P0：think_tool**——把cortex/chain_of_thought的内联反思变成显式工具调用（可观察、可回放、可审计），两方独立验证。
3. **P1：clarify_with_user+research_brief**——intelligence/intent.py的research意图套上这两步即升级（PROGRESS早前预言"套DeepResearchSkill即升级"，本轮给出具体图纸）。
4. **P1：x_oap_ui_config配置即UI协议**——OpenMate设置页通用方案。
5. **P2：GroundednessClaim逐claim核查**进cortex/quality.py。

## grep确认
NONE：clarify_with_user / research_brief / think_tool / compress_research / supervisor / max_concurrent_research_units / groundedness(claim义)
部分：reflection=opensoul cortex/chain_of_thought.py内联自反思（max_reflections=2，非工具化）；subtask=ai_engine任务分解（无出口压缩）；intent.py已有research意图+web_search/web_extract/browser_exec工具（套本轮图纸即升级）

## 跨项目互证更新
- **"深度研究"产品线第四方**（Khoj/GPT-Researcher/STORM后）：迭代循环+并行子研究+压缩出口+HITL澄清+评测harness五件套共识再次加固，OpenSoul整条线仍为零但intelligence/intent.py挂载点已存在
- **反思工具化**：ODR think_tool + swarms think工具 = 两方
- **子agent/工具结果压缩出口**：Goose large_response + DeepAgents溢出外置 + ODR compress_research + GPT-Researcher ContextCompressor = **四方互证，升P0**
