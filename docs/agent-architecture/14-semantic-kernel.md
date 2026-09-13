# 14 - Microsoft Semantic Kernel 架构深度分析

> **项目**: [microsoft/semantic-kernel](https://github.com/microsoft/semantic-kernel)
> **Stars**: 28.5K+ | **License**: MIT | **语言**: Python / .NET / Java
> **定位**: 企业级 AI Agent SDK，模型无关，支持构建、编排和部署 AI Agent 及多 Agent 系统

## 一、整体架构概览

Semantic Kernel（SK）是微软推出的模型无关 SDK，其核心设计理念是将 LLM 能力与传统代码通过统一的 **Kernel（内核）** 模式整合。架构分为四层：

```
┌─────────────────────────────────────────────┐
│            Agent Layer (Agent 抽象)           │
│  ChatCompletionAgent / AzureAIAgent / ...    │
├─────────────────────────────────────────────┤
│          Kernel Layer (核心调度)              │
│  Plugins → Functions → Filters → Services    │
├─────────────────────────────────────────────┤
│        Connector Layer (AI 服务连接器)        │
│  OpenAI / Azure / HuggingFace / ...          │
├─────────────────────────────────────────────┤
│        Content Layer (内容模型)               │
│  ChatMessage / Streaming / FunctionCall       │
└─────────────────────────────────────────────┘
```

SK 现已演化为 **Microsoft Agent Framework (MAF)**，作为其企业级后继者，但 SK 本身仍是 MAF 的核心引擎。

---

## 二、十个维度深度分析

### 1. Kernel 核心 —— 组合式设计

Kernel 是整个框架的中枢调度器，通过多重继承组合了四个扩展能力：

```python
class Kernel(
    KernelFilterExtension,      # 过滤器链
    KernelFunctionExtension,    # 插件/函数管理
    KernelServicesExtension,    # AI 服务管理
    KernelReliabilityExtension  # 可靠性（重试等）
):
    """The Kernel of Semantic Kernel.
    This is the main entry point for Semantic Kernel. It provides the ability to run
    functions and manage filters, plugins, and AI services.
    """
```

Kernel 的 `__init__` 接收 plugins、services 和 ai_service_selector 三大核心依赖：

```python
def __init__(
    self,
    plugins: KernelPlugin | dict[str, KernelPlugin] | list[KernelPlugin] | None = None,
    services: AI_SERVICE_CLIENT_TYPE | list | dict | None = None,
    ai_service_selector: AIServiceSelector | None = None,
    **kwargs: Any,
) -> None:
```

**设计洞察**：Kernel 不是一个 God Object，而是通过 Mixin 模式将关注点分离到四个独立扩展中。每个扩展负责一个正交维度：过滤、函数、服务、可靠性。

---

### 2. 函数抽象 —— 统一的 KernelFunction

所有能力（原生方法和 Prompt 模板）统一为 `KernelFunction`：

```python
class KernelFunction(KernelBaseModel):
    """Semantic Kernel function."""
    metadata: KernelFunctionMetadata

    invocation_duration_histogram: metrics.Histogram = Field(
        default_factory=_create_function_duration_histogram, exclude=True
    )
    streaming_duration_histogram: metrics.Histogram = Field(
        default_factory=_create_function_streaming_duration_histogram, exclude=True
    )
```

函数有两种创建方式——从方法或从 Prompt：

```python
@classmethod
def from_prompt(cls, function_name, plugin_name, description=None,
                prompt=None, template_format=KERNEL_TEMPLATE_FORMAT_NAME,
                prompt_template=None, prompt_template_config=None,
                prompt_execution_settings=None) -> "KernelFunctionFromPrompt":
    """Create a new instance of the KernelFunctionFromPrompt class."""

@classmethod
def from_method(cls, method, plugin_name=None,
                stream_method=None) -> "KernelFunctionFromMethod":
    """Create a new instance of the KernelFunctionFromMethod class."""
```

**设计洞察**：统一函数抽象使得 Agent 可以透明地调用原生代码或 LLM Prompt，调用者无需区分。这类似于 Unix 的"一切皆文件"哲学——在 SK 中"一切皆函数"。

---

### 3. Filter 管道 —— AOP 风格的横切关注点

SK 的函数调用通过 Filter 管道执行，支持在调用前/后插入逻辑：

```python
async def invoke(self, kernel, arguments=None, metadata=None, **kwargs):
    function_context = FunctionInvocationContext(
        function=self, kernel=kernel, arguments=arguments
    )
    # 构建过滤器调用栈，最内层是实际的 _invoke_internal
    stack = kernel.construct_call_stack(
        filter_type=FilterTypes.FUNCTION_INVOCATION,
        inner_function=self._invoke_internal,
    )
    await stack(function_context)
    return function_context.result
```

三种过滤器类型覆盖不同场景：
- `FUNCTION_INVOCATION` — 单个函数调用
- `AUTO_FUNCTION_INVOCATION` — 自动工具调用（LLM 发起的）
- `PROMPT_RENDERING` — Prompt 模板渲染

**设计洞察**：Filter 管道是 SK 最强大的机制之一。它实现了面向切面编程（AOP），让日志、权限、缓存、重试等横切关注点可以非侵入式地注入。这比 LangChain 的 Callback 机制更加结构化。

---

### 4. Agent 基类 —— 声明式与运行时统一

Agent 是 SK 的高级抽象，继承自 `KernelBaseModel`（Pydantic）和 `ABC`：

```python
class Agent(KernelBaseModel, ABC):
    """Base abstraction for all Semantic Kernel agents."""
    instructions: str | None = None
    kernel: Kernel = Field(default_factory=Kernel)
    name: str = Field(
        default_factory=lambda: f"agent_{generate_random_ascii_name()}",
        pattern=AGENT_NAME_REGEX
    )
    prompt_template: PromptTemplateBase | None = None
```

Agent 在初始化时自动将自身注册为一个 `kernel_function`：

```python
def model_post_init(self, __context: Any) -> None:
    """Post initialization: create a kernel_function that calls this agent's get_response()."""
    @kernel_function(name=self.name, description=self.description or self.instructions)
    ...
```

**设计洞察**：Agent 自动注册为 KernelFunction，这意味着 Agent 可以作为其他 Agent 的工具——这是多 Agent 编排的基础。每个 Agent 既是消费者也是提供者。

---

### 5. 声明式 Agent 规范（YAML）

SK 支持通过 YAML 声明式定义 Agent，包含输入/输出规范：

```python
class InputSpec(KernelBaseModel):
    """Class representing an input specification."""
    description: str | None = None
    required: bool = False
    default: Any = None

class OutputSpec(KernelBaseModel):
    """Class representing an output specification."""
    ...
```

Agent 注册表支持从 YAML/字典/文件创建 Agent：

```python
@staticmethod
async def create_from_yaml(
    yaml_str: str, *, kernel=None, plugins=None, settings=None, extras=None, **kwargs,
) -> "Agent":
    """Create an agent instance from a YAML string."""

@staticmethod
async def create_from_file(
    file_path: str, *, kernel=None, plugins=None, settings=None, ...
) -> _TAgent:
    """Create a single agent instance from a YAML file."""
```

工具验证确保声明的工具在 Kernel 中存在：

```python
@classmethod
def _validate_tools(cls, tools_list: list[dict], kernel: Kernel) -> None:
    for tool in tools_list:
        tool_id = tool.get("id")
        if "." not in tool_id:
            raise AgentInitializationException(
                f"Tool id '{tool_id}' must be in format PluginName.FunctionName"
            )
        plugin_name, function_name = tool_id.split(".", 1)
        plugin = kernel.plugins.get(plugin_name)
        if not plugin:
            raise AgentInitializationException(f"Plugin '{plugin_name}' not found in kernel.")
```

**设计洞察**：声明式 Agent 规范是 SK 的差异化优势。通过 YAML 定义 Agent，可以实现 Agent 的版本化、存储和复用，类似于 Kubernetes 的 YAML 资源定义。

---

### 6. Agent 类型注册表 —— 插件式 Agent 发现

SK 使用装饰器模式实现 Agent 类型的自动注册：

```python
AGENT_TYPE_REGISTRY: dict[str, type[Agent]] = {}

def register_agent_type(agent_type: str):
    """Decorator to register an agent type with the registry."""

_BUILTIN_AGENT_MODULES = [
    "semantic_kernel.agents.chat_completion.chat_completion_agent",
    "semantic_kernel.agents.azure_ai.azure_ai_agent",
    "semantic_kernel.agents.open_ai.openai_assistant_agent",
    "semantic_kernel.agents.open_ai.azure_assistant_agent",
    "semantic_kernel.agents.open_ai.openai_responses_agent",
    "semantic_kernel.agents.open_ai.azure_responses_agent",
]
```

内置 Agent 按需懒加载：

```python
_BUILTIN_AGENTS_LOADED = False
_BUILTIN_AGENTS_LOCK = threading.Lock()
```

**设计洞察**：注册表 + 懒加载模式避免了循环导入和启动开销。YAML 中的 `type` 字段直接映射到注册表，实现了"配置即代码"的理念。

---

### 7. 自动函数调用（Tool Use）

Kernel 内置了完整的自动工具调用流程，处理 LLM 返回的 FunctionCall：

```python
async def invoke_function_call(
    self, function_call: FunctionCallContent, chat_history: ChatHistory, *,
    arguments=None, execution_settings=None, function_call_count=None,
    request_index=None, is_streaming=False, function_behavior=None,
) -> "AutoFunctionInvocationContext | None":
    """Processes the provided FunctionCallContent and updates the chat history."""
```

参数验证非常严格——检查缺失和多余参数：

```python
required_param_names = {
    param.name for param in function_to_call.parameters
    if param.name is not None and param.is_required
}
received_param_names = set(parsed_args or {})
missing_params = required_param_names - received_param_names
unexpected_params = received_param_names - {param.name for param in function_to_call.parameters}

if missing_params or unexpected_params:
    msg_parts = []
    if missing_params:
        msg_parts.append(f"Missing required argument(s): {sorted(missing_params)}.")
    if unexpected_params:
        msg_parts.append(f"Received unexpected argument(s): {sorted(unexpected_params)}.")
```

调用结果通过 `deepcopy` 快照防止变异泄漏：

```python
# Snapshot the tool's return value so later mutations don't leak back
if invocation_context.function_result and invocation_context.function_result.value is not None:
    invocation_context.function_result.value = deepcopy(invocation_context.function_result.value)
```

**设计洞察**：SK 的自动工具调用不是简单的"调一下就完"——它包含了参数验证、允许列表过滤、结果快照、错误恢复等企业级特性。返回值的 deepcopy 快照是一个容易被忽略但非常重要的安全措施。

---

### 8. 流式支持 —— 一等公民

流式处理在 SK 中是一等公民，`invoke_stream` 和 `invoke` 并列：

```python
async def invoke_stream(self, kernel, arguments=None, metadata=None, **kwargs):
    """Invoke a stream async function with the given arguments."""
    function_context = FunctionInvocationContext(
        function=self, kernel=kernel, arguments=arguments, is_streaming=True
    )
    stack = kernel.construct_call_stack(
        filter_type=FilterTypes.FUNCTION_INVOCATION,
        inner_function=self._invoke_internal_stream,
    )
    await stack(function_context)

    if function_context.result is not None:
        if isasyncgen(function_context.result.value):
            async for partial in function_context.result.value:
                function_results.append(partial)
                yield partial
        elif isgenerator(function_context.result.value):
            for partial in function_context.result.value:
                function_results.append(partial)
                yield partial
```

Kernel 层面也支持流式 Prompt 调用：

```python
async def invoke_prompt_stream(self, prompt, function_name=None, plugin_name=None,
                                arguments=None, template_format=KERNEL_TEMPLATE_FORMAT_NAME,
                                return_function_results=False, ...):
    """Invoke a function from the provided prompt and stream the results."""
```

**设计洞察**：SK 同时支持 async generator 和 sync generator 两种流式模式，并且流式调用也经过完整的 Filter 管道。这确保了日志、监控等横切逻辑在流式场景下不会丢失。

---

### 9. 可观测性 —— OpenTelemetry 原生集成

SK 深度集成了 OpenTelemetry，每个函数调用都有完整的指标和追踪：

```python
logger: logging.Logger = logging.getLogger(__name__)
tracer: trace.Tracer = trace.get_tracer(__name__)
meter: metrics.Meter = metrics.get_meter_provider().get_meter(__name__)

def _create_function_duration_histogram():
    return meter.create_histogram(
        "semantic_kernel.function.invocation.duration",
        unit="s",
        description="Measures the duration of a function's execution",
    )

def _create_function_streaming_duration_histogram():
    return meter.create_histogram(
        "semantic_kernel.function.streaming.duration",
        unit="s",
        description="Measures the duration of a function's streaming execution",
    )
```

调用链路中的 span 管理：

```python
with function_tracer.start_as_current_span(tracer, self, metadata) as current_span:
    if function_tracer.are_sensitive_events_enabled():
        current_span.set_attribute(TOOL_CALL_ARGUMENTS, arguments.dumps())
    # ... 调用 ...
    current_span.set_attribute(TOOL_CALL_RESULT, result)
    # 异常时
    current_span.record_exception(exception)
    current_span.set_attribute(ERROR_TYPE, type(exception).__name__)
    current_span.set_status(trace.StatusCode.ERROR, description=str(exception))
```

**设计洞察**：SK 是少数在 SDK 层面就原生集成 OpenTelemetry 的 Agent 框架。函数级别的 duration histogram 和 span 追踪使得生产环境的性能监控和问题排查变得极为便利。这是企业级框架的标志性特征。

---

### 10. MCP 集成 —— 标准协议互操作

SK 原生支持 MCP（Model Context Protocol），可以将 Kernel/Agent/Function 暴露为 MCP Server：

```python
@experimental
def as_mcp_server(
    self, prompts=None, server_name="Semantic Kernel MCP Server",
    version=None, instructions=None, lifespan=None,
    excluded_functions=None, **kwargs,
) -> "Server":
    """Create a MCP server from this kernel."""
    from semantic_kernel.connectors.mcp import create_mcp_server_from_kernel
    return create_mcp_server_from_kernel(
        kernel=self, prompts=prompts, server_name=server_name,
        version=version, instructions=instructions,
        lifespan=lifespan, excluded_functions=excluded_functions,
    )
```

Agent 也可以单独暴露为 MCP Server：

```python
# Agent 类中的方法
def as_mcp_server(self, prompts=None, server_name=None, version=None,
                  instructions=None, lifespan=None) -> "Server":
    from semantic_kernel.connectors.mcp import create_mcp_server_from_functions
    return create_mcp_server_from_functions(
        functions=self, prompts=prompts,
        server_name=server_name or self.name,
    )
```

同时，SK 还支持将 KernelFunction 转换为 Agent Framework 的工具：

```python
def as_agent_framework_tool(self, *, name=None, description=None, kernel=None) -> Any:
    """Convert the function to an agent framework tool."""
    from agent_framework import AIFunction
    # 动态创建 Pydantic 输入模型
    input_model = create_model("InputModel", **fields)
    async def wrapper(*args, **kwargs):
        result = await self.invoke(kernel, *args, **kwargs)
        return json.dumps(result.value)
    return AIFunction(name=name, description=description,
                      input_model=input_model, func=wrapper)
```

**设计洞察**：SK 正在从一个独立 SDK 向"协议网关"演进。通过 MCP 和 Agent Framework 的双向桥接，SK 函数可以被任何支持 MCP 的客户端调用，也可以调用任何暴露为 MCP Server 的外部能力。这种互操作性是下一代 Agent 生态的关键基础设施。

---

## 三、架构模式总结

| 维度 | SK 的选择 | 对标 |
|------|----------|------|
| 核心模式 | Kernel 中心化 + Mixin 扩展 | LangChain 的 Chain 模式 |
| 函数抽象 | 统一 KernelFunction（Prompt + Method） | LangChain 的 Tool/Chain 分离 |
| 横切关注点 | Filter 管道（AOP） | LangChain Callback |
| Agent 定义 | 声明式 YAML + 注册表 | AutoGen 的代码式定义 |
| 流式处理 | 一等公民，Filter 内支持 | 多数框架的后置支持 |
| 可观测性 | OpenTelemetry 原生 | 多数框架的自定义日志 |
| 互操作 | MCP + Agent Framework 双向桥 | 多数框架的封闭生态 |
| 多语言 | Python / .NET / Java 三语言 | 多数框架仅 Python |

---

## 四、对 OpenMate 的启示

1. **统一函数抽象**值得借鉴——将插件、Prompt、Agent 统一为可调用的函数单元
2. **Filter 管道**比 Callback 更适合企业场景——结构化的 AOP 优于松散的回调
3. **声明式 Agent 定义**是多 Agent 编排的正确方向——YAML 可版本化、可审计
4. **OpenTelemetry 原生集成**应成为 Agent 框架的标配而非后置补丁
5. **MCP 双向桥接**代表了 Agent 互操作的未来——OpenMate 应考虑类似设计
