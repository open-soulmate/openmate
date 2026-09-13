# langchain-ai/langchain — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/langchain-ai/langchain（monorepo）  
> 抓取通道: cdn.jsdelivr.net/gh/langchain-ai/langchain@master/libs/core/...  
> 版本快照: master @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Runnable 组合子 / Retry / Fallback / Agent 协议借鉴

---

## 0. 诚实性说明

- langchain 是 monorepo：`libs/core`（langchain-core）、`libs/langchain`、`libs/standard-tests`、`libs/partners/*`。
- 成功拉取 langchain-core：`runnables/retry.py`、`runnables/fallbacks.py`、`runnables/base.py`、`runnables/config.py`、`runnables/branch.py`、`language_models/chat_models.py`、`callbacks/manager.py`、`tools/base.py`、`agents.py`、`messages/ai.py` 等。
- LangGraph 在**独立仓库** `langchain-ai/langgraph`；本报告 §8 附带已拉取的 checkpoint 类型，但标明仓库边界。
- `git clone` 到本机失败（github.com:443 超时）；全部经 jsdelivr。

---

## 1. 系统架构

### 1.1 分层

```
langchain-core          # Runnable / Messages / Tools / Callbacks  ← 本报告主体
langchain               # 高层 chains / agents 抽象（薄封装）
langgraph               # 图运行时 + checkpoint（另一仓库）
langchain-community / partners/*
```

### 1.2 源码布局（langchain-core）

| 路径 | 职责 | 大小 |
|------|------|------|
| `libs/core/langchain_core/runnables/base.py` | Runnable 体系 | 239437 B |
| `libs/core/langchain_core/runnables/retry.py` | `RunnableRetry` | 13686 B |
| `libs/core/langchain_core/runnables/fallbacks.py` | `RunnableWithFallbacks` | 24455 B |
| `libs/core/langchain_core/runnables/config.py` | `RunnableConfig` | 22606 B |
| `libs/core/langchain_core/runnables/branch.py` | 条件分支 | 15775 B |
| `libs/core/langchain_core/language_models/chat_models.py` | BaseChatModel | 109955 B |
| `libs/core/langchain_core/callbacks/manager.py` | Callback 管理 | 91215 B |
| `libs/core/langchain_core/tools/base.py` | BaseTool | 71627 B |
| `libs/core/langchain_core/agents.py` | AgentAction/AgentFinish | 8480 B |

---

## 2. Runnable 组合子（稳定性核心）

### 2.1 概念

一切可 `invoke/ainvoke/stream/batch` 的对象都是 `Runnable`。组合子：

| 组合子 | 作用 |
|--------|------|
| `RunnableSequence` | `a \| b \| c` |
| `RunnableParallel` | 并行扇出 |
| `RunnableBranch` | 条件分支（`branch.py`） |
| `RunnableRetry` | 重试（§3） |
| `RunnableWithFallbacks` | 降级（§4） |
| `RunnableBinding` | 绑定参数/config |
| `RunnableLambda` | 包装函数 |

`runnables/base.py` 239KB，是整个稳定性的骨架。

### 2.2 RunnableConfig

`config.py`：

```python
class RunnableConfig(TypedDict, total=False):
    tags / metadata / callbacks / run_name
    max_concurrency / recursion_limit / configurable
    ...
```

`recursion_limit` 防止 Runnable 图无限递归。

---

## 3. RunnableRetry（retry.py 实读）

### 3.1 依赖 tenacity

```python
from tenacity import (
    AsyncRetrying,
    RetryCallState,
    RetryError,
    Retrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)
```

### 3.2 ExponentialJitterParams

```python
class ExponentialJitterParams(TypedDict, total=False):
    initial: float   # Initial wait
    max: float       # Maximum wait
    exp_base: float  # Exponential backoff base
    jitter: float    # random.uniform(0, jitter)
```

### 3.3 类

```python
class RunnableRetry(RunnableBindingBase[Input, Output]):
    """Retry a Runnable if it fails.
    ... implemented as a RunnableBinding. The easiest way to use it
    is through the `.with_retry()` method on all Runnables.
    """
```

**用法：** `chain.with_retry(stop_after_attempt(3), wait_exponential_jitter())`。

**没有**硬编码的全局默认 3 次——次数由调用方传入 tenacity 策略。

---

