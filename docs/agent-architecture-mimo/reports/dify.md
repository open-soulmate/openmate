# langgenius/dify — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/langgenius/dify  
> 抓取通道: cdn.jsdelivr.net/gh/langgenius/dify@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供工作流引擎 / GraphEngine / 节点系统 / 变量池 借鉴

---

## 0. 诚实性说明

- 成功拉取: `api/core/workflow/workflow_entry.py`（完整 WorkflowEntry，约 400 行）
- 未能直接拉取: GraphEngine 内部实现（`graphon` 包，路径 404）
- 所有常量与代码行为源码实读

---

## 1. 系统架构

### 1.1 定位

Dify 是开源 LLM 应用开发平台，核心是**可视化工作流引擎**（GraphEngine），支持条件分支、循环、迭代、并行执行，以及 Agent 节点、工具节点、知识检索节点等。

### 1.2 源码布局（实测）

| 路径 | 职责 |
|------|------|
| `api/core/workflow/workflow_entry.py` | WorkflowEntry — 工作流执行入口 |
| `api/core/workflow/node_factory.py` | DifyNodeFactory — 节点工厂 |
| `api/core/workflow/system_variables.py` | 系统变量 |
| `api/core/workflow/variable_pool_initializer.py` | 变量池初始化 |
| `api/core/workflow/variable_prefixes.py` | 变量前缀 |
| `api/core/app/workflow/layers/observability.py` | ObservabilityLayer |
| `graphon/` | GraphEngine 核心（外部包） |

---

## 2. WorkflowEntry — 执行入口（源码实读）

### 2.1 构造函数

```python
class WorkflowEntry:
    def __init__(
        self,
        tenant_id: str,
        app_id: str,
        workflow_id: str,
        graph_config: Mapping[str, Any],
        graph: Graph,
        user_id: str,
        user_from: UserFrom,
        invoke_from: InvokeFrom,
        call_depth: int,
        variable_pool: VariablePool,
        graph_runtime_state: GraphRuntimeState,
        command_channel: CommandChannel | None = None,
        response_stream_filter: ResponseStreamFilter | None = None,
    ) -> None:
```

### 2.2 调用深度限制

```python
workflow_call_max_depth = dify_config.WORKFLOW_CALL_MAX_DEPTH
if call_depth > workflow_call_max_depth:
    raise ValueError(f"Max workflow call depth {workflow_call_max_depth} reached.")
```

### 2.3 GraphEngine 初始化

```python
self.graph_engine = GraphEngine(
    workflow_id=workflow_id,
    graph=graph,
    graph_runtime_state=graph_runtime_state,
    command_channel=command_channel,
    config=GraphEngineConfig(
        min_workers=dify_config.GRAPH_ENGINE_MIN_WORKERS,
        max_workers=dify_config.GRAPH_ENGINE_MAX_WORKERS,
        scale_up_threshold=dify_config.GRAPH_ENGINE_SCALE_UP_THRESHOLD,
        scale_down_idle_time=dify_config.GRAPH_ENGINE_SCALE_DOWN_IDLE_TIME,
    ),
)
```

**关键配置项**（从 `dify_config` 读取）:
- `GRAPH_ENGINE_MIN_WORKERS`: 最小 worker 数
- `GRAPH_ENGINE_MAX_WORKERS`: 最大 worker 数
- `GRAPH_ENGINE_SCALE_UP_THRESHOLD`: 扩容阈值
- `GRAPH_ENGINE_SCALE_DOWN_IDLE_TIME`: 缩容空闲时间

### 2.4 Layer 系统

```python
# Debug logging layer
if dify_config.DEBUG:
    debug_layer = DebugLoggingLayer(
        level="DEBUG",
        include_inputs=True,
        include_outputs=True,
        include_process_data=False,  # Process data 可以非常冗长
        logger_name=f"GraphEngine.Debug.{workflow_id[:8]}",
    )
    self.graph_engine.layer(debug_layer)

# Execution limits layer
limits_layer = ExecutionLimitsLayer(
    max_steps=dify_config.WORKFLOW_MAX_EXECUTION_STEPS,
    max_time=dify_config.WORKFLOW_MAX_EXECUTION_TIME,
)
self.graph_engine.layer(limits_layer)

# Observability layer
if dify_config.ENABLE_OTEL or is_instrument_flag_enabled():
    self.graph_engine.layer(ObservabilityLayer())
```

