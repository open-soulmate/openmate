# SWE-agent 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/SWE-agent/SWE-agent  
> 抓取通道: cdn.jsdelivr.net/gh/SWE-agent/SWE-agent@main  
> 版本快照: main @ 2026-09-13（`agents.py` 56KB + `models.py` 38KB + `config/default.yaml` + `tools.py` + `swe_env.py` 实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供代码修复 Agent、成本硬限、重试环、ACI 工具边界与轨迹持久化借鉴

---

## 0. 诚实性说明

- **已打开实读**：
  - `sweagent/agent/agents.py`（55804 bytes，DefaultAgent / RetryAgent 全文关键路径）
  - `sweagent/agent/models.py`（37757 bytes，RetryConfig / GenericAPIModelConfig / LiteLLMModel）
  - `config/default.yaml`（3242 bytes，系统模板 + 工具 bundle + env vars）
  - `sweagent/tools/tools.py`（16743 bytes）
  - `sweagent/environment/swe_env.py`（10989 bytes）
  - `sweagent/run/run_single.py`（9182 bytes）
- 本报告基于源码实读；不发明行号。

---

## 1. 项目定位

SWE-agent 是 Princeton 大学开源的 **软件工程任务 Agent**：

- 输入：GitHub issue / PR 描述
- 输出：最小代码补丁
- 核心：ACI（Agent-Computer Interface）定制化 shell 工具
- 评测：SWE-bench 基准

---

## 2. 成本与重试硬限（models.py 实读）

### 2.1 RetryConfig

```python
class RetryConfig(PydanticBaseModel):
    """This configuration object specifies how many times to retry a failed LM API call."""
    retries: int = 20
    """Number of retries"""
    min_wait: float = 10
    """Minimum wait time between retries (random exponential wait)"""
    max_wait: float = 120
    """Maximum wait time between retries (random exponential wait)"""
```

**关键常量**：

| 常量 | 默认值 | 含义 |
|------|--------|------|
| `retries` | **20** | 最大重试次数 |
| `min_wait` | **10s** | 最小等待（随机指数） |
| `max_wait` | **120s** | 最大等待 |

### 2.2 GenericAPIModelConfig

```python
class GenericAPIModelConfig(PydanticBaseModel):
    name: str
    per_instance_cost_limit: float = Field(default=3.0, ...)
    total_cost_limit: float = Field(default=0.0, ...)
    per_instance_call_limit: int = Field(default=0, ...)
    temperature: float = 0.0
    top_p: float | None = 1.0
    ...
    retry: RetryConfig = RetryConfig()
    delay: float = 0.0
    fallbacks: list[dict[str, Any]] = []
    choose_api_key_by_thread: bool = True
    max_input_tokens: int | None = None   # 超限 → ContextWindowExceededError；0 禁用检查
    max_output_tokens: int | None = None
```

**成本硬限**：

| 常量 | 默认 | 含义 |
|------|------|------|
| `per_instance_cost_limit` | **3.0** | 单任务美元上限 |
| `total_cost_limit` | **0.0** | 总上限（0=不限） |
| `per_instance_call_limit` | **0** | 单任务调用次数（0=不限） |
| `temperature` | **0.0** | 默认贪心 |
| `choose_api_key_by_thread` | **True** | 同线程同 key，保 prompt cache |

### 2.3 成本超限异常

```python
if 0 < self.config.per_instance_cost_limit < self.stats.instance_cost:
    raise InstanceCostLimitExceededError(msg)
if 0 < self.config.total_cost_limit < GLOBAL_STATS.total_cost:
    raise TotalCostLimitExceededError(msg)
```

`GLOBAL_STATS.total_cost` 跨实例累计。

### 2.4 特殊控制 Token

```python
RETRY_WITH_OUTPUT_TOKEN = "###SWE-AGENT-RETRY-WITH-OUTPUT###"
RETRY_WITHOUT_OUTPUT_TOKEN = "###SWE-AGENT-RETRY-WITHOUT-OUTPUT###"
EXIT_FORFEIT_TOKEN = "###SWE-AGENT-EXIT-FORFEIT###"
```

对应内部异常：

```python
class _BlockedActionError(Exception): ...
class _RetryWithOutput(Exception): ...
class _RetryWithoutOutput(Exception): ...
class _ExitForfeit(Exception): ...
class _TotalExecutionTimeExceeded(Exception): ...
```

---

