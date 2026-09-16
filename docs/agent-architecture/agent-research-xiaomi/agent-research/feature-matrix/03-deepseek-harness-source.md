# DeepSeek Harness (#3, 222k stars) 功能研究

研究时间：2026-09-16（源码级深读）
源码：~/agent-research-src/deepseek-harness（147MB monorepo，pnpm workspace，50+包）
架构：Cordis 插件框架 —— **一切都是插件**，包括模型适配器、工具注册表、会话日志、agent loop 本身

## 架构核心（先读这个）

三角色**能力接缝（Capability Seam）**：Service Definition（接口）/ Service Provider（实现）/ Consumer（模型工具）。
- 例：fs 与 subprocess 共享同一个"执行世界"，把 provider 指向远程沙箱，Bash/PTY/LSP 全部跟着走，零 fork。
- **注册即副作用**：`ctx.effect()`/`ctx.on()` 返回 disposer，插件卸载自动回滚。
- **Profile + Bundle 分层组合**：启动时按序叠加 bundle → profile patch → home patch → `--patch` overlay，任何一行都可被上层 patch 替换（`dsh --profile web --dump-config` 可看）。
- **事件三域**：Session 事件（持久事实，进日志）/ Agent 事件（`agent/*` 拦截在飞工作）/ Capability 事件（`fs/*`、`tools/*` 挂策略）。
- **"模型可见即已记录"**：任何进入模型请求的内容必须能从日志重建，并有运行时不变量断言。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **Session 日志格式迁移链**：JSONL v0→vN 相邻迁移包，代际只增不改不删（`session.vN.jsonl[.zstd]`），读打开不产生继任者，写打开独占发布 | 无 | 部分（heredity/migration.py 只做DB schema） | **完全缺** | OpenSoul 会话落盘先定死 append-only + 版本化代际，再补迁移包；比事后补救便宜100倍 |
| 2 | **进程沙箱四档策略**：`read-only` / `workspace-write` / `danger-full-access`，Linux bwrap→Landlock 回退、macOS Seatbelt、Windows restricted-token+ACL；被拒可申请一次性人工升级 | 无 | 无 | **完全缺（安全关键）** | 先做 Linux bwrap（本机有内核），落 policy resolver；OpenSoul/limb 执行层接入 |
| 3 | **Goal 域**：每会话一个持久目标（create/edit/pause/resume/complete/block/clear），`/goal` 人类命令不烧模型轮次；goal-round-driver 把活跃目标变成顺序 Round 自动续跑（reservation/stale/cancel 全处理） | 无 | 无（trajectory 只是轨迹记录） | **完全缺** | 复用 todo 工具模式：`get_goal/create_goal/update_goal` 三工具 + 持久事件；续跑驱动可挂 OpenSoul/will |
| 4 | **会话内提醒 schedule**：`schedule_create/list/delete`，延迟/绝对时间/固定间隔，到期作为**普通消息**回到该会话；跨重启存活，但绝不外发通知 | 无 | 无（marrow 的 schedule 是备份调度，非会话提醒） | **完全缺** | 与全局 cron 分离的轻量层，落 OpenSoul/marrow 旁路 + 消息注入；实现量约2000行 |
| 5 | **Spill 溢写**：工具结果 UTF-8 超 `maxInlineBytes` → 全文存会话私有文件，模型只看 head/tail 预览+定位符+取回指引；失败绝不把成功调用变 isError；`read` 跳过防 read→spill→read 循环 | 无 | 部分（vein 有内容寻址存储，但无工具结果溢写策略） | **部分有** | 复用 vein/file_store 做后端，在 tools post-execute 挂策略插件；**这是最省 token 的单点改进** |
| 6 | **会话检索族**：SQLite FTS5 全文检索 + 血缘追踪（lineage）+ 过滤 + 有界读取，模型侧 5 个授权工具，Web `/export` 导出会话 ZIP | 无 | 部分（hippo/long_term_memory 有 FTS5，但只搜记忆不搜会话原文、无血缘） | **部分有** | 把 FTS5 索引扩到会话事件流；血缘 = parentSession/seedLength 字段 |
| 7 | **运行时自改（Extensions）**：agent 通过 7 个工具检视活的插件树、**定义/运行/更新/停止/移除动态插件**（宿主半+浏览器半双端），进程内存态，重启即失 | 无 | 无 | **完全缺** | 战略级能力（"agent 改自己的运行时"）。先做只读检视 + 技能热加载，再开写权限 |
| 8 | **Plan 模式**：`/plan` 进出，规划期只探索设计，`exit_plan_mode` 呈现计划待人工批准；**引导而非限制**（工具全可用，限制由沙箱/审批独立配置） | **只有 i18n 死字符串**（planModePlaceholder 无实现） | 无 | **几乎完全缺** | OpenMate 已有文案，直接补 UI 开关 + OpenSoul 侧 system prompt 注入 + exit 工具 |
| 9 | **循环卫生 Guard**：① repeat-tool-reminder —— 同工具同参数连续 N 次（默认3/5/8 递进）注入提醒（温和→详细，引用参数但截断500字符）；② timeout-policy —— 工具声明时限，超时返回清晰错误 | 无 | 无 | **完全缺（成本关键）** | **性价比最高**：单文件~200行，挂在工具执行后；防死循环烧钱 |
| 10 | **Agent Teams**（实验）：持久花名册（provisioning→active/failed）、**持久邮箱**（queued-minus-delivered 即恢复队列，目标侧 inbox+history 折叠去重）、**共享任务 DAG**（revision CAS、blockedBy 无环、writeScopes 建议性路径前缀） | 部分（有 taskBoard UI 文案） | 无 | **几乎完全缺** | Hermes delegate_task 已有雏形，补：持久化 roster + 消息回执语义 + 任务 blockedBy 边 |
| 11 | **凭证引用 + 授权流**：配置只写凭证**名字**不写值，本地 YAML 存储同 OS 用户可读、env 覆盖当次生效；`authorization/` 让插件通过**问人**获取凭证 | 无 | 无 | **完全缺** | OpenSoul/vein 或 link 层做 credential store；用户"不得上传云端"要求下尤其相关 |
| 12 | **Webhook 入口→会话**：验签→规则判定→**fire-and-forget 创建 Workspace Session**（明确无队列/无重试/无去重，重复投递=重复会话）；GitHub 适配器挂独立 WebServer 防暴露浏览器 API | 无 | 部分（有 webhook 订阅 skill，但不产会话） | **部分有** | 在 OpenSoul/api 加 webhook→session 桥；**明确不做队列**是重要的设计纪律 |
| 13 | **Compaction 能力接缝**：`compaction/start`（日志锁）→`compaction/summary`（影子范围+token数+模型调用全记录）→`compaction/end`；摘要以 `user/message`+`surfaceOp:{op:'replace',startSeq,endSeq}` 骑行，崩溃留孤儿锁可检测；另有 **image/offload** 图片卸载 | 无 | 无 | **完全缺** | 现在压缩若做就要做成"可重建"的：锁三段式 + 影子范围，别只做静默截断 |
| 14 | **Agent Preset**：每会话独立 agent 组合（`agent.cordis.yml` 目录），一个进程同时跑多个不同工具/提示词/技能组合的 agent；persona 行可换身份 | 无 | 部分（gene 模板） | **部分有** | gene→preset 升级：目录式声明 + 按会话挂载，配合 delegate_task 子 agent |
| 15 | **能力接缝模式**（Service Definition/Provider/Consumer 三角色）+ 扩展只依赖接口不依赖实现 | 无 | 无（模块直接互相 import） | **完全缺（架构级）** | OpenSoul 器官间先立接口层（如 limb 执行、vein 存储），为远程沙箱/替换后端留缝 |
| 16 | **LSP 集成**：language-server 能力 + stdio provider + 模型侧 `lsp` 工具（结构化代码理解，非文本 grep） | 无 | 无 | **完全缺** | 对标 coding agent 必备；Python 侧可接 pyright-langserver |
| 17 | **附件内容寻址存储**：图片附件持久、历史重放、后续轮次回传模型，本地 `DSH_HOME` 存储永不自动删 | 无 | **有**（vein/file_store.py 内容寻址+去重+版本） | **基本已有** | 把 vein 接到聊天附件链路即可 |
| 18 | **Session 投影接缝**：`ctx.sessionProjections` 增量折叠已提交事件，宿主 `stateOf()` 读一份类型态，客户端 `snapshot()` 批量裁剪视图；宿主缺失服务即**显式失败**不静默降级 | 无 | 无 | **完全缺** | OpenMate 前端多处自算会话态（双重状态源老毛病），应改为后端单一投影 |
| 19 | **运行时不变量诊断**：每包可发布 `./invariant`，断言"自有关系"（只查权威事件流/可变数据，不查服务在不在） | 无 | 无 | **完全缺** | 与用户"可观测性"诉求同源；OpenSoul/vital 可加不变量巡检 |
| 20 | **Hook 桥**：Claude Code / Codex 线协议库 + 桥接插件，直接复用两生态的 hook | 无 | 无 | **完全缺** | 兼容 Claude Code hooks 即白嫖整个生态配置 |
| 21 | **Typert 类型图**：从源码生成类型图→加载工件→运行时注册表（RPC 网关共用） | 无（graph-engine 是工作流 DAG，非类型图） | 无 | **完全缺** | 优先级低，但 ACP/RPC 强类型化可受益 |