**Layer 顺序**: DebugLogging → ExecutionLimits → Observability

---

## 3. run() — 执行方法（源码实读）

```python
def run(self) -> Generator[GraphEngineEvent, None, None]:
    graph_engine = self.graph_engine
    try:
        generator = iter_dify_graph_engine_events(graph_engine, self._response_stream_filter)
        yield from generator
    except GenerateTaskStoppedError:
        pass  # 用户主动停止，静默处理
    except Exception as e:
        logger.exception("Unknown Error when workflow entry running")
        yield GraphRunFailedEvent(error=str(e))
        return
```

---

## 4. 事件过滤（源码实读）

```python
def iter_dify_graph_engine_events(
    engine: GraphEngine,
    response_stream_filter: ResponseStreamFilter | None = None,
) -> Generator[GraphEngineEvent, None, None]:
    """Apply Dify's response streaming compatibility filter to GraphEngine events.

    Graphon v0.5.0 emits raw variable stream chunks and requires callers to opt
    into the legacy response-ordered stream behavior that Dify exposes.
    """
    yield from filter_graph_events(
        engine.run(),
        context=GraphEventFilterContext.from_engine(engine),
        filters=[
            HumanInputFormEventFilter(form_repository=HumanInputFormSubmissionRepository()),
            response_stream_filter or ResponseStreamFilter(),
        ],
    )
```

**设计要点**: 双层过滤 — HumanInputFormEventFilter（人类输入表单）+ ResponseStreamFilter（响应流兼容）。

---

## 5. single_step_run() — 单节点调试（源码实读）

```python
@classmethod
def single_step_run(
    cls,
    *,
    workflow: Workflow,
    node_id: str,
    user_id: str,
    user_inputs: Mapping[str, Any],
    variable_pool: VariablePool,
    variable_loader: VariableLoader = DUMMY_VARIABLE_LOADER,
) -> tuple[Node, Generator[GraphNodeEventBase | ContainerAwaitRequest, None, None]]:
```

### 5.1 节点类型限制

```python
if node_type in {BuiltinNodeTypes.LOOP, BuiltinNodeTypes.ITERATION}:
    raise ValueError("Loop and Iteration nodes must use their engine-backed debug endpoints")
```

### 5.2 执行流程

```python
# 1. 创建 run_context
run_context = build_dify_run_context(
    tenant_id=workflow.tenant_id,
    app_id=workflow.app_id,
    user_id=user_id,
    user_from=UserFrom.ACCOUNT,
    invoke_from=InvokeFrom.DEBUGGER,
    app_type=CreditUsageAppType.WORKFLOW,
)

# 2. 创建 graph_runtime_state
graph_runtime_state = GraphRuntimeState(
    variable_pool=variable_pool,
    start_at=time.perf_counter(),
    execution_context=capture_current_context(),
)

# 3. Start 节点特殊处理
if is_start_node_type(node_type):
    add_node_inputs_to_pool(variable_pool, node_id=node_id, inputs=user_inputs)

# 4. 预加载变量
preload_node_creation_variables(
    variable_loader=variable_loader,
    variable_pool=variable_pool,
    selectors=get_node_creation_preload_selectors(node_type=node_type, node_data=node_config_data),
)

# 5. 变量映射
variable_mapping = node_cls.extract_variable_selector_to_variable_mapping(
    graph_config=workflow.graph_dict, config=node_config
)
variable_mapping = inject_default_system_variable_mappings(...)

# 6. 加载缺失变量
load_into_variable_pool(variable_loader=variable_loader, variable_pool=variable_pool, ...)

# 7. 创建节点并执行
node = node_factory.create_node(node_config)
generator = cls._run_node_with_layers(node, tenant_id=workflow.tenant_id)
```

---

## 6. run_free_node() — 自由节点执行（源码实读）

```python
@classmethod
def run_free_node(cls, node_data, node_id, tenant_id, user_id, user_inputs):
    """NOTE: only parameter_extractor/question_classifier are supported"""
    node_type = node_data.get("type", "")
    if node_type not in {BuiltinNodeTypes.PARAMETER_EXTRACTOR, BuiltinNodeTypes.QUESTION_CLASSIFIER}:
        raise ValueError(f"Node type {node_type} not supported")
```

