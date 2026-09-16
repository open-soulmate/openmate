# Warp 第六补验：warp_tui前端层收官 + convert.rs工具映射层（深夜轮13b）

研究时间：2026-09-17 深夜轮13（cron收尾轮）
源码：~/agent-research-src/warp-master/crates/warp_tui/src（本轮从warp3.tar.gz按需解压，203文件/5.2万行非测试代码）+ crates/ai/src/agent/{action,action_result}/convert.rs
定位：**Warp收尾轮**——前5轮覆盖了GUI侧(action目录/secret_redaction/isolation/index/diff_validation)，本轮补齐headless TUI前端层+API↔Action转换层。至此Warp六轮收官。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | 多层级编排树Tab栏（drill-down+面包屑+子树rollup徽章） | 🔴 没有（会话列表平铺） | — | 完全没有 | P1，见下 |
| 2 | 本地↔云端会话Handoff（/handoff斜杠命令整卡流转） | 🔴 没有 | 部分（agent_collaboration.handoff_context仅上下文交接） | 完全没有 | P2 |
| 3 | AskUserQuestion交互卡（多问题分页+多选+SkipAll+自动前进） | 部分（acp-approval-modal单问题） | — | 部分有 | P1，~200行 |
| 4 | RunAgents编排审批卡（验收模式+逐字段配置模式） | 部分（acp-approval-modal） | — | 部分有 | P2 |
| 5 | /usage交互面板（credits进度条+pay-as-you-go圆点可视化） | 部分（cost_tracker日/月费用+per-session spending） | — | 部分有 | P3 |
| 6 | Zero State（首跑引导+What's New changelog+项目上下文） | 🔴 没有 | — | 完全没有 | P2，用户可观测性 |
| 7 | 上箭头Prompt/命令混合历史菜单（agent/shell双模式） | 部分（聊天输入历史?） | — | 部分有 | P3 |
| 8 | 文件编辑diff视图（多文件折叠摘要+ghost行+审批前Editing态） | 部分（scm-panel git diff） | — | 部分有 | P2 |
| 9 | 长命令监控视图（agent观察长跑终端命令，可折叠披露） | 🔴 没有 | — | 完全没有 | P2 |
| 10 | 工具调用per-tool/per-state标签系统（tool_call_labels 754行） | 部分（工具卡片有文案） | — | 部分有 | P3 |
| 11 | API tool_call↔Action完整双向转换层（40+工具含UseComputer/录制/MCP） | — | 部分（mcp/server.py） | 部分有 | 参照 |
| 12 | 会话恢复：远端子agent恢复不重跑（fetch权威状态一次） | 🔴 没有 | — | 完全没有 | P1（与goose restore互证） |

## 源码亮点（详细）

### 🔴 1. 多层级编排树Tab栏（orchestration_model.rs 1392行 + orchestration_tab_bar.rs 480行）
Warp的多agent编排UI是行业最完整的前端实现：
- **单一真源分离**：会话维度（child_session_by_conversation）由TuiOrchestrationModel持有，会话血缘（children_by_parent）只从BlocklistAIHistoryModel读、**永不镜像**（docstring明言）——防止两份树不同步
- **MultiLevelOrchestration特性开关双模**：开启时tab栏只渲染一层（drill-down锚点+直接子级），关闭时退回历史扁平全后代投影——大改造用feature flag灰度的教科书
- **面包屑chip**：根+直接父级（锚点在根下2+层时），anchor_navigable=false时tab仍渲染但不可选（"父会话已加载但无session"的诚实呈现）
- **子树rollup徽章**：group子级显示loaded子树的聚合状态（aggregated_orchestrator_status），"一个pill看整棵子树死活"
- **per-anchor分页状态**：tab_bar_paging_by_anchor——在某个drill-in层级内翻页不扰动其他层级的页码
- **全树键盘循环**：adjacent_tree_conversation=root+全部可导航后代按pill序环绕（GUI/TUI同序）
- **事件消费注册表**：每个live session声明消费哪些conversation的事件流（event_consumers_by_session），拓扑变更事件（20种枚举显式分类true/false）驱动重算
- **远端子agent恢复不重跑**：RestoreRemoteChildSession从持久化身份（task_id+run_id）物化轻量cloud session，fetch一次权威状态且**完成时校验session与task身份**——"迟到的响应不能更新已被替换的恢复树"（并发正确性注释）
- 本地CLI-harness子请求显式失败（能力边界诚实）

