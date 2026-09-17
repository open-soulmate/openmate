# 进化引擎可借鉴实现模式提取（来自100-agent研究）

> 来源文件：42-agno-source.md、33-mem0-letta-deep.md、07-letta-deep.md、78-camel-source.md、
> 59-deepagents-source.md、72-swe-agent-source.md、75-agent-zero-source.md、34-langgraph-deep.md、22-metagpt-deep.md
> 提取时间：2026-09-17。面向"更好的进化引擎"建设，聚焦五个主题。

---

## 一、失败记忆（Failure Memory）

### 1.1 mem0：失败必须可见，禁止静默降级（33-mem0-letta-deep.md）
- **机制**：LLM事实抽取失败时 `raise LLMError` 而非静默返回 `[]`。源码注释明说："原来静默导致上游无法区分'不可用'和'无事实'"。
- **对进化引擎的启示**：进化试验失败时必须区分「试验本身失败」vs「试验成功但无改进」，两者进不同的记忆分支。静默吞错误 = 失败记忆失真。

### 1.2 mem0：记忆历史/审计表（可直接抄的schema）
- **数据结构**：SQLite表字段 = `memory_id / old / new / event(ADD-UPDATE-DELETE) / is_deleted`，配 `history()` 查询接口 + 批量写。
- **对进化引擎**：基因/skill每次被修改都写审计记录，"这条策略是被谁、因为哪次失败、从什么改成什么"全程可追溯。半天可实现。

### 1.3 mem0：记忆链接（linked_memory_ids）——失败的关联记忆
- **机制**：新记忆抽取时 `linked_memory_ids` 指向已有UUID；同一实体的新事件仍独立抽取、**只链不断**。反幻觉设计：把已有记忆UUID映射为"0".."9"整数给LLM选，输出后再映射回UUID，防LLM编造ID。
- **对进化引擎**：失败记录之间建链——"这次失败和上次X失败同源"，进化时按链检索整族失败，而非孤立单条。

### 1.4 agno：错误风暴熔断（42-agno-source.md, environments/runner.py）
- **机制**：前 `storm_window` 个attempt全部error且 `error_type` 相同 → 停止整个rollout。防API key失效等系统性故障烧完 K×N 次调用。
- **对进化引擎**：进化循环必须有"连续同错即停"的熔断，失败记忆的第一道闸门是**别把系统性故障记成N条独立失败**。

### 1.5 Letta：后台反思子代理维护失败记忆（33-mem0-letta-deep.md）
- **机制**：对话结束→后台spawn反思agent（只给Bash+Edit工具）→读transcript→Edit记忆文件→git commit。明确规则："一次性事务入memory，可复用流程才入skills"。reflection prompt操作规程极精确（先 `wc -c` 再决定全读/定点读）。
- **MemFS**：记忆=markdown文件树，git commit=记忆变更，**可diff可回滚**；git pre-commit hook内嵌frontmatter校验（格式/受保护字段不可改）。
- **对进化引擎**：失败复盘应是独立后台agent行为而非主循环内联；失败记忆用git版本化，错了能回滚。

### 1.6 CAMEL WorkflowMemoryManager：失败的反面——成功的复用（78-camel-source.md）
- **机制**：workflow_memory_manager.py（1746行）——从历史工作流中按 `WorkflowSelectionMethod` 枚举**选择可复用模式**，save/load_workflow_memories，管理agent的workflow记忆独立存储。"第二次同类任务直接复用历史工作流结构，比skill更结构化的复用。"
- **对进化引擎**：进化引擎不只记失败，还要记「哪次变异是成功的」并把**整个工作流结构**（不只是prompt片段）作为可复用单元存储。

---

## 二、多候选评估（Multi-Candidate Evaluation）

### 2.1 agno：评估三件套——scorer协议 + run_rollouts + baseline diff（42-agno-source.md）
- **scorer三种实现**：
  - `CodeScorer`：可执行判定 + digest环境指纹；
  - `JudgeScorer`：LLM裁判1-10归一化 + judge prompt fence防注入，digest哈希judge模型全身份（class/id/provider/base_url/sampling params）；
  - `ToolCallScorer`：按工具**实际执行**判分——拒绝/报错/HITL人工拒绝**都不算满足**。
