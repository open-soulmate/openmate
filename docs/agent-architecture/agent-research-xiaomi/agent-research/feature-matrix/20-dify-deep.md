# Dify 源代码深度研究

研究时间：2026-09-16 03:25
源码：github.com/langgenius/dify（121k stars）

## 已读源代码文件

### 1. core/agent/base_agent_runner.py
- BaseAgentRunner核心实现
- 继承：AppRunner
- 初始化参数：session, tenant_id, conversation, config, queue_manager, message, user_id, model_instance
- TokenBufferMemory：token缓冲记忆
- organize_agent_history()：组织历史消息
- ToolManager：工具管理
- DatasetRetrieverTool：数据集检索工具
- 关键设计：基类+会话管理+工具管理+记忆

### 2. core/agent/cot_chat_agent_runner.py
- CotChatAgentRunner — Chat模式CoT runner
- `_organize_system_prompt()` — 组织系统提示词
- 模板替换：`{{instruction}}`, `{{tools}}`, `{{tool_names}}`
- `_organize_user_query()` — 组织用户查询（支持文件/图片）
- `_organize_prompt_messages()` — 组织完整提示词
- agent_scratchpad：Thought/Action/Observation格式
- 关键设计：Chat模式+文件支持+CoT格式

### 3. core/agent/cot_completion_agent_runner.py
- CotCompletionAgentRunner — Completion模式CoT runner
- `_organize_instruction_prompt()` — 组织指令提示词
- `_organize_historic_prompt()` — 组织历史提示词
- 模板：`{{historic_messages}}`, `{{agent_scratchpad}}`, `{{query}}`
- 关键设计：Completion模式+历史组织+CoT格式

## 核心架构发现

### 1. Agent Runner工厂模式
- BaseAgentRunner：基类
- CotChatAgentRunner：Chat模式
- CotCompletionAgentRunner：Completion模式
- AgentRunnerFactory：工厂创建

### 2. 提示词模板系统
- 模板变量：`{{instruction}}`, `{{tools}}`, `{{tool_names}}`, `{{historic_messages}}`, `{{agent_scratchpad}}`, `{{query}}`
- 替换：字符串replace
- 格式：CoT格式（Thought/Action/Observation/Final Answer）

### 3. 会话管理
- TokenBufferMemory：token缓冲
- Conversation：会话模型
- Message：消息模型
- MessageAgentThought：agent思考记录

### 4. 工具系统
- ToolManager：工具管理
- DatasetRetrieverTool：数据集检索
- 工具实体：AgentToolEntity
- 工具回调：DifyAgentCallbackHandler

### 5. 文件支持
- 文件上传：FileUploadConfigManager
- 图片处理：ImagePromptMessageContent
- 文件转提示词：file_manager.to_prompt_message_content()

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| Agent Runner工厂 | ❌ | ❌ | 大 | BaseAgentRunner+多种Runner |
| 提示词模板系统 | ❌ | ❌ | 大 | {{变量}}+CoT格式 |
| TokenBufferMemory | ❌ | ❌ | 大 | token缓冲记忆 |
| 文件支持 | ❌ | ❌ | 大 | 文件+图片→提示词 |
| 数据集检索工具 | ❌ | ❌ | 中 | DatasetRetrieverTool |

## 可复用设计

1. **Agent Runner工厂模式**：基类+多种Runner+工厂创建
2. **提示词模板系统**：`{{变量}}`替换+CoT格式
3. **TokenBufferMemory**：token缓冲+历史管理
4. **文件支持**：文件+图片→提示词内容
5. **数据集检索工具**：RAG检索+工具集成
