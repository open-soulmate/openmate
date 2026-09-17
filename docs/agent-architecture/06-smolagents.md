# 06. SmolAgents 深度架构分析

> **项目地址**: https://github.com/huggingface/smolagents
> **Stars**: 29.2k | **Commits**: 1,054 | **协议**: Apache 2.0
> **核心理念**: "Agents that think in code" — 用代码片段而非 JSON 工具调用来表达 Agent 动作

## 概述

SmolAgents 是 HuggingFace 推出的轻量级 Agent 框架，核心逻辑仅约 1,000 行代码（`agents.py`）。其最大特点是 **Code Agent** 模式——LLM 生成 Python 代码作为动作，而非传统的 JSON 工具调用字典。研究表明这种方式比传统工具调用减少 30% 的步骤数，并在困难基准上达到更高性能。

---

## 1. Agent 类层次结构

SmolAgents 采用清晰的抽象基类层次结构：`MultiStepAgent` 为抽象基类，`CodeAgent` 和 `ToolCallingAgent` 为两个具体实现。

```python
# agents.py — 基类定义
class MultiStepAgent(ABC):
    """
    Agent class that solves the given task step by step, using the ReAct framework:
    While the objective is not reached, the agent will perform a cycle of action
    (given by the LLM) and observation (obtained from the environment).
    """
    def __init__(
        self,
        tools: list[Tool],
        model: Model,
        prompt_templates: PromptTemplates | None = None,
        instructions: str | None = None,
        max_steps: int = 20,
        add_base_tools: bool = False,
        verbosity_level: LogLevel = LogLevel.INFO,
        managed_agents: list | None = None,
        step_callbacks: list[Callable] | dict[Type[MemoryStep], Callable | list[Callable]] | None = None,
        planning_interval: int | None = None,
        name: str | None = None,
        description: str | None = None,
        provide_run_summary: bool = False,
        final_answer_checks: list[Callable] | None = None,
        return_full_result: bool = False,
        logger: AgentLogger | None = None,
    ):
```

Agent 注册表采用白名单机制，防止反序列化时的任意代码执行：

```python
# agents.py — 安全反序列化注册表
AGENT_REGISTRY = {
    "ToolCallingAgent": ToolCallingAgent,
    "CodeAgent": CodeAgent,
}
```

**设计要点**：
- `MultiStepAgent` 管理工具、模型、内存、监控、回调等通用逻辑
- `CodeAgent` 通过 `PythonExecutor` 执行 LLM 生成的代码
- `ToolCallingAgent` 使用传统 JSON 工具调用模式
- 两种 Agent 共享相同的 ReAct 循环框架

---

## 2. ReAct 执行循环

SmolAgents 的核心执行循环是一个流式生成器 `_run_stream`，实现了经典的 ReAct（Reasoning + Acting）模式。

```python
# agents.py — 核心执行循环
def _run_stream(
    self, task: str, max_steps: int, images: list["PIL.Image.Image"] | None = None
) -> Generator[ActionStep | PlanningStep | FinalAnswerStep | ChatMessageStreamDelta]:
    self.step_number = 1
    returned_final_answer = False
    while not returned_final_answer and self.step_number <= max_steps:
        if self.interrupt_switch:
            raise AgentError("Agent interrupted.", self.logger)
        # Run a planning step if scheduled
        if self.planning_interval is not None and (
            self.step_number == 1 or (self.step_number - 1) % self.planning_interval == 0
        ):
            planning_start_time = time.time()
            planning_step = None
            for element in self._generate_planning_step(
                task, is_first_step=len(self.memory.steps) == 1, step=self.step_number
            ):
                yield element
                planning_step = element
        # Start action step!
        action_step = ActionStep(
            step_number=self.step_number,
            timing=Timing(start_time=action_step_start_time),
            observations_images=images,
        )
        try:
            for output in self._step_stream(action_step):
                yield output
                if isinstance(output, ActionOutput) and output.is_final_answer:
                    final_answer = output.output
                    returned_final_answer = True
                    action_step.is_final_answer = True
        except AgentError as e:
            action_step.error = e
        finally:
            self._finalize_step(action_step)
            self.memory.steps.append(action_step)
        self.step_number += 1
```

**关键设计**：
- 使用 Python Generator 实现流式输出，每一步 yield 给调用者
- 内置中断机制 (`interrupt_switch`)
- 支持周期性规划步骤 (`planning_interval`)
- 错误处理不中断循环，而是记录到内存继续执行

---

## 3. Code Agent 核心实现

