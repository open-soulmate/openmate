# FastGPT 工作流dispatch引擎 功能研究（源码级：index-d14e.ts 1749行全文精读）

> 补齐2026-09-16轮4欠账"FastGPT workflow dispatch引擎（index-d14e.ts 62KB已下载未读）"。
> 与 56-fastgpt-agentloop-source.md（agentLoop协议）+ 56-fastgpt-design-docs.md（设计文档级）三份合读构成FastGPT完整图景。
> OpenMate=xyflow画布12节点+graph-engine DAG校验（无执行运行时）；本文件=画布背后"执行运行时"的完整参照。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **回调式非递归队列**（WorkflowQueue）：activeRunQueue(Set)+processingActive标志+迭代while循环替代递归；注释即规格"采用回调避免深度递归/都会resolve不存在reject" | 无执行运行时 | 无 | 完全没有 | OpenMate graph-engine加executor时直接抄此模式；400行核心 |
| 2 | **DFS边分类+Tarjan SCC循环检测→边分组预计算**：buildNodeEdgeGroupsMap一次性算出每节点入边分组（回边vs非回边×branchHandle），运行期O(1)查表 | graph-engine仅拓扑排序(无环DAG) | 无 | 完全没有 | **循环支持=工作流引擎与DAG校验的分水岭**；classifyEdgesByDFS+findSCCs+isNodeInCycle可整体移植 |
| 3 | **节点三态判定getNodeRunStatus**：任意一组边"有active且无waiting"→run；全部组全skipped→skip；否则wait。组内AND、组间OR语义 | 无 | 无 | 完全没有 | 与#2配套，约40行；wait语义让并发join天然正确 |
| 4 | **skip传播队列**：分支节点未选中的下游→skipNodeQueue(node+skippedNodeIdList集合)，跳过节点继续向下游传播skip，且分支节点自身加入已跳过集合防递归回传越界 | 无 | 无 | 完全没有 | ifElse/classifyQuestion/userSelect三分支节点的跳过语义；skip只扣0.1额度 |
| 5 | **catchError错误路由**：节点级catchError开关→错误走`source_catch`专用handle，其余边skip；errorCaptured标记；**工具调用场景下错误响应从用户可见展示中过滤(filterToolCallNodeResponses按parentId级联隐藏)但保留进运行控制summary** | 无 | cortex无错误路由 | 完全没有 | "错误用于运行控制但不进用户可见详情"的双轨设计值得直接抄 |
| 6 | **交互暂停+快照恢复（memoryEdges）**：interactiveResult持久化memoryEdges(全边状态)+nodeOutputs(全节点输出)+skipNodeQueue+entryNodeIds+usageId→lastInteractive回放续跑；入口节点前的边强制置active保证续跑必达 | 无（画布纯展示） | 无 | 完全没有 | **换机器也能恢复**的快照协议；与FastGPT agentLoop Pause双态、AgentScope AWAITING=parked互证（HITL第十方） |
| 7 | **paymentPause余额暂停**：每节点运行前checkTeamAIPoints，余额不足→interactive类型paymentPause（多节点可同时触发，entryNodeIds可累积）→充值后从当前节点续跑 | 无 | 无 | 完全没有 | 计费即HITL；对OpenSoul多租户有直接参考价值 |
| 8 | **双版本停止控制**：v2=setInterval 100ms轮询Redis停止标志；v1=createClientAbortTracker监听HTTP req断连（apiVersion分流） | 无 | 无 | 完全没有 | 协作式取消Khoj cancellation_event的平台化版本 |
| 9 | **深度+次数双预算**：workflowDispatchDeep>20直接返回空结果(防御递归爆炸)；maxRunTimes逐节点扣减(run=1/skip=0.1)，耗尽即log error停 | 无 | 无 | 完全没有 | 子流程递归20层上限+skip只扣0.1的细节 |
| 10 | **nodeResponseSink统一写出口**：子节点只产出响应，请求级sink统一负责DB写入+V2实时发布+Share字段裁剪；parentId树+childResponseCount；**有内部明细时父响应不重复下发**(emit=false) | 无 | trajectory扁平事件表 | 完全没有 | 观测写路径与执行解耦——OpenSoul trajectory升级参照 |
| 11 | **Team级节点并发控制**：maxConcurrency=10，同一节点不可能同时运行多次(Set去重)；Promise.race等首个完成即续跑 | monitoring页有concurrency=5(仅监控采集) | 无 | 完全没有 | — |
| 12 | **OTel全链路**：workflow.run/child.run span(node_count/edge_count/depth/is_tool_call/app_version)+workflow.step span(running_time/error status)+observeWorkflowStep指标 | 仅metrics-client.tsx文案 | metrics_api.py 1处 | 完全没有 | 对齐gen_ai semconv别自创（openllmetry轮结论） |
| 13 | **runWithContext请求级上下文**：mcpClientMemory(每工作流一个MCP连接池)+fileContext+fileRegistrar随AsyncLocal上下文传递，结束finally统一close全部MCP连接 | 无 | mcp无连接池生命周期 | 完全没有 | MCP连接泄漏的结构性解法 |
| 14 | **system_memories工作流级记忆**：任何节点可写memories，跨节点累积随结果返回存储 | 无 | — | 完全没有 | 与camel WorkflowMemoryManager互证 |
| 15 | **customFeedbackList节点自定义反馈收集**：节点运行中收集用户反馈事件，随结果返回 | 无 | mind评分表(非节点级) | 完全没有 | 小件 |
| 16 | **孤儿边过滤时机的工程教训**：filterOrphanEdges必须等ToolSet展开为临时Tool节点后再执行，否则续跑时会删掉ToolCall→Tool的selectedTools边——**注释记录了resume正确性陷阱** | — | — | — | 体裁可抄：把"为什么顺序不能换"写进注释 |
| 17 | **reasoning-only也落历史**："用户可能在正文开始前停止工作流；reasoning-only也要落历史，避免刷新后丢失" | OpenMate聊天展示有thinking块 | — | 部分有 | 细节 |
| 18 | **entry节点重置白名单**：重置isEntry时userSelect/formInput/toolCall三类交互节点豁免（它们要靠isEntry续跑） | 无 | 无 | 完全没有 | — |

