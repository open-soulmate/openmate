# langchain-ai/deepagents — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/langchain-ai/deepagents  
> 抓取通道: cdn.jsdelivr.net/gh/langchain-ai/deepagents@main  
> 版本快照: main @ 2026-09-13；文件树 346 files  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供「深度编码 Agent」中间件栈 / 虚拟文件系统 / 摘要 / 子 Agent / HITL 借鉴

---

## 0. 诚实性说明

- 包真实路径是 `libs/deepagents/deepagents/`（**不是** `python/deepagents/`；后者 404）。
- 成功拉取：`graph.py`（47KB）、`middleware/{filesystem,memory,subagents,summarization,skills,__init__}.py`、`backends/{protocol,filesystem}.py`、`pyproject.toml`。
- `base_prompt.md` 404；system prompt 全文不引用，仅引用 `graph.py` 中的组装逻辑。
- 依赖 LangGraph / LangChain agents middleware（`from langchain.agents.middleware import HumanInTheLoopMiddleware, InterruptOnConfig`）。

---

## 1. 系统架构

### 1.1 定位

在 LangGraph 之上打包的「深度工作 Agent」：文件系统工具 + 记忆 + 子 Agent + 自动摘要 + Skills，开箱即得 Claude Code 式循环。

### 1.2 源码布局

| 路径 | 职责 | 大小 |
|------|------|------|
| `libs/deepagents/deepagents/graph.py` | `create_deep_agent` / `DeepAgentState` | 47372 B |
| `libs/deepagents/deepagents/middleware/filesystem.py` | 虚拟 FS 工具 | 160304 B |
| `libs/deepagents/deepagents/middleware/memory.py` | 长期记忆 | 18045 B |
| `libs/deepagents/deepagents/middleware/subagents.py` | 子 Agent | 40563 B |
| `libs/deepagents/deepagents/middleware/summarization.py` | 上下文压缩 | 95800 B |
| `libs/deepagents/deepagents/middleware/skills.py` | 技能加载 | 39776 B |
| `libs/deepagents/deepagents/middleware/patch_tool_calls.py` | 工具调用修补 | — |
| `libs/deepagents/deepagents/backends/protocol.py` | 存储后端协议 | 36087 B |
| `libs/deepagents/deepagents/backends/filesystem.py` | 本地 FS 后端 | 71153 B |
| `libs/deepagents/deepagents/backends/local_shell.py` / `sandbox.py` / `state.py` / `store.py` / `composite.py` | 其它后端 | 树确认 |
| `libs/deepagents/pyproject.toml` | 元数据 | 6409 B |

测试：`tests/evals/test_{file_operations,hitl,memory,skills,subagents,summarization,system_prompt}.py` — 表明这些是**一等可评测能力**。

---

## 2. DeepAgentState 与 Checkpoint 增长（关键设计）

### 2.1 类（graph.py L73）

```python
class DeepAgentState(AgentState):
    """AgentState with `DeltaChannel` on messages to reduce checkpoint growth from O(N²) to O(N)."""
```

**含义：** LangGraph 默认每步全量快照 messages → checkpoint 体积 O(N²)。Deepagents 用 **DeltaChannel** 只存增量 → O(N)。这是长会话编码 Agent 的关键优化。

### 2.2 默认模型（L143–182）

```python
def _build_default_model() -> ChatAnthropic:   # L143
def get_default_model() -> ChatAnthropic:      # L166
```

默认 Claude；可覆盖。

---

## 3. 中间件栈组装（graph.py）

### 3.1 import 的中间件（L13–63）

```python
from langchain.agents.middleware import HumanInTheLoopMiddleware, InterruptOnConfig
from langchain.agents.middleware.types import AgentMiddleware
from deepagents.middleware.async_subagents import AsyncSubAgent, AsyncSubAgentMiddleware
from deepagents.middleware.filesystem import FilesystemMiddleware, FilesystemPermission
from deepagents.middleware.memory import MemoryMiddleware
from deepagents.middleware.patch_tool_calls import PatchToolCallsMiddleware
from deepagents.middleware.skills import SkillsMiddleware
from deepagents.middleware.subagents import SubAgentMiddleware, ...
from deepagents.middleware.summarization import create_summarization_middleware
from deepagents.middleware._fs_interrupt import _build_interrupt_on_from_permissions
from deepagents.middleware._prompt_caching import append_prompt_caching_middleware
from deepagents.middleware._state import private_state_field_names
from deepagents.middleware._tool_exclusion import _ToolExclusionMiddleware
```

