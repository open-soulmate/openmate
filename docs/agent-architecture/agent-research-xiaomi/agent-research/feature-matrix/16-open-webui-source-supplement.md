# open-webui 源码补验（第二轮）—— tool_approval/subagents/context_compaction函数级精读

> 源码：~/agent-research-src/open-webui/backend/open_webui/utils/（chat_fork.py 41行+tool_approval.py 186行+subagents.py 702行+context_compaction.py 459行全文）
> 研究日期：2026-09-17 深夜轮7（cron）
> 前置：16-open-webui-source.md（20项，router级）——本轮把其中#1/#3/#4/#2四项从"目录级确认"升级为"源码级"

## 功能清单（源码级增量）

| # | 功能 | 源码细节 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | **chat fork源码确认**（升级自16号报告#1）：build_fork_history仅41行——从source_message_id沿parentId回溯成branch（环检测raise），reverse重放deepcopy重建线性链（childrenIds单子化），fork不复制无关分支 | utils/chat_fork.py全文 | 没有 | 没有 | 完全没有 | P0确认。41行即完整实现，抄 |
| 2 | 🔴 **tool approval三态回填源码**（升级自#3）：resolve_tool_call_output——approve→status=queued（入执行队列）；reject→追加function_call_output{status:'rejected',output:'Error: tool call rejected by user.'}（**拒绝也是工具结果**，loop不断）；answer仅限ask_user工具（否则400）→payload{status:'answered'/'cancelled'+timed_out}。幂等防重（已resolved或状态不在pending/queued/requires_approval→409）；**paused判定**：output中还有无对应result的function_call即paused。resume payload重建：chat.params+message.meta.params合并、tool_approval_mode跨恢复保留、files/tool_ids/skill_ids/terminal_id/session_id全量重注入 | utils/tool_approval.py全文 | 部分（审批modal） | 没有 | 完全没有 | **P0**。三个可抄点：①拒绝=合成错误工具结果（vs丢弃调用）②超时也是answer的一种（timed_out→cancelled payload）③resume payload字段清单=OpenSoul暂停恢复的schema参照 |
| 3 | 🔴 **subagent=完整chat**（升级自#4）：delegate()为子任务insert_new_chat（title='Sub-agent: {task[:60]}'），internal_meta={internal,type:'subagent',parent_chat_id,parent_message_id,delegation_id,mode}——**子agent在数据模型上就是一个chat**，天然可在UI里点开看全过程；前台Semaphore(max_concurrent=20)vs后台_active set(max_async=20)双限流；max_iterations=30+max_output=30k双预算；**file_ids子集白名单**（父文件中只给子集，找不到显式报错）；background时剥离tool_servers+pyodide下剥code_interpreter（不支持的能力显式降级）；direct连接禁用subagent | utils/subagents.py（702行，读至448行） | 部分 | 没有 | 部分有 | **P0**。"子agent=chat"数据模型让子任务可回看/可审计——比内存态subagent优雅；internal_meta linkage可直接抄 |
| 4 | **context compaction边界算法**（升级自#2）：_find_compaction_boundary按retention_percentage切分→前段交给DEFAULT_CONTEXT_COMPACTION_PROMPT摘要→context_compaction事件三态（compacted/failed）全程发事件；compact_chat_branch按分支压缩 | utils/context_compaction.py（459行） | 没有 | 部分 | 部分有 | P0确认。事件化压缩过程（用户能看到"压缩了什么"）补OpenSoul可观测 |

## 源码亮点
- tool_approval.py的权限检查：chat.user_id != user.id and role != admin → 401——**审批权=会话所有者或admin**，一行完成。
- subagents的capacity报错带自助指引（"Wait for one to finish or increase subagents.max_async"）——错误消息即文档。
- fork的环检测raise而非静默截断——数据损坏宁可失败不可猜。

## 可复用设计（Top-3）
1. **拒绝=合成错误工具结果**（#2）：agent loop不需要特判分支。
2. **子agent=chat+internal_meta**（#3）：OpenSoul会话表加internal/type/parent三字段即得可审计subagent。
3. **resume payload字段清单**（#2）：HITL恢复的完整schema。
