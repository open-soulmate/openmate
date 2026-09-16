# block/goose (#63, ~25k★, Rust) — 源码补验：recipes引擎/scheduler/security检查器栈/hints系统

> 补验轮：上轮63-goose-source.md已覆盖17项（Ops状态机/large_response_handler/turn budget/permission_judge等）。
> 本轮补验上轮待办：recipes引擎源码、scheduler、以及**上轮完全没发现的security/检查器栈（本轮最大收获）**。
> 源码：~/agent-research-src/goose（crates/goose/src完整）

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **ToolInspectionManager可插拔检查器栈**（trait ToolInspector：inspect()返回Allow/Deny/RequireApproval+confidence+finding_id，按add顺序运行，SecurityInspector最高优先级先跑） | 无 | immune/仅输入侧正则 | **完全没有** | **本轮P0参照**。OpenSoul immune/仿此定义`ToolInspector`协议，把现有正则、下述egress/adversary全部挂成检查器，统一Deny/Ask/Allow三态出口 |
| 2 | **EgressInspector出网目的地提取**（555行）：正则从命令提取URL/git@remote/s3://等目的地→outbound/inbound分类→域名级管控 | 无 | 无 | **完全没有** | 政企数据防泄漏刚需。patterns.rs(588行)可整体参考移植为immune/egress.py |
| 3 | **AdversaryInspector LLM裁判**（747行）：`~/.config/goose/adversary.md`文件激活——frontmatter选tools(默认shell)+正文规则；把最近4条用户消息+待执行命令交给独立LLM按规则BLOCK/ALLOW；**fail-open**（裁判失败放行）；默认规则内置（数据外泄/破坏性/恶意软件/提权/下载执行远端脚本五条BLOCK，"偏ALLOW"） | 无 | 无 | **完全没有** | 与agent-zero _infection_check输出侧审计门互证（第2方）。OpenSoul immune缺"可配置的LLM安全裁判"，规则文件化让用户零代码定制 |
| 4 | **PromptInjectionScanner双引擎**（scanner.rs 718行）：PatternMatcher正则+ML分类器（HuggingFace Text Classification API协议，command/prompt两个独立endpoint，5s超时，3路并发扫描，pattern+ML置信度融合DetailedScanResult） | 无 | immune/intrusion.py仅正则 | **部分有** | ML分类器可插拔（endpoint可指向本地小模型）——OpenSoul正则引擎升级路径 |
| 5 | **Recipe调度器**（scheduler.rs 1792行）：tokio-cron-scheduler+**调度时校验recipe**（validate_recipe_for_scheduling 1060行：schema+参数模板变量对齐+json_schema校验）+**recipe快照复制**到scheduled_recipes/（源文件改了不影响已排任务，保留recipe_base_dir让子recipe/模板include相对源树解析）+paused/currently_running/current_session_id状态+JSON持久化+CancellationToken取消 | 无 | 无（Hermes cron是外置的） | **完全没有** | OpenSoul will/缺"定时任务=recipe快照"设计——**防"改配置影响运行中任务"**；O_NONBLOCK\|O_NOFOLLOW防fifo/symlink攻击的文件打开细节直接抄 |
| 6 | **Recipe引擎minijinja模板**（template_recipe.rs 547行）：Strict未定义行为+禁loader（防SSTI）+**不可解析复杂变量降级为raw块**（filter_unparseable_variables）+内置recipe_dir参数+1MB上限 | 无 | gene/模板非结构化 | **部分有** | OpenSoul gene/可升级为schema化Recipe(instructions/prompt/extensions/settings/activities/parameters/response json_schema) |
| 7 | **.goosehints递进式目录上下文**（hints/ 2455行）：CONTEXT_FILE_NAMES可配（默认.goosehints+AGENTS.md）；**SubdirectoryHintTracker监听工具参数里的路径→新目录的hints自动加载注入**（agent走到哪个子目录就吃哪个目录的规则）；@file引用展开带预算（深度3/64次操作/1MB上限/4KB git pointer）+gitignore过滤 | 无 | 无 | **完全没有** | 与Continue Rules条件激活互证。OpenMate workspace无"子目录级AGENTS.md自动加载"——monorepo刚需 |
| 8 | **Nostr去中心化会话分享**（nostr_share.rs）：session加密(NIP-44)发布到Nostr relay(默认damus/primal/nos.lol)+nevent+解密密钥deeplink；Publisher/Fetcher trait抽象 | 无 | 无 | **完全没有** | 有趣但政企优先级低；"无服务器分享会话"是开源社区差异化点 |
| 9 | **RepetitionInspector重复调用拦截**（tool_monitor.rs 135行）：连续相同(name+args)工具调用超max_repetitions→Deny，finding_id=REP-001 | 无 | 无 | **完全没有** | 5行核心逻辑；与Khoj组合签名检测/anything-llm loop-detect互补（那两个是检测，这个是**拦截**）。立即可抄 |
| 10 | **PermissionInspector缓存非只读判定**：LLM判readonly后，非readonly工具自动update_smart_approve_permission(AskBefore)——**"危险工具"自动降级为需审批** | 无 | 无 | **完全没有** | 与上轮permission_judge互补的安全闭环：只读免审、非只读自动转入审批名单 |
| 11 | **会话导出/import三格式**（session/export_markdown.rs+import_formats/）+chat_history_search全历史搜索+session_naming自动命名 | OpenMate有聊天记录 | 无API | **部分有** | OpenSoul sessions缺export/search API |
| 12 | **doctor.rs自诊断**（320行）：环境体检命令 | 无 | vital/运维模块 | **部分有** | 对齐"agent doctor"输出格式 |

