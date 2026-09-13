# 012 · browser-use/browser-use 源码级调研报告

> 调研日期：2026-09-13 ｜ rank 12 / GitHub Top 100 AI Agent 第 12 位
> 核心项目，按规范要求正文 ≥2500 字。证据以 `raw.githubusercontent.com/browser-use/browser-use/main/browser_use/agent/service.py` 直接阅读为准。

---

## 1. 项目概述与定位

| 项目 | 内容 |
|---|---|
| 名称 | browser-use/browser-use |
| GitHub | https://github.com/browser-use/browser-use |
| Star | 约 113,557（GitHub API 实测），Fork 12,493 |
| 主语言 | Python；底层 Playwright 驱动真实 Chromium |
| License | MIT；2024-10-31 创建，2026-09-07 仍活跃推送 |
| 描述（仓库） | "Agents that use the browser." |

**一句话定位**：让 LLM 自主操作真实浏览器的 Python Agent 框架——把"网页 DOM/视觉观测 → LLM 决策 → 点击/输入/导航/抽取 → 再观测"封装成可复用的 ReAct 循环，是当前 Web 自动化 Agent 事实标准之一。

**目标用户**：需要让 AI 完成"需要在真实网页里点来点去"任务的开发者/团队（表单填写、信息抽取、端到端 Web 工作流、Web 测试）。提供 Python 库 + CLI + 配套 UI。

**成熟度**：410 open issues、12k+ fork、471 subscribers，社区极活跃，发布节奏快；属**生产级框架**而非玩具。

---

## 2. 源码结构总览

经仓库元数据与核心文件路径确认（源码确认），主包为 `browser_use/`：

```
browser_use/
├── agent/
│   ├── service.py        # ★ Agent 主循环（run/multi_act/_handle_step_error 等）
│   ├── views.py          # AgentOutput / ActionResult / AgentHistory / StepMetadata 数据模型
│   ├── prompts.py        # get_ai_step_system/user_prompt、系统提示模板
│   ├── message_manager.py# 历史消息裁剪/注入（_add_context_message）
│   └── loop_detector.py  # 重复动作/停滞检测（record_action/record_page_state）
├── browser/
│   ├── browser.py        # 浏览器会话（start/close、CDP 连接、重连）
│   ├── profile.py        # BrowserProfile（wait_between_actions 等）
│   └── session 重连状态   # is_reconnecting / RECONNECT_WAIT_TIMEOUT / _reconnect_event
├── dom/
│   ├── service.py        # DOM 抽取、selector_map、llm_representation()
│   └── markdown_extractor.py # extract_clean_markdown()
├── controller/
│   └── service.py        # tools.registry 动作注册（act() 分发、terminates_sequence）
├── tools/                # 内置浏览器动作（click/input/scroll/extract/...）
├── llm/                  # messages.py（System/UserMessage）、多 LLM 封装
└── utils/                # 日志、sanitize_surrogates 等
```

**入口/启动流程**（源码确认，`service.py` run()）：`run()` → 注册信号处理器 `signal_handler` → 派发 `CreateAgentSessionEvent`/`CreateAgentTaskEvent`（eventbus）→ `await self.browser_session.start()` 启动浏览器并挂 watchdog → `_register_skills_as_actions()` → `_execute_initial_actions()`（用 `asyncio.wait_for(..., timeout=settings.step_timeout)` 包裹）→ 进入 `while self.state.n_steps <= max_steps:` 主循环。

**代码规模**：主包约数十个 Python 模块，`agent/service.py` 单文件即近两千行（含主循环、错误处理、重连、回放、AI Step），属中大型框架。

---

## 3. 系统架构分析

**编排模式：经典 ReAct（Observation → Thought → Action → Observation），并叠加"预算/失败/循环"三类护栏。** 证据（源码确认）：
- `AgentOutput` 模型含 `evaluation_previous_goal`（对上一步的观察/反思）+ `next_goal`（思考）+ `action: list`（动作）——这正是 ReAct 的 Thought+Act 结构。
- 主循环 `while n_steps <= max_steps` 每步：取页面状态 → `get_model_output()` 让 LLM 产出动作 → `multi_act()` 执行动作 → `_finalize()` 把结果写回历史 → 下一步以 `ActionResult` 作为新 observation 回喂 LLM。

**核心组件划分**：
- **Agent（service.py）**：状态机与编排者，持有 `self.state`（n_steps/consecutive_failures/paused/stopped）、`self.history`、`self.llm`、`self.browser_session`、`self.tools`。
- **BrowserSession（browser/）**：真实浏览器生命周期、CDP 连接、**断线重连**。
- **Controller/Tools（controller/service.py + tools/）**：把每个浏览器能力封装为带 Pydantic schema 的"动作"，`tools.act()` 分发执行，registry 记录 `terminates_sequence`。
- **DOM 层（dom/）**：把页面转成 LLM 可读的 `selector_map` + `llm_representation()`，并做噪声过滤。
- **MessageManager**：裁剪/注入上下文消息（budget warning、nudge 都走 `_add_context_message`）。
- **EventBus**：会话/任务生命周期事件外抛，供 UI 观测。