### 6.1 最小图构建

```python
@staticmethod
def _create_single_node_graph(node_id, node_data, node_width=114, node_height=514) -> SingleNodeGraphDict:
    return SingleNodeGraphDict(
        nodes=[
            {"id": "start", "width": node_width, "height": node_height, "type": "custom",
             "data": {"type": BuiltinNodeTypes.START, "title": "Start", "desc": "Start"}},
            {"id": node_id, "width": node_width, "height": node_height, "type": "custom", "data": node_data},
        ],
        edges=[{"source": "start", "target": node_id, "sourceHandle": "source", "targetHandle": "target"}],
    )
```

---

## 7. 变量池映射（源码实读）

```python
@classmethod
def mapping_user_inputs_to_variable_pool(cls, *, variable_mapping, user_inputs, variable_pool, tenant_id):
    for node_variable, variable_selector in variable_mapping.items():
        node_variable_list = node_variable.split(".")
        if len(node_variable_list) < 1:
            raise ValueError(f"Invalid node variable {node_variable}")

        node_variable_key = ".".join(node_variable_list[1:])

        # 检查变量是否存在
        if (node_variable_key not in user_inputs and node_variable not in user_inputs) \
                and not variable_pool.get(variable_selector):
            raise ValueError(f"Variable key {node_variable} not found in user inputs.")

        # 环境变量已在池中，跳过
        if variable_pool.get(variable_selector) and variable_selector[0] == ENVIRONMENT_VARIABLE_NODE_ID:
            continue

        # 文件类型特殊处理
        input_value = user_inputs.get(node_variable) or user_inputs.get(node_variable_key)
        if isinstance(input_value, dict) and "type" in input_value and "transfer_method" in input_value:
            input_value = file_factory.build_from_mapping(...)

        # structured_output 特殊处理
        if len(variable_key_list) == 2 and variable_key_list[0] == "structured_output":
            input_value = {variable_key_list[1]: input_value}
            variable_key_list = variable_key_list[0:1]
            current_variable = variable_pool.get([variable_node_id] + variable_key_list)
            if current_variable and isinstance(current_variable.value, dict):
                input_value = current_variable.value | input_value

        variable_pool.add([variable_node_id] + variable_key_list, input_value)
```

---

## 8. _run_node_with_layers() — 带 Layer 的节点执行（源码实读）

```python
@staticmethod
def _run_node_with_layers(node: Node, *, tenant_id: str) -> Generator[...]:
    layers: Sequence[GraphEngineLayer] = (ObservabilityLayer(),)
    command_channel = InMemoryChannel()
    runtime_state = ReadOnlyGraphRuntimeStateWrapper(node.graph_runtime_state)

    for layer in layers:
        layer.initialize(runtime_state, command_channel)
        layer.on_graph_start()

    node.bind_execution_id(str(uuid4()))

    def _gen():
        error: Exception | None = None
        result_event: GraphNodeEventBase | None = None
        layers_finished = False

        def finish_layers() -> None:
            nonlocal layers_finished
            if layers_finished:
                return
            layers_finished = True
            for layer in layers:
                layer.on_node_run_end(node, error, result_event)
            for layer in layers:
                layer.on_graph_end(error)

        try:
            for layer in layers:
                layer.on_node_run_start(node)
            for event in node.run():
                if isinstance(event, GraphNodeEventBase) and is_node_result_event(event):
                    result_event = event
                    finish_layers()  # 结果事件到达时立即结束 layers
                yield event
        except Exception as exc:
            error = exc
            raise
        finally:
            finish_layers()

    return _gen()
```

**设计要点**: 结果事件到达时立即调用 `finish_layers()`，确保 observability 在结果产生时就记录，而非等到生成器结束。

---

## 9. 特殊值处理

```python
@staticmethod
def _handle_special_values(value: Any):
    if value is None:
        return value
    if isinstance(value, dict):
        return {k: WorkflowEntry._handle_special_values(v) for k, v in value.items()}
    if isinstance(value, list):
        return [WorkflowEntry._handle_special_values(item) for item in value]
    if isinstance(value, File):
        return value.to_dict()
    return value
```

---

## 10. 超时 / 限制汇总