### 3.2 自定义合并（L204–221）

```python
def _apply_custom_middleware(base, custom, ...):
    """Merge custom middleware into the base stack by name."""
    replacements: dict[str, AgentMiddleware] = {}
```

按 **name** 替换默认栈，允许用户注入/覆盖单一中间件。

### 3.3 排除中间件

```python
from deepagents._excluded_middleware import (
    _apply_excluded_middleware,
    _validate_excluded_middleware_config,
    _verify_excluded_middleware_coverage,
)
```

可配置「排除某中间件」，并**验证覆盖率**防止误排除。

---

## 4. FilesystemMiddleware

### 4.1 能力

虚拟 FS 工具集：`ls / read / write / edit / glob / grep` 等（160KB 实现）。

### 4.2 权限与 HITL

```python
class FilesystemPermission: ...
_build_interrupt_on_from_permissions(...)   # graph.py L45
```

权限模型可转成 `InterruptOnConfig`：危险路径写操作 → **中断等人批准**。

### 4.3 后端

```
backends/protocol.py    # 协议
backends/filesystem.py  # 本地盘
backends/sandbox.py     # 沙箱
backends/local_shell.py # shell
backends/composite.py   # 组合
backends/state.py / store.py
```

同一工具面可切换本地 / 沙箱后端。

---

## 5. SummarizationMiddleware（上下文压缩）

### 5.1 默认触发（summarization.py L34）

```python
trigger=("fraction", 0.85),
```

**token 使用超过上下文的 85%** 时自动压缩。

### 5.2 其它模式

- 支持 fraction / 绝对 token / 字典 `TriggerClause` AND 语义（L155–156）
- 也支持**手动触发**（agent 或 HITL 批准后）

### 5.3 Prompt

```python
DEEPAGENTS_DEFAULT_SUMMARY_PROMPT = DEFAULT_SUMMARY_PROMPT.replace(...)  # L113
```

基于 LangChain `DEFAULT_SUMMARY_PROMPT`，保留 `<messages>` 标记契约（docstring L110–111 称其为 load-bearing contract）。

### 5.4 相关常量 import

```python
_DEFAULT_MESSAGES_TO_KEEP,
_DEFAULT_TRIM_TOKEN_LIMIT,
DEFAULT_SUMMARY_PROMPT,
TokenCounter,
count_tokens_approximately,  # langchain_core.messages.utils
```

具体数值未在本轮摘到文件内的赋值行，**不写死**。

---

## 6. MemoryMiddleware

`middleware/memory.py`（18KB）：长期记忆工具（save/search notes），与 LangGraph thread 短期状态分离。

---

## 7. SubAgents

### 7.1 同步

`SubAgentMiddleware`：主 Agent 可把子任务委派给配置的 subagent（YAML 或代码定义）。examples 中有 `subagents.yaml`。

### 7.2 异步

`AsyncSubAgent` / `AsyncSubAgentMiddleware`：后台并行子任务。

---

## 8. SkillsMiddleware

`skills.py`：加载 `skills/<name>/SKILL.md`，把可复用技能注入 prompt / 工具。examples：`skills/blog-post/SKILL.md`、`skills/query-writing/SKILL.md`。

---

## 9. PatchToolCallsMiddleware

`patch_tool_calls.py`：修补模型输出的工具调用格式错误（缺参数、错误 JSON），提高鲁棒性。

---

## 10. 超时 / 重试 / 限制

| 项 | 值 | 来源 |
|----|-----|------|
| 摘要触发 | **fraction 0.85** | summarization.py L34 |
| 消息保留 / trim 上限 | `_DEFAULT_MESSAGES_TO_KEEP` / `_DEFAULT_TRIM_TOKEN_LIMIT` | import 存在；数值未摘到 |
| 默认模型 | ChatAnthropic | graph.py L143 |
| Checkpointer | LangGraph `Checkpointer`（可传入） | graph.py L30 |
| 文件写 HITL | FilesystemPermission → InterruptOnConfig | graph.py L45 |

Agent 步数上界：继承 LangGraph `recursion_limit`（RunnableConfig），deepagents 未覆盖为新常量。

---

## 11. 崩溃恢复

