# 03. CrewAI 架构深度分析

> 基于 crewAIInc/crewAI 源码（2025年最新版本），10维度深度剖析
> GitHub: https://github.com/crewAIInc/crewAI | Stars: 58,000+ | License: MIT

---

## 1. 整体架构概览

CrewAI 是一个**角色扮演式多Agent协作框架**，核心设计理念是将AI Agent组织成"船员"(Crew)来协作完成复杂任务。架构分为两大范式：

- **Crews（自主协作）**：基于角色的Agent团队，优化自主性和协作智能
- **Flows（事件驱动控制）**：事件驱动的工作流，提供精确的流程控制

源码目录结构（`lib/crewai/src/crewai/`）：

```
crewai/
├── agent/          # Agent核心实现
├── agents/         # Agent构建器、缓存、执行器
├── crews/          # Crew输出等辅助类
├── flow/           # Flow框架（DSL、运行时、定义）
├── tasks/          # Task子类（条件任务等）
├── tools/          # 工具系统（BaseTool、AgentTools）
├── memory/         # 统一记忆系统
├── knowledge/      # 知识源和知识存储
├── events/         # 事件总线和监听器
├── llms/           # LLM提供者适配层
├── mcp/            # MCP协议集成
├── a2a/            # A2A协议集成
├── security/       # 安全配置和指纹
├── state/          # 检查点和运行时状态
├── crew.py         # Crew核心类（2490行）
├── task.py         # Task核心类（1566行）
├── process.py      # 流程枚举
└── llm.py          # LLM封装
```

---

## 2. Agent 设计 — 抽象基类与角色系统

### 2.1 BaseAgent（抽象基类）

所有Agent的根基类，使用 Pydantic BaseModel + ABC 多重继承：

```python
class BaseAgent(BaseModel, ABC, metaclass=AgentMeta):
    """Abstract Base Class for all third party agents compatible with CrewAI."""

    entity_type: Literal["agent"] = "agent"

    id: UUID4 = Field(default_factory=uuid.uuid4, frozen=True)
    role: str = Field(description="Role of the agent")
    goal: str = Field(description="Objective of the agent")
    backstory: str = Field(description="Backstory of the agent")
    cache: bool = Field(default=True)
    verbose: bool = Field(default=False)
    max_rpm: int | None = Field(default=None)
    allow_delegation: bool = Field(default=False)
    tools: list[BaseTool] | None = Field(default_factory=list)
    max_iter: int = Field(default=25)
    llm: Annotated[str | BaseLLM | None, BeforeValidator(_validate_llm_ref)] = Field(default=None)
    memory: bool | Memory | MemoryScope | MemorySlice | None = Field(default=None)
    skills: list[Path | Skill | str] | None = Field(default=None)
    mcps: list[str | MCPServerConfig] | None = Field(default=None)
    knowledge: Knowledge | None = Field(default=None)
```

**设计要点**：
- Agent 的 `role`、`goal`、`backstory` 三个字段构成"角色扮演"核心，LLM 会基于这些字段生成系统提示词
- `max_iter=25` 默认限制Agent最多执行25次迭代，防止无限循环
- `allow_delegation` 控制Agent是否可以将任务委派给其他Agent
- LLM 引用支持多种验证方式（字符串模型名、BaseLLM 实例、字典配置）

### 2.2 抽象方法定义

```python
@abstractmethod
def execute_task(self, task: Any, context: str | None = None, tools: list[BaseTool] | None = None) -> str:
    pass

@abstractmethod
def create_agent_executor(self, tools: list[BaseTool] | None = None) -> None:
    pass

@abstractmethod
def get_delegation_tools(self, agents: Sequence[BaseAgent]) -> list[BaseTool]:
    pass

@abstractmethod
def get_platform_tools(self, apps: list[PlatformAppOrAction]) -> list[BaseTool]:
    pass
```

这种设计允许第三方Agent实现（如LangChain Agent）无缝接入CrewAI生态。

### 2.3 LLM类型注册表

