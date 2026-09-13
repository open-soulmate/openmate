# crewAIInc/crewAI 架构调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/crewAIInc/crewAI |
| 语言 | Python（>=3.10,<3.14） |
| License | MIT |
| 定位一句话 | 面向生产的多 Agent 自动化：**Crews**（角色自治协作）+ **Flows**（事件驱动精确控制） |
| 商业 | CrewAI AMP Suite（控制面/观测/治理） |
| 文档 | docs.crewai.com（本报告依据 `docs/edge/en/concepts/*.mdx` + README） |

> 对 openmate：CrewAI 在 **checkpoint/resume/fork、统一 Memory、工具失败策略** 上已产品化，比 AutoGen 更接近「可恢复生产工作流」，是 hybrid agent 中「个人自动化/多角色流水线」的强参考。

---

## 1. 系统架构

### 1.1 双轨模型

```
┌─────────────────────────────────────────────────────┐
│ Flow（事件驱动工作流）                                 │
│  @start / @listen / @router / or_ / and_             │
│  Structured State (Pydantic) + @persist              │
│  @human_feedback 暂停点                               │
├─────────────────────────────────────────────────────┤
│ Crew（角色扮演协作）                                   │
│  Agent(role,goal,backstory,tools,memory)             │
│  Task(description,expected_output,context,guardrail) │
│  Process.sequential | Process.hierarchical           │
├─────────────────────────────────────────────────────┤
│ 统一 Memory（LanceDB） + Knowledge + Checkpoint       │
│ Tools（BaseTool / @tool / MCP / typed outputs）       │
└─────────────────────────────────────────────────────┘
```

### 1.2 目录/脚手架

- `crewai create crew` → JSON-first：`agents/*.jsonc` + `crew.jsonc`
- `--classic` → YAML + `@CrewBase`
- `crewai create flow` → Flow 内嵌多个 Crew

### 1.3 关键概念路径

| 文档/模块 | 内容 |
|---|---|
| `concepts/agents.mdx` | Agent 属性、上下文窗口、直接 kickoff |
| `concepts/tasks.mdx` | Task 依赖、guardrail、结构化输出 |
| `concepts/processes.mdx` | sequential / hierarchical |
| `concepts/flows.mdx` | 事件流、状态、@persist、HITL |
| `concepts/memory.mdx` | 统一 Memory API |
| `concepts/checkpointing.mdx` | **恢复/分叉**（稳定性核心） |
| `concepts/tools.mdx` | 工具与 ToolFailure 策略 |

---

## 2. 核心机制深潜

### 2.1 Agents / Tasks / Process

**Agent 关键稳定性参数**：

| 参数 | 默认 | 作用 |
|---|---|---|
| `max_iter` | 20 | 强制产出答案上限 |
| `max_execution_time` | None | 秒级超时 |
| `max_rpm` | None | 限流 |
| `max_retry_limit` | 2 | 出错重试 |
| `respect_context_window` | True | 超长自动摘要（False 则报错停） |
| `cache` | True | 工具结果缓存 |
| `allow_delegation` | False | 任务委派 |
| `reasoning` / `max_reasoning_attempts` | False | 执行前反思计划 |

**Task**：

- `context=[prior_tasks]`：显式依赖
- `async_execution`：并行任务，后置任务通过 context 汇合
- `human_input`：人工审最终答案
- `guardrail` / `guardrails`：函数或 LLM 描述校验，失败反馈 agent 重试（`guardrail_max_retries` 默认 3）
- `output_pydantic` / `output_json`：结构化输出
- `output_file` + `create_directory`

**Process**：

- **sequential**：按任务列表顺序，输出作后续上下文
- **hierarchical**：`manager_llm` 或 `manager_agent` 统一规划、分配、验收（任务可不预分配）

### 2.2 Checkpointing（稳定性 KEY）

`concepts/checkpointing.mdx` 核心设计：

**Checkpoint 捕获内容**：crew/flow/agent 全量状态——配置、agent 记忆与知识源、任务进度、中间输出、内部属性 + kickoff 输入 + 事件历史 + **lineage ID**。

**事件驱动写入**：