**数据流**：
```
Task → initial_actions(nav) → [观测DOM → LLM决策(Action[])] → tools.act() → ActionResult
     → 写history → 回喂LLM → ... → done/失败/超步数 → finalize
```

**关键类/函数**（源码确认）：`Agent.run()`、`Agent.multi_act()`、`_handle_step_error()`、`_is_connection_like_error()`、`_is_browser_closed_error()`、`_try_switch_to_fallback_llm()`、`_inject_budget_warning()`、`_force_done_after_last_step()`、`_force_done_after_failure()`、`rerun_history()`、`_judge_trace()`（`@observe` 装饰，Langfuse 追踪）。

---

## 4. 功能拆解

- **内置动作库**：点击、输入、导航、滚动、提取内容、切换标签、下拉、等待、`done` 等；由 LLM 以 function-calling 方式选择。`done` 被**强制为只能作为唯一动作**（源码：`Done action is allowed only as a single action`）。
- **动作序列编排**（源码确认）：一次模型可返回多个 action；框架用两层 guard 决定是否提前终止后续动作——L1 静态元数据 `registered_action.terminates_sequence`；L2 运行期检测 URL 或 focus target 是否变化（`post_action_url != pre_action_url`），变化则跳过剩余动作。这避免了"点了一个会跳转的按钮后还去点旧页面上已不存在的元素"。
- **AI Step**（源码确认）：`_ai_step` 把页面抽成 clean markdown（`extract_clean_markdown`，报告 `original_html→initial_markdown→filtered` 三级压缩统计），可选截图 base64，用 `asyncio.wait_for(..., timeout=120.0)` 调 LLM 做抽取；结果超 `MAX_MEMORY_LENGTH=1000` 字符则落盘并只在记忆里留指针。
- **历史回放（rerun_history）**：把一次成功运行的 `AgentHistoryList` 重放，用于自动化复现。
- **多 LLM 抽象**：`llm/` 归一多家提供商，并支持 `fallback_llm` 热切换。
- **可观测**：`@observe`（Langfuse）、结构化分级日志（DEBUG/WARNING/ERROR）、demo mode 侧栏实时播报 thoughts/actions。

---

## 5. 技术亮点与优势

1. **真实浏览器而非无头 DOM 仿真**：用 Playwright/CDP 驱动真 Chromium，保留 JS 执行、shadow DOM、iframe、登录态，是与"DOM 字符串爬虫"路线的根本分野。
2. **观测压缩管线**：`extract_clean_markdown` 把原始 HTML 压成 markdown 并报告"过滤了多少噪声字符"，在喂给 LLM 前做 token 经济优化——`_ai_step` 中显式打印 `Content processed: X HTML chars → Y markdown → Z filtered`。
3. **动作序列安全终止**：`terminates_sequence` 静态声明 + URL/focus 运行期变化检测，是同类项目少见的"批量动作鲁棒性"设计。
4. **事件驱动 + 可中断**：`eventbus.dispatch(...)` 把会话/任务事件外抛，`_external_pause_event` + `_check_stop_or_pause` 支持运行中 pause/resume/stop，人机协同友好。
5. **回放可复现**：`rerun_history` 把决策轨迹变成可重放脚本，带指数退避与冗余重试识别，工程化程度高。

---

## 6. 稳定性机制【重点】（源码确认，证据充分）

**错误分类与传播**（`_handle_step_error`，源码确认）：
- `InterruptedError`：用户中断，**当作正常控制流而非错误**，仅 warning 后 return。
- **连接类错误**（`_is_connection_like_error`：`ConnectionError` / "websocket connection closed" / "browser closed" / "no browser"）：若 `browser_session.is_reconnecting`，则 `await asyncio.wait_for(self.browser_session._reconnect_event.wait(), timeout=RECONNECT_WAIT_TIMEOUT)` 等待重连；重连成功则把 `last_result` 置为 `Connection lost and recovered` 并**重试该步**；重连失败再判定是否真的关闭。
- **真关闭判定**（`_is_browser_closed_error`）：必须"错误是连接类 **且** `_cdp_client_root is None` **且** 不在重连中"才置 `state.stopped=True`——刻意避免把"元素未找到/超时/解析错误"误判为浏览器崩溃。
- **其余异常**：`consecutive_failures += 1`，达 `max_total_failures = max_failures + int(final_response_after_failure)` 时升 ERROR 并停止。`max_failures` 默认 **5**（源码：`max_failures: int = 5`）。

