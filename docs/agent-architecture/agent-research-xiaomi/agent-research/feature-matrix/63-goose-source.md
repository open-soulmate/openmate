# goose（block→aaif-goose/goose, #63, 25k★）功能研究 — 源码级补验

> 源码：~/agent-research-src/goose（Rust workspace 17 crates；crates/goose/src核心；tarball部分截断但agents/permission/state_machine/gateway均完整）
> 背景：已捐给Agentic AI Foundation；上轮文档级研究的源码验证 + 新增发现
> ⚠️ 官方正把agent loop迁移到state_machine（GOOSE_STATE_MACHINE=1），双路径并行

## 功能清单（源码验证）

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **Agent Loop状态机**（state_machine/）：每个能力=一个Operation（ops_llm/ops_toolcalling/ops_compaction/ops_steer/ops_retry/ops_maxturns/ops_skills/ops_recipe/ops_tool_approval/ops_stop_hook/ops_entry_hook/ops_bang_shell/ops_doctor/ops_status/ops_project/ops_slash_command/ops_unknown_tool/ops_tool_pair_compaction），applied/not_applicable/ends_turn统一返回——**循环=有序操作管道，每步先问"我适用吗"** | 无 | cortex单体函数 | 完全没有 | 与DeerFlow 36 middleware互证（第2种形态：状态机Ops vs 洋葱中间件）；OpenSoul cortex重构二选一参照 |
| 2 | **ops_steer插话队列**：用户在agent执行中发消息→SteerQueue(VecDeque)排队→**在model与tool轮次之间注入为新user消息**（不打断当前工具执行）+HookEvent通知 | OpenMate聊天框任务运行时不能插话 | 无 | 完全没有 | 与Khoj interrupt_queue互证（第2方）；语义=排队插话非抢占，实现更安全 |
| 3 | **ops_tool_pair_compaction**：老的tool request/response配对批次→LLM summarize_tool_call压缩成摘要替换（cutoff控制保留多少近期pair）——**压缩粒度到"工具对"而非整段对话** | 无 | 无 | 完全没有 | context_mgmt/mod.rs 1348行；比整段compaction精准得多，token省在最肥的工具结果上 |
| 4 | **large_response_handler工具结果溢写**：>200k字符(GOOSE_MAX_TOOL_RESPONSE_SIZE)的文本→写临时文件→回复模型"结果太大已存到{path}，可用其他工具查看"；写文件失败则降级原文+warning | 无 | 无 | 完全没有 | **第五方互证工具溢出**（DeerFlow/deepseek/anything-llm/goose/…）；~80行立即可抄进limb/executor |
| 5 | **permission_judge LLM权限裁判**：构造`platform__tool_by_tool_permission`工具让模型批量判定"哪些tool request是只读操作"（SELECT/读文件=read，INSERT/DELETE/写=write）→**Smart模式下只读免确认**；判定结果缓存进readonly_tools(RwLock\<HashSet\>) | 无 | casbin用户RBAC | 完全没有 | "Ask Before"档位用LLM降噪的独创实现——权限弹窗疲劳的解法 |
| 6 | **extension_malware_check OSV扫描**：扩展激活前查OSV API的**MAL-*恶意软件公告**（npm/PyPI生态，fail-closed：查到即拒） | 无 | 无 | 完全没有 | MCP/插件供应链安全；与AutoGPT ClamAV互补（ClamAV扫文件、OSV扫包名版本） |
| 7 | **gateway/pairing设备配对**：IM网关（telegram等）用配对码+过期时间把外部用户绑定到本机agent（StoredPendingCode/SecretUpdate/吊销已导入码） | 无 | 无 | 完全没有 | "手机远程指挥家里agent"的信任建立流程；政企IM接入同样需要 |
| 8 | **moim轮次上下文注入**：每轮自动注入`<turn_context>`块（当前时间/工作目录/compaction状态/**turn budget剩余**/扩展上下文），并教模型"budget快用完时：少探索、批量工具调用、直接收尾" | 无 | 无 | 完全没有 | **turn budget意识**是长任务收尾质量的关键；~100行模板+注入 |
| 9 | **schedule_tool调度recipe**：agent自建定时任务=验证过的recipe文件+SchedulerTrait；validate_recipe_for_scheduling+大小上限MAX_SCHEDULE_RECIPE_BYTES | 无 | 无 | 完全没有 | 与agent-zero scheduler/cron互证——"agent给自己定闹钟" |
| 10 | **gen_ai_telemetry+otel**：按OpenTelemetry **GenAI语义约定**埋点（chat span等） | 无 | metrics_api一处opentelemetry | 部分有 | 与langfuse/openllmetry互证——直接采用GenAI约定别自造 |
| 11 | **tool_confirmation_coordinator+router**：确认请求统一协调（多工具并发确认防竞态）+按路由分发到对应UI/终端 | 无 | 无 | 完全没有 | 工具审批的并发正确性细节 |
| 12 | **final_output_tool**：最终答案必须通过专用工具提交（结构化交付物出口） | 无 | response工具类似 | 部分有 | 与LobeChat"散文回答不算提交"互证 |
| 13 | **doctor模块**（ops_doctor+doctor.rs）：运行时自诊断op | OpenMate system-doctor页（系统诊断） | 无 | 部分有 | agent自身健康的doctor op |
| 14 | **hints系统**（load_hints+import_files）：.goosehints文件渐进加载 | 无 | 无AGENTS.md类约定加载 | 完全没有 | 与CONVENTIONS.md/AGENTS.md生态合流 |
| 15 | **platform_extensions平台扩展十件套源码确认**：extension_manager动态增删+platform_tools+prompt_manager（insta snapshot测试锁定prompt输出） | 无 | 无 | 完全没有 | **用snapshot测试锁prompt**是防prompt回归的好工程实践 |
| 16 | **subagent_execution_tool+notification_events(TaskStatus)**：子agent执行工具+任务状态通知事件 | delegate_task类似 | cortex/multi_agent_coord有协调 | 部分有 | 通知事件粒度可参考 |
| 17 | **elicitation.rs暂停征询**+oauth/（DCR动态客户端注册）+**dictation语音输入** | 无 | 无 | 完全没有 | HITL征询+OAuth基建 |

## 源码亮点

- **Operation协议三态**：每个op返回 applied / not_applicable / ends_turn——加能力=加一个op文件+注册顺序，主循环零改动
- **permission_judge把"判定只读"外包给LLM**：不写规则引擎，一个结构化工具调用解决；结果缓存后同名工具不再问
- **prompt snapshot测试**（insta .snap文件）：prompt改动必须显式更新快照——"改prompt静默劣化"的CI防线
- **steer与infection_check同构**：都是"在轮次边界安全地插入外部信号"（用户指令/安全verdict）

## 可复用设计

1. **工具结果溢写**（large_response_handler ~80行）→ limb/executor，第五方互证P0
2. **turn budget轮次上下文**（moim）→ cortex每轮注入剩余预算+收尾指令，长任务质量直接提升
3. **LLM只读判定+缓存**（permission_judge）→ OpenSoul工具审批的第一道降噪
4. **工具对粒度compaction**（ops_tool_pair_compaction）→ 比整段摘要省token且不丢近期细节
5. **OSV MAL扫描** → api/marketplace.py skill同步时fail-closed安全检查
6. **prompt snapshot测试** → OpenSoul gene/templates回归防线
