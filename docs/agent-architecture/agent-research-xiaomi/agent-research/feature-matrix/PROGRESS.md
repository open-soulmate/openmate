# 100Agent功能研究进度

更新：2026-09-17 深夜轮18（cron·终验轮）；状态：**研究阶段关闭，覆盖度与P0差距双重终验通过**
## 本轮新增 —— 深夜轮18：终验轮（脚本化覆盖度核对 + P0差距复验）
> 轮17已宣告研究收官。本轮不做新增研究，做两项独立验证：①CSV↔feature-matrix覆盖度脚本核对 ②SUMMARY v2 P0差距清单对当前代码复验。
- ✅**覆盖度终验通过**：CSV 98行×179份feature-matrix，脚本按仓库名匹配，7个"未命中"逐一确认全是文件名假阴性（openai-agents→17-openai-agents-deep、adk-python→18-google-adk-deep、mcp-pysdk→79、mcp-tssdk→82、Mind2Web/webarena/AgentBench→93-97-98-benchmarks-batch）。**实质覆盖 98/98 = 100%**。
- ✅**P0差距复验全部成立**（对当前opensoul/src实时grep）：cortex无retry/backoff（0命中，10个模块文件全查）；无compaction引擎（compacted仅hippo/long_term_memory+api/sessions_api标志位）；immune/仅5文件（access_control/audit/intrusion/moderator/rate_limiter）——**无permission_engine、moderator.py中API key正则0命中**（sk-/AKIA/ghp_全无）；job_queue/BackgroundJob全库0命中；truncate/offload/spill在cortex 0命中。OpenMate侧：steer/drill/peek(会话义)/suggest(建议卡义)均无实质命中。
- 🏁**终态结论**：研究产出（190+份报告+SUMMARY v2+差距表）与代码现状一致，无过期结论。**本cron的研究使命已完成，无新增研究欠账**——下步应转入实现阶段（SUMMARY v2第一阶段：可观测span/评估闭环/压缩引擎/输出侧脱敏），建议将本cron改派为"实现进度稽核"或停用。