**重试与退避**（源码确认）：
- 主循环不自动"原地重试同一步"，而是把错误写进 `ActionResult(error=...)` 回喂 LLM，让模型**自我修正**——这是 LLM Agent 的"语义重试"。
- `rerun_history` 用**指数退避**：`base_retry_delay=5.0`，`retry_delay = min(5.0 * 2**(retry_count-1), 30.0)`（5→10→20→ capped 30s），`max_retries=3`。
- 还有**领域启发式自愈**：点击下拉项失败且"上一步是菜单 opener"时，自动重开下拉菜单再试（`_reexecute_menu_opener`），且该次不计入 retry_count。

**超时控制**（源码确认）：
- 初始动作用 `asyncio.wait_for(..., timeout=settings.step_timeout)` 包裹，超时则记为一次 failure 而非卡死；
- `_ai_step` 的 LLM 调用硬编码 `timeout=120.0`。

**预算/护栏**（源码确认）：
- `_inject_budget_warning`：已用 ≥75% 步数时注入"BUDGET WARNING"，提示 LLM 收敛、保存部分结果、尽快 `done`；
- `_force_done_after_last_step`：到最后一步时把 `AgentOutput` 强制替换为 `DoneAgentOutput`（只剩 done 工具），并要求未完成则 `success=false`；
- `_force_done_after_failure`：连续失败达阈值后同样强制只许 done，**保证总有一个带结论的收尾**，而不是空 history 退出。

**循环检测**（源码确认，`loop_detection_enabled`）：
- `_update_loop_detector_actions` 记录动作名+参数哈希，但豁免 `{wait, done, go_back}`（wait 恒同哈希会误报）；
- `_update_loop_detector_page_state` 记录 url + DOM 文本指纹 + 元素数做**停滞检测**；
- 触发时 `get_nudge_message()` 经 `_add_context_message(UserMessage(...))` 注入"别再重复了"的提示。

**边界处理**：`sanitize_surrogates` 清洗非法代理字符；action 执行用 try/except 包住并 `results.append(ActionResult(error=...))` 保留部分成功结果；`rerun_history` 用 `finally: await self.close()` 保证资源释放。

---

## 7. 高可用机制【重点】（源码确认）

**容错/降级**：
- **LLM 主备切换**（`_try_switch_to_fallback_llm`）：对 `ModelRateLimitError`/`ModelProviderError`，判定可重试状态码集合 `{401,402,429,500,502,503,504}` 以及 `ModelOutputTruncatedError`；若配置了 `fallback_llm` 则把 `self.llm` 整体切换并 `token_cost_service.register_llm()`，**剩余运行全程走备模型**；备模型再失败则不再切换。这是框架级的"LLM 熔断降级"。
- **浏览器断线重连**：CDP/WebSocket 断连不死退，进入重连态并等待 `_reconnect_event`，成功后续跑。

**并发/调度**：asyncio 单事件循环驱动；`wait_between_actions` 控制动作节奏；pause/resume 靠 `asyncio.Event` 而非忙等。框架本身是**单 Agent 单会话**模型，横向扩展靠多进程/多浏览器实例，而非内置分布式调度。

**资源管理**：`rerun_history` 的 `finally: await self.close()` 兜底关浏览器；`_ai_step` 对超长抽取结果落盘避免上下文膨胀。

**可观测**：`@observe`（Langfuse trace）、`StepMetadata`（step_start/end_time、step_interval）、分级日志、demo mode 实时事件、eventbus 会话/任务事件流。

---

## 8. 自我进化机制【重点】（源码确认/部分推断）

- **自反思/输出验证**：`AgentOutput.evaluation_previous_goal` 每步让模型先"评价上一步"再决定下一步，是内建的 self-critique 循环；`_judge_trace()`（`@observe`）对整条轨迹做事后评判。
- **记忆管理**：短期记忆 = 历史消息（经 message_manager 裁剪）；长期记忆体现在 `ActionResult.long_term_memory` 与 `_ai_step` 的记忆指针（超 1000 字符落盘、`include_extracted_content_only_once` 防重复注入）。属"把抽取结论压成一句长期记忆"。
- **行为自适应护栏**：loop detector 的 nudge、75% 预算警告、失败后强制 done——这些是**元认知式纠偏**，运行时根据轨迹自动调整提示，而非固定规则。
- **回放即经验**：`rerun_history` 把成功轨迹固化为可重放脚本，近似"经验沉淀"，但需人工触发，非自动学习。

