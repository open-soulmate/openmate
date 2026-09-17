# AstrBot 功能研究（源码级升级）

> 升级自 32-44-csv-remaining-batch.md 的 README 级条目 → **源码级**
> 源码：codeload tarball 4.0MB，tar 校验通过，本地留存 `~/agent-research-src/astrbot/`
> 实际读取：pipeline/ 全目录 + agent/（handoff/hooks/tool）+ computer/（local_file_security/computer_client/process_sandbox/booters/olayer 目录级）+ skills/ + cron/ + star/ 目录级
> CSV 第 44 行，40k★，Python，workflow-platform

## 修正 CSV/旧报告认知
- **不是"IM 聊天机器人网关"，是一个完整的 agent 运行时**：9 阶段消息管道 + 多沙箱执行层 + 三源技能系统 + 合成事件 cron + MCP 客户端（821 行）+ 子 agent handoff。
- 有 `openspec/` 目录（规格驱动开发）和 `AGENTS.md`（含 KISS/内联优先/Google docstring 的强工程规约）——工程纪律是 40k★ 的实质原因。
- README 称 "openclaw alternative" 属实，且在**沙箱安全工程上比多数同类更硬核**。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **洋葱模型消息管道**（`scheduler.py` 100 行）：`stage.process()` 返回 `AsyncGenerator` 时，`yield` 即前置/后置分界，下游阶段**递归**执行后再回到本阶段后置逻辑；返回普通协程则不进入下一层（基线条件）；`event.is_stopped()` 统一传播中断 | 无 | 无（`cortex/multi_agent.py` 88 行硬编码流水线） | **完全没有** | **本轮最高价值**。Koa/Express 中间件模式的标准 Python 实现，核心仅 40 行。任何"消息进来到回复出去"的横切关注点（限流/安全/脱敏/计费/审计）都需要它。OpenSoul 现在每个关注点都是散落的 if |
| 2 | **9 阶段显式有序**（`stage_order.py`）：WakingCheck → WhitelistCheck → SessionStatusCheck → RateLimit → ContentSafetyCheck → PreProcess → Process(插件/LLM) → ResultDecorate → Respond。**装饰阶段在响应前、发送阶段最后** | 无 | 无 | 完全没有 | 阶段顺序本身是一份可读的"消息生命周期规格书"，直接可抄为 OpenSoul 的骨架 |
| 3 | **装饰器注册 + 阶段契约**（`stage.py`）：`@register_stage` 进全局列表，排序按 `STAGES_ORDER.index(cls.__name__)`；Stage 抽象仅 `initialize(ctx)` + `process(event)` 两方法 | 无 | 无 | 完全没有 | 加一个横切阶段 = 写一个类 + 在 order 列表加一行，零改调度器 |
| 4 | **内容安全为独立管道阶段 + 可插拔策略**（`content_safety_check/strategies/`）：`keywords`（本地敏感词）与 `baidu_aip`（百度内容审核云 API）双策略实现，同一 `strategy.py` 接口 | 无 | `immune/moderator.py` 有 PII 检测脱敏，但**只挂 `/api/immune` 显式端点，不在消息路径上** | 部分 | 把 moderator 从"可调用的 API"提升为"必经的管道阶段"，并加策略接口接第三方审核（政企刚需） |
| 5 | **限流为独立阶段**（`rate_limit_check/stage.py`） | 无 | `immune/rate_limiter.py` 存在（API 限流），非消息级 | 部分 | 会话/用户级消息限流 |
| 6 | **唤醒检查阶段**（`waking_check/`）+ `umo_auto_name.py`：群聊里判断是否在跟我说话；会话自动命名 | 无 | 无 | 完全没有 | IM 场景刚需；OpenSoul 若接 IM 渠道需要 |
| 7 | **Handoff 工具自带 `background_task` 参数**（`handoff.py`）：子 agent 委派工具的 JSON schema 里显式声明"该任务可能耗时/涉及外部工具/用户无需等待"，**由 LLM 在调用时决定是否后台执行**；另有 `image_urls` 数组支持多模态委派；`provider_id` 允许每个子 agent 覆盖模型 | 无 | `agent_collaboration.py` 有 handoff_context（文本交接） | 部分 | **新发现**：把"是否后台"作为委派工具的参数交给模型判断，而不是由调度器硬编码。与 goose summon 的 async 后台子 agent 互补 |
| 8 | **Agent 运行钩子四点**（`agent/hooks.py`）：`on_agent_begin` / `on_tool_start` / `on_tool_end` / `on_agent_done`，`BaseAgentRunHooks[TContext]` 泛型 | 无 | 无 | 完全没有 | 与 CrewAI 四拦截点**互证升两方**（此前 CrewAI 独家发现，现确认行业模式）。P0 |
| 9 | **TOCTOU 防御的文件访问**（`computer/local_file_security.py` 187 行）：`open_file_in_allowed_roots()` 用 **dirfd + `O_NOFOLLOW` + `O_DIRECTORY` 逐路径分量打开**，不跟随符号链接；`fstat` 校验是常规文件；**`st_nlink > 1` 直接拒绝**（防硬链接别名逃逸）；多 root 时取最长匹配；`create_parents` 用 `O_CREAT\|O_EXCL`；不支持的平台显式 `RuntimeError` 而非静默降级 | 无 | 无（仅 goose TOCTOU 四连，AstrBot 是第二方且更完整） | **完全没有** | **本轮最佳可抄件**。187 行、纯标准库、无依赖，是 Python 侧"受限文件访问"的教科书实现。OpenSoul `immune/` 直接引入即可 |
| 10 | **多沙箱后端**（`computer/process_sandbox/` 941 行）：`base.py` + `bubblewrap.py`（Linux）+ `seatbelt.py`（macOS `sandbox-exec`）+ `unix.py` | 无 | `mirror/sandbox.py` 有代码执行沙箱 | 部分 | bubblewrap/seatbelt 双平台 OS 级隔离；与 AgentScope 8 后端同方向 |
| 11 | **操作层抽象**（`computer/olayer/`）：`browser.py` / `filesystem.py` / `gui.py` / `python.py` / `shell.py` —— 五类操作各自的受控接口，下接 booters | 无 | `limb/executor.py` 固定 RPA 模板 | 部分 | "操作分层"比"工具列表"更清晰的组织方式 |
| 12 | **多启动器**（`computer/booters/`）：`local` / `shell_background` / `boxlite` / `shipyard` / `shipyard_neo` / `cua`（computer-use）/ `bay_manager`；**CUA 空闲超时自动回收**（`cua_idle_state` + `_schedule_cua_idle_cleanup`，会话级 GUI 沙箱不空烧资源） | 无 | 无 | 完全没有 | **CUA idle 回收**是成本控制好件，~40 行 |
| 13 | **技能三源 + 同步进运行中的沙箱**（`skills/skill_manager.py` 916 行 + `neo_skill_sync.py` 372 行）：插件技能 / workspace 技能 / **sandbox-only 技能**三类；`sync_skills_to_active_sandboxes()` 把技能**注入到已启动的沙箱**，带 `.astrbot_managed_skills.json` 托管清单；`neo_skill_map.json` 版本化映射；zip 安装 + `_is_ignored_zip_entry` 过滤 | marketplace/plugins_api 有 skill 安装 | skills.py 存在 | 部分 | **"技能同步进沙箱"是新发现**：沙箱内 agent 也能读到技能，且有托管清单防止沙箱内被篡改。与 privateGPT 只读卷挂载互证 |
| 14 | **技能渲染进 prompt**（`build_skills_prompt()` + `_build_skill_read_command_example`）：技能列表注入时**附带"怎么读这个文件"的命令示例**，并对 Windows 路径做 prompt 安全处理（`_is_windows_prompt_path` / `_sanitize_prompt_path_for_prompt`） | 无 | 无 | 部分 | 小而实用：技能不是罗列名字，而是教模型怎么用 |
| 15 | **cron 合成事件注入主循环**（`cron/events.py` 67 行）：`CronMessageEvent(AstrMessageEvent)` —— 定时任务**伪造一条消息事件**走完整管道，`is_wake=True`，支持 `send_streaming` 流式回复，session 复用原会话 | 无 | hermes_cron 独立于 agent 循环 | **完全没有** | **本轮第二高价值**。"定时任务 = 一条合成消息"让 cron 天然获得管道全部能力（限流/安全/装饰/多平台发送/流式）。比独立 cron 系统优雅得多 |
| 16 | **cron 双类型 + 唤醒主 agent**（`cron/manager.py` 547 行）：`add_basic_job`（纯定时动作）vs `add_active_job`（跑完整 agent 循环）；`_woke_main_agent()`；`run_job_now` 手动触发；`sync_from_db` 启动调解 | 无 | hermes_cron | 部分 | 与 goose scheduler 九操作互补（AstrBot 强在"合成事件进主循环"） |
| 17 | **子 agent 编排器**（`agent/` 提及 `SubAgentOrchestrator`）：handoff 工具可被编排器传入 `description` 覆盖主 agent 所见描述 | delegate_task | multi_agent.py | 部分 | 小件 |
| 18 | **MCP 客户端 821 行**（`agent/mcp_client.py`） | 有 | mcp/server.py + client | 已有 | 需另行比对细节 |
| 19 | **工具图片缓存**（`agent/tool_image_cache.py` 135 行） | 无 | 无 | 待确认 | 多模态工具结果的成本优化 |
| 20 | **插件（Star）系统 2234 行**（`star/star_manager.py` + `register/star_handler.py` 755 行）：动态加载、命令管理、会话级 LLM 管理、会话级插件管理、热更新 `updater.py` | plugins_api | plugin_loader | 部分 | 需下轮深挖 register 的装饰器反射机制 |