```
LangGraph checkpointer 开启时
  → 每步写 Checkpoint（channel_values + versions_seen + pending_writes）
  → DeepAgentState.DeltaChannel 降低 messages 快照开销 O(N²)→O(N)
  → 崩溃后按 thread_id 恢复

虚拟文件系统
  → backends/filesystem.py 写真实盘 → 跨崩溃存活
  → sandbox 后端取决于沙箱生命周期

MemoryMiddleware
  → 独立持久化，跨 thread 存活
```

**这是本批中崩溃恢复设计最完整的一档**（借 LangGraph + 自研 DeltaChannel）。

---

## 12. 失败路径

```
摘要触发
  → 压缩旧消息，保留最近

文件写需批准
  → InterruptOnConfig → UserInterrupt → HITL resume

子 Agent 失败
  → 错误作为 tool result 回主 Agent

工具调用格式坏
  → PatchToolCallsMiddleware 尝试修复

排除中间件配置非法
  → _validate_excluded_middleware_config / _verify_excluded_middleware_coverage 失败
```

---

## 13. 详细中间件栈与 checkpoint 优化

### 13.1 默认中间件栈（从 graph.py import 归纳）

```
create_deep_agent(...)
  → base = [
        PatchToolCallsMiddleware,          # 修工具调用格式
        FilesystemMiddleware(permissions), # 虚拟 FS + 可选 HITL
        MemoryMiddleware,                  # 长期记忆工具
        SkillsMiddleware,                  # SKILL.md 加载
        SubAgentMiddleware / AsyncSubAgentMiddleware,
        create_summarization_middleware(trigger=("fraction", 0.85)),
        HumanInTheLoopMiddleware(InterruptOnConfig),  # 若配置
        append_prompt_caching_middleware,
        _ToolExclusionMiddleware,
    ]
  → _apply_custom_middleware(base, user_middleware)  # 按 name 替换
  → _apply_excluded_middleware(...)
  → _verify_excluded_middleware_coverage(...)
```

### 13.2 DeltaChannel：O(N²) → O(N)

```python
class DeepAgentState(AgentState):
    """AgentState with `DeltaChannel` on messages to reduce
    checkpoint growth from O(N²) to O(N)."""   # L73
```

LangGraph 默认每 super-step 全量快照 `messages` 列表 → N 步后 checkpoint 体积 O(N²)。DeltaChannel 只存增量 → 线性。对长编码会话（数百步）是数量级差异。

### 13.3 FilesystemPermission → HITL

```python
from deepagents.middleware._fs_interrupt import _build_interrupt_on_from_permissions
# graph.py L45
```

```
用户配置 permissions（如禁止写 /etc）
  → 危险路径写操作
  → _build_interrupt_on_from_permissions 生成 InterruptOnConfig
  → LangGraph interrupt()
  → 人工批准/拒绝
  → resume
```

### 13.4 摘要触发细节

```python
# summarization.py L34
create_summarization_middleware(
    trigger=("fraction", 0.85),  # token 占比
    ...
)
# 也支持：
# trigger=("tokens", N)
# trigger=TriggerClause(...)  # AND 语义，L155
```

`count_tokens_approximately`（langchain_core.messages.utils）用于估算，避免每次精确计数。

### 13.5 排除中间件的安全网

```python
_validate_excluded_middleware_config
_verify_excluded_middleware_coverage   # graph.py L34-37
```

防止用户排除关键中间件导致功能静默缺失。

### 13.6 与 openclaw.md 参考架构对比

| 维度 | openclaw | deepagents |
|------|----------|------------|
| 循环 | embedded-agent-runner | LangGraph + AgentMiddleware |
| 压缩 | compaction safeguard + context pruning | fraction 0.85 summarization |
| 工具策略 | sandbox + approvals | FilesystemPermission + HITL |
| checkpoint | SQLite per agent | LangGraph Checkpointer |
| checkpoint 优化 | 未在参考中提及 O(N²) | **DeltaChannel O(N)** |
| 技能 | Skills Loader + Workshop | SkillsMiddleware + SKILL.md |

deepagents 的 DeltaChannel 是 openclaw 报告中未覆盖的优化点，值得 openmate 借鉴。

---

## 14. 与 openmate 映射

