# Google ADK 源代码深度研究

研究时间：2026-09-16 03:40
源码：github.com/google/adk-python

## 已读源代码文件

### 1. google/adk/agents/base_agent.py
- BaseAgent核心实现
- 抽象基类：run_async()
- 回调：BeforeAgentCallback, AfterAgentCallback
- BaseAgentState：agent状态
- Context：上下文
- Event：事件
- 关键设计：抽象基类+回调+状态+事件

### 2. google/adk/agents/llm_agent.py
- LlmAgent核心实现
- 继承：BaseAgent
- 回调：BeforeModelCallback, AfterModelCallback
- 流程：SingleFlow, AutoFlow
- 工具：BaseTool, BaseToolset, FunctionTool
- 规划器：BasePlanner
- 代码执行器：BaseCodeExecutor
- 关键设计：LLM agent+流程+工具+规划

### 3. google/adk/tools/base_tool.py
- BaseTool核心实现
- 属性：name, description, is_long_running, custom_metadata
- _defers_response：延迟响应
- ToolContext：工具上下文
- 关键设计：工具基类+长运行+延迟响应

### 4. google/adk/runners.py
- Runner核心实现
- 运行配置：RunConfig
- 会话：Session, BaseSessionService
- 事件：Event, EventActions
- 工件：BaseArtifactService
- 记忆：BaseMemoryService
- 凭证：BaseCredentialService
- 插件：PluginManager
- 关键设计：运行器+会话+事件+工件+记忆+插件

## 核心架构发现

### 1. 流程系统
- SingleFlow：单流程
- AutoFlow：自动流程
- BaseLlmFlow：流程基类
- 流程可组合

### 2. 回调系统
- BeforeAgentCallback/AfterAgentCallback
- BeforeModelCallback/AfterModelCallback
- 回调可中断执行

### 3. 工具系统
- BaseTool：工具基类
- BaseToolset：工具集
- FunctionTool：函数工具
- is_long_running：长运行工具
- _defers_response：延迟响应

### 4. 运行器系统
- Runner：运行器
- Session：会话
- Event：事件
- Artifact：工件
- Memory：记忆
- Credential：凭证
- Plugin：插件

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 流程系统 | ❌ | ❌ | 大 | SingleFlow+AutoFlow |
| 回调系统 | ❌ | ❌ | 大 | Before/After+Agent/Model |
| 长运行工具 | ❌ | ❌ | 大 | is_long_running+延迟响应 |
| 插件系统 | ❌ | ❌ | 大 | PluginManager |
| 工件服务 | ❌ | ❌ | 中 | BaseArtifactService |

## 可复用设计

1. **流程系统**：SingleFlow+AutoFlow+BaseLlmFlow
2. **回调系统**：Before/After+Agent/Model+可中断
3. **长运行工具**：is_long_running+_defers_response
4. **插件系统**：PluginManager+BasePlugin
5. **工件服务**：BaseArtifactService+存储
