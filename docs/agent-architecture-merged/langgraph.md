# LangGraph

## 概述

LangGraph 是一个图式Agent编排框架。

**仓库**: https://github.com/langchain-ai/langgraph | **语言**: Python

## 核心架构

[详见源码]

灵感来自 **Pregel / Apache Beam**；公共 API 风格参考 NetworkX。核心抽象：

- **Channel（通道）**：状态字段的存储单元，带版本号（`channel_versions`）与 reducer。
- **Node（节点）**：读状态、写状态的执行单元（Runnable）。
- **Super-step**：一轮「所有就绪节点并行执行 → 合并写入 → 推进版本」。
- **Checkpoint**：每个 super-step 结束时的状态快照。

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

1. **Thread = 会话**：`thread_id` 贯穿全部状态；个人助手与编码会话各一 thread，或同一 thread 多 namespace。
2. **Checkpoint 契约**：仿 `Checkpoint + parent + writes` 双层表；即使不用 LangGraph，openmate 也应有等价的 snapshot 链。
3. **interrupt 协议**：工具执行前 `ask_user(payload)` → 挂起 → `resume(value)`；**节点幂等重入**是硬约束。
4. **Durability 分级**：写盘/部署/发消息用 `sync`；只读检索用 `async`。
5. **WRITES_IDX_MAP 思想**：把 interrupt/error 当作一等持久化写入，而不是只抛异常。

## 关键技术

| 路径 | 作用 |
|---|---|
| `libs/checkpoint/langgraph/checkpoint/base/__init__.py` | `Checkpoint` / `BaseCheckpointSaver` / `WRITES_IDX_MAP` 契约 |
| `libs/checkpoint-sqlite/.../sqlite/__init__.py` | SQLite 实现：`checkpoints` + `writes` 两表 + WAL |
| `libs/langgraph/langgraph/types.py` | `Durability` / `interrupt` / `Command` / `RetryPolicy` / `TimeoutPolicy` / `StateSnapshot` |

`Checkpoint` TypedDict 关键字段（`checkpoint/base/__init__.py`）：

[详见源码]

- `thread_id`：会话/线程主键；调用时必须带 `config={"configurable": {"thread_id": ...}}`。
- `parent_checkpoint_id`：形成 **checkpoint 链**，支持 time-travel / fork。
- `writes`：中间写入（含 ERROR/INTERRUPT/RESUME 特殊索引，见 `WRITES_IDX_MAP`）。

```python
WRITES_IDX_MAP = {ERROR: -1, SCHEDULED: -2, INTERRUPT: -3, RESUME: -4}
```

含义：**崩溃时可恢复到「最近完整 checkpoint + 未完成的 pending writes」**，错误与中断也是可序列化的写入，而非进程内异常。

`CheckpointMetadata.source ∈ {input, loop, update, fork}`；`step` 标记步数；`run_id` 关联一次运行。

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

> "When a checkpointer is configured, you should pass a `thread_id` in the config... Without it, the checkpointer cannot save state, resume from interrupts, or enable time-travel debugging."

> "The graph resumes from the start of the node, **re-executing** a

## 对openmate的启示

| 优先级 | 动作 |
|---|---|
| P0 | 会话 checkpoint 表 + thread_id；工具前 interrupt 钩子 |
| P1 | RetryPolicy/TimeoutPolicy 统一到工具执行层；stream 可观测 |
| P2 | time-travel/fork；Postgres 后端；子图隔离 |

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（02-langgraph.md）
- 豆包（064_langgraph.md）
- MiMo报告（langgraph.md）
