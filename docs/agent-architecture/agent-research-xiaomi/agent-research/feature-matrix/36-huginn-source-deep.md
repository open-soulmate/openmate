# Huginn 功能研究（源码级深读）

- 仓库：huginn/huginn（rank 36，autonomous-agent，Ruby on Rails）
- 读取方式：`git clone --depth 1` 到 `/home/climbing/agent-research-src/huginn`
- 读取文件：`app/models/agent.rb`(558行)、`app/models/scenario.rb`、`app/concerns/dry_runnable.rb`、`app/concerns/liquid_interpolatable.rb`、`lib/huginn_scheduler.rb`(214行)、`app/models/agents/*.rb`(74个Agent类型，重点读了 trigger/delay/digest/commander/key_value_store/de_duplication/change_detector/scheduler)
- 覆盖维度：事件流自动化 + 健康自检 + 模板插值 + 干跑调试

## 功能清单

| # | 功能 | 说明（源码依据） | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|------|----------|----------|------|----------|
| 1 | **事件传播引擎（增量拉取）** | `Agent.receive!` 用一条 SQL JOIN links+events，只取 `events.id > links.event_id_at_creation` 且 `> agent.last_checked_event_id` 的新事件，advisory lock 防并发，事务内推进游标，再按 agent 分组入队 `AgentReceiveJob` | 无 | 部分有（nerve/topics.py 只有5个固定NATS主题，无游标） | **完全没有**（增量游标+批量分组入队） | OpenSoul `nerve/event_bridge.py` 增加 per-subscriber `last_seen_event_id` 游标表；200行内可落地，P0 |
| 2 | **Dry-run 沙盒调试** | `DryRunnable#dry_run!`：`readonly!` 锁库→实例级 Logger 捕获带耗时前缀的日志→收 `events/memory/log` 三件套返回给UI，且校验 `can_dry_run?` | 无 | 有类似物（heredity/version_registry 的 dry-run 只针对插件版本迁移） | 部分有（域不同） | 复用 `mirror/sandbox.py`，给 will/workflow 引擎加 dry_run 模式：只读DB + 捕获日志 + 返回模拟事件，P1 |
| 3 | **Liquid 模板插值 + 校验期预检** | `LiquidInterpolatable`：options 里可写 `{{city}}`；`validate_interpolation` 在保存时就跑一遍模板，报错直接拒绝保存；`interpolate_with(event){}` 逐事件切上下文 | 无（prompt 是静态字符串拼接） | 无（未搜到 liquid/jinja 模板层） | **完全没有** | 用 Jinja2 sandbox 实现 `interpolate_with`，保存时 dry-evaluate；这是让"一个 agent 配置适配多事件"的关键，P0 |
| 4 | **能力声明宏（元数据即API）** | `cannot_be_scheduled!` / `can_dry_run!` / `cannot_create_events!` / `can_control_other_agents!` / `no_bulk_receive!` / `default_schedule '6am'`，类级声明+实例级查询 | 无 | 部分有（gene/模板 + plugin_loader 有元数据，但无能力布尔矩阵） | 部分有 | OpenSoul `gene` 模板给每个 agent/skill 加 capability flags，UI 据此隐藏不适用的按钮，P1 |
| 5 | **working? 健康自检协议** | 每个Agent实现 `working?`：结合 `expected_receive_period_in_days`、`event_created_within?`、`recent_error_logs?`；UI 据此打"working/接收不到数据/出错"三态灯 | 有（health-widget.tsx，但只是进程存活） | 有（vital 运维模块，面向系统） | 部分有（缺"业务活性"语义：预期收到却没收到） | 把 `expected_receive_period_in_days` 加到 OpenSoul 定时任务/传感器，vital 判定 idle≠healthy，P1 |
| 6 | **ControlLink：Agent 控制 Agent** | `ControlLink` 5行模型 + `can_control_other_agents!`；`CommanderAgent` 可对目标 agent 执行 run/disable/enable/configure，action 本身也是 Liquid 模板（可按天气/事件条件分支） | 无 | 无（will/dag_planner 只编排自己的节点，不能启停别的 agent） | **完全没有** | 这是 huginn 最独特的自调节能力；OpenSoul `will` 增加 control edge 类型，P2（价值高但需先有权限模型，归 immune 管） |
| 7 | **74 个可组合数据流 Agent** | trigger(JSONPath+9种比较算子+must_match/all)、delay(缓冲队列+keep newest/oldest+emit_interval)、digest(定时聚合+retained_events 滚动窗口)、change_detector(含 last_property 变量可做"新低价"检测)、de_duplication(lookback N 条去重)、gap_detector、peak_detector、key_value_store(Liquid 变量供别的agent读) | 无 | 部分有（sense/link 有若干 connector，但非"可编排的流节点"） | 部分有 | 优先移植 trigger/dedup/digest/change_detector 四个，它们是事件流的"电阻电容"，P1 |
| 8 | **Scenario：Agent 组合的可移植单元** | `Scenario` + `scenario_memberships` 多对多 + tag颜色/图标 + `destroy_with_mode('all_agents'/'unique_agents')`（只删本场景独占的agent）+ `scenario_imports_controller` / `agents_exporter` 导入导出 | 无（workspace 无导出） | 部分有（gene 模板是单 agent 模板） | 部分有 | OpenSoul gene 增加"多 agent 图谱模板"导出/导入 + 引用计数删除策略，P2 |
| 9 | **事件保留策略** | `keep_events_for` 枚举校验 + `new_event_expiration_date` + `update_event_expirations!` 批量过期 | 无 | 无（timeline/trajectory 未见 TTL 策略） | **完全没有** | 轨迹/事件表加 TTL 字段 + 定时清理，100行，P1（省钱省库） |
| 10 | **per-agent 执行锁** | `with_execution_lock(agent_id)` 用 advisory lock 保证同一 agent 不并发跑；`PROPAGATION_LOCK_NAME` 全局锁保证传播只跑一份 | 无 | 无（未搜到 advisory_lock） | **完全没有** | 用 SQLite/PG 行锁或 Redis 实现，防重复触发，P1 |
| 11 | **SchedulerAgent 进程内热调度** | `huginn_scheduler.rb` 用 rufus-scheduler：agent 变更时 reschedule/unschedule，把 `scheduled_at` 写回 memory 做幂等比对；回调里再取执行锁 | 有（cron-picker.tsx） | 有（pulse/timer.py 高精度+漂移校正；api/hermes_cron.py CRUD） | 部分有（OpenSoul 缺"配置变更→自动重排"联动，以及运行状态机） | pulse 与 hermes_cron 打通：CRUD 时调 `schedule_scheduler_agent` 等价逻辑，P1 |
| 12 | **Bulk check 钩子** | `bulk_check(schedule)` 类方法，自定义 Agent 可重写做批量聚合查询（如RSS一次拉全站） | 无 | 无 | 完全没有 | P2，量大时才需要 |
| 13 | **FormConfigurable 表单化配置** | `form_configurable :max_events, type: :number, html_options:{min:1}`，模型自描述表单 schema，UI 自动渲染 | 有（task-choice-menu / smart-prompt） | 无 | 部分有 | OpenSoul gene 用 JSON Schema 描述参数，OpenMate 通用表单渲染器，P1 |
| 14 | **Service 凭证中心** | `UserCredential` + `belongs_to :service`，agent 只引用凭证名，`credential(name)` 运行时取 | 无 | 有（config_manager / immune 相关） | 部分有 | — |
| 15 | **事件排序 DSL** | `SortableEvents` concern + `events_order` JSON 选项（delay agent 可配置缓冲事件的输出顺序） | 无 | 无 | 完全没有 | 小特性，P2 |

