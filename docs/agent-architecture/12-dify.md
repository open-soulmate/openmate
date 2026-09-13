# Dify Agent 架构深度分析

> 基于 [langgenius/dify](https://github.com/langgenius/dify) 源码分析（154k+ Stars，24.4k Forks）
> 分析源码：`api/core/agent/base_agent_runner.py`、`api/core/agent/cot_agent_runner.py`、`api/core/tools/tool_manager.py`

---

## 1. 项目概览与技术栈

Dify 是一个开源 LLM 应用开发平台，提供 AI 工作流、RAG 管道、Agent 能力、模型管理和可观测性。后端使用 Python（Flask + SQLAlchemy），前端使用 Next.js，支持 Docker Compose 一键部署。

```python
# 项目结构（从仓库目录可见）
# api/          — Python 后端核心（Agent、工具、模型运行时）
# web/          — Next.js 前端
# docker/       — Docker Compose 部署
# dify-agent/   — 独立 Agent 运行时
# dify-agent-runtime/ — Agent 运行时包
# sdks/         — 多语言 SDK
# packages/     — 共享包
```

Dify 的 Agent 系统基于 `graphon` 模型运行时抽象层，支持数百种 LLM 提供商，通过统一的 `PromptMessage` 体系与模型交互。

---

## 2. Agent 继承体系——三层架构

Dify 的 Agent 采用清晰的三层继承结构：`AppRunner → BaseAgentRunner → CotAgentRunner`。

```python
# base_agent_runner.py — Agent 基类继承自 AppRunner
class BaseAgentRunner(AppRunner):
    def __init__(
        self,
        *,
        session: Session,
        tenant_id: str,
        application_generate_entity: AgentChatAppGenerateEntity,
        conversation: Conversation,
        app_config: AgentChatAppConfig,
        model_config: ModelConfigWithCredentialsEntity,
        config: AgentEntity,
        queue_manager: AppQueueManager,
        message: Message,
        user_id: str,
        model_instance: ModelInstance,
        memory: TokenBufferMemory | None = None,
        prompt_messages: list[PromptMessage] | None = None,
    ):
```

`BaseAgentRunner` 封装了所有 Agent 共享的基础设施：模型实例管理、工具初始化、历史消息组织、Agent Thought 持久化。`CotAgentRunner` 则实现了具体的 ReAct 推理循环。这种分层设计使得新增 Agent 策略（如 Function Calling Agent）只需继承基类并实现 `run()` 方法。

---

## 3. CoT/ReAct 推理循环

`CotAgentRunner.run()` 是 Dify Agent 的核心执行引擎，实现了经典的 ReAct（Reasoning + Acting）循环：

```python
# cot_agent_runner.py — ReAct 核心循环
while function_call_state and iteration_step <= max_iteration_steps:
    function_call_state = False
    if iteration_step == max_iteration_steps:
        # 最后一轮迭代，移除所有工具，强制生成最终答案
        self._prompt_messages_tools = []

    # 重新组织 prompt 消息
    prompt_messages = self._organize_prompt_messages()
    self.recalc_llm_max_tokens(self.model_config, prompt_messages)

    # 调用 LLM（流式）
    chunks = model_instance.invoke_llm(
        prompt_messages=prompt_messages,
        model_parameters=app_generate_entity.model_conf.parameters,
        tools=[],
        stop=app_generate_entity.model_conf.stop,
        stream=True,
        callbacks=[],
        request_metadata=request_metadata,
    )

    # 使用 ReAct 输出解析器处理流式输出
    react_chunks = CotAgentOutputParser.handle_react_stream_output(chunks, usage_dict)
```

关键设计点：当达到最大迭代次数时，Dify 会清空工具列表（`self._prompt_messages_tools = []`），强制 LLM 生成最终答案而非继续调用工具。如果此时模型仍尝试调用工具，则抛出 `AgentMaxIterationError`：

```python
# 检查最大迭代限制
if iteration_step == max_iteration_steps and scratchpad.action:
    if scratchpad.action.action_name.lower() != "final answer":
        raise AgentMaxIterationError(app_config.agent.max_iteration)
```

---

## 4. Scratchpad 状态管理

Dify 使用 `AgentScratchpadUnit` 来管理每轮推理的状态，包含思考（thought）、动作（action）和观察（observation）三个核心字段：

```python
# cot_agent_runner.py — Scratchpad 状态追踪
scratchpad = AgentScratchpadUnit(
    agent_response="",
    thought="",
    action_str="",
    observation="",
    action=None,
)

for chunk in react_chunks:
    if isinstance(chunk, AgentScratchpadUnit.Action):
        action = chunk
        scratchpad.agent_response += json.dumps(chunk.model_dump())
        scratchpad.action_str = json.dumps(chunk.model_dump())
        scratchpad.action = action
    else:
        scratchpad.agent_response += chunk
        scratchpad.thought += chunk
```

流式解析过程中，文本片段累积到 `thought`，当解析出 `Action` 对象时记录到 `action`。每轮迭代结束后，scratchpad 被追加到 `_agent_scratchpad` 列表，形成完整的推理链。

```python
# 检查是否为最终答案
if scratchpad.is_final():
    # 提取 final answer
    match scratchpad.action.action_input:
        case dict():
            final_answer = json.dumps(scratchpad.action.action_input, ensure_ascii=False)
        case str():
            final_answer = scratchpad.action.action_input
```

---

## 5. 工具管理体系——六种 Provider 类型

`ToolManager` 是 Dify 工具系统的核心，支持六种不同的工具提供者类型：

```python
# tool_manager.py — 六种工具提供者类型分发
match provider_type:
    case ToolProviderType.BUILT_IN:
        # 内置工具（Google Search、DALL·E 等 50+）
        provider_controller = cls.get_builtin_provider(provider_id, tenant_id)
        builtin_tool = provider_controller.get_tool(tool_name)
        ...
    case ToolProviderType.API:
        # 用户自定义 API 工具
        api_provider, credentials = cls.get_api_provider_controller(tenant_id, provider_id)
        ...
    case ToolProviderType.WORKFLOW:
        # 工作流作为工具
        workflow_provider = session.scalar(workflow_provider_stmt)
        controller = ToolTransformService.workflow_provider_to_controller(db_provider=workflow_provider)
        ...
    case ToolProviderType.PLUGIN:
        # 插件工具
        plugin_tool = cls.get_plugin_provider(provider_id, tenant_id).get_tool(tool_name)
        ...
    case ToolProviderType.MCP:
        # MCP（Model Context Protocol）工具
        mcp_tool = cls.get_mcp_provider_controller(tenant_id, provider_id).get_tool(tool_name)
        ...
    case ToolProviderType.DATASET_RETRIEVAL:
        raise ToolProviderNotFoundError(...)
```

每种类型都有独立的 Controller 和 Tool 实现类，通过 `fork_tool_runtime()` 方法注入运行时凭证和参数。

---

## 6. 凭证管理与 OAuth 自动刷新

Dify 的凭证管理非常成熟，支持加密存储、缓存和 OAuth 自动刷新：

```python
# tool_manager.py — 凭证解密与 OAuth 自动刷新
encrypter, cache = create_provider_encrypter(
    tenant_id=tenant_id,
    config=[x.to_basic_provider_config() for x in
            provider_controller.get_credentials_schema_by_type(builtin_provider.credential_type)],
    cache=ToolProviderCredentialsCache(
        tenant_id=tenant_id, provider=provider_id, credential_id=builtin_provider.id
    ),
)
decrypted_credentials: Mapping[str, Any] = encrypter.decrypt(builtin_provider.credentials)

# OAuth 令牌过期自动刷新
if builtin_provider.expires_at != -1 and (builtin_provider.expires_at - 60) < int(time.time()):
    oauth_handler = OAuthHandler()
    refreshed_credentials = oauth_handler.refresh_credentials(
        tenant_id=tenant_id,
        user_id=builtin_provider.user_id,
        plugin_id=tool_provider.plugin_id,
        provider=provider_name,
        redirect_uri=redirect_uri,
        system_credentials=system_credentials or {},
        credentials=decrypted_credentials,
    )
    # 更新加密凭证
    builtin_provider.encrypted_credentials = json.dumps(
        encrypter.encrypt(refreshed_credentials.credentials)
    )
    builtin_provider.expires_at = refreshed_credentials.expires_at
```

在令牌过期前 60 秒自动触发刷新，避免运行时中断。刷新后的凭证重新加密存储。

---

## 7. 插件系统与 Provider 发现

Dify 的插件系统通过 `PluginToolProviderController` 实现，使用双重检查锁保证线程安全：

```python
# tool_manager.py — 插件 Provider 发现（双重检查锁）
@classmethod
def get_plugin_provider(cls, provider: str, tenant_id: str) -> PluginToolProviderController:
    plugin_tool_providers = contexts.plugin_tool_providers.get()
    if provider in plugin_tool_providers:
        return plugin_tool_providers[provider]

    with contexts.plugin_tool_providers_lock.get():
        # 双重检查
        plugin_tool_providers = contexts.plugin_tool_providers.get()
        if provider in plugin_tool_providers:
            return plugin_tool_providers[provider]

        manager = PluginToolManager()
        provider_entity = manager.fetch_tool_provider(tenant_id, provider)
        if not provider_entity:
            raise ToolProviderNotFoundError(f"plugin provider {provider} not found")

        controller = PluginToolProviderController(
            entity=provider_entity.declaration,
            plugin_id=provider_entity.plugin_id,
            plugin_unique_identifier=provider_entity.plugin_unique_identifier,
            tenant_id=tenant_id,
        )
        plugin_tool_providers[provider] = controller
        return controller
```

插件 Provider 被缓存在 `contexts.plugin_tool_providers` 上下文中，避免重复加载。内置 Provider 则通过 `load_hardcoded_providers_cache()` 在启动时一次性加载到 `_hardcoded_providers` 字典。

---

## 8. Agent Thought 持久化与可观测性

Dify 将 Agent 的每一步推理都持久化到数据库，形成完整的可观测链路：

```python
# base_agent_runner.py — 创建 Agent Thought
def create_agent_thought(self, message_id, message, tool_name, tool_input, messages_ids) -> str:
    thought = MessageAgentThought(
        message_id=message_id,
        thought="",
        tool=tool_name,
        tool_input=tool_input,
        message=message,
        message_token=0,
        message_unit_price=Decimal(0),
        answer="",
        observation="",
        tokens=0,
        total_price=Decimal(0),
        position=self.agent_thought_count + 1,
        currency="USD",
        latency=0,
    )
    db.session.add(thought)
    db.session.commit()
```

每次工具调用后，`save_agent_thought()` 更新完整的 token 使用量、价格、工具标签和元数据：

```python
# base_agent_runner.py — 保存 Agent Thought（含 LLM 用量追踪）
def save_agent_thought(self, agent_thought_id, tool_name, tool_input, thought,
                       observation, tool_invoke_meta, answer, messages_ids, llm_usage=None):
    if llm_usage:
        agent_thought.message_token = llm_usage.prompt_tokens
        agent_thought.answer_token = llm_usage.completion_tokens
        agent_thought.tokens = llm_usage.total_tokens
        agent_thought.total_price = llm_usage.total_price

    # 工具标签自动解析
    labels = agent_thought.tool_labels or {}
    tools = agent_thought.tool.split(";") if agent_thought.tool else []
    for tool in tools:
        if tool not in labels:
            tool_label = ToolManager.get_tool_label(tool)
            labels[tool] = tool_label.to_dict() if tool_label else {"en_US": tool, "zh_Hans": tool}
```

这使得 Dify 的 LLMOps 面板能够展示完整的 Agent 推理链、每步的 token 消耗和成本。

---

## 9. 历史消息组织与上下文管理

`BaseAgentRunner.organize_agent_history()` 从数据库重建完整的对话历史，包括工具调用链：

```python
# base_agent_runner.py — 从数据库重建 Agent 历史
def organize_agent_history(self, prompt_messages, *, session) -> list[PromptMessage]:
    result: list[PromptMessage] = []
    for prompt_message in prompt_messages:
        if isinstance(prompt_message, SystemPromptMessage):
            result.append(prompt_message)

    messages = session.execute(
        select(Message)
        .where(Message.conversation_id == self.message.conversation_id)
        .order_by(Message.created_at.desc())
    ).scalars().all()

    for message in messages:
        if message.id == self.message.id:
            continue
        result.append(self.organize_agent_user_prompt(message, session=session))

        agent_thoughts = message.agent_thoughts_with_session(session=session)
        if agent_thoughts:
            for agent_thought in agent_thoughts:
                # 重建 ToolCall 和 ToolPromptMessage
                tool_calls.append(AssistantPromptMessage.ToolCall(
                    id=tool_call_id,
                    type="function",
                    function=AssistantPromptMessage.ToolCall.ToolCallFunction(
                        name=tool, arguments=json.dumps(tool_inputs.get(tool, {}))
                    ),
                ))
                tool_call_response.append(ToolPromptMessage(
                    content=tool_responses.get(tool, agent_thought.observation),
                    name=tool, tool_call_id=tool_call_id,
                ))
```

CotAgentRunner 进一步通过 `AgentHistoryPromptTransform` 对历史消息进行压缩和优化：

```python
# cot_agent_runner.py — 历史消息压缩
historic_prompts = AgentHistoryPromptTransform(
    model_config=self.model_config,
    prompt_messages=current_session_messages or [],
    history_messages=result,
    memory=self.memory,
).get_prompt()
```

---

## 10. 工具参数类型转换与变量池集成

`ToolManager._convert_tool_parameters_type()` 处理工具参数的类型转换，支持变量池（VariablePool）的动态绑定：

```python
# tool_manager.py — 工具参数类型转换
@classmethod
def _convert_tool_parameters_type(cls, parameters, variable_pool, tool_configurations,
                                   typ="workflow", allow_file_parameters=False, ...):
    runtime_parameters: dict[str, Any] = {}
    for parameter in parameters:
        if parameter.form == ToolParameter.ToolParameterForm.FORM:
            if variable_pool:
                config = tool_configurations.get(parameter.name, {})
                tool_input = ToolNodeData.ToolInput.model_validate(config)

                if tool_input.type == "variable":
                    # 从变量池获取值
                    variable = variable_pool.get(tool_input.value)
                    parameter_value = variable.value
                elif tool_input.type == "constant":
                    # 使用常量值
                    parameter_value = tool_input.value
                elif tool_input.type == "mixed":
                    # 混合模板解析
                    segment_group = convert_template(variable_pool, str(tool_input.value))
                    parameter_value = segment_group.text

                runtime_parameters[parameter.name] = parameter_value
        else:
            # 直接参数（用户输入）
            parameter_value = tool_configurations.get(parameter.name)
            if use_default_for_missing_form_parameters and parameter_value is None:
                if parameter.default is not None:
                    parameter_value = parameter.default
            value = parameter.init_frontend_parameter(parameter_value)
            runtime_parameters[parameter.name] = value
    return runtime_parameters
```

三种参数来源模式：
- **variable**：从 VariablePool 动态获取（工作流节点输出）
- **constant**：使用配置的固定值
- **mixed**：模板字符串，支持 `{{variable}}` 语法混合变量和文本

---

## 架构总结

| 维度 | Dify 的设计 |
|------|------------|
| **继承体系** | `AppRunner → BaseAgentRunner → CotAgentRunner`，三层分离 |
| **推理模式** | ReAct 循环（Thought → Action → Observation），最大迭代可配置 |
| **工具系统** | 六种 Provider（内置/API/工作流/插件/MCP/数据集），统一 ToolManager 调度 |
| **凭证管理** | 加密存储 + 缓存 + OAuth 自动刷新（过期前 60s） |
| **可观测性** | 每步 Agent Thought 持久化，含 token/价格/工具标签 |
| **上下文管理** | 从 DB 重建历史 + AgentHistoryPromptTransform 压缩 |
| **参数系统** | VariablePool 动态绑定 + 模板解析 + 类型安全转换 |
| **插件架构** | 双重检查锁 + 上下文缓存，线程安全的 Provider 发现 |
| **流式处理** | `CotAgentOutputParser` 流式解析 ReAct 输出，实时发布 AgentThought 事件 |
| **错误处理** | 最大迭代保护、工具不存在兜底、凭证验证失败友好提示 |

Dify 的 Agent 架构体现了「平台级」设计思维：不是单一的 Agent 实现，而是一个可扩展的 Agent 运行时框架，通过清晰的抽象层支持多种推理策略和工具生态。