```python
crew = Crew(..., checkpoint=True)  # 默认 on_events=["task_completed"]
# 或
checkpoint=CheckpointConfig(
    location="./my_checkpoints",
    on_events=["task_completed", "crew_kickoff_completed"],
    max_checkpoints=5,
    provider=SqliteProvider(),  # 或 JsonProvider()
)
```

**恢复**：

```python
result = crew.kickoff(
    from_checkpoint=CheckpointConfig(
        restore_from="./.checkpoints/<ts>_<uuid>.json",
    ),
)
# 已完成任务跳过；记忆/知识水合；下游用原输出继续
```

**分叉**：

```python
crew = Crew.fork(config, branch="experiment-a")
result = crew.kickoff(inputs={"strategy": "aggressive"})
```

**继承模型**：`Crew`/`Flow`/`Agent` 都接受 `checkpoint`；子默认继承父，可 `checkpoint=False` 退出。

**存储**：

- `JsonProvider`：一文件一检查点，人类可读
- `SqliteProvider`：单库 + WAL，适合高频
- 自动写入失败仅 log（best-effort）；**手动** `state.checkpoint()` 失败会抛出

**CLI**：`crewai checkpoint` TUI 可浏览、**Resume**、**Fork**，可编辑 Inputs 与已完任务输出后分叉（下游失效重跑）。

**事件目录**极其丰富：Task/Crew/Agent/Flow/LLM/Tool/Memory/Knowledge/MCP/信号（SIGTERM…）均可作 checkpoint 触发；`["*"]` + 高频事件需配 `max_checkpoints`。

### 2.3 Flow Persistence（另一条恢复路径）

`@persist`（默认 SQLiteFlowPersistence）：

- 类级或方法级
- `kickoff(inputs={"id": uuid})` → **resume**（同 id 延伸历史）
- `kickoff(restore_from_state_id=uuid)` → **fork**（新 state.id，旧历史保留）
- 与 `from_checkpoint` 互斥；同时传会 `ValueError`

### 2.4 Human-in-the-Loop

- Task：`human_input=True`
- Flow：`@human_feedback(message=..., emit=["approved","rejected",...], llm=...)`
  - 暂停收集反馈；LLM 将自由文本归并到 emit 标签并触发对应 `@listen`
  - 支持异步自定义 provider（Slack/webhook）
  - `self.human_feedback_history` 可追溯

### 2.5 统一 Memory

- 单一 `Memory` 类替代 short/long/entity 分家
- `remember` / `recall` / `forget` / `extract_memories`
- **层级 scope 树**（类文件系统 `/project/alpha`、`/agent/researcher`）
- **Slice**：跨多个 scope 的只读/读写视图
- **复合打分**：`semantic + recency(半衰期) + importance`
- **Consolidation**：相似度 >0.85 时 LLM 决定 keep/update/delete/insert_new
- **非阻塞写**：`remember_many` 后台线程；`recall` 前 `drain_writes()` 读屏障；crew `kickoff` finally 排空
- 默认嵌入 `text-embedding-3-large`；存储 LanceDB `./.crewai/memory`
- LLM 分析失败**优雅降级**（不抛，落默认 scope `/`）
- 本地/隐私：Ollama LLM + Ollama embedder

### 2.6 Tools 与失败策略

- `BaseTool` 子类 / `@tool` 装饰器；异步工具自动适配
- **Typed outputs**：Pydantic 输出模型给 agent JSON 字段；直接 Python 调用拿原对象
- **缓存**：`cache_function` 可定制
- **ToolFailure**（区别于「成功返回的错误字符串」）：

```python
return ToolFailure(message=..., code=..., retryable=...)
```

**策略链**：`tool → task → agent → crew → warn`

| Policy | 行为 |
|---|---|
| `ignore` | 不记不报 |
| `warn`（默认） | 记录 + `ToolFailureDetectedEvent` + 继续 |
| `raise` | 中止 `ToolExecutionFailedError` |

下游：`result.has_tool_failures` / `result.tool_failures`；事件总线可实时拦截。

### 2.7 错误恢复汇总

| 机制 | 作用 |
|---|---|
| Checkpoint / resume / fork | 任务级崩溃续跑与 what-if |
| `@persist` Flow | 方法级状态恢复 |
| `max_retry_limit` / guardrail 重试 | LLM 输出质量 |
| `respect_context_window` | 上下文溢出自动摘要 |
| ToolFailurePolicy | 工具失败可配置是否致命 |
| max_iter / max_rpm / max_execution_time | 防失控 |
| SIGTERM 等信号事件 | 优雅停机可挂钩 checkpoint |

