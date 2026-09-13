# agno-agi/agno — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/agno-agi/agno  
> 抓取通道: cdn.jsdelivr.net/gh/agno-agi/agno@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent run 循环 / Model 重试 / 缓存 / 工具执行 借鉴

---

## 0. 诚实性说明

- 成功拉取: `libs/agno/agno/models/base.py`（完整 Model 基类，约 2000 行，含重试/缓存/工具执行）、`libs/agno/agno/agent/agent.py`（81KB Agent 主类）
- `memory/v2/memory.py`、`storage/agent/sqlite.py` 在部分请求中 CDN 404
- 所有常量与代码行为源码实读

---

## 1. 系统架构

### 1.1 定位

Agno（原 Phidata）是多 Agent + 工具 + 知识 + 记忆的 Python 框架。核心是 `Agent` 类上的同步/异步/流式 `run`，以及 `Model` 层的统一重试、缓存、工具执行。

### 1.2 源码布局

| 路径 | 职责 | 大小 |
|------|------|------|
| `libs/agno/agno/agent/agent.py` | `Agent` 主类 | 81782 B |
| `libs/agno/agno/models/base.py` | Model 基类 + **重试/缓存/工具执行** | ~2000 行 |
| `libs/agno/agno/run/agent.py` | run 编排 | 35068 B |
| `libs/agno/agno/run/base.py` | Run 基础类型 | 15867 B |
| `libs/agno/agno/tools/function.py` | FunctionTool | 134959 B |
| `libs/agno/agno/memory/v2/memory.py` | Memory v2 | 树确认 |
| `libs/agno/agno/storage/agent/sqlite.py` | Agent 存储 | 树确认 |

---

## 2. Model 基类 — 核心字段（源码实读）

```python
@dataclass
class Model(ABC):
    id: str
    name: Optional[str] = None
    provider: Optional[str] = None
    model_type: ModelType = ModelType.MODEL

    supports_native_structured_outputs: bool = False
    supports_json_schema_outputs: bool = False

    _tool_choice: Optional[Union[str, Dict[str, Any]]] = None
    system_prompt: Optional[str] = None
    instructions: Optional[List[str]] = None

    tool_message_role: str = "tool"
    assistant_message_role: str = "assistant"

    # 缓存
    cache_response: bool = False
    cache_ttl: Optional[int] = None
    cache_dir: Optional[str] = None

    # 重试配置
    retries: int = 0
    delay_between_retries: int = 1
    exponential_backoff: bool = False
    retry_with_guidance: bool = True
    retry_with_guidance_limit: int = 1
```

---

## 3. 重试机制（源码实读）

### 3.1 退避计算

```python
def _get_retry_delay(self, attempt: int) -> float:
    if self.exponential_backoff:
        return self.delay_between_retries * (2 ** attempt)
    return self.delay_between_retries
```

### 3.2 可重试判定

```python
def _is_retryable_error(self, error: ModelProviderError) -> bool:
    # Fast path: already classified
    if isinstance(error, ContextWindowExceededError):
        return False

    non_retryable_codes = {400, 401, 403, 404, 413, 422}
    if error.status_code in non_retryable_codes:
        return False

    # Defense-in-depth: catch context window errors
    error_msg = str(error.message).lower()
    if any(pattern in error_msg for pattern in ModelProviderError.CONTEXT_WINDOW_PATTERNS):
        return False

    return True
```

### 3.3 同步重试

```python
def _invoke_with_retry(self, **kwargs) -> ModelResponse:
    last_exception: Optional[ModelProviderError] = None
    retries_with_guidance_count = kwargs.pop("retries_with_guidance_count", 0)

    for attempt in range(self.retries + 1):
        try:
            return self.invoke(**kwargs)
        except ModelProviderError as e:
            last_exception = ModelProviderError.classify(e)
            if not self._is_retryable_error(last_exception):
                log_error(f"Non-retryable model provider error: {str(e)}")
                raise last_exception from e
            if attempt < self.retries:
                delay = self._get_retry_delay(attempt)
                log_warning(
                    f"Model provider error (attempt {attempt + 1}/{self.retries + 1}): "
                    f"{last_exception}. Retrying in {delay}s..."
                )
                sleep(delay)
            else:
                if self.retries > 0:
                    log_error(f"Model provider error after {self.retries + 1} attempts: {str(e)}")
        except RetryableModelProviderError as e:
            current_count = retries_with_guidance_count
            if current_count >= self.retry_with_guidance_limit:
                raise ModelProviderError(
                    message=f"Max retries with guidance reached. Error: {e.original_error}",
                    model_name=self.name, model_id=self.id,
                )
            kwargs["retries_with_guidance_count"] = current_count + 1
            kwargs["messages"].append(Message(role="user", content=e.retry_guidance_message, temporary=True))
            return self._invoke_with_retry(**kwargs, retry_with_guidance=True)

    raise last_exception
```

