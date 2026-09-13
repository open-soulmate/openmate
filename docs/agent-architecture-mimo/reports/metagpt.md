# FoundationAgents/MetaGPT — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/FoundationAgents/MetaGPT  
> 抓取通道: cdn.jsdelivr.net/gh/FoundationAgents/MetaGPT@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供多 Agent 角色系统 / 消息路由 / ReAct 模式 / 持久化 借鉴

---

## 0. 诚实性说明

- 成功拉取: `metagpt/roles/role.py`（完整 Role 类，约 600 行）
- 所有常量与代码行为源码实读

---

## 1. 系统架构

### 1.1 定位

MetaGPT 是多 Agent 协作框架，核心是 **Role（角色）** 抽象：每个 Role 有 actions（动作列表）、memory（记忆）、message buffer（消息缓冲），通过 **Environment** 进行消息广播与订阅。

### 1.2 源码布局

| 路径 | 职责 |
|------|------|
| `metagpt/roles/role.py` | Role 基类 |
| `metagpt/actions/` | Action 基类 + 具体动作 |
| `metagpt/memory/` | Memory |
| `metagpt/schema.py` | Message / MessageQueue / Task / TaskResult |
| `metagpt/strategy/planner.py` | Planner（plan_and_act 模式） |
| `metagpt/context_mixin.py` | ContextMixin |
| `metagpt/base/` | BaseRole / BaseEnvironment |
| `metagpt/provider/` | LLM Provider（含 HumanProvider） |

---

## 2. RoleContext — 运行时上下文（源码实读）

```python
class RoleContext(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    env: BaseEnvironment = Field(default=None, exclude=True)
    msg_buffer: MessageQueue = Field(default_factory=MessageQueue, exclude=True)
    memory: Memory = Field(default_factory=Memory)
    working_memory: Memory = Field(default_factory=Memory)
    state: int = Field(default=-1)  # -1 = 初始/终止状态
    todo: Action = Field(default=None, exclude=True)
    watch: set[str] = Field(default_factory=set)
    news: list[Type[Message]] = Field(default=[], exclude=True)
    react_mode: RoleReactMode = RoleReactMode.REACT
    max_react_loop: int = 1

    @property
    def important_memory(self) -> list[Message]:
        return self.memory.get_by_actions(self.watch)

    @property
    def history(self) -> list[Message]:
        return self.memory.get()
```

**关键设计**:
- `state: -1` 表示初始或终止状态
- `watch: set[str]` 订阅感兴趣的消息类型
- `max_react_loop: 1` 默认只循环一次
- `env` 被 exclude 避免循环引用

---

## 3. RoleReactMode — 三种反应模式（源码实读）

```python
class RoleReactMode(str, Enum):
    REACT = "react"
    BY_ORDER = "by_order"
    PLAN_AND_ACT = "plan_and_act"
```

| 模式 | 行为 |
|------|------|
| **REACT** | 标准 think-act 循环：_think → _act → _think → _act → ... |
| **BY_ORDER** | 按 actions 定义顺序依次执行 |
| **PLAN_AND_ACT** | 先 plan，再执行 action 序列 |

---

## 4. Role — 核心类（源码实读）

### 4.1 类声明

```python
class Role(BaseRole, SerializationMixin, ContextMixin, BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

    name: str = ""
    profile: str = ""
    goal: str = ""
    constraints: str = ""
    desc: str = ""
    is_human: bool = False
    enable_memory: bool = True
    role_id: str = ""
    states: list[str] = []
    actions: list[SerializeAsAny[Action]] = Field(default=[], validate_default=True)
    rc: RoleContext = Field(default_factory=RoleContext)
    addresses: set[str] = set()
    planner: Planner = Field(default_factory=Planner)
    recovered: bool = False
    latest_observed_msg: Optional[Message] = None
    observe_all_msg_from_buffer: bool = False
```

### 4.2 System Prompt 模板

```python
PREFIX_TEMPLATE = """You are a {profile}, named {name}, your goal is {goal}. """
CONSTRAINT_TEMPLATE = "the constraint is {constraints}. "

STATE_TEMPLATE = """Here are your conversation records...
Your previous stage: {previous_state}
Now choose one of the following stages you need to go to in the next step:
{states}
Just answer a number between 0-{n_states}...
If you think you have completed your goal...return -1.
"""
```

