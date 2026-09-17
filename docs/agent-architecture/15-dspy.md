# 15. DSPy 架构深度分析：声明式自改进语言模型编程框架

> **项目**: stanfordnlp/dspy | **Stars**: 37.6k | **许可**: MIT
> **定位**: "Programming — not prompting — Foundation Models"
> **全称**: Declarative Self-improving Python

DSPy 是 Stanford NLP 团队开发的声明式语言模型编程框架，核心理念是用**组合式 Python 代码**替代脆弱的 prompt 工程，通过编译器自动优化 LM 的 prompt 和权重。本文从 10 个维度深入分析其架构设计。

---

## 1. 核心哲学：从 Prompt 到 Program 的范式转换

DSPy 的根本创新在于将 LM 调用从"手写 prompt 字符串"提升为"声明式 Python 程序"。用户定义输入/输出签名（Signature），编写组合逻辑（Module），框架自动处理 prompt 构造和优化。

README 中明确阐述：

```markdown
DSPy is the framework for programming—rather than prompting—language models.
It allows you to iterate fast on building modular AI systems and offers algorithms
for optimizing their prompts and weights, whether you're building simple classifiers,
sophisticated RAG pipelines, or Agent loops.
```

这意味着开发者不再需要手动拼接 few-shot examples、调试 prompt 措辞，而是声明"我需要什么输入、什么输出"，让 DSPy 的编译器（teleprompter/optimizer）自动找到最优的 prompt 配置。

---

## 2. Module 抽象：程序的组合基础

`Module` 是 DSPy 所有程序的基类，采用**元类（ProgramMeta）**保证初始化的健壮性。即使子类忘记调用 `super().__init__()`，关键属性也会被注入：

```python
class ProgramMeta(type):
    """Metaclass ensuring every `dspy.Module` instance is properly initialised."""
    def __call__(cls, *args, **kwargs):
        obj = cls.__new__(cls, *args, **kwargs)
        if isinstance(obj, cls):
            Module._base_init(obj)
            cls.__init__(obj, *args, **kwargs)
            if not hasattr(obj, "callbacks"):
                obj.callbacks = []
            if not hasattr(obj, "history"):
                obj.history = []
        return obj
```

Module 的 `_base_init` 设置三个关键属性：`_compiled`（编译状态）、`callbacks`（回调列表）、`history`（LM 调用历史）。这种防御式设计确保即使用户代码有遗漏，框架内部机制也不会崩溃。

Module 支持递归组件发现，通过 `named_predictors()` 遍历所有子模块：

```python
def named_predictors(self):
    from dspy.predict.predict import Predict
    return [(name, param) for name, param in self.named_parameters()
            if isinstance(param, Predict)]
```

这使得优化器可以一次性获取程序中的所有可优化单元，进行全局 prompt 调优。

---

## 3. Predict 核心：LM 调用的原子单元

`Predict` 是 DSPy 最核心的类，同时继承 `Module` 和 `Parameter`，既是可组合的程序单元，又是可优化的参数：

```python
class Predict(Module, Parameter):
    """Basic DSPy module that maps inputs to outputs using a language model."""
    def __init__(self, signature: str | type[Signature],
                 callbacks: list[BaseCallback] | None = None, **config):
        super().__init__(callbacks=callbacks)
        self.stage = random.randbytes(8).hex()
        self.signature = ensure_signature(signature)
        self.config = config
        self.reset()

    def reset(self):
        self.lm = None
        self.traces = []
        self.train = []
        self.demos = []
```

`Predict` 的状态管理非常清晰：`signature` 定义 I/O 格式，`demos` 存储 few-shot 示例，`traces` 记录执行轨迹，`train` 存储训练数据。优化器正是通过修改 `demos` 来实现 prompt 优化。

---

## 4. Signature 机制：类型安全的 I/O 声明

Signature 是 DSPy 的类型系统核心，用字符串或 Pydantic 模型声明输入输出字段。Predict 在调用时严格校验类型：

```python
def _forward_preprocess(self, **kwargs):
    signature = ensure_signature(kwargs.pop("signature", self.signature))
    demos = kwargs.pop("demos", self.demos)
    config = {**self.config, **kwargs.pop("config", {})}

    # Populate default values for missing input fields.
    for k, v in signature.input_fields.items():
        if k not in kwargs and v.default is not PydanticUndefined:
            kwargs[k] = v.default

    # Validate input field types match signature
    if settings.warn_on_type_mismatch:
        for field_name, field_info in signature.input_fields.items():
            if field_name in kwargs:
                value = kwargs[field_name]
                expected_type: type = field_info.annotation
                if not _is_value_compatible_with_type(value, expected_type):
                    logger.warning(
                        "Type mismatch for field '%s': expected %s, but got %s.",
                        field_name, _get_type_name(expected_type), value,
                    )
```

DSPy 实现了完整的类型检查系统，支持 `Union`、`Literal`、泛型容器（`list[str]`、`dict[str, int]`）等复杂类型，且不依赖外部库（如 typeguard），自行实现了轻量级的 `_check_type` 递归检查器。

