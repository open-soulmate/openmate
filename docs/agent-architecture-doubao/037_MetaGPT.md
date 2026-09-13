# MetaGPT 源码级调研报告（Rank 37）

> 调研对象：`FoundationAgents/MetaGPT`
> 报告日期：2026-09-13　｜　数据基线：GitHub `main` 分支（最近 push 2026-01-21）

---

## 1. 项目概述与定位

| 项 | 值 |
|---|---|
| 项目名 | MetaGPT |
| GitHub | https://github.com/FoundationAgents/MetaGPT |
| Star | 约 70.3k（API 实测 70,280；清单快照 70,342） |
| 主要语言 | Python |
| 许可证 | MIT |
| 一句话定位 | **首个把"软件公司"抽象为多 Agent 协作框架的 Multi-Agent 编排框架，目标是自然语言编程（Natural Language Programming）** |

**目标用户/场景**：想用一句话需求自动产出可运行软件（需求→设计→任务拆解→编码→测试）的开发者、研究多 Agent SOP 协作的团队。它把软件开发流程建模为一家"AI 软件公司"：ProductManager、Architect、TeamLeader、Engineer、DataAnalyst 等角色化 Agent 通过统一消息池协作。

**成熟度**：非常成熟。2023-06 创建，fork 约 8.9k，开放 issue 133，被 ACL 2024 接收为论文系统，是 Multi-Agent 领域最具影响力的开源框架之一（官方称 "First AI Software Company"）。维护仍活跃。

---

## 2. 源码结构总览

通过直接读取 `raw.githubusercontent.com/FoundationAgents/MetaGPT/main/...` 验证，核心包为 `metagpt/`。关键目录职责：

```
metagpt/
├── roles/            # 角色（Agent）基类与具体角色：role.py, react_role.py
├── team/team.py      # Team：雇佣角色、跑项目、预算控制（注：实际为 metagpt/team.py 顶层模块）
├── actions/          # 动作基类 Action、ActionNode（结构化输出协议）
├── schema.py         # Message/MessageQueue/Task/TaskResult/序列化混入（顶层单文件）
├── memory/           # Memory 短期记忆（storage + index）
├── provider/         # LLM 抽象：base_llm.py（重试/超时/成本/压缩）
├── environment/      # Environment / MGXEnv：消息路由与黑板
├── strategy/         # planner.py：Plan-and-Act 计划器
├── utils/            # cost_manager.py、exceptions.py、common.py(装饰器)
└── software_company.py  # CLI 入口（typer）：hire 角色 + invest + run
```

**核心源码文件清单（均已下载阅读，路径经 HTTP 200 校验）**：

- `metagpt/roles/role.py`（25KB，**Agent 主循环所在**）
- `metagpt/team.py`（团队编排、预算、序列化）
- `metagpt/memory/memory.py`（记忆）
- `metagpt/provider/base_llm.py`（40KB，LLM 重试/超时/成本/上下文压缩）
- `metagpt/software_company.py`（CLI 启动）
- `metagpt/actions/action.py`、`metagpt/actions/action_node.py`

**入口流程**：`software_company.py:startup()` → `generate_repo()` → `Team().hire([TeamLeader, ProductManager, Architect, Engineer2, DataAnalyst])` → `company.invest(investment)` → `asyncio.run(company.run(n_round, idea))`。

---

## 3. 系统架构分析

### 编排模式：Multi-Agent 协作 + 角色内 ReAct / Plan-and-Act（源码确认）

MetaGPT 是**双层编排**：

**外层（Team/Environment）**：黑板式消息总线。`Team`（`metagpt/team.py`）持有一个 `Environment`（默认 `use_mgx=True` 时用 `MGXEnv`）。所有角色通过 `publish_message` 把消息投入环境，环境按 `addresses`（订阅标签）路由到各角色私有缓冲 `msg_buffer`。

**内层（Role）**：每个 Role 自己跑 `observe→think→act` 循环。`Role.run()`（`roles/role.py:530`）：

