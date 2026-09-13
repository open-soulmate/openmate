# Browser-Use 深度架构分析

> **项目**: [browser-use/browser-use](https://github.com/browser-use/browser-use)  
> **定位**: AI 浏览器自动化 Agent 框架，MIT 许可，86k+ Stars  
> **核心理念**: 让 AI 像人类一样操控浏览器——理解页面结构、规划操作序列、执行交互动作

## 架构总览

Browser-Use 采用**三层分离架构**：Agent 层（LLM 决策）→ Tools/Controller 层（动作注册与执行）→ BrowserSession 层（CDP 浏览器控制）。事件总线（EventBus）贯穿全栈，所有浏览器操作以事件驱动方式执行。以下是 10 个核心维度的深度分析。

---

## 1. Agent 核心循环（Step-Loop）

Agent 的执行是一个经典的**感知-思考-行动**循环。每个 step 由三个阶段组成：准备上下文、获取 LLM 输出、执行动作。

```python
# agent/service.py - Agent.step()
@observe(name='agent.step', ignore_output=True, ignore_input=True)
@time_execution_async('--step')
async def step(self, step_info: AgentStepInfo | None = None) -> None:
    """Execute one step of the task"""
    self.step_start_time = time.time()
    browser_state_summary = None
    try:
        # Phase 0: CAPTCHA 等待
        if self.browser_session:
            captcha_wait = await self.browser_session.wait_if_captcha_solving()
            if captcha_wait and captcha_wait.waited:
                self.step_start_time = time.time()

        # Phase 1: 准备上下文（浏览器状态 + 消息构建）
        browser_state_summary = await self._prepare_context(step_info)
        self.state.last_model_output = None
        self.state.last_result = None

        # Phase 2: LLM 推理 + 动作执行
        await self._get_next_action(browser_state_summary)
        await self._execute_actions()

        # Phase 3: 后处理（下载追踪、循环检测、日志）
        await self._post_process()

    except Exception as e:
        await self._handle_step_error(e)
    finally:
        await self._finalize(browser_state_summary)
```

关键设计：每个 step 的超时由 `step_timeout=180` 控制，LLM 调用有独立的 `llm_timeout`（根据模型自动配置，如 Gemini 75s、Claude 90s）。CAPTCHA 解算时间不计入 step 耗时。

---

## 2. LLM 交互与结构化输出

Agent 使用 Pydantic 模型约束 LLM 输出格式，确保每次返回都是可解析的结构化动作。支持三种输出模式：标准模式（含 thinking）、无 thinking 模式、flash 模式。

```python
# agent/service.py - _setup_action_models()
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
```

AgentOutput 包含 `current_state`（thinking、evaluation_previous_goal、memory、next_goal）和 `action`（动作列表），LLM 每步最多输出 `max_actions_per_step=5` 个动作。结构化输出通过 `output_model_schema` 参数支持自定义 Pydantic 模型。

---

## 3. 动作注册系统（Registry）

Browser-Use 的动作系统采用**装饰器注册 + 动态 Pydantic 模型生成**模式。每个 action 通过 `@registry.action()` 注册，框架自动从函数签名生成参数模型。

```python
# tools/registry/service.py - Registry.action()
def action(self, description: str, param_model: type[BaseModel] | None = None,
           domains: list[str] | None = None, terminates_sequence: bool = False):
    """Decorator for registering actions"""
    def decorator(func: Callable):
        if func.__name__ in self.exclude_actions:
            return func
        # 自动规范化函数签名，分离特殊参数和动作参数
        normalized_func, actual_param_model = self._normalize_action_function_signature(
            func, description, param_model
        )
        action = RegisteredAction(
            name=func.__name_,
            description=description,
            function=normalized_func,
            param_model=actual_param_model,
            domains=final_domains,
            terminates_sequence=terminates_sequence,
        )
        self.registry.actions[func.__name__] = action
        return normalized_func
    return decorator
```

特殊参数（如 `browser_session`、`page_extraction_llm`、`file_system`）由框架自动注入，action 函数只需声明即可使用。`domains` 参数支持按 URL 域名过滤可用动作，实现页面级动作隔离。

---

## 4. 工具服务层（Tools Service）

Tools 类是动作执行的中枢，注册了所有内置浏览器操作：导航、点击、输入、滚动、截图、提取等。每个动作返回 `ActionResult`。

```python
# tools/service.py - Tools 类初始化中的内置动作注册
class Tools(Generic[Context]):
    def __init__(self, exclude_actions=None, output_model=None, display_files_in_done_text=True):
        self.registry = Registry[Context](exclude_actions or [])
        self._output_model = output_model
        self._coordinate_clicking_enabled = False
        
        self._register_done_action(output_model)
        
        # 基本导航动作
        @self.registry.action('', param_model=SearchAction, terminates_sequence=True)
        async def search(params: SearchAction, browser_session: BrowserSession):
            encoded_query = urllib.parse.quote_plus(params.query)
            search_engines = {
                'duckduckgo': f'https://duckduckgo.com/?q={encoded_query}',
                'google': f'https://www.google.com/search?q={encoded_query}&udm=14',
                'bing': f'https://www.bing.com/search?q={encoded_query}',
            }
            # ... 导航到搜索引擎
```

坐标点击功能需要模型支持（Claude Sonnet 4、Gemini 3 Pro 等），Tools 会自动检测模型能力：

```python
# agent/service.py - 模型能力检测
model_name = getattr(llm, 'model', '').lower()
supports_coordinate_clicking = any(
    pattern in model_name
    for pattern in ['claude-sonnet-4', 'claude-opus-4', 'claude-fable-5', 'gemini-3-pro', 'browser-use/']
)
if supports_coordinate_clicking:
    self.tools.set_coordinate_clicking(True)
```

---

## 5. 浏览器会话管理（BrowserSession）

BrowserSession 是浏览器控制的核心抽象，基于 Pydantic BaseModel，支持本地浏览器和云端浏览器两种模式。采用**事件驱动架构**，所有 CDP 操作通过 EventBus 分发。

```python
# browser/session.py - BrowserSession 核心结构
class BrowserSession(BaseModel):
    """Event-driven browser session with backwards compatibility.
    This class provides a 2-layer architecture:
    - High-level event handling for agents/tools
    - Direct CDP/Playwright calls for browser operations
    """
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        validate_assignment=True,
        extra='forbid',
        revalidate_instances='never',
    )
    
    # 支持云端和本地两种初始化方式
    def __init__(self, *, 
                 cdp_url: str | None = None,
                 browser_profile: BrowserProfile | None = None,
                 cloud_profile_id: UUID | str | None = None,
                 use_cloud: bool | None = None,
                 headless: bool | None = None,
                 executable_path: str | Path | None = None,
                 ...):
```

CDP 通信通过 `CDPSession` 管理，每个 target（页面/iframe/worker）有独立的 CDP 会话：

```python
# browser/session.py - Target 与 CDPSession
class Target(BaseModel):
    """Browser target (page, iframe, worker)"""
    target_id: TargetID
    target_type: str  # 'page', 'iframe', 'worker'
    url: str = 'about:blank'
    title: str = 'Unknown title'

class CDPSession(BaseModel):
    """CDP communication channel to a target"""
    cdp_client: CDPClient
    target_id: TargetID
    session_id: SessionID
```

---

## 6. 消息管理与上下文压缩（MessageManager）

MessageManager 负责构建发送给 LLM 的消息序列，包括系统提示、浏览器状态、历史动作和结果。支持**消息压缩**机制防止上下文窗口溢出。

```python
# agent/views.py - MessageCompactionSettings
class MessageCompactionSettings(BaseModel):
    """Summarizes older history into a compact memory block to reduce prompt size."""
    enabled: bool = True
    compact_every_n_steps: int = 25
    trigger_char_count: int | None = None  # ~10k tokens
    trigger_token_count: int | None = None
    chars_per_token: float = 4.0
    keep_last_items: int = 6
    summary_max_chars: int = 6000
    compaction_llm: BaseChatModel | None = None
```

上下文准备流程精心设计，注入多种辅助信息：

```python
# agent/service.py - _prepare_context()
async def _prepare_context(self, step_info=None) -> BrowserStateSummary:
    browser_state_summary = await self.browser_session.get_browser_state_summary(
        include_screenshot=True,  # 始终截图，即使 use_vision=False
        include_recent_events=self.include_recent_events,
    )
    
    # 按页面 URL 过滤可用动作
    await self._update_action_models_for_page(browser_state_summary.url)
    page_filtered_actions = self.tools.registry.get_prompt_description(browser_state_summary.url)
    
    # 构建状态消息
    self._message_manager.create_state_messages(
        browser_state_summary=browser_state_summary,
        model_output=self.state.last_model_output,
        result=self.state.last_result,
        use_vision=self.settings.use_vision,
        page_filtered_actions=page_filtered_actions,
        sensitive_data=self.sensitive_data,
        plan_description=plan_description,
    )
    
    # 注入各种提示（预算警告、重规划、循环检测）
    await self._inject_budget_warning(step_info)
    self._inject_replan_nudge()
    self._inject_loop_detection_nudge()
```

---

## 7. 系统提示工程（SystemPrompt）

系统提示根据模型类型和运行模式动态选择模板，支持 8+ 种变体。模板以 Markdown 文件存储，通过 `importlib.resources` 加载。

```python
# agent/prompts.py - SystemPrompt 模板选择
class SystemPrompt:
    def _load_prompt_template(self) -> None:
        if self.is_browser_use_model:
            if self.flash_mode:
                template_filename = 'system_prompt_browser_use_flash.md'
            elif self.use_thinking:
                template_filename = 'system_prompt_browser_use.md'
            else:
                template_filename = 'system_prompt_browser_use_no_thinking.md'
        elif self.is_anthropic_4_5 and self.flash_mode:
            template_filename = 'system_prompt_anthropic_flash.md'
        elif self.flash_mode and self.is_anthropic:
            template_filename = 'system_prompt_flash_anthropic.md'
        elif self.flash_mode:
            template_filename = 'system_prompt_flash.md'
        elif self.use_thinking:
            template_filename = 'system_prompt.md'
        else:
            template_filename = 'system_prompt_no_thinking.md'
```

浏览器状态描述包含丰富的页面统计信息：

```python
# agent/prompts.py - 页面统计提取
def _extract_page_statistics(self) -> dict[str, int]:
    stats = {
        'links': 0, 'iframes': 0,
        'shadow_open': 0, 'shadow_closed': 0,
        'scroll_containers': 0, 'images': 0,
        'interactive_elements': 0, 'total_elements': 0,
        'text_chars': 0,
    }
    # 遍历 SimplifiedNode 树统计各类元素
    def traverse_node(node: SimplifiedNode) -> None:
        original = node.original_node
        if original.node_type == NodeType.ELEMENT_NODE:
            tag = original.tag_name.lower()
            if tag == 'a': stats['links'] += 1
            elif tag in ('iframe', 'frame'): stats['iframes'] += 1
            if node.is_interactive: stats['interactive_elements'] += 1
            if node.is_shadow_host: stats['shadow_open' if ... else 'shadow_closed'] += 1
```

---

## 8. 循环检测与规划系统

Browser-Use 内置了**行为循环检测器**（ActionLoopDetector）和**规划系统**，防止 Agent 陷入无效重复。

```python
# agent/views.py - ActionLoopDetector
class ActionLoopDetector(BaseModel):
    """Tracks action repetition and page stagnation to detect behavioral loops."""
    window_size: int = 20
    recent_action_hashes: list[str] = Field(default_factory=list)
    recent_page_fingerprints: list[PageFingerprint] = Field(default_factory=list)
    max_repetition_count: int = 0
    consecutive_stagnant_pages: int = 0

    def get_nudge_message(self) -> str | None:
        """Return an escalating awareness nudge based on repetition severity."""
        if self.max_repetition_count >= 12:
            return f'Heads up: you have repeated a similar action {self.max_repetition_count} times...'
        elif self.max_repetition_count >= 8:
            return f'Heads up: you have repeated a similar action {self.max_repetition_count} times...'
        elif self.max_repetition_count >= 5:
            return f'Heads up: you have repeated a similar action {self.max_repetition_count} times...'
        
        if self.consecutive_stagnant_pages >= 5:
            return 'The page content has not changed across 5 consecutive actions...'
        return None
```

动作哈希归一化确保相似操作被正确识别为重复：

```python
# agent/views.py - 动作归一化
def _normalize_action_for_hash(action_name: str, params: dict[str, Any]) -> str:
    if action_name == 'search':
        tokens = sorted(set(re.sub(r'[^\w\s]', ' ', query.lower()).split()))
        return f'search|{engine}|{"|".join(tokens)}'
    if action_name in ('click', 'input'):
        return f'click|{params.get("index")}'
    if action_name == 'navigate':
        return f'navigate|{params.get("url", "")}'
```

规划系统支持 `enable_planning=True`，在连续失败时触发重规划（`planning_replan_on_stall=3`），在长时间无计划时提示制定计划（`planning_exploration_limit=5`）。

---

## 9. 安全机制

Browser-Use 在多个层面实现了安全防护，特别是敏感数据处理和域名隔离。

```python
# agent/service.py - 敏感数据安全检查
if self.sensitive_data:
    has_domain_specific_credentials = any(isinstance(v, dict) for v in self.sensitive_data.values())
    
    if not self.browser_profile.allowed_domains:
        self.logger.warning(
            '⚠️ Agent(sensitive_data=••••••••) was provided but Browser(allowed_domains=[...]) is not locked down! ⚠️\n'
            '          ☠️ If the agent visits a malicious website and encounters a prompt-injection attack, '
            'your sensitive_data may be exposed!'
        )
    elif has_domain_specific_credentials:
        # 验证域名模式是否被 allowed_domains 覆盖
        for domain_pattern in domain_patterns:
            for allowed_domain in self.browser_profile.allowed_domains:
                if pattern_domain.endswith('.' + allowed_domain_part[2:]):
                    is_allowed = True
                    break
```

动作超时保护防止 CDP 操作挂起：

```python
# tools/service.py - 全局动作超时
_ACTION_TIMEOUT_FALLBACK_S = 180.0

def _parse_env_action_timeout(raw: str | None) -> float:
    """Parse BROWSER_USE_ACTION_TIMEOUT_S defensively.
    Accepts only finite positive values."""
    parsed = float(raw)
    if not math.isfinite(parsed) or parsed <= 0:
        return _ACTION_TIMEOUT_FALLBACK_S
    return parsed
```

敏感数据替换支持 TOTP 2FA 验证码自动注入：

```python
# tools/registry/service.py - 2FA 自动注入
if placeholder_name.endswith('bu_2fa_code'):
    totp = pyotp.TOTP(applicable_secrets[placeholder_name], digits=6)
    replacement_value = totp.now()
```

---

## 10. 事件驱动架构与弹性设计

Browser-Use 的事件系统基于 `bubus` 库的 `EventBus`，所有浏览器操作（导航、点击、标签切换）都以事件形式分发和处理。

```python
# browser/session.py - ResilientEventBus
class ResilientEventBus(EventBus):
    """EventBus whose step()/wait_until_idle() no-op on a torn-down bus instead of asserting."""
    async def step(self, event=None, timeout=None, wait_for_timeout=0.1):
        if self._on_idle is None or self.event_queue is None:
            return None
        return await super().step(event, timeout, wait_for_timeout)

    async def wait_until_idle(self, timeout=None):
        if self._on_idle is None or self.event_queue is None:
            return None
        return await super().wait_until_idle(timeout)
```

新标签页自动检测与切换：

```python
# tools/service.py - 自动检测新标签
async def _detect_new_tab_opened(browser_session, tabs_before) -> str:
    await asyncio.sleep(0.05)  # 等待 CDP Target.attachedToTarget 事件传播
    tabs_after = await browser_session.get_tabs()
    new_tabs = [t for t in tabs_after if t.target_id not in tabs_before]
    if new_tabs:
        new_tab = new_tabs[0]
        # 自动切换到新标签
        switch_event = browser_session.event_bus.dispatch(
            SwitchTabEvent(target_id=new_tab.target_id)
        )
        await switch_event
        return f'. Automatically switched to new tab (tab_id: {new_tab.target_id[-4:]}).'
```

Agent 支持暂停/恢复、外部中断、follow-up 任务续接等弹性能力：

```python
# agent/service.py - 暂停/停止检查
async def _check_stop_or_pause(self) -> None:
    if self.register_should_stop_callback:
        if await self.register_should_stop_callback():
            self.state.stopped = True
            raise InterruptedError
    if self.state.stopped:
        raise InterruptedError
    if self.state.paused:
        raise InterruptedError
```

---

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│                      User Task                          │
│                  "Find stars of repo"                   │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    Agent (service.py)                    │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ SystemPrompt│ │MessageManager│ │ ActionLoopDetector│ │
│  │  (prompts)  │ │  (messages)  │ │   (views.py)     │ │
│  └─────────────┘ └──────────────┘ └──────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐│
│  │         step() → _prepare_context()                 ││
│  │              → _get_next_action() (LLM)             ││
│  │              → _execute_actions() → multi_act()     ││
│  │              → _post_process()                      ││
│  └─────────────────────────────────────────────────────┘│
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Tools / Registry (tools/)                   │
│  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │   Registry   │  │  Built-in Actions:              │  │
│  │  @action()   │  │  search, click, input, scroll,  │  │
│  │  decorator   │  │  navigate, extract, done, ...   │  │
│  └──────────────┘  └─────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Domain filtering │ Sensitive data replacement       ││
│  │  TOTP 2FA injection │ Coordinate conversion          ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────┬──────────────────────────────────┘
                       │ EventBus dispatch
┌──────────────────────▼──────────────────────────────────┐
│           BrowserSession (browser/session.py)            │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ SessionManager│  │ CDPClient    │  │ BrowserProfile│ │
│  │ (targets)     │  │ (cdp_use)    │  │ (config)      │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Local Browser ←→ Cloud Browser (use_cloud=True)     ││
│  │  DOM Watchdog │ Captcha Watchdog │ Demo Mode         ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## 关键设计决策总结

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