## 4. RunnableWithFallbacks（fallbacks.py 实读）

### 4.1 类（L37）

```python
class RunnableWithFallbacks(RunnableSerializable[Input, Output]):
```

### 4.2 关键字段（L93–102）

```python
exceptions_to_handle: tuple[type[BaseException], ...] = (Exception,)
"""The exceptions on which fallbacks should be tried.
Any exception that is not a subclass of these exceptions will be raised immediately.
"""

exception_key: str | None = None
"""If 'string' is specified then handled exceptions will be passed to fallbacks as
   input[exception_key]. If None, exceptions will not be passed."""
```

### 4.3 执行（L168–202）

```
if exception_key specified and input 不是 dict → 报错（L168-170）

try:
    run primary
except self.exceptions_to_handle as e:   # L198
    try next fallback
except BaseException as e:               # L202
    raise  # 未列入 exceptions_to_handle 的异常直接抛

若 exception_key 且 last_error:
    input[exception_key] = last_error     # L188-189
```

**设计要点：** 默认 `exceptions_to_handle=(Exception,)`——几乎所有异常都会触发 fallback。生产建议收紧为 `TimeoutError, RateLimitError, ...`。

---

## 5. Chat Model 层

`language_models/chat_models.py`（110KB）：

- `BaseChatModel.generate` / `agenerate` / `stream`
- `raise_for_status` / 停用词 / token 计数钩子
- **不**内置统一 max_retries；重试在 `.with_retry()` 或 provider SDK

---

## 6. Tools / Agents 协议

### 6.1 tools/base.py

`BaseTool`：`name / description / args_schema / invoke / ainvoke`。工具异常可被捕获并返回字符串 observation。

### 6.2 agents.py

```python
# 8480 B — 轻量
AgentAction / AgentFinish / AgentStep
```

这是 **消息级** Agent 协议；真正的循环在 `langchain.agents`（libs/langchain）或 LangGraph。core 只定义动作类型。

---

## 7. Callbacks

`callbacks/manager.py`（91KB）：`CallbackManagerForChainRun` / `AsyncCallbackManagerForChainRun`。每个 Runnable 步骤可挂 handlers，用于日志、追踪、token 统计。

`RunnableRetry` 同样把 chain run 的 manager 注入 tenacity 回调。

---

## 8. LangGraph 附录（独立仓库，已拉取）

> 仓库: https://github.com/langchain-ai/langgraph  
> 路径: `libs/langgraph/langgraph/types.py`、`errors.py`、`constants.py`、`pregel/main.py`、`libs/checkpoint/...`

### 8.1 Checkpointer 类型（types.py L100–119）

```python
Checkpointer = None | bool | BaseCheckpointSaver
"""Type of the checkpointer to use for a subgraph.
- True enables persistent checkpointing for this subgraph.
- False disables checkpointing, even if the parent graph has a checkpointer.
- None inherits checkpointer from the parent graph.
"""

def ensure_valid_checkpointer(checkpointer: Checkpointer) -> Checkpointer:
    if checkpointer not in (None, True, False) and not isinstance(checkpointer, BaseCheckpointSaver):
        raise ...  # L114
```

### 8.2 Checkpoint 结构（checkpoint/base L93–147）

```python
class CheckpointMetadata(TypedDict, total=False):   # L39
    ...

class Checkpoint(TypedDict):                        # L93
    channel_values: dict[str, Any]                  # L105
    versions_seen: dict[str, ChannelVersions]       # L116

class CheckpointTuple(NamedTuple):                  # L140
    pending_writes: list[PendingWrite] | None = None  # L147
```

### 8.3 thread_id

docstring（L183–199）：

```
config = {"configurable": {"thread_id": "my-thread"}}
thread_id 是存储/检索 checkpoint 的主键
对话记忆：跨调用复用同一 thread_id
```

### 8.4 其它类型

```python
RetryPolicy   # types.py L70
TimeoutPolicy # types.py L71
Interrupt     # L75
```

`pregel/main.py`（175KB）：图调度主循环；`constants.py` 含 `INTERRUPT` 等哨兵。

### 8.5 崩溃恢复（LangGraph 语义）

```
每个 super-step 后写 Checkpoint
  → channel_values + versions_seen + pending_writes
进程崩溃
  → 按 thread_id 取最近 CheckpointTuple
  → 重放未完成的 pending_writes
  → 继续下一 super-step
```

