# langchain-ai/langgraph 架构调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/langchain-ai/langgraph |
| 语言 | Python（另有 LangGraph.js） |
| License | MIT |
| 定位一句话 | 面向**长时运行、有状态 Agent** 的低层编排框架；核心卖点是 durable execution / checkpoint / interrupt。 |
| 关联生态 | LangSmith（观测/部署）、Deep Agents（高层包）、LangGraph Platform |
| 文档入口 | README + `libs/checkpoint` 源码 + `langgraph.types`（docs.langchain.com 文档站，仓库内 docs 路径已迁移） |

> 对 openmate 的意义：三者中 **LangGraph 的稳定性基建最完整**，是 hybrid coding+personal agent 重构时「会话可恢复、人工可介入、崩溃可续跑」的首选参考。

---

## 1. 系统架构

### 1.1 顶层模块图

```
┌─────────────────────────────────────────────────────────┐
│  StateGraph / Functional API (用户定义节点与边)           │
├─────────────────────────────────────────────────────────┤
│  Pregel 执行引擎（super-step / channel / task 调度）      │
├─────────────────────────────────────────────────────────┤
│  Checkpoint 子系统                                        │
│   BaseCheckpointSaver → InMemory / Sqlite / Postgres     │
│   Checkpoint + CheckpointMetadata + pending_writes       │
├─────────────────────────────────────────────────────────┤
│  Durability / Interrupt / Retry / Timeout / Cache        │
│   Durability = sync | async | exit                       │
│   interrupt() + Command(resume=...)                      │
└─────────────────────────────────────────────────────────┘
```

灵感来自 **Pregel / Apache Beam**；公共 API 风格参考 NetworkX。核心抽象：

- **Channel（通道）**：状态字段的存储单元，带版本号（`channel_versions`）与 reducer。
- **Node（节点）**：读状态、写状态的执行单元（Runnable）。
- **Super-step**：一轮「所有就绪节点并行执行 → 合并写入 → 推进版本」。
- **Checkpoint**：每个 super-step 结束时的状态快照。

### 1.2 关键源码路径

| 路径 | 作用 |
|---|---|
| `libs/checkpoint/langgraph/checkpoint/base/__init__.py` | `Checkpoint` / `BaseCheckpointSaver` / `WRITES_IDX_MAP` 契约 |
| `libs/checkpoint-sqlite/.../sqlite/__init__.py` | SQLite 实现：`checkpoints` + `writes` 两表 + WAL |
| `libs/langgraph/langgraph/types.py` | `Durability` / `interrupt` / `Command` / `RetryPolicy` / `TimeoutPolicy` / `StateSnapshot` |

---

## 2. 核心机制深潜

### 2.1 Checkpoint 数据模型（稳定性基石）

`Checkpoint` TypedDict 关键字段（`checkpoint/base/__init__.py`）：

```python
class Checkpoint(TypedDict):
    v: int                    # 格式版本
    id: str                   # 唯一且单调递增（可排序）
    ts: str                   # ISO8601
    channel_values: dict      # 各通道当前值
    channel_versions: dict    # 通道版本（单调递增）
    versions_seen: dict       # 节点 → 已见通道版本（决定下一步执行谁）
    pending_sends: list       # 待发送（Send）
```

**双表持久化**（SqliteSaver）：

```sql
checkpoints(thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
writes(thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
```

- `thread_id`：会话/线程主键；调用时必须带 `config={"configurable": {"thread_id": ...}}`。
- `parent_checkpoint_id`：形成 **checkpoint 链**，支持 time-travel / fork。
- `writes`：中间写入（含 ERROR/INTERRUPT/RESUME 特殊索引，见 `WRITES_IDX_MAP`）。

```python
WRITES_IDX_MAP = {ERROR: -1, SCHEDULED: -2, INTERRUPT: -3, RESUME: -4}
```

含义：**崩溃时可恢复到「最近完整 checkpoint + 未完成的 pending writes」**，错误与中断也是可序列化的写入，而非进程内异常。

`CheckpointMetadata.source ∈ {input, loop, update, fork}`；`step` 标记步数；`run_id` 关联一次运行。

### 2.2 Durability 模式

```python
Durability = Literal["sync", "async", "exit"]
```

| 模式 | 语义 | 适用 |
|---|---|---|
| `sync` | 下一步开始前**同步落盘** | 关键步骤、HITL 前、高风险工具 |
| `async` | 与下一步并行异步落盘 | 吞吐优先的默认路径 |
| `exit` | 仅图退出时落盘 | 批处理、可重跑任务 |

对 openmate：编码写文件/调破坏性工具前后应切 `sync`；个人助手闲聊可用 `async`。

### 2.3 Human-in-the-Loop：`interrupt` + `Command`

```python
def interrupt(value: Any) -> Any:
    """节点内抛出 GraphInterrupt，value 送给客户端；
    客户端用 Command(resume=...) 续跑。
    节点从**起始重执行**，同节点内多个 interrupt 按序号匹配 resume。
    必须启用 checkpointer。"""
```

续跑协议：

```python
graph.invoke(Command(resume={"approved": True}), config)  # 同一 thread_id
```

`Command` 还支持：

- `update=`：人工**修改状态**再继续（审查改写中间结果）
- `goto=`：跳转节点 / 发送 `Send`（map-reduce 并行）

`StateSnapshot` 暴露 `values / next / tasks / interrupts`，客户端可先 `get_state()` 审查再决定 resume。

### 2.4 错误恢复与重试

```python
@dataclass(frozen=True)
class RetryPolicy:
    initial_interval: float = 0.5
    backoff_factor: float = 2.0
    max_interval: float = 128.0
    max_attempts: int = 3
    jitter: bool = True
    retry_on: type[Exception] | Sequence | Callable  # 默认 default_retry_on
```

