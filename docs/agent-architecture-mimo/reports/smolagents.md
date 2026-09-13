# huggingface/smolagents — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/huggingface/smolagents  
> 抓取通道: cdn.jsdelivr.net/gh/huggingface/smolagents@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 ReAct Agent / Code Agent / Python 沙箱 / 持久化 借鉴

---

## 0. 诚实性说明

- 成功拉取: `src/smolagents/agents.py`（完整 MultiStepAgent + RunResult + 流式逻辑）、`src/smolagents/local_python_executor.py`（完整 Python AST 解释器 + 安全沙箱）
- 所有常量与代码行为源码实读

---

## 1. 系统架构

### 1.1 定位

smolagents 是 HuggingFace 的极简 Agent 框架，核心是 **ReAct 循环**（think → act → observe）和 **Code Agent**（LLM 生成 Python 代码在受限解释器中执行）。

### 1.2 源码布局

| 路径 | 职责 |
|------|------|
| `src/smolagents/agents.py` | MultiStepAgent 基类 + CodeAgent / ToolCallingAgent |
| `src/smolagents/local_python_executor.py` | AST 级 Python 解释器 + 安全限制 |
| `src/smolagents/memory.py` | AgentMemory / ActionStep / PlanningStep / FinalAnswerStep |
| `src/smolagents/models.py` | Model 抽象 + MODEL_REGISTRY |
| `src/smolagents/tools.py` | BaseTool / Tool |
| `src/smolagents/remote_executors.py` | E2B / Modal / Docker / Blaxel 远程执行器 |
| `src/smolagents/monitoring.py` | AgentLogger / Monitor / TokenUsage |
| `src/smolagents/default_tools.py` | TOOL_MAPPING / FinalAnswerTool |

---

## 2. MultiStepAgent — 核心基类（源码实读）

### 2.1 类声明与构造

```python
class MultiStepAgent(ABC):
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

**关键默认值**: `max_steps=20`

### 2.2 工具与 Managed Agent 设置

```python
def _setup_tools(self, tools, add_base_tools):
    assert all(isinstance(tool, BaseTool) for tool in tools)
    self.tools = {tool.name: tool for tool in tools}
    if add_base_tools:
        self.tools.update({
            name: cls()
            for name, cls in TOOL_MAPPING.items()
            if name != "python_interpreter" or self.__class__.__name__ == "ToolCallingAgent"
        })
    self.tools.setdefault("final_answer", FinalAnswerTool())
```

**设计要点**: `final_answer` 工具始终存在，是 Agent 终止信号。

### 2.3 Managed Agent 注册

```python
def _setup_managed_agents(self, managed_agents: list | None = None) -> None:
    self.managed_agents = {}
    if managed_agents:
        assert all(agent.name and agent.description for agent in managed_agents)
        self.managed_agents = {agent.name: agent for agent in managed_agents}
        for agent in self.managed_agents.values():
            agent.inputs = {
                "task": {"type": "string", "description": "Long detailed description of the task."},
                "additional_args": {
                    "type": "object",
                    "description": "Dictionary of extra inputs...",
                    "nullable": True,
                },
            }
            agent.output_type = "string"
```

### 2.4 名称唯一性校验

```python
def _validate_tools_and_managed_agents(self, tools, managed_agents):
    tool_and_managed_agent_names = [tool.name for tool in tools]
    if managed_agents is not None:
        tool_and_managed_agent_names += [agent.name for agent in managed_agents]
    if self.name:
        tool_and_managed_agent_names.append(self.name)
    if len(tool_and_managed_agent_names) != len(set(tool_and_managed_agent_names)):
        raise ValueError(
            "Each tool or managed_agent should have a unique name! ..."
        )