---

## 5. Adapter 模式：抽象 LM 交互协议

Predict 的 `forward` 方法将实际的 LM 通信委托给 Adapter：

```python
def forward(self, **kwargs):
    lm, config, signature, demos, kwargs = self._forward_preprocess(**kwargs)
    adapter = settings.adapter or ChatAdapter()
    if self._should_stream():
        with settings.context(caller_predict=self):
            completions = adapter(lm, lm_kwargs=config, signature=signature,
                                  demos=demos, inputs=kwargs)
    else:
        with settings.context(send_stream=None):
            completions = adapter(lm, lm_kwargs=config, signature=signature,
                                  demos=demos, inputs=kwargs)
    return self._forward_postprocess(completions, signature, **kwargs)
```

Adapter 的职责是将 Signature + demos + inputs 转化为 LM 可理解的 messages 格式，并将 LM 输出解析回结构化的 `Prediction`。默认使用 `ChatAdapter`，但用户可以替换为自定义 Adapter，实现不同的 prompt 模板策略。

---

## 6. LM 客户端：多引擎统一抽象

`LM` 类是 DSPy 的语言模型客户端，支持多种引擎后端：

```python
class LM(BaseLM):
    def __init__(self, model: str,
                 model_type: Literal["chat", "text", "responses"] = "chat",
                 temperature: float | None = None,
                 max_tokens: int | None = None,
                 cache: bool = True,
                 num_retries: int = 3,
                 engine: Any = "auto",
                 async_engine: Any = None,
                 **kwargs):
        if isinstance(engine, str):
            if engine not in {"auto", "lm15", "litellm"}:
                raise ValueError("engine must be 'auto', 'lm15', 'litellm', or an engine object")
        elif not callable(getattr(engine, "complete", None)):
            raise TypeError("A custom engine must implement complete(Request) -> Response")
```

引擎选择策略：`auto` 优先使用 lm15（DSPy 内置的标准化 API），对不支持的请求回退到 LiteLLM；`lm15` 强制使用标准化 API；`litellm` 保持向后兼容。用户也可以传入自定义引擎对象。

LM 还针对 OpenAI 推理模型（o1/o3/o4/gpt-5 系列）做了特殊处理：

```python
def _get_initial_kwargs(self, *, temperature, max_tokens, **kwargs):
    if _is_openai_reasoning_model(self.model):
        if (temperature and temperature != 1.0) or (max_tokens and max_tokens < 16000):
            raise LMConfigurationError(
                "OpenAI's reasoning models require passing temperature=1.0 or None "
                "and max_tokens >= 16000 or None to `dspy.LM(...)`",
            )
        initial_kwargs = dict(temperature=temperature, max_completion_tokens=max_tokens, **kwargs)
```

---

## 7. 缓存与状态管理：可序列化的程序状态

Predict 实现了完整的状态序列化/反序列化，支持将优化后的程序持久化：

```python
def dump_state(self, json_mode=True):
    state_keys = ["traces", "train"]
    state = {k: getattr(self, k) for k in state_keys}
    state["demos"] = []
    for demo in self.demos:
        demo = demo.copy()
        for field in demo:
            demo[field] = serialize_object(demo[field])
        if isinstance(demo, dict) or not json_mode:
            state["demos"].append(demo)
        else:
            state["demos"].append(demo.toDict())
    state["signature"] = self.signature.dump_state()
    state["lm"] = self.lm.dump_state() if self.lm else None
    return state
```

安全方面，加载状态时会过滤危险的 LM 配置键：

```python
UNSAFE_LM_STATE_KEYS = {"api_base", "base_url", "model_list"}

def _sanitize_lm_state(lm_state: dict, allow_unsafe_lm_state: bool) -> dict:
    if allow_unsafe_lm_state:
        return lm_state
    unsafe_keys = sorted(UNSAFE_LM_STATE_KEYS.intersection(lm_state))
    if not unsafe_keys:
        return lm_state
    sanitized = {k: v for k, v in lm_state.items() if k not in UNSAFE_LM_STATE_KEYS}
    logger.warning("Ignoring unsafe LM config key(s) during state load: %s.", unsafe_keys)
    return sanitized
```

LM 级别也有独立的缓存机制，通过 `request_cache` 装饰器实现响应缓存，并排除敏感参数：

```python
def _get_cached_completion_fn(self, completion_fn, cache):
    ignored_args_for_cache_key = ["api_key", "api_base", "base_url"]
    if cache:
        completion_fn = request_cache(
            cache_arg_name="request",
            ignored_args_for_cache_key=ignored_args_for_cache_key,
        )(completion_fn)
    return completion_fn, {"no-cache": True, "no-store": True}
```

---

## 8. 执行追踪与回调系统

Module 的 `__call__` 通过元类注入回调机制，并维护调用栈追踪：