### 3.4 Guidance 重试

**关键设计**: `RetryableModelProviderError` 触发 guidance 重试 — 将 guidance 消息（`temporary=True`）追加到 messages，然后递归调用 `_invoke_with_retry`。上限 `retry_with_guidance_limit=1`。

### 3.5 四个重试包装器

| 方法 | 用途 |
|------|------|
| `_invoke_with_retry` | 同步非流式 |
| `_ainvoke_with_retry` | 异步非流式 |
| `_invoke_stream_with_retry` | 同步流式（重试重启整个流） |
| `_ainvoke_stream_with_retry` | 异步流式（重试重启整个流） |

---

## 4. 响应缓存（源码实读）

### 4.1 缓存键生成

```python
def _get_model_cache_key(self, messages, stream, **kwargs) -> str:
    message_data = [{"role": msg.role, "content": msg.content} for msg in messages]
    cache_data = {
        "model_id": self.id,
        "messages": message_data,
        "has_tools": bool(kwargs.get("tools")),
        "response_format": kwargs.get("response_format"),
        "stream": stream,
    }
    cache_str = json.dumps(cache_data, sort_keys=True, default=_cache_default)
    return md5(cache_str.encode()).hexdigest()
```

### 4.2 缓存文件路径

```python
def _get_model_cache_file_path(self, cache_key: str) -> Path:
    if self.cache_dir:
        cache_dir = Path(self.cache_dir)
    else:
        cache_dir = Path.home() / ".agno" / "cache" / "model_responses"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{cache_key}.json"
```

### 4.3 TTL 检查

```python
def _get_cached_model_response(self, cache_key) -> Optional[Dict]:
    cache_file = self._get_model_cache_file_path(cache_key)
    if not cache_file.exists():
        return None
    with open(cache_file, "r", encoding="utf-8") as f:
        cached_data = json.load(f)
    if self.cache_ttl is not None:
        if time() - cached_data["timestamp"] > self.cache_ttl:
            return None
    return cached_data
```

---

## 5. 工具格式化（源码实读）

```python
def _format_tools(self, tools) -> List[Dict[str, Any]]:
    _tool_dicts = []
    for tool in tools or []:
        if isinstance(tool, Function):
            _tool_dicts.append({"type": "function", "function": tool.to_dict()})
        else:
            _tool_dicts.append(tool)
    # Deterministic ordering so prompt caching gets consistent cache hits.
    _tool_dicts.sort(key=self._tool_name)
    return _tool_dicts

@staticmethod
def _tool_name(t: Dict[str, Any]) -> str:
    fn = t.get("function")
    if isinstance(fn, dict):
        return str(fn.get("name", ""))
    return str(t.get("name", ""))
```

**设计要点**: 工具按名称确定性排序，确保 prompt caching 命中一致。适用于 Anthropic / OpenAI / Gemini。

---

## 6. Agent 类关键字段（源码实读）

```python
class Agent:
    max_tool_calls_from_history: Optional[int] = None   # L156
    stream_events: Optional[bool] = None                # L337
```

### 6.1 后台线程池（L722）

```python
self._background_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="agno-bg")
```

**固定 3 个 worker**，用于异步记忆/知识任务。

---

## 7. 工具执行循环（源码实读摘要）

### 7.1 ToolCallMetrics

```python
tool_metrics = ToolCallMetrics()
tool_metrics.timer = function_call_timer
tool_metrics.duration = function_call_timer.elapsed
current_time = time()
tool_metrics.end_time = current_time
tool_metrics.start_time = current_time - function_call_timer.elapsed
```

### 7.2 AgentRunException 处理

```python
if isinstance(function_call_success, AgentRunException):
    a_exc = function_call_success
    _handle_agent_exception(a_exc, additional_input)
    if a_exc.stop_execution:
        stop_after_tool_call_from_exception = True
    function_call_success = False
```

### 7.3 临时消息清理