## 源码亮点（可直接抄的实现细节）

1. **repeat-tool-reminder**（~200行，`packages/guard/repeat-tool-reminder/src/index.ts`）：
   - 阈值递进 `[3,5,8]`：第一次温和提醒，之后详细（工具名+连续次数+规范参数）。
   - include/exclude 是工具名 `*` 通配**谓词**而非注册表引用（`exclude:[mcp_*]` 无 MCP 时仍合法）。
   - 提醒消息带 `MessageSource{kind:'plugin'}` 标签——**不打标签会被派生历史渲染成用户提示**（坑）。
   - 检测比较**完整**规范参数串，提醒里才截断500字符。

2. **goal-round-driver**（568行）：RoundAttempt 三态 `queued→claimed→admitted` + reservation（goalId+revision+round 三元组防陈旧续跑）+ `stale/cancelled` 标记，等整个 agent 静默才释放——这是"自动续跑不打架"的完整答案。

3. **spill-policy**（227行）：第二条臂管**持久日志**副本（`tools/ptc-dispatch-log`）与模型面臂分离；"溢写失败绝不能把成功调用变错"是硬规则。

4. **webhook**：显式声明"无队列、无重试、无去重、无完成状态"，重复投递=重复会话。**用不做什么来定义系统边界**。

5. **session 迁移**：代际路径永不改名/覆盖/删除；读打开不发布继任者，写打开先编码校验再独占发布。

## 可复用设计（OpenMate/OpenSoul 落地排序）

**P0（本周可做，小改动大收益）**
1. 循环卫生 Guard（#9）——防死循环烧 token，200行
2. 工具结果溢写（#5）——复用 vein 后端，接 tools post-execute
3. Plan 模式（#8）——OpenMate 文案已就位，只差实现

**P1（架构债）**
4. 会话 append-only 日志 + 版本化代际（#1）——趁数据量小先定格式
5. 会话投影接缝（#18）——消灭 OpenMate 双重状态源
6. 能力接缝接口层（#15）——为沙箱/远程执行留缝

**P2（战略能力）**
7. 进程沙箱（#2）、Goal 域+自动续跑（#3）、Agent Teams 持久化（#10）、运行时自改（#7）

## 与 Hermes 的对照

Hermes 已有 delegate_task/cron/skill/todo，但缺：goal 持久续跑、工具结果溢写策略、循环重复检测、沙箱分档、会话格式迁移。Hermes 的 MEMORY 压缩机制与 dsh 的 compaction 接缝理念一致，但 dsh 的"可重建+锁三段式"更严谨。
