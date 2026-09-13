# PromptFlow 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/microsoft/promptflow  
> 抓取通道: cdn.jsdelivr.net/gh/microsoft/promptflow@main  
> 版本快照: main @ 2026-09-13（README + `src/promptflow-core/promptflow/executor/_script_executor.py` 实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 LLM 流程执行器、Flex Flow、错误分类、批处理与评测借鉴

---

## 0. 诚实性说明

- **已打开实读**：
  - `README.md`（全量）
  - `src/promptflow-core/promptflow/executor/_script_executor.py`（27KB，ScriptExecutor 全文关键路径）
- jsDelivr flat listing 对 promptflow 返回 403；部分深层路径 404。
- 本报告基于 README + ScriptExecutor 实读；不发明行号。

---

## 1. 项目定位（README 实读）

PromptFlow 是微软开源的 **LLM 应用开发与评测工具链**：

- 可视化 / 代码双模式编排 LLM 流程
- 批处理执行 + 指标评测
- VS Code 扩展 + CLI + Python SDK
- 与 Azure AI 集成

核心概念：

| 概念 | 说明 |
|------|------|
| Flow | 一个 LLM 应用（DAG 或 Flex Python） |
| Tool | 可复用节点（LLM / Python / Prompt） |
| Connection | 服务凭据（OpenAI / Azure OpenAI 等） |
| Run | 一次执行（单条或批量） |
| Evaluation | 对 Run 输出打分 |

---

## 2. 系统架构

### 2.1 包结构（README + 已知路径）

```
promptflow/
├── src/promptflow-core/     # 核心执行器
│   └── promptflow/executor/
│       └── _script_executor.py   # Flex Flow 执行器
├── src/promptflow-devkit/   # VS Code / CLI / 本地开发
├── src/promptflow-azure/    # Azure AI 集成
└── src/promptflow-tools/    # 内置工具集
```

### 2.2 双执行模型

1. **DAG Flow**：YAML 声明节点图，执行器按拓扑调度。
2. **Flex Flow**：纯 Python 函数/类作为入口，`ScriptExecutor` 直接调用。

---

## 3. ScriptExecutor 深潜（_script_executor.py 实读）

### 3.1 类定义与超时常量

```python
class ScriptExecutor(FlowExecutor):
    def __init__(self, ...):
        ...
        self._line_timeout_sec = 600
```

**关键常量**：`_line_timeout_sec = 600`（单行执行 10 分钟硬超时）。

### 3.2 入口解析

```python
def _parse_entry_func(self):
    # 加载 Python 模块
    # 函数入口 → 直接绑定
    # 类入口 → 需有 __call__ 方法，否则:
    #   raise PythonLoadError(
    #     message_format="Python class entry '{func_name}' does not have __call__ method."
    #   )
```

失败路径：

- `PythonLoadError`：模块加载失败 / 类无 `__call__`
- `FlowEntryInitializationError`：类初始化 kwargs 解析失败
- `InvalidFlexFlowEntry`：`_parse_flow_file` 无法识别入口
- `InvalidAggregationFunction`：聚合函数签名不合法
- `InvalidModelConfigValueType`：ModelConfig 值类型错误

### 3.3 单行执行错误分类

```python
def _exec_line(self, ...):
    try:
        output = self._func(**inputs)
    except Exception as e:
        # We assume the error comes from user's code.
        # For these cases, raise ScriptExecutionError, which is classified as UserError
        # and shows stack trace in the error message
        error_type_and_message = f"({e.__class__.__name__}) {e}"
        raise ScriptExecutionError(
            message_format="Execution failure in '{func_name}': {error_type_and_message}",
            error_type_and_message=error_type_and_message,
            error=e,
        )
```

**设计要点**：用户代码异常 → `ScriptExecutionError` → 分类为 **UserError**，带完整栈，便于排障。

### 3.4 聚合执行

```python
def exec_aggregation(self, inputs):
    try:
        output = self._aggr_func(**inputs)
    except Exception as e:
        error_type_and_message = f"({e.__class__.__name__}) {e}"
        # ExceptionPresenter.create(e).to_dict(include_debug_info=True)
        logger.warning(f"Failed to execute aggregation function with error: {error}")
```

聚合失败 **不抛出**，只 warning + 记录结构化错误（与单行执行不同）。

### 3.5 异步与流式

- `exec_line_async` / `_exec_line_async`：异步单行
- `_stringify_generator_output` / `_stringify_generator_output_async`：生成器输出字符串化
- `enable_streaming_for_llm_flow(stream_required: Callable[[], bool])`：按需开流

### 3.6 连接与 ModelConfig 解析

```python
def _resolve_init_kwargs(self, c: type, init_kwargs: dict): ...
def _resolve_connection_params(self, connection_params, init_kwargs, resolved_init_kwargs): ...
def _resolve_model_config_params(...):
    if invalid:
        raise InvalidModelConfigValueType(...)
```

连接凭据与模型配置在执行器初始化时解析，失败即启动失败（fail-fast）。