- **run_rollouts（K次全隔离）**：k=8，每次attempt全新内存db/新session/关缓存关记忆写入；**pass_rate只统计scored的attempt（超时≠答错）**；`learning_zone` = 有成有败的任务集 = SFT候选。
- **环境/策略双指纹**：`env_fingerprint`（任务+评分器+超时等环境要素）与 `policy_fingerprint`（模型+prompt+工具）分离——baseline diff时先校验同环境（MismatchError），再报告policy_changed。"回归了"能定位是环境漂移还是agent变了。
- **baseline diff**：逐任务报告 improved/regressed；`to_sft_jsonl` 通过尝试直接导出SFT数据集。
- **对进化引擎**：这是"有没有进化"的最完整工程化解法。**指纹分离 + diff + learning_zone 三件套应是进化引擎的核心骨架**：每次进化候选跑K次隔离rollout，与baseline同环境对比，只把"有成有败"的进学习区。

### 2.2 deepagents RubricMiddleware：完成=裁判通过，非模型自说自话（59-deepagents-source.md）
- **机制**（rubric.py 1438行）：agent将完成时启动**独立grader子agent**对照rubric评分 → `needs_revision` 则反馈作为HumanMessage注入继续跑，直到 `satisfied / failed / max_iterations`。GRADER_SYSTEM_PROMPT是专职裁判prompt。
- **关键细节**：grader与被评agent**完全独立**（不同上下文），评估结论是三态而非二值。
- **对进化引擎**：进化候选的验收从"生成模型说完成了"变成"独立裁判对照rubric说通过了"。约200行（评分→注入→循环）。

### 2.3 SWE-agent：采样→比较→重试全家桶（72-swe-agent-source.md）
- **AskColleagues同行评议采样**（~60行）：同一history用 `model.query(history, n=n_samples)` 采N个候选→每个解析出(thought, action)→拼"Your colleagues had the following ideas"讨论文本→最终模型读讨论后选一个action。**采样不改上下文，讨论作为user message追加**。自一致性+同行讨论一步到位。
- **BinaryTrajectoryComparison锦标赛选优**：min4~max10个样本，裁判模型**两两比较**选最佳（"资深工程师评审初级开发者"prompt），temperature可独立覆盖。best-of-N的工业版。
- **ChooserRetryLoop/ScoreRetryLoop**：Reviewer给每次提交打分→重试至max_attempts→`get_best()`返回最优attempt；Preselector先筛后Chooser精选两段式。
- **ReviewSubmission独立建模**：提交物（patch/答案）与轨迹分离，**评审只看提交不看过程**——防过程噪声干扰评审。
- **对进化引擎**：进化变异同样适用"一个parent出N个候选→两两锦标赛→get_best()"；评审对象应该是**最终提交物**（diff/测试结果）而非完整轨迹。

### 2.4 CAMEL：程序化验证器优先于LLM裁判（78-camel-source.md）
- **机制**：verifiers/ 目录下 math_verifier（符号计算验证）、physics_verifier（量纲检查）、python_verifier（**执行验证**）——生成结果用领域规则程序化验证。
- **哲学**："能程序化验证的绝不靠LLM"——便宜、可靠、可重复。
- **对进化引擎**：候选评估的第一层永远是程序化验证（测试通过率、lint、行为回归脚本），LLM裁判只做程序化验证覆盖不了的维度。与RubricMiddleware互补。

---

## 三、真实集成测试（Real Integration Testing）

### 3.1 agno：全隔离环境指纹（42-agno-source.md）
- 每次rollout = 新内存db + 新session + 关缓存 + 关记忆写入——**候选之间零污染**。env指纹校验保证"对比是在同一环境下进行的"，否则diff结果无效。
- **对进化引擎**：进化候选的集成测试必须跑在全新隔离环境，且测试环境的指纹要记录；环境变了的测试结果不能和旧基线比。

### 3.2 SWE-agent SWEEnv：真实执行环境（72-swe-agent-source.md）
- **机制**：docker/ssh两种宿主 + repo.py自动clone + **per-instance成本上限** + 超时保护。agent在真实repo、真实shell里跑。
- **对进化引擎**：进化验证不能只靠静态检查——需要真docker环境跑真测试。成本上限per-instance是防失控的必要设计。

