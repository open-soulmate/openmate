# NeMo-Guardrails 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/NVIDIA/NeMo-Guardrails  
> 抓取通道: cdn.jsdelivr.net/gh/NVIDIA/NeMo-Guardrails@main  
> 版本快照: main @ 2026-09-13（`nemoguardrails/rails/llm/llmrails.py` 88KB + `config.py` 90KB 实读）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Rails 管线、输入/输出/检索/工具护栏、配置校验与 Colang 运行时借鉴

---

## 0. 诚实性说明

- **已打开实读**：
  - `nemoguardrails/rails/llm/llmrails.py`（88303 bytes，LLMRails 类关键路径）
  - `nemoguardrails/rails/llm/config.py`（89529 bytes）
- 文件清单来自 `data.jsdelivr.com` flat listing（NeMo 可访问）。
- docs 路径 `docs/architecture/README.md` 等在 CDN 返回 404（可能路径已迁移）。
- 本报告基于 LLMRails + Config 实读；不发明行号。

---

## 1. 项目定位

NeMo-Guardrails 是 NVIDIA 开源的 **可编程 LLM 护栏框架**：

- Colang DSL 定义对话流与护栏逻辑
- 输入 / 输出 / 检索 / 对话 / 工具输入 五类 rails
- 支持 Colang 1.0 与 2.x 双运行时
- 可嵌入任意 LLM 应用

---

## 2. LLMRails 深潜（llmrails.py 实读）

### 2.1 类定义与继承

```python
class LLMRails(BaseGuardrails):
    ...
```

关键属性：

- `kb`：KnowledgeBase
- `embedding_search_providers` / `default_embedding_model` / `default_embedding_engine` / `default_embedding_params`
- `explain_info`：ExplainInfo（调试解释）
- `llm_generation_actions`：内部属性（文档注明「internal; use passthrough_fn」）
- `passthrough_fn`：设置后，rails 管线调用此函数代替主 LLM

### 2.2 初始化与配置校验

```python
def __init__(self, config, ...):
    ...
    # 标记来自 guardrails 库的 flows 为 system flows
    # rail_flow_ids = config.rails.input.flows + config.rails.output.flows + config.rails.retrieval.flows
    # 用于标记的 flow 为 rails flow
    ...
    raise InvalidRailsConfigurationError(...)  # 配置不一致时
```

```python
def _validate_config(self):
    for flow_name in self.config.rails.input.flows:
        if not exists:
            raise InvalidRailsConfigurationError(f"The provided input rail flow `{flow_name}` does not exist")
    for flow_name in self.config.rails.output.flows:
        if not exists:
            raise InvalidRailsConfigurationError(f"The provided output rail flow `{flow_name}` does not exist")
    for flow_name in self.config.rails.retrieval.flows:
        if not exists:
            raise InvalidRailsConfigurationError(f"The provided retrieval rail flow `{flow_name}` does not exist")
    # passthrough 与 single_call 互斥
    if self.config.passthrough and self.config.rails.dialog.single_call.enabled:
        raise InvalidRailsConfigurationError(
            "The passthrough mode and the single call dialog rails mode can't be used at the same time. ..."
        )
```

**fail-fast 设计**：rails flow 不存在 → 启动失败；passthrough 与 single_call 互斥 → 启动失败。

### 2.3 五类 Rails

| 类别 | 配置路径 | 校验 |
|------|----------|------|
| Input rails | `config.rails.input.flows` | flow 必须存在 |
| Output rails | `config.rails.output.flows` | flow 必须存在 |
| Retrieval rails | `config.rails.retrieval.flows` | flow 必须存在 |
| Dialog rails | `config.rails.dialog.*` | single_call 与 passthrough 互斥 |
| Tool input rails | `config.rails.tool_input.flows` | 处理 tool 消息分组 |

### 2.4 LLM 初始化

