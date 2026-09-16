# Smolagents 源代码深度研究

研究时间：2026-09-16 03:35
源码：github.com/huggingface/smolagents（24000 stars）

## 已读源代码文件

### 1. smolagents/agents.py
- MultiStepAgent核心实现
- 抽象基类：run(), step()
- CodeAgent：代码执行agent
- ToolCallingAgent：工具调用agent
- PromptTemplates：提示词模板（system_prompt, planning, managed_agent, final_answer）
- RunResult：运行结果（output, state, steps, token_usage, timing）
- populate_template()：Jinja2模板渲染
- 关键设计：抽象基类+两种agent+模板+结果

### 2. smolagents/tools.py
- Tool核心实现
- BaseTool：抽象基类
- Tool：具体工具类
- 属性：name, description, inputs, output_type, output_schema
- validate_arguments()：参数验证
- PipelineTool：Transformer模型工具
- 装饰器：@tool
- 关键设计：工具基类+类型验证+HuggingFace集成

### 3. smolagents/models.py
- Model核心实现
- ChatMessage：消息（role, content, tool_calls, raw, token_usage）
- MessageRole：USER/ASSISTANT/SYSTEM/TOOL_CALL/TOOL_RESPONSE
- ChatMessageToolCall：工具调用
- CODEAGENT_RESPONSE_FORMAT：JSON schema
- LiteLLMModel：LiteLLM集成
- 关键设计：消息格式+工具调用+多模型支持

### 4. smolagents/memory.py
- AgentMemory核心实现
- MemoryStep：记忆步骤基类
- ActionStep：动作步骤（step_number, timing, tool_calls, error, model_output, code_action, observations）
- PlanningStep：规划步骤
- FinalAnswerStep：最终答案步骤
- CallbackRegistry：回调注册
- 关键设计：步骤记忆+回调+序列化

## 核心架构发现

### 1. 步骤记忆系统
- MemoryStep：步骤基类
- ActionStep：动作步骤（tool_calls, observations, error）
- PlanningStep：规划步骤
- FinalAnswerStep：最终答案
- to_messages()：转换为消息格式

### 2. 工具系统
- Tool：工具基类
- @tool装饰器：函数转工具
- 参数验证：类型+描述
- HuggingFace集成：PipelineTool

### 3. 模型抽象
- Model：模型基类
- ChatMessage：统一消息格式
- MessageRole：角色枚举
- 多模型支持：OpenAI/Anthropic/LiteLLM

### 4. 回调系统
- CallbackRegistry：回调注册
- 按步骤类型注册
- 支持1参数或2参数回调

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 步骤记忆系统 | ❌ | ❌ | 大 | MemoryStep+ActionStep+PlanningStep |
| @tool装饰器 | ❌ | ❌ | 大 | 函数→工具自动转换 |
| 回调系统 | ❌ | ❌ | 大 | CallbackRegistry+按步骤注册 |
| 统一消息格式 | ❌ | ❌ | 中 | ChatMessage+MessageRole |
| Jinja2模板 | ❌ | ❌ | 中 | populate_template() |

## 可复用设计

1. **步骤记忆系统**：MemoryStep+ActionStep+PlanningStep+FinalAnswerStep
2. **@tool装饰器**：函数→工具自动转换+类型验证
3. **回调系统**：CallbackRegistry+按步骤类型注册
4. **统一消息格式**：ChatMessage+MessageRole+工具调用
5. **Jinja2模板**：提示词模板+变量替换
