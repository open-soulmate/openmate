# AG2 (#65, 25k★, AutoGen继任者) 功能研究

研究时间：2026-09-16 17:10（cron自动）
源码：git clone https://github.com/ag2ai/ag2 → ~/agent-research-src/ag2（18MB，源码级深读）
定位：**协议驱动的async agent框架**（2026全面重写，AGENTS.md含完整开发规范+ADR体系）

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **HITL统一词汇ElicitationPolicy**：`ask\|decline`两值，故意无auto——"权限请求可以盲选allow，但任意elicitation表单AG2不能替用户编数据"；同一词汇同时服务acp的elicitation/create和mcp服务端"能否向client提问" | hitl.py 77行 | 无 | 无 | 完全没有 | 先定义词汇表再实现HITL，协议层一次学对 |
| 2 | **ApprovalRequired工具审批middleware**：Y/N/**Always**三键，always豁免状态存`context.variables`（会话级）而非middleware实例（可序列化、跨compaction存活）；支持timeout；describe()自描述配置 | middleware/builtin/tools/approval.py 115行 | 无 | casbin用户RBAC（非工具级） | 完全没有 | 与goose三档/codex审批互证，P0 |
| 3 | **LoopDetector observer**：EventWatch(ToolCallEvent)+滑窗deque(maxlen=10)+连续3次相同(name,args)→ObserverAlert(WARNING)+`_flagged`集合去重（同签名只报一次） | observers/loop_detector.py 75行 | 无 | 无 | 完全没有 | 参数(window=10,threshold=3)可直接抄，与anything-llm/deer-flow互证 |
| 4 | **TokenMonitor observer**：独立观察者监控token用量→alert | observers/token_monitor.py | 无 | gland/token_meter有计量无观察者alert | 部分有 | 挂到trajectory事件流上 |
| 5 | **Policies提示词注入策略族**：EpisodicMemory（读/memory/conversations/最近5条摘要注入system prompt）/ WorkingMemory（读working.md）/ SlidingWindow / TokenBudget / Alert / Conversation——**transparent=True时注入"[episodic_memory] Injected N past conversation summaries."标注**（模型知道记忆从哪来） | policies/ 6个 | 无 | hippo有episodic/semantic/procedural/working四层**分型存储**，但无"按策略注入prompt"管线 | 部分有 | hippo存储+ag2 Policy注入=完整闭环；透明标注设计立即可抄 |
| 6 | **Compact vs Aggregate职责分离**：Compaction=删（事件数/token逼近上限触发，返回缩减事件列表）；Aggregation=建（里程碑触发，从事件流提取知识写knowledge store）。"Compaction removes. Aggregation creates." | compact.py 207行 + aggregate.py 220行 | 无 | sessions_api仅有compacted标志位+gene模板 | 完全没有 | OpenSoul hippo抽取可升级为AggregateStrategy协议 |
| 7 | **Replay不变量**（_replay.py）：任何历史裁剪者（assembly/limiter/compaction）裁剪后tail必须自洽——tool result必须带它回答的call、server-side builtin call必须带reasoning item，否则orphan事件污染provider请求 | _replay.py | 无 | 无 | 完全没有 | ~30行校验函数，裁剪健壮性关键 |
| 8 | **Task生命周期原语**：TaskStarted/Progress/Completed/Failed/Expired/Cancelled六事件挂流上，任何observer（network mirror/watcher/UI/测试）可旁观不参与；**checkpoint()持久化resume state，resume_from=prior_task_id读回checkpoint断点续跑**（HubBackedCheckpointStore）；agent自有，框架不调度 | task.py 478行 | 无 | will/DAG骨架无checkpoint | 完全没有 | 与STORM分阶段落盘/Cline checkpoint互证，P0 |
| 9 | **Watch原语统一反应式**：EventWatch/时间定时/组合条件，一个抽象覆盖"事件监控+定时调度+复合条件"，observer和scheduler共用 | watch.py 512行 | 无 | will/proactive有调度雏形 | 部分有 | OpenSoul sentinel可对齐此抽象 |
| 10 | **Eval离线评估框架**：agent_judge单标准打分器（一个judge一个criterion一个Feedback key，多维=列表组合，各自成RunResult列）+pairwise/human_pairwise对比+attribution归因+correctness+cost+threshold scorer；dataset(Suite/Task)+Trace+runner(含settle等待)+reporters+BudgetThresholds；同一judge同时支持run_agent(live)和evaluate_traces(离线) | eval/ 整目录 | 无 | benchmark/evaluator=5维自评非裁判 | 完全没有 | 与langfuse/n8n/Flowise五方互证，P0；judge锁定response_schema=Verdict(score+reason,全required适配OpenAI strict模式) |
| 11 | **Verdict schema设计**：score+reason双字段**全required无optional**——OpenAI strict structured output拒绝required缺属性的schema | eval/scorers/judge.py 195行 | 无 | 无 | 完全没有 | 细节但会静默炸，抄 |
| 12 | **Network多agent网络层**：hub集中仲裁（arbiter/audit/sweepers/telemetry/expectations）+**Handoff/Finish类型化路由意图**（工具运行时返回`Handoff(target=Passport.name,reason)`框架解析name→id，路由逻辑从工具代码解耦）+**Rule per-(hub,agent)访问+限流，全部hub侧强制执行**（默认宽松，app收紧）+channel/envelope/identity/auth + task_mirror（任务事件镜像到网络） | network/ 整目录 | 无 | api/agent_collaboration.py有handoff_context上下文移交API | 部分有 | OpenSoul是点对点移交；ag2是hub+规则+typed intent，多agent规模化需要 |
| 13 | **多协议接入**：a2a(Google协议server)、acp、ag_ui(ASGI标准agent-UI协议)、a2ui(UI协议schema_manager+v0.9/v0.9.1/v1.0三版本兼容层+server_action+dispatch)、mcp_ui(resources/actions)、mcp | a2a/ acp/ ag_ui/ a2ui/ mcp_ui/ | 无 | acp-proxy自研 | 部分有 | a2ui版本化兼容层值得研究（UI协议演进不破坏旧客户端） |
| 14 | **Knowledge store多后端**：disk/sqlite/redis/locked(锁包装)/polling/log + bootstrap自举 + 统一prefix约定(/memory/conversations/、working.md) | knowledge/ | 无 | hippo自研sqlite | 部分有 | ag2的"知识=文件+prefix约定"与DeerFlow DeerMem互证 |
| 15 | **实时语音live/**：openai/gemini/elevenlabs realtime + STT + **turn-taking轮次管理** + cascade级联 + observer | live/ | 无 | 无 | 完全没有 | 语音入口产品线，政企展厅场景 |
| 16 | **subagent委派**：tools/subagents/含subagent_tool/run_task/persistent_stream/StreamFactory——子agent事件流可持久化转发给父 | tools/subagents/ | 无 | 无（有agent_collaboration非父子） | 完全没有 | persistent_stream让父agent观察子agent过程 |
| 17 | **Annotations依赖注入**：Context/Inject/Variable类型注解，fast_depends解析——工具函数声明式注入运行时依赖 | annotations.py | 无 | 无 | 完全没有 | 框架级DX设计 |
| 18 | **Structured response三形态**：response_schema(strict)/PromptedSchema(提示词诱导)/ResponseProto协议，同一输出约束三种实现强度 | response/ | 无 | cortex有extraction.py | 部分有 | |
| 19 | **沙箱扩展**：extensions/docker + extensions/tenki(sandbox.py/environment.py) + daytona扩展——执行后端可插拔 | extensions/ | 无 | mirror/sandbox.py目录级假沙箱 | 完全没有 | 与E2B/daytona互证 |
| 20 | **Middleware自描述**：每个middleware实现describe()→MiddlewareDescription(kind,config)——运行中可导出当前拦截链配置用于审计/复现 | middleware/describe.py | 无 | 无 | 完全没有 | 可观测性刚需，几十行 |
| 21 | **textual TUI内置** + **NLIP协议扩展**（nlip-sdk/nlip-server，独立agent互操作协议） | textual.py, extensions/nlip/ | 无 | 无 | 完全没有 | NLIP是新兴agent互操作协议，留意 |

## 源码亮点

1. **"协议驱动"体现在词汇统一**：ElicitationPolicy故意两值无auto，注释解释"权限请求有allow可盲选，elicitation表单没有AG2能不编数据就给的答案"——**把产品判断写进类型系统**。同一词汇服务acp和mcp两个协议集成，"一套词汇学一次，第二个别名会漂移"。
2. **豁免状态放context.variables不放middleware实例**：ApprovalRequired的"Always"记录存会话上下文→可序列化、跨compaction存活、多实例安全。
3. **Compaction/Aggregate二分法**：删与建是两种策略两个协议，触发条件不同（逼近上限 vs 确定性里程碑）。
4. **AGENTS.md本身就是可抄的工程规范**：禁止function-level import、禁止runtime路径嵌套函数（每次调用重复建函数）、禁止init副作用（目录创建放runtime方法）、ADR制度（难逆转+反直觉+真实权衡才立ADR）。
5. **eval同一judge双模**：只读注入的Trace和dicts→live和离线trace评估共用一套裁判代码。

## 可复用设计（按价值排序）

1. **P0：LoopDetector + Replay不变量 + Task checkpoint/resume**——三个都是小几百行以内、多项目互证、OpenSoul零覆盖。
2. **P0：Eval框架骨架**（agent_judge组合式+Trace+Suite）——直接回应"一直没有进化"，Verdict全required细节防炸。
3. **P1：Compact/Aggregate分离 + EpisodicMemoryPolicy透明标注**——OpenSoul hippo已有四层分型存储，缺的正是"注入策略"这一半。
4. **P1：Middleware describe()自描述**——审计/复现当前拦截链。
5. **P2：Hub+Rule集中执行 + Handoff typed intent**——多agent规模化时的路由/限流地基。

## grep确认（OpenMate src/ + OpenSoul src/）
- NONE：elicitation / approval_required / loop_detector / token_monitor / working_memory / sliding_window / aggregate_strategy / compact_strategy / checkpoint_store / task_mirror / pairwise / judge_scorer / a2ui / ag_ui / nlip / elicitation
- 部分：episodic=hippo memory_type四层分型（无注入Policy）；token_budget=long_term_memory内（无observer alert）；handoff=agent_collaboration.py上下文移交（无hub/typed路由intent/规则执行）；compacted=sessions_api标志位（无CompactStrategy协议）；sandbox=目录级假沙箱
