# AgentVerse（OpenBMB, #87, 5.5k★）功能研究
研究时间：2026-09-16 夜间cron轮 | 源码：~/agent-research-src/agentverse（34MB，源码级深读）

多agent平台=两条产品线：simulation（斯坦福generative-agents式社会模拟）+ tasksolving（角色分工解题）。环境步进架构+规则插件是核心设计。

## 功能清单
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| 1. 环境步进架构（environment.step()是唯一的agent交互场所，agents不直连——环境做消息路由/规则裁决/终止判定） | 无 | multi_agent.py流水线硬编码 | 完全没有 | "agent只能通过环境交互"=多agent系统的规则可插拔根因；OpenSoul流水线改造为env.step()循环后可加任意规则 |
| 2. 环境规则插件五件套（simulation: describer/order/selector/updater/visibility；tasksolving: decision_maker/evaluator/executor/role_assigner各一个rules目录可替换） | 无 | 无 | 完全没有 | 谁发言/谁能看见什么/怎么更新状态全部策略化——敏感信息隔离（visibility规则）直接对应政企权限需求 |
| 3. 记忆操纵器注册表（memory_manipulator：basic原样/plan按计划过滤/reflection=importance+immediacy双1-10评分+重要性阈值检索+周期性insight蒸馏"because of 1,5,3"溯源） | 无 | hippo有decay无评分 | 完全没有 | generative-agents论文记忆机制的工程化；insight带来源记忆编号=引用溯源雏形 |
| 4. 角色自动分配（RoleAssignerAgent读任务+agent池→LLM生成role_description分配） | 无 | 无 | 完全没有 | 比CrewAI手工定义角色高级：按任务动态生成角色 |
| 5. 六步解题管线（role_assigner→manager出plan→solver→executor→critic→evaluator，advice回注形成迭代） | 无 | cortex单体 | 完全没有 | 与TradingAgents辩论、MetaGPT流水线互证；evaluator反馈advice回manager重规划=闭环 |
| 6. 对话Agent带可见性（conversation.py每个agent只见visibility规则允许的消息） | 无 | 信箱全量广播 | 完全没有 | 多agent群聊信息隔离 |
| 7. get_spend/report_metrics成本核算（environment级汇总各agent花费） | 无 | gland/token_meter | 部分有 | env级成本视图 |
| 8. summary记忆（窗口满自动LLM摘要压缩update_buffer） | 无 | 无cortex压缩 | 完全没有 | 与compaction互证（基础款） |
| 9. 仿真专用环境：prisoner_dilemma（囚徒困境博弈）、pokemon（对战服务器222行）、sde_team（软件团队分工+给定测试） | 无 | 无 | 参考价值 | 博弈论环境验证agent策略行为；sde_team=团队分工的最小社会模拟 |
| 10. simulation+replay（pygame GUI可视化小镇，可回放） | 无 | 无 | 参考价值 | 演示价值大，产品价值低 |
| 11. registry.py全局注册表（agent/env/memory/parser四类组件字符串→类） | 无 | 无 | 完全没有 | YAML配置驱动组装agent系统 |

## 源码亮点
- **AgentVerse.from_task("task_name")**：一个目录=一个任务（yaml配置agents+environment）→自动组装——"任务即配置包"
- **AgentMessage.stream_state字段**：流式状态进消息协议本身
- tasksolving BasicEnvironment.step()约70行跑完六步管线+advice循环——参考实现极简

## 可复用设计
1. memory_manipulator/reflection.py（importance+immediacy双评分+insight蒸馏）→ OpenSoul hippo/记忆评分层（与TradingAgents延迟回填互证后合并设计）
2. rules目录架构 → OpenSoul multi_agent改造：发言顺序/可见性/裁决全部抽rules
3. RoleAssigner → OpenSoul ai_engine任务分解时自动给子agent生成角色描述
4. 六步管线+advice闭环 → multi_agent.py升级参照（比现在88行流水线多evaluator反馈环）