```

---

## 3. RunResult（源码实读）

```python
@dataclass
class RunResult:
    output: Any | None
    state: Literal["success", "max_steps_error"]
    steps: list[dict]
    token_usage: TokenUsage | None
    timing: Timing

    def __init__(self, output=None, state=None, steps=None, token_usage=None, timing=None, messages=None):
        if messages is not None:
            if steps is not None:
                raise ValueError("Cannot specify both 'messages' and 'steps' parameters.")
            warnings.warn(
                "Parameter 'messages' is deprecated and will be removed in version 1.25.",
                FutureWarning, stacklevel=2,
            )
            steps = messages
```

**状态枚举**: `"success"` | `"max_steps_error"`

---

## 4. run() 主入口（源码实读）

### 4.1 方法签名

```python
def run(
    self,
    task: str,
    stream: bool = False,
    reset: bool = True,
    images: list["PIL.Image.Image"] | None = None,
    additional_args: dict | None = None,
    max_steps: int | None = None,
    return_full_result: bool | None = None,
) -> Any | RunResult:
```

### 4.2 执行流程

```python
max_steps = max_steps or self.max_steps
self.task = task
self.interrupt_switch = False

if additional_args:
    self.state.update(additional_args)
    self.task += f"""
You have been provided with these additional arguments...
{str(additional_args)}."""

self.memory.system_prompt = SystemPromptStep(system_prompt=self.system_prompt)
if reset:
    self.memory.reset()
    self.monitor.reset()

self.memory.steps.append(TaskStep(task=self.task, task_images=images))

if getattr(self, "python_executor", None):
    self.python_executor.send_variables(variables=self.state)
    self.python_executor.send_tools({**self.tools, **self.managed_agents})

if stream:
    return self._run_stream(task=self.task, max_steps=max_steps, images=images)

# 非流式：内部消费流式生成器
run_start_time = time.time()
steps = list(self._run_stream(task=self.task, max_steps=max_steps, images=images))
assert isinstance(steps[-1], FinalAnswerStep)
output = steps[-1].output
```

### 4.3 Token 统计

```python
if return_full_result:
    total_input_tokens = 0
    total_output_tokens = 0
    correct_token_usage = True
    for step in self.memory.steps:
        if isinstance(step, (ActionStep, PlanningStep)):
            if step.token_usage is None:
                correct_token_usage = False
                break
            else:
                total_input_tokens += step.token_usage.input_tokens
                total_output_tokens += step.token_usage.output_tokens
    if correct_token_usage:
        token_usage = TokenUsage(input_tokens=total_input_tokens, output_tokens=total_output_tokens)
    else:
        token_usage = None  # 某些 step 缺少 token 统计

    if self.memory.steps and isinstance(getattr(self.memory.steps[-1], "error", None), AgentMaxStepsError):
        state = "max_steps_error"
    else:
        state = "success"
```

---

## 5. _run_stream() — 核心 ReAct 循环（源码实读）

```python
def _run_stream(self, task, max_steps, images=None) -> Generator[...]:
    self.step_number = 1
    returned_final_answer = False

    while not returned_final_answer and self.step_number <= max_steps:
        if self.interrupt_switch:
            raise AgentError("Agent interrupted.", self.logger)

        # Planning step（如果配置了 planning_interval）
        if self.planning_interval is not None and (
            self.step_number == 1 or (self.step_number - 1) % self.planning_interval == 0
        ):
            planning_start_time = time.time()
            planning_step = None
            for element in self._generate_planning_step(task, is_first_step=..., step=self.step_number):
                yield element
                planning_step = element
            planning_step.timing = Timing(start_time=planning_start_time, end_time=time.time())
            self._finalize_step(planning_step)
            self.memory.steps.append(planning_step)

        # Action step
        action_step_start_time = time.time()
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
                    if self.final_answer_checks:
                        self._validate_final_answer(final_answer)
                    returned_final_answer = True
                    action_step.is_final_answer = True
        except AgentGenerationError as e:
            raise e  # 实现错误，直接退出
        except AgentError as e:
            action_step.error = e  # 模型错误，记录并继续
        finally:
            self._finalize_step(action_step)
            self.memory.steps.append(action_step)
            yield action_step
            self.step_number += 1

    if not returned_final_answer and self.step_number == max_steps + 1:
        final_answer = self._handle_max_steps_reached(task)
        yield action_step

    final_answer_step = FinalAnswerStep(handle_agent_output_types(final_answer))
    self._finalize_step(final_answer_step)
    yield final_answer_step
