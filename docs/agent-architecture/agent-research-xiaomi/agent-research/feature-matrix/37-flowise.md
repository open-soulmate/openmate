# Flowise 功能研究

> cron第30轮（第二个） | 仓库：FlowiseAI/Flowise（55k星，TS monorepo，main分支实读）
> 深度度：中——packages/{agentflow,observe,server,ui,components}结构+server核心接口文件精读
> 定位：可视化Agent工作流平台（对标OpenMate workflow页面 + OpenSoul will/engine）

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **评估引擎**：Dataset（input/output行）→Evaluator→Evaluation（绑定chatflow跑批，average_metrics汇总），Interface.Evaluation.ts完整实体设计 | 没有 | 没有（api/benchmark.py是性能基准，非LLM质量评估） | **完全没有** | 四印证缺口（n8n/lobe/Flowise/LiteLLM）。抄其实体设计：datasets/dataset_rows/evaluations三表+LLM judge（3-5天） |
| 2 | **Redis任务队列**：PredictionQueue/UpsertQueue/ScheduleQueue+QueueManager+RedisEventPublisher/Subscriber，支持多实例水平扩展 | 没有 | 没有（echo/dispatcher等是内存asyncio，无外部队列） | **完全没有** | OpenSoul单机够用，但will/engine任务与文档摄入应预留队列接口；先抽象QueueManager基类，本地实现，Redis实现后补 |
| 3 | **调度器**：ScheduleBeat（心跳）+ScheduleExecutor分离 | 没有 | 部分有（api/hermes_cron桥接Hermes cron） | 部分有 | Beat/Executor分离的模式值得抄：beat只负责"到点投递"，executor独立重试 |
| 4 | **指标计数器**：IMetricsProvider接口+FLOWISE_METRIC_COUNTERS枚举（内外部预测计数、创建事件），可接Prometheus | 部分有（metrics页面） | 部分有（vital/collector自研） | **标准化计数器枚举**没有 | OpenSoul vital定义counter枚举+Prometheus暴露端点（1天），对齐OTel GenAI命名（见36轮#17） |
| 5 | **追问生成**：followUpPrompts——回答后LLM自动生成建议追问 | 部分有（OpenMate smart-prompt.tsx待确认等价性） | 没有 | 部分有 | acp-proxy回复后异步生成2-3个追问（半天-1天），提升留存的产品小功能 |
| 6 | **自然语言生成工作流**：agentflowv2Generator——用户描述需求→LLM直接产出agentflow节点图JSON | 部分有（OpenMate workflow页面） | 部分有（cortex/task_planner做任务分解非图形化） | **NL→工作流图**没有 | 值得抄：task_planner输出改为will/engine工作流DSL，"帮我建个每天总结的流程"一句话生成（2-3天） |
| 7 | **文档存储**：Interface.DocumentStore.ts——文档摄取/分块/向量化统一管理实体 | 部分有（knowledge页面） | 部分有（graphrag） | 部分有 | LlamaIndex轮已覆盖RAG缺口，此处印证 |
| 8 | **多租户workspace+计费**：IdentityManager+workspaceId贯穿所有实体+StripeManager+UsageCacheManager用量缓存 | 没有 | 部分有（tenant_id字段已在UserMemory等表中） | **计费/配额**完全没有 | 若产品化需要；当前优先级低，但UsageCacheManager"按租户缓存LLM用量"的设计可抄进vital |
| 9 | **并发控制池**：AbortControllerPool（可中止请求注册池）+CachePool | 没有 | 部分有（无统一abort管理） | 部分有 | 与34轮发现的"cancel_execution未真正cancel"bug相关：OpenSoul需要AbortControllerPool等价物（任务ID→asyncio.Task注册表，1天） |
| 10 | **自定义MCP服务端**：可把chatflow封装为custom MCP server（CUSTOM_MCP_SERVER_CREATED） | 没有 | 部分有（mcp/server.py是客户端） | **反向MCP**（暴露自己为server）没有 | OpenSoul已有MCP客户端；把常用能力（记忆查询/工作流触发）封装为MCP server对外（2天） |
| 11 | **observe独立观测应用**：packages/observe单独SPA，executions浏览+独立API/store | 部分有（monitoring页面） | — | 部分有 | 观测独立成包的架构值得参考（关注点分离） |
| 12 | **API安全层**：headerValidation+httpSecurity中间件（速率限制/头校验） | 没有 | 部分有（immune） | 部分有 | OpenSoul对外API补速率限制中间件 |

## 源码亮点

1. **Interface驱动的领域建模**：Interface.Evaluation.ts/Document.ts/Metrics.ts/Schedule.ts——先定义完整实体接口再实现，评估/文档/调度四个子系统边界清晰
2. **队列三兄弟**（Prediction/Upsert/Schedule）：按负载类型分队列，互不阻塞——比单一全局队列优雅
3. **Beat/Executor调度分离**：ScheduleBeat只管"到点"，ScheduleExecutor管执行与重试，beat挂了任务不丢（有测试ScheduleBeat.test.ts印证）

## 可复用设计

| 优先级 | 项目 | 工作量 | 理由 |
|--------|------|--------|------|
| P0 | AbortControllerPool等价物（#9） | 1天 | 修复34轮发现的cancel bug，一并补能力 |
| P0 | 指标计数器枚举+Prometheus端点（#4） | 1天 | 可观测性基建 |
| P1 | 评估三表实体设计移植（#1） | 3-5天 | 四源码印证的头号产品缺口 |
| P1 | NL→工作流DSL生成（#6） | 2-3天 | task_planner+will/engine打通，产品亮点 |
| P2 | 追问生成（#5） | 0.5-1天 | 便宜的产品体验提升 |
| P2 | 反向MCP server（#10） | 2天 | 生态接入点 |
| P3 | 队列抽象（#2） | 2-3天 | 单机阶段预留接口即可 |

## 与既往轮次交叉印证

- #1评估 → 与35-n8n agent-evals、36-LobeHub eval-rubric、27-LiteLLM影子评估**四重印证**
- #2队列/多实例 → 印证34-LangGraph"持久化"结论：OpenSoul要水平扩展必须先持久化再队列化
- #9中止池 → 直接对应34轮发现的cancel_execution bug，独立实现再次验证该修复必要
