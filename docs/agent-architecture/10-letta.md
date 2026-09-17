# 10. Letta (MemGPT) 架构深度分析

> **项目**: [letta-ai/letta](https://github.com/letta-ai/letta) | **Stars**: 24.6K | **License**: Apache 2.0
> **定位**: 有状态 AI Agent 平台——具有高级记忆系统，能够随时间学习和自我改进
> **前身**: MemGPT（UC Berkeley BAIR 实验室研究成果）
> **当前状态**: V1 服务器代码归档于此仓库 `archive` 分支，新代码已迁移至 `letta-ai/letta-code`

---

## 1. 整体架构哲学：LLM 即操作系统

Letta 的核心理念源自 MemGPT 论文——将 LLM 视为操作系统的内核，Agent 就是运行在这个操作系统上的进程。系统采用分层记忆架构，灵感来自计算机体系结构中的虚拟内存管理：

- **核心记忆（Core Memory）** → 寄存器/L1 缓存：始终在上下文窗口内
- **对话记忆（Recall Memory）** → RAM：可搜索的历史对话
- **归档记忆（Archival Memory）** → 磁盘：长期向量存储
- **文件系统（Filesystem）** → 外部存储：Git 版本化的文件

```python
class ContextWindowOverview(BaseModel):
    """Overview of the context window, including the number of messages and tokens."""
    context_window_size_max: int = Field(..., description="The maximum amount of tokens the context window can hold.")
    context_window_size_current: int = Field(..., description="The current number of tokens in the context window.")
    num_messages: int = Field(..., description="The number of messages in the context window.")
    num_archival_memory: int = Field(..., description="The number of messages in the archival memory.")
    num_recall_memory: int = Field(..., description="The number of messages in the recall memory.")
    num_tokens_external_memory_summary: int = Field(..., description="The number of tokens in the external memory summary.")
    num_tokens_system: int = Field(..., description="The number of tokens in the system prompt.")
    num_tokens_core_memory: int = Field(..., description="The number of tokens in the core memory.")
    num_tokens_memory_filesystem: int = Field(0, description="The number of tokens in the memory filesystem section.")
    num_tokens_summary_memory: int = Field(..., description="The number of tokens in the summary memory.")
    num_tokens_functions_definitions: int = Field(..., description="The number of tokens in the functions definitions.")
```

这个 `ContextWindowOverview` 精确追踪上下文窗口中每个组成部分的 token 消耗，类似于操作系统的内存使用报告。

---

## 2. Agent 类型体系：多形态 Agent 设计

Letta 定义了丰富的 Agent 类型枚举，每种类型对应不同的运行时行为和工具集：

```python
class AgentType(str, Enum):
    """Enum to represent the type of agent."""
    memgpt_agent = "memgpt_agent"          # 原版 MemGPT 工具集
    memgpt_v2_agent = "memgpt_v2_agent"    # MemGPT 风格，重新设计
    letta_v1_agent = "letta_v1_agent"      # 简化的 MemGPT 循环，无心跳或强制工具调用
    react_agent = "react_agent"            # 基础 ReAct 代理，无记忆工具
    workflow_agent = "workflow_agent"       # 带自动清除消息缓冲的工作流
    split_thread_agent = "split_thread_agent"
    sleeptime_agent = "sleeptime_agent"    # 睡眠时间计算代理
    voice_convo_agent = "voice_convo_agent"
    voice_sleeptime_agent = "voice_sleeptime_agent"
```

这种设计体现了 Letta 从单一 MemGPT 向多种 Agent 模式演进的过程。`memgpt_agent` 是经典的"心跳+工具调用"循环；`letta_v1_agent` 简化了这个循环；`react_agent` 则是标准的 ReAct 模式；`sleeptime_agent` 引入了"睡眠时间计算"——让 Agent 在空闲时进行记忆整理。

---

## 3. Agent 运行循环：step → inner_step 的双层设计

Agent 的执行循环采用双层设计，外层 `step()` 管理链式调用（chaining），内层 `inner_step()` 执行单次 LLM 交互：

```python
def step(self, input_messages: List[MessageCreate],
         chaining: bool = True, max_chaining_steps: Optional[int] = None,
         put_inner_thoughts_first: bool = True, **kwargs) -> LettaUsageStatistics:
    """Run Agent.step in a loop, handling chaining via heartbeat requests and function failures"""
    self.tool_rules_solver.clear_tool_history()
    next_input_messages = convert_message_creates_to_messages(input_messages, self.agent_state.id, self.agent_state.timezone)
    counter = 0
    total_usage = UsageStatistics()
    step_count = 0
    function_failed = False
    steps_messages = []
    while True:
        step_response = self.inner_step(messages=next_input_messages,
                                         put_inner_thoughts_first=put_inner_thoughts_first, **kwargs)
        heartbeat_request = step_response.heartbeat_request
        function_failed = step_response.function_failed
        token_warning = step_response.in_context_memory_warning
        step_count += 1
        total_usage += step_response.usage

        # 链式调用停止条件
        if not chaining:
            break
        elif max_chaining_steps is not None and counter > max_chaining_steps:
            break
        # 处理 token 警告 → 注入警告消息并继续
        elif token_warning and summarizer_settings.send_memory_warning_message:
            next_input_messages = [Message.dict_to_message(
                agent_id=self.agent_state.id, model=self.model,
                openai_message_dict={"role": "user", "content": get_token_limit_warning()})]
            continue
        # 处理函数失败 → 注入心跳消息并继续
        elif function_failed:
            next_input_messages = [Message.dict_to_message(
                agent_id=self.agent_state.id, model=self.model,
                openai_message_dict={"role": "user", "content": get_heartbeat(self.agent_state.timezone, FUNC_FAILED_HEARTBEAT_MESSAGE)})]
            continue
        # 处理心跳请求 → 注入心跳消息并继续
        elif heartbeat_request:
            next_input_messages = [Message.dict_to_message(
                agent_id=self.agent_state.id, model=self.model,
                openai_message_dict={"role": "user", "content": get_heartbeat(self.agent_state.timezone, REQ_HEARTBEAT_MESSAGE)})]
            continue
        else:
            break
    return LettaUsageStatistics(**total_usage.model_dump(), step_count=step_count, steps_messages=steps_messages)
```

**关键设计**：心跳（heartbeat）机制是 MemGPT 的核心创新——当 Agent 调用工具并设置 `request_heartbeat=True` 时，外层循环会自动注入一条心跳消息，触发下一轮 LLM 调用，实现多步工具链式执行。

---

## 4. 内部单步执行：inner_step 的六步流程

`inner_step` 是 Agent 的核心执行单元，每一步都遵循严格的六步流程：

```python
def inner_step(self, messages: List[Message], ...) -> AgentStepResponse:
    """Runs a single step in the agent loop (generates at most one LLM call)"""
    step_id = generate_step_id()

    # Step 0: 更新核心记忆（从 DB 读取最新 block 数据）
    current_persisted_memory = Memory(
        blocks=[self.block_manager.get_block_by_id(block.id, actor=self.user)
                for block in self.agent_state.memory.get_blocks()],
        file_blocks=self.agent_state.memory.file_blocks,
        agent_type=self.agent_state.agent_type,
    )
    self.update_memory_if_changed(current_persisted_memory)

    # Step 1: 准备输入消息序列（上下文消息 + 新消息）
    in_context_messages = self.agent_manager.get_in_context_messages(
        agent_id=self.agent_state.id, actor=self.user)
    input_message_sequence = in_context_messages + messages

    # Step 2: 调用 LLM 获取回复
    response = self._get_ai_reply(message_sequence=input_message_sequence, ...)

    # Step 3-5: 处理 AI 回复（工具调用、执行、结果回传）
    response_message = response.choices[0].message
    all_response_messages, heartbeat_request, function_failed = self._handle_ai_response(response_message, ...)

    # Step 6: 内存压力检测
    current_total_tokens = response.usage.total_tokens
    if current_total_tokens > summarizer_settings.memory_warning_threshold * int(self.agent_state.llm_config.context_window):
        if not self.agent_alerted_about_memory_pressure:
            active_memory_warning = True
            self.agent_alerted_about_memory_pressure = True
```

Step 0 的记忆同步机制确保了多 Agent 共享 Block 时的一致性——每次执行前都从数据库重新读取最新状态。

---

## 5. 记忆系统：Block 与 Memory 的协作

Letta 的记忆系统基于 `Block` 概念——每个 Block 是一个带标签、描述和大小限制的文本块，Agent 可以通过工具主动编辑这些 Block：

```python
class AgentState(OrmMetadataBase, validate_assignment=True):
    """Representation of an agent's state. Persisted in the DB backend."""
    id: str = Field(..., description="The id of the agent. Assigned by the database.")
    name: str = Field(..., description="The name of the agent.")
    system: str = Field(..., description="The system prompt used by the agent.")
    agent_type: AgentType = Field(..., description="The type of agent.")
    memory: Memory = Field(..., description="The in-context memory of the agent.")
    blocks: List[Block] = Field(..., description="The memory blocks used by the agent.")
    tools: List[Tool] = Field(..., description="The tools used by the agent.")
    message_ids: Optional[List[str]] = Field(default=None,
        description="The ids of the messages in the agent's in-context memory.")
    llm_config: LLMConfig = Field(..., description="The LLM configuration used by the agent.")
    message_buffer_autoclear: bool = Field(False,
        description="If True, agent will not remember previous messages (but retains core memory blocks and archival/recall memory).")
    enable_sleeptime: Optional[bool] = Field(None,
        description="If True, memory management will move to a background agent thread.")
```

记忆更新采用"脏检查"模式——对比新旧 Memory 的 `compile()` 输出，只在有变化时才写入数据库：

```python
def update_memory_if_changed(self, new_memory: Memory) -> bool:
    """Update internal memory object and system prompt if there have been modifications."""
    system_message = self.message_manager.get_message_by_id(
        message_id=self.agent_state.message_ids[0], actor=self.user)
    if new_memory.compile() not in system_message.content[0].text:
        for label in self.agent_state.memory.list_block_labels():
            updated_value = new_memory.get_block(label).value
            if updated_value != self.agent_state.memory.get_block(label).value:
                block_id = self.agent_state.memory.get_block(label).id
                self.block_manager.update_block(block_id=block_id,
                    block_update=BlockUpdate(value=updated_value), actor=self.user)
        # 从 DB 刷新内存
        self.agent_state.memory = Memory(
            blocks=[self.block_manager.get_block_by_id(block.id, actor=self.user)
                    for block in self.agent_state.memory.get_blocks()],
            file_blocks=self.agent_state.memory.file_blocks,
            agent_type=self.agent_state.agent_type,
        )
        self.agent_state = self.agent_manager.rebuild_system_prompt(
            agent_id=self.agent_state.id, actor=self.user)
        return True
    return False
```

---

## 6. 消息摘要与上下文压缩

当上下文窗口接近容量上限时，Letta 触发摘要机制压缩历史消息。`memory.py` 中的 `summarize_messages` 函数负责此操作：

```python
def get_memory_functions(cls: Memory) -> Dict[str, Callable]:
    """Get memory functions for a memory class"""
    functions = {}
    base_functions = []
    for func_name in dir(Memory):
        funct = getattr(Memory, func_name)
        if callable(funct):
            base_functions.append(func_name)
    for func_name in dir(cls):
        if func_name.startswith("_") or func_name in ["load", "to_dict"]:
            continue
        if func_name in base_functions:
            continue
        func = getattr(cls, func_name)
        if not callable(func):
            continue
        functions[func_name] = func
    return functions
```

这个机制允许开发者通过继承 `Memory` 类来自定义记忆函数，Letta 会自动发现并注册这些函数作为 Agent 的工具。摘要过程使用专用的 `SUMMARY_PROMPT_SYSTEM` 提示词，将长对话历史压缩为简明摘要。

---

## 7. 工具执行与沙箱隔离

工具执行通过 `ToolExecutionSandbox` 实现沙箱隔离，支持 Composio 集成和 MCP 工具：

```python
class Agent(BaseAgent):
    def __init__(self, interface, agent_state: AgentState, user: User, ...):
        # 状态管理器
        self.block_manager = BlockManager()
        self.message_manager = MessageManager()
        self.passage_manager = PassageManager()
        self.provider_manager = ProviderManager()
        self.agent_manager = AgentManager()
        self.job_manager = JobManager()
        self.step_manager = StepManager()
        self.telemetry_manager = TelemetryManager() if settings.llm_api_logging else NoopTelemetryManager()
        # 工具规则求解器
        self.tool_rules_solver = ToolRulesSolver(tool_rules=agent_state.tool_rules)
```

工具调用结果通过 `ToolExecutionResult` 返回，包含状态、标准输出和标准错误：

```python
tool_execution_result = self.execute_tool_and_persist_state(function_name, function_args, target_letta_tool)
function_response = tool_execution_result.func_return

if tool_execution_result and tool_execution_result.status == "error":
    tool_return = ToolReturn(
        status=tool_execution_result.status,
        stdout=tool_execution_result.stdout,
        stderr=tool_execution_result.stderr
    )
    messages = self._handle_function_error_response(function_response, tool_call_id,
        function_name, function_args, function_response, messages, [tool_return], group_id=group_id)
    return messages, False, True  # force a heartbeat to allow agent to handle error
```

---

## 8. 工具规则引擎：ToolRulesSolver

Letta 引入了 `ToolRulesSolver` 来约束 Agent 的工具调用序列，这是传统 ReAct 框架不具备的能力：

```python
# 工具规则约束下的可用工具过滤
allowed_tool_names = self.tool_rules_solver.get_allowed_tool_names(
    available_tools=available_tools,
    last_function_response=self.last_function_response
) or list(available_tools)

# 终止工具检测
terminal_tool_names = {rule.tool_name for rule in self.tool_rules_solver.terminal_tool_rules}

# 根据工具规则更新心跳请求
if self.tool_rules_solver.has_children_tools(function_name):
    heartbeat_request = True
elif self.tool_rules_solver.is_terminal_tool(function_name):
    heartbeat_request = False

if self.tool_rules_solver.is_continue_tool(function_name):
    heartbeat_request = True
```

这允许开发者定义 Agent 的工具调用图——哪些工具必须按顺序调用、哪些是终止工具、哪些触发继续执行。

---

## 9. 结构化输出与错误处理

Letta 支持结构化输出，并实现了健壮的重试和错误处理机制：

```python
def _get_ai_reply(self, message_sequence, ..., empty_response_retry_limit=3,
                  backoff_factor=0.5, max_delay=10.0, ...) -> ChatCompletionResponse | None:
    """Get response from LLM API with robust retry mechanism."""
    for attempt in range(1, empty_response_retry_limit + 1):
        try:
            llm_client = LLMClient.create(
                provider_type=self.agent_state.llm_config.model_endpoint_type,
                put_inner_thoughts_first=put_inner_thoughts_first, actor=self.user)
            if llm_client and not stream:
                response = llm_client.send_llm_request(
                    messages=message_sequence, llm_config=self.agent_state.llm_config,
                    tools=allowed_functions, force_tool_call=force_tool_call, ...)
            else:
                response = create(llm_config=self.agent_state.llm_config,
                    messages=message_sequence, functions=allowed_functions, ...)

            if response.choices[0].finish_reason == "length":
                raise RuntimeError("Finish reason was length (maximum context length)")
        except ValueError as ve:
            if attempt >= empty_response_retry_limit:
                raise Exception(f"Retries exhausted: {ve}")
            delay = min(backoff_factor * (2 ** (attempt - 1)), max_delay)
            time.sleep(delay)
            continue

    # 检查是否超出上下文窗口 → 触发摘要
    if response.usage.total_tokens > self.agent_state.llm_config.context_window:
        self.summarize_messages_inplace()
```

错误处理分三级：函数名不存在 → JSON 解析失败 → 执行异常，每级都返回错误消息并强制心跳让 Agent 有机会自我修复。

---

## 10. 多 Agent 协作与 Sleeptime 计算

Letta 的 `AgentState` 原生支持多 Agent 协作和"睡眠时间计算"模式：

```python
class AgentState(OrmMetadataBase):
    # 多 Agent 组管理
    multi_agent_group: Optional[Group] = Field(None,
        description="The multi-agent group that this agent manages.")
    managed_group: Optional[Group] = Field(None,
        description="The multi-agent group that this agent manages")
    identities: List[Identity] = Field([],
        description="The identities associated with this agent.")
    # 睡眠时间计算
    enable_sleeptime: Optional[bool] = Field(None,
        description="If set to True, memory management will move to a background agent thread.")
    # 运行指标
    last_run_completion: Optional[datetime] = Field(None,
        description="The timestamp when the agent last completed a run.")
    last_run_duration_ms: Optional[int] = Field(None,
        description="The duration in milliseconds of the agent's last run.")
    last_stop_reason: Optional[StopReasonType] = Field(None,
        description="The stop reason from the agent's last run.")
```

`CreateAgent` 中的 `include_multi_agent_tools` 参数控制是否加载多 Agent 工具：

```python
class CreateAgent(BaseModel):
    include_multi_agent_tools: bool = Field(False,
        description="If true, attaches the Letta multi-agent tools (e.g. sending a message to another agent).")
    enable_sleeptime: Optional[bool] = Field(None,
        description="If set to True, memory management will move to a background agent thread.")
```

Sleeptime 模式是 Letta 2025 年引入的重要特性——让 Agent 在空闲时（"睡眠"期间）进行记忆整理、知识压缩和自我改进，而不是在推理时消耗计算资源。这与 MemGPT 论文中的"睡眠时间计算"概念一脉相承。

---

## 总结：对 OpenMate 的启示

| 维度 | Letta 方案 | 可借鉴之处 |
|------|-----------|-----------|
| 记忆架构 | Block + Memory 的分层记忆 | 核心记忆始终在上下文中，历史可压缩 |
| Agent 循环 | step → inner_step 双层 | 外层管链式调用，内层管单次 LLM 交互 |
| 心跳机制 | request_heartbeat 触发自动链式执行 | Agent 自主决定是否继续执行 |
| 工具约束 | ToolRulesSolver 规则引擎 | 限制工具调用图，比 ReAct 更可控 |
| 记忆更新 | 脏检查 + DB 同步 | 只在变化时写入，支持多 Agent 共享 |
| 上下文压缩 | 摘要 + 内存压力检测 | 自动检测并压缩，避免超限 |
| 错误处理 | 三级错误 + 重试 + 心跳恢复 | Agent 可以自我修复错误 |
| 类型体系 | 9 种 Agent 类型 | 不同场景用不同类型 |
| 睡眠计算 | sleeptime_agent | 空闲时记忆整理 |
| 多 Agent | Group + Identity + 工具 | 原生多 Agent 协作支持 |
