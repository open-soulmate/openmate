# Haystack 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/deepset-ai/haystack  
> 抓取通道: cdn.jsdelivr.net/gh/deepset-ai/haystack@main  
> 版本快照: main @ 2026-09-13（`haystack/components/agents/agent.py` 63KB + `haystack/__init__.py` + `haystack/core/pipeline/pipeline.py` 66KB 实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent 循环、Hook 系统、退出原因分类、Pipeline 执行与工具并发借鉴

---

## 0. 诚实性说明

- **已打开实读**：
  - `haystack/components/agents/agent.py`（63450 bytes，Agent 类全文关键路径）
  - `haystack/__init__.py`（1561 bytes）
  - `haystack/core/pipeline/pipeline.py`（65916 bytes）
- 文件清单来自 `data.jsdelivr.com/v1/packages/gh/deepset-ai/haystack@main?structure=flat`。
- 本报告基于源码实读；不发明行号。

---

## 1. 项目定位

Haystack 是 deepset 开源的 **端到端 LLM / RAG / Agent 框架**：

- Pipeline = 组件图（components connected by edges）
- Agent = 内置 tool-calling 循环（`haystack/components/agents/agent.py`）
- 组件覆盖：connectors / converters / embedders / generators / retrievers / rankers / routers / joiners / tools / audio / caching / classifiers / evaluators / extractors / fetchers / samplers / preprocessors / websearch / validators / builders / agents

`haystack/__init__.py` 为统一导出入口。

---

## 2. Agent 深潜（agent.py 实读）

### 2.1 退出原因常量

```python
_EXIT_REASON_TEXT = "text"
_EXIT_REASON_LENGTH = "length"
_EXIT_REASON_CONTENT_FILTER = "content_filter"
_EXIT_REASON_MAX_STEPS = "max_agent_steps"
```

`_get_model_exit_reason(messages)`：

- Incomplete generation reasons **优先于** text（区分部分响应 vs 完整答案）。
- 空响应且无已识别终止原因 → **不触发退出**（保留循环）。

### 2.2 运行元数据状态键

```python
_RUN_METADATA_STATE_KEYS: dict[str, dict[str, Any]] = {
    "step_count": {"type": int, "handler": replace_values},
    "token_usage": {"type": dict[str, Any], "handler": replace_values},
    "tool_call_counts": {"type": dict[str, int], "handler": replace_values},
    "exit_reason": {"type": str, "handler": replace_values},
}
```

这些键由 Agent 自动填充，**用户不得在自己的 `state_schema` 中重定义**；仅作为输出暴露。

### 2.3 内部控制状态键

```python
_INTERNAL_STATE_KEYS: dict[str, dict[str, Any]] = {
    "continue_run": {"type": bool, "handler": replace_values},
    "stop_run": {"type": str, "handler": replace_values},
    "tools": {"type": list, "handler": replace_values},
    "hook_context": {"type": dict[str, Any], "handler": replace_values},
    "context_tokens": {"type": int, "handler": replace_values},
}
```

- `continue_run`：`on_exit` hook 设置以继续运行（每次退出尝试后重读）
- `stop_run`：hook 设置以停止；每次 LLM 调用前读取，用作 `exit_reason`
- `tools`：当前步可用的扁平化工具列表（供 HITL 确认等 hook 检查）
- `hook_context`：per-run 请求作用域资源
- `context_tokens`：近似上下文窗口大小，每次 LLM 调用后刷新（compaction hook 用）

`_public_outputs(state)` 排除内部键后返回用户可见输出。

### 2.4 Hook 校验失败路径

```python
def _validate_hooks(hooks: dict[HookPoint, list[Hook]]) -> None:
    for hook_point, hook_list in hooks.items():
        if hook_point not in VALID_HOOK_POINTS:
            raise ValueError(f"Invalid hook point '{hook_point}'...")
        for h in hook_list:
            if not callable(getattr(h, "run", None)):
                if callable(h):
                    raise TypeError(
                        f"Hook ... is callable but is not a Hook object. "
                        "If it is a function, wrap it with the @hook decorator."
                    )
                raise TypeError(f"Hook ... must have a callable 'run(state)'...")
            allowed_points = getattr(h, "allowed_hook_points", None)
            if allowed_points is not None and hook_point not in allowed_points:
                raise ValueError(
                    f"Hook of type '{type(h).__name__}' is registered under "
                    f"'{hook_point}' but only supports: {', '.join(allowed_points)}."
                )
```