### 🔴 2. 本地↔云端Handoff（handoff/model.rs 769行 + block.rs 775行）
- **/handoff斜杠命令=整卡流转状态机**：Editable(Acceptance/Configuring两态)→Committed→Created(url+completed_at)→Persisted(continuing_locally标志)——"把本地会话搬到云环境继续跑"的完整前端
- **两页选择器**：Environment（"Which environment should run this conversation?"）+Model，suggest_handoff_environment按cwd异步推荐环境
- **长跑命令守卫**：has_long_running_command→prepare直接失败（HandoffPrepareError::LongRunningCommand）——有活PTY时禁止搬家
- **隐私设置联动取消**：准备期间用户关掉cloud conversation storage→订阅回调自动cancel（PrivacySettings/AISettings/TeamsChanged三路订阅同判）——合规设置变更实时作废在途操作
- **fork_existing_conversation**：可带着既有对话历史分叉进云端
- **失败恢复**：HandoffRestoration回滚（replacement_input把用户输入还回输入框）+四出路由（Cancelled/Failed/ContinueLocally/StartNewConversation）
- 与OpenSoul agent_collaboration.handoff_context（仅上下文文本交接）相比：Warp是**运行时+环境+模型+附件+快照上传**的全量搬迁，差一个量级

### 🔴 3. AskUserQuestion交互卡（tui_ask_question_view.rs 726行）
- 多问题**分页导航**（Previous/Next左右键+tab）、多选模式（shift-enter前进）、**ctrl-c=SkipAll**（跳过全部问题继续）
- AUTO_ADVANCE_DELAY 300ms——单选答案确认后自动翻页的节奏控制
- 键位用context predicate注册（ASK_QUESTION_ACTIVE时才抢ctrl-c），不污染全局keymap——TUI焦点管理参照
- draft与unanswered分开存（与Warp GUI ask_user_question问卷状态机550行同源，此前supplement已记）

### 4. RunAgents编排审批卡（orchestration_block.rs 878行）
- 两模式：Acceptance卡（请求摘要+run级配置）↔Configuring模式（TuiOptionSelector逐字段页动态序列）——**审批时可改配置再放行**
- Accept走共享execute_run_agents路径，Reject映射到action cancellation

### 5. /usage面板（usage_menu.rs 445行）
- credits进度条（一行字符填充率可视化）+pay-as-you-go圆点阵（MIN_CREDITS_PER_CIRCLE=500，MAX 2行）——**额度可视化的TUI最小实现**，OpenMate cost_tracker可直接抄形态
- format_usage_cost_cents/credits格式化函数共享

### 6. Zero State（zero_state.rs 1080行 + zero_state_animation.rs 1483行）
- 首交互前填充transcript区：标题+版本+**首跑引导或What's New changelog**+项目上下文
- 可见性由内容驱动：transcript空则显示，首个提交产出block即消失，清空后回来——**onboarding不占永久UI**
- 1483行动画单独成文件（zero_state_animation）

### 7. 文件编辑diff视图（tui_file_edits_view.rs 860行）
- TuiDiffStorage注册进共享executor：preprocess完成时seed解析后的diffs、execute时驱动持久化——**视图持有diff真源但不计算diff**（职责注释即架构）
- 每文件一个char-cell CodeEditorModel（buffer=编辑后内容、diff base=编辑前、model侧hunk上下文隐藏）
- 多文件折叠摘要头（"✓ Edited 3 files +a −r ▾"）嵌套缩进；**审批前用Editing进行时动词**（状态诚实）
- 失败/取消回落单行标签；恢复的成功动作从原始FileEdit请求水合

### 8. Prompt/命令混合历史菜单（prompt_and_command_history_menu.rs 499行）
- 光标在首行按Up→内联菜单，GUI/TUI共享历史combiner；**agent模式显示prompts+commands，shell模式只显示commands**
- 选择预览文本+输入类型，取消恢复原buffer+原输入类型