## 3. Agent 类型（agents.py 实读）

### 3.1 三类 Agent

```python
AgentConfig = Annotated[
    DefaultAgentConfig | RetryAgentConfig | ShellAgentConfig,
    Field(union_mode="left_to_right")
]
```

| 类型 | 职责 |
|------|------|
| `DefaultAgent` | 主循环：模板 → LLM → 工具执行 → 历史 |
| `RetryAgent` | 外层重试环，内嵌 DefaultAgent |
| `ShellAgent` | 纯 shell 交互 |

### 3.2 RetryAgent 成本联动

```python
def _setup_agent(self):
    remaining_budget = self.config.retry_loop.cost_limit - self._total_instance_stats.instance_cost
    if remaining_budget < agent_config.model.per_instance_cost_limit:
        agent_config.model.per_instance_cost_limit = remaining_budget
```

**设计要点**：外层重试环把剩余预算下发给内层 agent，防止重试烧穿总预算。

```python
if self._total_instance_stats.instance_cost > 1.1 * self.config.retry_loop.cost_limit > 0:
    # 超过 110% 硬停
```

**1.1x 容忍度**：允许 10% 超调后强制停止。

### 3.3 DefaultAgent 循环

```python
def handle_action(self, step: StepOutput) -> StepOutput:
    ...
    raise _BlockedActionError()
    raise _RetryWithOutput()
    raise _RetryWithoutOutput()
    raise _ExitForfeit()

def forward(self, history):
    ...
    raise _TotalExecutionTimeExceeded()
```

`forward_with_handling`：

- `handle_error_with_autosubmission`：错误后自动提交
- `handle_error_with_retry`：带模板的重查询
- 重试耗尽 → 退出并记录 `exit_cost`

### 3.4 提交处理

```python
def handle_submission(self, step, *, observation="", force_submission=False):
    ...

def attempt_autosubmission_after_error(self, step: StepOutput) -> StepOutput:
    ...
```

---

## 4. 默认配置（config/default.yaml 实读）

### 4.1 系统模板

```yaml
agent:
  templates:
    system_template: |-
      You are a helpful assistant that can interact with a computer to solve tasks.
    instance_template: |-
      <uploaded_files>
      {{working_dir}}
      </uploaded_files>
      I've uploaded a python code repository in the directory {{working_dir}}.
      ... PR description ...
      1. find and read code relevant to the pr_description
      2. Create a script to reproduce the error
      3. Edit the sourcecode
      4. Rerun your reproduce script
      5. Think about edgecases
```

### 4.2 工具 Bundle 与环境变量

```yaml
  tools:
    env_variables:
      PAGER: cat
      MANPAGER: cat
      LESS: -R
      PIP_PROGRESS_BAR: 'off'
      TQDM_DISABLE: '1'
      GIT_PAGER: cat
    bundles:
      - path: tools/registry
      - path: tools/edit_anthropic
      - path: tools/review_on_submit_m
    registry_variables:
      USE_FILEMAP: 'true'
    enable_bash_tool: true
    parse_function:
      type: function_calling
  history_processors:
    - type: cache_control
      last_n_messages: 2
```

**关键设计**：

- `PAGER/GIT_PAGER/MANPAGER=cat`：避免交互式分页卡死
- `TQDM_DISABLE=1`、`PIP_PROGRESS_BAR=off`：静默进度条
- `cache_control last_n_messages: 2`：仅最近 2 条走 prompt cache

---

## 5. ACI 工具边界（tools.py）

- 工具以 **bundle** 形式打包（registry / edit_anthropic / review_on_submit_m）
- `enable_bash_tool: true`：开启 bash
- `parse_function.type: function_calling`：用原生 function calling 而非文本解析
- 编辑工具针对 Anthropic 风格优化（`edit_anthropic`）

---

## 6. 失败路径汇总

| 场景 | 处理 |
|------|------|
| LLM API 失败 | 最多 20 次重试，10–120s 随机指数退避 |
| 单任务成本 > $3 | `InstanceCostLimitExceededError` |
| 总成本超限 | `TotalCostLimitExceededError` |
| 输入超 context window | `ContextWindowExceededError`（max_input_tokens=0 禁用） |
| RetryAgent 总成本 > 1.1x limit | 硬停 |
| 动作被拦截 | `_BlockedActionError` |
| 需带输出重试 | `_RetryWithOutput` / token `###SWE-AGENT-RETRY-WITH-OUTPUT###` |
| 需静默重试 | `_RetryWithoutOutput` |
| 放弃退出 | `_ExitForfeit` / token `###SWE-AGENT-EXIT-FORFEIT###` |
| 总执行时间超限 | `_TotalExecutionTimeExceeded` |
| 重试耗尽 | 退出并记录 exit_cost |

