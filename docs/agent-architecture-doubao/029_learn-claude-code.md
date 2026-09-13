# 029 · shareAI-lab/learn-claude-code 源码调研报告

> 调研日期：2026-09-13 ｜ 调研方式：README 全文精读（含核心 agent_loop Python 源码与 17 章课程结构）

## 1. 项目概述与定位

- **项目名称**：Learn Claude Code —— Harness Engineering for Real Agents
- **GitHub**：https://github.com/shareAI-lab/learn-claude-code
- **Star 数**：约 76,661（rank 29）
- **主要语言**：Python（教学脚本，每章一个可独立运行的 `code.py`）
- **一句话定位**：从 0 手写一个类 Claude Code 的 nano agent harness，17 课逐次叠加一个 harness 机制，讲透"Agent 产品 = 模型 + 驾驭框架（harness）"。
- **核心主张**：**Agency（感知-推理-行动的能力）来自模型训练，而非外部编排代码**；工程师的工作是造"车"（harness），模型是"司机"。反对把 LLM 当文本补全节点、用 if-else/节点图堆砌出的"伪 Agent"。
- **目标用户/场景**：harness 工程师——想真正理解编码 Agent 内部机制、并自己实现一遍的开发者。
- **成熟度**：当前 17 课（s01–s17）为 canonical 版本，另有 legacy 12 课迁移轨、web 平台、tests；配套衍生 Kode-CLI / Kode-Agent-SDK / claw0。

## 2. 源码结构总览

```
learn-claude-code/
  s01_agent_loop/        # 每章一文件夹：README.md(英/中/日) + code.py(独立可运行) + images/
  s02_tool_use/  s03_permission/  s04_hooks/  s05_todo_write/
  s06_subagent/  s07_skill_loading/ s08_context_compact/ s09_memory/
  s10_task_system/ s11_background_tasks/ s12_cron_scheduler/ s13_agent_teams/
  s14_mcp_plugin/ s15_integrated_harness/ s16_workflow_runtime/ s17_goal_loop/
  agents/   # legacy 12 份可运行脚本 + s_full.py
  skills/   # s07 用的技能文件
  docs/ web/ tests/
```

- **核心源码文件**：每章 `code.py`；核心是 `s01_agent_loop/code.py` 中的 `agent_loop(messages)`。
- **入口**：`python s01_agent_loop/code.py`（从这开始）。
- **代码规模**：教学级极简，但每章代码自洽、可运行。

## 3. 系统架构分析

- **编排模式**：**ReAct 主循环**（源码直接给出）。核心即 `agent_loop`：反复调 `client.messages.create(..., tools=TOOLS)`，若响应含 `tool_use` block 就执行工具、把结果作为 `tool_result` 追加回 `messages` 并循环，直到模型返回纯文本为止——**模型决定何时调工具、何时停，代码只执行模型要求的动作**。

  核心源码（README 摘录）：
  ```python
  def agent_loop(messages):
      while True:
          response = client.messages.create(model=MODEL, system=SYSTEM,
                                           messages=messages, tools=TOOLS)
          messages.append({"role": "assistant", "content": response.content})
          tool_calls = [b for b in response.content if b.type == "tool_use"]
          if not tool_calls:
              return
          results = []
          for block in tool_calls:
              output = TOOL_HANDLERS[block.name](**block.input)
              results.append({"type": "tool_result", "tool_use_id": block.id, "content": output})
          messages.append({"role": "user", "content": results})
  ```

- **Harness = Tools + Knowledge + Observation + Action + Permissions**（README 公式）。
- **数据流**：`User → messages[] → LLM → response`；含 tool_use？→执行工具→追加结果→loop back；否则返回文本。
- **关键类/概念**：`TOOL_HANDLERS` 分发 map（s02）、`PermissionRule`（s03）、`PreToolUse/PostToolUse` hooks（s04）、`TodoItem`（s05）、`SkillLoader`（s07）、`tool_result_budget/snip_compact/compact_history`（s08）、`TaskRecord/blockedBy`（s10）、`Subagent fresh messages[]`（s06）。
- **架构图**：`messages[] ⇄ agent_loop(while True) ⇄ TOOL_HANDLERS{dispatch map}`，周围叠 permission/hooks/todo/subagent/skill/compact/memory/task/cron/teams/MCP。

## 4. 功能拆解（17 课机制，每课一个 motto）

- s01 主循环；s02 工具分发 map（加工具=加一个 handler，循环不动）；s03 权限（先设边界再放自由）；s04 hooks（绕着循环挂扩展点，不改主循环）；s05 TodoWrite（先列计划再执行，完成率翻倍）；s06 子 Agent（给子任务全新 `messages[]`，最终文本作一个工具结果返回）；s07 技能按需加载；s08 上下文压缩（先压 tool_result，再摘要历史）；s09 记忆（selection/extraction/consolidation 三子系统）；s10 文件持久化任务图（TaskRecord+blockedBy）；s11 后台任务（慢操作后台跑，完成时通知注入）；s12 cron 定时；s13 Agent 团队（持久队友、原子任务认领、task-bound worktree）；s14 MCP 插件接入外部工具池；s15 集成 harness；s16 工作流运行时（固定编排固化为代码+journal 可恢复）；s17 目标循环（独立评估器审查每次"是否该停"）。

