# Generative Agents / Smallville（#69, 20k★）功能研究
研究时间：2026-09-16 夜间cron轮 | 源码：~/agent-research-src/gen-agents（1.2GB含前端，源码级深读）
⚠️ 仓库名：joonspk-research/generative_agents（下划线）；codeload下载>25分钟（1.2G前端资产拖慢）

斯坦福论文原型代码（25个agent的小镇模拟）。工程粗糙但记忆架构是全行业的引用源头——AgentVerse/Khoj/TradingAgents记忆设计均可溯源至此。

## 功能清单
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| 1. 记忆流三因子检索（retrieve.py 284行：**recency=0.99^i衰减序列 + importance=poignancy 1-10分 + relevance=cos_sim嵌入**，三者normalize到[0,1]后等权相加取top） | 无 | hippo decay仅时间衰减 | 完全没有 | 记忆检索的"祖师爷公式"，~40行核心；OpenSoul hippo应加poignancy打分+语义相关度 |
| 2. ConceptNode三类记忆（event/thought/chat统一节点：s/p/o三元组+poignancy+embedding+keywords+expiration） | 无 | hippo统一fact | 部分有 | **expiration保质期**字段+thought(反思产物)与event同构——反思可再被检索 |
| 3. 反思机制（reflect.py 271行：累计poignancy超阈值(150)触发→基于最近记忆生成5个high-level问题→选最显著3个→检索证据→生成insight+"because of [1,5,3]"引用证据节点id→新thought入记忆流） | 无 | cortex内联反思 | 完全没有 | **insight带证据节点id**=可溯源反思；AgentVerse已工程化移植（importance/immediacy版），直接参考87号报告 |
| 4. 计划模块（plan.py 1053行：日计划带起床时间→小时级分解→任务x分钟片段→遇事件可react重排→计划存档可回溯） | 无 | will/ DAG | 部分有 | 分层计划（日→时→分）+事件驱动重排；与OpenSoul will任务树互补 |
| 5. spatial_memory（位置图：类/对象/地点树，agent寻路） | 无 | 无 | 不适用 | 游戏场景专属，跳过 |
| 6. scratch.py身份暂存（637行：价值观/关系/当前动作/生活方式——structured persona状态） | 无 | mind/情绪人格 | 部分有 | persona字段表可对照mind/补齐 |
| 7. get_summarized_latest_events(retention)（按保留数截断最新事件做摘要） | 无 | 无 | 完全没有 | 上下文组装的最简版本 |
| 8. retrieve_relevant_thoughts(s,p,o)（按三元组分量检索相关反思） | 无 | 无 | 完全没有 | 反思的复用检索 |
| 9. 仿真步进+前端地图回放（storage/含完整仿真快照step-N，可重放） | 无 | 无 | 参考价值 | 快照回放思想与opencode/git快照同族 |
| 10. run_gpt_prompt_*提示词函数族（每种认知动作一个prompt函数，返回(out, fail_count)容错二元组） | 无 | gene/templates | 部分有 | **(结果,失败次数)返回约定**——调用方必须处理失败，可抄 |

## 源码亮点
- retrieve.py全部是纯函数（cos_sim手写、normalize_dict_floats、top_highest_x_values）——无框架依赖，**40行可整体移植进OpenSoul hippo/retrieve.py**
- 反思阈值=累计poignancy 150：**反思频率与经历的"情感强度"挂钩**而非固定周期——比cron反思聪明
- 每个persona的bootstrap_memory/目录（scratch.json含recency_decay=0.99等全部超参）——人格即数据

## 可复用设计
1. 三因子检索公式（recency+importance+relevance等权）→ OpenSoul hippo检索升级第一优先
2. poignancy 1-10打分prompt（IMPORTANCE_PROMPT全文在AgentVerse memory_manipulator/reflection.py可直接抄）→ hippo写入时打分
3. 反思证据引用（because of [node_id]）→ cortex反思产物标注来源记忆id，前端可展开
4. (out, fail_count)返回约定 → OpenSoul cortex提示词调用容错规范