### 3.3 CAMEL 领域验证器（python_verifier = 执行验证）
- Python代码候选直接**执行验证**而非读代码判断。对进化引擎：改过的skill/gene应在受控环境真实跑一遍典型任务，用执行结果而非文本评审作判据。

### 3.4 deepagents BaseSandbox：两方法接入真实沙箱（59-deepagents-source.md）
- **机制**：具体沙箱只需实现 `execute()` + `upload_files()` 两个抽象方法；ls/grep/glob/read全用shell命令在沙箱内 `python3 -c` 派生实现（**参数base64防注入**）；edit大payload走临时文件+服务端replace脚本。BackendProtocol（984行协议）统一8种后端（filesystem/state/store/composite/langsmith/context_hub/sandbox/local_shell）。
- **对进化引擎**：先定BackendProtocol再换执行后端——本地测试→docker→E2B无缝切换，"接新沙箱只写两个方法"。

### 3.5 LangGraph：checkpoint_conformance独立测试包（34-langgraph-deep.md）
- **机制**：任何CheckpointSaver实现跑**同一套一致性用例**。
- **对进化引擎**：进化引擎自身的持久化层（进化历史/失败记忆/候选状态）也应有一致性测试包，任何存储实现跑同一套用例。

---

## 四、自修改安全（Self-Modification Safety）

### 4.1 Agent Zero：函数级扩展点 + 输出侧安全门（75-agent-zero-source.md）
- **per-function扩展点**：`extensions/python/_functions/<module>/<qualname>/<start|end>/` ——任意模块任意函数的入口/出口都可被插件拦截（`@extension.extensible` 装饰器），配置解析顺序=project/profile→project→user/profile→user→default五层。**不预设事件表，直接函数级切入**，~100行核心。AgentContext的 `__init__/remove` 本身也挂装饰器——新建/销毁会话可被拦截。
- **_infection_check输出侧安全门**（本轮最高价值单项）：流式收集reasoning+response→**独立审计模型**分析prompt注入→工具执行前 `gate()` 阻塞等结果；verdict三态 `<ok/>` / `<terminate/>` / `<clarify>`（澄清回环最多N次）；thoughts模式在工具参数流式期间就并行审计（gate时大概率已有结果——安全检查不加延迟的诀窍）；终止时最后AI消息替换为 `[BLOCKED]`。
- **对进化引擎**：自修改的代码在**执行前**过输出审计门（三态verdict），而非执行后复盘。进化引擎改自身代码时，改的每个关键函数都有拦截点。

### 4.2 Letta：记忆沙箱隔离 + frontmatter校验 + read_only保护（33-mem0-letta-deep.md）
- **memory-confinement**：内核级sandbox，子代理可读宿主、可写自己的记忆、**不能读写其他agent记忆**，**fail-closed**——无sandbox直接报错不降级。
- **git pre-commit hook内嵌校验源码**：frontmatter格式校验 + 受保护字段不可改。
- **READ_ONLY_BLOCK_LABELS**：`memory_filesystem` 块标记为只读（07-letta-deep.md）。
- **对进化引擎**：进化产生的新配置分「可改区」和「保护区」（安全策略、审计日志、回滚点本身不可被进化改写）；保护靠pre-commit hook程序化强制，fail-closed。

### 4.3 deepagents：Hooks三层信任模型（59-deepagents-source.md）
- **机制**：user/project/plugin三级hooks.json，**所有匹配handler并发执行后按project→user→plugin顺序reduce**（先stop者决定事件，但plugin副作用无条件发生）；project hooks须workspace trust门（交互批准→持久化 `~/.deepagents/.state/hooks_trust.json`，headless须 `--trust-project-hooks` 显式opt-in）。
- **Subagent fork隔离**：剔除 `_FORK_EXCLUDED_STATE_KEYS`，`_FORKED_CONTEXT_KEY` 标记**防递归委派——调用时拒绝而非隐藏工具**。
- **THREAT_MODEL.md工程实践**：自动维护的威胁模型文档（信任假设11条+边界+TB编号追踪）；sandbox agent显式拒绝FilesystemBackend/LocalShellBackend直连。
- **对进化引擎**：进化出的新hook/扩展必须过trust门（首次执行需显式批准并持久化信任状态）；防递归要"调用时拒绝"而非"界面上藏起来"。

