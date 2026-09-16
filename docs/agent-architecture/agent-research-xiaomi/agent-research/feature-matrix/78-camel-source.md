# CAMEL (#78, 10k★) 功能研究

研究时间：2026-09-16 18:25（cron自动）
源码：codeload tarball → ~/agent-research-src/camel（120MB，tar校验OK，源码级）
定位：最早（2023-03）的多agent框架之一，现演化为"agent社会模拟+Workforce任务编排+合成数据生成"三条产品线。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **Workforce任务编排引擎**（6314行workforce.py）：add_task/add_main_task/**add_subtask（父子任务树）**/remove_task/**reorder_tasks（运行中人工重排队列）**/**modify_task_content（任务跑偏时人工改写任务描述）**/resume_from_task | societies/workforce/workforce.py | 无 | will/DAG骨架 | 完全没有 | "运行中改任务/重排/跳过"是HITL最高级形态，与Khoj插话互补 |
| 2 | **五种运行控制**：pause/resume/stop_gracefully/**stop_immediately**/**skip_gracefully（跳过当前任务继续下一个）**+continue_from_pause+_process_task_with_intervention（带人工干预的任务处理） | workforce.py:2033-2243 | 无 | 无 | 完全没有 | skip_gracefully语义（跳过不失败）是独有设计 |
| 3 | **Workforce快照系统**：save_snapshot(description)/list_snapshots/restore_from_snapshot(index)——编排器级快照（任务队列+worker状态），与文件快照(opencode)互补 | workforce.py:2243-2574 | 无 | 无 | 完全没有 | |
| 4 | **TaskChannel包交换协议**：Packet(含PacketStatus状态机)+post_task/post_dependency/**get_in_flight_tasks(publisher)/get_returned_task_by_publisher/get_assigned_task_by_assignee**/return_task/archive_task——**发布-认领-归还的任务市场**，依赖边显式建模 | task_channel.py 326行 | 无 | 无 | 完全没有 | 与ag2 hub对比：camel是任务级packet市场，更细粒度 |
| 5 | **任务分解+依赖追踪**：_decompose_task管理agent分解主任务为子任务+_update_dependencies_for_decomposition+handle_decompose_append_task（分解后追加） | workforce.py:1462,1549 | 无 | will/dag_planner | 部分有 | |
| 6 | **WorkflowMemoryManager**：workflow记忆管理——**从历史工作流中选择可复用模式**（WorkflowSelectionMethod枚举），save/load_workflow_memories，管理agent的workflow记忆独立存储 | workflow_memory_manager.py 1746行 | 无 | 无 | 完全没有 | "工作流本身可记忆复用"——learn/的新维度，与gene/templates互补 |
| 7 | **Pipeline builder**：pipeline_add/add_parallel_pipeline_tasks/add_sync_pipeline_task/**pipeline_fork/pipeline_join**/pipeline_build——链式API构建DAG执行管线 | workforce.py:886-1190 | 无 | 无 | 完全没有 | fork/join原语化 |
| 8 | **共享内存同步**：_share_memory_with_agents/_sync_shared_memory/_collect_shared_memory——workforce级共享记忆池，worker产出自动回流 | workforce.py:1223-1462 | 无 | 无 | 完全没有 | 多agent信息共享的最小实现 |
| 9 | **恢复策略**：_apply_recovery_strategy——任务失败按策略恢复（非简单重试） | workforce.py:1828 | 无 | 无 | 完全没有 | |
| 10 | **嵌套Workforce**：add_workforce把子workforce挂为worker——编排递归组合 | workforce.py:3172 | 无 | 无 | 完全没有 | |
| 11 | **Worker双形态**：SingleAgentWorker（单agent接任务）/RolePlayingWorker（双agent角色扮演对话接任务）+add_workforce三类节点统一 | single_agent_worker.py role_playing_worker.py | 无 | 无 | 完全没有 | |
| 12 | **合成数据生成四件套**：cot_datagen（思维链数据）/**evol_instruct（指令进化——简单指令按6种进化算子变复杂）**/self_inproving_cot/self_instruct+source2synth（文档→合成QA） | datagen/ | 无 | 无 | 完全没有 | 政企私域数据微调刚需；evol_instruct是WizardLM经典方法的产品化 |
| 13 | **领域验证器**：math_verifier/physics_verifier/python_verifier——**生成结果用领域规则程序化验证**（数学符号计算验等、物理量纲、Python执行验） | verifiers/ | 无 | 无 | 完全没有 | 与RubricMiddleware(LLM裁判)互补：程序化验证更便宜更准 |
| 14 | **终止器**：response_terminator/token_limit_terminator——终止条件组件化 | terminators/ | 无 | 无 | 完全没有 | |
| 15 | **Workforce可观测三件**：workforce_logger（708行）/workforce_metrics/workforce_callback+stream callback链（worker流式chunk透传到workforce级） | workforce/ | 无 | trajectory扁平事件 | 部分有 | |
| 16 | **agent类型广度**：ChatAgent/CriticAgent/**KnowledgeGraphAgent**/MCP_Agent/MultiHopGenerator/RepoAgent/**RoleAssignmentAgent（动态分配角色）**/SearchAgent/TaskAgent | agents/ | 无 | 无 | 完全没有 | KnowledgeGraphAgent值得单独研究 |
| 17 | **RL环境**：environments/含tic_tac_toe/rlcards/multi_step——agent强化学习训练环境 | environments/ | 无 | 无 | 完全没有 | 学术线，低优先级 |

## 源码亮点
1. **Workforce=可干预的活系统**：modify_task_content（"这个任务理解错了，改成X"）+reorder_tasks+skip_gracefully三个API构成完整的运行时人工干预面——用户不只是审批者，还是编排协作者。
2. **TaskChannel的publisher/assignee双向查询**：发布者能查"我发的任务谁领了/谁还回来了"——任务流转全程可追溯。
3. **WorkflowMemoryManager**把"怎么编排"也变成记忆——第二次同类任务直接复用历史工作流结构，是比skill更结构化的复用。
4. 验证器哲学：能程序化验证的绝不靠LLM（math/physics/python三个便宜可靠的裁判）。

## 可复用设计
1. **P0：运行时任务干预面**（modify/reorder/skip/pause）——OpenMate聊天框+OpenSoul will/联合实现，直击长任务失控。
2. **P1：TaskChannel任务市场**（packet状态机+依赖+in-flight查询）——多agent任务分发的参考实现。
3. **P1：WorkflowMemory**（工作流记忆复用）——learn/新维度。
4. **P2：evol_instruct合成数据**——政企私域微调数据线。
5. **P2：程序化验证器**（math/python）——报告数字校验可先行（与docx-report-fix的财务校验思路同源）。

## grep确认
NONE：workforce / task_channel / pipeline_fork / workflow_memory / role_playing / evol_instruct / self_instruct / terminator / skip_gracefully / shared_memory
部分：decompose=ai_engine/cortex有任务分解概念（无依赖追踪/无分解后追加）；verifier=仅i18n字符串
