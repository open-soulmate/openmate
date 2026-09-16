# Swarms (#88, 5k★) 功能研究

研究时间：2026-09-16（cron自动轮次）
源码：**注意分支陷阱**——main分支是2023年v0.6遗留BabyAGI代码（boss/worker+FAISS，252行swarms.py）；现代实现在**master分支**，codeload tarball → ~/agent-research-src/swarms3（59MB，tar校验OK，源码级）。structs/ 64个文件=64种多agent拓扑。
定位：企业级多agent编排库——**"拓扑超市"**：把多agent协作模式做成64个可插拔结构体，SwarmRouter单入口路由选型。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **AgentRearrange字符串DSL**：`flow="researcher -> writer, editor"`一行声明非线性拓扑（一对多/并行/串行任意组合），einsum式语法 | structs/agent_rearrange.py | xyflow画布=图形化定义 | will/dag_planner=代码DAG | 部分有 | OpenMate画布已有图形版；**字符串DSL可作为画布的序列化格式/快速入口**（"文字描述→图"的中间层） |
| 2 | **SwarmRouter单入口**：一个router按SwarmType枚举切换20+种拓扑（sequential/concurrent/moa/majority_voting/groupchat/hierarchical...），调用方只认router | structs/swarm_router.py | 无 | 无 | 完全没有 | "同一任务不同编排策略"的抽象层 |
| 3 | **64种编排结构体**：MixtureOfAgents（并行专家+聚合器）、MajorityVoting、CouncilAsJudge、DebateWithJudge、LLMCouncil、AuctionSwarm（拍卖竞标分配任务）、TreeSwarm、SpreadSheetSwarm、GroupChat、RoundRobin、PlannerWorkerSwarm、HybridHierarchicalPeerSwarm… | structs/（64文件） | 12节点画布 | multi_agent.py=88行三角色 | 完全没有 | **AuctionSwarm/DebateWithJudge/CouncilAsJudge是"群体决策"族**——OpenSoul benchmark自评升级为多agent辩论裁决的现成图纸 |
| 4 | **MCPDeployer**：任意agent/swarm/函数一键发布为MCP server（HTTP/SSE/stdio），**自带auth层**（api_key/bearer/TokenVerifier）——多agent变成多个MCP tools | structs/mcp_deployer.py | 无 | mcp/server.py可生产MCP | 部分有 | OpenSoul能发布MCP工具但无auth层+无"swarm=工具"打包 |
| 5 | **AutoSwarmBuilder**：LLM自动设计swarm——生成agents配置（JSON schema校验）+选SwarmType→实例化router执行 | structs/auto_swarm_builder.py + auto_agent_builder.py | 无 | 无 | 完全没有 | 与"NL→工作流生成器"（Flowise）互证：自然语言直接生成编排 |
| 6 | **上下文压缩90%阈值**：context_length触发ContextCompressor自动摘要重写MEMORY.md——"长会话永不撞墙" | agent.py + conversation.py | 无 | sessions_api只有compacted标志位 | 部分有 | 阈值触发+落盘重写语义可抄 |
| 7 | **persistent_memory=MEMORY.md显式opt-in**：默认无状态；开启后启动读/每轮写workspace/agents/<name>/MEMORY.md | structs/agent.py | 无 | hippo记忆系统 | 部分有 | OpenSoul记忆更全；swarms的"默认关、显式开"的信任设计值得学 |
| 8 | **max_loops="auto"自主循环**：plan→execute→reflect直到自判完成，自动获得think工具+grep工具 | structs/agent.py | 无 | cortex有reflect | 部分有 | think工具=ODR think_tool互证（第二方：反思做成工具） |
| 9 | **SpreadSheetSwarm**：多agent输出直接落CSV表格（每agent一行时间戳记录）——批量agent任务的"报表化"输出 | structs/spreadsheet_swarm.py | 无 | 无 | 完全没有 | 政企场景"多agent跑批出报表"直接可用 |
| 10 | **动态skill加载**：dynamic_skills_loader.py运行时加载技能 | structs/dynamic_skills_loader.py | 无 | gene/skill_learner | 部分有 | |
| 11 | **cron_job结构体**：swarm原生定时任务 | structs/cron_job.py | OpenMate cron页 | 无 | 部分有 | OpenMate已有cron，但agent内部自调度没有 |
| 12 | **批量执行族**：batch_agent_execution/batched_grid_workflow/image_batch_processor——同任务多agent网格批量+图片批处理 | structs/ | 无 | 无 | 完全没有 | |
| 13 | **SocialAlgorithms**：群体算法（flocking类）引入agent编排 | structs/social_algorithms.py | 无 | 无 | 完全没有 | 学术新方向，P2 |
| 14 | **OTel遥测装饰器**：capture_init/trace_run装饰每个struct——构造与运行自动入trace | telemetry/otel.py | 无 | trajectory扁平事件 | 完全没有 | 第N方确认OTel是agent观测事实标准 |

## 源码亮点
1. **分支考古教训**：main分支停在2023年v0.6（BabyAGI式），活跃开发在master——**tarball下载必须试多分支**，本轮main拉到的是"坟头"代码。调研方法论写进METHODOLOGY。
2. **"拓扑=数据结构"建模**：64个结构体共享同一个Agent原语+SerializableMixin序列化——编排模式是可枚举、可路由、可序列化的一等公民。
3. **MCPDeployer的auth层**：发布MCP服务时api_key/bearer/TokenVerifier三选一——OpenSoul mcp/server发布侧零认证是安全缺口。

## 可复用设计
1. **P0：MCP发布auth层**——OpenSoul mcp/server.py加API key门（几十行），政企内网必须。
2. **P1：辩论/裁决族**（DebateWithJudge/CouncilAsJudge/MajorityVoting）——OpenSoul benchmark/evaluator从"5维自评"升级为"多agent裁判"的最短路径。
3. **P1：字符串拓扑DSL**——OpenMate画布加"文本模式"快速定义。
4. **P2：AutoSwarmBuilder**——"说需求→自动组agent团队"。

## grep确认
NONE：majority_voting / swarm_router / mixture / auction / debate / council / mcp_deployer / spreadsheet(结构义) / social_algorithm / grid_workflow
部分：concurrent=opensoul limb/executor等并发执行（非编排结构体）；cron=OpenMate有cron产品页（无agent内调度）；compression=compacted标志位（无90%阈值自动压缩）

## 跨项目互证更新
- **反思做成工具**：ODR think_tool + swarms max_loops=auto的think工具——两方独立实现，OpenSoul cortex/chain_of_thought是内联反思（max_reflections=2），可升级为可观察的think工具调用
- **MCP发布侧**：OpenSoul已能产MCP工具，缺auth门（swarms MCPDeployer）+缺session隔离（Composio）