### 4.4 Agent Zero _time_travel + _agent_editor（75-agent-zero-source.md）
- **_time_travel工作区时光机**：对agent工作目录做 snapshot / history_list / diff / preview / **travel / revert** API七件套 + retention保留策略，per-project历史。
- **_agent_editor确定性稀疏编辑器**：agent profile的结构化编辑API——**只改指定字段不动其他**，防覆盖写。
- **对进化引擎**：自修改必须先snapshot再改，随时revert；修改用稀疏编辑（字段级patch）而非整文件重写——这是"进化改坏一行毁掉全部"的直接解药。

### 4.5 LangGraph：interrupt幂等重放语义 + 检查点时间旅行（34-langgraph-deep.md）
- **interrupt**：节点内任意点抛可恢复异常，恢复时 `Command(resume=answer)`，节点**从头重放**，同节点多个interrupt按顺序匹配resume值——**文档明示"re-executing all logic"，强制interrupt调用幂等**。
- **时间旅行**：`Command(resume=..., checkpoint_id=...)` 从任意历史快照分叉重放；`get_state_history`（全历史快照链）+ `update_state`（外部改写任意快照）。
- **Durability三档**：`Literal["sync","async","exit"]` 按run配置。
- **对进化引擎**：进化状态机每个节点必须幂等（因为可能被重放）；进化历史=checkpoint链，可从任意一代分叉试验；关键写入sync、批量试验async。

---

## 五、跨系统协调（Cross-Repo / Cross-System Coordination）

### 5.1 CAMEL TaskChannel任务市场（78-camel-source.md）
- **机制**：Packet（含PacketStatus状态机）+ post_task / post_dependency / **get_in_flight_tasks(publisher) / get_returned_task_by_publisher / get_assigned_task_by_assignee** / return_task / archive_task——**发布-认领-归还的任务市场**，依赖边显式建模。发布者能查"我发的任务谁领了/谁还回来了"——任务流转全程可追溯。
- **Workforce快照**：save_snapshot / list_snapshots / restore_from_snapshot——编排器级快照（任务队列+worker状态）。
- **运行时干预面**：modify_task_content（任务跑偏时人工改写）/ reorder_tasks / skip_gracefully（**跳过不失败**）+ pause/resume/stop_gracefully/stop_immediately五种控制。
- **对进化引擎**：多agent/多repo协同进化时用任务市场模式（发布-认领-归还+双向查询），而非中心派单；进化任务支持运行中人工改写/重排/优雅跳过。

### 5.2 agno durable JobQueue（42-agno-source.md）
- **机制**：idempotency_key按user命名空间去重 / max_depth队列满 / claim带deployment_id亲和 / heartbeat续锁 / stale锁回收 / retry_or_fail退避 / **continue_job CAS幂等含attach/conflict/paused豁免清理**。
- **注释即规格**：每条CAS/所有权设计都写明为什么——"ids are never reused—two executors, the first one's completion fenced out"；"paused tickets are retention-exempt—must outlive arbitrary human latency"；continue的budget grant = `max_attempts = attempt+1`（"用户触发的一次续跑绝不静默重跑"）。300行=分布式任务队列最小正确实现。
- **对进化引擎**：跨repo进化试验的分发用地道的durable队列（幂等键+心跳锁+CAS续跑），进化任务被人工暂停时豁免自动清理。

### 5.3 deepagents BackendProtocol + composite路由（59-deepagents-source.md）
- **机制**：984行协议统一ls/grep/glob/read/write/edit/delete/upload；composite后端**按路径前缀路由多后端**；ContextHubBackend持久化到远程repo——写入是**intent批处理（50ms窗口）+ commit hash乐观并发 + 冲突重试3次**。
- **对进化引擎**：跨repo协调的写入层用"乐观锁+冲突重试"而非悲观锁；先定协议，本地FS/docker/远程repo后端可插拔替换。