`CodeAgent` 是 SmolAgents 的核心创新——LLM 输出 Python 代码片段，由安全的 Python 执行器执行。

```python
# agents.py — CodeAgent 的步骤执行
def _step_stream(
    self, memory_step: ActionStep
) -> Generator[ChatMessageStreamDelta | ToolCall | ToolOutput | ActionOutput]:
    memory_messages = self.write_memory_to_messages()
    input_messages = memory_messages.copy()
    ### Generate model output ###
    stop_sequences = ["Observation:", "Calling tools:"]
    if self._use_structured_outputs_internally:
        additional_args["response_format"] = CODEAGENT_RESPONSE_FORMAT
    chat_message: ChatMessage = self.model.generate(
        input_messages,
        stop_sequences=stop_sequences,
        **additional_args,
    )
    ### Parse output ###
    if self._use_structured_outputs_internally:
        code_action = json.loads(output_text)["code"]
    else:
        code_action = parse_code_blobs(output_text, self.code_block_tags)
    code_action = fix_final_answer_code(code_action)
    memory_step.code_action = code_action
    ### Execute action ###
    code_output = self.python_executor(code_action)
    truncated_output = truncate_content(str(code_output.output))
    observation += "Last output from code snippet:\n" + truncated_output
    memory_step.observations = observation
    yield ActionOutput(output=code_output.output, is_final_answer=code_output.is_final_answer)
```

**结构化输出支持**：

```python
# models.py — 结构化输出的 JSON Schema
CODEAGENT_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "schema": {
            "additionalProperties": False,
            "properties": {
                "thought": {
                    "description": "A free form text description of the thought process.",
                    "title": "Thought",
                    "type": "string",
                },
                "code": {
                    "description": "Valid Python code snippet implementing the thought.",
                    "title": "Code",
                    "type": "string",
                },
            },
            "required": ["thought", "code"],
            "title": "ThoughtAndCodeAnswer",
            "type": "object",
        },
        "name": "ThoughtAndCodeAnswer",
        "strict": True,
    },
}
```

**设计亮点**：
- 支持两种模式：自由文本解析（默认）和结构化 JSON 输出
- 代码块标签可自定义（markdown `\`\`\`python` 或反引号 `` ` ``）
- 通过 `stop_sequences` 控制生成终止
- `fix_final_answer_code` 后处理确保 final_answer 调用正确

---

## 4. 工具系统架构

工具系统基于 `Tool` 抽象类，每个工具必须声明 `name`、`description`、`inputs`、`output_type` 四个类属性，并实现 `forward` 方法。

```python
# tools.py — 工具基类
class Tool(BaseTool):
    """
    A base class for the functions used by the agent. Subclass this and implement
    the `forward` method as well as the following class attributes:
    - **description** (`str`) -- A short description of what your tool does
    - **name** (`str`) -- A performative name for the tool
    - **inputs** (`Dict[str, Dict[str, Union[str, type, bool]]]`) -- Expected input modalities
    - **output_type** (`type`) -- The type of the tool output
    """
    name: str
    description: str
    inputs: dict[str, dict[str, str | type | bool]]
    output_type: str
    output_schema: dict[str, Any] | None = None

    def __init__(self, *args, **kwargs):
        self.is_initialized = False

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        validate_after_init(cls)

    def forward(self, *args, **kwargs):
        raise NotImplementedError("Write this method in your subclass of `Tool`.")

    def __call__(self, *args, sanitize_inputs_outputs: bool = False, **kwargs):
        if not self.is_initialized:
            self.setup()
        if sanitize_inputs_outputs:
            args, kwargs = handle_agent_input_types(*args, **kwargs)
        outputs = self.forward(*args, **kwargs)
        if sanitize_inputs_outputs:
            outputs = handle_agent_output_types(outputs, self.output_type)
        return outputs
```

**懒初始化机制**：工具的 `setup()` 方法在首次调用时执行，而非实例化时，适合加载大模型等耗时操作：

```python
# tools.py — 懒初始化
def setup(self):
    """
    Overwrite this method here for any operation that is expensive
    and needs to be executed before you start using your tool.
    Such as loading a big model.
    """
    self.is_initialized = True
```

**输入验证**：通过装饰器 `validate_after_init` 在每个子类实例化后自动验证：

```python
# tools.py — 自动验证装饰器
def validate_after_init(cls):
    original_init = cls.__init__
    @wraps(original_init)
    def new_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        self.validate_arguments()
    cls.__init__ = new_init
    return cls