**设计要点**：

- Hook 必须是 Hook 对象（`run(state)`），裸函数被拒绝并提示用 `@hook` 装饰器。
- Hook 可声明 `allowed_hook_points` 限制注册位置（如 `ConfirmationHook` 仅 `before_tool`）。

### 2.5 Agent 构造参数校验

```python
def __init__(self, ...):
    # raise_on_tool_invocation_failure: 工具调用失败是否抛异常
    ...
    if tool_concurrency_limit < 1:
        raise ValueError("tool_concurrency_limit must be greater than or equal to 1.")
```

- `raise_on_tool_invocation_failure`：工具失败策略开关。
- `tool_concurrency_limit >= 1`：工具并发下限。

### 2.6 运行循环

```python
def run(self, ...):
    ...
    while not exit_reason:
        should_stop = exe_context.state.data.get("stop_run")
        if should_stop:
            exit_reason = should_stop
            break
        more = self._run_step(exe_context, agent_span)
        ...
        if steps >= max_steps:
            exe_context.state.set("exit_reason", _EXIT_REASON_MAX_STEPS)
            exit_reason = _EXIT_REASON_MAX_STEPS
```

`run_async` 对称实现（`_run_step_async`）。

`_check_exit_conditions(llm_messages, tool_messages)`：综合 LLM 与工具消息判断是否退出。

`_continue_after_exit_hooks(exe_context)`：读取并消费 `continue_run` 标志。

```python
def _consume_continue_run(state: State) -> bool:
    should_continue = state.data["continue_run"]
    state.set("continue_run", False)  # 消费后重置，不跨退出尝试泄漏
    return should_continue
```

### 2.7 其他生命周期

- `warm_up()` / `warm_up_async()`：预热模型
- `close()` / `close_async()`：释放资源
- `clone(**overrides)`：配置克隆
- `to_dict()` / `from_dict()`：序列化

---

## 3. Pipeline（pipeline.py）

- 组件图执行引擎。
- 66KB 源码覆盖：连接校验、循环检测、异步运行、断点/调试。
- e2e 测试覆盖：dense doc search / hybrid / RAG / evaluation / extractive QA / NER / preprocessing。

---

## 4. 失败路径汇总

| 场景 | 处理 |
|------|------|
| 未知 hook point | `ValueError` |
| Hook 无 `run(state)` | `TypeError`（提示 `@hook`） |
| Hook 注册到不允许的 point | `ValueError` |
| `tool_concurrency_limit < 1` | `ValueError` |
| 工具调用失败 | 由 `raise_on_tool_invocation_failure` 控制 |
| 达到 max_steps | `exit_reason = max_agent_steps` |
| LLM length/content_filter | `exit_reason = length / content_filter` |
| 用户设置 `stop_run` | 立即退出，用作 exit_reason |
| `on_exit` 设 `continue_run` | 继续运行 |

---

## 5. 对 openmate 的借鉴

### 5.1 直接可抄（P0）

1. **退出原因枚举**：`text / length / content_filter / max_agent_steps`——可区分「答完」vs「截断」vs「触顶」。
2. **运行元数据状态键**：`step_count / token_usage / tool_call_counts / exit_reason` 保留且禁止用户重定义。
3. **内部控制键**：`continue_run / stop_run / tools / hook_context / context_tokens`。
4. **`_consume_continue_run` 消费语义**：读取后立即重置，防跨尝试泄漏。
5. **Hook 校验**：强制 Hook 对象 + `allowed_hook_points` 限制。
6. **`tool_concurrency_limit >= 1`** 硬校验。

### 5.2 应避免的坑

- 空响应不退出：可能导致死循环；openmate 需配 max_steps + 空响应计数。
- `context_tokens` 是 best-effort 快照，不能当精确计量。