### 4.3 _get_prefix()

```python
def _get_prefix(self):
    if self.desc:
        return self.desc
    prefix = PREFIX_TEMPLATE.format(**{"profile": self.profile, "name": self.name, "goal": self.goal})
    if self.constraints:
        prefix += CONSTRAINT_TEMPLATE.format(**{"constraints": self.constraints})
    if self.rc.env and self.rc.env.desc:
        all_roles = self.rc.env.role_names()
        other_role_names = ", ".join([r for r in all_roles if r != self.name])
        env_desc = f"You are in {self.rc.env.desc} with roles({other_role_names})."
        prefix += env_desc
    return prefix
```

---

## 5. _think() — 决策阶段（源码实读）

```python
async def _think(self) -> bool:
    if len(self.actions) == 1:
        self._set_state(0)
        return True

    if self.recovered and self.rc.state >= 0:
        self._set_state(self.rc.state)
        self.recovered = False
        return True

    if self.rc.react_mode == RoleReactMode.BY_ORDER:
        if self.rc.max_react_loop != len(self.actions):
            self.rc.max_react_loop = len(self.actions)
        self._set_state(self.rc.state + 1)
        return self.rc.state >= 0 and self.rc.state < len(self.actions)

    # REACT 模式：用 LLM 选择下一个 action
    prompt = self._get_prefix()
    prompt += STATE_TEMPLATE.format(
        history=self.rc.history,
        states="\n".join(self.states),
        n_states=len(self.states) - 1,
        previous_state=self.rc.state,
    )
    next_state = await self.llm.aask(prompt)
    next_state = extract_state_value_from_output(next_state)

    if (not next_state.isdigit() and next_state != "-1") or int(next_state) not in range(-1, len(self.states)):
        logger.warning(f"Invalid answer of state, {next_state=}, will be set to -1")
        next_state = -1
    else:
        next_state = int(next_state)
        if next_state == -1:
            logger.info(f"End actions with {next_state=}")
    self._set_state(next_state)
    return True
```

**关键设计**:
- 单 action 时直接选 0
- 恢复时从 `recovered` 状态继续
- BY_ORDER 模式自动设置 `max_react_loop = len(actions)`
- REACT 模式用 LLM 选择，无效答案降级为 -1（终止）
- `-1` 表示终止

---

## 6. _act() — 执行阶段（源码实读）

```python
async def _act(self) -> Message:
    logger.info(f"{self._setting}: to do {self.rc.todo}({self.rc.todo.name})")
    response = await self.rc.todo.run(self.rc.history)
    if isinstance(response, (ActionOutput, ActionNode)):
        msg = AIMessage(
            content=response.content,
            instruct_content=response.instruct_content,
            cause_by=self.rc.todo,
            sent_from=self,
        )
    elif isinstance(response, Message):
        msg = response
    else:
        msg = AIMessage(content=response or "", cause_by=self.rc.todo, sent_from=self)
    self.rc.memory.add(msg)
    return msg
```

---

## 7. _observe() — 观察阶段（源码实读）

```python
async def _observe(self) -> int:
    news = []
    if self.recovered and self.latest_observed_msg:
        news = self.rc.memory.find_news(observed=[self.latest_observed_msg], k=10)
    if not news:
        news = self.rc.msg_buffer.pop_all()

    old_messages = [] if not self.enable_memory else self.rc.memory.get()
    self.rc.news = [
        n for n in news
        if (n.cause_by in self.rc.watch or self.name in n.send_to) and n not in old_messages
    ]

    if self.observe_all_msg_from_buffer:
        self.rc.memory.add_batch(news)
    else:
        self.rc.memory.add_batch(self.rc.news)

    self.latest_observed_msg = self.rc.news[-1] if self.rc.news else None
    return len(self.rc.news)
```

**消息过滤规则**: `cause_by in watch` OR `name in send_to`，且不在 old_messages 中。

---

## 8. 消息路由

### 8.1 publish_message()