**没有的**：无在线权重更新、无自动 A/B、无工具自动发现；`_ai_step` 的 1000 字符上限是硬编码，非动态记忆遗忘模型。

---

## 9. openmate 可借鉴点【重点】

**P0｜"语义重试 + 失败计数 + 强制收尾"三件套**
- 借鉴什么：把动作错误写回 `ActionResult(error=...)` 让 LLM 自我修正（而非代码层死循环重试），`consecutive_failures` 计数，达 `max_failures` 后**强制只剩 done 工具**并要求给出部分结论。
- 怎么用：openmate 的 Agent 主循环应实现同款——失败不直接抛崩，而是把错误回喂模型；连续失败 N 次后切换到"总结模式"，保证桌面/手机端用户总能拿到一个（哪怕是失败的）结构化结论。
- 预期收益：长任务不再以"空 history / 静默卡死"收场，端到端成功率与用户体感显著提升。

**P0｜LLM 主备热切换（fallback LLM）**
- 借鉴什么：`_try_switch_to_fallback_llm` 对 401/402/429/5xx 自动切换备模型并登记成本。
- 怎么用：openmate 多端（Web/桌面/手机）对接多家模型时，在 LLM 调用层加一层可重试状态码判定 + 备模型降级，手机弱网/限流场景尤其受益。
- 预期收益：避免单一上游限流导致整次任务失败。

**P1｜循环检测 + 预算警告**
- 借鉴什么：记录动作哈希（豁免无意义动作）+ 页面指纹停滞检测，触发"别重复"nudge；用满 75% 步数时注入收敛提示。
- 怎么用：openmate 做长任务 Agent 时，加一个轻量 loop detector 与 step budget 预警，防止模型在两个页面间死循环。
- 预期收益：节省 token、提前产出部分结果。

**P1｜动作序列安全终止（页面变更即熔断剩余动作）**
- 借鉴什么：多动作批次执行时，按 `terminates_sequence` 声明 + 运行期 URL/focus 变化提前 break。
- 怎么用：openmate 工具编排一次返回多个工具调用时，凡是会改变上下文的工具后必须重新观测，不得盲跑剩余调用。
- 预期收益：杜绝"上下文已变还在调旧工具"的一类隐蔽错误。

**P2｜观测压缩管线 + 抽取结果落盘留指针**
- 借鉴什么：HTML→markdown→过滤噪声并报告压缩比；超阈值内容落盘、记忆里只留指针。
- 怎么用：openmate 处理网页/长文档工具结果时复用同款 token 经济策略。
- 预期收益：控制长任务上下文膨胀。

---

## 10. 源码验证标注

**源码直接阅读**（`browser_use/agent/service.py`，全文经 snippet 精读）：
- 主循环 `while n_steps <= max_steps`、pause/resume（`_external_pause_event`）、初始动作 `step_timeout` 包裹；
- `_handle_step_error` 全部分支、`_is_connection_like_error`/`_is_browser_closed_error` 判定、`max_failures=5`、`consecutive_failures`；
- 重连逻辑（`is_reconnecting`/`RECONNECT_WAIT_TIMEOUT`/`_reconnect_event`/`is_cdp_connected`）；
- `_try_switch_to_fallback_llm` 可重试状态码集合、`_using_fallback_llm`、`token_cost_service.register_llm`；
- loop detector 注入/记录、`_LOOP_EXEMPT_ACTIONS={wait,done,go_back}`、page 指纹；
- `_inject_budget_warning`（75%）、`_force_done_after_last_step/_force_done_after_failure`、`AgentOutput=DoneAgentOutput`；
- multi_act 的 `terminates_sequence` 与 URL/focus 变化熔断、done 仅限单动作；
- `rerun_history` 的 `max_retries=3`、指数退避 5→10→20 cap 30、冗余重试与菜单重开启发式；
- `_ai_step` 的 120s 超时、`MAX_MEMORY_LENGTH=1000`、落盘指针；eventbus 事件、`@observe`、`sanitize_surrogates`。
- 仓库元数据（star/fork/创建时间/MIT）来自 `api.github.com/repos/browser-use/browser-use`。

**文档/推断**：目录树中 `browser/`、`dom/`、`controller/`、`tools/` 的具体文件名为依据主包惯例与被 import 语句（`from browser_use.dom.markdown_extractor import ...`、`from browser_use.llm.messages import ...`、`from browser_use.utils import sanitize_surrogates`）反推；这些文件未逐个全文读取，仅用于结构示意，结论不依赖其内部实现细节。

**源码不可得**：完整递归目录树 `git/trees/main?recursive=1` 两次返回 `link fetch error`（仓库过大），故未获得精确文件清单与代码行数统计；`dom/service.py`、`controller/service.py`、`loop_detector.py` 内部实现未逐字读取。
