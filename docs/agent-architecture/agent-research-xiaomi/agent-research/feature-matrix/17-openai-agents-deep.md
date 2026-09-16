# OpenAI Agents SDK 源代码深度研究

研究时间：2026-09-16 03:20
源码：github.com/openai/openai-agents-python

## 已读源代码文件

### 1. agents/agent.py
- Agent类核心实现
- 泛型：`Agent[TContext]` — 上下文类型参数
- instructions：字符串或callable `(context, agent) -> str`
- tools：工具列表
- handoffs：交接列表
- guardrails：输入/输出护栏
- MCP集成：MCPUtil
- as_tool()：将agent作为工具
- 关键设计：泛型上下文+动态指令+工具+交接+护栏

### 2. agents/run.py
- Runner核心实现
- `Runner.run()` — 执行agent
- `Runner.run_streamed()` — 流式执行
- RunConfig：运行配置
- RunState：运行状态
- Session：会话持久化
- 关键设计：运行器+配置+状态+会话

### 3. agents/tool.py
- 工具系统核心
- FunctionTool：函数工具
- ComputerTool：计算机工具
- ApplyPatchTool：补丁工具
- ShellTool：Shell工具
- ToolOrigin：工具来源
- ToolErrorFunction：错误处理
- 关键设计：多种工具类型+错误处理+超时

### 4. agents/guardrail.py
- 护栏系统核心
- InputGuardrail：输入护栏（并行运行）
- OutputGuardrail：输出护栏
- GuardrailFunctionOutput：护栏输出
- tripwire_triggered：触发标志
- 关键设计：输入/输出分离+并行运行+触发停止

## 核心架构发现

### 1. 泛型上下文系统
- `Agent[TContext]` — 类型参数
- RunContextWrapper[TContext] — 上下文包装
- 类型安全：编译时检查
- 灵活性：任意上下文类型

### 2. 护栏系统
- 输入护栏：并行运行，检测输入
- 输出护栏：检查输出
- tripwire_triggered：触发停止
- 装饰器：@input_guardrail/@output_guardrail

### 3. 工具系统
- FunctionTool：Python函数
- ComputerTool：计算机操作
- ApplyPatchTool：代码补丁
- ShellTool：Shell命令
- 错误处理：ToolErrorFunction
- 超时：ToolTimeoutBehavior

### 4. 会话持久化
- Session：会话管理
- 保存：save_result_to_session()
- 恢复：resume_pending_session_write()
- 状态：RunState

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 泛型上下文系统 | ❌ | ❌ | 大 | Agent[TContext]+RunContextWrapper |
| 护栏系统 | ❌ | ❌ | 大 | InputGuardrail+OutputGuardrail+tripwire |
| 多种工具类型 | ❌ | ❌ | 大 | FunctionTool/ComputerTool/ShellTool |
| 会话持久化 | ❌ | ❌ | 大 | Session+save/restore |
| MCP集成 | ✅ | ✅ | 小 | 已有 |

## 可复用设计

1. **泛型上下文系统**：Agent[TContext]+RunContextWrapper
2. **护栏系统**：输入/输出分离+并行运行+触发停止
3. **多种工具类型**：FunctionTool/ComputerTool/ApplyPatchTool/ShellTool
4. **会话持久化**：Session+save/restore+状态管理
5. **装饰器模式**：@input_guardrail/@output_guardrail