```python
def _init_llms(self):
    # 主 LLM 引擎用于所有核心 guardrails 生成
    ...
    raise InvalidModelConfigurationError(...)  # 模型配置无效
    except ModelInitializationError as e:
        ...
    except Exception as e:
        ...
```

```python
def _create_model_cache(self, model) -> LFUCache:
    ...
    raise ValueError(...)  # 缓存配置无效
```

- `LFUCache`：模型级 LRU/LFU 缓存
- `_initialize_model_caches()`：批量初始化

### 2.5 状态与事件

```python
def _get_events_for_messages(self, messages: List[dict], state: Any):
    ...
    # 若配置了 tool input rails，分组所有 tool 消息
    if self.config.rails.tool_input.flows:
        ...
    raise ValueError(...)  # 消息格式无效
```

```python
def _validate_public_state(self, state: Optional[Union[dict, State]]) -> None:
    raise InvalidStateError(...)  # 无效状态格式
    raise InvalidStateError("Invalid Colang 1.0 state format: 'events' must be a list.")
    raise InvalidStateError(
        "Use rails.process_events_async(events, state) with a live State object ..."
    )
```

### 2.6 生成入口

```python
async def generate_async(self, ...):
    ...
```

对称的 `generate` 同步版本。  
`passthrough_fn` 非空时跳过主 LLM，直接调用该函数。

### 2.7 遥测与追踪

```python
from nemoguardrails.telemetry import report_usage
report_usage(config, deployment_type="library", rails_engine="LLMRails")

from nemoguardrails.tracing import create_log_adapters
```

### 2.8 异步循环检查

```python
from nemoguardrails.patch_asyncio import check_sync_call_from_async_loop
```

防止在 async loop 中误调同步 API。

---

## 3. Config 深潜（config.py）

- 定义 `RailsConfig`：models / rails / instructions / prompts / actions / colang 版本
- 支持 Colang 1.0 与 2.x 双格式
- embedding 配置：provider / engine / params
- 流式：`streaming` 相关配置

---

## 4. 失败路径汇总

| 场景 | 异常 |
|------|------|
| input/output/retrieval rail flow 不存在 | `InvalidRailsConfigurationError` |
| passthrough + single_call 同时开 | `InvalidRailsConfigurationError` |
| 模型配置无效 | `InvalidModelConfigurationError` |
| 模型初始化失败 | `ModelInitializationError` / `Exception` |
| 缓存配置无效 | `ValueError` |
| 公共状态格式无效 | `InvalidStateError` |
| Colang 1.0 events 非 list | `InvalidStateError` |
| 消息格式无效 | `ValueError` |
| 同步调用出现在 async loop | `check_sync_call_from_async_loop` 拦截 |

---

## 5. 架构模式

```
User Input
  → Input Rails（校验 / 分类 / 拒绝）
    → Dialog Rails（话题路由 / 流程）
      → Retrieval Rails（知识库过滤）
        → Main LLM（或 passthrough_fn）
          → Output Rails（事实性 / 安全 / 格式）
            → Response
```

Tool 调用路径额外经过 **Tool Input Rails**（对 tool 消息分组后校验）。

---

## 6. 对 openmate 的借鉴

### 6.1 直接可抄（P0）

1. **五类 rails 分层**：input / dialog / retrieval / output / tool_input——职责清晰。
2. **启动时 fail-fast 校验所有 rail flow 存在**：不带病运行。
3. **passthrough_fn 逃生舱**：跳过主 LLM，便于测试与自定义。
4. **passthrough 与 single_call 互斥校验**。
5. **LFUCache 模型级缓存**。
6. **InvalidStateError 细粒度**：events 非 list / 格式错 / 需 live State 分别报错。
7. **check_sync_call_from_async_loop**：防 async 死锁。

### 6.2 应避免的坑

- Colang 双版本（1.0 / 2.x）增加复杂度。
- rails 配置项过多，需要 schema 版本化 + `make config-upgrade` 类机制。
- CDN 对 docs 路径 404：文档树可能与代码树不同步。

