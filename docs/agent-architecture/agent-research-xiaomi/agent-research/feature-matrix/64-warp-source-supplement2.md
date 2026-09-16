# Warp 第四补验：secret_redaction消费端 + agent/action完整动作目录（轮10，源码级）

研究方式：warp3.tar.gz按需补解压 warp-master/crates/ai/src/agent/action{,_result}/；读毕 app/src/ai/blocklist/block/secret_redaction.rs(613行)+crates/ai/src/agent/action/mod.rs(958行前300)+review_comments.rs(145)。轮8已读crates/secret_redaction库本体（20正则），本轮补**消费端**。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | 🔴 **流式增量脱敏状态机**（secret_redaction.rs 613行）：**边流式输出边脱敏**（注释："redact secrets WHILE streaming to avoid any full secrets ever being shown"）——last_scanned_byte_index+**last_word_to_rescan缓冲**（秘密可能被streaming chunk从词中间劈开→每chunk重扫上一个词）+current_line缓冲（markdown解析会改写整行） | 无 | 无 | 完全没有 | 三缓冲设计是流式脱敏的完整答案，OpenSoul输出侧护栏从零到一直接抄结构 |
| 2 | **增量扫描三段状态机**：section/line双索引追踪；同section同line→只扫新增字节；新section→重扫首尾+全扫中间；line非前缀（markdown重写）→清空重扫该行——**重复检测防抖**（retain清理越界secret防重复条目） | 无 | 无 | 没有 | 注释里连usize溢出防御（"addition before subtraction to prevent overflow panic"）都写了 |
| 3 | **双消费方闭环**（轮8库侧已记，本轮确认UI侧完整链）：检测结果→is_obfuscated遮罩渲染+**hover高亮+点击tooltip显式揭示**（secret_location_open_tooltip与hovered分开——点开的tooltip不因hover他处而消失）+SecretLevel分级 | 无 | 无 | 没有 | "默认遮罩、点击才揭示"=敏感输出UX标准 |
| 4 | **Query位置清障**（clear_user_query_locations）：'/agent'前缀重排导致检测范围失效时按TextLocation::Query精准清理——**文本变更使检测结果失效**的工程处理 | 无 | 无 | 没有 | 教材 |
| 5 | 🔴 **AIAgentActionType完整动作目录**（mod.rs 958行，30+动作）——比此前任何一轮看到的都全：RequestCommandOutput(**is_read_only/is_risky/uses_pager三自评+rationale+citations**)/WriteToLongRunningShellCommand(向运行中PTY写入)/ReadFiles/UploadArtifact/SearchCodebase/RequestFileEdits/Grep/FileGlobV2/ReadMCPResource/CallMCPTool/SuggestNewConversation(模型建议开新会话)/SuggestPrompt(模型推荐提示词)/InitProject/OpenCodeReview/ReadDocuments/EditDocuments/CreateDocuments/ReadShellCommandOutput(delay支持)/UseComputer/**StartRecording/StopRecording(录屏:frame_rate/max_duration/window级target/4x回放)**/ReadSkill/FetchConversation/SendMessageToAgent(addresses多播)/TransferShellCommandControlToUser/**AskUserQuestion批量**/RunAgents/**WaitForEvents(idle_timeout等外部事件)**/InsertCodeReviewComments | 无 | limb/executor=RPA模板 | 绝大多数没有 | 该enum就是"agent能做什么"的行业最全参照表 |
| 6 | 🔴 **RunAgents批量编排**（215-271行）：base_prompt+per-child prompt拼接、**per-child模型覆盖**、harness_type选择（内置或三方CLI harness）、Local/Remote{environment_id,worker_host,runner_id}双模式、**agent_identity_uid服务账户身份**（factory agent以兄弟身份派发，server侧强制）、skills按批继承 | 无 | multi_agent.py 88行流水线 | 完全没有 | Warp Factories的底座——远程执行+身份委托是"agent集群"形态 |
| 7 | **WaitForEvents**：tool_call_id匹配入站resume信号+idle_timeout默认——**agent主动挂起等外部事件**（webhook/人工）而非轮询 | 无 | 无 | 没有 | HITL第十一方（等待型） |
| 8 | **TransferShellCommandControlToUser**：agent把正在跑的shell命令控制权移交用户+reason——**人机共驾一条命令** | 无 | 无 | 没有 | OpenMate终端页差异化机会 |
| 9 | **StartRecording细节**：window级target（ffmpeg x11grab -window_id只录单窗）+should_persist=false可丢弃+summary/description agent自述——录屏配置server-owned客户端执行 | 无 | 无 | 没有 | 与轮6 computer_use录屏互证的协议细节 |
| 10 | **review_comments线程重建**（review_comments.rs 145行）：parent_id缺失的孤儿评论保留为root并暴露missing_parent_id+root按ID排序reply按last_modified稳定排序+`**@author**:\nbody`+`\n---\n`分隔的markdown格式——**跨provider代码评审线程中立重建** | 无 | 无 | 没有 | 145行纯函数可整体移植 |
| 11 | **InsertCodeReviewComments动作**：repo_path+comments+base_branch→agent直接向代码评审插评论（本地仓库评审流） | 无 | 无 | 没有 | 与OpenCodeReview动作联动=agent自主PR评审闭环 |

## 源码亮点
- secret_redaction的detected_secrets以HashMap<TextLocation, HashMap<StringRange, Secret>>组织——位置×范围两级索引，UI按位置批量渲染零查找成本。
- mod.rs注释："`Some(true)` iff the LLM thinks that the command is readonly"——**is_read_only是模型自评而非静态分析**，与goose permission_judge互证（模型判定+缓存是审批疲劳的解）。
- RunAgents的per-child model_id："overrides the batch-level model_id for this child only"——批量编排里模型选择粒度到子任务。
- review_comments排序注释："Roots ordered by comment ID, replies stably ordered by last-modified"——确定性渲染承诺。

## 可复用设计
1. 流式脱敏三缓冲状态机（~300行核心）→ OpenSoul immune输出侧护栏
2. AIAgentActionType目录 → OpenMate工具面规划的checklist（尤其SuggestNewConversation/TransferControl/WaitForEvents）
3. RunAgentsRequest schema → OpenSoul multi_agent.py升级参照（per-child model+identity+remote）
4. review_comments线程重建（145行）→ 评审类功能直接抄

## grep确认（本轮关键词）
NONE：wait_for_events(实质义) / transfer.*control / send_message_to_agent / run_agents(编排义,前轮已确认) / agent_identity / review_comment / start_recording|stop_recording / suggest_prompt|suggest_new_conversation / secret_redaction(OpenMate/OpenSoul均无) / obfuscat
部分：OpenSoul immune/intrusion.py=输入侧注入正则（无输出侧流式脱敏）；OpenMate终端=命令执行（无控制权移交/录屏动作协议）
