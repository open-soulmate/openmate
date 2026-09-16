# Flowise（FlowiseAI/Flowise, #37, 55k★）功能研究 — 源码级深读

> 源码：~/agent-research-src/flowise（packages/server + components + ui + observe + agentflow）
> 定位：可视化Agent/工作流构建平台（Build-Run-Observe三件套）
> 对位：OpenMate workflow-store.ts已有xyflow画布（12节点+DAG校验/拓扑排序）——Flowise是其"完全体"

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **AgentFlow v2运行时15种节点**：Start/Agent/LLM/Tool/Condition/**ConditionAgent(意图分类选支)**/**Iteration(子图N次)**/**Loop(带退出条件循环)**/**HumanInput(HITL暂停)**/HTTP/**CustomFunction**/ExecuteFlow(子流程调用)/DirectReply/Retriever/StickyNote | 画布12种节点（start/llm/tool/condition/loop/code/knowledge/http/notify/organ/script/end），仅前端 | will/DAG骨架无执行运行时 | 部分有 | OpenSoul will/需补：Iteration子图、HumanInput暂停恢复、ExecuteFlow子流程、ConditionAgent |
| 2 | **执行队列三件套**：PredictionQueue/UpsertQueue/ScheduleQueue + QueueManager + RedisEventPublisher/Subscriber（多实例事件广播） | 无 | 无后台队列（Langfuse轮已确认） | 完全没有 | 与Langfuse BullMQ互证。OpenSoul无任何后台队列是评估/调度/摄入的共同地基 |
| 3 | **Evaluation评估套件**：Dataset/DatasetRow(输入+期望输出)→Evaluation(绑定chatflow+dataset)→EvaluationRun(逐行actual/metrics/llmEvaluators)；简单评估器+**LLMEvaluationRunner(LLM裁判)**+CostCalculator成本归一+结果版本化(version/latestEval)+runAgain重跑 | 无 | benchmark/evaluator=5维自评非裁判 | 完全没有 | 与Langfuse/n8n/LobeChat四方互证的"没有进化"度量解法。实体表结构直接抄 |
| 4 | **@flowiseai/observe可嵌入观测SDK**：执行列表(状态/日期过滤)→执行详情(split-pane节点树+step查看器)→**每节点token/成本/耗时内联指标**→INPROGRESS自动轮询→**HITL Approve/Reject按钮**→批量删除→暗色主题注入 | 无（trajectory页面是自有实现） | 无 | 完全没有 | "不知道在干嘛"的UI标准答案：节点树+步骤详情+自动轮询。OpenMate trajectory页可参照升级 |
| 5 | **NL→工作流生成器**（agentflowv2-generator）：用户自然语言→LLM以marketplace模板为few-shot→输出nodes+edges JSON；prompt内置节点选型纪律（必须start节点/至少2节点/iteration子节点parentNode约束） | 无 | 无 | 完全没有 | "帮我建个每天抓新闻的流程"→直接生成画布。低成本高感知 |
| 6 | **MCP双向**：mcp-server（把自己的flow暴露为MCP server）+ mcp-endpoint + **custom-mcp-servers（消费外部MCP）** | 无 | mcp/server.py已有MCP生产+消费 | 部分有 | 差在Flowise把"一个flow=MCP工具"产品化（给Claude等外部agent调用） |
| 7 | **Document Store文档存储**：RAG摄取管线可视化管理（loader→splitter→embedding分步执行+upsert历史） | knowledge页面 | 无完整RAG管线运行时 | 部分有 | OpenMate有knowledge UI，缺分步管线执行与upsert-history |
| 8 | **OpenTelemetry+Prometheus双导出**（metrics/OpenTelemetry.ts + Prometheus.ts） | 无 | api/metrics_api.py命中1处 | 部分有 | 标准化埋点，政企运维接入现成监控体系 |
| 9 | **执行持久化+executions服务**：每次flow运行落库（状态/输入输出/节点级明细），UI可回看历史执行 | 无 | trajectory扁平事件表雏形 | 部分有 | trajectory升级为"执行记录"产品形态的参照 |
| 10 | **凭证加密+多workspace企业版**：Credential实体加密存储、ApiKey、workspace隔离查询(getWorkspaceSearchOptions贯穿所有service) | 无 | casbin RBAC用户级 | 部分有 | 工具凭证与workspace隔离需补 |
| 11 | **Marketplace模板市场**：flow模板+节点市场，模板同时是NL生成器的few-shot来源 | 无 | api/marketplace.py有skill sources同步 | 部分有 | "模板既是产品又是生成器训练数据"的飞轮设计 |
| 12 | **webhook + webhook-listener + leads捕获**：flow可被webhook触发；嵌入聊天窗捕获销售线索 | 无 | 无 | 完全没有 | 政企售前场景（用户本职）有直接价值 |
| 13 | **变量系统+flow-configs**：运行时变量注入+flow级配置覆盖 | 无 | config有但非运行时变量 | 部分有 | 小件 |
| 14 | **schedule调度**（Interface.Schedule + ScheduleQueue）：flow定时触发 | cron页面（Hermes侧） | will/proactive雏形 | 部分有 | 与DeerFlow调度队列互证，需持久化状态机 |
| 15 | **实时语音**（openai-realtime控制器）+ text-to-speech | 无 | 无 | 完全没有 | 低优先级 |
| 16 | **StripeManager计费 + UsageCacheManager用量缓存** | 无 | gland/token_meter有总量 | 部分有 | 若做多租户SaaS才需要 |
| 17 | **反馈采集feedback + stats统计** | 无 | 无 | 完全没有 | 用户反馈即eval信号（与open-webui模型排行榜互证） |

## 源码亮点

- **evaluations服务的CostCalculator**：每次评估跑完自动算成本并format，评估报告自带"跑一次多少钱"——评估不再是奢侈品
- **Iteration/Loop节点是子图语义**：Iteration的children节点带parentNode属性，子图执行N次——与OpenMate graph-engine的扁平DAG相比是图中图
- **observe包独立发布**（@flowiseai/observe）：观测SDK与平台解耦，可嵌入任意React宿主——Build/Run/Observe三包分立的架构选择
- **agentflowv2-generator的prompt工程**：可用节点清单+市场模板注入，planning标签内思考，节点约束写进prompt而非后校验（后校验兜底）

## 可复用设计

1. **Evaluation四实体**（Dataset/DatasetRow/Evaluation/EvaluationRun）——OpenSoul评估闭环的最小正确数据模型，含版本化与重跑
2. **HumanInput节点+observe的Approve/Reject按钮**——HITL在画布执行中的标准形态，与DeerFlow ClarificationMiddleware互证（一个在图内暂停，一个在对话内表单）
3. **NL→工作流生成器**——OpenMate已有画布，补一个"自然语言生成图"入口性价比极高
4. **队列+执行持久化**——与Langfuse/DeerFlow三方互证的P0地基
5. **"一个flow暴露为MCP工具"**——OpenSoul已有MCP server，补产品化包装即可让外部agent调用OpenSoul工作流