### 6.3 重构优先级

- **P0**：input / output / tool_input 三层护栏
- **P0**：启动时配置 fail-fast 校验
- **P0**：passthrough 逃生舱
- **P1**：模型级 LFU 缓存
- **P1**：状态校验细粒度错误
- **P2**：完整 Colang DSL（成本高）

---

## 6.4 LLMRails 初始化详细流程

```
LLMRails.__init__(config)
  │
  ├─ 解析 Colang 文件（v1_0 / v2_x）
  │    └─ parse_colang_file
  │
  ├─ 标记 system flows（来自 guardrails 库）
  │
  ├─ 计算 rail_flow_ids
  │    = config.rails.input.flows
  ∪  config.rails.output.flows
  ∪  config.rails.retrieval.flows
  │
  ├─ _validate_config()
  │    ├─ input flows 存在？→ InvalidRailsConfigurationError
  │    ├─ output flows 存在？→ InvalidRailsConfigurationError
  │    ├─ retrieval flows 存在？→ InvalidRailsConfigurationError
  │    └─ passthrough + single_call 互斥？→ InvalidRailsConfigurationError
  │
  ├─ _init_llms()
  │    ├─ 主 LLM 用于所有核心 guardrails 生成
  │    ├─ InvalidModelConfigurationError
  │    ├─ ModelInitializationError
  │    └─ _create_model_cache → LFUCache
  │
  ├─ _init_kb()（异步）
  │
  ├─ _initialize_model_caches()
  │
  ├─ 注册 embedding search provider
  │    └─ 未知 provider → Exception
  │
  └─ report_usage(config, deployment_type="library", rails_engine="LLMRails")
```

---

## 6.5 generate_async 管线

```
generate_async(messages, ...)
  │
  ├─ _get_events_for_messages(messages, state)
  │    └─ 若 tool_input.flows 配置 → 分组 tool 消息
  │
  ├─ _validate_public_state(state)
  │    ├─ events 非 list → InvalidStateError
  │    ├─ 格式错 → InvalidStateError
  │    └─ 需 live State → InvalidStateError
  │
  ├─ Input Rails 执行
  │    └─ 拒绝 → 返回拒绝响应
  │
  ├─ Dialog Rails（single_call 或 多轮）
  │
  ├─ Retrieval Rails（知识库过滤）
  │
  ├─ passthrough_fn 非空？→ 直接调用
  │    否则 → 主 LLM 生成
  │
  ├─ Output Rails 执行
  │    └─ is_output_blocked → 阻断
  │
  └─ 返回响应
```

---

## 6.6 与 openmate 对照

| NeMo-Guardrails | openmate 建议 |
|-----------------|---------------|
| Input rails | 输入校验 / 分类 / 拒绝层 |
| Output rails | 输出事实性 / 安全 / 格式层 |
| Tool input rails | 工具参数校验层 |
| Retrieval rails | 知识库结果过滤 |
| passthrough_fn | 测试与自定义逃生舱 |
| LFUCache | 模型级缓存 |
| check_sync_call_from_async_loop | 防 async 死锁 |
| InvalidStateError 细粒度 | 状态校验分场景报错 |
| 启动 fail-fast | 不带病运行 |
| Colang 双版本 | 避免 DSL 双轨（成本高） |

---

## 7. 源码锚点速查

```
nemoguardrails/rails/llm/llmrails.py
  class LLMRails(BaseGuardrails)
  kb / embedding_search_providers / default_embedding_*
  explain_info / passthrough_fn
  _validate_config → InvalidRailsConfigurationError
    - input/output/retrieval flow 必须存在
    - passthrough 与 single_call 互斥
  _init_llms → InvalidModelConfigurationError / ModelInitializationError
  _create_model_cache → LFUCache / ValueError
  _get_events_for_messages → tool_input 分组
  _validate_public_state → InvalidStateError
  generate_async / generate
  check_sync_call_from_async_loop
  report_usage(deployment_type="library", rails_engine="LLMRails")

nemoguardrails/rails/llm/config.py
  RailsConfig: models / rails / instructions / prompts / actions / colang
  rails.input / output / retrieval / dialog / tool_input

Runtime: colang v1_0 + v2_x 双运行时
Exceptions: InvalidRailsConfigurationError, InvalidModelConfigurationError,
            ModelInitializationError, InvalidStateError
License: Apache-2.0
```