---

## 7. 对 openmate 的借鉴

### 7.1 直接可抄（P0）

1. **`per_instance_cost_limit = 3.0`**：单任务美元硬限。
2. **`RetryConfig(retries=20, min_wait=10, max_wait=120)`**：指数退避参数。
3. **外层 RetryAgent 下发剩余预算给内层**：防重试烧穿。
4. **1.1x 容忍度硬停**：允许小幅超调后强制停止。
5. **特殊控制 Token + 内部异常**：`RETRY_WITH_OUTPUT` / `EXIT_FORFEIT` 等。
6. **环境变量静默化**：`PAGER=cat` / `TQDM_DISABLE=1` / `GIT_PAGER=cat`。
7. **`cache_control last_n_messages: 2`**：仅最近消息走 prompt cache。
8. **`choose_api_key_by_thread: True`**：保 prompt cache 命中。

### 7.2 应避免的坑

- `temperature=0.0` 默认贪心：创造性任务需覆盖。
- `total_cost_limit=0` 默认不限总成本：生产必须设非零值。
- 工具 bundle 路径硬编码：需版本化。

### 7.3 重构优先级

- **P0**：成本硬限（单任务 + 总量）+ 超限异常
- **P0**：重试指数退避常量
- **P0**：预算下发（外层 → 内层）
- **P0**：控制 Token / 内部异常协议
- **P1**：环境变量静默化默认集
- **P1**：cache_control 范围
- **P2**：完整 ACI 工具 bundle

---

## 7.4 DefaultAgent 详细执行流程

```
DefaultAgent.run()
  │
  ├─ setup()
  │    ├─ 加载 system_template
  │    ├─ 加载 instance_template（注入 working_dir, problem_statement）
  │    ├─ 可选：add_demonstrations_to_history
  │    └─ add_system_message_to_history
  │
  ├─ while True:
  │    │
  │    ├─ forward(history)
  │    │    ├─ 检查 _TotalExecutionTimeExceeded
  │    │    └─ model.query(history)
  │    │         └─ LiteLLMModel._update_stats
  │    │              ├─ GLOBAL_STATS.total_cost += cost
  │    │              ├─ stats.instance_cost += cost
  │    │              ├─ InstanceCostLimitExceededError
  │    │              └─ TotalCostLimitExceededError
  │    │
  │    ├─ forward_with_handling(history)
  │    │    ├─ handle_error_with_autosubmission
  │    │    ├─ handle_error_with_retry (带模板重查询)
  │    │    └─ 重试耗尽 → 退出 + 记录 exit_cost
  │    │
  │    ├─ handle_action(step)
  │    │    ├─ 解析 action（bash / edit / submit / 特殊 token）
  │    │    ├─ _BlockedActionError → 动作被拦截
  │    │    ├─ _RetryWithOutput → 带输出重试
  │    │    ├─ _RetryWithoutOutput → 静默重试
  │    │    └─ _ExitForfeit → 放弃退出
  │    │
  │    ├─ handle_submission(step)
  │    │    └─ attempt_autosubmission_after_error
  │    │
  │    └─ add_step_to_history / add_step_to_trajectory
  │
  └─ save_trajectory()
```

---

## 7.5 RetryAgent 预算下发详细

```python
def _setup_agent(self):
    remaining_budget = (
        self.config.retry_loop.cost_limit
        - self._total_instance_stats.instance_cost
    )
    if remaining_budget < agent_config.model.per_instance_cost_limit:
        agent_config.model.per_instance_cost_limit = remaining_budget
```

```python
# step() 中的硬停检查
if self._total_instance_stats.instance_cost > 1.1 * self.config.retry_loop.cost_limit > 0:
    # 超过 110% 硬停
```

**设计要点**：

- 外层 RetryAgent 感知内层已花费
- 剩余预算下发，防止重试烧穿总预算
- 1.1x 容忍度：允许小幅超调后强制停止

---

## 7.6 环境变量静默化设计意图

