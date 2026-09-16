# goose 第五补验：platform_extensions进程内MCP扩展栈（轮10，源码级）

研究方式：本地clone ~/agent-research-src/goose 全文精读 crates/goose/src/agents/platform_extensions/（10,039行，12个扩展；此前5轮全部只覆盖crates/goose/src/顶层，**这整个目录是新大陆**）。读毕：mod.rs(306)+todo.rs(202)+chatrecall.rs(481)+tom.rs(117)+scheduler.rs(75)+summarize.rs(559)+ext_manager.rs(632前350)；summon.rs(4385)/orchestrator.rs(1081)/code_execution.rs(1123)/apps.rs(1078)/analyze.rs下轮。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | 🔴 **平台扩展=进程内MCP服务器注册表**（mod.rs）：PlatformExtensionDef{name,default_enabled,unprefixed_tools,hidden,client_factory}——平台能力(todo/recall/scheduler/summon等)全部包装成MCP client实现McpClientTrait，与外部MCP同一接口同一执行路径 | 无 | mcp/server.py有MCP基础 | 部分有 | "平台能力与三方工具同协议"=OpenSoul器官工具化范式；hidden/unprefixed两个flag值得抄 |
| 2 | 🔴 **agent自管理扩展**（ext_manager.rs 632行）：search_available_extensions（"缺工具时先搜可用扩展"写进instructions）→manage_extensions enable/disable+**SubAgent禁止管理扩展**（防子agent给自己扩权）+资源读写直通 | 无 | 无 | 完全没有 | 自主性×安全边界的干净切法：可发现可启停但子agent不行 |
| 3 | 🔴 **chatrecall=跨会话检索工具**（chatrecall.rs 481行）：search（关键词/日期区间/按session分组按新近排序/排除当前会话）+load（session首尾各3条摘要）；**audience双可见性**：历史结果打Annotations audience=[Assistant]——**agent看得见、用户看不见**（测试断言"agent-only secret marker不出现在user投影"） | /api/sessions/search仅UI侧 | 无 | 部分有 | 与kilocode recall互证升两方；audience标注是OpenSoul消息模型缺的维度 |
| 4 | **会话类型scoped检索**：ACP会话只搜ACP、User会话搜User+Scheduled——不同界面的历史互不泄漏 | 无 | 无 | 没有 | 20行 |
| 5 | 🔴 **todo扩展=会话持久todo+每轮注入**（todo.rs 202行）：todo_write整写50k字符上限→存session.extension_data→**get_moim()每轮自动注入当前todo**（空时注入"接到任务立刻更新todo"的自我提示）——todo跨compaction存活 | OpenTodo仅前端store | 无 | 部分有 | "todo是模型的工作记忆"而非UI清单；空态注入自我指令是神来之笔 |
| 6 | **tom（Top Of Mind）**（tom.rs 117行）：零工具纯注入扩展——GOOSE_MOIM_MESSAGE_TEXT/FILE环境变量→64KB有界读取+UTF-8安全截断→每轮注入 | 无 | 无 | 没有 | 用户侧"每轮都得记住的话"最简实现，117行 |
| 7 | 🔴 **summarize工具=确定性收集+单次LLM问答**（summarize.rs 559行）：paths递归展开（**拒绝对路径+canonicalize防逃逸+跳过symlink**+尊重.gitignore+.git/硬排除）→100KB/文件+1MB总量上限→拼prompt一次LLM调用→"Analyzed N files (M lines)"尾注 | 无 | 无 | 完全没有 | "知道要看什么时比subagent省"——安全三件套(路径逃逸/symlink/gitignore)立即可抄 |
| 8 | **scheduler平台扩展**（scheduler.rs 75行）：manage_schedule工具包scheduler_trait——**Agent在会话内管理自己的定时任务**（create/list/update/pause/resume/remove+查产出会话），调度器是trait可插拔 | OpenMate无 | hermes_cron外部 | 部分有 | 与kilocode Wakeup互证：定时能力要给模型自己用 |
| 9 | **platform_notification元信道**（mod.rs）：工具结果meta携带{platform_event,params}——工具执行可向平台层发事件（UI通知/审计）而不污染文本输出 | 无 | 无 | 没有 | 20行，工具结果双通道（模型读文本、平台读meta） |
| 10 | **model_config_for_session回退链**（mod.rs）：session级模型配置→全局provider/model→错误可解释——summarize等扩展用会话自己的模型 | 无 | 无 | 部分有 | 与kilocode记忆模型解析链互证 |
| 11 | **unprefixed_tools flag**：todo/summon/analyze/developer/skills工具不带扩展前缀（一等公民），其余scheduler__manage_schedule带前缀——**工具命名空间分级** | 无 | 无 | 没有 | 防工具名冲突+重要工具直觉化 |

## 源码亮点
- chatrecall的测试即安全声明：`history_results_remain_agent_visible_without_becoming_user_visible`——一个测试名讲清audience模型的全部语义。
- todo注释："WARNING: This operation completely replaces the existing content"写进工具description——**危险操作的警告属于工具描述而非UI**，模型读得到才会小心。
- summarize的collect_from_dir：symlink_metadata而非metadata（不跟随符号链接）+entries按文件名排序（确定性）——"deterministic"写在工具描述第一行是承诺也是实现。
- ext_manager的instructions："When you lack the tools needed to complete a task, use search_available_extensions first"——把工具发现写成行为引导而非被动列表。
- tom的read_bounded：先读后判（循环读满64KB再truncate_utf8）而非先stat——TOCTOU防御的朴素版本。

## 可复用设计
1. PlatformExtensionDef注册表模式（hidden/unprefixed/default_enabled三flag）→ OpenSoul器官（hippo/cortex等）包装为统一工具协议
2. chatrecall audience双可见性 → OpenSoul消息模型加audience字段
3. todo每轮注入+空态自我提示 → OpenMate todo store接OpenSoul cortex注入
4. summarize安全三件套 → OpenSoul任何文件读取工具
5. SubAgent禁管理扩展 → OpenSoul multi_agent权限继承规则

## grep确认（本轮关键词）
NONE：chatrecall|search_chat_history|moim|top_of_mind / manage_extensions|search_available(实质义) / platform_notification / extension_data(todo义) / audience(消息可见性义)
部分：OpenMate todo=app-store TaskStatus前端态（缺会话持久+模型可写+每轮注入）；OpenSoul mcp/server.py=MCP基础能力（缺平台能力MCP化/自管理/audience）