```python
@with_callbacks
def __call__(self, *args, **kwargs) -> Prediction:
    caller_modules = settings.caller_modules or []
    caller_modules = list(caller_modules)
    caller_modules.append(self)

    with settings.context(caller_modules=caller_modules):
        if settings.track_usage and ... is None:
            with track_usage() as usage_tracker:
                output = self.forward(*args, **kwargs)
            tokens = usage_tracker.get_total_tokens()
            self._set_lm_usage(tokens, output)
            return output
        return self.forward(*args, **kwargs)
```

Predict 的后处理阶段将执行轨迹记录到全局 trace 中：

```python
def _forward_postprocess(self, completions, signature, **kwargs):
    pred = Prediction.from_completions(completions, signature=signature)
    if kwargs.pop("_trace", True) and settings.trace is not None:
        trace = settings.trace
        if len(trace) >= settings.max_trace_size:
            trace.pop(0)
        trace.append((self, {**kwargs}, pred))
    return pred
```

框架还警告直接调用 `forward()` 的行为（应通过 `__call__` 调用以确保回调和追踪生效）：

```python
def __getattribute__(self, name):
    attr = super().__getattribute__(name)
    if name == "forward" and callable(attr):
        stack = inspect.stack()
        forward_called_directly = len(stack) <= 1 or stack[1].function != "__call__"
        if forward_called_directly:
            logger.warning(f"Calling module.forward(...) on {self.__class__.__name__} "
                          f"directly is discouraged. Please use module(...) instead.")
```

---

## 9. 微调与强化学习：端到端优化闭环

LM 客户端内置了微调和强化学习接口，形成"编译 → 优化 → 部署"的完整闭环：

```python
def finetune(self, train_data, train_data_format, train_kwargs=None) -> TrainingJob:
    if not self.provider.finetunable:
        raise LMUnsupportedFeatureError(
            f"Provider {self.provider} does not support fine-tuning...",
        )
    def thread_function_wrapper():
        return self._run_finetune_job(job)
    thread = threading.Thread(target=thread_function_wrapper)
    job = self.provider.TrainingJob(
        thread=thread, model=model_to_finetune,
        train_data=train_data, train_data_format=train_data_format,
        train_kwargs=train_kwargs,
    )
    thread.start()
    return job

def reinforce(self, train_kwargs) -> ReinforceJob:
    if not self.provider.reinforceable:
        raise LMUnsupportedFeatureError(...)
    job = self.provider.ReinforceJob(lm=self, train_kwargs=train_kwargs)
    job.initialize()
    return job
```

微调在后台线程执行，返回 `TrainingJob` 对象供轮询结果。Provider 模式使得不同后端（OpenAI、本地模型等）可以实现各自的微调逻辑。

---

## 10. 并行执行与流式输出

Module 提供了内置的并行批处理能力：

```python
def batch(self, examples: list[Example], num_threads: int | None = None,
          max_errors: int | None = None, return_failed_examples: bool = False,
          timeout: int = 120, straggler_limit: int = 3):
    exec_pairs = [(self, example.inputs()) for example in examples]
    parallel_executor = Parallel(
        num_threads=num_threads, max_errors=max_errors,
        return_failed_examples=return_failed_examples,
        timeout=timeout, straggler_limit=straggler_limit,
    )
    results = parallel_executor.forward(exec_pairs)
    return results
```

流式输出通过 `MemoryObjectSendStream` 实现，LM 客户端在流式模式下将 chunk 实时推送到监听器：

```python
async def stream_completion(request, cache_kwargs):
    response = await _get_litellm().acompletion(
        num_retries=0, cache=cache_kwargs, stream=True, headers=headers, **request,
    )
    chunks = []
    async with aclosing_stream(response):
        async for chunk in response:
            if caller_predict_id:
                chunk.predict_id = caller_predict_id
            chunks.append(chunk)
            stream_emitted()
            await stream.send(chunk)
    raw = _get_litellm().stream_chunk_builder(chunks)
    completed_legacy(raw)
    return raw
```

---

## 架构总结

| 维度 | 设计要点 |
|------|---------|
| **核心抽象** | Module（组合）+ Predict（调用）+ Signature（类型） |
| **优化机制** | 通过修改 Predict.demos 实现 prompt 自动优化 |
| **LM 抽象** | 多引擎（auto/lm15/litellm/自定义），统一 BaseLM 接口 |
| **类型系统** | 自研轻量类型检查，支持泛型、Union、Literal |
| **状态管理** | 完整序列化/反序列化，安全过滤敏感键 |
| **执行模型** | 同步/异步双通道，回调追踪，并行批处理 |
| **微调集成** | Provider 模式，后台线程执行，TrainingJob 轮询 |
| **流式支持** | anyio MemoryStream，chunk 级别推送 |
| **安全设计** | 加载状态时过滤 api_base/base_url，防止 prompt 注入 |
| **元类防护** | ProgramMeta 保证属性初始化，forward 直调警告 |

DSPy 的架构精髓在于**关注点分离**：用户只声明"做什么"（Signature + Module），框架自动决定"怎么做"（Adapter + Optimizer）。这种声明式范式使得 LM 程序可以像传统软件一样被测试、优化和部署，是 Agent 架构设计中值得关注的范式创新。