## 源码亮点

- **检查器栈是本轮最重要的架构参照**：`agent.rs:776-780`初始化顺序=Security→Egress→Adversary→Permission——安全检查分层明确：模式匹配(快/免费)→出网提取(确定性)→LLM裁判(贵/可选)→权限(交互)。**OpenSoul immune/应照此分层重构，而不是散落的正则函数**
- InspectionResult结构统一：action(Allow/Deny/RequireApproval)+reason+confidence+inspector_name+finding_id——**每个安全决策可溯源可审计**（finding_id如REP-001，可积累成安全报告）
- scheduler对recipe文件的防御性打开（O_NONBLOCK防管道挂死+O_NOFOLLOW防symlink+regular file校验+1MB上限）是Rust安全工程范本
- AdversaryInspector默认规则的措辞值得抄："Err on the side of ALLOW — only block truly dangerous things"（防误杀导致agent瘫痪）
- hints的@file展开有完整预算体系（ExpansionBudget操作数+字节数双限额，exhausted后静默截断）——**任何"把文件内容塞进prompt"的功能都该有这个**

## 可复用设计

1. **immune/inspector协议**（P0）：Python protocol `inspect(tool_request) -> InspectionResult`，现有正则包装成PatternInspector，新增EgressInspector(域名提取)、RepetitionInspector(连续重复)、AdversaryInspector(LLM裁判，配置文件激活fail-open)
2. **EgressInspector域名提取正则组**（URL/git@/s3://三类起步）~100行可移植
3. **scheduler的recipe快照语义**：定时任务创建时复制内容，不引用活文件——防配置漂移
4. **SubdirectoryHintTracker**：OpenMate workspace监听文件树操作，进入新目录自动读取并注入该目录的AGENTS.md/OpenMate.md
5. RepetitionInspector 135行整体可抄为Python

## 补验第二批（同轮追加）

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 13 | **ACP handoff memo预算化交接**（acp/handoff.rs 618行）：跨agent会话交接时历史不全量重放——memo预算=min(上下文30%, 64k tokens)−当前turn已花token；**最近5个工具交换保留原文，更早的redacted成占位符**；图片按1600token/张计入；<32token的截断消息直接丢弃；footer明确指示"只用于继续对话，别当新任务" | 无 | api/agent_collaboration.py有handoff_context（关键词overlap过滤） | **部分有** | OpenSoul handoff升级为**token预算化**（goose的5个常量全部可抄：0.30/64k/1600/5/32）——比关键词过滤可控得多 |
| 14 | **AgentManager会话LRU**（execution/manager.rs）：LruCache(100会话)+**per-session创建锁**（缓存miss时先拿锁再做provider恢复/MCP扩展初始化，防并发重复创建）+per-session CancellationToken | OpenMate无 | sessions驱逐已有 | **部分有** | "每会话一把创建锁"是多并发会话的关键工程细节 |
| 15 | **Plugin生命周期**（plugins/ 1495行）：install/update/**auto_update(24h间隔)**+安装元数据.goose-plugin-install.json+全局/per-project双安装目录+插件自带skill导入(ImportedSkill) | OpenMate plugin系统 | plugin_loader已有 | **部分有** | 缺auto-update与安装元数据溯源 |
| 16 | **本地Whisper听写**（dictation/ 2406行）：providers抽象+whisper本地转写——语音输入不是TTS输出 | 无 | voice=tts输出 | **完全没有** | 语音输入线（与openai-agents-js realtime互补：那是云端实时，这是本地转写） |
| 17 | **`.agents/skills/`跨agent技能目录标准**：goose sources.rs全局`~/.agents/skills/`+项目`<project>/.agents/skills/`；**ChatDev 2.0仓库同样采用`.agents/skills/<name>/SKILL.md`结构**——两家独立采用同一约定，与OpenHands extensions的SKILL.md frontmatter规范合流 | OpenMate有skills | skills.py已有 | **部分有** | **行业信号**：SKILL.md+frontmatter+目录包正在成为事实标准，OpenSoul skill格式应对齐（triggers/描述frontmatter）而非自创 |
| 18 | **Sources CRUD over ACP**（sources.rs 2164行）：skill/project/agent三类"source"通过ACP custom method做文件系统CRUD（parse_frontmatter泛型+mutable类型白名单） | 无 | 无 | **完全没有** | "agent通过标准协议管理自己的技能/项目文件"——OpenMate可让OpenSoul通过ACP暴露skill CRUD |