## 源码亮点

- **注释即规格**：WorkflowQueue类头注释四条特点+方案五步+特殊情况（"触发交互节点后需跳过所有skip节点，避免后续执行了skipNode"）——写引擎先写这段注释再写代码。
- **surrenderProcess()防御性让出进程**：异常路径不让事件循环饿死。
- **错误双路径统一**：callback返回result.error（不抛异常）与throw两条失败路径，都归一到nodeResponse.error，让runLoop/OTel span状态判断只看一处——注释明说这是约定。
- **paymentPause多入口累积**：普通interactive一次一个entryNode，paymentPause可多个节点同时触发，entryNodeIds concat——计费暂停是全局性的。
- **debug模式=生产模式的严格子集**：debugNextStepRunNodes手动步进、debugNodeResponses逐节点记录、getDebugResponse返回memoryNodes/memoryEdges——单步调试不需要另一套引擎。

## 可复用设计

1. **OpenMate画布→可执行工作流的最短路径**：本文件的WorkflowQueue+边分组+三态判定+skip传播是一个自洽的最小执行核（~600行TS），前端graph-engine已有DAG校验，补上Tarjan循环检测与本执行核即达FastGPT v1能力。
2. **memoryEdges快照协议**：OpenSoul will/无checkpoint——照此实现"边状态+节点输出+入口节点"三件套快照，任意工作流可中断续跑。
3. **错误双轨**（运行控制 vs 用户可见）：OpenMate工具卡片直抄filterToolCallNodeResponses级联隐藏逻辑。
4. 行业信号：FastGPT把"工作流引擎"做成了与agentLoop并列的第二执行核（workflow dispatch与agent loop共用Result四态/Pause协议）——**OpenSoul若做will/执行层，同一套暂停/恢复/预算协议应同时服务DAG工作流和agent循环，不要做两套**。

## 已grep确认OpenMate/OpenSoul（本轮关键词）全部NONE或巧合命中
paymentPause/handleInteractive/skipHandle/catchError(工作流义)/skipNodeQueue/memoryEdges/entryNodeIds/maxRunTimes/system_memories/customFeedback/usagePush/loop_detect/deduplicate_context/Tarjan/findSCCs/activeRunQueue/clientAbort/surrenderProcess
- 巧合命中：opensoul knowledge_requests.py的status=review(知识库审核，非工作流)；openmate monitoring页concurrency=5(监控采集并发，非工作流执行)。
