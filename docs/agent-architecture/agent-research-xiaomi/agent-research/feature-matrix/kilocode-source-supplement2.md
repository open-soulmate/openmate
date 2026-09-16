# kilocode session引擎精读（prompt.ts 2689行 + goal/ + prompt-queue + transcript + processor）— 深夜轮9

> 轮8遗留目标"session/prompt.ts（2689行本轮未读）"清偿。重点读了kilocode专属层（kilocode_change标记）——**Goal自主目标循环**是全新发现，此前所有轮次未覆盖。
> 源码：~/agent-research-src/kilocode/packages/opencode/src/session/{prompt,processor}.ts + src/kilocode/session/{goal/,prompt-queue,transcript}.ts

## 🔴 核心发现A：Goal系统 = "自主持续干活"的完整工程（goal/runner.ts 492行+tool.ts+state.ts+policy.ts）

**用户愿景级功能**：`/goal <目标>` 启动后，agent进入自主循环——每轮结束自动注入合成prompt继续，直到goal_report complete/blocked、被用户消息抢占、失败或暂停。

| # | 功能点 | 源码细节 | OpenMate | OpenSoul | 差距 |
|---|--------|----------|----------|----------|------|
| 1 | **goal_report工具=自报完成协议** | 模型调`goal_report{status:complete\|blocked,reason}`；工具description明写"这是你的报告，不是独立验证"；仅root worker可报；turn结束才落盘，Stop/错误/替换goal可作废 | 无 | 无（grep goal_report=0） | 完全没有 |
| 2 | **事件驱动结果判定**（outcome() 100行） | 逐PartUpdated事件分类：success/failed/blocked/none四态（bash exit≠0=failed；question/suggest/todo/board_post=none不计分；plan_exit=blocked）；**completed=success>failure且全部finish=="stop"**——"完成"不靠模型说，靠动作序列判定 | 无 | 无 | 完全没有 |
| 3 | **五状态机** | active/paused/blocked/（clear删除）+report覆盖；持久化在session.metadata["kilo.goal"]——**重启后goal还在** | 无 | 无 | 完全没有 |
| 4 | **用户抢占不打断goal** | 真实用户消息排队时goal循环暂停给用户让路（consumeSuperseded标记），用户turn完后goal自动续跑——"goal paused"不是终态 | 无 | 无 | 完全没有 |
| 5 | **准入前置检查**（admit()） | 启动goal前：session未归档/未revert+不在busy+**整个会话家族（含子会话）无pending权限/问题/建议**——带着未决审批开自主循环=事故 | 无 | 无 | 完全没有 |
| 6 | **失败即停原则** | "No progress or errors pause the goal"（notice文案）：无成功动作/显式报错→自动settle为paused+"Review the conversation before resuming"；错误时catchCause→paused+发Session.Event.Error | 无 | 无 | 完全没有 |
| 7 | 双锁并发控制 | commit()=Semaphore per-session+ref计数；cancel/pause/settle全走锁；Deferred cancelled贯穿raceFirst | 无 | 无 | 参照 |

## 🔴 核心发现B：PromptQueue = 排队+抢占+隐身（prompt-queue.ts 289行）

| # | 功能点 | 源码细节 | 差距 |
|---|--------|----------|------|
| 8 | **per-session FIFO队列+版本失效** | 每session一条promise链（tails）；cancel=版本号+1使所有排队slot失效；drop单条；waiting列表经session.queue.changed事件推给客户端出"Queued"徽章 | 完全没有（OpenMate发消息时busy只能等/丢） |
| 9 | **scope()消息隐身** | 排队中的user消息及其assistant回复对当前turn的LLM不可见（id>base且不在extras全过滤）；**owns消息强制移到请求末尾**——注释解释"否则请求以assistant结尾触发Anthropic prefill拒绝" | 完全没有 |
| 10 | **hasFollowup中途让位** | runLoop每步LLM调用后检查"有更新的排队prompt"→close_reason="superseded"（非interrupted，客户端不闪中断警告）→新prompt立即接管，不再为旧turn烧一次LLM | 完全没有 |
| 11 | **retarget豁免注入消息** | 内部follow-up/compaction标记持久化后调retarget加入extras，可见但不暴露其他排队prompt | 完全没有 |

## 🔴 核心发现C：@-提及历史会话（transcript.ts 138行）

