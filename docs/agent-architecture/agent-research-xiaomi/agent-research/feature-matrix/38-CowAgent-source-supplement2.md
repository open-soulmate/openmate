# CowAgent 第二补验：team名册/寻址/路由 + evolution动作侧（轮10清偿轮7遗留，web_extract raw源码）

研究方式：web_extract raw.githubusercontent.com。文件：agent/team.py（roster）、agent/team_addressing.py（全文）、agent/routing.py（全文）、agent/evolution/executor.py（中段片段——raw大文件被代理截断，拿到_WorkspaceWriteGuard/builtin skills保护/回滚/记账核心段）。evolution目录：__init__/backup/config/executor/...（trigger.py轮6已读）。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | 🔴 **team.json独立名册文件**（team.py全文docstring即设计文档）：agents/default_agent_id/channel_instances三键**整体迁出config.json**——理由："多个无关调用方整写config.json，持旧快照的写者会把新建Agent抹掉"→**独立文件消除共享爆炸半径而非加锁** | 无 | 无 | 完全没有 | 多agent系统的配置隔离范式；注释即架构决策记录（ADR）体裁 |
| 2 | **可搬运workspace布局**：标准布局不落绝对路径（默认Agent在根、其余在agents/，全部可推导），非标准才写全路径——**实例整体搬移/恢复后仍有效** | 无 | 无 | 没有 | 用户有NAS——可搬运=可备份可迁移 |
| 3 | **一键迁移+单向门**：读回落config.json兼容旧装；首次写迁移并清旧键；utf-8-sig容忍Windows手改BOM；JSON坏→回落而非清空名册（"fall back than start with no agents"） | 无 | 无 | 没有 | 配置迁移全套纪律 |
| 4 | **热路径mtime+size签名**：变更检测看(stat.st_mtime_ns, st_size)不读内容——**所有写走os.replace原子替换**所以签名必然变化 | 无 | 无 | 没有 | 20行，配置热加载正确实现 |
| 5 | 🔴 **channel_instances=入站路由唯一真源**：每渠道实例携带自身凭证+身份+bound_agent_id——**"收到消息的实例决定哪个Agent回答"**，无独立绑定表；显式agent_id（控制台请求）>实例绑定>默认Agent | 无 | OpenMate多workspace无渠道绑定 | 完全没有 | OpenMate若接多IM渠道（微信/飞书）这是路由层的正确形态 |
| 6 | **路由不可用显式失败**（routing.py）：**路由到missing/disabled Agent=配置错误直接抛AgentUnavailableError，不静默换默认Agent**——注释："用默认agent顶替会以不同人格/记忆/工作区回答且对话中毫无痕迹" | 无 | 无 | 没有 | 15行注释值得进OpenSoul多agent路由的规范 |
| 7 | 🔴 **@寻址channel无关匹配器**（team_addressing.py全文）：仅前导@算交接（"句中提到某人通常是谈论而非交棒"）；name和id都可@；**长名优先排序**（名中名解析到真正写出的那个）；正则边界`(?=[\s,：、]\|$)`兼顾中英文标点；host优先roster+未知id剔除 | 无 | 无 | 没有 | 与Langroid TO[]寻址互证的第二方；100行纯函数可移植 |
| 8 | **首条消息即生效**：roster从channel实例members直接解析，不等session_prefs种子——**冷启动不丢第一条@消息** | 无 | 无 | 没有 | 细节 |
| 9 | 🔴 **进化executor的写保护**（executor.py片段）：_WorkspaceWriteGuard**包装write/edit工具硬性拒绝workspace外写入**（"Hard engineering guard (not prompt-based)"）——保护项目内置skills/目录；**内置名单以项目根skills/目录为权威**（运行时workspace里的同名副本不算数，防进化agent改自己产品自带技能） | Roo ProtectedController有静态名单 | 无 | 部分有 | 与Roo互证两方：**工程护栏而非prompt约束**；"以发布目录为权威名单"比硬编码清单可持续 |
| 10 | **进化隔离评审agent**：同模型+工具精简+_guard_tools加写护栏——进化结果先过隔离评审再落地 | 无 | heredity/self_evolution仅分析 | 完全没有 | "自我修改必须经隔离评审"=自进化系统的最低安全线 |
| 11 | **进化结果校验+回滚**：_valid_evolution_result无效/无内容→rollback不落地；结果_truncate_evolution_result截断 | 无 | 无 | 没有 | 与hermes"修完必须验证"同哲学 |
| 12 | **进化记账进用户会话**：compact note以remember写回session（task_description:"self-evolution"）——**用户看得到agent改了自己什么** | 无 | 无 | 没有 | 可观测性（用户核心关切）在自进化场景的落地 |
| 13 | **进化transcript尾部优先**：超长取尾部（"tail is most relevant"）+省略标记 | 无 | 无 | 没有 | 与AIHawk/kilocode截断互证 |

## 源码亮点
- team.py整份docstring是一篇小型ADR：为什么独立文件（快照写者风险）为什么不存绝对路径（可搬运）为什么回落（不破坏旧装）——**注释解释why的教科书**。
- routing.py的"不可静默替换"原则——多agent产品最容易犯的错就是路由失败用默认顶替；CowAgent选择抛错，对话人格一致性>可用性。
- _WorkspaceWriteGuard把"进化不能碰的"落在**发布目录**而非名字清单——升级产品自带新技能自动获得保护。

## 可复用设计
1. team.json独立名册+迁移三纪律 → OpenMate多agent面板的持久化设计
2. @寻址匹配器（100行）→ OpenMate群组对话
3. _WorkspaceWriteGuard+内置目录权威名单（~80行）→ OpenSoul heredity/self_evolution动作化时的安全底座
4. 隔离评审agent+结果校验+回滚+记账四件套 → OpenSoul自进化闭环
5. "路由失败抛错不顶替" → OpenSoul multi_agent路由规范

## grep确认（本轮关键词）
NONE：write_guard|outside workspace(护栏义) / builtin.*skills(保护义) / channel_instance|bound_agent|team.json|default_agent_id / roster(名册义) / rollback(进化义)
部分：OpenSoul heredity/self_evolution.py=分析无动作无护栏无回滚（CowAgent四件套全部缺）；OpenMate workspace多目录（无渠道绑定路由）
