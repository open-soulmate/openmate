# Warp 第五补验：action_result结果侧工程（1658行全文）

源码路径：warp3/crates/ai/src/agent/action_result/mod.rs。轮10已读动作目录侧（AIAgentActionType 30+动作），本轮补读**结果侧**：每个动作的返回值状态机+liveness证据+turn路由规则。本地全文读毕，零网络。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | 🔴 **LrcActivity=长命令进程树活性采样**：客户端固定频率采样命令进程树→cpu_time_delta/io_write_bytes_delta/live_process_count/state(Running/Sleeping/**DiskWait="真实进展非挂死"**/Zombie)+since_last_activity——"输出重定向到文件/静默计算的命令与挂死的命令在终端网格上不可区分"，进程树活动是agent判断"要不要杀"的证据 | 没有 | 没有（terminal后台进程poll只有输出文本） | 完全没有 | Linux /proc采样约100行可抄（psutil进程树CPU+IO计数）；直接回应用户资源占用关切+"不知道在干嘛" |
| 2 | **LrcActivity诚实测量原则**：best-effort——只在采样器真读到数时构建，"零也是真实答案"，无in-band"信号不可用"标记；since_last_activity由固定频率采样器导出而非agent轮询间隔 | — | — | 可复用设计 | 测量语义注释即教材 |
| 3 | 🔴 **结果类型驱动turn路由**：triggers_server_subagent()——LRC快照类结果让服务端把下一turn路由给**CLI子agent**而非编排者（长命令监督是专职子agent的活）；should_trigger_request_upon_completion()=取消类结果不重新触发agent循环 | 没有 | 没有 | 完全没有 | "结果形态决定下一步谁接"——OpenSoul cortex工具结果处理目前一视同仁回主循环 |
| 4 | **was_edited_by_user=编辑竞态检测**：RequestFileEditsResult成功时每文件带was_edited_by_user标志——agent写文件期间用户也改了，diff应用后如实上报，模型下轮可决定是否覆盖 | 没有 | 没有（edit_guard是系统快照非消息级） | 完全没有 | 与kilocode revert三态"workspace状态诚实"互证；mtime/内容hash对比即可实现 |
| 5 | **SkippedByAutoApprove=自动审批跳过不算取消**：AskUserQuestionResult第四态——auto-approve模式下问题自动跳过，is_cancelled()显式排除（注释"the agent should continue"）；跳过的question_ids留痕 | 没有 | grep auto_approve=0 | 完全没有 | HITL语义分级第N例：取消≠跳过≠拒绝，三者对循环的影响不同 |
| 6 | **Discarded≠Cancelled**：StopRecordingResult第四态——agent选择should_persist=false丢弃录屏，不算取消、turn继续。**终态爆炸但每个终态对循环的影响显式编码** | — | — | 可复用设计 | 结果枚举设计原则：凡"用户/agent意图不同"必须分态 |
| 7 | **ScreenshotSource双源**：Inline字节 vs Stored{stored_ref+签名URL+宽高}——大截图外置对象存储，结果里只带引用+尺寸（尺寸用于布局不需拉图） | 没有 | limb screenshot=stub | 完全没有 | 与工具结果外置七方互证同思路，媒体专用变体 |
| 8 | **命令结果四态+exit 130语义**：Completed/LongRunningCommandSnapshot/CancelledBeforeExecution/Denylisted；exit_code==130=is_cancelled_during_requested_command_execution（ctrl-c专属判断）；Denylisted=denylist命中不算error不算取消 | 部分（terminal工具结果无Denylist态） | 没有 | 部分有 | |
| 9 | **AskUserQuestion问卷答案结构**：Answered{question_id,selected_options[],other_text}与Skipped{question_id}分态+display_text()归一渲染——问卷结果的UI无关序列化 | 部分（OpenMate有审批UI） | 没有 | 部分有 | |
| 10 | **FileContext自动行数+二进制容忍**：AnyFileContent{String\|Binary}+new()自动算line_count+line_range定位——文件上下文的统一信封，Display输出"file (10-20)" | — | — | 可复用设计 | |
| 11 | **WaitForEvents=挂起等外部事件的动作结果**：watchdog超时或入站resume信号结束等待，Completed/Cancelled两态；用户取消时**不发tool-call结果上wire**（与RunAgents::Cancelled同规则） | 没有 | 没有 | 完全没有 | 与goose WaitForEvents同类（等外部事件再继续），Warp版是客户端watchdog形态 |
| 12 | **description()=结果的人类可读描述表**：30种结果各有description字符串，"内容超过LLM上下文窗口时显示错误信息用"——溢出降级时用户看到的不是原始错误 | — | — | 可复用设计 | 与kilocode Truncate服务"按能力分级提示"互补 |

## 源码亮点
- 全文件是"结果即状态机"的极致：每个动作结果枚举三基态(Success/Error/Cancelled)+领域特有第四态（Denylisted/SkippedByAutoApprove/Discarded/Snapshot），三个判定方法(is_successful/is_failed/is_cancelled)显式枚举每个变体的归类——**测试名即安全声明的类型版**。
- RunAgents结果含per-agent outcome（Launched{agent_id}/Failed{error}+resolved_model_id实录）——批量编排的逐子项审计。
- 注释质量：LrcActivity两段docstring解释"为什么终端网格不够"、triggers_server_subagent解释路由语义、Cancelled的wire形态说明。

## 可复用设计
1. LrcActivity采样器：Linux /proc/[pid]/stat CPU + /proc/[pid]/io write_bytes，固定频率（如2s）+进程树遍历，~100行Python可进OpenSoul limb/terminal层。
2. 结果枚举设计原则：三基态+领域第四态+每态对循环影响显式编码（is_cancelled排除跳过态）。
3. was_edited_by_user：文件写回前hash对比，20行。
