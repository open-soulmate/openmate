# kilocode 第五补验：suggestion建议卡 + background-job后台作业注册表 + code-mode kilocode变体

源码路径：packages/opencode/src/kilocode/suggestion/{index.ts 261行, tool.ts 146行}、packages/opencode/src/background/job.ts 37行壳 + packages/core/src/background-job.ts 365行引擎、packages/opencode/src/tool/code-mode.ts 324行。本地clone全读，零网络。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | 🔴 **suggest工具=agent主动弹建议卡**：agent调用suggest(text, actions[1-2])→UI渲染按钮卡→用户点选→工具结果返回"User accepted: label, carry out: prompt"。agent可以主动引导用户下一步，而不是等用户说话 | 没有（chat只有输入框+审批卡） | 没有（无suggest工具） | 完全没有 | cortex加一个toolsuggest=异步等待EventBus事件+OpenMate渲染卡片。~300行可整体参照kilocode两文件 |
| 2 | **suggestion非阻塞+idle状态切换**：blocking:false渲染在输入框上方（用户可以无视继续打字）；等待期间session状态切idle（"不显示为卡死"），accept后立即恢复busy防闪烁——状态可见性细节 | 没有 | 没有 | 完全没有 | 与#1同批实现；idle/busy切换正是用户"不知道它在干嘛"关切的反面：等待人时也要诚实显示状态 |
| 3 | **followup自动撤卡**：show()前同步检查PromptQueue.hasFollowup——用户已经排队了新消息还弹建议卡=骚扰，直接DismissedError。dismissAll(sessionID)在新prompt进来时清光旧卡 | 没有（无排队概念） | 没有 | 完全没有 | 依赖消息排队（kilocode PromptQueue，轮9已记）；建议卡与排队必须一起设计 |
| 4 | **建议action=prompt可以是斜杠命令模板**：resolvePrompt检测/开头→解析命令模板+$ARGUMENTS填充→**作为当前turn的文本返回给LLM执行**，不注入合成用户消息（注释点名"同session派发命令会死锁"） | 没有 | 没有 | 完全没有 | 建议卡按钮=预置指令，UI与命令系统打通的关键设计 |
| 5 | **建议采纳遥测**：parseReviewCommand识别action里的review类命令→trackSuggestionShown/Accepted（含actionCount）——"哪个建议按钮被点"功能使用率数据 | 没有 | 没有 | 完全没有 | 采纳率=建议质量指标，与ms-agent-fw feature-usage-bit同思路 |
| 6 | 🔴 **BackgroundJob注册表=可扩展后台作业引擎**（core/background-job.ts 365行）：start(id,type,run)/list/get/wait(timeout)/cancel八操作；token对象防ABA（settle时job.token!==token直接忽略——过期完成不污染新run）；Scope.close取消级联 | 没有 | main.py有系统级后台任务（非agent可管理的作业注册表） | 完全没有 | OpenSoul加background_jobs模块；goose summon后台subagent+kilocode background job+agno job_queue=三方互证 |
| 7 | 🔴 **extend()=运行中作业追加续段**：后台作业还running时再投喂一个run，sequence排队+previous tail Deferred链式等待前段完成再跑——"任务做到一半继续加活"的最小正确实现；输出规则：最新非空sequence胜出，空输出永不覆盖(#13469注释即bug记录) | 没有 | 没有 | 完全没有 | ~60行核心逻辑可抄；与hermes cron的extend语义互补 |
| 8 | **promote()=前台↔后台升格**：作业metadata.background=true+onPromote钩子+waitForPromotion Deferred——前台任务被用户切走时升格为后台继续，钩子里做UI迁移；promoted标记防重复升格 | 没有 | 没有 | 完全没有 | 用户"切页面任务不能断"的诉求直接答案 |
| 9 | **registry显式非持久**：docstring声明"进程重启即丢、持久观测/恢复/远程worker需要单独的durable层，不假装本registry有此语义"——诚实边界声明范式 | — | — | 可复用设计 | OpenSoul background_jobs若要做持久化，参照agno job_queue(store.py)补durable层 |
| 10 | **code-mode kilocode变体**（tool/code-mode.ts 324行）：execute(code)跑受限脚本，全部MCP工具变沙箱内函数——与goose code_execution.rs同构（第2方定案：Code Mode工具批量化已是行业方向） | 没有 | grep code_mode|execute_typescript|tool_graph=0命中（轮11已确认） | 完全没有 | 见goose supplement6方案；两份实现合读 |
| 11 | **code-mode子调用走完整权限+插件管线**：invokeChildTool每个子调用→plugin tool.execute.before/after钩子+SandboxPolicy.executeMcp+ctx.ask权限审批+OTel span——**沙箱脚本内的工具调用不绕权限**（安全关键） | — | — | 可复用设计 | 若实现Code Mode，子调用必须复用主权限路径，kilocode此文件是正确示范 |
| 12 | **网络受限会话code-mode直接空目录**：networkRestricted(session)==true时mcpTools={}——模型看到的是零工具函数的沙箱（工具面收缩，轮10已互证的第3处） | — | — | 可复用设计 | |
| 13 | **子调用实时状态流**：onToolCallStart/End→metadata.publish()更新toolCalls[]（running/completed/error+input快照）——UI实时显示沙箱脚本里每个工具调用进度；附件经projectMcpResult收集（image/audio→data URL attachment，resource_link降级为文本） | 没有 | 没有 | 完全没有 | 可观测性要求的直接体现；OpenMate工具卡片可加"批内子调用"折叠列表 |
| 14 | **abort竞速取消**：Effect.raceFirst(runtime.execute(code), abort)——取消立即生效不等脚本跑完，返回"Execution cancelled." | — | — | 可复用设计 | |

## 源码亮点
- suggestion/index.ts注释级细节：show()里"同步检查紧跟pending set之前，与SessionPrompt.prompt的dismissAll无交错"——并发时序写进注释。
- tool.ts等待期间status切idle再恢复busy的两行注释（"session不该显得卡死"/"accept后立即恢复防闪烁"）=状态机诚实设计教材。
- background-job.ts settle的token校验+SynchronizedRef.modify原子修改=Effect并发正确性范本；start对已running同id作业返回现况（幂等）。
- kilocode_change标记规范持续贯彻：suggestion整个目录在kilocode/镜像下，与上游opencode隔离。

## 可复用设计
1. 建议卡三要素协议（text+1-2个action{label,description,prompt}+blocking标志）schema可直接抄进OpenSoul tools + OpenMate组件。
2. BackgroundJob八操作+token防ABA+extend链+promote钩子≈400行Python可移植。
3. "registry非持久"的诚实docstring体裁。