这是本批框架中**唯一**接近「tool/节点级精确恢复」的模型。

---

## 9. 超时 / 重试 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| Retry 默认次数 | **无全局默认**；`with_retry(stop_after_attempt(n))` 调用方定 | retry.py |
| 退避 | `wait_exponential_jitter(initial, max, exp_base, jitter)` | retry.py |
| Fallback 默认捕获 | `(Exception,)` | fallbacks.py L93 |
| recursion_limit | RunnableConfig 字段 | config.py |
| LangGraph RetryPolicy | 独立类型 | langgraph types.py L70 |
| LangGraph TimeoutPolicy | 独立类型 | types.py L71 |

---

## 10. 失败路径

```
Runnable 抛出
  → RunnableRetry：tenacity 判定是否重试
  → 耗尽 → RetryError 上抛

RunnableWithFallbacks
  → exceptions_to_handle 内 → 尝试下一个
  → 耗尽 → 上抛最后错误
  → 不在 exceptions_to_handle → 立即上抛

LangGraph 节点失败
  → RetryPolicy（若配置）
  → 仍失败 → 图失败，checkpoint 保留到失败前
```

---

## 12. 跨框架对比

### 12.1 Retry 机制对比

| 框架 | 位置 | 默认次数 | 退避 | 可组合 |
|------|------|----------|------|--------|
| langchain-core | Runnable 组合子 | **无默认**（调用方 `stop_after_attempt(n)`） | `wait_exponential_jitter` | **是**（with_retry） |
| Agno | Model 层 | `self.retries` | delay=1s 可选指数 | 否 |
| LiteLLM | Router | RetryPolicy | 有 | Router 配置 |
| MetaGPT | Provider | tenacity 默认 | tenacity | 否 |
| openai-agents | client SDK | SDK | SDK | 否 |
| ADK | 无统一 | — | — | — |

langchain-core 的优势是 **retry/fallback 是普通 Runnable**，可与 sequence/branch 任意组合。

### 12.2 Fallback 对比

| 框架 | 默认捕获 | 错误注入 fallback |
|------|----------|-------------------|
| langchain-core | `(Exception,)` | `exception_key` 可注入 |
| LiteLLM | Router fallbacks | 头信息 |
| Agno | 无内建 | — |
| deepagents | 继承 LangGraph | — |

`exceptions_to_handle=(Exception,)` 默认过宽，生产必须收紧。

### 12.3 Checkpoint 对比（LangGraph vs 其它）

| 框架 | 标识 | 结构 | pending |
|------|------|------|---------|
| LangGraph | `thread_id` | `Checkpoint{channel_values, versions_seen}` | `pending_writes` |
| ADK | session_id | events + state delta | 无 |
| openai-agents | session_id | items | 无 |
| mem0 | user_id/agent_id | facts + MD5 | 无 |
| deepagents | LangGraph thread_id + **DeltaChannel O(N)** | 同 LG 优化 | 同 LG |

LangGraph 是唯一提供 `pending_writes` 的；deepagents 用 DeltaChannel 优化其体积。

### 12.4 组合子表达力

```python
chain = (
    prompt
    | model.with_retry(stop_after_attempt(3), wait_exponential_jitter())
    | parser
).with_fallbacks([backup_model_chain])
```

这种**声明式稳定性组合**是 langchain-core 相对「框架内硬编码 retry」的核心优势。

---

## 13. 与 openmate 映射

| 需求 | langchain / langgraph 机制 | 可复用度 |
|------|---------------------------|----------|
| 组合子式重试/降级 | with_retry / with_fallbacks | **高** |
| 可配置退避 | ExponentialJitterParams | 高 |
| 图级 checkpoint | LangGraph Checkpoint + thread_id | **高** |
| pending_writes 恢复 | CheckpointTuple | **高** |
| Agent 动作协议 | AgentAction/AgentFinish | 中 |
| 轻量单文件 | 否，依赖较重 | 中 |
| DeltaChannel | deepagents 扩展 | 高 |

### 13.1 可直接借鉴的设计

1. **with_retry / with_fallbacks 作为一等 Runnable**。
2. **ExponentialJitterParams 四字段**（initial/max/exp_base/jitter）。
3. **Checkpoint + pending_writes + thread_id**。
4. **RetryPolicy / TimeoutPolicy 独立于节点逻辑**（LangGraph）。