```python
async def run(self, with_message=None):
    ...
    if not await self._observe():   # 从 msg_buffer 拉取并过滤感兴趣消息
        return                       # 无新消息则挂起等待
    rsp = await self.react()        # 进入 think/act
    self.publish_message(rsp)       # 把结果广播回环境
```

`react()`（role.py:512）按 `rc.react_mode` 分派三种模式（`RoleReactMode` 枚举，role.py:82）：
- `REACT`：`_react()`（role.py:454）——标准 ReAct，`while actions_taken < max_react_loop: _think(); _act()`；
- `BY_ORDER`：按动作列表顺序依次执行；
- `PLAN_AND_ACT`：`_plan_and_act()`（role.py:472）——先 `planner.update_plan(goal)`，再 `while current_task: _act_on_task(); planner.process_task_result()`，边执行边修正计划。

`_think()`（role.py:340）用 `STATE_TEMPLATE` 让 LLM 从若干 action 中选下一步（返回 0~n 的数字），并对非法回退做了兜底（role.py:371）。

### 核心组件与数据流

```
用户 idea
  → Team.run() 发布 Message(UserRequirement) 到 Environment
  → Environment 按 addresses 路由 → Role.put_message → 各 Role.rc.msg_buffer
  → Role._observe(): pop_all() → 按 watch(cause_by)/send_to 过滤 → 写入 Memory(去重)
  → Role.react() → _think(LLM 选 action) → _act(调用 todo.run(history))
  → 产出 AIMessage → Role.publish_message → Environment → 下一个角色 …
  → n_round 轮次耗尽 或 env.is_idle 或 预算超支(NoMoneyException) → env.archive()
```

关键类：`Role`（role.py:125）、`RoleContext`（role.py:92，封装 env/msg_buffer/memory/working_memory/state/todo/watch/react_mode/max_react_loop）、`Team`（team.py:32）、`Memory`（memory.py:20）、`BaseLLM`（base_llm.py:35）、`Planner`（strategy/planner.py）。

---

## 4. 功能拆解

- **角色定义系统**：`Role` 通过 `set_actions()`（role.py:239）挂载一组 `Action`，`_watch()`（role.py:284）声明关心哪些 `cause_by` 的消息。`_get_prefix()`（role.py:323）自动拼 "profile+name+goal+constraints+同环境其他角色名" 作为 system prompt。
- **消息路由**：`publish_message`（role.py:429）处理"发给自己"、路由标签 `MESSAGE_ROUTE_TO_SELF`、`with_agent()` 署名；路由逻辑下沉到 `Environment`（RFC113）。
- **结构化动作协议**：`Action`/`ActionNode`（action_node.py，33KB）负责把 LLM 输出约束为 JSON/Markdown 的结构化 `ActionOutput`，供下游角色消费。
- **工具/动作**：动作即"工具"，Engineer 角色的动作封装了写文件、跑代码等；没有独立的 MCP 工具注册表，工具能力通过 Action 子类内置。
- **CLI**：`software_company.py` 用 typer，支持 `investment/n_round/code_review/run_tests/inc(增量协作已有 repo)/recover_path(从序列化恢复)`。

---

## 5. 技术亮点与优势

1. **SOP 即代码**：把"需求→设计→任务→编码→测试"的人类公司 SOP 固化为角色+动作+消息路由，而非自由对话。源码上体现为 `RoleContext` 把状态机（state/todo）与消息缓冲（msg_buffer）解耦。
2. **三层记忆分离**：`memory`（长期、写入并建索引）、`working_memory`（给 planner 用）、`msg_buffer`（异步接收缓冲，exclude 出序列化）。见 `RoleContext` 字段（role.py:100-105）。
3. **预算硬约束**：`Team.invest()` → `cost_manager.max_budget`，每轮 `_check_balance()` 超支即 `raise NoMoneyException`（team.py:98-100），把"成本控制"提升为一等公民。
4. **断点续跑**：`Team.serialize()/deserialize()`（team.py:59-81）把整队状态写入 `storage/team/team.json`，`Role.recovered`/`latest_observed_msg`（role.py:155-156）支持从中断点恢复观察。
5. **差异化**：相比 AutoGen 的"对话即编排"，MetaGPT 强调**角色职责 + 固定 SOP + 结构化交付物**，产出更可控、更接近真实软件流水线。