```

**关键设计**:
- `AgentGenerationError` 直接 raise（实现 bug）
- 其他 `AgentError` 记录到 `action_step.error` 并继续循环
- max_steps 达到后调用 `_handle_max_steps_reached()` 生成最终答案

---

## 6. _handle_max_steps_reached()

```python
def _handle_max_steps_reached(self, task: str) -> Any:
    action_step_start_time = time.time()
    final_answer = self.provide_final_answer(task)
    final_memory_step = ActionStep(
        step_number=self.step_number,
        error=AgentMaxStepsError("Reached max steps.", self.logger),
        timing=Timing(start_time=action_step_start_time, end_time=time.time()),
        token_usage=final_answer.token_usage,
    )
    final_memory_step.action_output = final_answer.content
    self._finalize_step(final_memory_step)
    self.memory.steps.append(final_memory_step)
    return final_answer.content
```

---

## 7. Planning 系统（源码实读）

### 7.1 初始 Plan

```python
if is_first_plan:
    input_messages = [
        ChatMessage(
            role=MessageRole.USER,
            content=[{
                "type": "text",
                "text": populate_template(
                    self.prompt_templates["planning"]["initial_plan"],
                    variables={"task": task, "tools": self.tools, "managed_agents": self.managed_agents},
                ),
            }],
        )
    ]
    if self.stream_outputs and hasattr(self.model, "generate_stream"):
        plan_message_content = ""
        output_stream = self.model.generate_stream(input_messages, stop_sequences=["<end_plan>"])
        for event in output_stream:
            if event.content is not None:
                plan_message_content += event.content
                live.update(Markdown(plan_message_content))
```

**关键**: `stop_sequences=["<end_plan>"]` 控制 plan 生成终止。

### 7.2 Plan 更新

```python
else:
    memory_messages = self.write_memory_to_messages(summary_mode=True)
    plan_update_pre = ChatMessage(role=MessageRole.SYSTEM, content=[...])
    plan_update_post = ChatMessage(
        role=MessageRole.USER,
        content=[{
            "type": "text",
            "text": populate_template(
                self.prompt_templates["planning"]["update_plan_post_messages"],
                variables={
                    "task": task,
                    "tools": self.tools,
                    "managed_agents": self.managed_agents,
                    "remaining_steps": (self.max_steps - step),
                },
            ),
        }],
    )
    input_messages = [plan_update_pre] + memory_messages + [plan_update_post]
```

**设计要点**: 更新 plan 时使用 `summary_mode=True` 移除 system prompt 和之前的 planning 消息，避免影响新 plan。

---

## 8. LocalPythonExecutor — AST 级安全沙箱（源码实读）

### 8.1 核心常量

```python
DEFAULT_MAX_LEN_OUTPUT = 50000
MAX_OPERATIONS = 10000000          # 1000万次操作
MAX_WHILE_ITERATIONS = 1000000     # 100万次循环
MAX_EXECUTION_TIME_SECONDS = 30
ALLOWED_DUNDER_METHODS = ["__init__", "__str__", "__repr__"]
```

### 8.2 危险模块黑名单

```python
DANGEROUS_MODULES = [
    "builtins", "io", "multiprocessing", "os", "pathlib",
    "pty", "shutil", "socket", "subprocess", "sys",
]

