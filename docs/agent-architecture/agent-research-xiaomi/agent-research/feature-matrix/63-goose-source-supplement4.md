# goose scheduler.rs 全文精读（1792行）— 深夜轮9补验

> 欠账清偿：轮8记录"1792行只读了签名层"，本轮全文读完（功能1-1330 + 测试1332-1792）。
> 源码：~/agent-research-src/goose/crates/goose/src/scheduler.rs + recipe/validate_recipe.rs

## 功能清单（对照OpenMate/OpenSoul）

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **定时任务=Recipe快照复制**：add_scheduled_job(make_copy=true)把recipe字节复制到scheduled_recipes/<id>.<ext>，之后源文件被篡改/删除不影响已排任务；**recipe_base_dir保留原始目录**，sub-recipe/模板include相对路径仍按源树解析 | 无 | 无（hermes_cron存prompt文本，无快照概念） | 完全没有 | hermes_cron加snapshot字段：创建时复制prompt+依赖文件清单，注释"防配置漂移" |
| 2 | **TOCTOU防御全家桶**：O_NONBLOCK\|O_NOFOLLOW打开（防符号链接替换）+打开后二次fstat确认regular file+1MB上限+**take(MAX+1)读后判长**（防验证后文件被撑大）+写入0600权限+写失败删残文件 | 无 | 无 | 完全没有 | 教材级防御性文件IO；OpenSoul任何"读用户提供的配置再执行"路径照抄 |
| 3 | **启动时stale running状态复位**：load_jobs_from_storage对每个job调clear_running_state（上次进程崩溃留下的currently_running/session_id/process_start_time全清）+有变化才回写 | 无 | 无（cron无运行态字段） | 完全没有 | "重启后状态诚实"三件套：running=false/session_id=None/start_time=None |
| 4 | **sync_from_storage磁盘调解**：list_scheduled_jobs每次先读磁盘——外部进程改了schedule.json时内存自动增删对账；**正在运行的job不被同步删除**（currently_running豁免） | 无 | 无 | 完全没有 | 多进程共享cron配置的最小正确实现 |
| 5 | **全生命周期九操作**：add/remove/pause/unpause/update_cron/run_now/kill_running_job/get_running_job_info/sessions(sched_id查该任务历史会话) | 无UI | hermes_cron仅CRUD（轮4已确认缺run_now/kill/pause） | 部分有 | SchedulerTrait 12方法即接口契约，Python 1:1翻译 |
| 6 | **运行互斥**：run_now/update/pause对currently_running的job直接拒绝（"Cannot pause running schedule"）；kill必须先确认在跑 | 无 | 无 | 完全没有 | 状态机守卫一行if |
| 7 | **CancellationToken贯通**：每个运行实例一个token存running_tasks map，kill=token.cancel()，execute_job内agent.reply(...,Some(cancel_token))流式中断 | 无 | 无 | 完全没有 | 与OpenSoul cortex取消机制对接即可 |
| 8 | **5→6字段cron自动转换**：legacy 5字段加"0 "前缀+tracing::warn（旧配置不炸） | 无 | 未知 | 可直接抄 | 兼容性一行 |
| 9 | **调度时全量校验**：validate_recipe_for_scheduling=双格式(yaml/json)解析+schema校验+必须有prompt或instructions+response.json_schema合法性——**非法recipe在复制和持久化之前就拒绝**（测试schedule_add_rejects_invalid_recipe_before_copying_or_persisting明示顺序） | 无 | 无 | 完全没有 | "先校验后落盘"顺序原则 |
| 10 | **sessions(sched_id,limit)历史关联**：session打schedule_id标签→按schedule查最近N次运行会话，可回看每次定时任务干了什么 | 无 | 无（cron运行无session关联） | 完全没有 | 直接对应用户"我都不知道他们在干嘛"；hermes_cron运行记录挂session_id |
| 11 | execute_job运行遥测：session_starts/session_completions/session_duration_ms/session_tokens四个monotonic_counter+exit_type(error/normal)+posthog双事件 | 无 | trajectory有token统计（无cron维度） | 部分有 | cron维度打标session_type="schedule" |
| 12 | execute_job构造：GooseMode::Auto强制+SessionType::Scheduled+recipe无extensions时补充插件MCP server+prompt兜底链（prompt→instructions→报错） | 无 | 无 | 参照 | 定时任务天然无人值守→权限模式必须显式声明 |
| 13 | run_now取消语义：was_cancelled时返回"successfully cancelled"错误而非静默Ok——**调用方能区分取消和失败** | 无 | 无 | 部分有 | 三态返回（ok/cancelled/failed） |

## 源码亮点
- **测试即规格**：`bounded_recipe_read_rejects_source_that_grew_after_validation`（验证后文件被撑大必须拒绝）、`validated_recipe_bytes_and_base_are_persisted_after_source_replacement`（源文件被替换后快照仍有效）——两个测试名就是两条安全声明
- 错误分型：SchedulerError 9变体（JobIdExists/JobNotFound/Storage/RecipeLoad/AgentSetup/Persist/CronParse/Internal/Anyhow），Display+source()完整实现
- 注释教"为什么"：recipe_base_dir字段注释解释相对路径解析缘由；execute_job注释解释为何用原始目录

## 可复用设计
1. **快照+base_dir双字段** = "复制防漂移 + 保留源树语义"，任何"定时执行用户配置"场景通用
2. **防TOCTOU四连**（NOFOLLOW+fstat+size-cap+删残文件）约40行，OpenSoul immune可做成util
3. **磁盘调解sync模式**：内存map+每次读前对账+运行中豁免删除——多实例cron最小方案
4. sessions(sched_id)把"定时任务"和"会话历史"打通 = 可观测性刚需