---

## 3. 稳定性 / 高可用对比

| 能力 | CrewAI | vs LangGraph | vs AutoGen |
|---|---|---|---|
| 自动 checkpoint | 事件驱动，task 粒度 | LangGraph 每 super-step，更细 | AutoGen 仅手动 state |
| Resume | `from_checkpoint=` | 同 thread_id 续跑 | load_state |
| Fork | `Crew.fork` + TUI | checkpoint 链 + Command goto | 无原生 |
| HITL | human_input / @human_feedback | interrupt 更底层精确 | 弱 |
| 错误可持久化 | checkpoint 含失败事件可选 | ERROR 写入通道 | 无 |
| 工具失败策略 | 显式 ToolFailure 三级 | 需自建 | 需自建 |
| 记忆 | 统一 Memory + scope | 需组合 store | AG2 知识库更专 |
| 存储 | JSON / SQLite | SQLite / Postgres | 应用层 |

---

## 4. 自我进化

- Memory 跨 run 累积（LanceDB 落盘）→ 个人助手长期画像
- Knowledge sources + Skills（官方 skills 仓库教 coding agent 用 CrewAI）
- MCP / A2A 支持（事件目录含 a2a_*）
- AMP 商业闭环：tracing、治理

对 openmate：**Memory scope 树 + checkpoint fork** 很适合「个人偏好写入 / 编码任务分叉试验」。

---

## 5. 对 openmate 的借鉴

### 可直接抄（P0）

1. **CheckpointConfig 语义**：`location + on_events + max_checkpoints + provider + restore_from`；默认 `task_completed` 粒度。
2. **Fork lineage**：恢复时带 branch/lineage，避免覆盖原 run。
3. **ToolFailure + 三级策略**：coding agent 必备，禁止把 stderr 当成功文本。
4. **Guardrail 链**：结构化校验失败回灌 agent，而不是整任务崩。
5. **respect_context_window**：个人长对话默认 True。
6. **读屏障（drain before recall）**：记忆一致性小模式。

### 应避免

- 自动 checkpoint 写失败静默（应用层应至少告警）
- 高频 `on_events=["*"]` 不配 max_checkpoints
- 默认 OpenAI 嵌入维数变更导致旧库不兼容（需 reset-memories）
- hierarchical 全靠 manager LLM 的隐式分配在关键路径上不可控（应用 Flow 固定关键步骤）

### 重构优先级

| 优先级 | 动作 |
|---|---|
| P0 | 工具失败策略 + 任务完成 checkpoint + resume API |
| P1 | Flow 式关键路径控制 + HITL 审批门 |
| P2 | 统一记忆 scope/slice；fork TUI；SQLite 高频检查点 |

---

## 6. 源码/文档阅读笔记

### Checkpoint 恢复语义（文档原文要点）

> Restoring rebuilds that state and continues. Completed tasks are skipped, memory and knowledge are rehydrated, and downstream work runs against the same outputs the original run produced. Forking does the same restore under a new lineage...

### 最小恢复示例

```python
crew = Crew(agents=[researcher, writer], tasks=[...], checkpoint=True)
result = crew.kickoff()  # 中断后
result = crew.kickoff(from_checkpoint=CheckpointConfig(
    restore_from="./.checkpoints/<timestamp>_<uuid>.json"))
```

### Flow + Crew 组合（生产推荐）

确定性步骤用 Flow `@listen/@router`，需要自治的段落 `crew.kickoff()`；状态放 Pydantic `Flow[State]`。

### 评分（1–5）

| 维度 | 分 |
|---|---|
| 工具调用策略清晰度 | **5**（ToolFailure/缓存/typed out） |
| 权限/安全边界 | 3（代码执行已迁 E2B/Modal 沙箱） |
| 容错与会话恢复 | **4.5** |
| 上下文工程 | 4.5（记忆+context window） |
| 可扩展 | 4.5（MCP/A2A/Skills） |
| 可观测与可评测 | 4（事件总线+AMP） |
| 生产可用成熟度 | 4 |