---

## 6. 稳定性机制【重点】

- **LLM 调用重试**：`BaseLLM.acompletion_text()`（base_llm.py:249）用 tenacity：
  `@retry(stop=stop_after_attempt(3), wait=wait_random_exponential(min=1,max=60), retry=retry_if_exception_type(ConnectionError), retry_error_callback=log_and_reraise)`。即最多 3 次、指数退避 1~60s、仅对 `ConnectionError` 重试、失败后记录并重新抛出。**源码确认**。
- **超时控制**：`get_timeout()`（base_llm.py:329）`timeout or config.timeout or LLM_API_TIMEOUT`，三级回退兜底。
- **非法状态回退**：`_think()`（role.py:371）校验 LLM 返回的 stage 编号是否在 [-1, len(states))，非法则记 warning 并置 -1（终止），避免错误状态把角色带进死循环。
- **轮次上限**：`max_react_loop`（role.py:113, 461）硬限制单个角色一次反应内的 think-act 次数，防"无限思考"。Team 层用 `n_round` 限制总轮次（team.py:128）。
- **预算熔断**：`_check_balance()` 每轮在 `env.run()` 前执行，超预算抛 `NoMoneyException`（team.py:98）。
- **记忆去重**：`Memory.add()`（memory.py:31）`if message in self.storage: return`，保证同一条消息不会被重复消费。
- **异常包装**：`utils/exceptions.py:handle_exception` 装饰器（如 `Memory.get_by_position`，memory.py:109）；`role_raise_decorator` 包裹 `Role.run()`（role.py:529）统一异常语义。
- **崩溃恢复/检查点**：`Team.serialize()` 写 JSON，`deserialize()` 读回；`recovered` 标志 + `latest_observed_msg` 让恢复后从上次观察点继续（role.py:348, 403）。**源码确认**。
- **边界处理**：`_observe()` 对空缓冲、无感兴趣消息返回 0 并挂起（role.py:543）；`publish_message` 对空 msg 直接 return（role.py:431）。

---

## 7. 高可用机制【重点】

- **并发模型**：全异步（`asyncio`）。`Team.run()` 内 `await self.env.run()`，Environment 驱动各角色 `run()` 协程；角色间通过 `msg_buffer`（`MessageQueue`）做**异步解耦**——消息可异步追加，角色空闲挂起、有消息再唤醒（role.py 注释 RFC116 第 3 条）。
- **无单点/去中心化**：没有中心调度循环去"指挥"每个角色下一步；角色是自治的，只订阅自己关心的消息标签（`watch`/`addresses`）。Environment 只做路由，单个角色崩溃不直接拖垮整队。
- **降级/隔离**：`is_human=True` 时把 LLM 换成 `HumanProvider`（role.py:170），人工介入作为 LLM 的降级实现。`enable_memory=False`（role.py:136）允许原子/无状态角色关闭记忆以省资源。
- **资源管理（token）**：`compress_messages()`（base_llm.py:340）在发往上游前按 `TOKEN_MAX` 和 0.8 阈值做上下文压缩，支持 `POST_CUT`（保留最新）/`PRE_CUT`（保留最早）按 token 或按消息四种策略，system 消息永远保留，避免上下文溢出导致的失败。
- **成本/可观测**：`CostManager` 记录 prompt/completion token 与费用（base_llm.py:124 `_update_costs`），`logger.debug/info` 全程打角色名、state、动作。
- **局限（如实标注）**：横向扩展/分布式部署不是框架内建——它是单进程 asyncio 编排，无分布式锁、无消息队列中间件；横向扩展需外部封装。**推断**：官方另有 AgentStore RPC 导出（role.py:561 `think/act` 注释提及），但本报告未读其实现。

---

## 8. 自我进化机制【重点】

