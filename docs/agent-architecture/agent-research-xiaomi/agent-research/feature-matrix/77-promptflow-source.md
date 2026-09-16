# PromptFlow (#77, 12k★, Microsoft) 功能研究

研究时间：2026-09-16（cron自动轮次）
源码：codeload tarball → ~/agent-research-src/promptflow（304MB，tar校验OK，源码级）
定位：LLM工作流开发平台——DAG流编排+批量执行引擎+内置评估器全家桶+OTel追踪+多语言执行器。10个子包分层（core/tracing/devkit/evals/tools/azure/parallel/rag/recording）。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **节点激活条件+条件bypass**：Node.activate=ActivateCondition(when/is)——上游值满足条件才执行，否则bypassed_nodes记录+下游输入降级（有默认值用默认值，无则None）。**DAG里的if分支不需要显式分支节点** | core/contracts/flow.py:203-335 + executor/_dag_manager.py | xyflow画布无条件节点 | will/dag_planner无激活条件 | 完全没有 | OpenMate画布加"条件激活"节点属性，比ConditionAgent（Flowise）更轻——纯数据驱动不用LLM |
| 2 | **批量执行引擎BatchEngine**：逐line并发（Semaphore限流）+aggregation节点（全量结果聚合）+**_copy_previous_run_result断点续跑**（按line index读上次Completed结果直接复用，只重跑失败line）+per-line超时+cancel | devkit/promptflow/batch/_batch_engine.py(648行) | 无 | 无 | 完全没有 | 与claude-code resumeFromRunId、n8n partial-execution三方互证的"按行续跑"，OpenSoul will/批量任务可抄 |
| 3 | **每line进程隔离池**：_line_execution_process_pool.py+process_manager——每行独立子进程执行，单行崩溃不污染整个batch | core/promptflow/executor/ | 无 | 无 | 完全没有 | 长批量任务健壮性关键 |
| 4 | **19个内置评估器**：relevance/coherence/fluency/groundedness/similarity + BLEU/ROUGE/METEOR/GLEU/F1 + **content_safety**（暴力/仇恨/自伤/性内容4类）+ **protected_material**（版权文本/代码检测）+ **xpia**（间接提示注入攻击检测）——全部即插即用 | evals/evaluators/（每类一个子包） | 无 | benchmark/evaluator=5维自评 | 完全没有 | **xpia与protected_material是政企合规刚需**；groundedness/f1可先抄3个进OpenSoul benchmark |
| 5 | **evaluate()评估编排**：数据集→并行跑评估器→结果聚合→可选输出到Azure AI Studio；LLM裁判+代码裁判混合 | evals/evaluate/_evaluate.py:357 | 无 | 无 | 完全没有 | 与langfuse/n8n评估闭环互证（又一方） |
| 6 | **OTel原生追踪**：promptflow-tracing独立包——start_as_current_span装饰器+TokenCollector逐span token归因（含流式）+TracedIterator流式代理+span异常/取消状态处理+prompt模板enrich | tracing/_trace.py, _tracer.py | 无 | trajectory扁平事件表 | 完全没有 | **第二次看到"独立tracing包+OTel+token逐span归因"**（agentops后又一方），OpenSoul trajectory升级再确认 |
| 7 | **Prompty格式**：.prompty文件=markdown frontmatter（model配置+inputs+outputs）+prompt正文——**一个prompt即一个可执行单元**，无需画流 | core/promptflow/core/ | 无 | gene/templates有模板无标准格式 | 部分有 | OpenSoul gene模板可兼容prompty frontmatter格式，白嫖生态 |
| 8 | **多语言执行器注册表**：BatchEngine.register_executor(language, proxy_cls)——executor按语言代理（Python/C#等），flow YAML声明language | batch/_batch_engine.py:66 | 无 | 无 | 完全没有 | 设计可抄：OpenSoul limb执行器按runtime注册 |
| 9 | **节点级variants**：同节点多套配置变体（不同模型/prompt），运行时选定——A/B测试内建 | contracts/flow.py:537 | 无 | 无 | 完全没有 | |
| 10 | **ServingApp**：流一键发布FastAPI服务+app.py HTTP端点 | _sdk/_serving/app.py | 无 | 无 | 完全没有 | OpenMate画布流可"发布为API" |
| 11 | **分布式执行promptflow-parallel**：executor/config/metrics三件套——同一流多机扩展 | parallel/ | 无 | 无 | 完全没有 | P2，规模到了再做 |
| 12 | **连接管理**：connections统一凭证抽象（Azure Key Vault等provider），工具运行时按名取连接 | core/connections/ | 无 | 无 | 完全没有 | 与Composio授权托管互证 |

## 源码亮点
1. **ActivateCondition的设计哲学**："条件"不是节点而是节点的属性——bypass后的节点进`bypassed_nodes`字典，下游`get_node_valid_inputs`按函数签名自动决定降级策略。比"加个If节点"优雅：图结构不变，语义变。
2. **_copy_previous_run_result的续跑粒度**：按line index匹配上次run的Completed结果，deepcopy改root_run_id挂到新run下——"改一处只重跑失败行"的批量版，与claude-code Workflow resumeFromRunId互证。
3. **包分层纪律**：core（执行）/tracing（观测）/devkit（本地开发）/evals（评估）/azure（云）互不依赖倒置——tracing可单独给任何Python项目用。

## 可复用设计
1. **P0：批量引擎三件套**（Semaphore并发+aggregation节点+按行续跑）——OpenSoul will/从DAG骨架升级为可跑批量任务的最短路径。
2. **P0：xpia+protected_material评估器**——政企场景"输出带不带版权内容/有没有被注入"是采购评审会问的问题。
3. **P1：节点激活条件**——OpenMate画布零新节点类型获得条件执行。
4. **P1：Prompty格式兼容**——OpenSoul gene/templates对齐行业prompt打包标准。

## grep确认
NONE：activate_condition / prompty / xpia / protected_material / groundedness / content_safety / node_concurrency / resume_from(batch义)
部分：bypass=opensoul intrusion_middleware.py（安全中间件，非DAG bypass）；aggregation=gland/token_meter（token聚合，非结果聚合节点）；evaluator=benchmark/ 5维自评非裁判
