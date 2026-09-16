# Semantic Kernel 源代码深度研究

研究时间：2026-09-16 04:15
源码：github.com/microsoft/semantic-kernel（28.6k stars）

## 已读源代码文件

### 1. semantic_kernel/functions/kernel_function.py
- KernelFunction核心实现
- 属性：name, plugin_name, description, is_prompt, parameters, return_parameter
- from_prompt()：从提示词创建函数
- invoke()：调用函数
- as_agent_framework_tool()：转换为agent框架工具
- 模板格式：KernelPromptTemplate, HandlebarsPromptTemplate, Jinja2PromptTemplate
- 遥测：invocation_duration_histogram, streaming_duration_histogram
- 关键设计：函数基类+模板+遥测+agent工具转换

### 2. semantic_kernel/connectors/ai/chat_completion_client_base.py
- ChatCompletionClientBase核心实现
- SUPPORTS_FUNCTION_CALLING：是否支持函数调用
- get_chat_message_contents()：获取聊天消息
- 自动函数调用循环：maximum_auto_invoke_attempts
- FunctionChoiceBehavior：函数选择行为
- OpenTelemetry追踪：tracer, span
- 关键设计：聊天完成+函数调用+自动循环+追踪

### 3. semantic_kernel/agents/chat_completion/chat_completion_agent.py
- ChatCompletionAgent核心实现
- 继承：DeclarativeSpecMixin, Agent
- ChatHistoryAgentThread：聊天历史线程
- function_choice_behavior：函数选择行为
- channel_type：ChatHistoryChannel
- format_instructions()：格式化指令
- _prepare_agent_chat_history()：准备聊天历史
- 关键设计：agent+线程+函数选择+通道

## 核心架构发现

### 1. 函数系统
- KernelFunction：函数基类
- 模板格式：Kernel/Handlebars/Jinja2
- 遥测：OpenTelemetry histogram
- agent工具转换：as_agent_framework_tool()

### 2. 聊天完成系统
- ChatCompletionClientBase：基类
- 函数调用：自动循环+最大尝试次数
- FunctionChoiceBehavior：函数选择行为
- 追踪：OpenTelemetry span

### 3. Agent系统
- ChatCompletionAgent：聊天完成agent
- ChatHistoryAgentThread：聊天历史线程
- ChatHistoryChannel：聊天历史通道
- 格式化指令：format_instructions()

### 4. 线程系统
- AgentThread：线程基类
- _create()/_delete()：创建/删除
- _on_new_message()：新消息回调
- get_messages()：获取消息
- reduce()：压缩历史

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 函数系统 | ❌ | ❌ | 大 | KernelFunction+模板+遥测 |
| 聊天完成系统 | ❌ | ❌ | 大 | ChatCompletionClientBase+函数调用 |
| Agent系统 | ❌ | ❌ | 大 | ChatCompletionAgent+线程+通道 |
| 线程系统 | ❌ | ❌ | 大 | AgentThread+创建/删除/压缩 |
| 自动函数调用 | ❌ | ❌ | 大 | 自动循环+最大尝试次数 |

## 可复用设计

1. **函数系统**：KernelFunction+模板格式（Kernel/Handlebars/Jinja2）+遥测
2. **聊天完成系统**：ChatCompletionClientBase+函数调用+自动循环
3. **Agent系统**：ChatCompletionAgent+线程+通道
4. **线程系统**：AgentThread+创建/删除/压缩
5. **自动函数调用**：自动循环+最大尝试次数+FunctionChoiceBehavior