### 13.2 不应借鉴

1. `exceptions_to_handle=(Exception,)` 默认过宽。
2. monorepo 体积大，core 以外定位模糊。
3. Runnable 抽象学习曲线陡。

---

## 14. 常量与类型速查表

| 符号 | 位置 | 值/含义 |
|------|------|---------|
| `DEFAULT_MAX_TURNS`（openai-agents，对照） | run_config.py | 10 |
| `exceptions_to_handle` 默认 | fallbacks.py L93 | `(Exception,)` |
| `exception_key` | fallbacks.py L98 | `None` |
| `ExponentialJitterParams` | retry.py | initial/max/exp_base/jitter |
| tenacity 依赖 | retry.py | `stop_after_attempt`, `wait_exponential_jitter` |
| `RunnableConfig.recursion_limit` | config.py | 防递归 |
| `RetryPolicy` | langgraph types.py L70 | 节点级重试 |
| `TimeoutPolicy` | types.py L71 | 节点级超时 |
| `Checkpointer` | types.py L100 | `None \| bool \| BaseCheckpointSaver` |
| `Checkpoint.channel_values` | checkpoint/base L95/L105 | `dict[str, Any]` |
| `Checkpoint.versions_seen` | L116 | `dict[str, ChannelVersions]` |
| `CheckpointTuple.pending_writes` | L147 | `list[PendingWrite] \| None` |
| `thread_id` | checkpoint docstring L183+ | 主键 |

---

## 15. 推荐 openmate 参考实现草图

### 15.1 with_retry（借 langchain-core）

```python
from tenacity import stop_after_attempt, wait_exponential_jitter

async def call_with_retry(fn, *args, attempts=3):
    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(attempts),
        wait=wait_exponential_jitter(initial=0.5, max=10, jitter=1),
        reraise=True,
    ):
        with attempt:
            return await fn(*args)
```

### 15.2 with_fallbacks（收紧 exceptions_to_handle）

```python
EXCEPTIONS_TO_HANDLE = (TimeoutError, RateLimitError, ServiceUnavailableError)

async def with_fallbacks(primary, fallbacks, input):
    last = None
    for runnable in [primary, *fallbacks]:
        try:
            return await runnable(input)
        except EXCEPTIONS_TO_HANDLE as e:
            last = e
            continue
    raise last
```

**不要**默认 `(Exception,)`。

### 15.3 Checkpoint 最小字段（借 LangGraph）

```python
{
  "thread_id": str,
  "checkpoint_id": str,
  "channel_values": dict,
  "versions_seen": dict,
  "pending_writes": list | None,
}
```

---

## 16. 源码锚点速查

```
libs/core/langchain_core/runnables/retry.py
  tenacity: stop_after_attempt, wait_exponential_jitter
  class ExponentialJitterParams
  class RunnableRetry(RunnableBindingBase)

libs/core/langchain_core/runnables/fallbacks.py
  L37  class RunnableWithFallbacks
  L93  exceptions_to_handle = (Exception,)
  L98  exception_key
  L198 except self.exceptions_to_handle

libs/core/langchain_core/runnables/config.py
  RunnableConfig.recursion_limit

libs/core/langchain_core/agents.py
  AgentAction / AgentFinish

libs/core/langchain_core/tools/base.py
libs/core/langchain_core/language_models/chat_models.py
libs/core/langchain_core/callbacks/manager.py

--- langgraph（另一仓库）---
libs/langgraph/langgraph/types.py
  L70  RetryPolicy
  L71  TimeoutPolicy
  L100 Checkpointer = None | bool | BaseCheckpointSaver

libs/checkpoint/langgraph/checkpoint/base/__init__.py
  L39  class CheckpointMetadata
  L93  class Checkpoint (channel_values, versions_seen)
  L140 class CheckpointTuple (pending_writes)

libs/langgraph/langgraph/pregel/main.py
libs/langgraph/langgraph/constants.py
```

---

## 13. 诚实性备注

langchain-core 的 Retry/Fallback 代码为实读。LangGraph Checkpoint 字段（`channel_values` / `versions_seen` / `pending_writes` / `thread_id`）为实读。`pregel` 调度算法细节未逐行摘录，不编造其内部超时秒数。