```python
def publish_message(self, msg):
    if not msg:
        return
    if MESSAGE_ROUTE_TO_SELF in msg.send_to:
        msg.send_to.add(any_to_str(self))
        msg.send_to.remove(MESSAGE_ROUTE_TO_SELF)
    if not msg.sent_from or msg.sent_from == MESSAGE_ROUTE_TO_SELF:
        msg.sent_from = any_to_str(self)
    if all(to in {any_to_str(self), self.name} for to in msg.send_to):
        self.put_message(msg)  # 消息给自己
        return
    if not self.rc.env:
        return
    if isinstance(msg, AIMessage) and not msg.agent:
        msg.with_agent(self._setting)
    self.rc.env.publish_message(msg)
```

### 8.2 put_message()

```python
def put_message(self, message):
    if not message:
        return
    self.rc.msg_buffer.push(message)
```

### 8.3 地址系统

```python
def set_addresses(self, addresses: Set[str]):
    self.addresses = addresses
    if self.rc.env:
        self.rc.env.set_addresses(self, self.addresses)
```

---

## 9. _react() — ReAct 循环（源码实读）

```python
async def _react(self) -> Message:
    actions_taken = 0
    rsp = AIMessage(content="No actions taken yet", cause_by=Action)
    while actions_taken < self.rc.max_react_loop:
        has_todo = await self._think()
        if not has_todo:
            break
        rsp = await self._act()
        actions_taken += 1
    return rsp
```

---

## 10. _plan_and_act() — Plan-and-Act 模式（源码实读）

```python
async def _plan_and_act(self) -> Message:
    if not self.planner.plan.goal:
        goal = self.rc.memory.get()[-1].content
        await self.planner.update_plan(goal=goal)

    while self.planner.current_task:
        task = self.planner.current_task
        logger.info(f"ready to take on task {task}")
        task_result = await self._act_on_task(task)
        await self.planner.process_task_result(task_result)

    rsp = self.planner.get_useful_memories()[0]
    rsp.role = "assistant"
    rsp.sent_from = self._setting
    self.rc.memory.add(rsp)
    return rsp
```

### 10.1 _act_on_task() — 子类必须实现

```python
async def _act_on_task(self, current_task: Task) -> TaskResult:
    raise NotImplementedError
```

---

## 11. react() — 统一入口（源码实读）

```python
async def react(self) -> Message:
    if self.rc.react_mode == RoleReactMode.REACT or self.rc.react_mode == RoleReactMode.BY_ORDER:
        rsp = await self._react()
    elif self.rc.react_mode == RoleReactMode.PLAN_AND_ACT:
        rsp = await self._plan_and_act()
    else:
        raise ValueError(f"Unsupported react mode: {self.rc.react_mode}")
    self._set_state(state=-1)  # 重置状态
    if isinstance(rsp, AIMessage):
        rsp.with_agent(self._setting)
    return rsp
```

---

## 12. run() — 主入口（源码实读）

```python
@role_raise_decorator
async def run(self, with_message=None) -> Message | None:
    if with_message:
        msg = None
        if isinstance(with_message, str):
            msg = Message(content=with_message)
        elif isinstance(with_message, Message):
            msg = with_message
        elif isinstance(with_message, list):
            msg = Message(content="\n".join(with_message))
        if not msg.cause_by:
            msg.cause_by = UserRequirement
        self.put_message(msg)

    if not await self._observe():
        logger.debug(f"{self._setting}: no news. waiting.")
        return

    rsp = await self.react()
    self.set_todo(None)
    self.publish_message(rsp)
    return rsp
```

---

## 13. SDK 导出接口

```python
async def think(self) -> Action:
    """Export SDK API, used by AgentStore RPC."""
    await self._observe()
    await self._think()
    return self.rc.todo

async def act(self) -> ActionOutput:
    """Export SDK API, used by AgentStore RPC."""
    msg = await self._act()
    return ActionOutput(content=msg.content, instruct_content=msg.instruct_content)

@property
def action_description(self) -> str:
    """Export SDK API, used by AgentStore RPC and Agent."""
    if self.rc.todo:
        if self.rc.todo.desc:
            return self.rc.todo.desc
        return any_to_name(self.rc.todo)
    if self.actions:
        return any_to_name(self.actions[0])
    return ""
```

---

## 14. 恢复机制

```python
recovered: bool = False
latest_observed_msg: Optional[Message] = None

# 在 _observe() 中：
if self.recovered and self.latest_observed_msg:
    news = self.rc.memory.find_news(observed=[self.latest_observed_msg], k=10)

# 在 _think() 中：
if self.recovered and self.rc.state >= 0:
    self._set_state(self.rc.state)
    self.recovered = False  # 避免 max_react_loop 失效
    return True
```