---

## 4. README 能力矩阵

| 能力 | 说明 |
|------|------|
| 可视化编辑 | VS Code 打开 flow 目录 |
| 批处理 | `pf run create --data data.jsonl` |
| 评测 | 内置 evaluators + 自定义 metric |
| 版本 | flow 目录可版本化（YAML + Python） |
| 云 | Azure AI 一键上云 |

---

## 5. 失败路径汇总

| 错误类型 | 触发 | 处理 |
|----------|------|------|
| `PythonLoadError` | 模块/入口加载失败 | 启动失败，fail-fast |
| `FlowEntryInitializationError` | 类 init kwargs 失败 | 启动失败 |
| `InvalidFlexFlowEntry` | flow 文件无合法入口 | 启动失败 |
| `InvalidAggregationFunction` | 聚合函数签名错 | 启动失败 |
| `InvalidModelConfigValueType` | ModelConfig 类型错 | 启动失败 |
| `ScriptExecutionError` | 用户代码运行时异常 | UserError + 完整栈 |
| 聚合异常 | `_aggr_func` 抛错 | warning + 结构化错误，**不中断** |
| 行超时 | `_line_timeout_sec=600` | 行级超时 |

---

## 6. 对 openmate 的借鉴

### 6.1 直接可抄（P0）

1. **错误三分类**：启动 fail-fast / 用户代码 UserError / 聚合降级 warning。
2. **`_line_timeout_sec = 600`**：单行硬超时默认值。
3. **入口双模式**：函数入口 vs 类入口（需 `__call__`）。
4. **ExceptionPresenter.to_dict(include_debug_info=True)**：结构化错误导出。
5. **连接与 ModelConfig 初始化时解析**：fail-fast，不带病运行。

### 6.2 应避免的坑

- 聚合失败静默 warning：生产需 metrics 告警，否则指标丢失无人知。
- jsDelivr 对超大微软 monorepo 403：研究需 clone 兜底。
- Flex Flow 与 DAG 双模型增加理解成本。

### 6.3 重构优先级

- **P0**：执行器错误分类（System / User / Degraded）
- **P0**：单行/单步硬超时常量
- **P0**：入口合法性校验 fail-fast
- **P1**：批处理 + 行级错误不中断整体
- **P1**：聚合/汇总降级路径
- **P2**：可视化 flow 编辑器

---

## 7. 源码锚点速查

```
README.md
  概念: Flow / Tool / Connection / Run / Evaluation
  双模式: DAG Flow + Flex Flow
  VS Code + CLI + Python SDK
  Azure AI 集成

src/promptflow-core/promptflow/executor/_script_executor.py
  class ScriptExecutor(FlowExecutor)
  _line_timeout_sec = 600
  _parse_entry_func → PythonLoadError / FlowEntryInitializationError
  _exec_line → ScriptExecutionError (UserError + stack)
  exec_aggregation → warning only (不抛)
  _resolve_connection_params / _resolve_model_config_params
  InvalidFlexFlowEntry / InvalidAggregationFunction / InvalidModelConfigValueType
  enable_streaming_for_llm_flow
  _stringify_generator_output(_async)

License: MIT
```

**本轮未打开**：DAG 执行器、内置 tools 包、Azure 集成、评测器实现。

---

## 7.1 README 能力原文摘录

> *"Prompt flow is a suite of development tools designed to streamline the end-to-end development cycle of LLM-based AI applications, from ideation, prototyping, testing, evaluation to production deployment and monitoring."*

三大能力（README）：

1. **Create and iteratively develop flow**
   - Create executable flows that link LLMs, prompts, Python code and other tools together
   - Debug and iterate your flows, especially tracing interaction with LLMs with ease
2. **Evaluate flow quality and performance**
   - Evaluate your flow's quality and performance with larger datasets
   - Integrate the testing and evaluation into your CI/CD system
3. **Streamlined development cycle for production**
   - Deploy your flow to the serving platform you choose or integrate into your app's code base easily
   - (Optional) Collaborate via Prompt flow in Azure AI

安装（README 实读）：

```sh
# python>=3.9, <=3.11 recommended
pip install promptflow promptflow-tools

# Quick start
pf flow init --flow ./my_chatbot --type chat
```

GitHub Codespaces 一键环境。

---

## 7.2 ScriptExecutor 详细代码路径