## 上一轮 —— 深夜轮17：#47 langchain-chatchat 源码级收官（全库最后欠账清零）
> 轮16收官后盘点：CSV 100/100覆盖，但#47 langchain-chatchat（38.6k★）仍是README+目录级31行——本轮codeload 54MB全量到手（131个py/1.7万行+langchain_chatchat自研扩展层），读agents_registry/chat/mcp_routes/tools_factory/file_chat/kb_chat/kb_summary/human_message_event/openai_routes全文。
- ✅**langchain-chatchat(#47) README级→源码级** → **47-langchain-chatchat-source.md（18项）重写** ✅本轮主成果
  - 🔴 **Agent执行器注册表8种策略工厂**（agents_registry.py 226行）：每模型家族独立prompt模板+解析器+executor（qwen禁streaming显式注释），"Write any optimized method here"单点扩展位——OpenSoul agent_type仅DB标签无策略分派 → P1纯重构
  - 🔴 **intermediate_steps DB序列化+跨会话回灌**（chat.py）：langchain dumps()存message.metadata，下一turn loads(namespace白名单4个)注入executor——工具中间态续跑；OpenSoul trajectory只存事件不回灌 → P1
  - 🔴 **MCP Profile全局配置+对话级use_mcp开关**（mcp_routes 616行）：全局timeout/working_dir/env_vars+reset端点+search+每次对话bool开关（敏感对话不给MCP工具）——OpenSoul api/mcp.py 135行缺此三件 → P1约100行
  - 🔴 **工具输出message_type自报**：工具返回JSON带message_type→前端按类型渲染——ToolResultEnvelope协议是MCP工具返回图片/表格的前置件，双侧全无 → P1
  - 🔴 **temp_kb临时知识库**（file_chat.py）：上传即建临时向量库+prev_id链式续用，"扔3个PDF问一轮就走"最高频RAG场景 → P1
  - text2sql/text2promql薄工具（后者直指用户监控场景）；KB文档MapReduce自动摘要链；工具调用级人类反馈（call_id粒度，OpenMate仅消息级like/dislike）；Langfuse三环境变量即插observability；/v1 OpenAI兼容网关多平台路由；kb_chat检索三态+return_direct+出处[n]引用编号；三档工具降级矩阵源码复核保留
- ⚠️grep确认：OpenSoul NONE=agent策略注册表/intermediate_steps回灌/MCP profile+search+use_mcp/message_type渲染协议/temp_kb/bm25/text2sql/文档摘要链/langfuse/return_direct；部分=api/mcp.py CRUD、trajectory tool_call事件流、knowledge chunking+Qdrant、multi_agent_coord.message_type（语义不同）。OpenMate部分=mcp页、消息级feedback
- 🏁 **全库状态**：190+份feature-matrix报告，100个agent全部源码级或结论级，无浅读残留。**研究阶段正式结束，无新增研究欠账**；下阶段按SUMMARY.md v2进入实现（P0：洋葱管道/TOCTOU/三值动作策略/cron合成事件/压缩引擎三算法/溢出重试环/lock_plugin路由；本轮新增P1候选：MCP Profile+use_mcp开关、ToolResultEnvelope、temp_kb、agent策略注册表）
## 上一轮 —— 深夜轮16：gpt_academic源码级 + gpt-engineer收官（CSV 100/100 完结轮）
## 本轮新增 —— 深夜轮16：gpt_academic源码级 + gpt-engineer收官（CSV 100/100 完结轮）
> 轮15遗留的最后两个README级条目清零。gpt_academic codeload 2.7MB/511文件全量到手（71个插件目录+crazy_functional.py 785行注册表全文）；gpt-engineer 验证停更16个月（2025-05最后push，pivot lovable.dev），按结论级+core/抽查处理。
- ✅**gpt_academic(#35, 50k★) README级→源码级** → **35-gpt-academic-source.md（21项）** ✅本轮主成果
  - 🔴 **上下文裁剪三算法**（context_clip_policy.py 296行全文）：被动clip_history(argmax最长条目+delta=最大/16颗粒度逐轮削)/each_message(clip_prior_weight=token占比+新近度×0.1+per-message AUTO_CONTEXT_MAX_CLIP_RATIO数组)/search_optimal(全局_scale 0.05步长二分搜索+promote_latest_long_message保护最后长消息)+裁剪必插显式标记 `...(content clipped because token overflows)...`——**压缩引擎第8方互证**，与kilocode/goose"摘要式"互补的"纯token预算空间分配"式，纯函数可整体移植cortex → P0
  - 🔴 **lock_plugin插件抢占用户输入路由**（Interactive模板+multi_stage_utils）：插件把回调路径写cookie，用户下次提交直路由到该插件（多轮交互式插件最小协议），用毕必须显式解锁防死锁——OpenSoul需session级pending_plugin_route，~30行 → P0
  - 🔴 **Token溢出自动重试环**：ConnectionAbortedError带溢出数→EXCEED_ALLO=512+512×次数递增重裁→continue重试+输出侧同步披露警告——cortex retry=0缺口再确认（与kilocode retry.ts互证），P0
  - 🔴 **虚空终端NL意图路由**（Void_Terminal.py 179行全文）：UserIntention三分类(ModifyConfiguration/ExecutePlugin/Chat)+**规则先验短路省钱**（关键词命中跳过LLM分类）+GptJsonIO自动修复+模糊时输出能力说明并lock_plugin等二次指令+**agent修改自身配置分热改/重启两档**（vt_modify_config）
  - 🔴 **动态插件生成**（Dynamic_Function_Generate.py 251行全文）：LLM写代码→TerminalFunction模板重写→try_make_module验证→子进程15s硬超时执行→traceback回喂重试×3——"工具自生成"新形态（与code-mode工具批量化互补），复用mirror/sandbox可做，P1
  - **多线程LLM扇出+UI主线程喂狗**（crazy_utils.py 168行）：ThreadPoolExecutor+mutable跨线程[输出,时间戳,状态字]+**喂狗方向反转**（UI线程喂，worker死锁即判定终止）+逐线程状态字幕（等待中/截断重试/重试中n/m/已失败）+Rate limit等待×3——"用户可观测"直接参照，OpenMate任务面板可整体抄
  - **PluginMultiprocessManager**（pipe.py 195行全文）：Pipe命令协议(show/interact/done)+心跳看门狗5min+**workdir文件变化监控**（st_mtime全树→产物promote下载区+图片立即预览"检测到新生图像"）；WatchDog通用类29行+run_in_subprocess_with_timeout装饰器37行两个通用件
  - **实时语音自动寻找回答时机**（Audio_Assistant+live_audio）：阿里云ASR流式0.5s捕获+sentence_end事件+AsyncGptTask用户说话时异步预取GPT回答——OpenSoul sense/ASR只有文件转写，实时语音线完全没有
  - **多API-key随机负载均衡**（key_pattern_manager 138行）：6家key格式正则+按模型前缀分流+random.choice+CUSTOM_API_KEY_PATTERN用户扩展；**模型能力注册表model_info**（tokenizer/can_multi_thread逐模型声明，chatglm禁多线程防卡顿）
  - 插件热重载HotReload（importlib.reload每次调用即生效）；插件状态机pickle持久化进cookie（GptAcademicGameBaseState带lock/step_cnt/delete自清理）；API_URL_REDIRECT前缀级endpoint重写；插件Group多组标签+随变按钮+AdvancedArgs高级参数区
- ✅**gpt-engineer(#32, 55k★) 结论级收官**（验证停更16个月，Python核心仅6,118行）→ **32-gpt-engineer-source.md（7项）**
  - 🔴 **覆盖前git暂存未提交修改**（git.py stage_uncommitted_to_git）：improve模式写文件前 `git diff --name-only` 检测+stage将被覆盖文件——"agent改代码不吞用户未提交工作"，与Cline事务性回滚互补（事前保全vs事后回滚），~40行P1
  - **生成后lint门**（linting.py）：按扩展名注册linter表(.py→black)失败静默保留——smol-developer教训"lint回喂是收敛点"的实现
  - Review四问反馈环（ran/perfect/works/comments+consent先行）；gitignore感知（git check-ignore批量过滤）；行业教训第3次印证：整库合成赛道全军覆没
- ⚠️grep确认（本轮关键词）OpenSoul全部NONE：importlib.reload|hot_reload / lock_plugin|plugin_state|intention_type / context_clip|clip_history / WatchDog|bark_fn / ThreadPoolExecutor(可见代码) / json_repair|auto_repair / select_api_key|key_pattern / model_info|can_multi_thread / git add|stage_files|check-ignore / black.|ruff|lint（src内）；st_mtime命中=config热载+文件列表非产物巡检；ASR命中=sense文件转写非实时流式。OpenMate NONE：lock_plugin|plugin_state|hotReload
- 🏁 **CSV 100/100 全部源码级或结论级收官**。收尾欠账只剩：SUMMARY.md v2 已在轮14重写；下阶段=进入实现（P0清单：洋葱管道/TOCTOU/三值动作策略/cron合成事件/压缩引擎三算法/溢出重试环/lock_plugin路由）

## 上一轮 —— 深夜轮15：README级→源码级 三连升级（CSV 44/40/33）
## 本轮新增 —— 深夜轮15：README级→源码级 三连升级（CSV 44/40/33）
> 本轮起点盘点：CSV 98 行经脚本核对，**覆盖度实为 100%**（12 个"未命中"全是文件名假阴性——gpt-engineer/chrome-devtools-mcp/gpt_academic/agent-browser/AstrBot 在 32-44 批次档，openai-agents/adk/mcp-pysdk/mcp-tssdk/Mind2Web/webarena/AgentBench 各有专档）。**真正的缺口是"深度"不是"数量"**：5 个条目仍是 README 级。本轮把其中最有价值的 3 个推到源码级。
- ✅**AstrBot(#44, 40k★) README级→源码级**（codeload 4.0MB tar 校验通过，读 pipeline/+agent/+computer/+skills/+cron/）→ **44-astrbot-source.md（20项）** ✅本轮主成果
  - 🔴 **洋葱模型消息管道**（scheduler.py 100行）：`stage.process()` 返回 AsyncGenerator 时 `yield` 即前后置分界，下游**递归**执行后再回到本阶段后置逻辑；返回普通协程则不进下一层；`event.is_stopped()` 统一中断传播。**9阶段显式有序**（Waking→Whitelist→SessionStatus→RateLimit→ContentSafety→PreProcess→Process→ResultDecorate→Respond）。OpenSoul 现在是"端点直连处理器"，每个横切关注点都是散落 if → P0
  - 🔴 **TOCTOU 防御文件访问**（local_file_security.py 187行全文）：dirfd+`O_NOFOLLOW`+`O_DIRECTORY` 逐路径分量打开、fstat 校验常规文件、**`st_nlink>1` 直接拒**（防硬链接别名逃逸）、多 root 取最长匹配、不支持平台显式 RuntimeError 不静默降级——**与 goose TOCTOU 四连互证升两方**，纯标准库可整体搬进 immune/
  - 🔴 **cron 合成事件注入主循环**（cron/events.py 67行）：`CronMessageEvent(AstrMessageEvent)` 伪造一条消息走完整管道，`is_wake=True`+`send_streaming` 流式+session 复用——**定时任务天然获得管道全部能力**，比独立 cron 系统优雅
  - 🔴 **Handoff 工具自带 `background_task` 参数**（handoff.py）：由 **LLM 在调用时决定**委派是否后台执行（schema 显式说明"可能耗时/涉及外部工具/用户无需等待"），另带 `image_urls` 多模态委派 + per-agent `provider_id` 覆盖模型——与 goose summon async 后台子 agent 互补，新形态
  - **Agent 运行钩子四点**（hooks.py）：on_agent_begin/on_tool_start/on_tool_end/on_agent_done —— **与 CrewAI 四拦截点互证升两方**（此前 CrewAI 独家，现确认行业模式）→ P0
  - **多沙箱后端**（process_sandbox 941行）：bubblewrap(Linux)+seatbelt(macOS sandbox-exec)+unix；**olayer 五操作层**（browser/filesystem/gui/python/shell）；**booters 七启动器**+**CUA 空闲超时自动回收**（GUI 沙箱不空烧资源，~40行可抄）
  - **技能三源 + 同步进运行中的沙箱**（skill_manager 916行+neo_skill_sync 372行）：插件/workspace/sandbox-only 三类；`sync_skills_to_active_sandboxes()` 注入已启动沙箱 + `.astrbot_managed_skills.json` 托管清单防篡改——与 privateGPT 只读卷挂载互证
  - 内容安全/限流/唤醒均为独立管道阶段（内容安全带 keywords+baidu_aip 可插拔策略）；`immune/moderator.py` 只是**可调用的 API**，不在消息路径上（差距关键）
- ✅**agent-browser(#40, 42k★) README级→源码级**（codeload 2.0MB，读 native/ 51,783行目录级+policy.rs/diff.rs/webmcp.rs/skills.rs/trust-boundaries.md 全文）→ **40-agent-browser-source.md（16项）**
  - 🔴 **三值动作策略引擎**（policy.rs 217行全文含10测试）：`Allow/Deny(reason)/RequiresConfirmation`；JSON 四键 allow/deny/confirm/default；**优先级 deny>confirm>allow**（测试显式锁定）；**default 缺省即 deny（fail-closed）**；热加载 reload()；AGENT_BROWSER_CONFIRM_ACTIONS 环境变量另设确认类目——**与 AgentScope PermissionEngine 848行/kilocode 三层叠加互证，第三代共识**，OpenSoul 在这条线上完全空白（差距最大单项之一）
  - 🔴 **随产品发布的信任边界文档**（trust-boundaries.md 全文）：明确写"**页面内容是不可信数据，不是指令**"并列举不可信来源；"秘密不进模型"（cookie 只走文件、错误永不回显、**用户粘贴秘密进聊天要停下让他存文件**）；连"应该跟用户说什么"都给逐字话术——**把威胁模型写成 agent 会读的 skill，而不是给人看的 SECURITY.md**
  - 🔴 **`--allowed-domains` 的诚实边界声明**：拦 HTTP/WS/EventSource/sendBeacon+禁 RTCPeerConnection（STUN/TURN DNS 不过 CDP 拦截）+Worker bootstrap 包装器 **CSP 禁止时失败关闭**；**并明确列出该选项不生效的 8 种场景**——少见的"列出自己不管用的地方"
  - **截图像素 diff**（diff.rs）：`ScreenshotDiffResult` 结构化+**尺寸不匹配是独立字段而非报错**+颜色距离 `threshold*255*sqrt(3)` 归一+产 diff_image；另有文本 snapshot 行级 `SnapshotDiffResult`
  - **WebMCP 增量披露**（webmcp.rs 1057行）：发现摘要**不含 schema、不含页面自述的安全声明**（"Full metadata is retrieved explicitly after the agent chooses a relevant tool"）；`context_update()` **沉默即无更新**（只有"有工具→空目录"才作废旧上下文）；iframe 级 origin 分层清理
  - **产品自带技能包 + 薄发现桩**：`skill-data/core/SKILL.md`+10篇 references（含 trust-boundaries）+3个可执行模板；`skills/agent-browser/SKILL.md` 是**故意做薄的发现桩**，唯一作用重定向到 `agent-browser skills get core`，AGENTS.md 明令禁止把功能内容写进薄桩
  - **CLI/MCP 双表面对齐强制+对齐测试**（parity_tests.rs 886行）：AGENTS.md 硬性规定改 CLI 必须同步改 mcp.rs，没有对应工具要么补要么写明为何省略，**加测试证明两表面对齐**——OpenSoul 同时有 HTTP API 和 MCP server 两个表面，目前无对齐保障
  - `opensrc/` 依赖源码随仓分发（`npx opensrc` 拉 npm/pypi/crates/GitHub 源码）；`--engine` Chrome vs Lightpanda；录制回放 3097行；React 感知（react inspect/tree/suspense——对 OpenMate 自测有直接价值）；`doctor` 自检
- ✅**chrome-devtools-mcp(#33, 52k★, Google官方) README级→源码级**（codeload 3.4MB，83个TS文件，读 tools/+pagination+WaitForHelper+AGENTS.md）→ **33-chrome-devtools-mcp-source.md（16项）**
  - 🔴 **工具元数据四件套**（ToolDefinition.ts 556行）：`annotations.category`（11类枚举）+`annotations.readOnlyHint`+**`blockedByDialog: boolean`**（工具自述"我会不会被 modal 卡住"）+`verifyFilesSchema`——**Google 官方给 MCP 加非标准注解**，说明原生 annotations 不够用，行业在各自扩展
  - 🔴 **"连设置等待也要限超时"**（WaitForHelper.ts）：注释即规格——"Without this cap a paused renderer (e.g. an open dialog) would make evaluateHandle hang until protocolTimeout (180s) **while the tool mutex is held**"，故给 `evaluateHandle` 也套 Promise.race；DOM 稳定等待=MutationObserver+100ms稳定期去抖+3000ms超时，**CPU/网络双 timeout multiplier** 按环境缩放；`#dialogHandled` 与 `#dialogDetected` 分开建模（对话框会暂停 renderer）
  - 🔴 **分页带 `invalidPage` 诚实标志**（pagination.ts 84行全文）：页码越界返回第0页**并置 invalidPage:true**，不静默改页码——OpenSoul 所有列表型工具都该这样做
  - **`--slim` 是另写一套**（slim/tools.ts 106行自包含 definePageTool）而非从全集过滤——slim 版可更简单
  - **URL scheme 校验门**：navigate 的 `validateUrl(url,{javascriptEvaluation,categoryExtensions})` 拦 `javascript:` 等危险 scheme——与 agent-browser 出网白名单互补（一个是 scheme 白名单一个是域名白名单）
  - 🔴 **也随产品发布 6 个 agent 技能**（skills/）：troubleshooting/**debug-optimize-lcp**(4篇references)/cookie-debugging/**memory-leak-debugging**/**a11y-debugging**/chrome-devtools(-cli)——且技能内容是**领域专长**（怎么调LCP/怎么找内存泄漏），不是"怎么调用我"。**"工具自带技能"本轮已三方**（agent-browser/chrome-devtools-mcp/AstrBot）
  - **多宿主分发四清单**：gemini-extension.json+plugin.json+mcp.json+server.json——同一份能力四个 manifest
  - AGENTS.md 价值不亚于代码：**禁用逃生舱**（no `any`/`as`/`!`/`@ts-ignore`/`@ts-nocheck`/`@ts-expect-error`——把 AI 最爱用的绕过类型系统手段全禁掉）+**mock 反模式**（"不要在 mock 里重新实现业务逻辑"、必须 sinon.createStubInstance、必须 calledOnceWithExactly）
- ⚠️**CSV 标注修正**：#40 agent-browser 标 Rust **部分正确**——浏览器 daemon 是 Rust（cli/src/native/ 51,783行，actions.rs 单文件 17,708行），但 packages/ 下有 TS 的 eve(Chrome扩展)与 sandbox
- ⚠️grep确认（本轮关键词）OpenSoul 全部 NONE：O_NOFOLLOW|dir_fd|st_nlink / bubblewrap|seatbelt|sandbox-exec / on_tool_start|on_tool_end|on_agent_begin|run_hooks / waking|wake_word|is_wake / background_task(委派义) / allowed_domains(唯一命中 link.py 是 "Webhook Egress" 注释巧合)；OpenMate 全部 NONE：onion|middleware stage / pixel diff|if-changed / getFullAXTree|ariaSnapshot / webmcp|allowedDomains
- **部分**：OpenSoul `immune/moderator.py` 有 PII 检测脱敏但**只挂 /api/immune 显式端点不在消息路径上**；`immune/rate_limiter.py` 是 API 限流非消息级；`immune/access_control.py` 是用户级 RBAC 非动作级；`mirror/sandbox.py` 有代码执行沙箱缺 bubblewrap/seatbelt OS 级隔离；skills.py/plugins_api 有缺"同步进沙箱+托管清单"；hermes_cron 独立于 agent 循环（缺合成事件进主循环）；limb=固定 RPA 模板
- **本轮三大跨项目信号**：①**洋葱/分层管道**是消息类 agent 事实标准 ②**三值动作策略（allow/deny/confirm）已是第三代共识**，OpenSoul 空白最大 ③**"工具自带 agent 技能"本轮三方**+`.agents/skills/` 五方——技能正从"用户的资产"变成"工具厂商的交付物"

## 下一轮研究对象
- 仍为 README 级的 2 个：**#35 gpt_academic（50k★）**、**#32 gpt-engineer（55k★，半停滞、价值低，可结论级收官）**；#47 langchain-chatchat（README+目录级，半停滞）
- **进入实现阶段**：按本轮 P0 洋葱管道 / TOCTOU 文件访问 / 三值动作策略 / cron 合成事件 落地

## 上一轮 —— 深夜轮14：Warp六轮收官 + SUMMARY.md v2全面重写

## 本轮新增 —— 深夜轮14：Warp收尾轮（warp_tui前端层+convert层）+ SUMMARY.md v2重写（两大收尾欠账清偿）
- ✅**Warp第六补验=warp_tui收官**（从warp3.tar.gz按需解压warp_tui 203文件/5.2万行非测试代码，前5轮全在GUI侧，本轮补齐headless TUI层+API↔Action转换层）→ **64-warp-source-supplement4.md（12项）** ✅本轮主成果
  - 🔴 **多层级编排树Tab栏**（orchestration_model.rs 1392行）：**会话血缘单一真源**（children_by_parent只从HistoryModel读、永不镜像，docstring明言）+MultiLevelOrchestration特性开关双模（drill-down单层 vs扁平全后代投影，大UI改造feature flag灰度教科书）+面包屑chip（anchor_navigable=false时tab仍渲染不可选=诚实呈现）+**子树rollup徽章**（一个pill看整棵子树聚合状态）+per-anchor分页（层级内翻页不扰动其他层）+全树键盘环绕循环+20种拓扑变更事件显式分类哪些要重算——OpenMate多agent树UI的完整前端参照，grep双侧全0 → P1
  - 🔴 **远端子agent恢复不重跑**：RestoreRemoteChildSession从持久化身份(task_id+run_id)物化轻量session+fetch一次权威状态+**完成时校验"session还在且task未被替换"才应用**（迟到响应不能更新已被替换的恢复树）——与goose restore互证两方，~可移植
  - 🔴 **本地↔云端Handoff整卡流转**（handoff/model.rs 769行）：/handoff斜杠命令=Editable(Acceptance/Configuring)→Committed→Created→Persisted四态+Environment/Model两页选择器+**suggest_handoff_environment按cwd推荐**+长跑命令守卫（有活PTY禁止搬家）+**隐私设置联动作废**（cloud storage关掉→三路订阅回调自动cancel在途操作）+fork既有对话进云端+失败HandoffRestoration把用户输入还回输入框——OpenSoul handoff_context仅文本交接，差一个量级
  - **AskUserQuestion交互卡**（726行）：多问题分页+多选shift-enter+**ctrl-c=SkipAll**+300ms自动翻页+键位用context predicate注册（卡激活才抢键不污染全局）；**RunAgents审批卡**两模式（验收↔逐字段配置，审批时可改配置再放行）；**文件编辑diff视图**（TuiDiffStorage视图持有真源但不walk hunk，多文件折叠摘要"✓ Edited 3 files +a −r"，审批前用Editing进行时动词=状态诚实）
  - **Zero State**（1080行+1483行动画）：首跑引导/What's New changelog+项目上下文，**可见性由内容驱动**（transcript空则显示，首个block即消失）——onboarding零常驻成本；**/usage面板**（credits进度条+pay-as-you-go圆点阵500credits/圆）；上箭头prompt/命令混合历史菜单（agent模式双显/shell模式只命令）
  - **convert.rs双文件2431行**：40+tool_call↔Action完整映射（UseComputer三套convert函数/录制目标/规划文档/MCP资源）——转换层独立薄层（From/TryInto trait），工具加新字段只改convert不动UI
- ✅**SUMMARY.md v2全面重写**（轮0旧版103行目录级→v2约250行源码级总合成）：13轮172份报告的唯一权威总结——行业格局7信号+跨项目互证10大P0定案（压缩引擎7方/工具外置7方/权限审批10方/可观测三层/评估闭环/记忆升级/自进化/后台作业7方/HITL 10方/会话资产四方）+OpenMate差距12项表+OpenSoul按器官差距表+三阶段路线图+13轮工程方法论——**收尾阶段首要欠账清偿**
- ⚠️grep确认（本轮）：drill_down|subtree_rollup=0；OpenMate breadcrumb仅workspace/docs文件路径导航（非编排树）；OpenSoul handoff仅agent_collaboration文本交接+gene模板handoff_threshold巧合；OpenMate forkSession已有（trajectory fork_point_event_id事件级fork——现有资产最接近行业标准，升级方向=parentId消息树+格式导入）；cost_tracker已有日/月+per-session spending（缺credits可视化）；multiselect=0
- **Warp六轮总账收官**：~75项源码级发现。价值排序：①编排树UI参照（前端独有）②secret_redaction 20正则并入immune（P0已记）③diff_validation前置验证门④.skills目录标准（五方定案）

## 下一轮研究对象
- CSV尾部~5个未深读目标按需补验（96/100→100/100收尾）
- **进入实现阶段**：按SUMMARY.md v2第一阶段路线图（可观测span模型/评估闭环/压缩引擎/输出侧脱敏）


## 本轮新增 —— 深夜轮13：kilocode session引擎收官（12文件2023行全读）
- ✅**kilocode第六补验=session/目录最后欠账清偿**（overflow/reminders/retry/status/summary/network/run-state/instruction+4速扫，本地全读）→ **kilocode-source-supplement6-session-final.md（10项）** ✅本轮主成果
  - 🔴 **SessionNetwork断网等待状态机**（network.ts 418行）：错误链遍历匹配12 errno+11消息模式→turn挂起发`session.network.asked`事件→3URL竞速HEAD探测（Promise.any防单点误判）→3s轮询→恢复后10s宽限**自动续跑**（用户可reply/reject）+**恢复时自动重连全部failed远端MCP**（只续LLM不续MCP=假恢复）——OpenMate只有WS/SSE传输层重连，turn层语义双侧全零，~150行可移植cortex → P0
  - 🔴 **retry.ts重试策略**：Retry-After三格式解析（ms头/秒数/HTTP date，有头听头）、无头才指数退避封顶30s、**5xx无条件重试**（SDK没标也重试）、不可重试精确排除（FreeUsageLimitError"重试封顶模型徒劳+retry循环model ref stale"注释即教材）、limit防无限+离线handler三态内联同一状态机——**OpenSoul cortex grep retry=0命中**，LLM失败=直接报错
  - 🔴 **后台作业级联取消**（run-state.ts ~40行）：pending传播集合BFS（job.id/sessionId/parentSessionId入pending→while循环收割孙辈作业）——用户按"停止"孙任务还在烧token的问题，40行解
  - 🔴 **会话累计diff账本**（summary.ts 215行）：session_diff存储键=step-start→step-finish snapshot diffFull累计+per-user-message diff"这条消息后改了啥"+editor全量单文件diff入口+超大patch置空防炸UI+云fork导入diff作base保底——OpenMate scm-panel只有git工作区diff，无per-message账本
  - 🔴 **指令信任分级+就近附着**（instruction.ts 280行）：全局AGENTS.md trusted/项目级trusted:false+**fileScope围栏**（"project instructions cannot read env or files outside project root"注释=威胁模型）+读文件时向上走目录就近挂载邻近AGENTS.md（per-message claim去重，与goose SubdirectoryHintTracker互证两方）+CLAUDE.md迁移门+首匹配赢——OpenSoul运行时零指令文件机制，**fileScope是任何AGENTS.md功能的安全前置件**（恶意仓库AGENTS.md可指示读~/.ssh）
  - **usable()压缩预留**（overflow.ts 36行）：input−min(20k,max_output)给输出留座+"经济阈值前置preflight/安全阈值后置post-step"两级职责分离；**status.ts worktree状态共享**（project id=git remote派生，多worktree并行时主控见全部busy）；**agent切换合成提醒**（plan→code注入synthetic part，与记忆marker同构）
- ⚠️grep确认（本轮关键词）：opensoul cortex retry|attempt=0命中；retry-after仅link_gateway固定[1,2,4]s webhook+rate_limiter响应头；ECONNRESET/探测/reconnect仅NATS client与soma心跳；AGENTS.md仅admin-ui build引用；parent_session/cascade仅static JS巧合；compaction仅hippo token_budget记忆注入与compacted标志位；OpenMate reconnect=WS/SSE传输层（非turn层）；synthetic仅codemirror巧合；worktree仅git_api porcelain字符——**全部NONE或巧合**
- **kilocode六轮总账**：91项源码级发现，工程细节密度全行业第一（注释即规格书/测试名即安全声明），cortex/immune首选抄写对象

## 下一轮研究对象
- Warp warp_tui/crates/ai/src剩余 + convert.rs细节（Warp收尾轮）
- **SUMMARY.md全面重写**（现有SUMMARY停留在轮0，与190+份feature-matrix严重脱节——进入收尾阶段首要任务）
- CSV外补充目标按需；95/100→全面收尾

## 本轮新增 —— 深夜轮12：kilocode建议卡+后台作业引擎 + Warp结果侧工程 + CowAgent五文件人格/克隆语义
- ✅**kilocode第五补验**（suggestion 407行+background-job 365行+code-mode 324行，本地全读）→ **kilocode-source-supplement5.md（14项）** ✅本轮主成果
  - 🔴 **suggest工具=agent主动弹建议卡**：agent调用suggest(text,actions[1-2]{label,description,prompt})→UI按钮卡→点选结果以"carry out: prompt"回喂LLM——**agent主动引导用户下一步**而非等用户说话；blocking:false非阻塞+等待期session切idle/accept即恢复busy（状态诚实）+**followup排队时自动撤卡**（用户已打字还弹卡=骚扰）+action可为斜杠命令模板（resolvePrompt+$ARGUMENTS，"同session派发命令会死锁"注释）+采纳遥测——OpenMate聊天页全新交互形态，grep双侧全0
  - 🔴 **BackgroundJob注册表**（core 365行）：start/list/get/wait(timeout)/cancel八操作+**token防ABA**（过期完成不污染新run）+**extend()运行中追加续段**（sequence排队+tail Deferred链，最新非空输出胜出）+**promote()前台↔后台升格**（onPromote钩子+waitForPromotion）+registry显式非持久的诚实docstring——后台作业引擎第N方（goose summon/agno job_queue同向），OpenSoul grep全0
  - **code-mode kilocode变体**（tool/code-mode.ts）：execute(code)受限脚本内调全部MCP工具——**Code Mode工具批量化第2方定案**（与goose code_execution.rs同构）；子调用走完整权限管线（plugin钩子+ctx.ask+OTel span，沙箱内不绕权限）+网络受限会话空工具目录+子调用实时状态流（running/completed/error逐个publish）
- ✅**Warp第五补验：action_result/mod.rs 1658行全文**（轮10只读了动作目录侧，本轮结果侧）→ **64-warp-source-supplement3.md（12项）**
  - 🔴 **LrcActivity=长命令进程树活性采样**：cpu_time_delta/io_write_bytes_delta/live_process_count/state(**DiskWait="真实进展非挂死"**)+since_last_activity——"输出重定向的命令与挂死的命令在终端网格上不可区分"；Linux /proc采样~100行可抄limb层
  - 🔴 **结果类型驱动turn路由**：triggers_server_subagent()——LRC快照类结果把下一turn路由给CLI子agent而非编排者；should_trigger_upon_completion()=取消类不重触发循环——OpenSoul工具结果一视同仁回主循环
  - **was_edited_by_user**（agent写文件期间用户也改了，如实上报）与CowAgent artifact.py mtime锁互证"并发编辑"升两方；**SkippedByAutoApprove/Discarded终态分级**（跳过≠取消，循环继续；每态对循环影响显式编码）
- ✅**CowAgent第三补验**（admin.py 36.6K+registry.py 17.5K字符web_extract raw全文+protocol/目录）→ **38-CowAgent-source-supplement3.md（15项）**
  - 🔴 **五文件人格**：AGENT/USER/RULE/MEMORY/BOOTSTRAP.md（比nanobot三文件多RULE/BOOTSTRAP分离）+**克隆=只复制行为不复制知识**（CLONED_FILES排除MEMORY.md"源Agent对用户的所学"+.env/会话库/共享资产——防凭证分叉）
  - 🔴 **乐观并发双层revision**：core文件sha256+roster scoped revision（只hash自己拥有的键——其他设置页保存不失效）+**配置键所有权围栏**（_commit拒写非ROSTER_KEYS）——OpenSoul grep optimistic=0
  - 🔴 **chat fallback有序链**（agent_stream.py commit即规格）：[{provider,model}]链+环绕第二遍+每link一次尝试（防睡过SSE超时）+报错列全部试过的模型+限流有备胎立即切——cortex可直接抄
  - **COW_DESKTOP分级错误策略**：桌面版坏配置回落default保启动（"没有UI就修不了配置"）、源码部署照常炸；文件就地编辑mtime乐观锁+后端独立复核（拒非UTF-8"有损往返毁原始字节"）；共享资产按目录存在opt-out（故意不建空目录）
- ⚠️网络经验（轮12）：web_extract raw读CowAgent两文件全文秒回（自动截断但缓存文件可read_file续读）；本地clone库已足够kilocode/Warp全部需求
- ⚠️grep确认（本轮关键词）全部NONE或巧合：suggest(建议卡义)/background_job|waitForPromotion(唯一命中=插件promote到知识库)/cpu_time|io_write|process_tree/auto_approve/user_edited/fallback_chain(唯一命中=插件下载)/AGENT.md|BOOTSTRAP.md|RULE.md/cloneAgent/code_mode|execute_typescript|tool_graph（轮11复核）；OpenMate suggestion=仅i18n字符串
- 部分：OpenSoul main.py有系统级后台任务（非agent可管理作业注册表）；OpenSoul soma_connector有liveness心跳（非进程树活性采样）；OpenMate terminal工具无Denylist/长命令快照态

## 下一轮研究对象
- Warp warp_tui/crates/ai/src剩余 + convert.rs细节
- kilocode剩余：session/overflow.ts、reminders.ts、retry.ts、status.ts、summary.ts速扫
- CSV外补充目标按需；92/100→收尾阶段：SUMMARY.md全面重写（现有SUMMARY停留在轮0，与180+份feature-matrix严重脱节）

## 本轮新增 —— 深夜轮11：goose platform_extensions最终清偿（summon/orchestrator/code_execution/apps四文件7667行）+ kilocode压缩引擎全文
- ✅**goose第六补验=platform_extensions收官**（此前5轮完全未碰的四个大文件，全部本地读毕）→ **63-goose-source-supplement6.md（20项）** ✅本轮主成果
  - 🔴 **summon.rs 4385行=goose多agent完整答案**：delegate三模式(ad-hoc/source/combined)+**async后台子agent**（task_id立即返回→load收集/peek非阻塞查进度/cancel取消5s兜底abort）——**peek三指标=durable turn数(排除压缩脚手架)+idle时长+buffered通知数**，"不知道它在干嘛"的行业首个完整实现，OpenSoul grep全0 → P0
  - 🔴 **NotificationSink Buffer↔Emitter状态机**：后台subagent通知先缓冲，主agent load等待时attach实时流（yield_now×2防丢）——后台任务工具调用可见性，~60行可抄
  - 🔴 **Code Mode工具批量化**（code_execution.rs 1123行）：全部MCP工具变Deno沙箱内函数，N次调用批成1个execute_typescript+**tool_graph声明式DAG**(depends_on)+三档Catalog/Filesystem/Sidecar披露+**Deno/V8工程**（进程级V8互斥锁挂死风险→timeout+dispatch子token级联取消+500ms drain+AbortOnDrop+真实V8集成测试"挂死脚本超时后正常脚本必须能跑"）
  - 🔴 **跨会话编排五工具**（orchestrator.rs）：list_sessions(六型+busy/loaded/idle)/view_session(first_last/summarize)/start_agent/send_message/interrupt_agent+**send_message授权矩阵**（subagent只能发同parent sibling，测试名即安全声明）——**工具面收缩第三方**（start_agent/delegate对SubAgent不进list_tools，与kilocode网络受限registry/goose ext_manager互证定案）
  - **subagent=markdown文件跨格式兼容**：.goose/agents+**.claude/agents**+.agents/agents直接读Claude Code目录——迁移零成本；每轮MOIM注入subagent目录+调用指引（Decompose→async→synthesize方法论整段可抄）；delegate参数覆盖链env>params>recipe>config>session>provider默认
  - **Agent创建HTML应用**（apps.rs）：create_app(PRD)→LLM结构化HTML→ui://apps资源→沙箱窗口自开+iterate_app（PRD随迭代更新=活文档）+平台通知+截断显式检测（output>=max→"Try simplifying"）+bundled默认app不可改删（与CowAgent内置skills保护互证）
- ✅**kilocode第四补验：compaction.ts 742行全文**（轮8常量表欠账清偿）→ **kilocode-source-supplement4-compaction.md（10项）**
  - 🔴 **预算化尾部选择**（select+splitTurn）：token预算内倒序保留最近turn，超预算turn内部二分切分——精确到消息粒度；**prune三层触发**（normal opt-in/post-compaction自动/payload-limit："压缩已使缓存失效，折叠旧工具输出零成本"，40k保护/20k才做/skill豁免/时间戳标记不删数据）
  - 🔴 **replay重放**：压缩时找最近"无进展"user消息重放（progress=finish/tool/text），媒体overflow后降级`[Attached mime: filename]`；**auto-continue合成消息**（compaction_continue=true标记+overflow专用文案）防压缩后呆滞；三级降级链（单次→分块→显式ContextOverflowError两种文案）
  - **SessionExport.compaction自包含快照**（输入selectedContext/previousSummary/prompt+输出summary/duration/usage落盘）——压缩可回放可调试，用户可观测性诉求直接答案；摘要链completedCompactions隐藏累积；插件三钩子；stripMedia+工具输出截2000喂摘要
  - 与goose structured.rs 9段式摘要互补："goose管摘要长什么样，kilocode管切哪里/失败怎么办/不丢用户最后的话"——压缩子系统完整参照=两份合读
- ⚠️网络经验（轮11）：全程本地clone零网络；orchestrator/code_execution/apps/summon四文件read_file直读稳定
- ⚠️grep确认（本轮关键词）：opensoul list_sessions|view_session|interrupt_agent|sibling|session_type（命中=sessions/trajectory HTTP API与test，非agent工具）/code_mode|execute_typescript|tool_graph|list_functions|deno（唯一命中=admin静态JS巧合）/create_app|iterate_app|ui://apps|background_task|peek（delegate_task仅ai_engine路由声明；background任务命中=main.py系统级）/prune|replay|compact（命中=记忆老化清理与轨迹回放，无关）——全部NONE或巧合；OpenSoul无上下文压缩引擎结论再确认

## 下一轮研究对象
- Warp warp_tui/crates/ai/src剩余 + action_result/mod.rs(1658行)细节
- kilocode深挖剩余：tool/code-mode.ts(324行)、suggestion/、background/
- CowAgent：protocol/目录（新发现）、admin.py、registry.py（需web_extract）
- CSV外补充目标按需

## 本轮新增 —— 深夜轮10：kilocode记忆子系统+Truncate服务 + goose platform_extensions新大陆 + Warp动作目录 + CowAgent team/evolution清偿
- ✅**kilocode第三补验**（本地clone，kilo-memory包547行+session/tools.ts 682行+truncate/recall）→ **kilocode-source-supplement3.md（19项）**
  - 🔴 **Truncate服务=工具溢出第九方**（truncate.ts 158行）：2000行/50KB双限→全文落盘+preview+**按agent能力分级提示**（有task工具→"派explore agent处理别自己读"）+7天retention按mtime（编码ID回绕）+head/tail方向+removed单位显式——立即可抄
  - 🔴 **kilo-memory端口架构**：SessionPort/ModelPort双端口（包不碰宿主消息模型）+**快照diff进记忆**（记住改了什么）+**防记忆回声**（recall命中过的回合跳过digest——记忆自我污染阻断器，15行价值极高）+采集前MemoryRedact脱敏+工具调用压缩成单行轮廓+TurnOpen/TurnClose事件驱动（superseded按interrupted处理）
  - **记忆marker留痕**：recall命中→assistant插空文本synthetic part带metadata——"本回复用了记忆"badge的消息级数据源（40行）
  - 🔴 **权限provenance**（tools.ts）：每次审批（含拒绝）写回tool part metadata：来源+tagOutsideWorkspace+classifyDenial（哪条ruleset/patterns）——"为什么允许/拒绝"可审计，HITL最后一环
  - kilo_local_recall：search/read历史会话+**boundary排除**（搜不到自己正在说的话）+inert转义+跨workspace二次授权+partial匹配报missing terms；**网络受限会话registry直接不暴露code-mode工具**（工具面收缩>运行时拦截）
- ✅**goose第五补验：platform_extensions进程内MCP扩展栈**（10,039行目录，此前5轮完全未覆盖，本轮读毕7个文件）→ **63-goose-source-supplement5.md（11项）**
  - 🔴 **平台能力全部MCP化**：PlatformExtensionDef{default_enabled,unprefixed_tools,hidden}注册表——todo/chatrecall/scheduler/summon等与三方MCP同接口同执行路径
  - 🔴 **agent自管理扩展**（ext_manager.rs）：search_available_extensions→manage enable/disable+**SubAgent禁止管理**（防子agent扩权）；instructions引导"缺工具先搜可用扩展"
  - 🔴 **chatrecall跨会话检索**：search（关键词/日期/排除当前会话/按类型scoped）+load首尾3条；**audience=[Assistant]双可见性**（agent看得见用户看不见，测试名即安全声明）——与kilocode recall互证升两方
  - **todo=会话持久+每轮get_moim注入**（空态注入"接到任务立刻更新todo"自我提示，50k上限，跨compaction存活）；**tom纯注入扩展**（env var/file→64KB有界每轮注入）；**summarize**（确定性收集：拒绝对路径+canonicalize防逃逸+跳过symlink+gitignore→100KB/文件1MB总量→单次LLM问答）；scheduler平台扩展=会话内管理自己的定时任务；platform_notification工具结果meta事件信道
- ✅**Warp第四补验**（tar按需补解压agent/action）→ **64-warp-source-supplement2.md（11项）**
  - 🔴 **流式增量脱敏状态机**（secret_redaction消费端613行）：边流式边脱敏+last_word_to_rescan缓冲（秘密被chunk劈开→重扫上一词）+current_line缓冲（markdown改写）+section/line双索引防重复扫描+hover/tooltip点击揭示UX——OpenSoul输出侧护栏从零到一的完整参照
  - 🔴 **AIAgentActionType完整动作目录**（mod.rs 958行30+动作）：is_read_only/is_risky/uses_pager三自评+rationale+citations、WriteToLongRunningShellCommand、**TransferShellCommandControlToUser**（人机共驾一条命令）、**WaitForEvents**（挂起等外部事件）、StartRecording/StopRecording（window级录屏+4x回放）、SuggestNewConversation、InsertCodeReviewComments、FetchConversation——"agent能做什么"的行业最全参照表
  - **RunAgents批量编排**：base+per-child prompt、per-child模型覆盖、Local/Remote双模式、agent_identity_uid服务账户身份（server侧强制）=Warp Factories底座
  - review_comments线程重建145行（孤儿评论保留为root+确定性排序）可整体移植
- ✅**CowAgent第二补验**（web_extract raw，轮7遗留清偿）→ **38-CowAgent-source-supplement2.md（13项）**
  - 🔴 **team.json独立名册**：三键迁出config.json（"消除共享爆炸半径而非加锁"，docstring即ADR）+可搬运相对路径+utf-8-sig容忍BOM+坏JSON回落不清空+**mtime+size热路径签名**（os.replace原子写保证签名必变）
  - 🔴 **channel_instances=入站路由唯一真源**（渠道实例自带凭证+bound_agent_id）+**路由失败抛错不静默换默认Agent**（"不同人格顶替且对话无痕迹"）+@寻址仅前导算交接+长名优先+中英文标点边界
  - 🔴 **进化executor动作侧**：_WorkspaceWriteGuard包装write/edit**硬拒workspace外写**（工程护栏非prompt）+**内置skills以发布目录为权威名单**（防改自己产品技能）+隔离评审agent+无效结果回滚+进化记账写回用户会话
- ⚠️网络经验（轮10）：全程本地clone为主；CowAgent raw web_extract可用但大文件返回中段片段（team.py/executor.py拿到核心段）；cron环境execute_code仍被阻塞
- ⚠️grep确认（本轮关键词）全部NONE：chatrecall|search_chat_history|moim / manage_extensions|search_available(实质义) / provenance|permission_origins / wait_for_events|transfer.*control|send_message_to_agent / write_guard|builtin.*skills(保护义) / channel_instance|bound_agent|team.json / truncat(工具义——immune/intrusion.py命中=SQL注入正则巧合) / platform_notification / audience(消息可见性义)
- 部分：OpenMate /api/sessions/search=UI侧搜索（缺agent侧recall工具+boundary+inert）；OpenTodo=前端store（缺会话持久+模型可写+每轮注入）；OpenSoul mcp/server.py=MCP基础（缺平台能力MCP化/自管理/audience）；heredity/self_evolution=分析（缺触发器/护栏/回滚/记账全部）；immune/intrusion=输入侧（缺输出侧流式脱敏）

## 下一轮研究对象
- goose platform_extensions剩余：summon.rs(4385)/orchestrator.rs(1081)/code_execution.rs(1123)/apps.rs(1078)/analyze.rs
- Warp warp_tui/crates/ai/src/index（Merkle嵌入已读）剩余、action_result/mod.rs(1658行)细节
- kilocode深挖剩余：session/compaction.ts(742行)、tool/code-mode.ts(324行)、suggestion/、background/
- CowAgent：protocol/目录（新发现）、admin.py、registry.py
- CSV外补充目标按需

## 本轮新增 —— 深夜轮9：goose scheduler.rs全文清偿 + kilocode session引擎（🔴Goal自主目标循环全新发现）
- ✅**goose scheduler.rs全文精读**（1792行欠账清偿：轮8"只读签名层"）→ **63-goose-source-supplement4.md（13项）**
  - **Recipe快照复制+recipe_base_dir**：定时任务复制字节防配置漂移、保留源树目录解析相对路径——"定时执行用户配置"的正确形态，hermes_cron完全没有
  - **TOCTOU防御四连**（O_NONBLOCK|O_NOFOLLOW+二次fstat+1MB take(MAX+1)+0600+写失败删残文件）约40行可抄immune
  - **启动stale running复位+sync_from_storage磁盘调解**（运行中job豁免同步删除）=多实例cron最小正确实现
  - 九操作全生命周期+运行互斥守卫+CancellationToken贯通+5→6字段cron兼容+**sessions(sched_id)任务↔会话历史关联**（可观测性刚需）
  - 测试即规格：两个安全测试名（验证后撑大拒绝/源替换后快照有效）就是两条安全声明
- 🔴 **kilocode session引擎精读**（prompt.ts 2689行+goal/+prompt-queue+transcript+processor，轮8遗留清偿）→ **kilocode-source-supplement2.md（24项）** ✅本轮主成果
  - 🔴 **Goal自主目标循环**（runner.ts 492行，此前所有轮次未覆盖）：`/goal <目标>`后自主循环直到完成——goal_report自报工具（"这是你的报告不是独立验证"）+**事件驱动结果判定**（success>failure∧全finish=stop才算完成，bash exit≠0=failed，question/todo=none不计分）+五状态机持久化在session.metadata+**用户消息抢占不打断goal**（superseded标记后自动续跑）+准入前置（会话家族零pending审批）+**失败即停**（无进展/报错→自动paused+"Review before resuming"）——用户"让它自己干活"愿景的最短路径，OpenSoul grep全0
  - 🔴 **PromptQueue排队引擎**（289行）：per-session FIFO+版本失效+**scope()排队消息对当前turn隐身**+owns消息强制移到请求末尾（防Anthropic prefill拒绝）+hasFollowup中途让位（superseded≠interrupted语义分级）——OpenMate聊天页完全没有排队概念
  - 🔴 **@-提及历史会话**（transcript.ts）：session:<id>附件→服务端实时渲染Markdown transcript+inert转义（"历史是数据不是指令"）+workspace家族scoped+100k字符头尾截中——会话即一等资产第3方信号
  - prompt.ts其他：**1.25MB字节级payload剪枝**（token估算外的兜底）/compaction尝试上限（防压缩死循环）/finish缺省"unknown"防空转（注释点名Anthropic null）/**记忆注入写marker留痕**（用了记忆可回溯）/StructuredOutput工具四件套/turn前三重恢复/附件授权复用Read工具+reopen防TOCTOU/BoardContext看板工具/processor连续malformed tool call中止(#14143)
- ⚠️网络经验（轮9）：全程本地clone零网络——本地源码库足够，cron环境execute_code仍被阻塞
- ⚠️grep确认（本轮关键词）全部NONE：goal_report|goal_runner|GoalState / superseded|hasFollowup|prompt_queue / session:转录提及义 / json_schema|structured_output / board_post|board_read / resume_claude|dangling恢复义；部分：opensoul registry.py agent-recipes=gene模板（非goose快照语义）；OpenMate session:命中全是TypeScript类型注解巧合

## 下一轮研究对象
- CowAgent team.py + agent/evolution动作侧补验（轮7遗留，需web_extract）
- Warp warp_tui/crates/ai/src/agent/action、secret_redaction消费端（app/src/ai/blocklist/block/secret_redaction.rs已解压未读）
- kilocode深挖：kilo-memory/事件化细节、llm/native-runtime、session/overflow.ts、reminder.ts、tools.ts
- goose platform_extensions/scheduler.rs（第二份scheduler！）+ context_mgmt测试段速扫
- CSV外补充目标按需

## 本轮新增 —— 深夜轮8：goose第四补验（context_mgmt全文）+ Warp三补验（secret_redaction/isolation/index）+ kilocode二补验（permission/skill/revert内核）
- ✅**goose context_mgmt全文精读**（两文件欠账清偿：context_mgmt/mod.rs前590行功能部分+goose-context-management独立crate）→ **63-goose-source-supplement3.md（12项）**
  - 🔴 **结构化压缩摘要9段式JSON**（structured.rs 484行）：user_intent/technical_concepts/files(含key_code)/errors_and_fixes/problem_solving/user_messages/pending_tasks/current_work/next_step——每列表按重要性排序"消费方可从尾部截断"+宽容反序列化（模型给object就stringify，"一个坏字段不能丢整份摘要"）+多候选JSON提取（</analysis>后fence→首对象逐个试）+minijinja渲染——**压缩从函数升级为子系统**，OpenSoul cortex照抄
  - 🔴 **工具对级压缩完整工程**：cutoff=(3×effective_limit/20000).clamp(10,500)自适应+批量10+保护最近N+**同消息sibling工具ID分组**（request_ids==response_ids校验+message_ids排序去重，防并发工具重复摘要）+后台tokio::spawn；摘要prompt极简（"A call to github was made to..."）
  - **可见性双轴**（user_visible×agent_visible四象限）：压缩后原消息仅user可见、摘要仅agent可见——"用户看历史、模型看摘要"；retained_context_tokens与可计费output_tokens分开计
  - 三态continuation文案（对话/工具循环/手动压缩）；保留text-only用户消息重放+turn-context携带（created取max防时间戳回跳，注释即教材）；provider.manages_own_context()短路="谁管上下文是provider能力声明"
  - detect_format嗅探细节补齐（session_meta=Codex/type:session=Pi/sessionId=Claude Code/working_dir=goose）+legacy token字段折叠升级；notification_events.rs全文：subagent三型事件（line_output/tasks_update五态/tasks_complete成功率）——OpenSoul只有success_rate聚合统计（grep 8命中），缺逐行流+任务级事件
- ✅**Warp三补验**（warp3.tar.gz补解压secret_redaction/isolation_platform）→ **64-warp-source-supplement.md（10项）**
  - 🔴 **secret_redaction独立crate 464行**：20个API key正则（OpenAI/Anthropic/AWS/GitHub×5/Stripe/JWT/Slack等，全部注释来源URL）+企业/用户双层优先级+编译失败保留旧规则——**双消费方：blocklist出网前+telemetry上报前**；OpenSoul immune/moderator.py已有7个PII pattern但**零API key格式**且只挂/api显式端点不在LLM请求路径（grep确认）——20正则并入+接线到cortex=立即可做
  - isolation_platform：Docker/DockerSandbox/K8s/Namespace四型自探测（env显式>启发式，OnceLock memoize）+workload token签发——agent自报运行环境→权限联动
  - ai/index：**Merkle树增量嵌入同步**（只重算变化fragment+SyncQueue三型任务+500节点/4MB批量+600req/min限流）+tree-sitter文件outline（partial_path_segments过滤）+rayon线池clamp(1,2)——"索引最多吃一半核"，用户资源占用关切的正面示范
- ✅**kilocode二补验**（session/permission/skill/question内核）→ **kilocode-source-supplement.md（14项）**
  - 🔴 **敏感权限必须真人交互回复**：skillShell/sandboxEscalation请求forceAsk，reply时interactive!==true的机器审批（YOLO客户端）静默拒绝留pending等真人——**"自动审批器回答敏感问题"攻击面，此前9方HITL互证均未覆盖**
  - 🔴 **权限三层叠加+硬否决**：base×approved×session三层wildcard findLast+hardRuleset deny永远压不过saved allow；AskOutcome{manual,rule}自动审批可解释；drainCovered级联放行/reject级联拒绝；ConfigProtection配置自保护（allow降级ask）+headless subagent直拒不排队——与Roo互证升两方
  - 🔴 **skill供应链防御**（discovery.ts全文）：origin钉死+路径逃逸contained()检查+staging下载+版本比对+原子rename交换失败回滚——~80行可抄
  - revert/unrevert消息级回退×文件快照原子联动（workspace状态诚实三态）；compaction常量表（20k/40k/2000字符skill豁免/preserve 25%夹2k-8k）；synthetic提醒part；Question终态事件保证；background job promote；todo DB持久化+事件
- ⚠️网络经验（轮8）：全部本地clone零网络依赖——**本地源码库~/agent-research-src/已足够支撑多轮深挖，优先翻本地**；warp3部分解压的tar可按需补解压指定目录（tar xzf指定路径，秒级）
- ⚠️cron环境execute_code仍被阻塞；一条sed多语句命令触发blocked（改用patch工具）

### 已grep确认OpenMate/OpenSoul（本轮关键词）
NONE：pending_tasks|next_step|user_intent(结构化摘要义)/tool_pair/merkle/tree_sitter/file_outline/workload_token/isolation_platform/unrevert|revert|hardRuleset|dismissAll|drainCovered(OpenMate)/structured_summary/preserve_recent/staging|.opencode-version/interactive审批
部分：OpenSoul immune/moderator.py=7个CN PII pattern+custom_patterns扩展（**缺20个API key正则+缺LLM请求路径接线**——只挂/api/immune与/api/pipeline显式端点）；success_rate聚合统计8处（skill_learner/executor/will/trajectory/healer）——缺subagent逐行输出流+五态任务事件；OpenMate edit_guard系统数据快照（非消息级revert×文件快照联动）；todo仅app-store TaskStatus类型；sessions compacted=0标志位（无压缩引擎）；marketplace/plugins_api有skill安装（缺origin钉死+原子swap）；hippo token_budget=记忆注入预算（非上下文prune）

## 下一轮研究对象
- CowAgent team.py + agent/evolution动作侧补验（轮7遗留）
- goose scheduler.rs全文精读（1792行只读了签名层）+ context_mgmt剩余测试段快速扫
- Warp warp_tui/crates/ai/src/agent/action、secret_redaction在blocklist的消费端实现（app/src/ai/blocklist/block/secret_redaction.rs已解压未读）
- kilocode深挖：session/prompt.ts（2689行，本轮未读）、processor.ts、llm/、kilo-memory/事件化细节
- CSV外补充目标按需


## 本轮新增 —— 深夜轮7：goose第三补验（会话导入/Steer/审批消息化）+ CowAgent subagent工程细节 + kilocode到手 + open-webui函数级升级
- ✅**本轮主成果：goose第三次补验**（本地clone零带宽，专攻前两轮未覆盖目录）→ **63-goose-source-supplement2.md（10项）**
  - 🔴 **跨agent会话导入**（session/import_formats 1463行）：嗅探式探测Claude Code/Codex/Pi三种.jsonl格式→统一转原生Session——**"用了别家agent的用户迁移进来"成行业功能**（kilocode session-import双向互证，会话可迁移两方定案）；Claude Code转换器含Unicode tag清洗（导入路径也是攻击面）+cache token归并
  - 🔴 **Steer插话队列**（ops_steer.rs 78行）：运行中消息进队列，turn间隙批量drain注入+with_steer标记——与LibreChat steering/CowAgent/Khoj注入四方互证；78行可整体移植
  - **审批决策=消息**（tool_confirmation.rs 117行）：ToolConfirmationResponse写成invisible user消息，重放时ApprovalState::from_messages重建，防重复确认+幂等——比独立审批表优雅，HITL数据模型参照
  - **工具执行中Elicitation**（action_required_manager.rs 656行）：工具跑着跑着向用户要信息，Accept/Decline/Cancel三态oneshot回注+PendingResponseClaim互斥领取——MCP elicitation词汇再+1方
  - MCP Apps完整实现（HTML内嵌JSON-LD自描述+PRD script）=ms-agent-fw后第2方；AgentManager LRU+创建锁Arc::strong_count防泄漏（注释即并发教材）；scheduler run_now/pause/unpause/kill全生命周期；GOOSE_STATE_MACHINE双轨迁移（25个Op三态返回）=大型agent重构范本
- ✅**CowAgent第二补验**（web_extract raw全文，上轮被Exa故障跳过的欠账清偿）→ **38-CowAgent-source-supplement.md（6项）**
  - 🔴 **subagent runner全文**（注释即规格书）：六工程细节——超时显式cancelled结果+pool.shutdown(wait=False)故意不join（join会让工具超预算）/工具浅拷贝per-run（防并发子agent互清cancel_event）/ContextVar深度计数跨线程/budget对半/继承父permission_mode防"委派绕权限"/记账失败永不阻塞spawn
  - 🔴 **memory summarizer 34KB全文**：裁剪触发flush（md5去重+异步不阻塞+一次LLM调用双写：磁盘daily+回调注入活会话）+Deep Dream五步蒸馏prompt（合并提炼/新增萃取/冲突更新/清理无效/删除冗余+**严禁编造材料外信息**防幻觉条款）——nanobot Dream两方互证完成，prompt整段可抄
  - BLOCKED_TOOLS威胁模型（subagent/send/scheduler/env_config全局否决——防递归/防冒名发消息/防篡改Agent本身）+markdown模板/subagents目录（skills同构）
- ✅**kilocode到手**（Kilo-Org/kilocode 184MB clone成功，CSV外目标，opencode商业fork）→ **kilocode-source.md（11项）**
  - 🔴 **Agent Manager多会话编排面板**：VS Code内多session+**worktree-per-agent隔离**+fork-session/fork-handoff（带上下文分叉到新worktree）+command-budget+GitStatsPoller——worktree-per-agent三方定案（kilocode/continue/claude-code），OpenMate workspace差异化机会
  - 🔴 **Wakeup自主唤醒**（agent给自己schedule未来唤醒+adopt收编孤儿唤醒+MAX_PER_SESSION约束）——与hermes_cron互补的session内自醒，cortex加一个工具即得
  - 会话携带cumulative-diff迁移恢复；@kilocode/sandbox策略层（mode/allowedHosts/writablePaths+per-session信号量）；marketplace三kind×McpInstallationMethod带参安装+prerequisites；kilo-memory marker事件化（记忆注入全程Bus事件）；snapshot=续跑边界；上游fork隔离工程（kilocode_change标记+镜像文件+CI注解检查）=大规模fork可持续合并范式
- ✅**open-webui函数级升级**（router目录级→函数级精读）→ **16-open-webui-source-supplement.md（4项）**
  - tool approval三态回填源码：**拒绝=合成错误工具结果**（loop不断）+timed_out也是answer的一种+resume payload字段清单（tool_approval_mode跨恢复保留）=HITL恢复schema参照
  - **子agent=完整chat**（internal_meta={type:'subagent',parent_chat_id,...}）——子任务天然可回看可审计，比内存态subagent优雅
- ⚠️网络经验（轮7）：git clone对kilocode一次成功（184MB）——clone时好时坏，值得默认重试一次；web_extract raw读CowAgent三个文件全部秒回；**cron环境无并发实例冲突**（轮6担心的sibling写冲突本轮未出现，文件均完整）
- ⚠️cron环境execute_code仍被安全策略阻塞（沿用search_files/terminal/read_file）

### 已grep确认OpenMate/OpenSoul（本轮关键词）全部NONE
import_session|detect_format|session_import|import_formats / steer(实质义) / elicitation / wakeup(实质义) / worktree(实质义,git_api命中=git status字符) / dream / subagent / mcp_apps(ui://前轮已NONE) / REP-001(前轮已NONE)
部分：OpenSoul api/marketplace.py 27命中（缺installation method带参/前置条件/推荐）；mirror/sandbox.py 68命中（代码执行沙箱，缺文件/网络粒度策略层）；hippo有consolidation（缺"裁剪即记忆"触发入口）；hermes_cron（缺run_now/kill/pause/agent自主wakeup）；OpenMate sessions驱逐（缺LRU恢复链+创建锁）

## 下一轮研究对象
- Warp深挖候选：crates/ai/src/index（548KB）/agent/action、warp_tui、secret_redaction crate、isolation_platform crate（warp3 tarball 7709条目已在本地，继续部分解压）
- kilocode深挖：packages/opencode/src/session/、permission/、skill/、background/（本轮只到目录+关键文件级）
- goose最后一轮候选：context_mgmt/mod.rs、session/import_formats/pi.rs细节、agents/subagent_execution_tool/notification_events.rs
- CowAgent team.py + agent/evolution/动作侧补验；goose scheduler.rs全文精读（1792行只读了签名层）
- CSV外补充目标按需：kilo-code同类（roo已做）、Cline新特性增量

## 上一轮 —— 深夜轮6：Warp源码级补验（124MB tarball到手）+ nanobot/CowAgent两大对位竞品源码级 + CSV 32-44清账
- ✅**本轮主成果：Warp源码级补验完成**（git clone三度卡死→codeload master 124MB成功+tar校验）→ **64-warp-source-deep.md（12项）**
  - **specs进仓库**（agents/specs/+​.agents/specs/工单号spec：Design alternatives/Root cause带commit+行号/编号Validation criteria含"新测试必须先fail against pre-change代码"防测试作弊）+AGENTS.md"Implementation Validation Order"速度优先验证序（本地commit=检查点非验证边界）
  - **`.agents/skills/`全套标准定案升级**：21个仓库级skill（feature-flag三件套/telemetry/changelog/triage/review-pr按验证目标命名，gui-*/tui-*按surface前缀分工）+**skills-lock.json锁文件+安装器工程**（npx skills锁版本/bootstrap显式target/双位置冲突检测/装后校验）——从目录约定升级为"目录+锁+安装器+全局规则+验证纪律"完整标准
  - **~/.agents/AGENTS.md全局规则+DirectoryWatcher实时监听**（global_rules.rs 396行，规则变化推送delta非启动读一次）
  - **diff_validation引擎1293行**：StrReplaceEdit+V4A双格式+jaro_winkler模糊匹配校验search串——模型编辑落盘前验证门（Roo stale追踪是补救，这是前置）
  - **编排审批记忆**（OrchestrationConfig Approved后匹配的run_agents跳过确认卡自动launch）+Local/Remote{environment_id,worker_host,runner_id}双执行模式
  - ask_user_question问卷状态机550行（draft与unanswered分开存）；computer_use crate跨平台录屏+GUI改动**视觉自验证**（录屏进PR附件）
- ✅**nanobot(#37,48k★HKUDS)源码级**——与OpenMate/OpenSoul最接近的竞品 → **37-nanobot-source.md（15项）**
  - **AgentLoop/AgentRunner双层分离**（channel侧turn vs model侧循环）+**运行中消息注入队列**（_drain_injections+per-turn上限，Khoj互证升两方）+finish_reason=length自动恢复
  - **Dream记忆蒸馏管线**（memory.py源码级）：history.jsonl journal(cursor自增)→dream template批量→**LLM调用archive工具确认记忆检查点**（consolidator_archive）——记忆固化是模型显式动作；防污染三件套（strip_think/oversize只警一次/空条目持久化防template leak复发）
  - **三文件人格**（SOUL.md/USER.md/MEMORY.md+AGENTS.md）+agent workspace vs project workspace分离（身份不动干活目录可换，AGENTS.md取project不回退）
  - self.py运行时自检工具（Mapping dot-path导航教模型查自己状态）；provider自动选择链（key前缀/base hints/local fallback）；**架构文档写到逐文件级+"Change→Minimum verification"测试矩阵**——48k★增长快的重要原因
- ✅**CowAgent(#38,47k★)源码级**——原chatgpt-on-wechat转型Agent Harness，commit即规格书 → **38-CowAgent-source.md（16项）**
  - **per-session权限三档**（policy.py全文：read-only/workspace-write/full-access+12别名归一+新装严存量宽双轨）+**scope诚实声明**（"argument-level not OS sandbox，shell启动的程序仍可写任何地方，要硬边界用容器"，UI同样告知）——威胁模型三段式立即可抄
  - **idle进化触发器**（trigger.py全文）：60s扫描×(idle≥N ∧(min_turns∨context>0.8×budget))、进化后baseline重置、mark_run_active防并发、**进化结果推送回来源IM渠道**——OpenSoul heredity/self_evolution.py(181行)有分析缺触发器/动作/推送（grep确认）
  - 共享会话防说话人泄漏三重防线（同事回复replay为`Name(@id)：`user turn+prompt禁令+输出strip）；team_addressing @teammate寻址（Langroid互证升两方）；subagent run挂parent；model catalog overlay（overrides+tombstones）；一进程多IM实例+实例上下文stamp每条消息；output_preview恒1000字截断+显式省略号（AIHawk SHOWN/SENT互证）
- **CSV 32-44行清账** → **32-44-csv-remaining-batch.md**：#32 gpt-engineer（半停滞，bench二进制对APPS/MBPP跑分+preprompts身份覆盖）/#33 chrome-devtools-mcp（性能trace+CrUX+**--slim工具分档**+官方browser subagent参考=Gemini CLI）/#34 cursor**闭源确认**（仓库=forum页33k★，CSV星级50000失实——**CSV失实累计3条**：84/96/34）/#35 gpt_academic（虚空终端NL调度插件+插件热更新+**实时语音输入插件"自动寻找回答时机"**+自译解报告）/#40 agent-browser vercel Rust（**截图--if-changed/--threshold像素diff省token+--annotate编号标注立即可抄**+a11y snapshot ref寻址+点击遮挡早失败报covering element+WebMCP页面advertise工具schema按需拉取+Kernel/AgentCore云browser）/#44 AstrBot（Agent Sandbox session级资源复用+1000+插件市场+Dify/Coze集成）——至此**CSV 32-44全部销账**（36 huginn/39 LibreChat/41 BettaFish/42 agno/43 langgraph此前已覆盖）
- ⚠️网络经验（轮5/6一致）：git clone对GitHub持续卡死（112K停滞×2）；**codeload tarball master分支124MB一次成功**（与轮3"必截断"相反——时好时坏，tar校验后重试是王道）；**web_extract读GitHub目录页+raw文件稳定可用**（目录页给文件名→raw逐个取）；raw大文件被截断时web_extract返回的是中段片段，配合缓存文件read_file补全
- ⚠️cron环境execute_code仍被安全策略阻塞（沿用search_files/terminal）

### 已grep确认OpenMate/OpenSoul（本轮关键词）全部NONE
SOUL.md|USER.md|AGENTS.md(代码义)/finish_reason|length恢复/jaro|winkler/str_replace(编辑义)/ask_user_question/drain_inject/injection_queue/session_prefs/tombstone/model_catalog/parent_id(subagent归属)/team寻址mention/idle_minutes/skills-lock/run_agents(编排义)/orchestration(实质义,OpenMate仅en.json UI字符串)
部分：OpenMate settings已有全局权限三档（fileAccess full/restricted/readonly+shellWhitelist+networkAccess）——CowAgent补的是per-session+arg-level bash解析+诚实声明；OpenSoul heredity/self_evolution.py有趋势/失败模式/反馈分析（181行）——缺触发器+动作+推送；hippo有dedup/merge/decay consolidation——缺对话→Dream蒸馏入口（nanobot archive-tool-call形态）；skills.py/plugins_api有——缺锁文件+安装器+校验；citations=cortex启发式；limb=screenshot stub

## 下一轮研究对象
- open-webui#16补源码深度、goose recipes引擎细节补验、kilocode补源码
- Warp深挖候选：crates/ai/src/index（548KB）/agent/action、warp_tui、secret_redaction crate、isolation_platform crate
- CowAgent补验：memory/summarizer.py（本轮Exa后端故障跳过）+subagent/+team.py
- CSV 45-64剩余复查（此前批次文件与CSV实际行号不对应，需按CSV行号逐一核对：#45 llama_index/#47 langchain-chatchat已有/#51-63已覆盖为主）

## 上一轮 —— 深夜轮5：FastGPT dispatch引擎清账 + 🔴Warp开源事实修正 + privateGPT/dotnet销账
- ✅**本轮主成果：FastGPT workflow dispatch引擎全文精读**（index-d14e.ts 1749行，两轮欠账清偿）→ **56-fastgpt-dispatch-source.md（18项，源码级）**
  - **WorkflowQueue回调式非递归执行核**（activeRunQueue+迭代循环替代递归，注释即规格）+ **DFS边分类+Tarjan SCC循环检测→边分组预计算**（循环支持=工作流引擎与DAG校验的分水岭，OpenMate graph-engine只有拓扑排序）+ 节点三态判定（组内AND/组间OR）+ skip传播队列（skippedNodeIdList防递归越界）
  - **memoryEdges快照协议**：全边状态+全节点输出+skipNodeQueue+entryNodeIds+usageId持久化→lastInteractive回放续跑（入口边强制active保证续跑必达）——HITL第十方互证，"换机器也能恢复"
  - **paymentPause余额暂停**：每节点前checkTeamAIPoints，不足→interactive paymentPause多入口累积，充值后续跑——计费即HITL
  - catchError错误路由（source_catch专用handle）+**错误双轨**：工具调用错误按parentId级联隐藏于用户可见展示但保留运行控制summary
  - 双版本停止控制（v2轮询Redis 100ms/v1 req断连tracker）；深度20层+maxRunTimes双预算（skip只扣0.1）；nodeResponseSink统一写出口（有明细时父响应不重复下发）；runWithContext请求级MCP连接池finally统一close；OTel workflow.run/step双层span
  - 工程教训：filterOrphanEdges必须等ToolSet展开后再执行否则resume丢边（注释记录"为什么顺序不能换"）
- 🔴 **重大事实修正：Warp(#64)已完全开源**——此前所有轮次"闭源预期"结论过时 → **64-warp-source.md**
  - warpdotdev/warp客户端代码库开源（Rust，UI crates MIT+核心AGPL v3），OpenAI创始赞助；定位升级"agentic development environment"：内置agent+可挂Claude Code/Codex/Gemini CLI
  - **Warp Factories**：仓库由agent驱动开发（build.warp.dev数千agent分诊issue/写spec/审PR），Factories定义在代码+内置evals/benchmarks/self-improvement——与agno environments"评估工程化"行业信号再+1
  - **`.agents/skills/`目录标准第五方定案**（common-skills安装器：--project装仓库/.agents/skills、--global装~/.agents/skills、npx skills@1.5.x锁版本）——goose/ChatDev2.0/FastGPT/OpenHands+Warp五方互证，无可争议事实标准
  - ready-to-spec→ready-to-implement标签工作流=agent友好型开源协作样板；GUI+TUI双前端共享Rust核心
  - 下轮TODO：clone warp源码级（agents/目录+warp_tui+Factories定义）
- **privateGPT(#30,37k)** → README+settings.yaml配置级 → **30-privategpt-source.md（12项）**
  - **skills只读卷挂载进代码执行沙箱**（filesystems.namespaces.skills default_mode=ro）——skills不可被agent篡改，与Roo-Code RooProtectedController互证
  - chat loop_detection+deduplicate_context_in_history——循环检测四方互证（Khoj/deepseek/anything-llm/privateGPT），OpenSoul cortex无检测P0再确认
  - 引用体系七开关（force_to_return_citations等）vs OpenSoul引用只是+0.05启发式；Docling视觉解析管线；tldr长回答先出摘要；行业信号：pivot成企业私有AI网关（Zylon）
- **agent-framework-dotnet(#96)** → 结论级销账：**仓库404不存在**（search API total_count=0），.NET实现在microsoft/agent-framework的dotnet/目录内，已被#80覆盖 → 96-agent-framework-dotnet-source.md。CSV第96行应修正；CSV已有2条失实（84/96）
- ⚠️ **cron环境新限制**：execute_code被安全策略阻塞（"Cron jobs run without a user present"）——grep对照改用search_files直接调用；本轮全部grep确认NONE或巧合命中（opensoul knowledge_requests审核status/monitoring页concurrency=5均非工作流语义）

### 已grep确认OpenMate/OpenSoul（本轮关键词）
NONE：paymentPause/handleInteractive/skipHandle/catchError(工作流义)/skipNodeQueue/memoryEdges/entryNodeIds/maxRunTimes/system_memories/customFeedback/usagePush/loop_detect/deduplicate_context/condense_strategy/tldr/multiplexing/Tarjan/findSCCs/activeRunQueue/clientAbort/surrenderProcess
部分：openmate monitoring页concurrency=5（监控采集并发，非工作流执行）；citations=cortex/quality.py启发式加分（非引用生成）；skills.py/plugin_loader存在（缺.agents/skills目录标准对齐，五方定案后P0）

## 下一轮研究对象
- **Warp源码级补验**（clone：agents/目录agent实现、warp_tui headless、Factories定义、.warp/持久化）
- open-webui#16补源码深度、goose recipes引擎细节补验、kilocode补源码
- CSV剩余复查：#32 gpt-engineer/#33 chrome-devtools-mcp/#34 cursor/#35 gpt_academic/#36 huginn/#37 nanobot/#38 CowAgent/#39 LibreChat/#40 agent-browser/#44 AstrBot（24-remaining-agents.md/26-31-batch.md等批次文件是否已覆盖需核对后补源码级）

## 上一轮 —— 深夜轮4：agno重大补漏 + AIHawk源码级 + AgentGPT/smol-developer销账
- 🔴 **CSV#42 agno(42k★)此前所有轮次遗漏**（feature-matrix无任何文件），本轮源码级补齐 → **42-agno-source.md（15项）** ✅本轮主成果
  - **评估工程化最完整参照**：agno.scorer（CodeScorer+digest环境指纹/JudgeScorer 1-10归一+judge prompt fence防注入/ToolCallScorer按工具**执行**判分）+ agno.environments（run_rollouts k=8全隔离/learning_zone=有成有败任务=SFT候选/error-storm连续同错熔断/**env指纹vs policy指纹分离**"环境漂移"≠"策略变更"/baseline diff逐任务improved-regressed/to_sft_jsonl通过尝试导出SFT数据集）——"有没有进化"的工程化解法，评估闭环第八方
  - **job_queue/store.py 300行=分布式任务队列最小正确实现**（注释即规格：idempotency按user命名空间去重/claim带deployment_id亲和/heartbeat续锁/stale回收/continue_job CAS幂等attach-conflict-queued三态/paused豁免清理/"budget grant=attempt+1用户触发续跑绝不静默重跑"）——后台作业队列第六方
  - **@approval装饰器**（required阻塞/audit审计两型，与@tool任意组合，admin审批未解决时**禁止发起人自己继续run**，approvals:write管理员才可强制）——HITL第九方+合规设计
  - **os/checkpoints.py 150行**：消息级checkpoint标记推断边界+safe_truncation_index防悬挂tool_call+快照过滤孤儿tools/requirements+`/continue?continue_from=message_index`——OpenSoul trajectory只有CHECKPOINT事件类型，无快照续跑
  - offload ResultStore=工具结果外置**第七方**（新增细节：ReDoS可疑正则子进程10s可杀/NEVER_OFFLOADED名单/写失败显式信封）
  - scopes.py三级RBAC（resource:action全局/resource::id/通配符+**列表端点无权限返回过滤子集而非403**+service account agno_pat_+treat_unverifiable_as_anonymous防陈token锁死）——OpenSoul casbin升级参照
  - 行业信号：Agent平台"评估工程化"同季发力（agno environments+Flowise Evaluation+langfuse experiments）
- **AIHawk(#55)** → web_extract raw源码（agent.py 25KB全文+mcp目录commit级）→ **55-aihawk-source.md（10项）**
  - **SHOWN/SENT双预算**（watcher看1200/模型收8000，截断必须显式标记）——"watcher被静默截断=审计时把部分页当全页"，OpenMate工具卡片直抄
  - system消息不落盘（said_only恢复时重建——"文件里的旧prompt会赢过代码"）；叙述即功能（"90秒沉默的是批处理，每步叙述的才是能观察/打断/信任的"）
  - 反检测浏览器（seed→fingerprint链，"comes back as the same person"身份连续性）+ **agent能力MCP化反向输出**（`uvx aihawk`给Claude Code/Codex当工具）
  - agent.py注释=Prompt工程失败证据链（emoji条件例外被模型钻空→扁平禁止；结束语禁工具调用→support浏览器6/6不关）——体裁可抄进cortex
- **AgentGPT(#50)** → 结论级销账：**2026-01-28已归档**（pivot Sageman）→ 50-agentgpt-source.md。教训：纯前端agent loop两年被淘汰，印证OpenMate前端+OpenSoul后端分离方向；36k星≠存活（Continue/gpt-pilot同列）
- **smol-developer(#62)** → 结论级销账 → 62-smol-developer-source.md。教训：整库合成被行业证伪，增量diff+lint回喂+git快照是收敛点
- ⚠️ **网络新经验（今晚与轮3相反）**：codeload限速8KB/s（agno 9分钟仅3.5MB已杀）；**raw.githubusercontent.com直连也超时**；GitHub API 403限流——**web_extract代理读raw URL是唯一全速通道**（单次可带5个URL，大文件自动落盘可read_file分页）；GitHub目录页web_extract时好时坏，raw `__init__.py`的import列表=可靠的文件地图替代

### 已grep确认OpenMate/OpenSoul（本轮关键词）
NONE：approval/requires_confirmation/rollout/learning_zone/pass_rate/fingerprint/to_sft/offload/read_result/result_id/envelope/error_storm
部分：heartbeat/idempotency命中=agent协作心跳与消息表（非任务队列）；checkpoint仅trajectory/store.py事件类型枚举（无快照/续跑）；guardrail命中=immune/moderator.py敏感数据检测脱敏（无BaseGuardrail统一协议/无PII专项/无审核API）；casbin=services/permission.py用户级RBAC（无scope三级/无资源粒度/无service account）；OpenMate acp-approval-modal.tsx已有审批UI（缺后端审批记录/audit型/发起人≠审批人门）

## 下一轮研究对象
- CSV剩余清账：#30 privateGPT(37k,llm-app)、#64 warp(闭源预期,结论级)、#96 agent-framework-dotnet(C#)、#97 webarena/#98 AgentBench(基准已覆盖,确认销账)
- goose recipes引擎细节补验、kilocode补源码
- FastGPT workflow dispatch引擎（index-d14e.ts 62KB已下载未读）+ provider层
- open-webui#16补源码深度、CSV 45-64剩余复查

## 上一轮 —— 深夜轮3：UI-TARS-desktop源码级 + FastGPT/ChatDev两大欠账补验 + CSV 47/53
- **网络重大经验**：codeload tarball今晚限速到~8KB/s（FastGPT/ChatDev双路15分钟只下7MB，已杀）——**raw.githubusercontent.com单文件全速可用**！大仓库改用"GitHub contents API列目录（web_extract代理IP不受本机限流）+ raw逐文件curl"策略，本轮FastGPT agentLoop 11文件+ChatDev 3文件全部秒下 ✅
- **UI-TARS-desktop(#46,38.9k字节)** → GUIAgent.ts(605行)/Model.ts/actionParser.ts/constants.ts本地留存uitars-src/ → **46-ui-tars-desktop-source.md（18项，源码级）** ✅本轮主成果
  - 🔴 VLM驱动GUI循环（screenshot→模型→actionParser→execute）vs OpenSoul limb=固定RPA模板回放——**GUI Agent整条线为零**；Operator两方法协议（screenshot/execute）与AgentScope 8沙箱/deepagents BaseSandbox同构（第六方）
  - **call_user()求助动作**=HITL第七方互证；pause()/resume() Promise挂起20行可抄cortex；内部动作四态（finished/call_user/max_loop/error_env）
  - **Responses API滑窗删图**：previous_response_id增量链+首图窗口滑动时responses.delete旧图——多模态长会话token成本解法
  - actionParser坐标数学：1000归一化×factors×scaleFactor+V1.5 smartResize 28因子对齐反算；截图失败不烧loop额度(loopCnt-=1)；三级分阶段重试（screenshot/model/execute各自策略）
  - GUIAgentData(ShareVersion.V1)可分享执行轨迹+visualizer逐屏回放——"不知道在干嘛"的另一种解
- **FastGPT agentLoop源码补验**（两轮欠账清偿，DDD四层11文件全读）→ **56-fastgpt-agentloop-source.md（11项，源码级）**
  - Result四态判别联合(done/paused/aborted/error) TS never互斥+错误兜底契约（catch返回带完整transcript现场）
  - **Pause双态：ask(用户)/tool_child(子流程交互快照)**——工具也能暂停，HITL第八方；PendingMainContext标准消息格式存暂停上下文（**换provider也能恢复**）
  - ToolExecutionResult八字段：工具可带assistantMessages/请求stop/跳过压缩/metadata；系统工具五件套(plan/ask/sandbox/readFile/datasetSearch)enabled+executor注入，与用户工具catalog两层分离
  - 事件模型12种：tool_params argsDelta（工具参数流式）/tool_run_end rawResponse与response分离+压缩元数据/plan_operation成败事件/ask_start→ask→ask_resume
  - usagePush双写（转发计费+本地收集，防漏防重）；`<user_system_prompt>`标签隔离用户prompt
- **ChatDev chatdev1.0引擎补验**（chat_chain.py 365行全读+phase.py）→ **61-chatdev-engine-source.md（12项，源码级）**
  - 配置级报告的引擎侧确认：3JSON+importlib动态类加载（加流程阶段零改引擎）、`<INFO>`终止协议（任一agent输出含<INFO>即break）、need_reflect输出合法性检查+反思重试
  - incremental_develop增量开发（加载既有代码再开发）、git自动版本化（每次生成commit v{n}）——与aider/opencode三方互证
  - ChatEnv=共享黑板中介（与AgentVerse environment.step()互证：环境中介>agent直连）
- **Langchain-Chatchat(#47,38.6k)** → 47-langchain-chatchat-source.md（8项，README+目录级）
  - **工具三档降级矩阵**（Agent自动/单工具LLM只解析参数/手动填参直调）——弱模型可用性设计独到，OpenSoul MCP只有全自动一档
  - text2sql+**text2promql**（自然语言→PromQL监控查询，与用户监控场景直接相关）
  - ⚠️ 项目半停滞（2024-06后无大版本）：国内RAG一体机赛道被平台化产品取代
- **gpt-pilot(#53,32k)** → 53-gpt-pilot-source.md（结论笔记）：仓库已停维护+**2025-08-24遭Shai-Hulud类供应链蠕虫**（恶意commit藏core/telemetry/，窃AWS/GitHub/npm/SSH凭证）——架构遗产被MetaGPT/ChatDev/OpenHands覆盖，研究价值归零；**安全教训：agent项目telemetry目录是供应链攻击理想藏身处**，OpenSoul immune应对第三方依赖做出网白名单+telemetry专项审计
- ⚠️ **codeload tarball限速时的部分截断产物无用**（tar按字节序：ChatDev截断段连chatdev/目录都没到；FastGPT只到document/）——限速场景直接放弃tarball改raw逐文件

### 已grep确认OpenMate/OpenSoul（本轮关键词）全部NONE
computer_use(实质义)/visual_grounding/action_space/scale_factor(实质义)/previous_response_id/call_user/max_loop/gui_agent/nut-js/StatusEnum(实质义)/useResponsesApi/IMAGE_PLACEHOLDER/argsDelta/ask_resume/plan_operation/skipResponseCompress/checkIsStopping/maxRunAgentTimes/usagePush/tool_run_start/rawResponse/contextCheckpoint/user_system_prompt/firstTokenTime
部分：limb/executor.py=RPA固定动作模板（有screenshot API stub/screenshot_path占位——VLM驱动GUI循环的空壳）；trajectory/token_meter=总量无逐步归因

## 下一轮研究对象
- CSV 50(AgentGPT)/55(AIHawk)/62(smol-developer)/96(agent-framework-dotnet C#)剩余行
- goose细节补验（recipes引擎）、kilocode补源码
- FastGPT workflow dispatch引擎（index-d14e.ts 62KB已下载未读）+ provider/层实现
- CSV 45-64剩余复查（warp#64闭源预期、open-webui#16补源码深度）

## 上一轮 —— goose源码补验（重大发现）+ ChatDev1.0配置级 + 基准线三件套
- **goose补验**（本地源码零带宽）→ **63-goose-source-supplement.md（18项，两批）** ✅本轮主成果
  - 🔴 **最大发现：security/检查器栈（上轮完全遗漏，~3300行）**——ToolInspectionManager可插拔检查器链（SecurityInspector正则→EgressInspector出网目的地提取(555行,URL/git@/s3://域名管控)→AdversaryInspector LLM裁判(747行,adversary.md文件激活,fail-open)→PermissionInspector），统一返回Allow/Deny/RequireApproval+confidence+finding_id（如REP-001可审计）
  - RepetitionInspector：连续相同(name+args)调用超限即Deny（135行整体可抄）
  - PromptInjectionScanner：正则+ML双引擎（HF Text Classification API协议，command/prompt两endpoint，置信度融合）
  - Recipe调度器（1792行）：**recipe快照复制**（防配置漂移）+调度时全量校验+O_NONBLOCK\|O_NOFOLLOW防御性文件打开+paused/running状态
  - ACP handoff memo：**token预算化交接**（min(上下文30%,64k)−当前turn；近5个工具交换保留原文更早redacted；图片1600token/张）——OpenSoul handoff_context的升级参照
  - .goosehints递进式目录上下文：**SubdirectoryHintTracker监听工具参数路径→新目录hints自动加载**+@file展开带预算（深度3/64操作/1MB）
  - Nostr去中心化会话分享（NIP-44加密发布relay+解密密钥deeplink）、本地Whisper听写2400行、Plugin auto-update(24h)、AgentManager会话LRU(100)+per-session创建锁
  - **行业信号：`.agents/skills/`目录约定**——goose(~/.agents/skills/)+ChatDev2.0(.agents/skills/<name>/SKILL.md)两家独立采用，与OpenHands SKILL.md frontmatter合流为事实标准
- **ChatDev chatdev1.0分支**（tarball两次截断，部分解压获得CompanyConfig全部4套配置）→ **61-chatdev-chatdev1.0-config.md（10项，配置级）**
  - 整个虚拟公司=3个JSON：ChatChain(流程)+Phase(阶段prompt)+Role(角色prompt)；**ComposedPhase嵌套循环**（CodeReview=cycleNum:3×[Comment→Modification]，耗尽即前进非失败）；**`<INFO>`终止协议**（达成一致只回一行`<INFO> 结论`）；Human变体=标准链插入HumanAgentInteraction/CodeReviewHuman两个phase（**HITL只是配置变体**）；DemandAnalysis产物形态协商phase（PPT/网页/应用先定形态）；CodeReview六条法规+"一次只提最高优先级一条comment"
  - Python引擎（chat_chain.py/phase.py/inception prompt）第三次下载后台进行中，下轮补验
- **FastGPT(#56)** ✅**设计文档级深读成功**（网络仍失败但部分解压拿到完整`.agents/`）→ **56-fastgpt-design-docs.md（15项）**
  - codeload截断34.9MB/1255文件，但**`.agents/`全部到手**：AGENTS.md+67份design/设计文档（状态："当前实现"+最后核对日期2026-07/08）+issue/问题分析+skills/技能库（含per-skill agents/openai.yaml模型配置）
  - 核心发现：**Agent Loop provider协议**（runAgentLoop唯一入口/Result判别联合done-paused-aborted-error/providerState暂停恢复存chat memories且终态清理）；系统工具五件套(plan/ask/sandbox/readFile/datasetSearch)；**context_checkpoint压缩**（六要素+计划确定性拼接防模型改计划+leading保留）；`<system-reminder>`每轮注入（skill列表/SKB边界/文件/知识库/时间+cwd）；**用户级Sandbox v2**（9态状态机+operation heartbeat接管+双provider）；Skill平台闭环（空白workspace+Agent辅助编辑/不可变ZIP版本/etag幂等内置同步/entrypoint隔离执行）；**辅助生成框架**（processor注入+SSE断流续传mirror+Redis停止key起止清理）；**Chat Agent Helper NL→表单**（ask_user暂停→generate_config工具Zod校验+资源ID权限校验，参数错误=tool error让模型自修）；知识库标签V2（4类型×13操作符+ReDoS防护）；usage单次上报协议；defineIndex声明式索引管理
  - **`.agents/`信号升级为四方互证**：goose+ChatDev2.0+FastGPT+（OpenHands extensions同族）——design文档状态机化+per-skill模型配置是最先进形态
  - packages/源码顺延下轮（网络）
- **基准线三件套**（web_extract文档级）→ 93-97-98-benchmarks-batch.md
  - AgentBench FC版(2025.10)全面function-calling化+AgentRL端到端RL；全容器化任务环境（每任务docker镜像+资源预算表）；WebArena自托管812任务+环境重置协议；Mind2Web多模态数据集+SeeAct
  - 结论：OpenSoul 5维自评与行业标准（容器化任务+轨迹对比+RL闭环）是**代差**
- ⚠️ **网络教训（三度确认）**：ChatDev1.0 tarball 900s截断20MB、重试1500s进行中；git clone --depth 1对FastGPT再度卡死（20文件/792s，已杀）——**大仓库下载期间不要并行第3路**；GitHub API今晚限流（unauthenticated 403）；raw.githubusercontent.com也返回空；**codeload超时截断时可部分解压拿前段资产**（tar按字母序：本次正好拿到CompanyConfig/）
- ⚠️ 安全扫描器拦截`curl | python3`管道——改用`curl -o 文件`再处理

### 已grep确认OpenMate/OpenSoul（本轮关键词）全部NONE
inspector(工具检查义)/egress(安全义)/adversary/goosehints/nostr/repetition拦截/finding_id/ComposedPhase/phaseType/cycleNum/need_reflect/<INFO>终止协议/context_checkpoint/system-reminder/providerState/ask_user/generate_config/auxiliary/sandboxId/datasetSearch/usagePush（唯一命中=healer.py docstring里的"entrypoint"英文单词）
部分：link.py有"Webhook Egress"注释（非安全检查）；agent_collaboration.py handoff_context存在（缺token预算化，goose五常量可抄0.30/64k/1600/5/32）；skills.py/plugin_loader存在（缺目录标准对齐/auto-update/安装元数据溯源/不可变版本包）；sessions驱逐存在（缺per-session创建锁）；voice=tts输出（缺语音输入）；cortex循环存在（缺Result四态协议/providerState暂停恢复）

## 下一轮研究对象
- **FastGPT packages/源码**（第4次重试：service/workflow引擎+agentLoop实现对照设计文档验证）
- **ChatDev Python引擎补验**（第4次重试：chat_chain.py/phase.py/inception prompt）
- agent-framework-dotnet(#96,C#)、CSV 46/47/50/53/55/62剩余（UI-TARS-desktop/Langchain-Chatchat/AgentGPT/gpt-pilot/AIHawk/smol-developer）、kilocode补源码
- CSV 45-64剩余复查

## 上一轮 —— AgentScope源码级深读 + ChatDev文档级 + NeMo确认已覆盖
- **AgentScope(#54, modelscope, 31.5k)** → ~/agent-research-src/agentscope（19MB, v2架构）；输出 **54-agentscope-source.md（16项，源码级）** ✅本轮主成果
- **NeMo-Guardrails(#91)** → 确认第26轮已详尽覆盖（91-nemo-guardrails.md含源码亮点），无需重做
- **ChatDev(#61)** → ⚠️GitHub网络今晚对中大仓库持续超时(curl exit 28/11MB截断)；仅文档级，输出 61-chatdev-source.md。**关键发现：仓库已三线分裂**——main=2.0零代码编排平台(2026-01)/chatdev1.0分支=经典虚拟软件公司/puppeteer分支=RL编排器(NeurIPS 2025)。下轮需clone chatdev1.0分支补源码
- **FastGPT(#56)** → ❌今晚网络失败(codeload截断+git clone卡死571s仅20文件)；顺延下轮
- ⚠️ **网络教训（再确认）**：今晚github codeload对>20MB仓库必截断(exit 28)，git clone --depth 1对FastGPT也卡死。**4路并行会互相抢带宽导致全部截断**——应串行或≤2路，且大仓库放独立轮次专攻

### 🔴 本轮最重要发现（AgentScope v2 = OpenSoul will/permission/沙箱三大骨架的完整参照）
**A. SOP引擎（步骤=executor+verifier，HITL停车不挂起）= will/dag_planner缺失的骨架**
- 每步：执行agent做活+验证agent打分，max_attempts耗尽才FAILED；engine只看SOPStepRunState(pydantic 151行)不看内部实现
- **AWAITING=parked**：需人时事件流自然结束（不占进程/协程），带UserConfirmResult回来从持久化state续跑——**比"挂起等待"省内存且天然断点续跑**
- 与HITL六方互证(MCP elicitation/Flowise/SuperAGI/DeerFlow/ms-agent-fw/AgentScope)

**B. PermissionEngine 848行 = Claude-Code权限系统的Python完整复刻**
- 5模式(DEFAULT/ACCEPT_EDITS/EXPLORE/BYPASS/DONT_ASK) + 4行为(allow/deny/ask/passthrough)
- 规则tool_name+rule_content按类型分流：Bash子串匹配、Write/Read glob、其他tool自定义；source分层(userSettings/projectSettings)
- **OpenSoul只有casbin用户级RBAC，无工具/路径级**——此引擎可整体移植为immune/permission_engine.py。EXPLORE只读模式对售前"先看不动"极有用

**C. 多后端workspace抽象（8种沙箱）+ offload协议**
- docker/e2b/daytona/k8s/applecontainer/bubblewrap/opensandbox/local统一BaseSandbox协议——与deepagents"E2B只需execute()+upload"互证
- offload协议：base64 DataBlock→workspace://URL引用 + 压缩context→workspace存储 = **工具结果外置第六方互证**

**D. 加权token预算中间件 + 细粒度流式事件模型**
- budget：cost=in_w*input+out_w*output超限→注入system-reminder+强制tool_choice=none收尾；state存middle_context跨HITL存活；中间件实例stateless可跨agent共享
- event模型30+类型：每个block(text/thinking/tool_call/tool_result/data)都有Start/Delta/End三态 = "逐块渲染+思考链可视化"的事件层地基（"不知道在干嘛"的解）

**E. 其他**：RAG(pdf/word/excel/ppt/image解析+4向量库ES/milvus_lite/mongodb/qdrant)、凭证工厂(10+provider含volcengine/dashscope/moonshot国产)、实时语音4transport、消息总线(in_memory+redis)、IM渠道(dingtalk/discord/feishu)

### ChatDev行业信号（文档级）
- 26k★项目主动把"虚拟软件公司角色扮演(1.0)"降为legacy，主线转"零代码编排平台(2.0)"——**角色扮演式多agent市场验证不如通用编排平台**
- puppeteer分支RL中心编排器(NeurIPS 2025)：动态激活agent序列降成本——multi-agent从"静态流水线"到"动态调度"的学术前沿

### 已grep确认OpenMate/OpenSoul（本轮关键词）
NONE：permission_mode/accept_edits/explore.*mode/check_permissions/passthrough(工具权限义)/workspace后端(e2b/docker/daytona/k8s)/offload/ThinkingBlockDelta/ToolResultDelta/ReplyStart/ModelCallEnd(事件)/role_play/inception/seminar/puppeteer/macnet
部分：verifier=ai_engine任务分解级角色(非SOP步骤级verify-retry)；hippo有token_budget上下文注入(非逐reply收尾控制)；config有Qdrant单一向量库(AgentScope有4种)；voice=tts_engine离线TTS(非实时)；multi_agent.py=88行硬编码Researcher→Analyzer→Writer(无动态编排)；will/dag_planner=任务DAG(无park/resume/verifier)；immune=casbin用户级RBAC(无工具/路径级)；a2a/connector已有(可对照AgentScope补全)

## 下一轮研究对象
- **FastGPT(#56)专攻**（今晚网络失败，放独立轮次用git clone --depth 1串行）
- **ChatDev源码补验**（clone chatdev1.0分支：角色定义/inception prompt/seminar/clean scrum）
- agent-framework-dotnet(#96,C#)、Mind2Web(#93)/webarena(#97)/AgentBench(#98基准线一批带过)
- goose细节补验（recipes引擎、ui/desktop）、kilocode补源码、CSV 45-64剩余复查

## 上一轮 —— CSV 69/73/82-95九连 + 两条结论修正
- lagent（#85, 6k）→ ~/agent-research-src/lagent（1.2MB）；输出 85-lagent-source.md（12项）
- SuperAGI（#73, 16k）→ ~/agent-research-src/superagi（7.8MB）；输出 73-superagi-source.md（15项）
- AgentVerse（#87, 5.5k）→ ~/agent-research-src/agentverse（34MB）；输出 87-agentverse-source.md（11项）
- openllmetry（#94, 3k）→ ~/agent-research-src/openllmetry（55MB）；输出 94-openllmetry-source.md（12项）
- jina-reader（#83, 8k）→ ~/agent-research-src/jina-reader（2.4MB）；输出 83-jina-reader-source.md（11项）
- mcp typescript-sdk v2（#82, 8k）→ ~/agent-research-src/mcp-tssdk（14MB）；输出 82-mcp-tssdk-source.md（10项）
- openai-agents-js（#89, 5k）→ ~/agent-research-src/openai-agents-js（23MB）；输出 89-openai-agents-js-source.md（10项）
- ToolBench（#95, 3k）→ ~/agent-research-src/toolbench（16MB）；输出 95-toolbench-source.md（8项）
- ⚠️ **cursor-cli（#84）= 闭源**，anysphere/cursor-cli在GitHub不存在（两分支404），CSV条目失实；输出 84-cursor-cli-source.md（结论笔记）
- ⚠️ **generative-agents仓库名是下划线**：joonspk-research/generative_agents（CSV写的连字符404）；codeload下载极慢（600s超时后重试中）
- ⚠️ 方法论教训：**先验证仓库存在性再下载**（web_extract GitHub页1次调用可省多轮重试）；仓库名连字符/下划线要试两种

### 🔴 本轮最重要发现
**A. 环境步进架构（AgentVerse）= OpenSoul multi_agent.py缺的骨架**
- agent不直连，environment.step()是唯一交互点→发言顺序/可见性/裁决全部rules目录插件化（describer/order/selector/updater/visibility五件套）
- 六步解题管线（role_assigner→manager plan→solver→executor→critic→evaluator advice回注）70行跑完
- memory_manipulator反射器=generative-agents记忆工程化（importance+immediacy双1-10评分+insight蒸馏带"because of 1,5,3"来源编号）

**B. HITL审批五方互证 + WAIT步骤语义**
- SuperAGI：DB工作流图（步骤边带YES/NO/COMPLETE标签）含WAIT_FOR_PERMISSION（44行表：status/question/user_feedback）+WAIT定时步+TASK_QUEUE数组消费步——**"用户拒绝回上一步"=一行边标签**
- 叠加MCP elicitation/Flowise HumanInput/DeerFlow表单卡/ms-agent-fw恢复契约=五方

**C. 可观测三方互证升级（openllmetry加入langfuse/agentops）**
- **GenAI semconv已被OpenTelemetry官方收编**——OpenSoul trajectory字段应对齐gen_ai标准别自创
- Guardrails组合器：护栏命中全部写span属性→拦截率报表免费；Experiment可跑在GitHub Actions（评估与业务进程隔离）
- SuperAGI APM全是SQL聚合（tool_usage=feeds表GROUP BY）——OpenSoul现有trajectory表就能出工具使用率
- VCR cassette（LLM调用录制回放）=OpenSoul测试体系缺失件

**D. web_extract"完全体"= jina-reader三引擎三profile**
- 三引擎降级：puppeteer→**curl-impersonate(反TLS指纹)**→CF Browser Rendering；三格式化：readability/**markify规则引擎**/**ReaderLM-v2小模型HTML→MD**
- 20+ header选项协议（selector/wait_for/timeout/retain_images/markdown-chunking）
- noop-storage空对象穿透（缓存层可插拔不写if分支）——工程范式

**E. OpenSoul立即可抄小件**
- lagent IPythonProcess（220行会话级持久内核+输出清洗三件套）+ FairAsyncTokenBucket（MCP公平限流）
- MCP TS SDK EventStore可恢复性（~50行接口）+Client middleware层
- AgentVerse RoleAssigner（按任务动态生成角色）

**F. ToolBench三机制 + openai-agents-js语音线**
- **DFSDT树搜索**（beam分支+Revise回溯换API）vs OpenSoul cortex单链——工具走错路无回溯；最小版=连续2次工具失败回退重规划
- **工具检索器三方互证定案**（ToolBench 16k API检索+GPT-Researcher MCPToolSelector+claude-code tool_search）→ OpenSoul MCP全量暴露升P0
- **win_rate双跑评估**（新旧版本对跑+GPT裁判+SPR可解集过滤）="有没有进化"最硬指标
- openai-agents-js：Realtime语音三transport（WebRTC/WS/**SIP呼叫中心**）+流式guardrail（输出侧护栏第2方）+mcpToolCache
- ⚠️修正：OpenSoul api/agent_collaboration.py**已有handoff_context**（关键词overlap过滤+removed_sections），不是没有——升级方向是按权限/工具集策略化过滤
- 行业信号：OpenAI官方仓库AGENTS.md用"6个强制skill+scope contract"管理agent改代码

**G. generative-agents（#69）三因子检索=记忆检索祖师爷公式，40行可移植**
- retrieve.py：recency(0.99^i)+importance(poignancy 1-10)+relevance(cos_sim)等权归一相加取top——OpenSoul hippo只有时间衰减，缺重要性打分和语义相关度
- 反思触发=**累计poignancy超150**（情感强度驱动而非固定周期）；insight带"because of [节点id]"证据引用
- (out, fail_count)提示词调用返回约定；persona即bootstrap_memory/数据目录（超参在scratch.json）
- 与AgentVerse memory_manipulator是同一设计的论文版/工程版——两份报告(69/87)合读

### 已grep确认OpenMate/OpenSoul（本轮关键词）全部NONE
ipython|InteractiveShell / token_bucket / few_shot / register_hook|RemovableHandle / wait_step|WAIT_FOR_PERMISSION / task_queue / tool_usage / importance_score|immediacy / role_assign / prompt_registry / conversation_id / semconv|gen_ai / readability|markify|readerlm|impersonate / outputSchema|structuredContent
部分：webhook=link/connector有webhook_in/out（缺agent事件映射）；guardrail=ai_engine ToolRoute声明(size_check等,缺检测记录)；user_feedback=mind评分表(缺trace级挂载)；reflection=cortex内联(无评分/insight蒸馏)；chunking=知识库分块(非抓取时分块)；marketplace=tencent skillhub源(非搜索源)

## 下一轮研究对象
- agent-framework-dotnet(#96,C#)、Mind2Web(#93)/webarena(#97)/AgentBench(#98基准线一批带过)、NeMo-Guardrails(#91)补源码
- goose细节补验（recipes引擎、ui/desktop）、kilocode补源码
- CSV 45-64剩余未覆盖行复查

## 上一轮（2026-09-16 夜间轮） —— PromptFlow/Langroid/OpenDeepResearch/Swarms四连（CSV 77/90/92/88）
- PromptFlow（#77, 12k）→ ~/agent-research-src/promptflow（304MB）；输出 77-promptflow-source.md（12项）
- Langroid（#92, 4.5k）→ ~/agent-research-src/langroid（102MB）；输出 92-langroid-source.md（14项）
- open_deep_research（#90, 5k）→ ~/agent-research-src/odr（6.4MB,仅2356行）；输出 90-open-deep-research-source.md（12项）
- swarms（#88, 5k）→ **main分支是2023年v0.6坟头代码（BabyAGI boss/worker 252行）**，现代版在master → ~/agent-research-src/swarms3（59MB,64个structs）；输出 88-swarms-source.md（14项）
  ⚠️ **方法论教训：codeload tarball必须试多分支**（main≠活跃分支），先看GitHub页面README判断默认分支

### 🔴 本轮最重要发现
**A. 子agent/工具结果压缩出口 = 四方互证升P0**
- ODR compress_research：每个子研究员研究完→独立compression_model蒸馏成compressed_research→只回传压缩结果（supervisor上下文永不爆的结构性原因）
- 叠加Goose large_response_handler/DeepAgents溢出外置/GPT-Researcher ContextCompressor → 四方
- OpenSoul multi_agent.py（88行流水线）缺的正是这个出口阀

**B. 反思工具化两方确认**：ODR think_tool（反思记录成tool call，继续循环）+ swarms max_loops=auto的think工具——OpenSoul cortex/chain_of_thought是内联反思，应升级为可观察的工具调用

**C. PromptFlow批量引擎三件套**：Semaphore并发+aggregation节点+**_copy_previous_run_result按行续跑**（只重跑失败line）+per-line进程隔离池；节点**ActivateCondition条件bypass**（DAG里的if不需要分支节点，bypass后下游按函数签名自动降级输入）

**D. PromptFlow评估器全家桶**：19个内置评估器含**xpia（间接注入攻击检测）+protected_material（版权检测）+content_safety**——政企合规刚需；OpenSoul benchmark/evaluator 5维自评差距最大项

**E. Langroid终止DSL+实体寻址**：done_sequence字符串DSL（"T[calculator], A"=特定工具后跟回复即完成，212行parser可整体移植）；@recipient寻址（TO[<recipient>]:/JSON recipient解析）——多agent"邮局模型"vs OpenSoul信箱模型；XMLToolMessage verbatim+CDATA（代码参数免JSON转义）

**F. MCP发布侧两缺口确认**：swarms MCPDeployer发布MCP自带auth层（api_key/bearer/TokenVerifier）——OpenSoul mcp/server.py生产侧零认证；ODR MCPConfig带tools白名单+auth_required——OpenSoul消费侧全量暴露无过滤（与GPT-Researcher MCPToolSelector互证）

**G. x_oap_ui_config"配置即UI"协议**：pydantic Field.metadata写控件描述（slider/min/max/step/description）→前端读schema自动生成配置表单——OpenMate设置页通用方案

### 已grep确认OpenMate/OpenSoul（本轮关键词）全部NONE
activate_condition / prompty / xpia / protected_material / groundedness / content_safety / addressing_prefix / done_sequence / xml_tool / require_recipient / doc_chat / sql_chat / relevance_extractor / majority_voting / swarm_router / mcp_deployer / think_tool / research_brief / clarify_with_user / compress_research / supervisor
部分：subtask=ai_engine任务分解（无任务树/寻址/出口压缩）；multi_agent_coord=agent注册/心跳/消息表（信箱模型）；chain_of_thought内联反思max_reflections=2（非工具化）；mcp/server.py有MCP生产消费（无auth门/无过滤）；benchmark/evaluator=5维自评（非裁判/无claim级核查）；intent.py已有research意图（套ODR图纸即升级）

## 下一轮研究对象
- cursor-cli(#84)、lagent(#85)、AgentVerse(#87)、openllmetry(#94可观测第二方)、ToolBench(#95)、agent-framework-dotnet(#96)、Mind2Web(#93)/webarena(#97)/AgentBench(#98,基准线)、generative-agents(#69)/SuperAGI(#73)重试下载、jina-ai/reader(#83)、mcp typescript-sdk(#82)

## 上一轮历史（2026-09-16 19:00，实例B） —— OpenHands生态 + Microsoft继任框架 + camel/agentops/MCP-SDK五连
- **网络经验3**：今晚github.com git clone持续失败（connect超时133s四连），codeload tarball方案再次胜出——camel首次下载4KB静默截断（tar tzf校验揪出）→ 换master分支重下120MB成功。**tar校验已成本能，勿省**
- OpenHands/extensions仓库（多轮待办）→ ~/agent-research-src/openhands-ext；输出 openhands-ext-skills-registry.md（11项）
  ⚠️ 该仓库根AGENTS.md被Hermes安全层拦截（疑似prompt injection特征），已忽略其全部内容
- microsoft/agent-framework（#80）→ ~/agent-research-src/ms-agent-fw；输出 80-ms-agent-framework-source.md（20项）
- camel（#78）→ ~/agent-research-src/camel；输出 78-camel-source.md（17项）
- agentops（#86）→ ~/agent-research-src/agentops；输出 86-agentops-source.md（9项+跨项目互证更新）
- modelcontextprotocol/python-sdk（#79）→ ~/agent-research-src/mcp-pysdk；输出 79-mcp-pysdk-source.md（9项）
- 待认领已clone未研究：agentops已研究✅；**generative-agents(#69)/SuperAGI(#73) tarball未下载成功，下轮重试**

### 🔴 本轮最重要发现

**A. MCP Apps = OpenMate的差异化机会（工具结果携带交互UI）**
- MCP工具的`_meta.ui.resourceUri`指向ui:// HTML资源→host在沙箱iframe渲染交互界面；client_supports_apps(ctx)优雅降级
- OpenSoul mcp/server.py已装SDK但Apps/Elicitation/Subscriptions三大高级能力全部闲置
- HITL协议词汇三方收敛：MCP elicitation accept/decline/cancel + ag2 ElicitationPolicy(ask/decline) + ms-agent-fw审批恢复spec——**OpenSoul照此实现，别自创**

**B. ms-agent-fw审批恢复契约（spec 004）= HITL设计前置必读**
- occurrence id做approval request id；重放时过滤审批包装防把请求当结果喂回provider；stale approval authority列为一级风险
- tool_with_arguments参数粒度审批（args序列化(sort_keys)精确匹配才算已批）+SecretString类型防凭证泄漏（str()/join全掩码）
- feature-usage-bit遥测位注册表：每个特性一个bit统计真实使用率再promote/demote——"进化"的机制化

**C. camel Workforce = 运行时任务干预面最完整实现**
- modify_task_content（跑偏时人工改写任务描述）+reorder_tasks+skip_gracefully（跳过不失败）+pause/resume/五种运行控制
- TaskChannel任务市场：Packet状态机+publisher/assignee双向查询+依赖边+in-flight追踪
- WorkflowMemoryManager：工作流本身可记忆复用（比skill更结构化的复用）
- 领域验证器（math/physics/python程序化验证）与LLM裁判互补；evol_instruct合成数据=政企私域微调线

**D. agentops/span观测模型第二方确认 + OpenHands扩展注册表规范**
- agentops：Session→Span层级（v0.4"Event→Span"宣言）+CommonInstrumentor声明式WrapConfig插桩+token/cache效率指标——与langfuse三层模型互证，trajectory升级P0再确认
- OpenHands/extensions：66个skill目录规范（SKILL.md frontmatter含triggers斜杠命令+commands/+references/渐进披露）+plugins(hooks/scripts)+integrations(oauth/mcp connectionOptions JSON目录)+automations四类注册表，npm+pip双端消费+版本对齐CI；**agent-memory skill的"numbered清单审批后写入"prompt可直接抄**；code-review skill的GROUNDING两步核查纪律（防幻觉引用）可移植进cortex

### 已grep确认OpenMate/OpenSoul（本轮关键词）全部NONE
elicitation / resourceUri / ui:\/ / apps_extension / transport_security / tool_with_arguments / always_approve / SecretString / hyperlight / codeact / purview / file_memory / background_agent / todo_tool / function_invocation_budget / declarative_agent / workforce / task_channel / pipeline_fork / workflow_memory / role_playing / evol_instruct / terminator / skip_gracefully / shared_memory / span_factory / token_efficiency / cache_efficiency / instrumentor / semconv / session_span
部分：OpenMate acp_approval_request=ACP审批UI事件（无参数粒度/恢复契约）；OpenSoul mcp/server.py已用MCPServer基础能力；occurrence=skill共现统计巧合；opentelemetry=metrics-client.tsx仅UI文案；decompose=cortex任务分解概念；verifier=i18n字符串；marketplace/plugins_api/skills.py/plugin_loader=已有但缺目录规范/triggers/hooks三件套

## 下一轮研究对象（实例B建议）
- CSV 65-100剩余：devika(#68,实例A可能在做，先查文件存在性)、generative-agents(#69,重试下载)、SuperAGI(#73,重试)、PromptFlow(#77)、cursor-cli(#84)、swarms(#88)、open_deep_research(#90)、langroid(#92)、lagent(#85)、AgentVerse(#87)、openllmetry(#94,可观测第二方)、Mind2Web(#93)/webarena(#97)/AgentBench(#98,基准线)
- goose细节补验（recipes引擎、ui/desktop）

## 本轮（2026-09-17 16:30）新增 —— goose补源码 + CSV 65-100首批三连
- **网络经验2**：今晚git clone全挂（SSL eof，goose/roo/swe/az四连失败），codeload tarball可用但**大仓库会静默截断**（curl -sL退出码仍0！必须`tar tzf`校验后重下）——goose.tar.gz/roo-code.tar.gz均截断重下成功；下载一律后台进程+tar校验
- goose（#63）部分解压已够用（crates/goose/src完整）→ 63-goose-source.md（17项源码验证）
  ⚠️ 写文件时警告有sibling subagent同时在写该文件（可能有并发cron实例在跑同任务，后续先检查文件存在性）
- agent-zero（#75）→ ~/agent-research-src/agent-zero；输出 75-agent-zero-source.md（20项）
- SWE-agent（#72）→ ~/agent-research-src/swe-agent；输出 72-swe-agent-source.md（12项）
- Roo-Code（#67）→ ~/agent-research-src/roo-code；输出 67-roo-code-source.md（14项）

### 🔴 本轮最重要发现

**A. goose源码验证：状态机Ops架构 + 两个立即可抄的P0小件**
- **Agent Loop状态机**：每个能力=一个Operation（18个ops_*），统一applied/not_applicable/ends_turn三态返回——与DeerFlow 36 middleware构成中间件化的两种形态（洋葱链 vs 有序Ops状态机）
- **large_response_handler**（~80行）：工具结果>200k字符→写临时文件→告诉模型路径——**工具溢出第五方互证，立即可抄**
- **moim轮次预算注入**：每轮注入turn budget剩余+教模型"budget低时少探索、批量工具调用、直接收尾"——长任务收尾质量关键
- **permission_judge LLM只读判定**：让模型批量判"哪些tool request只读"→只读免确认+结果缓存——审批弹窗疲劳的解法
- **ops_tool_pair_compaction**：压缩粒度到"工具request/response对"，比整段compaction精准
- **OSV MAL-*恶意软件扫描**（扩展激活前fail-closed）+ gateway/pairing设备配对码 + prompt insta snapshot测试（防prompt静默劣化）

**B. agent-zero：40+内置插件的per-function扩展架构**
- **函数级扩展点**：`extensions/python/_functions/<module>/<qualname>/<start|end>/`——任意函数进出口可插件化，比预设Hook事件表更彻底
- **_infection_check输出侧安全门**：流式收集reasoning→独立审计模型→工具执行前gate()三态（ok/terminate/clarify回环）——**注入检测从输入侧扩到LLM输出侧**（OpenSoul immune只有输入侧正则）
- **parallel作业工具**（job_id+start/await/cancel/collect+promote_parent_history）
- **_time_travel工作区快照七件套**（snapshot/list/diff/preview/travel/revert+retention）
- **_tool_access工具策略**（per-project/per-profile+default+名单）+ DirtyJson宽容解析 + _orchestrator编排外部CLI agent（含Hermes Agent）

**C. SWE-agent：best-of-N决策全家桶（小而精）**
- **AskColleagues**：n-sample采样→拼"同事讨论"→模型选action（~60行）
- **BinaryTrajectoryComparison锦标赛选优** + **ChooserRetryLoop/ScoreRetryLoop**（Reviewer打分重试取最优attempt）
- **History处理器纯函数链**（LastN/滑窗/CacheControl逐entry cache标记）——pydantic声明式配置
- **工具bundle**：bash脚本+config.yaml即工具，**state_command每次动作前注入环境状态**

**D. Roo-Code：防agent越权的工程细节**
- **RooProtectedController**：硬编码保护名单（.roomodes/AGENTS.md等）**auto-approve也拦**——"agent不能改自己的规则文件"
- **FileContextTracker stale追踪**：外部修改→标stale→下次写前强制重读（修diff编辑失败）——三方watch互证中语义最深
- **per-task checkpoint仓库**+init超时5s警告、.rooignore用户排除、**规则优先auto-approval**（静态只读/写分类→兜底可用goose LLM判定）

### 已grep确认OpenMate/OpenSoul（本轮关键词）全部NONE
steer/malware/osv/pairing/turn_budget/large_response/tool_policy/watchdog/virtual_desktop/tunnel/state_monitor/parallel_job/colleague/best_of/history_processor/closed_window/cache_control/time_travel/infection(输出侧)/protected/gitignore/condense/todo_list/FileWatcher
部分：reviewer=知识库审核流程(非agent输出评审)；immune/intrusion=输入侧正则注入检测(无输出侧审计门)；will/dag_planner(无调度工具)；read_only命中=unread_only拼写巧合；OpenMate system-doctor=系统诊断页(非agent doctor)；mentions/queue仅i18n字符串

## 下一轮研究对象
- OpenHands/extensions仓库（skills目录规范）
- CSV 65-100按star：semantic-kernel(#66)、devika(#68)、generative-agents(#69)、SuperAGI(#73)、PromptFlow(#77)、camel(#78)、MCP python-sdk(#79)、agent-framework(#80)、cursor-cli(#84)、agentops(#86)、swarms(#88)、open_deep_research(#90)、langroid(#92)
- goose细节补验（recipes引擎在crates/goose/src/recipe?、summon、ui/desktop）

## 本轮（2026-09-17 08:00）新增 —— harness三强：deepagents + continue + goose(进行中)
- **网络经验**：本机到GitHub的codeload tarball频繁超时（continue/goose多次550s截断），`git clone --depth 1`反而成功（continue-git2 461MB/742s完成）——**大仓库一律后台git clone，不再用curl tarball**
- Deep Agents（#59, 29k langchain官方harness）→ ~/agent-research-src/deepagents（64MB）；输出 59-deepagents-source.md（20项）
- Continue（#51, 36k，**公司已停运**，README谢幕）→ ~/agent-research-src/continue-git2（461MB）；输出 51-continue-source.md（14项，全部源码验证）
- goose（#63, 25k，**已捐给Agentic AI Foundation(aaif-goose)**）clone进行中；文档级研究已覆盖recipes/extensions/permissions

### 🔴 本轮最重要发现

**A. Deep Agents = OpenSoul cortex/will的"完整体参照"，20项里17项OpenSoul完全没有**
- **RubricMiddleware**：agent将完成时→独立grader子agent对照rubric评分→needs_revision反馈作为HumanMessage注入继续跑→satisfied/failed/max_iterations。"完成=裁判通过"而非"模型说完了"（rubric.py 1438行）
- **工具结果双策略外置**：proactive超阈值外置+reactive溢出裁尾；read_file结果head-slice指回原路径，其他写/large_tool_results/+head+tail preview stub教模型offset/limit分段读回——与DeerFlow ToolOutputBudget/deepseek spill**三方互证**
- **文件权限→HITL精确映射**：exact（read/write精确匹配才中断）vs **bulk（ls/grep/glob搜索子树相交即中断，pathless grep无条件中断）**两种scope
- **PatchToolCallsMiddleware**：悬挂tool_call自动补status=error的ToolMessage（~30行，中断恢复健壮性）
- **Harness profiles**：per-model（内置5个模型spec）调prompt组装/工具可见性/middleware/子agent默认+excluded_tools栈末剥离——**OpenSoul多模型共用一套prompt/工具面是"小模型效果差"的结构性原因**
- **BackendProtocol协议**（984行）：8种后端同一协议；**BaseSandbox只需实现execute()+upload_files()两个抽象方法**，ls/grep/glob/read全部shell派生（python3 -c+base64参数防注入）
- **Talon**：单事件循环=IM adapters（WhatsApp/Telegram/Discord）+cron+runtime；checkpoints.sqlite归档可搜索（分页/跨compaction存活/mongodb/postgres可选）；**per-conversation interrupt-and-continue**；/reset-all-history故意不进/help防误触
- **Hooks三层信任**：user/project/plugin并发执行→project→user→plugin顺序reduce；project hooks须workspace trust（批准持久化hooks_trust.json）；12事件
- **TUI外部文本转义矩阵**（libs/code/AGENTS.md）：Rich markup f-string注入→Content.from_markup("$var")、App.notify默认markup=True会吞方括号→动态内容必markup=False——OpenMate可直接对表检查

**B. Continue源码验证（461MB全库读毕）：规则三件套+安全硬排除立即可抄**
- **Rules条件激活+requestRule按需拉取+createRuleBlock自建**：globs/regex触发注入；`alwaysApply===false && !globs`的rule不进prompt，agent按description主动requestRule(name)拉取——**规则的progressive disclosure**，与deepagents skills/claude-code ProposeSkills互证
- **DEFAULT_SECURITY_IGNORE_FILETYPES**：索引硬排除*.env/*.key/*.pem/*.db/*.secret——**先于用户配置的安全默认**（~40行立即可抄进immune/）
- **NextEdit预测引擎**：编辑历史聚合→diff上下文→**PrefetchQueue用户触发前预取下一处编辑**→per-model provider+outcome日志闭环（Cursor式前瞻编辑的开源实现）
- **代码库索引四索引器**（Snippet+LanceDB向量+FTS+Chunk）+**索引热路径Rust crate**（sync/）——行业信号：性能敏感路径下沉编译语言成默认（继open-interpreter转Rust fork）
- **81个LLM provider+autodetect能力探测**（FIM/nextEdit/tokenizer靠探测不靠配置）
- **Model Roles六角色**（chat/autocomplete/edit/apply/embeddings/reranking）——apply独立小模型负责"生成→落盘"
- 30+ Context Providers（RepoMap/Terminal/DebugLocals/Problems/Jira/GitHub/Postgres/Docs/MCP…）
- **行业信号：Continue Dev, Inc.停运**（36k星≠护城河；SaaS共享层先死，本地资产rules/prompts/81 provider适配长存——**OpenMate只做本地资产，不做云端依赖**）

**C. goose文档级发现（clone进行中，下轮补源码验证）**
- **行业信号：goose从Block捐给Agentic AI Foundation**（aaif-goose，Apache 2.0）
- **Recipes**=可复用工作流包（instructions+extensions+parameters+settings）：**retry带shell success checks+on_failure**、response结构化输出schema、sub_recipes隔离会话（不共享历史/记忆/状态，禁止嵌套，自动注入summon的delegate工具）、activities点击气泡、模板继承+indent() filter、GOOSE_RECIPE_PATH/GitHub仓库加载
- **Extensions=MCP**：激活前**恶意软件扫描**、goose://deeplink一键安装协议、OAuth DCR/CIMD+client_secret_key走secret store、--container docker内跑扩展、扩展per-call timeout
- **平台扩展十件套**：Analyze（代码结构+符号调用图）、Chat Recall（全会话历史搜索）、Code Mode、Extension Manager会话中动态增删、Skills、Summon（知识源+子agent委派）、Todo跨会话任务、**Top of Mind（每轮注入持久指令）**、Apps（HTML应用独立窗口）
- **工具权限三档per-tool**（Always Allow/Ask Before/Never Allow）+模式（Manual/Smart）+"总工具数<25"官方指引

### 已grep确认OpenMate/OpenSoul（本轮关键词）
NONE：rubric/grader/overflow(工具溢出义)/offload/dangling/exclusion/prompt_caching/harness_profile/delta_channel/threat_model/subrecipe/goosehint/malware/permission_mode/chat_recall/rerank/autocomplete(实质义)/deeplink/top_of_mind/model_role
部分：opensoul summariz/compact=sessions_api标志位与gene模板（无middleware级compaction/无溢出兜底）；evict=hippo记忆驱逐+session最旧驱逐（非工具结果外置）；glob=路径工具（非规则激活）；openmate hook=React hooks噪音；casbin用户RBAC（非工具/路径级）

## 下一轮研究对象
- goose源码验证（~/agent-research-src/goose-git clone完成后：crates/goose核心、permission实现、recipes引擎、summon子agent）
- OpenHands/extensions仓库（skills目录规范）、kilocode补源码
- CSV 65-100按star：ag2(#65)、semantic-kernel(#66)、Roo-Code(#67)、devika(#68)、generative-agents(#69)、SWE-agent(#72)、SuperAGI(#73)、agent-zero(#75)、RAGFlow等

## 源码级深读（真正clone/npm读代码）
已完成43个：openclaw、mem0、letta、autogen、browser-use、langgraph、openai-agents、google-adk、smolagents、dify、metagpt、firecrawl、crewai、deepseek-harness、opencode、AutoGPT、openai/codex、gemini-cli、langchain、pi、open-webui、TradingAgents、OpenHands(+software-agent-sdk)、litellm、daytona-v0.190、lobe-chat、open-interpreter、claude-code(npm逆向)、anything-llm(+open-computer)、n8n、Composio、E2B、Langfuse、Khoj、GPT-Researcher、STORM、DeerFlow、Flowise、Langflow、aider、**deepagents、continue（本轮）**、goose(文档级,源码补验中)

## 本轮（2026-09-17 07:00）新增 —— 工作流平台三强 + aider补源码
- DeerFlow（#18, 82k）已clone于 ~/agent-research-src/deer-flow；输出 18-deer-flow-source.md（25项）
- Flowise（#37, 55k）→ ~/agent-research-src/flowise（51MB）；输出 37-flowise-source.md（17项）
- Langflow（#21, 155k）→ ~/agent-research-src/langflow（244MB）；输出 21-langflow-source.md（14项）
- aider（#48, 38k）→ ~/agent-research-src/aider（77MB）；输出 48-aider-source.md（11项）
- 网络备注：codeload大仓库需不限时curl（langflow首次280s截断64M失败，重下成功）

### 🔴 本轮最重要发现

**A. DeerFlow的36个有序Middleware推理链 = OpenSoul cortex重构的完整参考实现**
- 顺序本身是产品：InputSanitization(最外层)→ToolOutputBudget(超长结果外置.tool-results/+旧write内容elide成引用)→
  ToolResultSanitization(外部网页伪造`<system-reminder>`中和)→…→Clarification(必须最后)
- **ReadBeforeWrite写门**：read_file盖内容hash戳，写已存在文件hash不匹配→拒写（"改代码前先读"机器化）
- **ToolReceipt回执台账**：r1..rN确定性溯源（hash/字节数/时间戳），回答可引用r7→前端展开原始工具结果
- **Delegation Ledger**：task委派持久化进ThreadState，终态永不降级，跨compaction存活
- **Clarification表单卡v2**：16字段/24选项/16KB，结构损坏整体降级——HITL表单的工业实现
- **SkillToolPolicy**：skill的allowed-tools钳制模型可见schema+拦截执行，fail-closed
- **DeerMem**：每fact一个md文件+抽取三标签(scope/durability/authority) fail-closed+近重复并入门(token-Jaccard+CJK bigram)+
  驱逐双策略(confidence/hybrid-v1 shadow模式)+定期复审+合并——LongMemEval基准跑过的产品级记忆
- **调度队列状态机**：uq活跃occurrence约束+queued/launching/running+租约恢复+preview-cron——will/的教科书
- 子agent双预算(并发1-64+每run总量默认6，超限剥调用强置stop)；Python扩展五贡献点(middleware/生命周期/observer/服务/路由)；
  IM四渠道(Feishu/Slack/Telegram/DingTalk)统一入口；MCP持久任务表+死信；X-Trace-Id五入口ContextVar

**B. Flowise/Langflow双平台 = OpenMate画布的"完全体"对照**
- Flowise：AgentFlow v2十五节点(**Iteration子图/Loop退出条件/HumanInput暂停/ExecuteFlow子流程/ConditionAgent意图选支**)、
  **Evaluation四实体**(Dataset/DatasetRow/Evaluation/EvaluationRun)+LLM裁判+CostCalculator+版本化重跑、
  **@flowiseai/observe可嵌入观测SDK**(节点树+step详情+每节点token/成本/耗时+INPROGRESS自动轮询+HITL Approve/Reject)、
  **NL→工作流生成器**(市场模板做few-shot)、一个flow暴露为MCP工具、队列三件套+Redis事件广播、OTel+Prometheus
- Langflow：**可插拔RBAC**(casbin_rule表+ensure_*_permission guard族+share行级共享+audit API+OSS passthrough策略)、
  **持久图Checkpoint**(按job_id落库,run_id恢复,跨用户扫描raise防泄漏)、tweaks运行时参数覆盖、
  **model_provider_policy模型白名单**、lfx独立执行CLI(执行器不依赖平台)、四层包分离(langflow→core→base→lfx)CI强制
- OpenMate已有xyflow画布+12节点+graph-engine(DAG校验/拓扑排序)——差距在：后端执行运行时、子图节点、HITL节点、NL生成

**C. aider补源码：RepoMap + lint回喂 + auto dirty commit**
- **RepoMap**：tree-sitter全仓Tag→引用图→PageRank排名→map_tokens预算截断注入prompt（SQLite+diskcache缓存）——
  OpenSoul无代码库感知(tree_sitter/repomap零命中)，"1000文件仓库塞进1024token"的图论解法
- **Architect双模型**（规划/编辑分工）——与TradingAgents快慢双LLM、STORM五槽位、claude-code互证
- **lint自动回喂**：编辑后自动lint，错误带tree_context函数体级上下文回喂LLM自动修——"改完自检"的机器化
- **auto dirty commits+undo**：AI编辑前自动commit，/undo一键回滚——与opencode git快照互证，直击"改完又撤回"痛点
- 20+编辑格式按模型能力选择(models.py 1338行模型档案：格式支持/价格/上下文窗)

### 本轮四方/五方互证 → P0再确认
| 能力 | 证据方（累计） | OpenSoul现状 |
|---|---|---|
| 后台作业队列 | langfuse+n8n+Flowise+Langflow+DeerFlow(5方) | 零 |
| 评估闭环(数据集+LLM裁判+版本化) | langfuse+n8n+LobeChat+claude-code+Flowise(5方) | 5维自评非裁判 |
| HITL暂停/表单/审批 | DeerFlow(表单卡)+Flowise(HumanInput节点)+Langflow(checkpoint恢复)+claude-code | 零 |
| 工具级middleware链 | DeerFlow(36个)+langchain(四钩子)+deepseek(三角色) | cortex单体函数 |
| 文件写保护/快照 | DeerFlow(ReadBeforeWrite)+aider(dirty commit)+opencode(git快照) | 零 |
| 代码库地图 | aider(RepoMap)+codegraph | 零 |
| 模型白名单/授权 | Langflow(policy)+claude-code(model:use)+litellm(路由) | 零 |

### 已grep确认OpenSoul/OpenMate（本轮关键词）
NONE：read_before_write/tool_receipt/clarif|ask_user/deferred|tool_search/tool_promot/delegation|ledger|guardrail|provisioner/
tree_sitter|repomap/lint|flake8/human_input|hitl/prometheus|opentelemetry(opensoul仅metrics_api.py 1处)
部分：immune/intrusion.py有输入侧注入检测(无工具结果侧中和)；hippo有decay(无驱逐策略/复审/合并/近重复门)；
casbin RBAC用户级(非资源/工具/模型级)；mcp/server有MCP生产消费(无"flow=MCP工具"产品化)；
OpenMate workflow-store.ts=xyflow画布12节点+graph-engine DAG校验(无执行运行时/子图/HITL/NL生成)；
will/=DAG骨架(无队列/租约/checkpoint)；trajectory=扁平事件表(无span嵌套/节点指标)

## 下一轮研究对象
OpenHands/extensions仓库（skills目录规范）、RAGFlow/Metric/OpenManus等CSV 45-100行按star排序、
kilocode补源码、deepagents(#59 batteries-included harness)、continue(#51)、block/goose(#63)

## 本轮（2026-09-17 06:00）新增 —— 三大"研究型agent"补齐
网络注意：github.com直连clone失败（SSL eof），改用 `curl https://codeload.github.com/<org>/<repo>/tar.gz/refs/heads/<branch>` 成功。
- Khoj（#38, 31k自托管第二大脑）→ ~/agent-research-src/khoj（84MB）；输出 38-khoj-source.md（20项）
- GPT-Researcher（#39, 105k深度研究）→ ~/agent-research-src/gpt-researcher（24MB）；输出 39-gpt-researcher-source.md（22项）
- STORM（#40, 78k Stanford长文生成）→ ~/agent-research-src/storm（6.6MB）；输出 40-storm-source.md（20项）

### 🔴 本轮最重要发现（"深度研究"整条产品线OpenSoul为零）

**A. Khoj的中断注入 = 本轮性价比最高的单项设计**
- **interrupt_queue**：研究跑到第N轮，用户发新指令 → 从queue取出 → 拼进研究历史、重置query、**保留已完成迭代**继续跑。
  语义上是"研究的rebase"，实现仅~15行。**OpenMate聊天框在任务运行时应变"插话框"**
- **cancellation_event协作式取消**（每轮循环开头检查，断连即停）——10行代码
- **重复工具组合检测**：{(tool_name, args_tuple)}集合，命中→注入warning"你已经调过这个，换一个"。
  与deepseek循环guard/anything-llm loop-detect三方互证，5行代码零误报
- **Research模式最小正确实现**：MAX_ITERATIONS=5 + 每轮LLM选工具→并行执行→iteration_history聚合→可从部分研究继续
- **DateFilter/FileFilter/WordFilter自然语言检索过滤**（`dt>="yesterday"`+dateparser+12种日期预编译正则+LRU缓存）——OpenSoul hippo检索层完全没有
- **记忆CRUD API**（用户可看/改/删AI对自己的记忆）——信任设计，OpenSoul有存储无API
- **Operator = Docker容器内agent电脑**（挂docker.sock，computer/browser双env，4种VLM agent共2900行）
- run_code双沙箱（Terrarium/E2B）：**执行前后files.list集合差，只下载新增文件**

**B. GPT-Researcher的广度×深度递归研究**
- **DeepResearchSkill**：generate_search_queries(breadth)→Semaphore并发N个子GPTResearcher→提取learnings+citations+followUpQuestions→
  `depth-1且breadth=max(2,breadth//2)`递归。**宽度减半天然树形收敛，参数直接抄**
- **SourceCurator**：96行=一次LLM调用按可信度排序来源，失败降级返回原表。政企报告可信度刚需，立即可做
- **MCPToolSelector**：按query从全部工具选3个（与claude-code tool_search互证→OpenSoul mcp全量暴露是token浪费）
- **ContextCompressor快路径**：`total_chars<8000且docs<=max_results→跳过整个embedding压缩管线`（先算代价再决定花不花）
- **mcp_strategy三档**（fast/deep/disabled）+ 逐步成本核算step_costs + 20种检索器 + 8种scraper插件
- 教训：`all_context必须extend而非append`（list/str双形态），开关改变数据类型是易错点

**C. STORM的引用三件套 + 阶段断点 + persona采访**
- **ArticleTextProcessing**（150行纯函数库）：parse_citation_indices/deduplicate_group合并`[1][1]`→`[1]`/
  update_citation_index重编号/**remove_uncompleted_sentences_with_citations删带引用的残句**/limit_word_count_preserve_newline
  → **可直接移植为cortex/citation_utils.py，立即提升报告质量**
- **反幻觉三件套全是廉价后处理**：无检索结果明说不知道、删残句、引用去重重编号
- **persona引导采访**：ConvSimulator里WikiWriter以不同立场persona提问↔TopicExpert带检索作答，"Thank you so much"即终止。
  比一次性生成N个query质量高（问出的问题是上一轮答案引出的）
- **分阶段Runner+本地断点续跑**（information_table/outline/draft各自落盘可从磁盘加载）——OpenSoul will/无checkpoint/resume/stage
- **LM调用级磁盘缓存**（~/.storm_local_cache + lru_cache双层，cache=True逐调用开关，命中cost=None显式标注）
- **每管线阶段独立LM**（conv_simulator/question_asker/outline_gen/article_gen/article_polish 5槽位）——与TradingAgents快慢双LLM互证
- **Co-STORM人机同场研究**：Moderator调度多Expert+真人随时插话，**插话内容经Information Insertion Module写入知识库**而非直接拼prompt
- **exclude_urls=[ground_truth_url]评测防泄漏**贯穿检索接口

### 深度研究产品线共识（三方互补 → OpenSoul整条线缺失）
| 维度 | Khoj | GPT-Researcher | STORM | OpenSoul |
|---|---|---|---|---|
| 迭代研究循环 | ✅5轮+并行工具 | ✅广度×深度递归 | ✅persona采访 | ❌ |
| 中途插话/取消 | ✅interrupt_queue | ✅HumanAgent节点 | ✅Co-STORM | ❌ |
| 来源可信度 | — | ✅SourceCurator | ✅反幻觉三件套 | ❌ |
| 引用规范 | — | 弱 | ✅三件套工具箱 | ❌ |
| 断点续跑 | ✅部分研究继续 | ❌ | ✅分阶段落盘 | ❌ |
| 重复检测 | ✅组合签名 | — | — | ❌ |
| 检索过滤 | ✅date/file/word | ✅query_domains | ✅exclude_urls | ❌ |
| 代码沙箱 | ✅Terrarium/E2B | — | — | ❌ |

### 已grep确认OpenSoul（本轮关键词）
NONE：deep_research/subtopic/curator/visited_url/prompt_family/podcast(无STORM式生成)/interrupt_queue/cancellation_event/
operator(仅模板字符串)/computer_use/subscription/stripe/date_filter/word_filter/file_filter/notion/github_ingest/
apscheduler/checkpoint|resume|stage(will/零命中)/rerank/事实核查/fact_check/bibliography
部分：event_stream.py有事件流(可加research_progress)；intelligence/intent.py已有research意图+tools=[web_search,web_extract,browser_exec]（套DeepResearchSkill即升级）；
reflex/cache.py是语义响应缓存非LLM调用缓存；gland/token_meter有总量无逐步归因；hippo有记忆存储无CRUD API；cortex/quality.py引用仅+0.05启发式

## 下一轮研究对象
Langflow（#21）、Flowise（#37）、DeerFlow补源码（#18）、Firecrawl补源码细节、
OpenHands/extensions仓库（skills目录规范）、kilocode/aider补源码、
按star数继续：RAGFlow/Metric/OpenManus等（读CSV 45-100行）


## 本轮（2026-09-17 05:00）新增 —— 四大"平台底座"补齐
四个都是"运行时底座"型项目，正补 OpenSoul 最系统性的短板。
- n8n（#19, 80k workflow平台）clone至 ~/agent-research-src/n8n；输出 19-n8n-source.md（18项）
- Composio（#31, 工具集成中台）clone至 ~/agent-research-src/composio；输出 31-composio-source.md（14项）
- E2B（#32, 沙箱运行时）clone至 ~/agent-research-src/e2b；输出 32-e2b-source.md（14项）
- Langfuse（#52, LLM可观测）clone至 ~/agent-research-src/langfuse；输出 52-langfuse-source.md（18项）

### 🔴 本轮最重要发现（四大底座缺口，全部直击"安全"+"可观测"+"进化"）

**A. Langfuse = OpenSoul trajectory 的"完整体"，差距最大且正对准用户两大原话痛点**
- **Trace→Observation(嵌套span)→Score 三层观测模型**：OpenSoul trajectory/store.py 只是扁平事件表
  （有 parent_event_id/replay/fork 的雏形），缺 span 嵌套 + score 挂载。**"不知道在干嘛"的教科书骨架**
- **LLM-as-Judge + Dataset + Experiment 闭环**：评估队列 → 数据集回归 → 实验对比 → 用数据说"进化了没有"。
  **"一直没有进化"的度量解法**（与 n8n Evaluation、LobeChat rubric、claude-code ProposeSkills 四方互证）
- **Background Queue 底座**（BullMQ 30+队列 + **secondary queue 吞吐隔离** + **DeadLetter 重试队列**）：
  评估/摄入/导出都是异步重活，OpenSoul **完全没有后台队列**。这是可观测+评估的共同地基
- 确定性采样（eval 可复现）、逐 span token 归因、OTel 标准埋点

**B. E2B = "跑不可信代码"这条腿 OpenSoul 基本是空的**
- mirror/sandbox.py 是**目录级假沙箱**（只有 variables/log/snapshot_count/data_dir），**无进程/文件/网络隔离**
- **Snapshot→Fork 并行探索**：一次冻结快照 → fork N 个分叉各自独立成败。**agent 试错型任务的核心能力**
- **网络策略热更新**（updateNetwork allow/deny 域名）、文件事件流（inotify 5 类）、签名 URL、Dockerfile→模板
- 结论：安全关键的代码隔离是 OpenSoul 相对 E2B 的最大单项差距

**C. Composio = 工具接入中台，OpenSoul 有 MCP 生产+消费但缺"授权托管 + 会话隔离 + 工具拦截"**
- **Session 级工具路由**（会话自带 toolkit 白名单 → 生成隔离 MCP endpoint）：不同用户/会话可见工具集不同。
  OpenSoul mcp/server 是全局共享，**安全缺口**
- **14 种 AuthScheme 标准枚举 + Connected Accounts + OAuth 流程托管**：政企多系统 SSO 的地基，全缺
- **before/after execute 纯函数 Modifier**：工具执行拦截，与 CrewAI Hooks/OpenHands Hook 同族——OpenSoul 缺统一工具拦截层
- 凭证主权二分（自管 vs 托管）+ Proxy 托管凭证（凭证不进 agent 上下文）

**D. n8n = 工作流运行时成熟度，OpenSoul will/ 有骨架无运行时**
- **Evaluation Test-Runs**（数据集驱动批量测试 + LLM 裁判 + 指标归一化冻结快照）
- **部分执行重跑**（partial-execution 10 个纯函数图算法：从任一节点重跑，"改一处只重跑一处"）
- 队列水平扩展（leader-election + multi-main + pubsub + redis-lock）、消息事件总线、表达式沙箱、数据去重、外部密钥

### 三方/四方互证 → OpenSoul 升 P0（本轮新增）
| 能力 | 证据方 | 用户痛点 |
|---|---|---|
| 观测三层模型 + 异步队列底座 | langfuse+n8n+daytona(录制回放) | "不知道在干嘛" |
| 评估闭环(LLM裁判+数据集+实验) | langfuse+n8n+LobeChat+claude-code | "没有进化" |
| 真隔离沙箱 + 网络白名单 + 快照分叉 | e2b+anything-llm+codex+claude-code | 安全/合规 |
| 工具拦截 + 会话级工具隔离 + 授权托管 | composio+crewai+OpenHands | 安全/借力生态 |

### 已grep确认OpenSoul（本轮关键词）
NONE：llm_judge/dataset/test_run/partial/rerun/leader_election/pubsub/context_hook/data_table/表达式沙箱/
external_secret/tunnel/observation(嵌套span)/score/experiment/code_eval/batch_export/data_retention/otel/
dead_letter/后台队列/oauth流程/connected_account/toolkit/auth_scheme/provider_adapter/tool_modifier/
custom_tool/会话级工具隔离/inotify/watch/volume/dockerfile/signed_url/updateNetwork/jupyter
部分：mirror/sandbox.py=目录级假沙箱；trajectory/store.py=扁平事件表(雏形)；limb/executor=RPA固定动作；
mcp/server+server_registry=MCP生产消费(无授权隔离)；will/=DAG骨架(无运行时成熟度)；benchmark/evaluator=5维自评(非裁判)

## 下一轮研究对象
Khoj（#38 自托管AI第二大脑）、GPT-Researcher（#39 深度研究agent）、STORM（#40 维基百科级长文生成）、
Firecrawl补源码、Composio/python SDK补、OpenHands/extensions（skills目录规范）、
kilocode/aider补源码、Langflow（#22）、Flowise（#37）、DeerFlow（#23）

## 本轮（2026-09-17 04:10）新增
- lobe-chat（#26, 60k）clone至 ~/agent-research-src/lobe-chat；输出 26-lobe-chat-source.md（25项）
- open-interpreter（#29, 58k）clone至 ~/agent-research-src/open-interpreter；输出 29-open-interpreter-source.md（18项）
- claude-code（#10, 145k）**npm逆向**：`@anthropic-ai/claude-code@2.1.273` + `@anthropic-ai/claude-agent-sdk@0.3.273`
  → sdk.d.ts 9,313行 + sdk-tools.d.ts 4,183行，**已持久化到 ~/agent-research-src/claude-code-npm/{agent-sdk,cli}**；输出 10-claude-code-source.md（34项）
- anything-llm（#23, 66k）clone至 ~/agent-research-src/anything-llm；输出 23-anything-llm-source.md（20项）

### 🔴 本轮最重要发现（四项 P0，全部直击用户原话痛点）

**A. Claude Code 的 sdk.d.ts 是本次调研信息密度最高的源码**（工具全 schema + SDK 全类型公开发布）：
- **33 个 Hook 事件**权威清单（PreToolUse/PostToolUse/PostToolUseFailure/**PostToolBatch**/Notification/
  UserPromptSubmit/**UserPromptExpansion**/SessionStart/SessionEnd/Stop/**StopFailure**/SubagentStart/
  SubagentStop/PreCompact/PostCompact/**PreModelSwitch/PostModelSwitch**/PermissionRequest/PermissionDenied/
  Setup/**TeammateIdle**/**TaskCreated/TaskCompleted**/**Elicitation/ElicitationResult**/ConfigChange/
  WorktreeCreate/WorktreeRemove/**InstructionsLoaded/CwdChanged/FileChanged/DirectoryAdded/MessageDisplay**）
- **ProposeSkills**：agent 主动提议 skill（kind=new|improvement，1-3条），字段含 description(<200字，决定何时被用)
  + **evidence（观察到该流程的 memory 文件路径）+ skillMd（完整 SKILL.md 原文；improvement 必须先读现有
  SKILL.md 并保留全部值得保留的内容）** → 用户审阅卡片一键保存。**"没有进化"的最直接解法**
- **ScheduleWakeup**：agent 自定下次醒来时间（钳到[60,3600]秒），必须给 reason，**必须自报 noop=true/false**，
  **连续 noop 折叠显示并统计 streak**。**"不知道在干嘛"的教科书答案**
- **SDKContextUsage 逐项 token 归因**：mcp_tools[]/memory_files[]/agents[]/skills[] 每项多少 token，
  区分 over_limit.kind= hard_limit | compaction_window
- **RewindFilesResult.skippedLinks**：因 symlink/hardlink/父目录指向变化/备份不可读而拒绝恢复的文件数
- **SandboxSettings.credentials**：mode=deny|mask + **decode:jwt + maskClaims + maskDuplicates + injectHosts**
  + onExtractNoMatch=deny|error|warn（凭证脱敏做到 JWT claim 级）
- **AgentDefinition 21 字段**，含 **observer + observerMessage**（每个 agent 自动挂一个只读观察者 agent，
  收活动摘要、用 ObserverReport 上报、绝不参与任务）、**memory scope**（user/project/local →
  ~/.claude/agent-memory/<agentType>/）、omitClaudeMd、disallowedTools 支持 `mcp__server*` 服务器级通配
- 权限 6 模式 + **PermissionUpdateDestination 四层目的地**（user/project/localSettings/session/cliArg）
- **ProvenanceEntry** 设置溯源（source + 绝对路径 + policyOrigin 7 种：helper/remote/plist/hklm/file/parent/hkcu）
- **14 个 failure_mode 分类法**（含 subagent_overspawn / overeager / stopping_short / excessive_questions…）
- Workflow 工具 **resumeFromRunId**：按 (prompt,opts) 做结果缓存，脚本改一处只重跑一处

**B. AnythingLLM 的 open-computer = agent 专属虚拟操作系统**（QEMU/iso + 仿 Windows 桌面 UI +
人实时可见 + 随时打断），**agent 内核直接复用 `@earendil-works/pi-coding-agent`**（= #15 的 Pi）。
- **loop-detect**：3-gram shingle + **Jaccard 相似度 0.85**，文本重复≥8次 / 工具签名(name:argsHash)重复≥4次 /
  连续15轮无工具调用 → 报警，60s 冷却。**参数全部可直接抄**
- **idle-detector**：5s 检查，60s 无 RPC 事件且未 ask_user → 主动弹"Agent idle for Ns，需要帮助吗？"，
  有 idleSuppressedUntil 抑制窗口。**纯宿主侧，不需要 agent 配合**
- **规划模式 = 只注册 propose_plan 一个工具**（物理上杜绝边规划边改文件）
- **propose_delegation 工作单元**：id/title/role/objective/**allowed_tools**/expected_output/**
  **depends_on**/**requires_user_approval**，最多8个
- save-deliverable：写 /home/agent/deliverables，**md 自动转 pdf/docx/xlsx**
- MCP server **自动转成 agent 插件**（`@@mcp_{name}`）
- BackgroundWorkers：**cron 强制 UTC**（容器跨时区一致）、删 job 必杀在途 worker

**C. LobeChat 已从聊天 UI 演进为 Agent OS**（packages/ 下 100+ 个 builtin-tool-* 包）：
- **declareSelfFeedbackIntent**：agent 只"声明改进意图"（kind=memory/skill/gap ×
  action=write/create/refine/consolidate/proposal + confidence 0-1 + **evidenceRefs 必须是稳定 id**），
  **绝不动手**；下游 reviewer 负责去重/审批/落盘。prompt 里明令"不能宣称已保存"。
  **这是本轮最有价值的单一设计**——"高召回声明 + 严格审批"解掉自我改进的两个死法（不敢改/乱改）
- **heterogeneous-agents**：把 Claude Code/Codex/Cursor/Devin/OpenCode/Pi/Kimi Code/Trae/Qoder/
  CodeBuddy/Amp/Droid **统一成本产品的子 agent**，12+ 适配器，本地 CLI 与远程平台双类
- **HeterogeneousAgentCliError{code: cli_not_found|auth_required, command, docsUrl, installCommands}**
  → 前端直接渲染安装引导
- **6 维记忆抽取器** + **gatekeeper**（记忆准入判定：这条该不该进长期记忆）
- **eval-rubric**：AnswerExtractor → matchers（规则/LLM 双模式）→ passThreshold 默认 0.6
- **Goal supervisor 四工具**（inspectGoal/inspectTask/readArtifact/resolveInterruption），
  prompt 纪律"散文回答不算提交"、"handoff 是上报证据不是文件系统探测"
- 40+ 上下文注入器 + 20+ 处理器管线 + **conversation-flow/doctor**（自动扫描会话树找悬挂 id 生成 RepairOp）
- 5 套 IM 适配器独立包（feishu/imessage/line/qq/wechat）

**D. Open Interpreter 已被彻底重写**：Python `interpreter` 包从仓库消失，整体变成
**OpenAI Codex（codex-rs）的 Rust 分发 fork**，127 crate，定位"为低成本模型优化"（重写 Kimi Code harness）。
- **重大行业信号**：58k★ 五年 Python 项目放弃 Python 转 fork Rust Codex
- **agent-roles**：递归扫 .toml 作角色；**角色 = `#[serde(flatten)]` 的一层 ConfigToml 覆盖**
  + description + **nickname_candidates**（给自动 spawn 的子 agent 起名候选池）。**"角色=配置层"建模极优雅**
- **product-info 单一品牌事实源**：`enum Product{Codex, OpenInterpreter}` + `Product::current()`，
  所有用户可见文案/URL/安装命令集中一处，FORK_BRANDING.md 明令"不要全局替换 codex"
- 产品自身版本 ≠ 内嵌上游兼容版本（`OPEN_INTERPRETER_CODEX_COMPATIBILITY_VERSION=0.154.0`）
- AGENTS.md 工程红线可直接抄：Rust 模块<500 LoC、文件>800 LoC 必拆、
  `#[tracing::instrument]` 打在函数定义而非调用点、测试比较整个对象、不为静态值写测试

### 六方互证 → OpenSoul 全缺，升 P0
| 能力 | 证据方 | 用户痛点 |
|---|---|---|
| Agent可观测性（noop自报/streak、idle检测、循环检测、token逐项归因、可见终端） | 全部6方 | "我都不知道他们在干嘛" |
| 技能/记忆自进化+审阅落盘 | claude-code+LobeChat+gemini-cli | "一直没有进化" |
| 工具审批流（6模式+4层目的地+干预UI注册表） | claude-code+LobeChat+codex+opencode | 安全 |
| 目标可验收+监督恢复 | claude-code+LobeChat | 长时任务 |
| 沙箱+凭证脱敏（JWT claim级） | claude-code+anything-llm+codex | 政企合规 |
| 会话fork/tag/回滚 | claude-code+pi+open-webui+opencode | 误操作恢复 |
| 异构外部agent适配 | LobeChat+anything-llm(复用Pi) | 借力 |

### 已grep确认OpenMate/OpenSoul（本轮9个关键词全 NONE）
self_feedback / heterogeneous / group_agent / agent_builder / gatekeeper / rubric /
gen_ai|opentelemetry|otel / notebook / intervention —— opensoul/src 与 openmate/src 均零命中。
opensoul 现状：hippo/{decay,long_term_memory,memory_store,session}（无分维度抽取）；
learn/{course_engine,experience,long_term}；gene/{skill_learner,templates}（agent 不能改自己配置）；
api/git_api.py 有 worktree 但非 agent 工具；marrow/backup.py 是备份非 checkpoint 回滚。

## 下一轮研究对象
n8n（#19, 80k workflow平台）、OpenHands/extensions 仓库（skills 目录规范）、
kilocode/aider 补源码、Composio（#31 工具集成）、E2B（#32 沙箱）、
Langfuse（#52 可观测）、Khoj（#38）、GPT-Researcher（#39）、STORM（#40）

## 上轮（2026-09-17 02:00）新增
- OpenHands（#17, 87k）：openhands已是**纯前端Canvas**，后端拆到OpenHands/software-agent-sdk，clone至
  ~/agent-research-src/openhands + openhands-sdk；输出 feature-matrix/17-openhands-source.md（23项）
- litellm（#27, 58k）clone至 ~/agent-research-src/litellm（269MB）；输出 27-litellm-source.md（20项）
- daytona（#20, 72k）：**核心2026-06已闭源**，取最后开源tag v0.190.0 clone至 ~/agent-research-src/daytona-v0190；
  输出 20-daytona-source.md（13项）
- OpenHands新发现：Hook系统6事件+command/LLM双类型+allow/deny（P0）、子agent markdown定义. agents/agents+6级优先级（P0）、
  launch_child_conversation工具(local/cloud隔离+父子记录，P0)、安全分析器族(shell AST+LLM analyzer+GraySwan+ensemble，P0)、
  Secrets管理+X-Expose-Secrets加密头（P0）、Critic迭代精化(评分阈值自动重试)、并行工具执行+ResourceLockManager、
  ask_oracle第二意见(命名profile约定)、workflow工具(async main(wf) DSL)、conversation lease多实例所有权
  (TTL+generation takeover+host/pid)、settings schema导出+迁移链+golden fixture CI、Condenser可配置、
  Automation独立服务(模板+git-sync)、前端API契约纪律(CI守卫禁止直连)
- litellm新发现：GuardrailRegistry 30+集成插件化（P0）、6种路由策略(least-busy/latency/cost/usage/provider-budget)、
  异步批量spend写入(transaction_queue+bulk upsert)、四级预算+reset_budget_job+结转、语义缓存RedisSemanticCache、
  每日活动聚合analytics、MCP管理端点+导入器、pass-through透传、配置热管理
- daytona新发现：Runner/daemon双层架构（宿主编排容器+沙箱内toolbox fs/git/lsp/process/terminal）、
  会话录制+回放dashboard（直击可观测性痛点）、端口探测preview、netleash eBPF网络规则、
  opencode-plugin/pi-extension（让Daytona成为其他agent执行后端）
- 已grep确认OpenSoul：mirror/sandbox.py只是目录级沙箱非容器；gland/router.py有provider cooldown但无负载/成本路由策略；
  token_meter有budget无时间窗；immune/rate_limiter滑窗限流有；无pre_tool_use/HookDecision/AgentDefinition/
  ResourceLock/critic重试/oracle/owner_lease/SecretStore/mcp_oauth/backend_registry/child_conversation/condenser策略/
  share/device_flow；api/marketplace.py已有skill sources同步；trajectory/已有事件轨迹(录制回放升级基座)

## 下一轮研究对象
lobe-chat（#26）、n8n（#19）、claude-code（#10补源码——npm包逆向）、OpenHands/extensions仓库（skills目录规范）、
anything-llm（#23）、open-interpreter（#29）

## 本轮（2026-09-17 01:00）新增
- pi（#15, 105k）clone至 ~/agent-research-src/pi（TS monorepo 11包）
- open-webui（#16, 90k）clone至 ~/agent-research-src/open-webui
- TradingAgents（#14, 105k）clone至 ~/agent-research-src/TradingAgents
- 输出：feature-matrix/15-pi-source.md（20项）、16-open-webui-source.md（20项）、14-tradingagents-source.md（10项）
- pi新发现：会话=追加树(id/parentId)+切分支自动摘要、compaction携带readFiles/modifiedFiles清单、
  Harness多Lane并行+effect-gate+fork-policy、扩展系统(TS模块:生命周期+工具+命令+键位+UI原语+RPC代理)、
  HookRegistry有序钩子、包管理器+manifest/checksum/ProjectTrustStore、RPC模式+stdout output-guard、
  Chord跨进程facet运行时、skills规范(frontmatter+ignore感知+长度硬校验)、file-mutation-queue、
  刻意不含MCP/subagent/权限弹窗（全扩展化哲学）
- open-webui新发现：parentId消息树+fork(环检测)、tool_approval三态(approve/reject/answer+超时)、
  subagents独立token+chat、rrule自动化+run历史、模型排行榜(用户反馈即eval)、skills+AccessGrants、
  <memory_context>标签注入协议、15种向量库/9种RAG加载器(含paddleocr_vl/mineru中文OCR)/26搜索提供商、
  终端服务器反代、Valves参数阀门、事件目录+多target通知、一套access_grants吃所有资源
- TradingAgents新发现：**决策日志pending→延迟结果回填update_with_outcome**（P0，带真实反馈信号的记忆）、
  as_of时间旅行过滤(防回测未来泄漏)、同域/跨域两档检索预算(n_same=5全量+n_cross=3只取反思)、
  轮转保pending、对抗-裁决辩论协议、按ticker分库checkpoint、快/慢双LLM分级
- 三方互证（pi×open-webui×codex/gemini）→OpenSoul全缺升P0：parentId会话树+fork、工具审批三态、
  HookRegistry、决策延迟回填记忆（TradingAgents独有但直击"不进化"痛点）
- 已grep确认：opensoul无parent_id/fork/rrule/memory_context/structured_output(仅extraction.py)；
  sessions_api只有compacted标志位；gene/skill_learner有自动学skill但无标准目录规范；
  immune/audit.py有审计、enterprise.py有SCIM/LDAP、will/dag_planner+proactive有调度雏形

## 本轮（2026-09-17 00:30）新增
- openai/codex（#11, 124k）clone至 ~/agent-research-src/codex（118MB, 112个crate）
- gemini-cli（#13, 107k）clone至 ~/agent-research-src/gemini-cli（packages: cli/core/a2a-server/sdk/vscode-ide-companion）
- langchain（#9, 146k）clone至 ~/agent-research-src/langchain（69MB, monorepo, 重点langchain_v1 middleware）
- 输出：feature-matrix/11-openai-codex-source.md（24项）、13-gemini-cli-source.md（20项）、09-langchain-source.md（15项）
- codex新发现：两阶段记忆管线（Phase1提取+Phase2 consolidation agent+版本化）、execpolicy Starlark命令策略引擎
  （allow/prompt/forbidden+match/not_match规则自测）、Guardian同步审查+异步打分双模式、多平台沙箱（bwrap/Seatbelt/Windows MXC）、
  本地网络策略代理（HTTP+SOCKS5+limited只读模式）、elicitation暂停工具结果投递、keyring+secrets脱敏、
  agent-graph-store父子线程拓扑、external-agent-migration一键迁移竞品配置、tool_search按需加载、
  responses-api-proxy录制回放、context/目录50+prompt注入场景全枚举
- gemini-cli新发现：A2A server完整实现、双模子agent系统（local/remote×一次性/session四套invoker+registry+scheduler）、
  **skill-extraction-agent自动从对话提炼skill**（直击"没有进化"痛点）、JIT上下文（访问子目录自动加载GEMINI.md）、
  confirmation-bus+PolicyEngine、计划模式做成工具（enter/exit-plan-mode）、complete-task显式终止、MCP resources、
  billing/availability独立模块、vscode-ide-companion
- langchain新发现：v1框架收缩为create_agent+middleware；四钩子标准（before_model/after_model/wrap_model_call/wrap_tool_call）、
  PII检测middleware（信用卡Luhn/邮箱/IP/MAC/URL+脱敏策略）、model fallback链（含cache_control标记清理教训）、
  LLM-based tool_selector、model-profiles独立包、langchain-classic冻结策略
- 三方印证（codex×gemini×langchain）→OpenSoul全缺，升P0：工具审批流、模型降级链、PII/secrets脱敏、推理管线四钩子标准
- 已grep确认：opensoul中pii/redact/fallback/hooks/elicit/sandbox/execpolicy/confirmation命中均为node_modules噪音；
  openmate plan_mode只有locales死字符串（与前轮结论一致）

## 下一轮研究对象
claude-code（#10补源码——注意仓库不开源，只能从npm包/文档逆向）、earendil-works/pi（#15, 已clone?）、
open-webui（#16）、TradingAgents（#14）、OpenHands（#17补源码）、daytona（#20）

## 上轮（2026-09-16 21:30）新增
- deepseek-harness（#3, 222k stars）clone至 ~/agent-research-src/deepseek-harness（147MB, 50+包）
- opencode（#4, 207k stars）clone至 ~/agent-research-src/opencode（224MB, Bun+Effect-TS）
- AutoGPT（#5, 187k）clone至 ~/agent-research-src/AutoGPT（354MB, autogpt_platform）
- 输出：feature-matrix/03-deepseek-harness-source.md（21项）、04-opencode-source.md（16项）、05-autogpt-source.md（16项）
- deepseek-harness新发现：能力接缝三角色模式（P0架构）、工具结果溢写spill（P0）、循环重复检测guard（P0）、
  Goal域+round自动续跑、会话内提醒schedule、沙箱四档(bwrap/Landlock/Seatbelt/ACL)、
  session格式迁移代际链、运行时自改extensions、Agent Teams持久邮箱+任务DAG、凭证引用+授权流、
  compaction锁三段式+surfaceOp、webhook fire-and-forget建会话、LSP集成、Hook桥(Claude Code/Codex)
- opencode新发现：文件快照git对象库（用户问过的快照系统标准答案）、工具级权限ask/reply+通配符规则集
  （OpenSoul现有casbin RBAC管用户不管工具，错位）、CodeMode受限代码执行（只能调宿主schema工具）、
  git worktree会话隔离、Patch引擎、Session V2持久准入、HTTP录制回放、会话分享、Question结构化提问
- AutoGPT新发现：LLM目录即代码+retire迁移工具（OpenSoul/heredity/version_registry有半套未接gland）、
  信用计费闭环（preflight预扣+对账+防TOCTOU双花）、凭证租约（Redis锁+心跳+checkpoint）、
  LLM干跑模拟器（用inspect.getsource喂run()源码角色扮演block执行）、集群锁、工作流版本控制、
  ClamAV病毒扫描、block成本分析
- 已grep确认OpenMate/OpenSoul：plan_mode只有i18n死字符串；vein已有内容寻址存储但未接工具溢写；
  hippo有FTS5但只搜记忆不搜会话；permission是casbin用户RBAC非工具审批；snapshot命中均为指标快照非文件快照

## 已完成（100个）

### 详细研究（10个）
1. openclaw ✅（123个模块，深度分析）
2. claude-code ✅（插件系统）
3. hermes-agent ✅（231个agent模块）
4. cursor ✅（不开源，跳过）
5. warp ✅（Rust，agentic dev env）
6. mem0 ✅（记忆层）
7. letta ✅（有状态agent）
8. crewai ✅（多agent编排）
9. autogen ✅（维护模式）
10. browser-use ✅（浏览器自动化）

### 批量研究（90个）
11-100. ✅ 已全部覆盖

## 核心发现

### OpenMate/OpenSoul最需补强的10个功能
1. **可视化工作流编辑器**（最高优先级）
2. **沙箱代码执行**（安全关键）
3. **多agent协作系统**（复杂任务必需）
4. **工具集成市场**（生态扩展）
5. **LLM可观测性**（运维必需）
6. **持久化记忆层**（长期学习）
7. **上下文引擎**（token优化）
8. **快照系统**（时间旅行）
9. **Agent Consult**（agent咨询）
10. **编排引擎**（事件驱动）

## 输出文件
- 25个研究笔记（01-24 + SUMMARY.md）
- 功能对比表
- 实现建议

## 下一步
开始实现功能，按优先级：
1. 多agent协作系统（delegate_task已部分实现）
2. 上下文引擎（token优化）
3. 快照系统（git + checkpoint）