DANGEROUS_FUNCTIONS = [
    "builtins.compile", "builtins.eval", "builtins.exec",
    "builtins.globals", "builtins.locals", "builtins.__import__",
    "os.popen", "os.system", "posix.system",
]
```

### 8.3 基础工具白名单

```python
BASE_PYTHON_TOOLS = {
    "print": custom_print,  # 捕获到 PrintContainer
    "isinstance": isinstance,
    "range": range, "float": float, "int": int, "bool": bool,
    "str": str, "set": set, "list": list, "dict": dict, "tuple": tuple,
    "round": round, "ceil": math.ceil, "floor": math.floor,
    "log": math.log, "exp": math.exp,
    "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "asin": math.asin, "acos": math.acos, "atan": math.atan, "atan2": math.atan2,
    "degrees": math.degrees, "radians": math.radians,
    "pow": pow, "sqrt": math.sqrt,
    "len": len, "sum": sum, "max": max, "min": min, "abs": abs,
    "enumerate": enumerate, "zip": zip, "reversed": reversed, "sorted": sorted,
    "all": all, "any": any, "map": map, "filter": filter,
    "ord": ord, "chr": chr, "next": next, "iter": iter,
    "divmod": divmod, "callable": callable,
    "getattr": nodunder_getattr,  # 阻止 dunder 访问
    "hasattr": hasattr, "setattr": setattr,
    "issubclass": issubclass, "type": type, "complex": complex,
}
```

### 8.4 超时机制

```python
def timeout(timeout_seconds: int):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(func, *args, **kwargs)
                try:
                    result = future.result(timeout=timeout_seconds)
                    return result
                except FuturesTimeoutError:
                    raise ExecutionTimeoutError(
                        f"Code execution exceeded the maximum execution time of {timeout_seconds} seconds"
                    )
        return wrapper
    return decorator
```

**设计要点**: 使用 ThreadPoolExecutor 而非 signal，跨平台且线程安全。超时后线程无法强制终止，但调用方收到 TimeoutError。

### 8.5 操作计数

```python
def evaluate_ast(expression, state, static_tools, custom_tools, authorized_imports):
    if state.setdefault("_operations_count", {"counter": 0})["counter"] >= MAX_OPERATIONS:
        raise InterpreterError(
            f"Reached the max number of operations of {MAX_OPERATIONS}. "
            f"Maybe there is an infinite loop somewhere in the code..."
        )
    state["_operations_count"]["counter"] += 1
```

### 8.6 While 循环限制

```python
def evaluate_while(while_loop, state, static_tools, custom_tools, authorized_imports):
    iterations = 0
    while evaluate_ast(while_loop.test, state, ...):
        for node in while_loop.body:
            try:
                evaluate_ast(node, state, ...)
            except BreakException:
                return None
            except ContinueException:
                break
        iterations += 1
        if iterations > MAX_WHILE_ITERATIONS:
            raise InterpreterError(f"Maximum number of {MAX_WHILE_ITERATIONS} iterations in While loop exceeded")
```

### 8.7 Import 授权

```python
def check_import_authorized(import_to_check: str, authorized_imports: list[str]) -> bool:
    current_node = build_import_tree(authorized_imports)
    for part in import_to_check.split("."):
        if "*" in current_node:
            return True
        if part not in current_node:
            return False
        current_node = current_node[part]
    return True
```

### 8.8 final_answer 保护

```python
def fix_final_answer_code(code: str) -> str:
    """Sometimes an LLM can try to assign a variable to final_answer,
    which would break the final_answer() tool."""
    assignment_pattern = r"(?<!\.)(?<!\w)\bfinal_answer\s*="
    if "final_answer(" not in code or not re.search(assignment_pattern, code):
        return code  # 不修改，避免影响模型记忆

    assignment_regex = r"(?<!\.)(?<!\w)(\bfinal_answer)(\s*=)"
    code = re.sub(assignment_regex, r"final_answer_variable\2", code)

    variable_regex = r"(?<!\.)(?<!\w)(\bfinal_answer\b)(?!\s*\()"
    code = re.sub(variable_regex, "final_answer_variable", code)
    return code