| 项 | 配置来源 | 说明 |
|----|----------|------|
| `WORKFLOW_CALL_MAX_DEPTH` | dify_config | 工作流嵌套调用最大深度 |
| `GRAPH_ENGINE_MIN_WORKERS` | dify_config | GraphEngine 最小 worker |
| `GRAPH_ENGINE_MAX_WORKERS` | dify_config | GraphEngine 最大 worker |
| `GRAPH_ENGINE_SCALE_UP_THRESHOLD` | dify_config | 扩容阈值 |
| `GRAPH_ENGINE_SCALE_DOWN_IDLE_TIME` | dify_config | 缩容空闲时间 |
| `WORKFLOW_MAX_EXECUTION_STEPS` | dify_config | 最大执行步数 |
| `WORKFLOW_MAX_EXECUTION_TIME` | dify_config | 最大执行时间 |
| `ENABLE_OTEL` | dify_config | OpenTelemetry 开关 |
| `DEBUG` | dify_config | Debug logging layer |
| 单节点调试 | Loop/Iteration 不支持 | single_step_run() |
| 自由节点 | 仅 parameter_extractor / question_classifier | run_free_node() |

---

## 11. 失败路径

```
调用深度超限
  → ValueError(f"Max workflow call depth {max} reached.")

Loop/Iteration 节点单步调试
  → ValueError("Loop and Iteration nodes must use their engine-backed debug endpoints")

不支持的自由节点类型
  → ValueError(f"Node type {node_type} not supported")

变量不存在
  → ValueError(f"Variable key {node_variable} not found in user inputs.")

节点执行异常
  → WorkflowNodeRunFailedError(node=node, err_msg=str(e))

工作流执行异常
  → GraphRunFailedEvent(error=str(e))（通过事件流返回，不抛异常）

用户主动停止
  → GenerateTaskStoppedError → 静默 pass

Node class 未找到
  → ValueError(f"Node class not found for node type {node_type}")
```

---

## 12. 对 openmate 的可借鉴点

### P0 — GraphEngine 架构
- 图结构：nodes + edges
- 可插拔 Layer 系统：Debug / Limits / Observability
- Worker 池：min/max/scale_up/scale_down 配置

### P0 — 执行限制
- `WORKFLOW_MAX_EXECUTION_STEPS`: 步数上限
- `WORKFLOW_MAX_EXECUTION_TIME`: 时间上限
- `WORKFLOW_CALL_MAX_DEPTH`: 嵌套深度上限

### P0 — 变量池
- VariablePool 全局变量存储
- 变量选择器: `[node_id, key1, key2, ...]`
- 系统变量注入 + 环境变量节点

### P1 — Layer 生命周期
- `initialize()` → `on_graph_start()` → `on_node_run_start()` → `on_node_run_end()` → `on_graph_end()`
- 结果事件到达时立即 finish（非生成器结束时）

### P1 — 单节点调试
- 最小图构建（start → target）
- Loop/Iteration 需要引擎级调试端点

### P1 — 事件过滤
- HumanInputFormEventFilter: 人类输入表单
- ResponseStreamFilter: 响应流兼容性

### P2 — File 处理
- `file_factory.build_from_mapping()`: 文件传输方法
- structured_output 特殊变量合并

---

## 13. 源码锚点速查

```
api/core/workflow/workflow_entry.py
  class WorkflowEntry
    __init__: call_depth 检查 + GraphEngine 初始化 + Layer 注册
    run(): iter_dify_graph_engine_events → yield
    single_step_run(): 单节点调试（Loop/Iteration 不支持）
    run_free_node(): 仅 parameter_extractor / question_classifier
    _create_single_node_graph(): 最小图（start → target）
    mapping_user_inputs_to_variable_pool(): 变量映射 + 文件处理
    _run_node_with_layers(): ObservabilityLayer + 结果事件立即 finish
    _handle_special_values(): File → dict

  iter_dify_graph_engine_events(): HumanInputFormEventFilter + ResponseStreamFilter

graphon/ (外部包)
  GraphEngine / GraphEngineConfig / GraphEngineLayer
  GraphEngineEvent / GraphNodeEventBase / GraphRunFailedEvent
  VariablePool / GraphRuntimeState
  CommandChannel / InMemoryChannel
  DebugLoggingLayer / ExecutionLimitsLayer / ObservabilityLayer
```

---

## 14. 参考链接

- https://github.com/langgenius/dify
- https://docs.dify.ai/
