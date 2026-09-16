# goose 第四次补验：context_mgmt全文 + import_formats嗅探细节 + subagent通知事件

研究时间：2026-09-17 深夜轮8（cron）
源码：~/agent-research-src/goose（本地clone，零带宽）
前序：63-goose-source.md（17项）、63-goose-source-supplement.md（18项）、63-goose-source-supplement2.md（10项）
本轮专攻前三轮未覆盖：crates/goose/src/context_mgmt/mod.rs（1348行，前590行功能部分全文精读，其余为测试）、crates/goose-context-management/（独立crate 1156行，lib/structured全文）、session/import_formats/mod.rs（223行全文）、subagent_execution_tool/notification_events.rs（222行全文）

## 功能清单

| # | 功能 | 源码依据 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | **结构化压缩摘要（9段式JSON）** | structured.rs 484行：user_intent/technical_concepts/files(含key_code)/errors_and_fixes/problem_solving/user_messages/pending_tasks/current_work/next_step | 没有 | 没有（sessions只有compacted=0标志位） | 完全没有 | P0。压缩不再输出自由文本而是schema化JSON→minijinja模板渲染。字段列表可直接抄 |
| 2 | **宽容反序列化** | structured.rs：lenient_string_list/stringify_lenient——模型给object/array就stringify，files给纯string转path-only条目，"一个坏字段不能丢掉整份好摘要" | — | — | 完全没有 | 结构化输出的健壮性配套，pydantic validator抄这段逻辑 |
| 3 | **多候选JSON提取** | StructuredSummary::parse：按`</analysis>`终结符后找```json fence（后到先试）→整体首对象，逐个find_map直到一个非空 | — | — | 完全没有 | LLM输出JSON不可靠时的通用提取器，可独立成util |
| 4 | **工具对级压缩（tool-pair summarization）** | context_mgmt/mod.rs：compute_tool_call_cutoff=(3×effective_limit/20000).clamp(10,500)自适应阈值+批量10个/次+保护最近N个+**同消息sibling工具ID分组去重**（防重复摘要调用）+后台tokio::spawn不阻塞主循环 | 没有 | 没有 | 完全没有 | P0。压缩粒度到"工具request/response对"（旧发现的工程细节全貌本轮补齐：sibling分组是并发工具调用场景必须） |
| 5 | **压缩后保留预算双指标** | CompactionResult.retained_context_tokens vs usage.output_tokens分开计——"摘要LLM输出的可计费token"≠"压缩后agent可见上下文token" | — | trajectory/token_meter只有总量 | 完全没有 | 计费与上下文管理分离，cortex压缩出口照抄 |
| 6 | **可见性双轴元数据** | MessageMetadata：user_visible×agent_visible四象限。压缩后原消息=仅user可见（用户还能回看历史）；摘要+continuation=仅agent可见（模型只见摘要） | OpenMate消息无双轴 | 没有 | 完全没有 | "用户看到完整历史、模型看到摘要"的优雅实现，OpenMate消息表加两个bool即可 |
| 7 | **保留用户消息+turn-context携带** | 非手动压缩时找最后一条text-only用户消息保留重放；压缩边界携带本turn的context事件（id清空+created取max防时间戳回跳——注释记录"存储按created重排，副本必须保住追加位置"） | — | — | 完全没有 | 压缩后续跑质量的细节，注释即教材 |
| 8 | **三态continuation文案** | CONVERSATION_CONTINUATION_TEXT/TOOL_LOOP_CONTINUATION_TEXT/MANUAL_COMPACT_CONTINUATION_TEXT——按"压缩发生在对话中/工具循环中/用户手动"切换引导语（工具循环态明确"Continue calling tools"） | — | — | 完全没有 | 三段文案可直接抄进cortex |
| 9 | **会话导入嗅探（detect_format）** | import_formats/mod.rs 222行全文：首行JSON探测——session_meta=Codex/type:session+version(or cwd+id)=Pi/sessionId+type=claude Code；全文working_dir=goose原生；fallback扫前5行sessionId | 没有 | 没有（轮7已确认NONE，本轮补齐嗅探细节） | 完全没有 | 已列P0（会话可迁移行业定案）。嗅探函数50行可抄 |
| 10 | **legacy token字段升级** | nest_legacy_token_fields：旧版平铺input_tokens等自动折进usage/accumulated_usage嵌套对象，导入路径与JSONL迁移共用 | — | — | 完全没有 | 自家格式演进的向后兼容范式 |
| 11 | **subagent任务执行通知事件** | notification_events.rs 222行全文：TaskExecutionNotificationEvent三型（line_output逐行输出/tasks_update五态统计+每任务current_output/tasks_complete含success_rate）经MCP notification推送 | OpenMate无subagent进度流 | 部分有：success_rate聚合统计散布在skill_learner/executor/will/trajectory/healer（grep 8命中）——但**无逐行输出流+无任务级五态事件** | 部分有 | 直击用户"我都不知道他们在干嘛"痛点：子agent逐行输出+统计作为一等事件推给前端，schema可整体抄 |
| 12 | **CompactionModel/TokenEstimator trait抽象** | goose-context-management crate三层API（summarize/compact trait式）+uniffi绑定暴露给Python/Kotlin | — | — | 完全没有 | "压缩引擎独立crate+跨语言绑定"=OpenSoul压缩模块的组织方式参照 |

## 源码亮点

- **compaction是独立crate**（goose-context-management 1156行）：summarize/compact/trait三层，模板minijinja可换，model/estimator可插拔——压缩从"函数"升级为"子系统"，这是OpenSoul cortex该有的形态
- threshold配置链：GOOSE_AUTO_COMPACT_THRESHOLD（默认0.8，0或≥1=禁用）+provider.manages_own_context()短路（如Responses API自管上下文则跳过）——**"谁负责上下文"是provider能力声明**
- do_compact前过滤turn_context消息（"陈旧per-turn状态不进摘要"）
- tool-pair摘要prompt极简（"回复一条消息描述发生了什么，如'A call to github was made to get the project status'"）——工具结果压缩不需要精细prompt
- 群组去重工程：同一条消息里多个并行工具调用→request_ids==response_ids校验→message_ids排序后HashSet去重——并发工具压缩的正确性细节
- 导入格式嗅探的顺序设计：特定标记（session_meta）优先于通用标记（sessionId），最后全文解析，fallback扫5行——嗅探器防误判的分层
- TaskCompletionStats.success_rate直接算好百分比（不是让前端算）——事件schema即最终展示需求

## 可复用设计

1. **9段式结构化摘要schema**（#1）：OpenSoul hippo/cortex压缩出口直接用，prompt=字段说明，输出=JSON，渲染=模板——比自由文本摘要可控且可增量裁剪（"每列表按重要性排序，消费方可从尾部截断"注释即协议）
2. **subagent通知事件三型**（#11）：OpenMate做subagent面板的事件契约照抄——line_output给tail日志流，tasks_update给进度条，tasks_complete给成功率卡片
3. **可见性双轴**（#6）：OpenMate消息模型升级最小改动方案
4. **宽容JSON提取器**（#2+#3）：独立util，所有"让模型输出JSON"的功能都用得上
