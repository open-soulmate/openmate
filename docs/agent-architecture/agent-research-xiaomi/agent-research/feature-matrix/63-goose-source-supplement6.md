# goose 第六补验：platform_extensions 最终清偿（summon/orchestrator/code_execution/apps）

轮次：深夜轮11（cron）。本地clone ~/agent-research-src/goose，读毕此前5轮完全未覆盖的四个文件共7667行（summon.rs 4385/orchestrator.rs 1081/code_execution.rs 1123/apps.rs 1078+tests）。至此 goose platform_extensions 10,039行目录100%读完。

grep确认（opensoul/src + openmate/src，关键词见文末）全部NONE或仅巧合命中。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **delegate async后台子agent**（task_id立即返回，load(task_id)收集，peek非阻塞查进度，cancel取消） | ❌ | ❌ | 完全没有 | P0。OpenSoul cortex加delegate(async=True)返回task_id+load/peek/cancel三个动作；约300行 |
| 2 | **peek进度三指标**：durable turn数（排除压缩脚手架）+idle时长+buffered通知数 | ❌ | ❌ | 完全没有 | 用户"不知道它在干嘛"的直接解；turn计数函数durable_assistant_turn_count 25行可抄 |
| 3 | **NotificationSink Buffer↔Emitter状态机**：后台任务通知先缓冲，主agent load等待时attach实时流式（yield_now×2防丢通知） | ❌ | ❌ | 完全没有 | "后台subagent工具调用在等待时实时可见"=可观测性刚需，~60行 |
| 4 | **Code Mode工具批量化**：全部MCP工具变成Deno沙箱内可调函数，N次工具调用批成1个execute_typescript脚本 | ❌ | ❌ | 完全没有 | P0省钱省轮次。OpenSoul MCP层加code-mode适配器（Python可先用子进程Node/Deno） |
| 5 | **tool_graph声明式DAG**：模型在execute_typescript参数里声明工具调用依赖图（depends_on） | ❌ | ❌ | 完全没有 | 可观测性：批量化后仍能审计每步工具调用结构 |
| 6 | **Deno/V8执行工程**：spawn_blocking+独立current_thread runtime+进程级V8互斥锁风险文档化+timeout/cancel/dispatch子token+500ms drain宽限+AbortOnDrop | ❌（OpenSoul mirror/sandbox.py是代码执行但无嵌套工具回调/无token级联取消） | 部分 | 关键工程缺失 | "挂死脚本不能楔住所有会话"——任何沙箱执行器照此实现 |
| 7 | **跨会话编排五工具**：list_sessions(六型会话+busy/loaded/idle三态)/view_session(first_last/summarize)/start_agent/send_message/interrupt_agent | ❌（sessions-client是UI列表） | ❌（sessions_api是HTTP API非agent工具） | 完全没有（agent侧） | agent能管理/查看/打断自己的会话家族——"会话即一等资产"第五方 |
| 8 | **send_message授权矩阵**：subagent只能发同parent的sibling；不能发parent/后代/跨树/自己；测试名即安全声明 | ❌ | ❌ | 完全没有 | 多agent通信的最小权限模型，测试用例整段可抄 |
| 9 | **工具面收缩第三方**：start_agent对SubAgent不进list_tools；delegate工具对SubAgent不暴露；SubAgent禁止再delegate | ❌ | 部分（无subagent概念） | 三方定案 | 与kilocode网络受限registry/goose ext_manager"SubAgent禁管理扩展"互证——权限设计首选"看不见">"拦截" |
| 10 | **Agent创建HTML应用**：create_app(PRD)→LLM结构化输出完整HTML→ui://apps MCP资源→沙箱窗口自开；iterate_app反馈循环(PRD随迭代更新=活文档)；平台通知app_created/updated/deleted | ❌ | ❌ | 完全没有 | agent生成可交互UI。OpenMate差异化机会；配合MCP Apps(第80方ms-agent-fw)实现 |
| 11 | **生成截断显式检测**：output_tokens>=max→错误"App content was truncated...Try simplifying" | ❌ | ❌ | 完全没有 | 2行判断，任何LLM生成落盘前都应加 |
| 12 | **subagent=markdown文件跨格式兼容**：.goose/agents+**.claude/agents**+.agents/agents，frontmatter(name/description/model) | ❌ | ❌（gene模板是YAML非目录扫描） | 完全没有 | 直接读Claude Code的agents目录——用户迁移零成本；与.agents/skills五方标准同构 |
| 13 | **delegate参数覆盖链**：provider/model/temperature/max_turns/extensions逐delegate覆盖，优先级env>params>recipe>config>session>provider默认+provider匹配过滤 | ❌ | 部分（多provider但无per-delegate覆盖） | 部分 | 子agent用便宜模型跑腿的经济学基础 |
| 14 | **每轮MOIM注入subagent目录+调用指引**（@name必调/描述匹配推断/async建议/Decompose→async→synthesize方法论） | ❌ | ❌ | 完全没有 | delegate工具描述本身就是多agent最佳实践prompt，整段可抄 |
| 15 | **后台任务生命周期工程**：最大并发5/完成TTL 600s/panic识别独立状态/5min等待上限detach/cancel 5s兜底abort/Drop取消全部 | ❌ | 部分（main.py asyncio.create_task是系统级非用户任务） | 完全没有 | 后台任务队列第八方 |
| 16 | **orchestrator懒继承**：子会话无provider时send_message自动注入父provider/model/extensions | ❌ | ❌ | 完全没有 | 小件，~20行 |
| 17 | **load模糊匹配**："Did you mean: x, y, z?" | ❌ | ❌ | 没有 | UX小件 |
| 18 | **三档ToolDisclosure**：Catalog(list_functions/get_function_details)/Filesystem(vfs签名+execute_bash探索)/Sidecar——按模型能力强弱选暴露方式 | ❌ | ❌ | 完全没有 | 弱模型用Catalog显式查、强模型直接Sidecar |
| 19 | **callback结果可见性过滤**：只回assistant可见text块，user-audience隐藏+structured/meta丢弃，JSON parse fallback | ❌ | ❌（无audience概念） | 没有 | 沙箱内回调不泄漏用户侧隐藏信息 |
| 20 | **顺序无关hash缓存**：callback configs排序后hash，double-checked locking重建CodeMode | ❌ | — | 工程范式 | 配置变更才重建，30行 |