**设计要点**: 恢复时从 `latest_observed_msg` 开始查找 k=10 条新消息，并从上次 state 继续。

---

## 15. 空闲检测

```python
@property
def is_idle(self) -> bool:
    """If true, all actions have been executed."""
    return not self.rc.news and not self.rc.todo and self.rc.msg_buffer.empty()
```

---

## 16. 超时 / 限制汇总

| 项 | 默认 | 来源 |
|----|------|------|
| `max_react_loop` | **1** | RoleContext |
| `state` | **-1**（初始/终止） | RoleContext |
| `react_mode` | **REACT** | RoleContext |
| `enable_memory` | **True** | Role |
| `observe_all_msg_from_buffer` | **False** | Role |
| `is_human` | **False** | Role |
| 恢复时查找消息数 | **k=10** | _observe() |
| BY_ORDER 时 max_react_loop | 自动设为 len(actions) | _think() |
| 无效 LLM 状态答案 | 降级为 -1 | _think() |

---

## 17. 失败路径

```
LLM 返回无效状态值
  → logger.warning + next_state = -1（终止）

_react() 中 _think() 返回 False
  → break 循环

_plan_and_act() 中无 planner.plan.goal
  → 从 memory 最新消息获取 goal

_act_on_task() 未实现
  → NotImplementedError

不支持的 react_mode
  → ValueError(f"Unsupported react mode: {mode}")

observe() 无新消息
  → return None（等待）

publish_message() 时无 env
  → 静默丢弃

消息只发给自己
  → put_message()（不经过 env）
```

---

## 18. 对 openmate 的可借鉴点

### P0 — Role 抽象
- 每个 Role 有 name / profile / goal / constraints / desc
- actions 列表 + memory + msg_buffer
- watch 订阅机制：只处理感兴趣的消息类型

### P0 — 三种 ReAct 模式
- REACT: LLM 动态选择 action
- BY_ORDER: 按顺序执行
- PLAN_AND_ACT: 先规划后执行
- `_set_state(-1)` 重置机制

### P0 — 消息路由
- publish_message: 广播到 env
- put_message: 放入私有 buffer
- MESSAGE_ROUTE_TO_SELF 特殊标记
- addresses 系统：按标签订阅

### P1 — 恢复机制
- recovered 标记 + latest_observed_msg
- 从上次 state 继续
- find_news(k=10) 查找恢复后的消息

### P1 — 空闲检测
- is_idle: 无 news + 无 todo + buffer 空
- 用于判断 Role 是否可以停止

### P2 — HumanProvider
- is_human=True 时使用 HumanProvider
- 人类作为 Role 参与协作

---

## 19. 源码锚点速查

```
metagpt/roles/role.py
  class RoleReactMode(str, Enum): REACT / BY_ORDER / PLAN_AND_ACT
  class RoleContext(BaseModel): state=-1, max_react_loop=1, watch, react_mode
  class Role(BaseRole, SerializationMixin, ContextMixin, BaseModel)
    name / profile / goal / constraints / desc / is_human
    actions / rc / addresses / planner
    recovered / latest_observed_msg / observe_all_msg_from_buffer
    PREFIX_TEMPLATE / CONSTRAINT_TEMPLATE / STATE_TEMPLATE
    _get_prefix(): profile+name+goal+constraints+env_desc
    _think(): 单action→0; 恢复→state; BY_ORDER→+1; REACT→LLM选择
    _act(): todo.run(history) → AIMessage → memory.add
    _observe(): msg_buffer.pop_all() → filter by watch/send_to → memory
    publish_message(): env 广播 or put_message
    put_message(): msg_buffer.push
    _react(): while actions_taken < max_react_loop: think→act
    _plan_and_act(): planner.update_plan → _act_on_task → process_task_result
    react(): REACT/BY_ORDER→_react; PLAN_AND_ACT→_plan_and_act
    run(): with_message → _observe → react → publish_message
    think() / act() / action_description: SDK 导出
    is_idle: no news + no todo + buffer empty
```

---

## 20. 参考链接

- https://github.com/FoundationAgents/MetaGPT
- https://docs.deepwisdom.ai/