```

---

## 5. @tool 装饰器 — 快速创建工具

SmolAgents 提供 `@tool` 装饰器，允许用户将普通函数一步转换为 Tool 实例，大幅降低工具创建门槛。

```python
# tools.py — @tool 装饰器核心逻辑
def tool(tool_function: Callable) -> Tool:
    """
    Convert a function into an instance of a dynamically created Tool subclass.
    Should have type hints for each input and a type hint for the output.
    Should also have a docstring including the description and an 'Args:' part.
    """
    tool_json_schema = get_json_schema(tool_function)["function"]

    class SimpleTool(Tool):
        def __init__(self):
            self.is_initialized = True
            SimpleTool.name = tool_json_schema["name"]
            SimpleTool.description = tool_json_schema["description"]
            SimpleTool.inputs = tool_json_schema["parameters"]["properties"]
            SimpleTool.output_type = tool_json_schema["return"]["type"]

        @wraps(tool_function)
        def wrapped_function(*args, **kwargs):
            return tool_function(*args, **kwargs)

        SimpleTool.forward = staticmethod(wrapped_function)

    # 生成完整的类源码用于序列化
    class_source = textwrap.dedent(f"""
    class SimpleTool(Tool):
        name: str = "{tool_json_schema['name']}"
        description: str = {json.dumps(textwrap.dedent(tool_json_schema['description']).strip())}
        inputs: dict[str, dict[str, str]] = {tool_json_schema['parameters']['properties']}
        output_type: str = "{tool_json_schema['return']['type']}"
    """)
    SimpleTool.__source__ = class_source
    return SimpleTool()
```

**使用示例**：

```python
@tool
def calculate(expression: str) -> float:
    """Evaluate a mathematical expression.
    Args:
        expression: The mathematical expression to evaluate.
    """
    return eval(expression)
```

---

## 6. 模型抽象层

模型层采用 `Model` 基类 + 多个具体实现的策略，支持从本地 Transformers 到云端 API 的全栈部署。

```python
# models.py — 模型基类
class Model:
    """Base class for all language model implementations."""
    def __init__(
        self,
        flatten_messages_as_text: bool = False,
        tool_name_key: str = "name",
        tool_arguments_key: str = "arguments",
        model_id: str | None = None,
        **kwargs,
    ):
        self.flatten_messages_as_text = flatten_messages_as_text
        self.tool_name_key = tool_name_key
        self.tool_arguments_key = tool_arguments_key
        self.kwargs = kwargs
        self.model_id: str | None = model_id

    def generate(
        self,
        messages: list[ChatMessage],
        stop_sequences: list[str] | None = None,
        response_format: dict[str, str] | None = None,
        tools_to_call_from: list[Tool] | None = None,
        **kwargs,
    ) -> ChatMessage:
        raise NotImplementedError("This method must be implemented in child classes")

    def __call__(self, *args, **kwargs):
        return self.generate(*args, **kwargs)
```

**参数准备的优先级机制**：

```python
# models.py — 参数优先级
def _prepare_completion_kwargs(self, messages, stop_sequences=None,
                                response_format=None, tools_to_call_from=None,
                                **kwargs) -> dict[str, Any]:
    """
    Parameter priority (highest to lowest):
    1. self.kwargs (model defaults)
    2. Explicitly passed kwargs
    3. Specific parameters (stop_sequences, response_format, etc.)
    """
    completion_kwargs = {"messages": messages_as_dicts}
    if stop_sequences is not None and self.supports_stop_parameter:
        completion_kwargs["stop"] = stop_sequences
    if tools_to_call_from:
        completion_kwargs["tools"] = [get_tool_json_schema(tool) for tool in tools_to_call_from]
    completion_kwargs.update(kwargs)
    for kwarg_name, kwarg_value in self.kwargs.items():
        if kwarg_value is REMOVE_PARAMETER:
            completion_kwargs.pop(kwarg_name, None)
        else:
            completion_kwargs[kwarg_name] = kwarg_value
    return completion_kwargs
```

**支持的模型实现**：
- `TransformersModel` — 本地 HuggingFace 模型
- `VLLMModel` — vLLM 高性能推理
- `MLXModel` — Apple Silicon MLX 框架
- `OpenAIModel` — OpenAI 及兼容 API
- `AzureOpenAIModel` — Azure OpenAI
- `LiteLLMModel` — 100+ LLM 提供商
- `InferenceClientModel` — HuggingFace Hub 推理
- `AmazonBedrockModel` — AWS Bedrock

---

## 7. 内存与消息系统

SmolAgents 的内存系统基于 `AgentMemory` 和多种 `MemoryStep` 类型，支持丰富的上下文管理。

```python
# agents.py — 内存写入消息
def write_memory_to_messages(self, summary_mode: bool = False) -> list[ChatMessage]:
    """
    Reads past llm_outputs, actions, and observations or errors from the memory
    into a series of messages that can be used as input to the LLM.
    """
    messages = self.memory.system_prompt.to_messages(summary_mode=summary_mode)
    for memory_step in self.memory.steps:
        messages.extend(memory_step.to_messages(summary_mode=summary_mode))
    return messages
