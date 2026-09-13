# Browser Use

## 概述

Browser Use 是一个浏览器自动化Agent框架。

**仓库**: https://github.com/browser-use/browser-use | **语言**: Python

## 核心架构

> **项目**: [browser-use/browser-use](https://github.com/browser-use/browser-use)  
> **定位**: AI 浏览器自动化 Agent 框架，MIT 许可，86k+ Stars  
> **核心理念**: 让 AI 像人类一样操控浏览器——理解页面结构、规划操作序列、执行交互动作

Browser-Use 采用**三层分离架构**：Agent 层（LLM 决策）→ Tools/Controller 层（动作注册与执行）→ BrowserSession 层（CDP 浏览器控制）。事件总线（EventBus）贯穿全栈，所有浏览器操作以事件驱动方式执行。以下是 10 个核心维度的深度分析。

def _setup_action_models(self) -> None:
    """Setup dynamic action models from tools registry"""
    # 根据注册的 action 动态创建 ActionModel
    self.ActionModel = self.tools.registry.create_action_model()
    
    # 根据模式选择输出结构
    if self.settings.flash_mode:
        self.AgentOutput = AgentOutput.type_with_custom_actions_flash_mode(self.ActionModel)
    elif self.settings.use_thinking:
        self.AgentOutput = AgentOutput.type_with_custom_actions(self.ActionModel)
    else:
        self.AgentOutput = AgentOutput.type_with_custom_actions_no_thinking(self.ActionModel)

    # 用于 max_steps 强制结束时的精简输出
    self.DoneActionModel = self.tools.registry.create_action_model(include_actions=['done'])
[详见源码]python

[详见源码]

| 维度 | 设计选择 | 权衡 |
|------|---------|------|
| **输出约束** | Pydantic 动态模型 + Union 类型 | 类型安全 vs 灵活性 |
| **浏览器控制** | CDP 直连（非 Playwright） | 性能 vs 易用性 |
| **事件系统** | EventBus 解耦 | 可扩展性 vs 复杂度 |
| **循环检测** | 软检测（nudge 不 block） | 安全性 vs 自主性 |
| **消息压缩** | LLM 驱动摘要 | 上下文保真 vs 窗口效率 |
| **安全模型** | allowed_domains + 敏感数据隔离 | 安全性 vs 易用性 |
| **多模型适配** | 模型检测 + 自动配置 | 通用性 vs 优化空间 |
| **云端支持** | BrowserSession 双模（local/cloud） | 统一 API vs 底层差异 |

Browser-Use 的架构精髓在于：**将浏览器自动化从 DOM 选择器层面提升到语义理解层面**。Agent 不依赖固定的 CSS 选择器，而是通过 LLM 理解页面语义，动态规划操作序列。这使得它能处理 CAPTCHA、动态页面、登录流程等传统自动化工具难以应对的场景。

## 关键技术

1. **真实浏览器而非无头 DOM 仿真**：用 Playwright/CDP 驱动真 Chromium，保留 JS 执行、shadow DOM、iframe、登录态，是与"DOM 字符串爬虫"路线的根本分野。
2. **观测压缩管线**：`extract_clean_markdown` 把原始 HTML 压成 markdown 并报告"过滤了多少噪声字符"，在喂给 LLM 前做 token 经济优化——`_ai_step` 中显式打印 `Content processed: X HTML chars → Y markdown → Z filtered`。
3. **动作序列安全终止**：`terminates_sequence` 静态声明 + URL/focus 运行期变化检测，是同类项目少见的"批量动作鲁棒性"设计。
4. **事件驱动 + 可中断**：`eventbus.dispatch(...)` 把会话/任务事件外抛，`_external_pause_event` + `_check_stop_or_pause` 支持运行中 pause/resume/stop，人机协同友好。
5. **回放可复现**：`rerun_history` 把决策轨迹变成可重放脚本，带指数退避与冗余重试识别，工程化程度高。

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
- `_force_done_after_last_step`：到最后一步时把 `AgentOutp

## 对openmate的启示

1. **Page-change guards in multi-action execution** — static `terminates_sequence` + runtime URL/focus diff. Avoids stale-DOM cascade failures.
2. **Loop detector with graded nudges (5/8/12)** — soft prompt injection before hard abort.
3. **Fallback LLM with sticky switch** and explicit retryable status-code set.
4. **Always-capture screenshots** even when `use_vision=False` (for cloud sync/debug) — cheap now.
5. **Compaction settings as dataclass** with chars_per_token heuristic, not opaque "context full" logic.
6. **Reconnect event bus** separate from step failure counting.
7. **Template mat

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（08-browser-use.md）
- 豆包（012_browser-use.md）
- MiMo报告（browser-use.md）
