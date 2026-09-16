# goose 源码补验（第二轮）—— 会话导入/Steer/工具确认/Elicitation/Apps/调度器

> 源码：~/agent-research-src/goose/crates/goose/src（本地clone，逐文件精读）
> 研究日期：2026-09-17 深夜轮7（cron）
> 前置：63-goose-source.md（17项）+ 63-goose-source-supplement.md（18项）——本轮为第三次补验，专攻前两轮未覆盖目录

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | 🔴 **跨agent会话导入**：sniff格式（首行JSON探测：Codex的`session_meta`/Pi的`type:session`/Claude Code的`sessionId`）→统一转换为goose原生Session JSON走import_session管线。Claude Code转换器410行：tool_use/tool_result/thinking(带signature)/image block全映射、cache token归并（input+=cache_read+cache_write）、Unicode tag清洗（tag char剥除防UI注入）、ai-title或首行80字符摘要做会话名 | session/import_formats/{mod,claude_code,codex,pi}.rs（1463行） | 没有 | 没有 | 完全没有 | **P0**。"用了Claude Code/Codex的用户迁移进来"=获客功能。OpenSoul会话表定义好canonical schema，写Claude Code `.jsonl`（~/.claude/projects/）转换器即可，格式文档就是goose这份代码 |
| 2 | **MCP Apps HTML应用协议完整实现**：HTML内嵌`<script type="application/ld+json">`JSON-LD元数据（name/description/width/height/resizable/mcpServers）+`application/x-goose-prd`产品需求文档script——**app自描述打包在HTML自身里**，fetch_mcp_apps从MCP ui://resources拉取+补默认窗口属性 | goose_apps/app.rs（313行）+cache.rs（434行） | 没有 | 没有 | 完全没有 | P1。与ms-agent-fw轮的MCP Apps发现互证（第2方）——OpenSoul mcp/server.py已装SDK，实现read_resource+ui://渲染即可 |
| 3 | 🔴 **运行中Steer插话队列**：用户在agent干活时输入的消息进VecDeque队列，state machine的SteerOperation在"turn间隙"（ends_turn或最后角色=Tool）批量drain注入，每条走UserPromptSubmit hook+`Message::with_steer`标记（前端可区分"插话"与"原始指令"） | agents/state_machine/ops_steer.rs（78行） | 没有 | 没有 | 完全没有 | **P0**。与LibreChat"steering中途插话"+CowAgent/Khoj"运行中消息注入"三方互证。78行可整体移植为cortex的注入Op |
| 4 | **工具确认持久化决策**：ToolConfirmationRequest（id/tool_name/arguments/prompt）挂在消息流，persist_tool_confirmation_decision写一条invisible user消息（ActionRequiredData::ToolConfirmationResponse）——**审批决定是一等消息**，重放/续跑时从消息历史重建（ApprovalState::from_messages），防重复确认（已响应/已有结果则拒绝），幂等（同decision重放Ok/异decision报错） | agents/state_machine/tool_confirmation.rs（117行）+ops_tool_approval.rs（295行） | 部分（acp-approval-modal.tsx仅UI事件） | 没有 | 部分有 | **P0**。"审批=消息"设计让审批历史天然随会话走，比独立审批表优雅——OpenSoul照此实现 |
| 5 | **工具执行中Elicitation**：工具运行中request_and_wait→ActionRequired消息（带JSON schema）经per-(session,tool_call) channel推前端→用户填表回Accept(Value)/Decline/Cancel三态→oneshot回注工具继续跑。超时+PendingResponseClaim互斥领取（防双提交） | action_required_manager.rs（657行） | 没有 | 没有 | 完全没有 | P0。与MCP elicitation协议词汇一致（accept/decline/cancel），HITL词汇收敛再+1方 |
| 6 | **AgentManager会话LRU+创建锁工程细节**：LRU 100会话驱逐恢复（restore_provider_from_session+load_extensions_from_session+recipe重放）；per-session创建锁防并发双建（Arc::strong_count门控prune防泄漏——注释记录了为什么先drop guard再prune）；cancel token原子注册（busy拒绝第二请求）；驱逐key显式回收锁 | execution/manager.rs（899行） | 部分（OpenMate sessions驱逐） | 没有 | 部分有 | P1。OpenSoul会话缓存化时的参考实现，注释即并发教材 |
| 7 | **调度器run_now/pause/unpause/kill_running_job/update_schedule**：scheduled job全生命周期控制+recipe快照复制（防配置漂移）+**保留原目录路径**（sub-recipe/template include相对路径解析不错乱）+get_running_job_info | scheduler.rs（1792行） | 没有 | 部分（hermes_cron CRUD） | 部分有 | P1。OpenSoul hermes_cron补run_now/kill/pause三接口即达行业基线 |
| 8 | **RepetitionInspector完整实现**（前轮已提，本轮全文确认）：连续同(name+args)调用计数超限Deny（finding_id=REP-001, confidence=1.0），inspect时clone状态试算不污染真状态 | tool_monitor.rs（135行） | 没有 | 没有 | 完全没有 | P0。135行可整体抄进OpenSoul immune |
| 9 | **GOOSE_STATE_MACHINE双轨迁移**：旧agent.rs循环与新state_machine/并行（env开关），每个能力=一个Op（ops_llm/toolcalling/skills/recipe/compaction/retry/maxturns/steer/status/bang_shell/doctor/entry_hook/stop_hook/exit_on_error/project/slash_command/unknown_tool/工具对压缩）统一applied/not_applicable/ends_turn三态——**迁移期双实现+逐Op可测**是大型agent重构的工程范本 | agents/state_machine/（4818行，25个Op） | — | cortex单体 | 参照 | OpenSoul cortex若重构为Op链，照此"双轨+三态返回"模式 |
| 10 | **SessionExecutionMode三型**：Interactive（聊天）/Background（scheduled）/SubTask{parent_session}——会话天生知道自己是前台、定时还是子任务 | execution/manager.rs测试用例 | 没有 | 没有 | 完全没有 | P1。OpenSoul会话表加mode+parent_session_id两列 |

## 源码亮点
- import_formats的**嗅探式格式探测**（首行启发式+fallback扫描前5行）：不依赖用户声明格式，丢文件进去就行。
- Claude Code转换器的**Unicode tag清洗测试**（`visible\u{E0041}世界`→`visible世界`）：导入路径也是攻击面。
- tool_confirmation的**"决策即消息"**：确认响应写进conversation而非旁路状态，重放自然重建——比FastGPT providerState更彻底。
- AgentManager创建锁注释把Arc::strong_count竞态讲成教科书——"为什么先drop再prune"记录在案。
- goose_apps的PRD script：**app把自己的产品需求文档嵌在HTML里**——agent改app时能读到原始需求。

## 可复用设计（Top-5）
1. **跨agent会话导入**（#1）：OpenSoul做Claude Code/Codex导入器，迁移成本极低（格式已被goose逆向好）。
2. **Steer插话队列**（#3）：78行，用户"边跑边说"的核心体验。
3. **审批决策持久化为消息**（#4）：HITL数据模型定案参照。
4. **Elicitation三态回注**（#5）：工具运行中向用户要信息的标准协议。
5. **调度器kill/pause/run_now**（#7）：定时任务可控性补齐。