## 源码亮点

1. **`receive!` 的增量 JOIN 是整库灵魂**：一条 SQL 同时算出"哪些 agent 该收到哪些新事件"，用 `links.event_id_at_creation`（建链时的水位线）天然避免了老事件重放——新订阅者不会收到历史事件。这个设计比通用消息队列还干净。
2. **`readonly!` 做干跑**：Rails 的 readonly 实例任何保存都会抛错，用一行 ORM 特性就实现了"模拟执行绝不污染真实状态"的安全保证。
3. **CommanderAgent 的 Liquid action**：`{% if conditions contains 'Sunny' %}run{% endif %}` —— 用模板表达控制流条件，让非程序员能写出"天气好才跑"的自调节逻辑。
4. **`scenario` 删除的引用计数语义**：`destroy_with_mode('unique_agents')` 只删"仅属于本场景"的 agent，多个场景共享的 agent 保留——多租户组合的经典解法。
5. **`bulk_check` 是类方法而非实例方法**：把"同类 agent 批量优化"的机会下放给类型作者，框架不管。

## 可复用设计

| 设计 | 复用到 | 工作量 |
|------|--------|--------|
| 事件游标表（receiver_id, source_id, last_event_id） | OpenSoul nerve | 小 |
| `working?` = 业务活性三态 | OpenSoul vital + OpenMate health-widget | 小 |
| Liquid/Jinja 插值 + 保存期校验 | OpenSoul gene/模板 + 提示词 | 中 |
| ControlLink（A 启停/改配 B） | OpenSoul will + immune 权限 | 中-大 |
| Scenario 导入导出 | OpenSoul gene 多 agent 模板 | 中 |
| 事件 TTL 与批量过期 | OpenSoul trajectory/timeline | 小 |
| 4 个基础流节点（trigger/dedup/digest/change_detector） | OpenSoul 事件流 | 中 |

## 对 OpenMate/OpenSoul 的一句话结论

OpenSoul 有"事件总线 + 定时器"（nerve/pulse），但**缺少事件流的全套原语**：增量游标、去重、聚合、变更检测、干跑、自调节控制链。Huginn 证明这些不需要大模型，纯规则就能让系统从"被动问答"变成"主动感知"。建议把 huginn 的 Agent 模型作为 OpenSoul `sense`/`will` 层的参考实现。