- **计划自修正（plan-and-act 反思）**：`_plan_and_act()`（role.py:472）每完成一个任务调用 `planner.process_task_result(task_result)`，根据执行结果更新/确认计划，直到 `current_task` 为空——这是一种"执行—回顾—改计划"的自反馈回路。
- **记忆检索式经验沉淀**：`Memory` 用 `index[cause_by]`（memory.py:34）按产生动作建倒排，`get_by_actions(watch)`（role.py:118 `important_memory`）让角色只把注意力放在关注动作的产出上，相当于"选择性记忆/遗忘"。
- **代码自审/自修复（角色层，文档+部分源码）**：`software_company.py` 默认 `code_review=True`，Engineer 动作体系内含 code review 与 SummarizeCode（`max_auto_summarize_code` 参数，software_company.py:94）。具体 prompt 与 reviewer 角色源码本次未逐行读取，标为**文档/部分推断**。
- **未发现**：在线权重学习、自动 A/B 评估基准、自动发现新工具的回路；MetaGPT 的"进化"是**符号式（改计划、写记忆、复盘）**而非参数式。这一点对 openmate 很关键。

---

## 9. openmate 可借鉴点【重点】

openmate 背景：Python AI Agent 应用，已有 Web 版，规划桌面/手机多端。

- **【P0】角色运行时与"消息缓冲/长期记忆/工作记忆"三段式分离**：直接借鉴 `RoleContext`（role.py:92）设计——把 `msg_buffer`（异步接收，不入库）、`memory`（持久+倒排索引）、`working_memory`（当前任务临时）分开。openmate 做多端时，消息缓冲可对应到"离线也能收、联网再处理"的队列，持久记忆对应同步到云端。收益：多端弱网/离线场景的一致性。
- **【P0】预算/轮次双重硬闸**：借鉴 `Team._check_balance()` + `max_react_loop` + `n_round`（team.py:98 / role.py:461）。openmate 面向 C 端多模型调用，必须有"单次任务最大步数"和"费用上限"两个闸，否则死循环烧钱。直接照抄 `NoMoneyException` 思路即可。
- **【P0】LLM 重试用 tenacity 三件套**：`stop_after_attempt(3)` + `wait_random_exponential(1,60)` + 仅对可重试异常重试 + 统一 `retry_error_callback`（base_llm.py:249）。openmate 的模型网关层应原样落地，并配 `get_timeout()` 三级回退。
- **【P1】序列化断点续跑**：借鉴 `Team.serialize/deserialize` + `recovered` 标志（team.py:59 / role.py:155）。桌面/手机端 App 易被系统杀进程，把"当前 task + 已观察到哪条消息"落盘，重启后从 `latest_observed_msg` 续跑，体验远好于从头再来。
- **【P1】上下文压缩策略**：借鉴 `compress_messages()`（base_llm.py:340）——system 永远保留、按 0.8 阈值、POST_CUT 优先保留最新。openmate 长会话对话也需要这类确定性压缩，而不是简单 truncate。
- **【P2】消息即黑板、按 cause_by 订阅**：角色/技能之间不要直接函数互调，统一走"发布消息→按标签订阅"，openmate 后续加技能/工具时可热插拔。

---

## 10. 源码验证标注

**源码直接阅读（raw.githubusercontent.com，HTTP 200 校验）**：
- `metagpt/roles/role.py` — Role 主循环、RoleContext、三种 react 模式、消息收发（第 1–593 行全文）
- `metagpt/team.py` — Team 编排、预算、序列化、run 循环（第 1–139 行全文）
- `metagpt/memory/memory.py` — Memory 存储/索引/去重（全文）
- `metagpt/provider/base_llm.py` — tenacity 重试、超时、成本、compress_messages（全文）
- `metagpt/software_company.py` — CLI 与角色雇佣清单（全文）

**文档/推断**：
- code review / SummarizeCode 的具体 prompt 与 reviewer 实现未逐行读（标推断）。
- AgentStore RPC 分布式部署能力来自源码注释（role.py:561），未读其服务端实现。
- 顶层目录树（除上述文件外）依据已读文件的 import 关系推断，未完整遍历仓库树。
- 星级/活跃度来自 GitHub API 元信息（2026-09 查询）。
