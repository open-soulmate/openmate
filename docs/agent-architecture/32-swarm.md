# 32. OpenAI Swarm 架构深度分析

> **项目**：[openai/swarm](https://github.com/openai/swarm)
> **定位**：实验性、教育性多智能体编排框架
> **状态**：已被 [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) 取代
> **核心文件**：`swarm/core.py`（~200行）、`swarm/util.py`（~70行）、`swarm/types.py`

---

## 一、设计哲学：极简主义的多智能体编排

Swarm 的设计哲学可以用三个词概括：**轻量、可控、可测**。整个框架的核心逻辑不到 200 行 Python 代码，却实现了完整的多智能体协调能力。这在 Agent 框架领域是极其罕见的——LangChain 的核心模块有数万行代码，AutoGen 的协调器也远比 Swarm 复杂。

Swarm 的极简主义体现在它只定义了两个原语抽象：

1. **Agent**——封装指令（instructions）和工具（functions）的实体
2. **Handoff**——Agent 之间的控制权转移机制

这种设计选择背后的理念是：多智能体系统的复杂性不应来自框架本身，而应来自业务逻辑的组合。Swarm 不引入图、状态机、消息总线等重型抽象，而是让开发者用纯 Python 函数表达一切编排逻辑。

**关键设计决策**：Swarm 完全基于 Chat Completions API 运行，在调用之间不保存任何状态（stateless）。这意味着每次 `client.run()` 调用都是独立的，所有状态通过 `messages` 和 `context_variables` 显式传递。这种设计使系统天然支持水平扩展和调试。

---

## 二、核心循环：Swarm 的"心脏"

`Swarm.run()` 方法是整个框架的核心，实现了一个简洁的事件循环：

```
while 未超过最大轮次 and 存在活跃 Agent:
    1. 调用 LLM 获取 completion（基于当前 history + 活跃 Agent 的 instructions）
    2. 将 completion 追加到 history
    3. 如果没有 tool_calls 或 execute_tools=False → 终止
    4. 执行 tool_calls，更新 context_variables
    5. 如果返回了新 Agent → 切换活跃 Agent
```

这个循环的精妙之处在于它的**自我终止条件**：当 LLM 不再请求工具调用时，循环自然结束。不需要显式的"完成"信号或退出指令。这与 Chat Completions API 的语义完美对齐——模型生成纯文本回复意味着它认为任务已完成。

**多轮对话的实现**：`run()` 方法内部可能执行多轮 LLM 调用（每轮处理一批工具调用），但对外只暴露最终的 `Response`。调用者不需要关心中间过程，只需传入初始消息并获得最终结果。

---

## 三、Agent 抽象：指令 + 工具 = 角色

`Agent` 是一个轻量级数据类，核心字段包括：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `str` | Agent 名称，用于消息追踪 |
| `instructions` | `str` 或 `Callable` | 系统提示词，支持动态生成 |
| `functions` | `List[Callable]` | Agent 可调用的 Python 函数 |
| `model` | `str` | 使用的模型，默认 `gpt-4o` |
| `tool_choice` | `str` | 工具选择策略 |
| `parallel_tool_calls` | `bool` | 是否允许并行工具调用 |

**Instructions 的灵活性**：instructions 可以是静态字符串，也可以是一个函数。当它是函数时，可以接收 `context_variables` 参数，实现基于上下文的动态提示词生成。例如：

```python
def instructions(context_variables):
    user_name = context_variables["user_name"]
    return f"帮助用户 {user_name} 完成任务。"
```

这种设计使得同一个 Agent 可以根据不同的上下文展现出不同的行为，而无需创建多个 Agent 实例。

---

## 四、Handoff 机制：函数返回即转移

Swarm 的 Agent 切换机制极其优雅——**函数返回 Agent 对象即触发 handoff**。这不需要任何特殊的注册、路由或声明：

```python
def transfer_to_sales():
    return sales_agent
```

当 LLM 调用这个函数并获得 Agent 对象作为返回值时，`handle_function_result()` 会将其包装为 `Result(value=..., agent=sales_agent)`，然后 `run()` 循环在下一轮切换活跃 Agent。

**返回值处理的模式匹配**：`handle_function_result()` 使用 Python 3.10+ 的 `match/case` 语法，对返回值进行三种模式匹配：

- `Result` 对象 → 直接使用
- `Agent` 对象 → 包装为 Result（触发 handoff）
- 其他值 → 转换为字符串作为工具输出

这种设计使得工具函数可以同时返回值、触发转移、更新上下文，只需返回一个 `Result` 对象：

```python
return Result(
    value="操作完成",
    agent=sales_agent,
    context_variables={"department": "sales"}
)
```

---

## 五、上下文变量系统：跨 Agent 的状态共享

`context_variables` 是 Swarm 中唯一的全局状态机制。它是一个普通的 Python 字典，贯穿整个 `run()` 调用的生命周期。

**注入机制**：Swarm 使用 `__CTX_VARS_NAME__ = "context_variables"` 作为魔法参数名。在 `get_chat_completion()` 中，框架会：

1. 从工具的 JSON Schema 中移除 `context_variables` 参数（不让 LLM 知道它的存在）
2. 在 `handle_tool_calls()` 中检查函数的 `co_varnames`，如果包含该参数则自动注入

这种设计巧妙地实现了"对 LLM 隐藏、对开发者可见"的上下文传递。LLM 不需要知道上下文变量的存在，但开发者编写的函数可以随时读取和修改它们。

---

## 六、工具系统：Python 函数 → JSON Schema 的自动转换

`util.py` 中的 `function_to_json()` 函数负责将 Python 函数自动转换为 OpenAI API 所需的 JSON Schema。它使用 `inspect.signature()` 分析函数签名：

- 函数名 → `function.name`
- docstring → `function.description`
- 参数类型注解 → `parameters.properties`（通过 `type_map` 映射）
- 无默认值的参数 → `required`

**类型映射**：
```python
type_map = {
    str: "string", int: "integer", float: "number",
    bool: "boolean", list: "array", dict: "object",
    type(None): "null"
}
```

未注解的参数默认为 `string` 类型。这种自动转换极大简化了工具定义——开发者只需编写普通的 Python 函数，无需手动编写 JSON Schema。

---

## 七、流式传输：增量式 Agent 执行

`run_and_stream()` 是 `run()` 的流式版本，它使用 Python 生成器（generator）逐步产出事件。流式模式引入了两个自定义事件类型：

- `{"delim": "start"}` / `{"delim": "end"}`：标记单个 Agent 处理的开始和结束，用于区分不同 Agent 的输出
- `{"response": Response}`：在流结束时产出完整的 Response 对象

流式实现的核心是 `merge_chunk()` 函数，它负责将增量的 delta 块合并到完整的消息中。对于 `tool_calls`，需要处理按索引合并的特殊情况（多个工具调用可能分多个 chunk 到达）。

---

## 八、错误处理与容错

Swarm 的错误处理策略是**优雅降级**：

1. **工具不存在**：如果 LLM 调用了一个不存在的工具，Swarm 不会抛出异常，而是返回一个包含错误信息的 tool message，让 LLM 自行恢复
2. **函数执行错误**：工具函数的异常会向上传播，但框架本身不做捕获（由调用者处理）
3. **返回值类型错误**：`handle_function_result()` 在 `str()` 转换失败时抛出明确的 `TypeError`

这种策略的核心思想是：让 LLM 尽可能自行处理错误，而不是让框架代替它做决策。

---

## 九、流式传输中的消息聚合

`util.py` 中的 `merge_fields()` 和 `merge_chunk()` 函数处理流式传输中的增量消息聚合。`merge_fields()` 递归地将源字典的值追加到目标字典中：

- 字符串值 → 追加（`+=`）
- 字典值 → 递归合并
- 其他非 None 值 → 覆盖

`merge_chunk()` 在此基础上处理 `tool_calls` 的特殊合并逻辑：根据 `index` 字段定位到具体的工具调用对象，然后合并其字段。这是因为 OpenAI API 的流式工具调用会分多个 chunk 传输，需要按索引拼接。

---

## 十、架构启示与局限性

### 启示

1. **少即是多**：200 行代码即可实现多智能体编排的核心能力，证明了简单抽象的表达力
2. **Python 原生即接口**：函数返回 Agent 触发 handoff，参数注入 context_variables，这些都是 Python 语言特性的巧妙利用
3. **无状态设计**：每次调用独立，状态通过参数传递，天然适合分布式部署
4. **LLM 即路由器**：不需要显式的路由逻辑，LLM 自行决定调用哪个工具（从而决定转移到哪个 Agent）

### 局限性

1. **无持久化**：完全无状态意味着调用者必须自行管理消息历史
2. **无并发**：单线程事件循环，工具调用串行执行
3. **无错误恢复**：工具函数异常直接向上传播，没有重试机制
4. **无中间件/钩子**：无法在工具调用前后注入自定义逻辑（如日志、限流、权限检查）
5. **上下文变量是隐式全局状态**：通过魔法参数名注入，缺乏类型安全和作用域控制

### 后继者

Swarm 已被 [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) 取代，后者在 Swarm 的基础上增加了持久化、工具保护、结构化输出等生产级特性。但 Swarm 的核心设计思想——极简原语、Python 原生接口、LLM 自主路由——仍然深刻影响着后续的 Agent 框架设计。

---

## 核心源码统计

| 文件 | 行数 | 职责 |
|------|------|------|
| `core.py` | ~200 | Swarm 类：run、get_chat_completion、handle_tool_calls |
| `util.py` | ~70 | function_to_json、merge_chunk、debug_print |
| `types.py` | ~30 | Agent、Result、Response 数据类定义 |
| `repl.py` | ~50 | run_demo_loop 交互式测试工具 |

**总计约 350 行代码**，实现了完整的多智能体编排框架——这是 Agent 工程中"极简但完整"的经典案例。