```python
_LLM_TYPE_REGISTRY: dict[str, str] = {
    "base": "crewai.llms.base_llm.BaseLLM",
    "litellm": "crewai.llm.LLM",
    "openai": "crewai.llms.providers.openai.completion.OpenAICompletion",
    "anthropic": "crewai.llms.providers.anthropic.completion.AnthropicCompletion",
    "azure": "crewai.llms.providers.azure.completion.AzureCompletion",
    "bedrock": "crewai.llms.providers.bedrock.completion.BedrockCompletion",
    "gemini": "crewai.llms.providers.gemini.completion.GeminiCompletion",
}
```

通过注册表模式实现LLM的可插拔，支持序列化/反序列化时的动态导入。

---

## 3. Task 设计 — 任务定义与执行模型

### 3.1 核心字段

```python
class Task(BaseModel):
    description: str = Field(description="Description of the actual task.")
    expected_output: str = Field(description="Clear definition of expected output for the task.")
    agent: Annotated[BaseAgent | None, BeforeValidator(_resolve_agent)] = Field(default=None)
    context: list[Task] | None | _NotSpecified = Field(default=NOT_SPECIFIED)
    async_execution: bool | None = Field(default=False)
    output_json: type[BaseModel] | None = Field(default=None)
    output_pydantic: type[BaseModel] | None = Field(default=None)
    response_model: type[BaseModel] | None = Field(default=None)
    tools: list[BaseTool] | None = Field(default_factory=list)
    human_input: bool | None = Field(default=False)
    guardrail: GuardrailType | None = Field(default=None)
    guardrails: GuardrailsType | None = Field(default=None)
    guardrail_max_retries: int = Field(default=3)
```

**设计要点**：
- `description` + `expected_output` 构成任务的"双描述"模式，前者说明做什么，后者说明期望什么
- `context` 字段允许任务声明对其他任务输出的依赖，形成DAG（有向无环图）
- `output_pydantic` / `output_json` 支持结构化输出，通过Pydantic模型验证
- `guardrail` 系统支持函数式和LLM描述式两种验证方式

### 3.2 Guardrail验证系统

```python
@field_validator("guardrail")
@classmethod
def validate_guardrail_function(cls, v):
    if v is not None and callable(v):
        sig = inspect.signature(v)
        positional_args = [p for p in sig.parameters.values() if p.default is inspect.Parameter.empty]
        if len(positional_args) != 1:
            raise ValueError("Guardrail function must accept exactly one parameter")
        return_annotation = sig.return_annotation
        if return_annotation != inspect.Signature.empty:
            return_annotation_args = get_args(return_annotation)
            if not (get_origin(return_annotation) is tuple and len(return_annotation_args) == 2
                    and return_annotation_args[0] is bool):
                raise ValueError("If return type is annotated, it must be Tuple[bool, Any]")
    return v
```

Guardrail 在任务执行后验证输出，签名必须为 `(TaskOutput) -> Tuple[bool, Any]`，第一个元素表示是否通过，第二个是修正后的输出。

---

## 4. Crew 设计 — 团队编排核心

### 4.1 Crew类定义

```python
class Crew(FlowTrackable, BaseModel):
    tasks: list[Task] = Field(default_factory=list)
    agents: Annotated[list[BaseAgent], BeforeValidator(_resolve_agents)] = Field(default_factory=list)
    process: Process = Field(default=Process.sequential)
    memory: bool | Memory | MemoryScope | MemorySlice | None = Field(default=False)
    manager_llm: str | BaseLLM | None = Field(default=None)
    manager_agent: BaseAgent | None = Field(default=None)
    planning: bool | None = Field(default=False)
    stream: bool = Field(default=False)
    max_rpm: int | None = Field(default=None)
    cache: bool = Field(default=False)
    knowledge_sources: list[BaseKnowledgeSource] | None = Field(default=None)
    skills: list[Path | Skill | str] | None = Field(default=None)
    checkpoint: CheckpointConfig | bool | None = Field(default=None)
    tracing: bool | None = Field(default=None)
```

### 4.2 执行流程（kickoff）

