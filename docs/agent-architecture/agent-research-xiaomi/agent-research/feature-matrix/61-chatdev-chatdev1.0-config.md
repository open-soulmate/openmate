# OpenBMB/ChatDev (#61, 26k★) chatdev1.0分支 — 配置级深读（虚拟软件公司引擎）

> 源码状态：⚠️ **网络受限**——chatdev1.0分支tarball两次900s/1500s截断（仓库含大量gif资产），部分解压获得**CompanyConfig/全部核心配置**（4套ChatChain）+MultiAgentEbook框架页。Python引擎（chat_chain.py/phase.py/inception prompt）待下轮补验（第三次下载后台进行中）。
> 配置即架构：ChatDev1.0的全部编排设计都在这4套JSON里，Python只是解释器。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **ChatChain声明式流水线**（ChatChainConfig.json）：phase数组，每步=phaseType+max_turn_step+need_reflect | 无 | will/dag_planner是任务DAG非对话流水线 | **完全没有** | "多agent流程=纯JSON配置"——OpenSoul will/可定义`ChainConfig`（phase/角色/轮次/反思开关全外置），改流程不改代码 |
| 2 | **ComposedPhase嵌套循环**：CodeCompleteAll=cycleNum:10内含CodeComplete；CodeReview=cycleNum:3内含[CodeReviewComment→CodeReviewModification]；Test=cycleNum:3内含[TestErrorSummary→TestModification]——**"评审-修改"是循环子图不是单步** | 无 | multi_agent.py 88行硬编码线性流水线 | **完全没有** | 与AgentScope SOP verifier-retry互证（第2方）：**审查循环次数声明在配置里**，耗尽即继续（不失败） |
| 3 | **`<INFO>`终止协议**：每个讨论phase的prompt末尾约定"达成一致时只回一行`<INFO> 结论`"——两agent对话的确定性终止条件，解析`<INFO>`前缀即提取结构化结果 | 无 | 无 | **完全没有** | 与Langroid done_sequence字符串DSL互证（第2方，那边更泛化）。OpenSoul multi_agent对话缺终止协议——"讨论到什么时候停"目前靠max_turn硬切 |
| 4 | **PhaseConfig角色配对**：每phase固定assistant_role+user_role双agent对话（CPO↔CEO需求分析、Reviewer↔Programmer评审），prompt=字符串数组+{task}{codes}占位注入 | 无 | 无 | **完全没有** | "阶段=一对角色+一段prompt模板"是最小multi-agent单元 |
| 5 | **RoleConfig角色即prompt数组**：9个角色（CEO/CTO/CPO/CHRO/Reviewer/Tester/Programmer/CCO/Counselor）各=系统prompt段落数组，`{chatdev_prompt}`注入全局人设 | 无 | gene/模板非角色化 | **部分有** | OpenSoul gene/升级为Role对象（name+prompt_segments+职责描述） |
| 6 | **Human变体链**（Human/ChatChainConfig.json）：标准链插入HumanAgentInteraction+CodeReviewHuman两个HITL phase——**同一引擎，HITL只是chain配置变体** | 无 | 无 | **完全没有** | HITL不改引擎只换配置——与Flowise HumanInput节点/Langflow checkpoint互证 |
| 7 | **Incremental变体链**：增量开发模式独立配置 | 无 | 无 | **完全没有** | "同一任务多种执行策略=多份chain配置" |
| 8 | **产品形态协商phase**（DemandAnalysis）：CEO↔CPO先讨论"产物是PPT/Word/网页/应用/dashboard哪种modality"，再进技术链——**产物形态是显式决策步骤** | 无 | 无 | **完全没有** | 售前场景直击：接需求先定交付物形态。OpenSoul intent/可加"产物形态协商"步骤 |
| 9 | **代码产出格式契约**：所有Coding类phase强制markdown代码块格式（FILENAME/```LANGUAGE/DOCSTRING/CODE四token模板），且明令"No placeholders, no TODO" | 无 | 无 | **部分有** | OpenSoul生成代码的输出格式约束可对齐（防截断/防TODO桩） |
| 10 | **CodeReview六条法规**（写进prompt的检查清单）：import齐全/方法全实现/必要注释/无bug/符合任务/**查逻辑不只查错误**——每次只提"最高优先级的一条comment" | 无 | 无 | **完全没有** | **"一次只提一个最重要问题"**是防评审发散的关键技巧，可移植进cortex自检 |

## 源码亮点（配置级）
- **整个虚拟公司=3个JSON**：Chain（流程）+Phase（阶段prompt）+Role（角色prompt）——关注点分离极致，改公司=改配置
- ComposedPhase的cycleNum语义：循环N轮"挑毛病→修"，**N耗尽不是错误而是继续前进**（工程上防完美主义死循环）
- TestErrorSummary→TestModification两步：先"定位总结bug"再"修bug"——**错误分析与修复分离成两个phase**，比一把梭质量高
- Human/Default/Art/Incremental四套配置=同一引擎四种产品形态（默认/HITL/GUI美术/增量）

## 可复用设计
1. **OpenSoul will/chain_config.py**（P0参考）：pydantic定义Phase(phase_type/max_turn/need_reflect/roles/prompt_template)+ComposedPhase(children/cycle_num)，YAML/JSON加载——multi_agent.py的88行硬编码升级为声明式
2. `<INFO>`终止协议：5行解析器，multi_agent对话加确定性终止
3. "评审-修改"循环子图：CodeReview六条法规+一次一条comment+cycleNum=3——直接抄进代码生成工作流
4. 产物形态协商phase：售前agent工作流的第一步
5. 行业教训：26k★项目主线转向2.0零代码平台（上轮已记），但**1.0的声明式配置设计仍是最优雅的multi-agent编排参照之一**——配置与引擎分离的教科书