`TimeoutPolicy`：

- `run_timeout`：硬墙钟上限
- `idle_timeout`：无进展超时（可用 `runtime.heartbeat()` 刷新）
- `refresh_on: "auto" | "heartbeat"`

`CachePolicy`：按输入 key 缓存节点结果，避免重放昂贵 LLM 调用。

### 2.5 Streaming

```python
StreamMode = ["values", "updates", "checkpoints", "tasks", "debug", "messages", "custom"]
```

- `messages`：LLM token 级流式
- `checkpoints` / `tasks`：可观测执行轨迹
- `custom`：节点内 `StreamWriter` 自定义事件

### 2.6 中断后的状态一致性

恢复语义要点（文档 + 源码）：

1. resume 时 **整个节点重执行**（不是从中断点继续字节码），因此节点内副作用需幂等或依赖 checkpoint 外的事务。
2. 同节点多个 `interrupt` 按调用顺序匹配 resume 值列表（scoped 到 task）。
3. `pending_writes` 保留 INTERRUPT/RESUME 特殊通道，保证重放时不会重复产生业务写。

---

## 3. 稳定性 / 高可用设计

| 能力 | LangGraph 机制 | 对 openmate 借鉴 |
|---|---|---|
| Checkpoint | 每 super-step 快照 + writes 表 | 会话状态必须落盘，不能只活在内存 list |
| Resume | 同 `thread_id` 再 invoke 自动从最新检查点续 | 崩溃重启 = 重载 checkpointer + 同 thread |
| Time-travel / Fork | `checkpoint_id` + parent 链 | 「回到 3 步前重试另一工具」 |
| HITL | `interrupt` + `Command(resume/update)` | 破坏性 git 操作前强制人工确认 |
| 错误可持久化 | ERROR 写入特殊负索引 | 错误上下文跨进程可读 |
| 重试/超时 | RetryPolicy / TimeoutPolicy 挂在节点 | 工具调用层统一挂策略 |
| 观测 | stream_mode=debug + LangSmith | 生产排障 |
| 存储后端 | InMemory / Sqlite(WAL) / Postgres | 本地 SQLite 起步，Postgres 上生产 |
| 隔离 | 子图 checkpointer 可 True/False/None 继承 | 子 agent 是否共享父检查点 |

**SqliteSaver 线程安全**：`check_same_thread=False` + 内部 `threading.Lock`；文档明确同步版「不适合多线程扩展」，生产用 `AsyncSqliteSaver` 或 Postgres。

**DeltaChannel（beta）**：增量通道快照，`prune` 时必须保留 `_DeltaSnapshot` 祖先，否则静默空重建——运维剪枝时要小心。

---

## 4. 自我进化相关

- **Memory**：短期 working memory（channel 内消息）+ 长期跨 session（独立 store，README 指向 memory 文档）。
- **Subgraphs / Send**：动态 fan-out，可把「技能子图」当作可复用单元。
- **Deep Agents**：官方高层包（plan + subagents + filesystem），可作 openmate coding harness 的参考实现。

---

## 5. 对 openmate 的借鉴

### 可直接抄的设计（P0）

1. **Thread = 会话**：`thread_id` 贯穿全部状态；个人助手与编码会话各一 thread，或同一 thread 多 namespace。
2. **Checkpoint 契约**：仿 `Checkpoint + parent + writes` 双层表；即使不用 LangGraph，openmate 也应有等价的 snapshot 链。
3. **interrupt 协议**：工具执行前 `ask_user(payload)` → 挂起 → `resume(value)`；**节点幂等重入**是硬约束。
4. **Durability 分级**：写盘/部署/发消息用 `sync`；只读检索用 `async`。
5. **WRITES_IDX_MAP 思想**：把 interrupt/error 当作一等持久化写入，而不是只抛异常。

### 应避免的坑

- 节点内非幂等副作用（网络 POST、rm）在 interrupt 重放时会二次执行 → 必须先 checkpoint 再副作用，或用外部幂等键。
- 无 `thread_id` 时 checkpointer 完全不工作（静默不保存）。
- Sqlite 同步 saver 多线程场景需换 Async/Postgres。
- `prune(keep_latest)` 与 DeltaChannel 不兼容风险。

### 重构优先级建议

| 优先级 | 动作 |
|---|---|
| P0 | 会话 checkpoint 表 + thread_id；工具前 interrupt 钩子 |
| P1 | RetryPolicy/TimeoutPolicy 统一到工具执行层；stream 可观测 |
| P2 | time-travel/fork；Postgres 后端；子图隔离 |

---

## 6. 源码阅读笔记

### 关键摘录：BaseCheckpointSaver 注释

> "When a checkpointer is configured, you should pass a `thread_id` in the config... Without it, the checkpointer cannot save state, resume from interrupts, or enable time-travel debugging."

### 关键摘录：interrupt() 注释

> "The graph resumes from the start of the node, **re-executing** all logic."
> "To use an `interrupt`, you must enable a checkpointer, as the feature relies on persisting the graph state."

### 关键摘录：Durability

> `'sync'`: Changes are persisted synchronously before the next step starts.
> `'async'`: ... while the next step executes.
> `'exit'`: ... only when the graph exits.

### 评分（1–5）

| 维度 | 分 |
|---|---|
| 工具调用策略清晰度 | 3（图层不绑定工具，需自建） |
| 权限/安全边界 | 3 |
| 容错与会话恢复 | **5** |
| 上下文工程 | 4 |
| 可扩展 | 5 |
| 可观测与可评测 | 5（LangSmith） |
| 生产可用成熟度 | 5 |