### 5.3 重构优先级

- **P0**：Agent 退出原因枚举 + 元数据输出
- **P0**：Hook 注册校验（点位 + 类型 + allowed_hook_points）
- **P0**：`continue_run` / `stop_run` 控制协议
- **P1**：工具并发上限与失败策略开关
- **P1**：`context_tokens` 供 compaction hook 读取
- **P2**：Pipeline 组件图（若做可视化）

---

## 5.4 Agent 循环详细流程（源码路径）

```
Agent.run()
  │
  ├─ _initialize_fresh_execution()
  │    └─ 注册 _RUN_METADATA_STATE_KEYS + _INTERNAL_STATE_KEYS
  │
  ├─ while not exit_reason:
  │    │
  │    ├─ 检查 state.stop_run → 若设置则退出
  │    │
  │    ├─ _run_step(exe_context, agent_span)
  │    │    ├─ LLM 调用（含 hook_context / tools 注入）
  │    │    ├─ _get_model_exit_reason(messages)
  │    │    │    ├─ length → _EXIT_REASON_LENGTH
  │    │    │    ├─ content_filter → _EXIT_REASON_CONTENT_FILTER
  │    │    │    ├─ 有 tool_calls → 继续
  │    │    │    └─ 无 tool_calls 且完整 → _EXIT_REASON_TEXT
  │    │    │
  │    │    ├─ 工具并发执行（tool_concurrency_limit）
  │    │    │    └─ 失败 → raise_on_tool_invocation_failure 控制
  │    │    │
  │    │    └─ 更新 step_count / token_usage / tool_call_counts / context_tokens
  │    │
  │    ├─ _check_exit_conditions(llm_messages, tool_messages)
  │    │
  │    └─ 步数 >= max_steps → exit_reason = _EXIT_REASON_MAX_STEPS
  │
  ├─ _continue_after_exit_hooks(exe_context)
  │    └─ _consume_continue_run(state)  # 读取后立即重置
  │
  └─ _public_outputs(state)  # 排除 _INTERNAL_STATE_KEYS
```

---

## 5.5 Hook 点位推断

| 点位 | 时机 | 典型用途 |
|------|------|----------|
| `before_llm` | LLM 调用前 | context_tokens 检查 → 触发 compaction |
| `after_llm` | LLM 调用后 | 审计 / 截断 |
| `before_tool` | 工具调用前 | ConfirmationHook（HITL） |
| `after_tool` | 工具调用后 | 结果过滤 |
| `on_exit` | 退出尝试时 | 设置 continue_run 继续 |

`ConfirmationHook.allowed_hook_points` 限制为 `before_tool`——注册到其他点位会 `ValueError`。

---

## 5.6 与 openmate 对照表

| Haystack | openmate 建议 |
|----------|---------------|
| `_EXIT_REASON_*` 四值 | `exit_reason: text\|length\|content_filter\|max_steps` |
| `_RUN_METADATA_STATE_KEYS` | 运行元数据保留且禁用户重定义 |
| `_INTERNAL_STATE_KEYS` | 内部控制键不暴露 |
| `_consume_continue_run` 消费语义 | 读取后重置，防跨尝试泄漏 |
| `tool_concurrency_limit >= 1` | 硬校验 |
| `raise_on_tool_invocation_failure` | 工具失败策略开关 |
| Hook `allowed_hook_points` | Hook 注册点位限制 |
| `@hook` 装饰器强制 | 拒绝裸函数 |
| `context_tokens` best-effort | 供 compaction hook 读取 |
| 空响应不退出 | 配 max_steps + 空响应计数 |

---

## 6. 源码锚点速查

