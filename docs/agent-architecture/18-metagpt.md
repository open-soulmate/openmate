# 18. MetaGPT 架构深度分析

> **项目**: [geekan/MetaGPT](https://github.com/geekan/MetaGPT) — 57.4k Stars
> **定位**: 多智能体协作框架，模拟软件公司 SOP（标准操作流程）
> **核心理念**: `Code = SOP(Team)` — 将 SOP 物化并应用于 LLM 组成的团队
> **源码版本**: main 分支 (2025)

---

## 1. 设计哲学：SOP 驱动的多智能体

MetaGPT 的核心设计哲学是将软件公司的标准操作流程（SOP）形式化，让 LLM 角色像真实团队一样协作。一行需求输入，产出用户故事、竞品分析、需求文档、数据结构、API 设计等完整软件交付物。

```python
# team.py - Team 类的核心定位
class Team(BaseModel):
    """
    Team: Possesses one or more roles (agents), SOP (Standard Operating Procedures),
    and a env for instant messaging, dedicated to env any multi-agent activity,
    such as collaboratively writing executable code.
    """
    env: Optional[Environment] = None
    investment: float = Field(default=10.0)
    idea: str = Field(default="")
    use_mgx: bool = Field(default=True)
```

团队拥有环境（`Environment`）、投资预算（`investment`）、以及可选的 MGX 增强模式。这体现了"软件公司"隐喻——有预算约束、有组织架构、有协作环境。

---

## 2. 角色系统（Role）：智能体的核心抽象

Role 是 MetaGPT 最核心的抽象，每个角色拥有独立的身份（profile）、目标（goal）、约束（constraints）、动作列表（actions）、记忆系统（memory）和运行时上下文（RoleContext）。

```python
# role.py - Role 类定义
class Role(BaseRole, SerializationMixin, ContextMixin, BaseModel):
    """Role/Agent"""
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
```

每个角色通过 `PREFIX_TEMPLATE` 构建 system prompt，将身份信息注入 LLM：

```python
# role.py - 角色前缀模板
PREFIX_TEMPLATE = """You are a {profile}, named {name}, your goal is {goal}. """
CONSTRAINT_TEMPLATE = "the constraint is {constraints}. "
```

角色还会感知所在环境和其他角色的存在：

```python
# role.py - _get_prefix 方法
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

这种设计让每个角色不仅知道自己是谁，还知道团队里有谁，实现了自感知的上下文构建。

---

## 3. 运行时上下文（RoleContext）：角色的状态容器

RoleContext 是角色运行时的核心状态容器，管理消息缓冲区、工作记忆、长期记忆、当前状态和待执行动作。

```python
# role.py - RoleContext 定义
class RoleContext(BaseModel):
    """Role Runtime Context"""
    env: BaseEnvironment = Field(default=None, exclude=True)
    msg_buffer: MessageQueue = Field(default_factory=MessageQueue, exclude=True)
    memory: Memory = Field(default_factory=Memory)
    working_memory: Memory = Field(default_factory=Memory)
    state: int = Field(default=-1)  # -1 indicates initial or termination state
    todo: Action = Field(default=None, exclude=True)
    watch: set[str] = Field(default_factory=set)
    news: list[Type[Message]] = Field(default=[], exclude=True)
    react_mode: RoleReactMode = RoleReactMode.REACT
    max_react_loop: int = 1

    @property
    def important_memory(self) -> list[Message]:
        """Retrieve information corresponding to the attention action."""
        return self.memory.get_by_actions(self.watch)

    @property
    def history(self) -> list[Message]:
        return self.memory.get()
```

三层记忆架构设计精巧：`msg_buffer` 是异步消息接收缓冲区，`memory` 是持久化的工作记忆，`working_memory` 是临时的执行记忆。`watch` 集合定义了角色关注的消息类型，实现了基于 `cause_by` 的消息过滤。

---

## 4. 三种反应模式（React Mode）：灵活的决策策略

MetaGPT 提供三种角色决策模式，适应不同的任务复杂度：

```python
# role.py - 反应模式枚举
class RoleReactMode(str, Enum):
    REACT = "react"           # 标准 ReAct 循环：think -> act -> think -> act
    BY_ORDER = "by_order"     # 按顺序执行：act(Action1) -> act(Action2)
    PLAN_AND_ACT = "plan_and_act"  # 先规划后执行：think(plan) -> act -> act
```

**REACT 模式**：经典 ReAct 范式，LLM 动态选择下一步动作：

```python
# role.py - _react 方法
async def _react(self) -> Message:
    actions_taken = 0
    rsp = AIMessage(content="No actions taken yet", cause_by=Action)
    while actions_taken < self.rc.max_react_loop:
        has_todo = await self._think()
        if not has_todo:
            break
        logger.debug(f"{self._setting}: {self.rc.state=}, will do {self.rc.todo}")
        rsp = await self._act()
        actions_taken += 1
    return rsp
```

**PLAN_AND_ACT 模式**：先用 Planner 生成任务计划，再逐步执行：

```python
# role.py - _plan_and_act 方法
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
    self.rc.memory.add(rsp)
    return rsp
```

---

## 5. 动作抽象（Action）：可组合的行为单元

Action 是角色执行的具体行为空间，基于 Pydantic BaseModel，支持 LLM 配置、指令模板和 ActionNode 语法树。

```python
# action.py - Action 类定义
class Action(SerializationMixin, ContextMixin, BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    name: str = ""
    i_context: Union[
        dict, CodingContext, CodeSummarizeContext, TestingContext,
        RunCodeContext, CodePlanAndChangeContext, str, None
    ] = ""
    prefix: str = ""  # aask*时会加上prefix，作为system_message
    desc: str = ""    # for skill manager
    node: ActionNode = Field(default=None, exclude=True)
    llm_name_or_type: Optional[str] = None
```

Action 支持通过 `instruction` 参数快速构建 ActionNode，实现声明式动作定义：

```python
# action.py - 指令初始化
@model_validator(mode="before")
@classmethod
def _init_with_instruction(cls, values):
    if "instruction" in values:
        name = values["name"]
        i = values.pop("instruction")
        values["node"] = ActionNode(key=name, expected_type=str, instruction=i, example="", schema="raw")
    return values
```

运行时，如果存在 `node`，Action 会将历史消息组装为上下文并调用 ActionNode 的 `fill` 方法：

```python
# action.py - 动作节点执行
async def _run_action_node(self, *args, **kwargs):
    """Run action node"""
    msgs = args[0]
    context = "## History Messages\n"
    context += "\n".join([f"{idx}: {i}" for idx, i in enumerate(reversed(msgs))])
    return await self.node.fill(req=context, llm=self.llm)

async def run(self, *args, **kwargs):
    """Run action"""
    if self.node:
        return await self._run_action_node(*args, **kwargs)
    raise NotImplementedError("The run method should be implemented in a subclass.")
```

---

## 6. 消息路由与通信：基于 Environment 的发布-订阅

MetaGPT 采用发布-订阅模式进行角色间通信。角色通过 `publish_message` 将消息广播到 Environment，其他角色通过 `_observe` 从消息缓冲区中筛选感兴趣的消息。

```python
# role.py - 消息发布
def publish_message(self, msg):
    """If the role belongs to env, then the role's messages will be broadcast to env"""
    if not msg:
        return
    if MESSAGE_ROUTE_TO_SELF in msg.send_to:
        msg.send_to.add(any_to_str(self))
        msg.send_to.remove(MESSAGE_ROUTE_TO_SELF)
    if not msg.sent_from or msg.sent_from == MESSAGE_ROUTE_TO_SELF:
        msg.sent_from = any_to_str(self)
    if all(to in {any_to_str(self), self.name} for to in msg.send_to):
        self.put_message(msg)
        return
    if not self.rc.env:
        return
    if isinstance(msg, AIMessage) and not msg.agent:
        msg.with_agent(self._setting)
    self.rc.env.publish_message(msg)
```

消息过滤基于 `cause_by` 标签匹配，角色通过 `_watch` 声明关注的消息类型：

```python
# role.py - 消息观察与过滤
async def _observe(self) -> int:
    """Prepare new messages for processing from the message buffer and other sources."""
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

---

## 7. 团队编排（Team）：环境驱动的协作循环

Team 是顶层编排器，负责组建团队、注入需求、驱动协作循环。核心 `run` 方法实现了"公司运营"循环：检查余额 → 运行环境 → 检查是否空闲。

```python
# team.py - 核心运行循环
@serialize_decorator
async def run(self, n_round=3, idea="", send_to="", auto_archive=True):
    """Run company until target round or no money"""
    if idea:
        self.run_project(idea=idea, send_to=send_to)
    while n_round > 0:
        if self.env.is_idle:
            logger.debug("All roles are idle.")
            break
        n_round -= 1
        self._check_balance()
        await self.env.run()
        logger.debug(f"max {n_round=} left.")
    self.env.archive(auto_archive)
    return self.env.history
```

投资机制确保了资源约束的真实性：

```python
# team.py - 投资与余额检查
def invest(self, investment: float):
    """Invest company. raise NoMoneyException when exceed max_budget."""
    self.investment = investment
    self.cost_manager.max_budget = investment

def _check_balance(self):
    if self.cost_manager.total_cost >= self.cost_manager.max_budget:
        raise NoMoneyException(self.cost_manager.total_cost,
                               f"Insufficient funds: {self.cost_manager.max_budget}")
```

团队通过 `hire` 方法招募角色，角色自动注册到 Environment：

```python
# team.py - 角色招募
def hire(self, roles: list[Role]):
    """Hire roles to cooperate"""
    self.env.add_roles(roles)
```

---

## 8. Think-Act 循环：LLM 驱动的状态机

`_think` 方法是角色的"大脑"，根据当前状态和历史记录，由 LLM 决定下一步应该执行哪个动作。

```python
# role.py - _think 方法
async def _think(self) -> bool:
    """Consider what to do and decide on the next course of action."""
    if len(self.actions) == 1:
        self._set_state(0)
        return True

    if self.rc.react_mode == RoleReactMode.BY_ORDER:
        if self.rc.max_react_loop != len(self.actions):
            self.rc.max_react_loop = len(self.actions)
        self._set_state(self.rc.state + 1)
        return self.rc.state >= 0 and self.rc.state < len(self.actions)

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
    self._set_state(next_state)
    return True
```

`_act` 方法执行具体动作并生成消息：

```python
# role.py - _act 方法
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

状态模板（STATE_TEMPLATE）指导 LLM 选择下一个状态：

```python
# role.py - 状态选择模板
STATE_TEMPLATE = """Here are your conversation records...
Please note that only the text between the first and second "===" is information about completing tasks...
Your previous stage: {previous_state}
Now choose one of the following stages you need to go to in the next step:
{states}
Just answer a number between 0-{n_states}..."""
```

---

## 9. 序列化与恢复：断点续跑能力

MetaGPT 实现了完整的序列化/反序列化机制，支持项目中断后恢复执行。

```python
# team.py - 序列化
def serialize(self, stg_path: Path = None):
    stg_path = SERDESER_PATH.joinpath("team") if stg_path is None else stg_path
    team_info_path = stg_path.joinpath("team.json")
    serialized_data = self.model_dump()
    serialized_data["context"] = self.env.context.serialize()
    write_json_file(team_info_path, serialized_data)

# team.py - 反序列化
@classmethod
def deserialize(cls, stg_path: Path, context: Context = None) -> "Team":
    team_info_path = stg_path.joinpath("team.json")
    team_info: dict = read_json_file(team_info_path)
    ctx = context or Context()
    ctx.deserialize(team_info.pop("context", None))
    team = Team(**team_info, context=ctx)
    return team
```

角色层面也有恢复机制，通过 `recovered` 标记和 `latest_observed_msg` 实现断点续跑：

```python
# role.py - 恢复状态处理
async def _observe(self) -> int:
    news = []
    if self.recovered and self.latest_observed_msg:
        news = self.rc.memory.find_news(observed=[self.latest_observed_msg], k=10)
    if not news:
        news = self.rc.msg_buffer.pop_all()
    # ...
```

---

## 10. 架构优势与设计模式总结

| 维度 | 设计选择 | 优势 |
|------|----------|------|
| **核心隐喻** | 软件公司 SOP | 直觉性强，易于理解角色职责 |
| **角色抽象** | Pydantic BaseModel + 多继承 | 类型安全、序列化友好、可扩展 |
| **决策模式** | React / ByOrder / PlanAndAct 三模式 | 从简单到复杂任务全覆盖 |
| **通信机制** | 发布-订阅 + cause_by 标签过滤 | 松耦合、可扩展、支持自路由 |
| **记忆系统** | 三层记忆（buffer / memory / working） | 区分短期接收、长期存储、临时工作 |
| **资源管理** | 投资预算 + NoMoneyException | 真实的 API 成本约束 |
| **可恢复性** | 全链路序列化 + 断点续跑 | 长任务不怕中断 |
| **动作系统** | Action + ActionNode 组合 | 声明式 + 命令式混合，灵活度高 |
| **环境抽象** | Environment / MGXEnv 双实现 | 支持传统模式和增强 MGX 模式 |
| **LLM 抽象** | 统一 LLM 接口 + provider 注册表 | 多模型无缝切换 |

MetaGPT 的架构精髓在于将"软件公司"这一隐喻落地为可执行的代码结构：Team 是公司，Role 是员工，Action 是工作职责，Environment 是办公环境，Message 是沟通方式，SOP 是流程规范。这种高度拟真的设计使得复杂软件开发任务可以被自然地分解和协作完成。

---

*最后更新: 2025-09*