```python
def kickoff(self, inputs=None, input_files=None, from_checkpoint=None) -> CrewOutput:
    inputs = prepare_kickoff(self, inputs, input_files)

    if self.process == Process.sequential:
        result = self._run_sequential_process()
    elif self.process == Process.hierarchical:
        result = self._run_hierarchical_process()
    else:
        raise NotImplementedError(f"The process '{self.process}' is not implemented yet.")

    for after_callback in self.after_kickoff_callbacks:
        result = after_callback(result)

    self.usage_metrics = self.calculate_usage_metrics()
    return result
```

**三种执行模式**：
- **sequential**：任务按顺序依次执行，前一个任务的输出可作为后一个的上下文
- **hierarchical**：由manager_agent（经理Agent）动态分配任务给下属Agent
- **consensual**（TODO）：计划中的共识模式

### 4.3 检查点与恢复

```python
@classmethod
def from_checkpoint(cls, config: CheckpointConfig) -> Crew:
    state = RuntimeState.from_checkpoint(config, context={"from_checkpoint": True})
    crewai_event_bus.set_runtime_state(state)
    for entity in state.root:
        if isinstance(entity, cls):
            entity._restore_runtime()
            return entity

@classmethod
def fork(cls, config: CheckpointConfig, branch: str | None = None) -> Crew:
    crew = cls.from_checkpoint(config)
    state.fork(branch)
    return crew
```

支持从检查点恢复执行和分支（fork），这对长时间运行的Agent工作流至关重要。

---

## 5. Process 枚举 — 流程控制模式

```python
class Process(str, Enum):
    sequential = "sequential"
    hierarchical = "hierarchical"
    # TODO: consensual = 'consensual'
```

极简设计，使用 `str, Enum` 双继承确保可序列化。`hierarchical` 模式需要 `manager_llm` 或 `manager_agent`：

```python
@model_validator(mode="after")
def check_manager_llm(self) -> Self:
    if self.process == Process.hierarchical:
        if not self.manager_llm and not self.manager_agent:
            raise PydanticCustomError("missing_manager_llm_or_manager_agent",
                "Attribute `manager_llm` or `manager_agent` is required when using hierarchical process.")
```

---

## 6. 工具系统 — BaseTool 与工具注册

### 6.1 BaseTool 设计

```python
class BaseTool(BaseModel, ABC):
    name: str = Field(description="The unique name of the tool")
    description: str = Field(description="Used to tell the model how/when/why to use the tool.")
    args_schema: type[PydanticBaseModel] = Field(default=_ArgsSchemaPlaceholder)
    result_schema: type[PydanticBaseModel] | None = Field(default=None)
    cache_function: SerializableCallable = Field(default=_default_cache_function)
    result_as_answer: bool = Field(default=False)
    max_usage_count: int | None = Field(default=None)
    tool_failure_policy: ToolFailurePolicy | None = Field(default=None)
    current_usage_count: int = Field(default=0)
```

**工具类型注册表**（支持检查点反序列化）：

```python
_TOOL_TYPE_REGISTRY: dict[str, type] = {}

def __init_subclass__(cls, **kwargs):
    super().__init_subclass__(**kwargs)
    key = f"{cls.__module__}.{cls.__qualname__}"
    _TOOL_TYPE_REGISTRY[key] = cls
```

**Pydantic自定义Schema**：

```python
@classmethod
def __get_pydantic_core_schema__(cls, source_type, handler):
    default_schema = handler(source_type)
    if cls is not _BASE_TOOL_CLS:
        return default_schema
    def _validate_tool(value, nxt):
        if isinstance(value, _BASE_TOOL_CLS):
            return value
        if isinstance(value, dict) and "tool_type" in value:
            return _resolve_tool_dict(value)
        return nxt(value)
    return core_schema.no_info_wrap_validator_function(_validate_tool, default_schema, ...)
```

### 6.2 工具故障策略

```python
class ToolFailurePolicy(str, Enum):
    IGNORE = "ignore"   # 静默忽略
    WARN = "warn"       # 记录并发出事件
    RAISE = "raise"     # 终止执行
```

三级故障策略从Agent → Task → Tool逐层继承，最细粒度的配置优先。