### 5.4 LangGraph Channels归约器（34-langgraph-deep.md）
- **机制**：状态不是dict直接改而是通道归约器——LastValue / AnyValue / Topic（pub-sub多值）/ **BinaryOperatorAggregate（`Annotated[list, operator.add]` 类型注解自动append合并）** / NamedBarrierValue（多路汇聚屏障）/ DeltaChannel（增量流）。**并行节点写同一list key自动append合并**。
- **Send API动态扇出**：条件边 `return [Send("node", custom_state) for s in ...]`，每份state独立，map-reduce并行；**Send可带per-task TimeoutPolicy**。
- **对进化引擎**：多repo/多agent并行写共享状态时，归约器是并行的前提（`execution.variables.update()` 后写覆盖前写，一并行就竞态）；进化引擎至少实现 LastValue + operator.add 两档。跨系统的进化结果汇聚用NamedBarrierValue等全部到齐。

### 5.5 Letta 入站turn队列 + 审批恢复（33-mem0-letta-deep.md）
- **turn-queue-runtime**：user消息/task_notification/cron_prompt三类入站排队，逐turn串行送入agent，支持合并——多渠道同时来消息时的per-agent串行化。
- **approval-recovery**：中断后审批状态恢复；turn-recovery-policy。
- **对进化引擎**：每个进化agent一个入站队列（人工指令/cron试验/其他repo通知三类来源串行化），进化中被中断的人工审批可恢复。

### 5.6 agno run_continuation_blocked + @approval（42-agno-source.md）
- **机制**：admin审批未解决时**禁止本人继续自己的run**（"审批人≠发起人"）；`approvals:write` 管理员可强制。@approval装饰器分required（阻塞）/audit（审计）两型，与@tool任意顺序组合。
- **对进化引擎**：进化引擎改自身关键配置时，审批人≠执行人；审计型approval记录每次自修改的授权链。

---

## 六、补充：MetaGPT的增量开发与评审门（22-metagpt-deep.md）

- **Role+Action状态机**：RoleContext（env, msg_buffer, memory, working_memory, state, todo, watch）+ RoleReactMode三模式（REACT/BY_ORDER/PLAN_AND_ACT）；think()选动作→act()执行→_observe()观察新消息。
- **Team预算控制**：invest()投资预算 + _check_balance() + NoMoneyException——进化试验同样需要budget上限。
- **文档驱动SOP**：PRD→设计→代码的文档链（22-metagpt.md）——进化产物是文档链而非单点输出，每一环可评审。
- 注意：本仓库的metagpt研究文件较浅（仅读role.py/action.py/team.py/schema.py四文件），incremental development/review gates的代码级细节不足，如需深挖需补一轮源码研究。

---

## 七、五主题 × 模式速查表

| 主题 | 首选模式 | 来源 | 代码量级 |
|---|---|---|---|
| 失败记忆 | 审计表(old/new/event) + 记忆链接(反幻觉ID映射) + 错误风暴熔断 | mem0 + agno | 半天~1天 |
| 失败记忆 | 后台反思子代理 + git版本化记忆(MemFS) | letta-code | 2-3天 |
| 多候选评估 | 指纹分离 + K次隔离rollout + baseline diff + learning_zone | agno environments | ~800行(P0) |
| 多候选评估 | 独立grader循环(三态) + N候选锦标赛get_best() + 程序化验证器优先 | deepagents + SWE-agent + CAMEL | ~200行+60行 |
| 集成测试 | 全隔离环境指纹 + docker真环境per-instance成本上限 + BaseSandbox两方法派生 | agno + SWE-agent + deepagents | 中 |
| 自修改安全 | 函数级扩展点 + 输出审计门(三态verdict+流式并行) + snapshot/revert七件套 + 稀疏编辑 + fail-closed记忆沙箱 | agent-zero + letta | 100行核心+ |
| 自修改安全 | trust门持久化 + 调用时拒绝防递归 + interrupt幂等重放 | deepagents + langgraph | 中 |
| 跨系统协调 | TaskChannel任务市场(发布-认领-归还) + durable JobQueue(CAS/心跳/幂等) | CAMEL + agno | 300行+ |
| 跨系统协调 | Channels归约器 + Send扇出 + 乐观锁冲突重试 + per-agent入站队列 | langgraph + deepagents + letta | 中 |

**跨主题元结论**（agno源码亮点原文）："Agent平台赛道的'评估工程化'（agno environments + Flowise Evaluation + langfuse experiments三方同季发力）说明**'agent有没有变好'正在从玄学变成CI指标**。"
