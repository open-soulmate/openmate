# kilocode 第二次补验：session/permission/skill/question内核精读

研究时间：2026-09-17 深夜轮8（cron）
源码：~/agent-research-src/kilocode（本地clone，零带宽）
前序：kilocode-source.md（11项：Agent Manager/worktree/Wakeup/sandbox策略/marketplace/kilo-memory等）
本轮专攻：packages/opencode/src/{session,permission,skill,background,question}/——permission/index.ts（557行全文）、skill/discovery.ts（168行全文）、session/revert.ts（214行全文）、session/compaction.ts（前180行）、session/{overflow,reminders,todo}.ts、background/job.ts、question/index.ts（全文）

## 功能清单

| # | 功能 | 源码依据 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | **权限三层叠加+硬否决** | permission/index.ts：resolve()=base ruleset×approved(持久)×session(会话级)三层findLast，hardRuleset外部目录/Plan模式否决——**saved/allow永远压不过hard deny** | settings全局三档 | casbin用户级RBAC | 部分有 | P1。CowAgent per-session三档的kilocode版：wildcard pattern+三层+硬否决，规则求值函数evaluate()~10行可抄 |
| 2 | **敏感权限必须真人交互回复** | skillShell/sandboxEscalation元数据→forceAsk；reply()时interactive!==true的机器审批（auto-approve/YOLO客户端）**静默拒绝并留pending等真人**（注释："genuine human client sets interactive"） | acp-approval-modal有UI | 没有 | 完全没有 | 🔴防"自动审批器回答敏感问题"——HITL安全设计此前9方互证都没想到的攻击面 |
| 3 | **自动审批可解释（AskOutcome）** | ask()返回{manual, rule}——rule=命中的规则带source标记，客户端可显示"此调用被规则X自动批准" | — | — | 完全没有 | 用户可观测性：审批面板显示"为什么没问我" |
| 4 | **审批级联drain** | reply always→drainCovered()：新规则覆盖的其他pending请求批量自动回复；reject→同session全部pending级联拒绝 | — | — | 完全没有 | "总是允许"后不再逐个弹窗；拒绝时止损同会话所有等待 |
| 5 | **headless子agent权限直拒** | KiloHeadless.denies()：无头subagent的ask不排队（"回复永远不会来"issue #11903），直接DeniedError | delegate_task无权限层 | multi_agent无权限层 | 完全没有 | subagent权限模型：要么继承父策略要么直拒，不能挂起等人 |
| 6 | **配置自保护** | ConfigProtection：agent自己配置文件的请求allow降级为ask；只有"精确的全局skill子树"信任例外；DISABLE_ALWAYS_KEY防持久化 | — | — | 完全没有 | 与Roo ProtectedController互证升两方："agent不能改自己的规则"从名单式升级为路径策略式 |
| 7 | **远程skill注册表拉取+供应链防御** | skill/discovery.ts：index.json→逐skill安全计划（SKILL.md必须存在/name安全段校验/路径逃逸contained()检查/文件下载origin钉死在index源）→staging目录下载+版本文件比对+**原子rename交换（backup→失败回滚）** | marketplace有（缺原子更新/origin钉死） | plugins_api有（缺） | 部分有 | P1。skill更新的供应链安全全套：origin钉死+staging+原子swap约80行可抄 |
| 8 | **消息级revert/unrevert+工作区快照联动** | session/revert.ts：按messageID/partID回退（可回退到消息中间的单个part）→Snapshot.patch重放+diff计算持久化+unrevert重做+workspace状态诚实三态（restored/snapshots-disabled/unavailable） | 部分有：edit_guard系统数据快照/备份（architecture-monitor.snapshots）——但无消息级回退×文件快照联动 | trajectory无快照续跑 | 部分有 | 与agent-zero time_travel互证升两方；OpenMate会话回退+文件回退原子性照此实现 |
| 9 | **压缩prune双阈值+工具输出截断** | compaction.ts：PRUNE_MINIMUM=20k/PRUNE_PROTECT=40k、TOOL_OUTPUT_MAX_CHARS=2000、PRUNE_PROTECTED_TOOLS=["skill"]（skill结果不prune）、preserve_recent=usable×25%夹在2k-8k | 没有 | 没有 | 完全没有 | 上下文prune常量表可直接抄；"哪些工具输出不能剪"是产品判断 |
| 10 | **overflow预留缓冲** | overflow.ts：usable=input_limit−reserved（默认min(20k, maxOutputTokens)可配置compaction.reserved）；注释："post-step检查是安全网，经济阈值在preflight跑" | — | — | 完全没有 | 上下文预算分层：安全检查vs省钱检查分开 |
| 11 | **会话todo持久化+事件** | session/todo.ts：TodoTable落库（content/status/priority/position）+事务重写+Event.Updated广播 | app-store只有TaskStatus类型 | 没有 | 完全没有 | OpenMate todo工具的存储层参照（比Hermes todo多DB持久化+事件） |
| 12 | **合成提醒part** | reminders.ts：synthetic:true的text part插入用户消息（plan→code切换提醒/plan文件存在提醒）——"系统提醒作为消息部件"与正文分离可过滤 | 没有 | 没有（system-reminder零命中） | 完全没有 | FastGPT `<system-reminder>`互证升两方；synthetic标记让前端可渲染为灰色条而非用户文字 |
| 13 | **结构化提问（Question服务）** | question/index.ts：多问题批量ask/blocking标志/dismissAll会话级清理/中断时finalize保证每个问题有终态事件（Rejected） | — | MCP elicitation概念 | 部分有 | HITL问卷的完整生命周期：asked→replied/rejected必有终态，防前端悬挂spinner |
| 14 | **后台作业promote** | background/job.ts：start/extend/wait/**waitForPromotion/promote**/cancel——后台运行的结果可"晋升"回主会话历史 | 没有 | 没有 | 完全没有 | 与agent-zero promote_parent_history互证升两方："跑完了要不要进对话"是显式动作 |

## 源码亮点

- permission的resolve()决策表：base=deny或saved=deny直接否决→base=ask时saved=allow且pattern覆盖才放行→其他取base——**十行代码的多层权限代数**，可画成真值表进文档
- covered()排除名单：ConfigProtection/skillShell/sandboxEscalation三类请求永不被批量drain——"批量放行不吞敏感请求"
- discovery的contained()检查：path.relative(parent,child)非空且不以..开头且非绝对——路径逃逸检查的最小正确实现
- revert的原子性设计：KiloSessionRevert.apply包住"恢复旧快照→算diff→revert patch→写summary"全流程，中途失败整体不落地；baseline拿不到直接die不猜
- Effect.addFinalizer模式：Question/Permission的state销毁时把所有pending Deferred置Rejected——**服务关闭不悬挂等待者**
- compaction的CompletedCompactions定位：找"带compaction part的user消息+完成的assistant摘要"配对——压缩历史本身是可查询的消息对

## 可复用设计

1. **敏感权限真人交互门**（#2）：OpenSoul审批加interactive标志位，自动审批器只能答"once"不能答敏感类——立即可抄
2. **hard deny不可覆盖+配置自保护**（#1+#6）：immune/permission的规则代数照此实现
3. **skill供应链防御**（#7）：OpenSoul skills市场拉取侧补齐
4. **revert+快照**（#8）：OpenMate会话时间旅行的完整参照（消息级+文件级原子）
5. **常量表**（#9+#10）：20k/40k/2000/25%/2k-8k——上下文管理的默认值都替用户想好了