```yaml
env_variables:
  PAGER: cat          # 避免 less/more 交互卡死
  MANPAGER: cat       # man 页面直接输出
  LESS: -R            # less 原始模式
  GIT_PAGER: cat      # git log/diff 直接输出
  PIP_PROGRESS_BAR: 'off'  # pip 静默
  TQDM_DISABLE: '1'   # 进度条禁用
```

**意图**：Agent 在非交互 shell 中执行命令时，任何交互式分页器都会导致挂起。强制 `cat` 绕过。

---

## 7.7 与 openmate 对照

| SWE-agent | openmate 建议 |
|-----------|---------------|
| `per_instance_cost_limit=3.0` | 单任务美元硬限 |
| `RetryConfig(retries=20, min_wait=10, max_wait=120)` | 指数退避参数 |
| RetryAgent 剩余预算下发 | 外层→内层预算传递 |
| 1.1x 容忍度硬停 | 允许小幅超调后强制停止 |
| `RETRY_WITH_OUTPUT_TOKEN` 等 | 控制 Token / 内部异常协议 |
| `PAGER=cat` / `TQDM_DISABLE=1` | 环境变量静默化默认集 |
| `cache_control last_n_messages=2` | 仅最近消息走 prompt cache |
| `choose_api_key_by_thread=True` | 保 prompt cache 命中 |
| `USE_FILEMAP=true` | 文件地图辅助导航 |
| `parse_function.type: function_calling` | 原生 function calling |
| 温度默认 0.0 | 贪心默认（创造性任务需覆盖） |

---

## 8. 源码锚点速查

```
sweagent/agent/models.py
  RetryConfig: retries=20, min_wait=10, max_wait=120
  GenericAPIModelConfig:
    per_instance_cost_limit=3.0
    total_cost_limit=0.0
    per_instance_call_limit=0
    temperature=0.0
    choose_api_key_by_thread=True
    max_input_tokens / max_output_tokens
  InstanceCostLimitExceededError / TotalCostLimitExceededError
  ContextWindowExceededError
  GLOBAL_STATS.total_cost
  LiteLLMModel._update_stats → 超限抛错

sweagent/agent/agents.py
  AgentConfig = DefaultAgentConfig | RetryAgentConfig | ShellAgentConfig
  RETRY_WITH_OUTPUT_TOKEN = "###SWE-AGENT-RETRY-WITH-OUTPUT###"
  RETRY_WITHOUT_OUTPUT_TOKEN = "###SWE-AGENT-RETRY-WITHOUT-OUTPUT###"
  EXIT_FORFEIT_TOKEN = "###SWE-AGENT-EXIT-FORFEIT###"
  _BlockedActionError / _RetryWithOutput / _RetryWithoutOutput / _ExitForfeit / _TotalExecutionTimeExceeded
  RetryAgent: remaining_budget 下发; 1.1x cost_limit 硬停
  DefaultAgent: handle_action / forward / forward_with_handling
  handle_submission / attempt_autosubmission_after_error

config/default.yaml
  PAGER=cat, MANPAGER=cat, LESS=-R, GIT_PAGER=cat
  PIP_PROGRESS_BAR=off, TQDM_DISABLE=1
  USE_FILEMAP=true
  enable_bash_tool: true
  parse_function.type: function_calling
  history_processors: cache_control last_n_messages=2

sweagent/tools/tools.py  (ACI bundle)
sweagent/environment/swe_env.py
sweagent/run/run_single.py

License: MIT
```

**本轮未打开**：reviewer.py、action_sampler.py、history_processors 全文、benchmark configs。

---

## 9. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | ACI + function_calling + bash |
| 权限/安全边界 | 3 | 工具 bundle 隔离 |
| 容错与会话恢复 | 5 | 20 次重试 + 成本硬限 + 预算下发 |
| 上下文工程 | 4 | cache_control last_n=2 |
| 可扩展（技能/MCP） | 3 | 工具 bundle |
| 可观测与可评测 | 4 | 轨迹 + exit_cost + SWE-bench |
| 生产可用成熟度 | 4 | 学术 + 工程双强 |

**综合**：**代码修复 Agent 的成本与重试工程化标杆**。openmate 必抄成本硬限、重试退避、预算下发、控制 Token 与环境变量静默化。

---

## 10. 关键链接

- 仓库：https://github.com/SWE-agent/SWE-agent  
- 相关报告：`reports/openhands.md`、`reports/aider.md`、`reports/claude-code.md`