### 9. convert.rs：API↔Action双向映射层（action/convert.rs 810行 + action_result/convert.rs 1621行）
- 40+tool_call类型完整映射：RunShellCommand（is_read_only/uses_pager/is_risky三自评透传+citations）、WriteToLongRunningShellCommand（PtyWriteMode）、ApplyFileDiffs（V4AHunk解析）、ReadDocuments/EditDocuments/CreateDocuments（**规划文档DEFAULT_PLANNING_DOCUMENT_TITLE**）、UseComputer（截图参数/目标/坐标系三套convert函数）、StartRecording/StopRecording（录制目标）、ReadMcpResource/CallMcpTool、SuggestPrompt、UploadFileArtifact、FetchConversation、TransferShellCommandControlToUser
- **工程参照**：客户端不信任模型自评字段也不丢弃——照单序列化+服务端权威；转换层是独立薄层（From/TryInto trait），工具加新字段只改convert不动UI

### 10. 其他速记
- **slash_commands.rs**：TUI侧slash查询状态与search mixer接线，渲染/键盘分派在后层——模型层不碰UI的MVC纪律
- **tui_shell_command_view.rs**：RequestCommandOutput的status-aware头部变折叠披露，展开内嵌与顶层shell block同一终端cell渲染器（复用不复制）
- **tui_cli_subagent_view.rs**：agent监控长跑终端命令的TUI呈现（与supplement2的LrcActivity进程树采样配套：后端采样+前端此视图）
- **session_registry.rs**：session保留terminal view或轻量cloud-run view二选一，容器管生命周期和焦点，root view只路由输入给焦点session
- **零测试文件的测试名纪律延续**：*_tests.rs与实现1:1并列（warp_tui非测试代码5.2万行，测试文件数量相当）

## 可复用设计

1. **编排树"血缘单一真源"原则**（~P1）：OpenMate若做多agent树UI，会话归属关系只从OpenSoul trajectory/collab API读，前端绝不镜像第二份——拓扑变更事件20分类显式列出哪些要重算tab栏
2. **feature flag双投影**：新旧两种树投影共存（多层drill-down vs扁平），同一snapshot()函数内分支——大UI改造灰度方案
3. **恢复不重跑+身份校验**：远端子agent恢复时fetch一次权威状态，回调里校验"session还在且task_id未被替换"才应用——OpenSoul subagent恢复可整体抄
4. **隐私设置联动作废在途操作**：三路设置订阅同一判据（is_editable && !enabled）→cancel——合规开关的实时语义
5. **diff视图职责分离**：视图持有DiffStorage但不walk hunk；模型层算ghost行/隐藏区间；渲染层只画——OpenMate scm-panel升级参照
6. **AskUserQuestion键位predicate**：交互卡激活时才覆盖全局键（ctrl-c=SkipAll），退出即还——比全局劫持安全
7. **Zero State内容驱动可见性**：空态显示引导/changelog，有内容自动消失——onboarding零常驻成本
8. **convert薄层**：工具协议字段变更只改一个trait实现文件——OpenSoul MCP工具schema演进参照

## Warp六轮总账（收官）
- 轮5：64-warp-source.md（开源事实修正+Factories+.agents/skills标准）
- 轮6：64-warp-source-deep.md（specs进仓库+skills-lock+diff_validation 1293行+全局规则监听）
- 轮8：64-warp-source-supplement.md（secret_redaction 464行20正则+isolation_platform+Merkle索引）
- 轮10：64-warp-source-supplement2.md（动作目录30+动作+流式脱敏状态机+RunAgents+review线程重建）
- 轮12：64-warp-source-supplement3.md（LrcActivity进程树活性采样+结果类型驱动turn路由+was_edited_by_user）
- 轮13b（本轮）：64-warp-source-supplement4.md（TUI编排树+云端Handoff+AskUserQuestion+convert层）
- **总计~75项源码级发现**。Warp对OpenMate的价值排序：①编排树UI参照（前端独有）②secret_redaction并入immune（P0已记）③diff_validation前置验证门④.skills目录标准（五方定案已记）