```

**步骤类型体系**：

```python
# agents.py — 步骤类型导入
from .memory import (
    ActionStep,        # 执行动作的步骤
    AgentMemory,       # 内存管理器
    CallbackRegistry,  # 回调注册表
    FinalAnswerStep,   # 最终答案步骤
    MemoryStep,        # 步骤基类
    PlanningStep,      # 规划步骤
    SystemPromptStep,  # 系统提示步骤
    TaskStep,          # 任务步骤
    Timing,            # 计时信息
    ToolCall,          # 工具调用记录
)
```

**ChatMessage 数据结构**：

```python
# models.py — 消息结构
@dataclass
class ChatMessage:
    role: MessageRole
    content: str | list[dict[str, Any]] | None = None
    tool_calls: list[ChatMessageToolCall] | None = None
    raw: Any | None = None
    token_usage: TokenUsage | None = None

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL_CALL = "tool-call"
    TOOL_RESPONSE = "tool-response"
```

---

## 8. 多 Agent 协作（Managed Agents）

SmolAgents 支持 managed agents 模式——一个主 Agent 可以调用其他 Agent 作为工具。

```python
# agents.py — Managed Agent 设置
def _setup_managed_agents(self, managed_agents: list | None = None) -> None:
    """Setup managed agents with proper logging."""
    self.managed_agents = {}
    if managed_agents:
        assert all(agent.name and agent.description for agent in managed_agents), \
            "All managed agents need both a name and a description!"
        self.managed_agents = {agent.name: agent for agent in managed_agents}
        # Ensure managed agents can be called as tools by the model
        for agent in self.managed_agents.values():
            agent.inputs = {
                "task": {"type": "string", "description": "Long detailed description of the task."},
                "additional_args": {
                    "type": "object",
                    "description": "Dictionary of extra inputs to pass to the managed agent.",
                    "nullable": True,
                },
            }
            agent.output_type = "string"
```

**被调用时的包装逻辑**：

```python
# agents.py — 作为 managed agent 被调用
def __call__(self, task: str, **kwargs):
    """Adds additional prompting for the managed agent, runs it, and wraps the output."""
    full_task = populate_template(
        self.prompt_templates["managed_agent"]["task"],
        variables=dict(name=self.name, task=task),
    )
    result = self.run(full_task, **kwargs)
    report = result.output if isinstance(result, RunResult) else result
    answer = populate_template(
        self.prompt_templates["managed_agent"]["report"],
        variables=dict(name=self.name, final_answer=report),
    )
    if self.provide_run_summary:
        for message in self.write_memory_to_messages(summary_mode=True):
            answer += "\n" + truncate_content(str(message.content)) + "\n---"
    return answer
```

---

## 9. 沙箱化代码执行

为解决任意代码执行的安全问题，SmolAgents 支持多种沙箱执行器。

```python
# agents.py — 执行器类型与创建
def create_python_executor(self) -> PythonExecutor:
    if self.executor_type not in {"local", "blaxel", "e2b", "modal", "docker"}:
        raise ValueError(f"Unsupported executor type: {self.executor_type}")
    if self.executor_type == "local":
        return LocalPythonExecutor(
            self.additional_authorized_imports,
            **{"max_print_outputs_length": self.max_print_outputs_length} | self.executor_kwargs,
        )
    else:
        if self.managed_agents:
            raise Exception("Managed agents are not yet supported with remote code execution.")
        remote_executors = {
            "blaxel": BlaxelExecutor,
            "e2b": E2BExecutor,
            "docker": DockerExecutor,
            "modal": ModalExecutor,
        }
        return remote_executors[self.executor_type](
            self.additional_authorized_imports, self.logger, **self.executor_kwargs
        )
