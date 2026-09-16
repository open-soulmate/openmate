# CowAgent 源码补验（第二轮）—— subagent工程细节 + memory summarizer全文

> 源码：raw.githubusercontent.com web_extract（agent/subagent/runner.py全文+templates.py全文+agent/memory/summarizer.py 34KB）
> 研究日期：2026-09-17 深夜轮7（cron）
> 前置：38-CowAgent-source.md（16项）——本轮补验上轮被Exa故障跳过的summarizer + 未读的subagent/目录

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|----------|------|----------|
| 1 | 🔴 **上下文裁剪触发式记忆flush+Deep Dream全文到手**：每次裁剪/溢出都flush被丢消息为daily记录（异步线程不阻塞回复+md5去重防重复写+剔除scheduler注入对防低价值日志），一次LLM调用双写（磁盘daily+context_summary_callback注入活会话做上下文衔接）；Deep Dream把daily+MEMORY.md蒸馏为[MEMORY]（50条上限，合并提炼/新增萃取/冲突更新/清理无效/删除冗余五步）+[DREAM]梦境日记；prompt带"只能基于提供的材料整理，严禁编造推测"防幻觉条款+中英双语 | agent/memory/summarizer.py（34KB全文） | 没有 | 部分（hippo有consolidation，无"裁剪即记忆"入口） | 部分有 | **P0**。nanobot Dream两方互证完成——"上下文丢弃=记忆固化触发点"是行业共识；prompt五步法+防编造条款整段可抄 |
| 2 | 🔴 **subagent运行器工程细节**（注释即规格书，可整文件抄）：①parent上下文只看到spawn调用+返回summary，中间步骤全丢；②**ContextVar深度计数**跨线程携带（copy_context），max_depth默认1上限5；③超时=显式cancelled结果（"区别于'没找到'和'从没跑'"）+pool.shutdown(wait=False)故意不join（join会让工具超预算）；④**工具浅拷贝per-run**（copy.copy防两个并发subagent互清cancel_event/互报progress——大坑注释化）；⑤budget对半（max_steps//2）；⑥继承父permission_mode/project_dir防"委派绕过权限" | agent/subagent/runner.py（全文） | 部分（delegate_task思路类似） | 没有 | 部分有 | **P0**。六个工程细节每个都是踩坑换来的，OpenSoul实现spawn子agent时逐条对照 |
| 3 | **subagent模板系统**：模板=角色非身份（system prompt+工具白名单，无记忆无channel）；BLOCKED_TOOLS全局否决名单（subagent/send/scheduler/env_config/evolution_undo——**防递归+防子agent冒名发消息+防篡改Agent本身**）；READ_ONLY_TOOLS八件套=explore类型；**skills只在全工具时继承**（窄工具集给skills="看到永远执行不了的指令，浪费turn后报告"）；用户markdown文件（frontmatter name/description/tools）放/subagents目录自定义，同名覆盖内置 | agent/subagent/templates.py（全文） | 没有 | 没有 | 完全没有 | P1。BLOCKED_TOOLS威胁模型（委派≠提权）直接抄；markdown模板=skills目录同构 |
| 4 | **subagent run账本**：create_run(run_id, parent_run_id=current_agent_run_id())挂parent+finish_run四态——**记账失败永不阻塞spawn**（try/except debug级）；identity_scope(run_id)让子agent写的state落到正确归属 | runner.py _open_run/_close_run | 没有 | trajectory无parent_id | 完全没有 | P1。与goose SubTask{parent_session}/ms-agent-fw occurrence lineage三方互证——parent_id是subagent系统的最低配置 |
| 5 | **实时状态双回调**：on_state(index,state)每个任务起止各报一次（含超时也报——"跟随者永远等不到的任务要有人替它收尾"）+on_event(index,event)转发子agent流事件（**父上下文只收summary，但观察者能看到过程**）——"不知道在干嘛"痛点在subagent维度的解法 | runner.py run_tasks docstring | 没有 | 没有 | 完全没有 | P1。与用户可观测性诉求直接对齐 |
| 6 | **per-user记忆目录**：memory/users/<user_id>/YYYY-MM-DD.md+MEMORY.md——多用户共享workspace时记忆隔离 | summarizer.py get_today_memory_file | 没有 | 部分（hippo有user维度） | 部分有 | P2 |

## 源码亮点
- runner.py/t_summarizer.py的**注释体裁**：每个非常规决策都写了"为什么"（为什么不join线程、为什么浅拷贝工具、为什么skills不跟窄工具集继承）——commit即规格书风格延续，47k★增长快的注释级原因。
- _notify契约："报告问题永远不能弄坏它描述的那次运行"（try/except吞回调异常）。
- flush的context_summary_callback：**一次LLM调用服务两个消费者**（磁盘持久化+上下文注入），省一半token。

## 可复用设计（Top-5）
1. **裁剪触发flush+Dream五步prompt**（#1）：OpenSoul hippo缺的入口+prompt全文现成。
2. **subagent六工程细节**（#2）：逐条对照实现，防超时join/防权限绕过/防工具状态串扰。
3. **BLOCKED_TOOLS威胁模型**（#3）：委派安全边界。
4. **parent_id run账本**（#4）：与goose互证，trajectory表加列。
5. **双回调可观测**（#5）：subagent过程可视。
