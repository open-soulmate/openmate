# Agent Zero（frdel/agent-zero, #75, 15k★）功能研究 — 源码级深读

> 源码：~/agent-research-src/agent-zero（Flask+Alpine.js+LiteLLM+Socket.IO；agent.py 1613行；helpers/ 90+模块；plugins/ 40+内置插件）
> 定位：个人AI agent框架（Docker容器即agent电脑），插件架构是同类最细粒度

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **插件per-function扩展点**：`extensions/python/_functions/<module>/<qualname>/<start\|end>/` —— 任意模块任意函数的入口/出口都可被插件拦截（`@extension.extensible`装饰器）；配置解析顺序=project/profile→project→user/profile→user→default五层 | 无 | 无（gene/templates是模板非钩子） | 完全没有 | **比claude-code 33个Hook事件更彻底**：不预设事件表，直接函数级切入。Python侧用decorator+目录约定实现，~100行核心。OpenSoul cortex/will所有关键函数可先挂装饰器 |
| 2 | **_infection_check输出侧安全门**：流式收集reasoning+response→独立审计模型分析prompt注入→工具执行前`gate()`阻塞等结果；verdict三态`<ok/>`/`<terminate/>`/`<clarify>`（澄清回环最多N次）；thoughts模式（流式期间并行审计，低延迟）/complete模式；终止时最后AI消息替换为`[BLOCKED]`+桌面通知+排队消息继续 | 无 | immune/intrusion.py仅输入侧正则检测（SQL/XSS/命令注入） | 完全没有 | **本轮最高价值单项**：注入检测从"用户输入侧"扩到"LLM输出+工具执行前"，与DeerFlow ToolResultSanitization互补。政企安全刚需 |
| 3 | **_tool_access工具策略**：per-project+per-agent-profile的allow/block名单（mode=inherit/custom、default=allow/block、mcp_default独立开关），response/vision_load工具物理不可禁；策略按project→profile解析 | 无 | casbin用户RBAC（非工具级） | 完全没有 | 与opencode工具级权限/goose三档互证；OpenSoul缺工具级策略层 |
| 4 | **parallel工具（作业式并行）**：一条消息发起N个工具调用为parallel jobs→start/background/await/cancel/collect动作→job_id追踪→**promote_parent_history收集结果进父历史**→超时控制 | 无 | 无 | 完全没有 | 与OpenHands并行工具+ResourceLock互证。"作业ID+collect"模型比"同时发N个tool_call"更可控 |
| 5 | **_time_travel工作区时光机**：对agent工作目录做snapshot/history_list/diff/preview/**travel/revert** API七件套+retention保留策略；per-project历史 | 无 | vein有内容寻址存储未接此场景；marrow/backup是备份非diff旅行 | 部分有 | 与aider dirty commit/opencode git快照三方互证；OpenSoul vein直接升级为工作区快照层 |
| 6 | **_goal目标插件（always_enabled）**：chat内建goal追踪+goal工具——每次响应后自动评估目标进度，UI显示进度条 | 无 | intelligence有意图无持久goal追踪 | 部分有 | 与claude-code验收目标/LobeChat Goal supervisor互证 |
| 7 | **scheduler调度工具**：ScheduledTask/AdHocTask/PlannedTask三类+TaskState状态机+**local时区别名解析**（"local"/"user"→用户时区，pytz）+计划日期自然语言解析 | 无 | will/dag_planner有DAG无一次性/循环调度工具 | 部分有 | agent自带调度工具（非平台cron），用户说"明天9点提醒我"直接建任务 |
| 8 | **state_monitor状态投影推送**：按ConnectionIdentity做per-连接状态投影（StateRequestV1版本化快照+增量推进）——每个浏览器tab只收自己关心的状态切片 | OpenMate全局store广播 | 无 | 完全没有 | 多端同开时避免全量广播；WS增量推送的工业实现 |
| 9 | **watchdog文件监视注册表**：watchdog Observer+create/modify/delete/move四事件+glob模式匹配+按scheduled_root分发回调 | 无 | 无 | 完全没有 | 与aider watch互证；外部改动文件自动进上下文 |
| 10 | **_context_doctor工具调用JSON修复**：默认dispatch前先修JSON（json_repair依赖自愈安装）+紧凑持久化；插件自带依赖管理（检测→uv安装pinned版本） | 无 | 无 | 完全没有 | 弱模型tool_call格式错误率高的低成本兜底 |
| 11 | **_chat_branching会话分支**+**_chat_compaction全聊压缩**+**_chat_naming自动命名**（Utility Model小模型） | OpenMate无分支 | sessions有compaction标志位 | 部分有 | 与pi会话树/open-webui fork互证（第4方） |
| 12 | **_agent_editor确定性稀疏编辑器**：agent profile的结构化编辑API（只改指定字段不动其他） | 无 | gene有模板无结构化编辑API | 完全没有 | agent配置防覆盖写 |
| 13 | **_orchestrator外部CLI agent编排**：skill+adapter元数据统一编排a0/Claude Code/Codex/Cursor CLI/Gemini CLI/**Hermes Agent**/OpenCode——**host CLI优先**（用户本机已登录的CLI直接用），容器agent备选；刻意不设terminal_agent工具靠skill按需加载 | 无 | 无 | 完全没有 | 与LobeChat heterogeneous-agents（12适配器）互证；注意其把Hermes也列为被编排对象 |
| 14 | **隧道家族**：cloudflare_tunnel+tailscale_tunnel+cli_tunnel统一tunnel_manager——agent可自己把本地服务暴露公网 | 无 | 无 | 完全没有 | 与web-shell-tunnel skill同思路产品化 |
| 15 | **virtual_desktop**：容器内虚拟桌面（1440x900 VNC式），agent操作GUI有真屏幕 | 无 | mirror有screen无虚拟显示 | 部分有 | 与anything-llm open-computer互证 |
| 16 | **DirtyJson宽容解析**：损坏JSON容错提取（业界知名的宽容解析器） | 无 | 无 | 完全没有 | 100行级，直接可抄 |
| 17 | **integration四通道**：telegram/whatsapp/email/a2a——邮件IMAP/SMTP、消息平台双向、A2A server | 无 | OpenMate无IM | 完全没有 | 政企IM是刚需（飞书/企微优先） |
| 18 | **_memory记忆插件+FAISS**+faiss_monkey_patch（并发安全补丁） | 无 | hippo有自己的记忆 | 部分有 | monkey-patch保并发安全的教训值得记 |
| 19 | **_plugin_installer/_scan/_validator/_discovery插件供应链**：社区插件index.yaml发现→安装→校验→欢迎屏discovery卡片推广 | OpenMate无插件市场 | api/marketplace.py有skill sources | 部分有 | OpenSoul marketplace可扩展为插件四件套 |
| 20 | **timed_input超时输入**+**intervention异常**（用户随时打断）、**backup.py**、**update_check**、**state_migration**版本迁移链 | 无 | 无 | 完全没有 | 小件组合：HITL基建 |

## 源码亮点

- **AgentContext即插件一等公民**：context的`__init__/remove`都挂`@extension.extensible`——新建/销毁会话本身可被插件拦截（如chat_naming自动命名）
- **infection_check的延迟设计**：thoughts模式在工具参数还在流式时就开始审计，gate()时大概率已有结果——安全检查不加延迟的诀窍
- **orchestrator的"反工具"哲学**：刻意不做terminal_agent工具（会常驻每个prompt），改为skill按需加载+adapter元数据——token预算意识
- **插件目录约定即架构**：`extensions/python/<lifecycle_point>/`+`_functions/<module>/<qualname>/`双轨，新扩展点=新目录不用改核心

## 可复用设计

1. **函数级扩展装饰器**（@extensible+目录约定）→ OpenSoul cortex/will的中间件化地基，比预设Hook事件表扩展性强
2. **infection_check输出审计门**（三态verdict+流式并行审计+澄清回环）→ immune/直接新增output_gate.py
3. **parallel作业工具**（job_id+start/await/cancel/collect）→ limb/executor升级
4. **_time_travel快照七件套** → vein内容寻址存储的现成上层API
5. **tool_access策略**（per-project/per-profile+default+名单）→ 替换casbin错位的用户RBAC为工具级