```

**导入白名单机制**：

```python
# agents.py — CodeAgent 初始化中的导入授权
self.additional_authorized_imports = additional_authorized_imports if additional_authorized_imports else []
self.authorized_imports = sorted(set(BASE_BUILTIN_MODULES) | set(self.additional_authorized_imports))
```

**支持的执行器**：
| 执行器 | 说明 |
|--------|------|
| `local` | 本地 `LocalPythonExecutor`，带导入白名单 |
| `e2b` | E2B 云端沙箱 |
| `docker` | Docker 容器隔离 |
| `modal` | Modal 无服务器沙箱 |
| `blaxel` | Blaxel 云端执行 |

---

## 10. Hub 生态与序列化

SmolAgents 深度集成 HuggingFace Hub，支持工具和 Agent 的发布、加载、共享。

**工具的序列化与反序列化**：

```python
# tools.py — 工具序列化为代码
def to_dict(self) -> dict:
    """Returns a dictionary representing the tool"""
    if type(self).__name__ == "SimpleTool":
        forward_source_code = get_source(self.forward)
        tool_code = textwrap.dedent(f"""
        from smolagents import Tool
        from typing import Any, Optional
        class {class_name}(Tool):
            name = "{self.name}"
            description = {json.dumps(textwrap.dedent(self.description).strip())}
            inputs = {repr(self.inputs)}
            output_type = "{self.output_type}"
        """).strip()
    else:
        tool_code = "from typing import Any, Optional\n" + instance_to_source(self, base_cls=Tool)
    requirements = {el for el in get_imports(tool_code) if el not in sys.stdlib_module_names} | {"smolagents"}
    return {"name": self.name, "code": tool_code, "requirements": sorted(requirements)}

# tools.py — 从代码动态加载
@classmethod
def from_code(cls, tool_code: str, **kwargs):
    module = types.ModuleType("dynamic_tool")
    exec(tool_code, module.__dict__)
    tool_class = next(
        (obj for _, obj in inspect.getmembers(module, inspect.isclass)
         if issubclass(obj, Tool) and obj is not Tool),
        None,
    )
    return tool_class(**kwargs)
```

**MCP 工具集成**：

```python
# tools.py — MCP 服务器工具加载
@contextmanager
def from_mcp(
    cls,
    server_parameters: "mcp.StdioServerParameters" | dict,
    trust_remote_code: bool = False,
    structured_output: bool | None = None,
) -> "ToolCollection":
    """Automatically load a tool collection from an MCP server.
    Supports Stdio, Streamable HTTP, and legacy HTTP+SSE MCP servers.
    """
    from mcpadapt.core import MCPAdapt
    from mcpadapt.smolagents_adapter import SmolAgentsAdapter
    with MCPAdapt(server_parameters, SmolAgentsAdapter(structured_output=structured_output)) as tools:
        yield cls(tools)
```

**Agent 的完整序列化**：

```python
# agents.py — Agent 序列化为字典
def to_dict(self) -> dict[str, Any]:
    agent_dict = {
        "class": self.__class__.__name__,
        "tools": tool_dicts,
        "model": {"class": self.model.__class__.__name__, "data": self.model.to_dict()},
        "managed_agents": [agent.to_dict() for agent in self.managed_agents.values()],
        "prompt_templates": self.prompt_templates,
        "max_steps": self.max_steps,
        "planning_interval": self.planning_interval,
        "name": self.name,
        "description": self.description,
        "requirements": sorted(requirements),
    }
    return agent_dict
```

---

## 架构总结

| 维度 | 设计选择 | 对标 |
|------|---------|------|
| Agent 模式 | Code Agent（代码优先） | LangChain JSON 工具调用 |
| 执行循环 | 流式 Generator + ReAct | CrewAI 同步循环 |
| 工具定义 | 类继承 + @tool 装饰器 | LangChain @tool |
| 模型抽象 | 统一 Model 基类 | LiteLLM provider |
| 安全沙箱 | 5 种执行器（local/docker/e2b/modal/blaxel） | OpenAI Code Interpreter |
| 内存管理 | 步骤级内存 + 类型化步骤 | MemGPT 长期记忆 |
| 多 Agent | Managed Agent 模式 | AutoGen 对话式 |
| 生态集成 | HuggingFace Hub + MCP | LangChain Hub |
| 序列化 | 代码级序列化（to_dict/from_dict） | LangGraph checkpoint |
| 结构化输出 | JSON Schema 强制约束 | Instructor 库 |

**核心优势**：
1. **极简代码**：核心 ~1,000 行，易理解、易修改
2. **代码优先**：比 JSON 工具调用减少 30% 步骤
3. **模型无关**：支持 10+ 模型后端
4. **安全执行**：多种沙箱方案
5. **Hub 生态**：工具和 Agent 可一键共享

**局限性**：
1. 无内置工作流编排（DAG/状态机）
2. Managed Agent 不支持远程执行器
3. 多 Agent 协作能力相对简单
4. 缺少内置的 RAG 管道
