# ToolBench/ToolLLM（OpenBMB, #95, 3k★）功能研究
研究时间：2026-09-16 夜间cron轮 | 源码：~/agent-research-src/toolbench（16MB，源码级深读）

工具学习研究项目（16k+真实API、ToolLLM微调、DFSDT搜索、自动评估）。学术项目但三个机制可产品化。

## 功能清单
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| 1. **DFSDT深度优先树搜索**（DFS.py：beam_size并行分支+Revise回溯上一步+switch_api换工具族+单链baseline对照；Tree.py树结构管理） | 无 | cortex单链推理 | 完全没有 | agent工具调用走错路→回溯换API重试，而非一条道走到黑；单链vs树搜索的效果数据现成 |
| 2. 工具检索器（retrieval/train.py：embedding模型从16k API召回top-k相关工具再进prompt） | 无 | MCP全量暴露 | 完全没有 | 与GPT-Researcher MCPToolSelector/claude-code tool_search互证（第3方）——工具多时先检索再给模型 |
| 3. 自动评估双指标（tooleval：pass_rate + **preference/win_rate双跑对比**+leaderboard自动更新+Solvable Pass Rate只评可解题） | 无 | benchmark 5维 | 完全没有 | 两版agent跑同一数据集→GPT裁判判win rate=版本对比的最直接方法；SPR思想（剔除不可解样本）防指标失真 |
| 4. 数据集→答案格式转换管线（convert_to_answer_format：统一各模型输出为可评估格式） | 无 | 无 | 完全没有 | 评估基础设施：格式归一化层 |
| 5. RapidAPI环境封装（Downstream_tasks/rapidapi.py：真实API执行env+重试） | 无 | MCP | 部分有 | MCP已覆盖 |
| 6. ToolLLM微调数据+训练管线（train/：SFT数据构造，政企私域工具微调素材） | 无 | heredity/self_evolution | 参考价值 | 与camel evol_instruct互证：合成微调数据线 |
| 7. callbacks机制（推理过程回调：进度/中间树状态外发） | 无 | event_stream | 部分有 | 树搜索进度可视化 |
| 8. to_json(answer/process双开关)（整棵推理树可序列化导出，答案与过程分离） | 无 | trajectory | 部分有 | 过程数据=评估/调试资产 |

## 源码亮点
- **DFS_tree_search.start()约60行**：每层beam_size个节点并行LLM调用→filter→下一层——树搜索不神秘，参数化清晰（single_chain_max_step/tree_beam_size/max_query_count）
- Revise=回到父节点重新生成（带"上一步错了"的反馈注入）——比盲重试有效
- 评估器分evaluators/目录多实现（GPT裁判的prompt工程细节可直接抄）

## 可复用设计
1. DFSDT思想 → OpenSoul cortex工具调用失败时的"回溯换路"最小版：连续2次工具失败→回退到上上步重规划（不用完整树搜索）
2. 工具检索器 → OpenSoul mcp消费侧：工具>20个时embedding召回top-k（与前两轮互证合并为P0）
3. win_rate双跑评估 → OpenSoul benchmark升级：新旧版本对跑+LLM裁判——"有没有进化"的最硬指标
4. SPR可解集过滤 → benchmark数据集设计（剔除无解样本防虚高/虚低）