## 5. 技术亮点与优势

1. **极简但完整的心智模型**：把 Claude Code 拆成"一个主循环 + 一组机制"，s01 只要 `while True + bash` 就能跑起来一个 Agent。
2. **机制正交叠加**：每章只加一个机制且不动主循环（hooks 哲学："hook around the loop, never rewrite the loop"），工程上极清晰。
3. **harness 思维纠偏**：明确"agency 是训练出来的，不是 if-else 堆出来的"，对行业"伪 Agent"乱象一针见血。
4. **教学闭环**：每章独立 code.py 可跑，s15 再把所有机制合成完整 runtime，s16/s17 收口到工作流与目标闭环。

## 6. 稳定性机制【重点】

- **错误处理/边界**：s03 权限系统 `PermissionRule` + 审批流水线——"决定什么能跑、什么必须停、什么需批准"，destructive 操作需人工 approval。
- **上下文恢复**：s08 上下文压缩——`tool_result_budget` 先砍工具结果、`snip_compact`/`micro_compact`、再 `compact_history`，保证长任务不爆上下文；s16 工作流用 **journal 可恢复**（resumable journals）。
- **并发/后台**：s11 后台线程跑慢操作，完成时经通知队列注入结果，主循环不阻塞。
- **边界处理**：子 Agent（s06）给全新 `messages[]` 做上下文隔离，最终文本作单个工具结果返回，避免污染主上下文。
- 这些都是教学实现（代码极简），非生产级，但设计范式正确。

## 7. 高可用机制【重点】

- **容错**：s04 hooks 在工具前后挂扩展点（`PreToolUse`/`PostToolUse`），可在不改主循环下插入重试、日志、审批。
- **并发调度**：s11 后台任务 + s12 cron 定时；s13 Agent 团队用 task-bound worktree 做并行编辑隔离（每个任务独立工作目录，避免并行写冲突）。
- **去中心化/协作**：s13 持久队友"原子任务认领"（atomic task claims）——多 Agent 竞争式领取 ready 任务，typed protocol 通信。
- **资源管理**：s08 上下文预算即一种资源管理；s14 MCP 把外部工具统一进一个 tool pool。

## 8. 自我进化机制【重点】

- **记忆管理**：s09 记忆三子系统——selection（记什么）、extraction（抽什么）、consolidation（巩固），"记住重要的、忘掉不重要的"。
- **反思/闭环**：s17 目标循环——**独立评估器**审查模型每次提议的"是否该停"，目标不可能/失败/超限时把控制权交还用户。这是"自我停止判断"的典范。
- **规划**：s05 TodoWrite 先列计划再执行，"没有计划的 Agent 会漂"。
- **持续学习**：README 强调"你在 harness 里跑的每段动作序列都是训练信号"（trajectory data），可用于微调下一代模型。

## 9. openmate 可借鉴点

- **P0｜一个稳定主循环 + 正交机制**：openmate 的 Agent 内核应严格遵循 s01 的 `while True + tool_use/tool_result` 循环，所有扩展（权限/钩子/子 Agent）都以"叠加机制"方式挂接，**绝不在主循环里写业务 if-else**——这是多端复用与长期可维护的根本。
- **P0｜独立目标评估器（s17）**：openmate 自动任务必须有一个"独立于模型自身的评估器"判断是否完成/是否该停，防止模型过早宣告成功或死循环——这是 autonomous agent 可靠性的关键。
- **P1｜子 Agent 用全新 messages + 单结果回传**：openmate 多 Agent 协作时，子任务应隔离上下文、只把最终结论作为一条结果返回，避免上下文爆炸（与 deer-flow 的 isolated/snapshot 模式呼应）。
- **P1｜上下文压缩优先级**：先砍 tool_result、再摘要历史（s08），openmate 长会话应按此优先级做 compaction。
- **P1｜task-bound worktree 并行隔离**：openmate 若做多 Agent 并行操作同一仓库，借鉴"每任务独立工作目录"避免写冲突。
- **P2｜trajectory 沉淀**：把每次 Agent 动作序列落盘，作为未来微调/自评估的数据资产。

## 10. 源码验证标注

- **源码直接引用（README 给出的真实代码）**：`agent_loop(messages)` 完整 Python 函数（tool_use/tool_result 协议）；s01–s17 每章代码文件名与核心符号（TOOL_HANDLERS、PermissionRule、TodoItem、SkillLoader、TaskRecord/blockedBy、tool_result_budget 等）。
- **文档/推断**：harness 公式、17 课 motto、课程结构、Kode/claw0 衍生项目均来自 README。
- **源码不可得**：未逐文件拉取各章 `code.py` 实际实现（本轮只读 README 摘录的 s01 代码）；其余章节实现细节为 README 目录级确认。