---

## 7. 输出转换系统 — Converter

```python
class Converter(OutputConverter):
    def to_pydantic(self, current_attempt=1) -> BaseModel:
        try:
            if self.llm.supports_function_calling():
                response = self.llm.call(messages=self._build_messages(), response_model=self.model)
            else:
                response = self.llm.call(self._build_messages())
            return self._coerce_response_to_pydantic(response)
        except ValidationError as e:
            if current_attempt < self.max_attempts:
                return self.to_pydantic(current_attempt + 1)
            raise ConverterError(...)

    def _coerce_response_to_pydantic(self, response) -> BaseModel:
        if isinstance(response, BaseModel):
            return response
        try:
            return self.model.model_validate_json(response)
        except ValidationError:
            partial = handle_partial_json(result=response, model=self.model, ...)
            if isinstance(partial, BaseModel):
                return partial
```

**设计要点**：
- 支持 function calling 和纯文本两种路径
- 自动重试机制（最多 `max_attempts` 次）
- 部分JSON解析容错（`handle_partial_json`）
- 同步/异步双版本（`to_pydantic` / `ato_pydantic`）

---

## 8. 记忆系统 — 统一Memory

```python
class Memory(BaseModel):
    memory_kind: Literal["memory"] = "memory"
    llm: BaseLLM | str = Field(default="gpt-5.4-mini")
    storage: StorageBackend | str = Field(default="lancedb")
    embedder: Any = Field(default=None)
    recency_weight: float = Field(default=0.3)
    semantic_weight: float = Field(default=0.5)
    importance_weight: float = Field(default=0.2)
    recency_half_life_days: int = Field(default=30)
    consolidation_threshold: float = Field(default=0.85)
    consolidation_limit: int = Field(default=5)
    confidence_threshold_high: float = Field(default=0.8)
    confidence_threshold_low: float = Field(default=0.5)
    exploration_budget: int = Field(default=1)
    root_scope: str | None = Field(default=None)
```

**复合评分公式**：
```
composite_score = recency_weight * recency_score
                + semantic_weight * semantic_similarity
                + importance_weight * importance_score
```

记忆系统支持：
- **LLM分析**：保存时自动推断范围、类别、重要性
- **自适应回忆**：根据置信度决定是否深入探索
- **作用域视图**：MemoryScope / MemorySlice 支持记忆的层级隔离
- **合并去重**：相似度超过阈值时自动合并

---

## 9. 事件系统 — EventBus

```python
class CrewAIEventsBus:
    """Singleton event bus for handling events in CrewAI."""

    _instance: Self | None = None
    _instance_lock: threading.RLock = threading.RLock()
    _rwlock: RWLock
    _sync_handlers: dict[type[BaseEvent], SyncHandlerSet]
    _async_handlers: dict[type[BaseEvent], AsyncHandlerSet]
    _handler_dependencies: dict[type[BaseEvent], dict[Handler, list[Depends[Any]]]]
    _execution_plan_cache: dict[type[BaseEvent], ExecutionPlan]
    _sync_executor: ThreadPoolExecutor
    _loop: asyncio.new_event_loop()
```

**事件类型覆盖**：
- Crew事件：`CrewKickoffStartedEvent`、`CrewKickoffCompletedEvent`、`CrewKickoffFailedEvent`
- Task事件：`TaskStartedEvent`、`TaskCompletedEvent`、`TaskFailedEvent`
- Agent事件：`LiteAgentExecutionStartedEvent`、`LiteAgentExecutionCompletedEvent`
- Memory事件：`MemorySaveStartedEvent`、`MemoryQueryCompletedEvent`
- LLM事件：`LLMStreamChunkEvent`

**关键特性**：
- 单例模式 + 双重检查锁定
- 同步Handler在ThreadPoolExecutor（max_workers=10）中执行
- 异步Handler在专用事件循环（守护线程）中执行
- 支持Handler依赖关系（`Depends`）和执行计划缓存
- 支持事件回放（replay）机制

---

## 10. 注解系统 — Python原生DSL

### 10.1 装饰器定义