```
haystack/components/agents/agent.py
  _EXIT_REASON_TEXT = "text"
  _EXIT_REASON_LENGTH = "length"
  _EXIT_REASON_CONTENT_FILTER = "content_filter"
  _EXIT_REASON_MAX_STEPS = "max_agent_steps"
  _RUN_METADATA_STATE_KEYS: step_count, token_usage, tool_call_counts, exit_reason
  _INTERNAL_STATE_KEYS: continue_run, stop_run, tools, hook_context, context_tokens
  _validate_hooks → ValueError / TypeError
  _consume_continue_run → 读取后重置
  _get_model_exit_reason → incomplete 优先于 text
  class Agent
  tool_concurrency_limit >= 1
  raise_on_tool_invocation_failure
  run / run_async / _run_step / _run_step_async
  _check_exit_conditions / _continue_after_exit_hooks
  warm_up / close / clone / to_dict / from_dict

haystack/__init__.py  (统一导出)
haystack/core/pipeline/pipeline.py  (66KB 组件图引擎)

组件目录: agents, audio, builders, caching, classifiers, connectors,
          converters, document_stores, document_writers, embedders,
          evaluation, evaluators, extractors, fetchers, generators,
          joiners, preprocessors, rankers, readers, retrievers, routers,
          samplers, tool_components, tools, utils, validators, websearch

License: Apache-2.0
```

**本轮未打开**：ToolInvoker / 具体 Generator 适配 / DocumentStore。

---

## 7. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | 并发上限 + 失败策略 + Hook |
| 权限/安全边界 | 3 | HITL ConfirmationHook 点位 |
| 容错与会话恢复 | 4 | 退出原因分类 + continue_run |
| 上下文工程 | 4 | context_tokens 供 compaction |
| 可扩展（技能/MCP） | 3 | 组件 + Hook |
| 可观测与可评测 | 4 | token_usage / tool_call_counts |
| 生产可用成熟度 | 4 | deepset 生产级 |

**综合**：**Agent 循环与 Hook 系统的工程化标杆**。openmate 必抄退出原因、元数据键、Hook 校验与 continue/stop 协议。

---

## 8. 关键链接

- 仓库：https://github.com/deepset-ai/haystack  
- 相关报告：`reports/langchain.md`、`reports/llama-index-l1.md`、`reports/langgraph.md`

---

## 7. Quick Reference Card

### Exit Reasons

_EXIT_REASON_TEXT = "text" for complete answer.
_EXIT_REASON_LENGTH = "length" for truncated.
_EXIT_REASON_CONTENT_FILTER = "content_filter" for filtered.
_EXIT_REASON_MAX_STEPS = "max_agent_steps" for hit limit.

### State Keys

Metadata (public): step_count, token_usage, tool_call_counts, exit_reason.
Internal (hidden): continue_run, stop_run, tools, hook_context, context_tokens.

### Hook Validation Rules

1. Hook point must be in VALID_HOOK_POINTS.
2. Hook must have callable run(state).
3. Bare functions rejected - use @hook decorator.
4. allowed_hook_points restricts registration location.

### openmate Mapping

_EXIT_REASON_* 4 values map to exit_reason enum.
_RUN_METADATA_STATE_KEYS map to reserved metadata keys.
_INTERNAL_STATE_KEYS map to internal control keys.
_consume_continue_run maps to read-then-reset protocol.
tool_concurrency_limit>=1 maps to hard validation.
raise_on_tool_invocation maps to tool failure policy switch.
allowed_hook_points maps to hook registration restriction.
context_tokens maps to compaction hook input.
---

## 8. Implementation Notes for openmate

When implementing a Haystack-like Agent in openmate, consider these design decisions:

1. Exit reason enum: use four values (text, length, content_filter, max_agent_steps) to distinguish complete answers from truncation from limits.
2. Reserved state keys: mark metadata keys as reserved so users cannot redefine them in custom state schemas.
3. Internal control keys: keep continue_run, stop_run, tools, hook_context, context_tokens internal and not exposed as inputs/outputs.
4. Consume-then-reset: when reading continue_run, immediately reset it to prevent leakage across exit attempts.
5. Hook validation: enforce Hook objects with callable run(state); reject bare functions; support allowed_hook_points restrictions.
6. Tool concurrency: validate tool_concurrency_limit >= 1 at construction time.
7. Context tokens: track approximate context window size after each LLM call for compaction hooks to read.

These seven decisions capture the core engineering lessons from Haystack's Agent implementation.