```python
def _remove_temporary_messages(self, messages: List[Message]) -> None:
    messages[:] = [m for m in messages if not m.temporary]
```

**设计要点**: guidance 重试时追加的 `temporary=True` 消息在后续调用中被清理。

---

## 8. 超时 / 重试 / 限制汇总

| 项 | 默认 | 来源 |
|----|------|------|
| `retries` | **0** | models/base.py |
| `delay_between_retries` | **1** 秒 | models/base.py |
| `exponential_backoff` | **False** | models/base.py |
| `retry_with_guidance` | **True** | models/base.py |
| `retry_with_guidance_limit` | **1** | models/base.py |
| non-retryable HTTP | **{400,401,403,404,413,422}** | models/base.py |
| ContextWindowExceededError | 不重试（fast path） | models/base.py |
| Context window patterns | 防御性检查 | models/base.py |
| `cache_response` | **False** | models/base.py |
| `cache_ttl` | **None**（无过期） | models/base.py |
| `cache_dir` | `~/.agno/cache/model_responses` | models/base.py |
| `max_tool_calls_from_history` | None（不限） | agent.py L156 |
| 后台线程 | **max_workers=3** | agent.py L722 |
| `tool_message_role` | `"tool"` | models/base.py |
| `assistant_message_role` | `"assistant"` | models/base.py |

---

## 9. 失败路径

```
Model 4xx（非可重试: 400/401/403/404/413/422）
  → 直接 raise，不 retry

ContextWindowExceededError
  → fast path，不 retry

Context window patterns in error message
  → 防御性检查，不 retry

Model 429/5xx
  → sleep(delay) → 最多 self.retries 次

RetryableModelProviderError
  → guidance 重试：追加 temporary 消息 → 递归
  → 上限 retry_with_guidance_limit=1
  → 超限后 raise ModelProviderError

重试耗尽
  → raise last_exception

工具执行异常
  → AgentRunException → _handle_agent_exception
  → stop_execution=True → stop_after_tool_call

缓存读写异常
  → 静默 pass（不影响主流程）

流式重试
  → 重启整个流（非断点续传）
```

---

## 10. 与 openmate 映射

| 需求 | Agno 机制 | 可复用度 |
|------|-----------|----------|
| Model 重试 | retries=0, delay=1s, 指数退避可选 | **高** |
| Guidance 重试 | temporary 消息 + 递归 | **高** |
| 不可重试码 | {400,401,403,404,413,422} | 高 |
| Context window 检测 | fast path + 防御性 patterns | 高 |
| 响应缓存 | MD5 key + TTL + 文件存储 | 高 |
| 工具确定性排序 | sort by name（prompt cache 友好） | 高 |
| 后台任务隔离 | ThreadPoolExecutor(3) | 高 |
| 临时消息清理 | temporary=True 标记 | 高 |
| 工具执行指标 | ToolCallMetrics | 中 |
| 会话恢复 | storage + memory v2 | 中 |

---

## 11. 源码锚点速查

```
libs/agno/agno/models/base.py
  class Model(ABC)
    retries: int = 0
    delay_between_retries: int = 1
    exponential_backoff: bool = False
    retry_with_guidance: bool = True
    retry_with_guidance_limit: int = 1
    cache_response: bool = False
    cache_ttl: Optional[int] = None
    cache_dir: Optional[str] = None
    tool_message_role: str = "tool"
    assistant_message_role: str = "assistant"
    _get_retry_delay(): exponential or fixed
    _is_retryable_error(): ContextWindow fast path + non_retryable_codes + patterns
    _invoke_with_retry(): sync non-stream
    _ainvoke_with_retry(): async non-stream
    _invoke_stream_with_retry(): sync stream (restart on retry)
    _ainvoke_stream_with_retry(): async stream (restart on retry)
    _get_model_cache_key(): MD5 of model_id+messages+has_tools+response_format+stream
    _get_model_cache_file_path(): ~/.agno/cache/model_responses/{key}.json
    _get_cached_model_response(): TTL check
    _format_tools(): deterministic sort by name
    _remove_temporary_messages(): filter temporary=True
    _handle_agent_exception(): AgentRunException → additional_input

libs/agno/agno/agent/agent.py
  L74   class Agent
  L156  max_tool_calls_from_history
  L337  stream_events
  L722  ThreadPoolExecutor(max_workers=3, thread_name_prefix="agno-bg")
```

---

## 12. 参考链接

- https://github.com/agno-agi/agno
- https://docs.agno.com/