| 需求 | deepagents 机制 | 可复用度 |
|------|-----------------|----------|
| 编码 Agent 循环 | FilesystemMiddleware 工具面 | **高** |
| checkpoint 体积 | DeltaChannel O(N) | **高** |
| 自动压缩 | trigger fraction 0.85 | 高 |
| 危险写 HITL | FilesystemPermission → interrupt | 高 |
| 子任务委派 | SubAgent / AsyncSubAgent | 高 |
| 技能包 | SkillsMiddleware + SKILL.md | 高 |
| 与 LangGraph 解耦 | 强依赖 | 中 |

### 14.1 可直接借鉴的设计

1. **DeltaChannel**：长会话 checkpoint 线性化。
2. **中间件按 name 替换**：`_apply_custom_middleware`。
3. **排除中间件需覆盖率校验**。
4. **fraction 0.85 摘要默认**。
5. **FilesystemPermission → InterruptOnConfig**。

### 14.2 不应借鉴

1. 强依赖 LangGraph / LangChain middleware 类型。
2. 默认 ChatAnthropic，多模型需覆盖 `get_default_model`。
3. 中间件栈长，调试链路深。

---

## 15. 常量与符号速查表

| 符号 | 位置 | 值/含义 |
|------|------|---------|
| `DeepAgentState` | graph.py L73 | DeltaChannel，checkpoint O(N²)→O(N) |
| 摘要默认触发 | summarization.py L34 | `("fraction", 0.85)` |
| `DEEPAGENTS_DEFAULT_SUMMARY_PROMPT` | summarization.py L113 | 替换 DEFAULT_SUMMARY_PROMPT |
| `TriggerClause` | summarization.py L155 | AND 语义 TypedDict |
| `_DEFAULT_MESSAGES_TO_KEEP` | import | 数值未摘到 |
| `_DEFAULT_TRIM_TOKEN_LIMIT` | import | 数值未摘到 |
| 默认模型 | graph.py L143/L166 | `ChatAnthropic` |
| HITL 来源 | graph.py L13 | `HumanInTheLoopMiddleware, InterruptOnConfig` |
| Checkpointer | graph.py L30 | langgraph.types.Checkpointer |
| 权限→中断 | graph.py L45 | `_build_interrupt_on_from_permissions` |
| 中间件按 name 替换 | graph.py L204 | `_apply_excluded_middleware` / `_apply_custom_middleware` |
| 包路径 | `libs/deepagents/deepagents/` | 非 python/ |
| 测试覆盖 | tests/evals/test_*.py | fs/hitl/memory/skills/subagents/summary/prompt |

### 后端矩阵

```
backends/protocol.py     # 协议
backends/filesystem.py   # 本地盘
backends/sandbox.py      # 沙箱
backends/local_shell.py  # shell
backends/composite.py    # 组合
backends/state.py / store.py
```

---

## 16. 源码锚点速查

```
libs/deepagents/deepagents/graph.py
  L13  HumanInTheLoopMiddleware, InterruptOnConfig
  L30  from langgraph.types import Checkpointer
  L45  _build_interrupt_on_from_permissions
  L73  class DeepAgentState(AgentState)  # DeltaChannel O(N²)→O(N)
  L143 _build_default_model → ChatAnthropic
  L204 _apply_custom_middleware（按 name 替换）

libs/deepagents/deepagents/middleware/summarization.py
  L34  trigger=("fraction", 0.85)
  L113 DEEPAGENTS_DEFAULT_SUMMARY_PROMPT
  L155 TriggerClause（AND 语义）

libs/deepagents/deepagents/middleware/filesystem.py
  FilesystemMiddleware / FilesystemPermission

libs/deepagents/deepagents/middleware/memory.py
libs/deepagents/deepagents/middleware/subagents.py
libs/deepagents/deepagents/middleware/skills.py
libs/deepagents/deepagents/middleware/patch_tool_calls.py
libs/deepagents/deepagents/backends/{protocol,filesystem,sandbox,local_shell}.py

tests/evals/test_{file_operations,hitl,memory,skills,subagents,summarization,system_prompt}.py
```

---

## 15. 诚实性备注

`trigger=("fraction", 0.85)`、`DeepAgentState` 的 O(N²)→O(N) docstring、`ChatAnthropic` 默认、中间件符号均为源码实读。`_DEFAULT_MESSAGES_TO_KEEP` / `_DEFAULT_TRIM_TOKEN_LIMIT` 的具体整数赋值行未在本轮定位到，故只列符号不写数值。