```python
class ScriptExecutor(FlowExecutor):
    def __init__(self, ...):
        ...
        self._line_timeout_sec = 600   # 单行 10 分钟硬超时

    def _parse_entry_func(self):
        # 函数入口 → 直接绑定
        # 类入口 → 需有 __call__
        #   否则 raise PythonLoadError(
        #     message_format="Python class entry '{func_name}' does not have __call__ method."
        #   )
        # 模块加载失败 → raise PythonLoadError(
        #   message_format="Failed to load python module for {entry_file}: {error_type_and_message}"
        # )

    def _exec_line(self, ...):
        try:
            output = self._func(**inputs)
        except Exception as e:
            error_type_and_message = f"({e.__class__.__name__}) {e}"
            raise ScriptExecutionError(
                message_format="Execution failure in '{func_name}': {error_type_and_message}",
                error_type_and_message=error_type_and_message,
                error=e,
            )

    def exec_aggregation(self, inputs):
        try:
            output = self._aggr_func(**inputs)
        except Exception as e:
            error = ExceptionPresenter.create(e).to_dict(include_debug_info=True)
            logger.warning(f"Failed to execute aggregation function with error: {error}")
            # 不抛出 — 聚合失败降级为 warning

    def _resolve_model_config_params(self, ...):
        if invalid:
            raise InvalidModelConfigValueType(...)

    def _initialize_aggr_function(self, flow_obj):
        if invalid:
            raise InvalidAggregationFunction(...)

    def _parse_flow_file(self):
        if no_entry:
            raise InvalidFlexFlowEntry(...)
```

**错误分类哲学**：

| 阶段 | 策略 | 理由 |
|------|------|------|
| 启动/加载 | fail-fast 抛错 | 配置错误不该带病运行 |
| 用户代码运行时 | UserError + 完整栈 | 便于用户排障 |
| 聚合/汇总 | warning + 结构化 | 单行失败不应毁掉整批指标 |

---

## 7.3 与 openmate 执行器对照

| PromptFlow | openmate 建议 |
|------------|---------------|
| `_line_timeout_sec = 600` | `OPENMATE_STEP_TIMEOUT_SEC = 600` |
| `ScriptExecutionError` (UserError) | `UserCodeError` 带完整栈 |
| `PythonLoadError` (fail-fast) | `SkillLoadError` 启动即抛 |
| 聚合 warning 不抛 | 汇总指标降级 + metrics 告警 |
| `ExceptionPresenter.to_dict(include_debug_info=True)` | 结构化错误导出 |
| 连接/ModelConfig 初始化解析 | 凭据 fail-fast |
| Flex 双入口（函数/类） | Skill 支持函数与类两种形态 |

---

## 8. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 3 | Flex/DAG 双模式 |
| 权限/安全边界 | 3 | 连接凭据分离 |
| 容错与会话恢复 | 3 | 错误分类 + 聚合降级 |
| 上下文工程 | 3 | 行级批处理 |
| 可扩展（技能/MCP） | 3 | Tool 注册 |
| 可观测与可评测 | 4 | 评测是产品核心 |
| 生产可用成熟度 | 4 | 微软背书 + Azure |

**综合**：**LLM 流程执行与评测的工程化标杆**。openmate 抄错误三分类、超时常量、fail-fast 入口校验与结构化错误导出。

---

## 9. 关键链接

- 仓库：https://github.com/microsoft/promptflow  
- 相关报告：`reports/langflow.md`、`reports/flowise.md`、`reports/microsoft-agent-framework.md`

---

## 9. Quick Reference Card

### Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| _line_timeout_sec | 600 | ScriptExecutor.__init__ |
| Error classification | System/User/Degraded | _exec_line / exec_aggregation |
| Entry modes | function / class(with __call__) | _parse_entry_func |
| Python version | >=3.9, <=3.11 | README |

### Error Types

| Exception | Phase | Strategy |
|-----------|-------|----------|
| PythonLoadError | Startup | fail-fast |
| FlowEntryInitializationError | Startup | fail-fast |
| InvalidFlexFlowEntry | Startup | fail-fast |
| InvalidAggregationFunction | Startup | fail-fast |
| InvalidModelConfigValueType | Startup | fail-fast |
| ScriptExecutionError | Runtime | UserError + stack |
| Aggregation exception | Runtime | warning + structured |

### openmate Mapping

PromptFlow _line_timeout_sec=600 maps to OPENMATE_STEP_TIMEOUT_SEC=600.
ScriptExecutionError maps to UserCodeError with stack.
PythonLoadError maps to SkillLoadError fail-fast.
Aggregation warning maps to metric degradation plus alert.
ExceptionPresenter maps to structured error export.
Connection init parse maps to credential fail-fast.
Flex dual entry maps to skill function/class forms.
---

## 10. Implementation Notes for openmate

When implementing a PromptFlow-like executor in openmate, consider these design decisions:

1. Timeout placement: set timeout at the executor level (600s default) rather than per-tool, so the entire step is bounded.
2. Error taxonomy: distinguish startup errors (fail-fast) from runtime errors (UserError with stack) from aggregation errors (warning only).
3. Entry flexibility: support both function entries and class entries; class entries must implement __call__.
4. Credential resolution: resolve connections and model configs at initialization, not at first use.
5. Structured errors: use an ExceptionPresenter-like pattern to export errors as dicts with debug info.
6. Streaming: enable streaming per-flow via a callable predicate rather than a global flag.
7. Generator outputs: stringify generator outputs before storage to avoid holding iterators open.

These seven decisions capture the core engineering lessons from PromptFlow's ScriptExecutor implementation.