```

### 8.9 FinalAnswerException

```python
class FinalAnswerException(BaseException):
    """Inherits from BaseException instead of Exception to prevent being caught
    by generic `except Exception` clauses in agent-generated code."""
    def __init__(self, value):
        self.value = value
```

### 8.10 LocalPythonExecutor 类

```python
class LocalPythonExecutor(PythonExecutor):
    """This executor evaluates Python code with restricted access to imports
    and built-in functions. It is not a security sandbox: for isolated
    execution of untrusted code, use a remote executor."""

    def __init__(
        self,
        additional_authorized_imports: list[str],
        max_print_outputs_length: int | None = None,
        additional_functions: dict[str, Callable] | None = None,
        timeout_seconds: int | None = MAX_EXECUTION_TIME_SECONDS,
    ):
        self.custom_tools = {}
        self.state = {"__name__": "__main__"}
        self.authorized_imports = list(set(BASE_BUILTIN_MODULES) | set(additional_authorized_imports))
        self._check_authorized_imports_are_installed()
        self.timeout_seconds = timeout_seconds
```

---

## 9. 远程执行器

```python
from .remote_executors import BlaxelExecutor, DockerExecutor, E2BExecutor, ModalExecutor
```

四种远程执行器，用于隔离不可信代码：
- **E2BExecutor**: E2B 云沙箱
- **ModalExecutor**: Modal 云沙箱
- **DockerExecutor**: 本地 Docker 容器
- **BlaxelExecutor**: Blaxel 沙箱

---

## 10. 序列化与 Hub 集成

### 10.1 save()

```python
def save(self, output_dir, relative_path=None):
    """自动生成:
    - tools/{tool_name}.py
    - managed_agents/{agent_name}/
    - agent.json
    - prompts.yaml
    - app.py (Gradio UI)
    - requirements.txt
    """
```

### 10.2 push_to_hub()

```python
def push_to_hub(self, repo_id, commit_message="Upload agent", private=None, token=None, create_pr=False) -> str:
```

### 10.3 from_hub()

```python
@classmethod
def from_hub(cls, repo_id, token=None, trust_remote_code=False, **kwargs):
    if not trust_remote_code:
        raise ValueError(
            "Loading an agent from Hub requires to acknowledge you trust its code: "
            "to do so, pass `trust_remote_code=True`."
        )
```

**安全设计**: 默认不信任远程代码，必须显式 `trust_remote_code=True`。

---

## 11. 超时 / 重试 / 限制汇总

| 项 | 默认 | 来源 |
|----|------|------|
| `max_steps` | **20** | agents.py MultiStepAgent.__init__ |
| `MAX_OPERATIONS` | **10,000,000** | local_python_executor.py |
| `MAX_WHILE_ITERATIONS` | **1,000,000** | local_python_executor.py |
| `MAX_EXECUTION_TIME_SECONDS` | **30** | local_python_executor.py |
| `DEFAULT_MAX_LEN_OUTPUT` | **50,000** | local_python_executor.py |
| `ALLOWED_DUNDER_METHODS` | `["__init__", "__str__", "__repr__"]` | local_python_executor.py |
| `trust_remote_code` | **False** | agents.py from_hub() |
| planning stop_sequences | `["<end_plan>"]` | agents.py |
| 状态枚举 | `"success"` / `"max_steps_error"` | agents.py RunResult |

---

## 12. 失败路径

```
LLM 输出缺少 action split_token
  → AgentParsingError（记录到 action_step.error，继续循环）

LLM 生成错误（实现 bug）
  → AgentGenerationError（直接 raise，退出循环）

工具执行异常
  → AgentToolExecutionError（记录到 action_step.error，继续循环）

Python 代码超时
  → ExecutionTimeoutError（30秒默认）

Python 操作超限
  → InterpreterError("Reached the max number of operations of 10000000...")

While 循环超限
  → InterpreterError("Maximum number of 1000000 iterations in While loop exceeded")