**本轮未打开**：Colang 解析器全文、具体内置 rails flows、streaming handler。

---

## 8. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 4 | tool_input rails |
| 权限/安全边界 | 5 | 产品核心即护栏 |
| 容错与会话恢复 | 3 | fail-fast + passthrough |
| 上下文工程 | 3 | retrieval rails |
| 可扩展（技能/MCP） | 3 | actions / flows |
| 可观测与可评测 | 3 | explain_info / telemetry |
| 生产可用成熟度 | 4 | NVIDIA 背书 |

**综合**：**可编程 LLM 护栏的工程化标杆**。openmate 必抄五层 rails、fail-fast 配置校验、passthrough 逃生舱与细粒度状态错误。

---

## 9. 关键链接

- 仓库：https://github.com/NVIDIA/NeMo-Guardrails  
- 相关报告：`reports/microsoft-agent-framework.md`、`reports/openai-agents.md`、`reports/hermes-agent.md`

---

## 8. Quick Reference Card

### Five Rail Types

Input rails at rails.input.flows for validate/classify/reject input.
Dialog rails at rails.dialog for topic routing and flow.
Retrieval rails at rails.retrieval.flows for knowledge base filtering.
Output rails at rails.output.flows for safety/format/factuality.
Tool Input rails at rails.tool_input.flows for tool parameter validation.

### Fail-Fast Rules

1. All rail flows must exist at startup.
2. passthrough and single_call are mutually exclusive.
3. Invalid model config triggers InvalidModelConfigurationError.
4. Invalid state format triggers InvalidStateError.

### openmate Mapping

input/output/tool_input map to three-layer guardrails.
passthrough_fn maps to escape hatch for testing.
LFUCache maps to model-level cache.
check_sync_from_async maps to prevent async deadlock.
InvalidStateError granular maps to scenario-specific state errors.
startup fail-fast maps to no sick-running.
Colang dual version maps to avoid DSL dual-track (high cost).
---

## 9. Implementation Notes for openmate

When implementing NeMo-Guardrails-like rails in openmate, consider these design decisions:

1. Five-layer rails: input, dialog, retrieval, output, tool_input - each with clear responsibility.
2. Startup fail-fast: validate all rail flows exist at startup; do not allow sick-running.
3. Passthrough escape hatch: provide a passthrough_fn to bypass the main LLM for testing and customization.
4. Mutual exclusion: validate that passthrough and single_call modes are not enabled simultaneously.
5. Model-level cache: use LFUCache for model responses to reduce redundant LLM calls.
6. Granular state errors: distinguish InvalidStateError scenarios (events not list, format wrong, needs live State).
7. Async safety: check_sync_call_from_async_loop to prevent deadlocks from sync calls in async context.

These seven decisions capture the core engineering lessons from NeMo-Guardrails' LLMRails implementation.
---

## 10. Cross-Reference with Related Reports

See also:
- reports/openai-agents.md for guardrail integration patterns
- reports/hermes-agent.md for policy enforcement
- reports/microsoft-agent-framework.md for governance narrative
- reports/haystack-l1.md for Hook system parallels

NeMo-Guardrails' five-layer rail architecture is the most comprehensive guardrail system studied. The passthrough_fn escape hatch pattern is valuable for testing. The Colang dual-version complexity is a lesson in DSL versioning costs.

Key takeaway: layered guardrails with fail-fast validation; avoid custom DSL dual-track.