```python
@agent
def researcher(self) -> Agent:
    return Agent(role="Researcher", goal="...", backstory="...")

@task
def research_task(self) -> Task:
    return Task(description="...", expected_output="...", agent=self.researcher())

@crew
def crew(self) -> Crew:
    return Crew(agents=[self.researcher()], tasks=[self.researched_task()], process=Process.sequential)

@before_kickoff
def prepare(self, inputs):
    inputs["prepared"] = True
    return inputs

@after_kickoff
def post_process(self, result):
    result.raw += "\n[Post-processed]"
    return result
```

### 10.2 注解实现原理

```python
def agent(meth: Callable[P, R]) -> AgentMethod[P, R]:
    """Marks a method as a crew agent."""
    return AgentMethod(memoize(meth))

def task(meth: Callable[P, TaskResultT]) -> TaskMethod[P, TaskResultT]:
    """Marks a method as a crew task."""
    return TaskMethod(memoize(meth))

def crew(meth: Callable[..., Crew]) -> Callable[..., Crew]:
    """Marks a method as the main crew execution point."""
    @wraps(meth)
    def wrapper(self, *args, **kwargs):
        # 实例化所有标记为 @agent 和 @task 的方法返回值
        ...
    return wrapper
```

使用 `memoize` 确保每个装饰器方法只执行一次（惰性求值 + 缓存），避免重复创建Agent/Task实例。

### 10.3 Flow DSL

```python
from crewai.flow.flow import Flow, start, listen, router, and_, or_

class MyFlow(Flow[dict]):
    @start()
    def begin(self):
        return {"step": "started"}

    @listen(begin)
    def process(self, data):
        return {"step": "processed"}

    @router(process)
    def decide(self, data):
        if data["step"] == "processed":
            return "success"
        return "retry"

    @listen("success")
    def finish(self, data):
        return {"done": True}
```

Flow框架使用装饰器定义事件驱动的有向图，支持 `@start`（入口）、`@listen`（监听）、`@router`（路由）、`and_`/`or_`（组合监听）。

---

## 11. 架构总结与设计哲学

### 核心设计原则

| 维度 | CrewAI的选择 | 对比LangGraph |
|------|-------------|--------------|
| **抽象层级** | 高层抽象（Crew/Agent/Task） | 底层图编程 |
| **Agent定义** | 角色扮演（role/goal/backstory） | 节点+函数 |
| **流程控制** | 枚举模式（sequential/hierarchical） | 自定义图 |
| **状态管理** | Pydantic模型 + 检查点 | TypedDict + Reducer |
| **工具系统** | BaseTool + 类型注册表 | @tool装饰器 |
| **输出验证** | Guardrail + Converter | 无内建 |
| **记忆** | 统一Memory（LanceDB/ChromaDB） | 外部集成 |
| **事件系统** | 内建EventBus | 外部集成 |
| **协议支持** | MCP + A2A | MCP |
| **学习曲线** | 低（声明式） | 中（编程式） |

### 适用场景

- ✅ **角色扮演式协作**：需要Agent有明确角色、目标、背景故事
- ✅ **快速原型**：几行代码即可创建多Agent系统
- ✅ **结构化输出**：内置Pydantic/JSON输出验证
- ✅ **生产就绪**：检查点、记忆、追踪、安全配置
- ❌ **复杂条件路由**：不如LangGraph灵活
- ❌ **精细状态控制**：状态管理相对粗糙
- ❌ **自定义执行图**：不支持任意DAG

### 与OpenMate的对比启示

CrewAI的 `Crew + Task + Agent` 三层模型比LangGraph的图模型更适合**协作型Agent场景**，但灵活性较低。对于OpenMate而言：
- 可借鉴其 **角色扮演机制**（role/goal/backstory）增强Agent个性化
- 可参考其 **Guardrail系统** 实现输出质量保障
- 可学习其 **检查点/恢复机制** 支持长时间任务
- 其 **注解系统**（@agent/@task/@crew）提供了优秀的开发者体验

---

*文档生成时间：2025-09-13 | 基于 crewAIInc/crewAI 源码分析*