## 源码亮点
- **`scheduler.py` 的洋葱模型只有 100 行**，其中真正的调度逻辑 40 行。`isinstance(coroutine, AsyncGenerator)` 一个判断就同时支持"有后置处理"和"无后置处理"两种阶段——用 Python 的生成器语义白嫖了中间件栈，不需要任何框架。
- **`local_file_security.py` 的 docstring 逐个说明 `Raises`**（FileNotFoundError/IsADirectoryError/PermissionError/RuntimeError/ValueError），错误信息里带上**为什么**被拒（"file has multiple hard links and may alias content outside allowed directories. Link count: N"）。这是安全代码的正确写法：拒绝时必须可解释。
- **`cron/events.py` 通过继承 `AstrMessageEvent` 复用整条管道**，而不是为 cron 单开一条执行路径。`send()` 覆写为"发给原 session"，`send_streaming()` 直接迭代生成器。67 行拿到全部平台适配。
- **`handoff.py` 的注释记录了一个真实的坑**："Must assign after `super().__init__()` to prevent parent class from overriding this attribute" —— dataclass 继承顺序陷阱写进注释。

## 可复用设计
1. **洋葱管道 + 9 阶段顺序**（第 1/2/3 条）→ OpenSoul 消息路径骨架，<200 行
2. **TOCTOU 文件访问**（第 9 条）→ `immune/file_security.py`，187 行纯标准库直接搬
3. **cron 合成事件**（第 15 条）→ 让 hermes_cron 的产出走主 agent 管道
4. **Handoff 的 `background_task` 参数**（第 7 条）→ delegate_task 加一个模型可判断的参数
5. **CUA 空闲超时回收**（第 12 条）
6. **技能同步进沙箱 + 托管清单**（第 13 条）

## 行业信号
- **AstrBot 与 goose 是"TOCTOU 防御"两方互证**：一个 Python 一个 Rust，都用 `O_NOFOLLOW` + 逐分量打开 + 二次 fstat。这条从"某个项目的洁癖"升级为"行业基线"。
- **洋葱管道是 IM/消息类 agent 的事实标准形态**（AstrBot 9 阶段 / FastGPT 辅助生成 processor 注入 / LibreChat）。OpenSoul 目前是"端点直连处理器"，缺这一层。
- 40k★ 的国产项目在**沙箱与文件安全**上投入如此之重，说明国内 to-B 场景对"agent 不能乱动文件"的诉求是真实且付费的。
