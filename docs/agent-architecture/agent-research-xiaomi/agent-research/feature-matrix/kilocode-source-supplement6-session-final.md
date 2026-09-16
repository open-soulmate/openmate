# kilocode 第六补验：session引擎收官（12文件2023行全读）

> 轮13（2026-09-17深夜cron）。对象：kilocode packages/opencode/src/session/ 剩余文件
> overflow.ts(36) reminders.ts(87) retry.ts(179) status.ts(127) summary.ts(215) network.ts(418) run-state.ts(182) instruction.ts(280) + message-error/revert/system/todo速扫
> 此前5轮已覆盖 prompt/compaction/tools/transcript/goal/queue，本轮清偿最后欠账。**kilocode源码级研究至此收官。**

## 功能清单（10项，🔴=OpenMate/OpenSoul双零）

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | 🔴 断网等待状态机 SessionNetwork（418行） | 无（仅WS/SSE传输层重连） | 无 | 完全没有 | cortex约150行，见下 |
| 2 | 🔴 LLM重试策略 Retry-After头解析 | 无 | 无（cortex retry=0命中） | 完全没有 | acp-proxy/cortex立即可抄 |
| 3 | 🔴 后台作业级联取消（parentSessionId链） | 无 | 无 | 完全没有 | 40行循环 |
| 4 | 🔴 会话级累计diff（session_diff持久化+per-message diff） | 无（scm-panel只有git diff） | 无 | 完全没有 | OpenMate差异化 |
| 5 | 🔴 指令文件信任分级+fileScope围栏（AGENTS.md） | 无 | 无 | 完全没有 | P0安全项 |
| 6 | 🔴 指令就近附着（读文件时向上走目录挂载邻近AGENTS.md，per-message claim去重） | 无 | 无 | 完全没有 | ~60行 |
| 7 | 🔴 压缩预留计算 usable()=input−reserved(20k或max_output) | 无 | hippo token_budget（记忆注入，非上下文预留） | 完全没有 | compaction引擎配对件 |
| 8 | worktree感知状态共享（project id=git remote派生，busy状态跨worktree可见） | 无 | 无 | 完全没有 | kilocode_change专有工程 |
| 9 | agent切换合成提醒（plan→code注入synthetic part） | 无 | 无 | 完全没有 | ~30行 |
| 10 | 网络恢复后MCP远端自动重连（failed状态server逐个connect） | 无 | 无 | 完全没有 | ~20行 |

## 源码亮点（逐项）

### 1. SessionNetwork = 断网即暂停、恢复即续跑（本轮最大发现）
- **触发**：错误链遍历（chain()递归cause+errors数组）匹配12个errno（ECONNRESET/ENOTFOUND/EAI_AGAIN/UND_ERR_*等）+11条消息模式（"failed to fetch"/"socket hang up"...）+DOMException TimeoutError
- **等待**：SessionNetworkWait{id,message,restored,time}进pending Map，publish `session.network.asked`事件→UI显示"等待网络恢复"；turn挂起但session不判死
- **探测**：3个URL竞速HEAD（kilo.ai/example.com/cloudflare trace，Promise.any，5s超时，任一status<500即通）——探测目标冗余防单点误判
- **恢复**：watch循环3s轮询→restore标记+事件→**10s宽限期后自动reply续跑**（用户也可手动reply/reject；reject抛RejectedError上抛给模型）
- **副作用**：恢复时自动重连全部status=failed的远端MCP server（并发unbounded）——"网断了MCP也断了，只续LLM不续MCP=假恢复"
- 对照：OpenMate use-sse/global-websocket是**传输层**重连（连接断了重建）；kilocode是**turn层**语义（模型调用失败→挂起整个turn→网回来从断点续）。两者正交，OpenSoul完全空白
- 可抄性：探测+轮询+事件三件套~120行纯Python可移植；errno集合直接抄

### 2. retry.ts 重试策略（179行）
- **Retry-After三格式**：retry-after-ms毫秒头→retry-after秒数→HTTP date格式（Date.parse−now），全部cap到i32上限；**无头时才fallback指数退避（2s×2^n）且封顶30s**——有头听头，比盲目退避对限流API友好得多
- **5xx无条件重试**：即使SDK没标isRetryable，status>=500一律重试（注释即理由："transient server failures"）
- **不可重试的精确排除**：ContextOverflowError（重试没用）、FreeUsageLimitError（"重试同一个封顶模型是徒劳，且retry循环持有的model ref是stale的，用户切模型救不了"——注释记录了为什么）、KiloError（要用户登录）
- **离线handler内联**：policy()的Schedule步进里先查SessionNetwork.disconnected→offline回调三态retry/blocked/aborted→恢复时attempt归零+message="Reconnected"——重试与断网等待在同一状态机里合成
- **limit参数**：attempt>limit强制done——防无限重试（上游opencode没有，kilocode_change加的）
- 对照：OpenSoul cortex **grep retry/attempt=0命中**；link_gateway只有固定[1,2,4]s三档webhook重试。LLM调用失败=直接报错给用户

### 3. run-state.ts 级联取消（cancelBackgroundJobs，~40行）
- cancel(session)时：list全部background job→匹配status=running且(job.id∈pending ∪ metadata.sessionId∈pending ∪ metadata.parentSessionId∈pending)→cancel并把job.id/sessionId加入pending→**while循环直到无新匹配**——孙辈作业（job的job）也被收割
- pending是传播集合不是固定名单：每取消一个job，它的sessionId入pending，下一轮匹配出它的子作业——**递归任务树的BFS收割**
- 对照：OpenSoul main.py有系统级后台任务，无session归属、无级联——用户在聊天页按"停止"，孙任务还在烧token