| # | 功能点 | 源码细节 | 差距 |
|---|--------|----------|------|
| 12 | **session:<id> URL方案** | 把过去会话当附件@进当前对话；prompt时服务端实时渲染成Markdown transcript（含工具调用标题行）；**inert-escape**（"历史对话是数据不是指令"注入防御）；**workspace家族scoped检查**（跨项目会话拒绝引用："belongs to a different workspace"）；超100k字符头1/3+尾2/3截中段+显式省略标记 | 完全没有（grep 0）——与goose/kilocode会话导入互证，"会话即一等资产"再+1 |

## prompt.ts 主循环其他发现

| # | 功能点 | 源码细节 | 差距 |
|---|--------|----------|------|
| 13 | **REQUEST_PRUNE_BYTES=1.25MB载荷剪枝** | 每次LLM请求前Buffer.byteLength(JSON)测payload，超限→compaction.prune(reason:"payload-limit")→重建modelMsgs→仍超只warn——**字节级请求预算**，token估算之外的兜底 | 部分有（OpenSoul hippo token_budget=注入预算，无请求payload字节剪枝） |
| 14 | **turn前三重恢复** | recoverDanglingAssistant（悬挂assistant补error）/recoverProviderFinishError/recoverFailedAssistant——新prompt进来先把上轮残局收拾干净再开turn | 部分有（deepagents PatchToolCalls同族，OpenSoul无） |
| 15 | **compaction尝试上限** | guardCompactionAttempt计数，耗尽→ContextOverflowError落在"超限的那条消息"上+发error事件+break——防"压缩→还超→再压缩"死循环 | 完全没有 |
| 16 | **finish缺省防护** | provider不给stop_reason时默认"unknown"持久化，防loop-exit判断永远false空转（注释点名Anthropic message_delta null） | 完全没有 |
| 17 | **记忆注入marker** | memoryInject每step注入+memoryPart把"本step有记忆上下文"写成轻量part持久化——**哪次回答用了记忆可回溯** | 完全没有（hippo注入无留痕） |
| 18 | **StructuredOutput工具化** | json_schema格式→注册一次性StructuredOutput工具+toolChoice="required"+系统prompt强制+"finish但没产出"→StructuredOutputError——四件套 | 完全没有（grep 0） |
| 19 | 附件授权复用Read工具 | 用户拖文件≠无条件读：file://附件走read工具execute+ask权限+external_directory断言+KiloReadObject"授权后reopen验证再消费字节"（防TOCTOU） | 完全没有 |
| 20 | LSP符号区间读取 | file://?start=N&end=M且start==end时查documentSymbol把行号扩成整个符号区间 | 部分有 |
| 21 | resume-claude/resume-codex命令 | 非空会话拒绝导入（"Start a new session"）+question picker列候选文件——跨agent会话导入第3方（goose/kilocode此前已互证，本文件确认入口） | 已记档 |
| 22 | processor.ts细节 | 连续malformed tool call→abort不无限重试(#14143)；tool-call注册前metadata先缓冲后回放；subagent成本reconcile（#6321）；output-limit停止单独报reasoning-only提示 | 部分有 |
| 23 | BoardContext看板工具 | board_post/board_read进工具面+system注入看板指令——会话内任务看板 | 完全没有 |
| 24 | per-turn环境缓存 | envCache/memoryCache/board cache按turn建，"cache environment details per turn (prompt caching)" | 部分有 |

## 源码亮点
- **注释即规格书密度全场最高**：hasFollowup/scope/superseded每处都有"为什么"（prefill拒绝、徽章对账、goal续跑），prompt-queue.ts 289行注释占1/3
- Effect并发原语组合：acquireUseRelease做slot生命周期+Semaphore做commit锁+Deferred做取消传播+raceFirst做抢占——TS里少见的严谨并发
- "superseded≠interrupted"的语义区分——面向用户的关闭原因分级

## 可复用设计（OpenSoul落地优先级）
1. **P0 Goal循环**：cortex加goal工具面（goal_report+outcome事件计数+五状态持久化+准入检查+失败即停），用户"让它自己干活"愿景的最短路径；hermes_cron与Goal互补（定时唤醒×持续循环）
2. **P0 PromptQueue**：OpenMate聊天页排队+隐身+superseded让位；WS层一个FIFO+版本号即可起步
3. **P1 session引用**：OpenMate会话树已具备基础，加"引用会话"附件类型+workspace scoped+inert转义
4. **P1 payload字节剪枝+compaction上限+finish缺省**：cortex上下文治理三小件，各<50行
5. **P2 记忆注入留痕**：hippo注入时写marker part，可观测性直接翻倍