## 源码亮点

- **summon.rs是goose多agent的完整答案**：delegate/load双工具+markdown agent文件+后台任务+通知流，一个扩展4385行实现了OpenSoul multi_agent.py(88行)缺的全部骨架。
- **测试即安全声明**（orchestrator）：`subagent_cannot_send_message_to_parent_user_session`/`subagent_cannot_send_message_across_delegation_trees`/`unknown_caller_cannot_persist_user_session`——授权矩阵每条规则一个测试名。
- **真实V8集成测试**：挂死脚本超时后正常脚本必须能跑（证明V8互斥锁已释放）——沙箱执行器的回归测试样板。
- **code_execution注释即教材**："pctx serializes all executions behind a process-wide V8 mutex, so a hung script would wedge code execution for every session: bound the wait with the extension timeout"。
- **summon对subagent强制GooseMode::Auto**并注释原因："until get_agent_messages forwards ActionRequired to parent, any approval mode will hang on the subagent's confirmation_rx"——HITL未打通前的诚实降级。

## 可复用设计（按优先级）

1. **async delegate+peek+load**（#1/#2/#3/#15）：OpenSoul cortex新增background_delegate工具族，任务表(session_id/status/result/turns/last_activity)，NotificationSink照抄Buffer↔Emitter。这是本轮最高价值发现——行业首个"后台subagent进度可观测"完整实现。
2. **Code Mode**（#4/#5/#6）：MCP工具→沙箱函数适配层，先支持Python沙箱版（子进程+JSON回调），tool_graph进trajectory。
3. **subagent markdown文件+.claude目录兼容**（#12）：OpenSoul skills/agents目录扫描直接支持读Claude Code的agents/，迁移获客功能。
4. **授权矩阵+工具面收缩**（#8/#9）：OpenSoul未来subagent体系照此定权限模型。
5. **截断检测**（#11）：立即可抄的2行护栏。

## grep确认明细（全部NONE/巧合）

opensoul: list_sessions|view_session|interrupt_agent|sibling|session_type（命中=sessions/trajectory API与test文件，UI侧非agent工具）；code_mode|execute_typescript|tool_graph|list_functions|deno（唯一命中=admin静态JS chunk巧合）；create_app|iterate_app|ui://apps|background_task|peek|delegate（delegate_task仅ai_engine.py路由声明，background_task命中=main.py系统级asyncio任务）。openmate: background_task|subagent|interrupt|create_app|peek（命中=app-shell/sessions-client UI字符串）。