### 4. summary.ts 会话累计diff（215行）
- **session_diff存储键**：每次summarize取首个step-start.snapshot→末个step-finish.snapshot做snapshot.diffFull，累加appendSessionDiffs写storage——**整个会话改了哪些文件的累计账本**，与git无关、与消息绑定
- **per-user-message diff**：每条用户消息的summary.diffs记录"这条消息之后改了什么"——用户问"刚才那轮改了啥"有精确答案
- **editor全量diff入口**：diff({full:true,file})单文件返回完整内容级detail（编辑器diff tab）；无messageID时读累计diff并做git路径unquote+超MAX_DIFF_SIZE的patch置空（防大diff炸UI，只留统计）
- **云fork会话迁移保底**：readSessionDiffBase读导入的累计diff为base，本地新diff append——跨机器搬会话不丢改动账本
- 对照：OpenMate scm-panel=git工作区diff（人工查看）；"agent这轮改了啥"没有任何per-message账本。OpenSoul无

### 5+6. instruction.ts 信任分级+就近附着（280行）
- **信任分级**：全局AGENTS.md trusted:true；项目AGENTS.md/CLAUDE.md trusted:false+fileScope{root,source}——**非信任指令文件读取被围栏限制在项目根内**（"project instructions cannot read env or files outside the project root"注释=威胁模型声明）。config.instructions可带instruction_origins声明provenance
- **就近附着**：read工具读文件时，从被读文件目录向上走（不越过root），沿途发现AGENTS.md/CLAUDE.md/CONTEXT.md就读进来，per-message claims Map去重（同一条消息只附着一次），已进system prompt的跳过——**子目录自己的规矩随用随到**（与goose SubdirectoryHintTracker监听工具参数路径互证两方）
- **CLAUDE.md迁移门**：ClaudeMigration.globalHandoff()后停止自动读全局~/.claude/CLAUDE.md（用户从Claude Code迁移的过渡期设计）
- **首匹配赢**：项目级instructionFiles多候选只取第一个命中的文件，不叠罗汉
- 对照：OpenSoul admin-ui有个@AGENTS.md引用（build配置），**运行时agent无任何指令文件发现/信任机制**；OpenMate无

### 7. overflow.ts 压缩预留（36行小而关键）
- usable = model.limit.input − reserved；reserved = config.compaction.reserved ?? min(20_000, maxOutputTokens)——**给输出留座**，防"上下文塞满没给回答留token"
- 注释："post-step checks are safety-only; economic thresholds run in preflight"——**经济阈值（该压缩了）前置到请求前，安全阈值（炸了）后置到响应后**，两级检查职责分离
- isOverflow尊重config.compaction.auto=false——用户关了自动压缩就真不压

### 8. status.ts worktree状态共享（127行）
- 问题（注释即教材）：InstanceState按directory建Map→session prompt loop在worktree目录、heartbeat gather在主目录→两套Map→heartbeat发了空sessions:[]
- 解法：**project id=git remote派生（跨linked worktree稳定）**，写状态时镜像进project级store；listAll按project读；dispose只清本directory的session（byDirectory反查），不清sibling worktree的
- 价值：**同一仓库多个agent worktree并行干活时，主控能看到全部busy状态**——OpenMate多workspace无此概念

### 9. reminders.ts agent切换提醒（87行）
- 会话曾用plan agent、当前切到code agent→用户消息追加synthetic:true的合成part（CODE_SWITCH文案）——**切换的上下文交代由系统注入，不靠用户记得**；plan文件存在时追加路径提示"执行它"
- synthetic标记贯穿（与kilocode记忆marker同构）：UI可区分"系统插的话"vs"用户说的话"

### 10. 网络恢复→MCP重连
- SessionNetwork.reply()里：mcp.status()→全部failed的并发mcp.connect()——恢复语义完整性细节，抄SessionNetwork时别漏

## 可复用设计（按优先级）
1. **SessionNetwork整体移植为cortex/network_wait.py**：errno集合+探测竞速+轮询+事件+恢复续跑，Python~150行。用户弱网环境（移动办公）直接收益
2. **retry.ts移植**：Retry-After头解析+5xx无条件+不可重试名单，配chat fallback有序链（轮12 CowAgent发现）=cortex重试子系统完整参照
3. **级联取消40行**：挂到OpenSoul后台任务（若有agent作业注册表需求，与kilocode BackgroundJob/轮12发现合看）
4. **session diff账本**：OpenMate聊天页"本轮改动"卡片的数据源；diff统计per-message落库，UI展示增量
5. **指令信任围栏**：任何"读项目内AGENTS.md当规则"的功能上线前必须先有fileScope——否则恶意仓库的AGENTS.md可指示agent读~/.ssh。安全前置件
6. **压缩预留公式**：usable()=input−min(20k,max_output)一行，OpenSoul做compaction时直接抄

## kiliocode研究收官总账（6轮）
- supplement1(14项)+2(24)+3(19)+4-compaction(10)+5(14)+6(10)=**91项源码级发现**
- 最重资产：Goal自主循环/PromptQueue/Truncate服务/kilo-memory端口架构/权限provenance/建议卡/BackgroundJob注册表/Code Mode/压缩引擎/断网等待
- 行业地位判定：kilocode=opencode商业fork，**工程细节密度全行业第一**（注释即规格书、测试名即安全声明），作为OpenSoul cortex/immune两大模块的首选抄写对象