Import 危险模块
  → InterpreterError(f"Forbidden access to module: {name}")

访问 dunder 属性
  → InterpreterError(f"Forbidden access to dunder attribute: {name}")

调用未授权内置函数
  → InterpreterError("Invoking a builtin function that has not been explicitly added as a tool...")

max_steps 达到
  → AgentMaxStepsError + provide_final_answer() → 状态 "max_steps_error"

interrupt_switch 设置
  → AgentError("Agent interrupted.")

final_answer_checks 失败
  → AgentError(f"Check {name} failed with error: {e}")

trust_remote_code=False 时从 Hub 加载
  → ValueError("Loading an agent from Hub requires...trust_remote_code=True")
```

---

## 13. 对 openmate 的可借鉴点

### P0 — ReAct 循环标准实现
- think → act → observe 三阶段
- max_steps 上限 + max_steps_error 状态
- AgentGenerationError vs AgentError 区分（实现 bug vs 模型错误）

### P0 — Python AST 沙箱
- 操作计数（1000万）+ 循环计数（100万）+ 时间超时（30秒）
- 危险模块黑名单 + dunder 访问阻止
- Import 白名单树形匹配
- final_answer 变量名冲突自动修复

### P0 — final_answer 作为终止信号
- FinalAnswerException 继承 BaseException（不被 agent 代码的 except Exception 捕获）
- 始终注入 final_answer 工具

### P1 — Planning 间隔
- planning_interval 控制 plan 生成频率
- 更新 plan 时用 summary_mode 移除旧 plan 消息
- stop_sequences=["<end_plan>"] 控制生成终止

### P1 — Token 统计
- 每个 ActionStep/PlanningStep 独立统计
- 某些 step 缺失时整体 token_usage 置 None（不部分统计）

### P2 — 远程执行器
- E2B / Modal / Docker / Blaxel 四种后端
- LocalPythonExecutor 明确标注"不是安全沙箱"

### P2 — Hub 序列化
- save() 自动生成完整可部署包
- trust_remote_code 默认 False

---

## 14. 源码锚点速查

```
src/smolagents/agents.py
  class MultiStepAgent(ABC)
    __init__: max_steps=20, planning_interval=None
    _setup_tools(): final_answer 始终注入
    _setup_managed_agents(): name+description 必须
    _validate_tools_and_managed_agents(): 名称唯一性
    run(): stream/reset/images/additional_args/max_steps
    _run_stream(): ReAct 主循环
    _handle_max_steps_reached(): provide_final_answer + AgentMaxStepsError
    _generate_planning_step(): stop_sequences=["<end_plan>"]
    _validate_final_answer(): final_answer_checks
    _finalize_step(): timing + step_callbacks
    provide_final_answer(): 最终答案生成
    interrupt(): interrupt_switch = True
    write_memory_to_messages(): summary_mode 控制
    save() / to_dict() / from_dict() / from_hub() / from_folder() / push_to_hub()
  class RunResult
    state: Literal["success", "max_steps_error"]

src/smolagents/local_python_executor.py
  DEFAULT_MAX_LEN_OUTPUT = 50000
  MAX_OPERATIONS = 10000000
  MAX_WHILE_ITERATIONS = 1000000
  MAX_EXECUTION_TIME_SECONDS = 30
  ALLOWED_DUNDER_METHODS = ["__init__", "__str__", "__repr__"]
  DANGEROUS_MODULES = [...]
  DANGEROUS_FUNCTIONS = [...]
  BASE_PYTHON_TOOLS = {...}
  class FinalAnswerException(BaseException)
  class LocalPythonExecutor(PythonExecutor)
  fix_final_answer_code()
  check_import_authorized()
  evaluate_ast() 操作计数
  evaluate_while() 循环限制
  timeout() ThreadPoolExecutor 超时
```

---

## 15. 参考链接

- https://github.com/huggingface/smolagents
- https://huggingface.co/docs/smolagents
