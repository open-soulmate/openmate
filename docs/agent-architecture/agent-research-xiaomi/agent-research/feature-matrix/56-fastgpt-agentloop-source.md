# FastGPT (#56) AgentLoop源码级补验

> 源码级：agentLoop目录（DDD四层：application/domain/interface/provider）11个核心文件全部读毕，本地留存 ~/agent-research-src/fastgpt-src/
> ⚠️ 网络记录：codeload全量tarball两次截断（6.9MB/15min，~8KB/s），**raw.githubusercontent.com单文件全速可用**——大仓库改用"API列目录+raw逐文件拉取"策略成功
> 与 56-fastgpt-design-docs.md（设计文档级）互为印证，以下为源码确认项+新增项

## 功能清单（源码验证）

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **runAgentLoopApplication统一入口+DDD分层**：业务层只选provider不import具体loop实现；错误兜底契约（catch返回带部分transcript的error result：completeMessages/activePlan/providerState原样带回） | 无 | cortex单体函数 | 完全没有 | "错误也带完整现场"的result契约——中断不丢上下文 |
| 2 | **Result四态判别联合**（done/paused/aborted/error）：TS never互斥字段类型级防错；paused必带pause对象，done永不带 | 无 | 无 | 完全没有 | FastGPT(#56)+FastGPT设计文档双确认；Python版用pydantic discriminated union实现 |
| 3 | **AgentLoopPause双态**：ask(用户表单)/tool_child(childrenResponse子流程交互)——**工具/子流程也能暂停，不只问用户** | 无 | 无 | 完全没有 | tool_child暂停=子工作流交互快照恢复，HITL互证新增第八方 |
| 4 | **PendingMainContext跨provider恢复契约**：暂停上下文用标准OpenAI消息格式存储（不依赖provider原生格式），恢复时provider自行转换+补回ask tool response；持久化三件套=messages+askToolCallId+activePlan | 无 | 无 | 完全没有 | **换模型也能恢复暂停会话**——多provider平台HITL的正确做法 |
| 5 | **Runtime能力注入面**：checkIsStopping()（每轮协作式取消）+maxRunAgentTimes+usagePush（统一账单收集：转发+本地收集双写，防provider漏报/业务层重复计费）+emitEvent+executeTool/executeInteractiveTool双轨 | 无 | 无 | 完全没有 | checkIsStopping~与Khoj cancellation_event互证；usagePush归一化normalizeAgentLoopUsages |
| 6 | **系统工具五件套类型化**：plan/ask/sandbox(SandboxClient注入)/readFile(maxFileAmount+独立executor)/datasetSearch(currentInputFiles)——每个enabled+executor解耦注入 | 无 | 无 | 完全没有 | 系统工具=平台内置能力，与用户工具catalog(runtimeTools+batchToolSize)分离——两层工具面 |
| 7 | **ToolExecutionResult八字段**：response/assistantMessages(工具内部产生需持久化的消息!)/usages/interactive/**stop(工具请求终止循环)**/skipResponseCompress/errorMessage/metadata(调用方解释agent-loop不解释) | 无 | 工具返回string | 完全没有 | "工具可以带消息/请求停止/跳过压缩"——工具返回值协议的完全体 |
| 8 | **事件模型12种**：llm_request_start/end(requestId/firstTokenTime/seconds)/reasoning_delta/answer_delta/tool_call/**tool_params(argsDelta流式工具参数)**/tool_run_start/end(**rawResponse与response分开**+toolResponseCompress)/after_message_compress(contextCheckpoint)/plan_status/plan_operation(set_plan/add_steps/update_steps带success成败)/ask_start/ask/ask_resume | 无 | trajectory扁平 | 完全没有 | argsDelta=前端逐字渲染工具参数；plan_operation成败都发事件=计划变更可观测 |
| 9 | **tool_run_end内嵌压缩元数据**：toolResponseCompress{response压缩后/modelName/usage/requestIds/seconds}——压缩用了哪个模型花多少钱作为事件发出 | 无 | 无 | 完全没有 | 压缩不再是黑盒 |
| 10 | **mainPrompt分层构建器**：默认Work Agent prompt+沙箱区块+平台extension+`<user_system_prompt>`标签包裹用户配置——**用户prompt永远在标签内不污染平台prompt** | 无 | 无 | 部分 | prompt分层注入范式 |
| 11 | **Input恢复四件套**：messages+providerState+userAnswer+childrenInteractiveParams | 无 | 无 | 完全没有 | 暂停恢复输入契约 |

## 补充：workflow运行时引擎（dispatch/index.ts 1749行，单类WorkflowQueue扫描级）
- **WorkflowQueue=整个工作流运行时**：runtimeNodes/runtimeEdges图副本上跑，nodeEdgeGroupsMap边分组+edgeBranchMap条件分支解析+nextStepActiveNodesMap/nextStepSkipNodesMap（**条件跳过节点不执行但下游按签名降级**——与Langflow bypass互证）
- 运行态携带：runtimeNodeResponseSummary（节点响应汇总）/chatNodeUsages（逐节点用量）/**nodeInteractiveResponse（工作流级HITL挂起）**/system_memories（工作流节点记忆）/**customFeedbackList（节点收集的用户反馈）**/toolRunResponse（工具模式返回）/workflowRunTimes防环
- usageSource+concatUsage+usageId：工作流级计量链——与agentLoop usagePush构成双层账单
- handleInteractiveResult()：交互结果回注继续跑——AgentScope AWAITING=parked模式的FastGPT版

## 源码亮点
- **类型即文档**：59行result.ts用判别联合把"什么状态带什么字段"钉死在编译期——paused必须有pause、done绝不能有error。OpenSoul Python版等价物=pydantic discriminated union + Literal['done','paused','aborted','error']
- **usagePush双写设计**（application/run.ts 62行）：入口处包装provider的usagePush——本地收集用于返回只读汇总，转发用于计费。注释明确"避免provider拼汇总遗漏工具/压缩用量，或业务层补汇总重复计费"——**账单正确性的架构保障**
- **agent-loop与workflow严格解耦**：interactive.ts注释"agentLoop位于LLM底层，不直接依赖workflow的交互schema"，childrenResponse用泛型透传——底座可独立复用
- domain/provider.ts+interface/+provider/三层：provider是可替换的循环实现（设计文档提到的Result判别联合契约就在这层）

## 可复用设计
1. **四态Result判别联合+错误兜底契约**——cortex重构骨架（Python: pydantic Tag）
2. **PendingMainContext**（标准消息格式存暂停上下文）——OpenSoul HITL设计前置必读
3. **工具返回值八字段协议**（尤其stop/skipResponseCompress/assistantMessages）
4. **usagePush双写**——token账单防漏防重
5. **12事件模型**（argsDelta/rawResponse分离/compress元数据）——event_stream升级参照，与AgentScope 30+事件类型互证
6. **`<user_system_prompt>`标签隔离**

## 已grep确认OpenSoul/OpenMate（本轮关键词）全部NONE
argsDelta/ask_resume/plan_operation/skipResponseCompress/checkIsStopping/maxRunAgentTimes/usagePush/tool_run_start/rawResponse/contextCheckpoint/user_system_prompt/firstTokenTime
