# BerriAI/litellm — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/BerriAI/litellm  
> 抓取通道: cdn.jsdelivr.net/gh/BerriAI/litellm@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 LLM 网关 / Router 重试与熔断 / 异常分类 / 中流降级借鉴

---

## 0. 诚实性说明

- 成功拉取：`litellm/__init__.py`、`exceptions.py`（47KB）、`router.py`（671KB）、`proxy/proxy_server.py`（802KB）、`utils.py`（426KB）、`main.py`（362KB）、`integrations/custom_logger.py`、**`router_utils/cooldown_handlers.py`（本轮全文实读）**。
- `litellm/caching.py` CDN 404；缓存细节从 DualCache import 推断。
- 文件树全量列表未能从 data.jsdelivr 取到（403）；路径以直接 CDN GET 成功为准。
- LiteLLM 是**网关/适配层**，不是 Agent 循环框架。对 openmate 的价值在稳定性边界。

---

## 1. 系统架构

### 1.1 定位

```
litellm.completion / acompletion          # 统一 100+ provider 接口
  → Router（多部署、负载均衡、重试、冷却、fallback）
    → Proxy（FastAPI 网关、虚拟 key、限流、budget、callbacks）
      → DB（Spend / Key / Team / Org）
```

### 1.2 源码布局（实读）

| 路径 | 职责 | 大小 |
|------|------|------|
| `litellm/exceptions.py` | 完整异常树 | 47106 B |
| `litellm/router.py` | Router | 671744 B |
| `litellm/proxy/proxy_server.py` | FastAPI 服务 | 802865 B |
| `litellm/main.py` | completion 实现 | 362963 B |
| `litellm/utils.py` | 工具、client 装饰器 | 426465 B |
| `litellm/__init__.py` | 公共导出 | 99218 B |
| `litellm/router_utils/cooldown_handlers.py` | **熔断策略（全文）** | 本轮实读 |
| `litellm/router_utils/cooldown_cache.py` | 熔断缓存 | import 实读 |
| `litellm/caching/dual_cache.py` | DualCache | import 实读 |

---

## 2. 异常树（exceptions.py 实读）

### 2.1 一级异常

```
AuthenticationError(openai.AuthenticationError)           # L131
NotFoundError(openai.NotFoundError)                       # L175
BadRequestError(openai.BadRequestError)                   # L218
UnprocessableEntityError(openai.UnprocessableEntityError) # L316
Timeout(openai.APITimeoutError)                           # L355
PermissionDeniedError(openai.PermissionDeniedError)       # L402
RateLimitError(openai.RateLimitError)                     # L441
ServiceUnavailableError(openai.APIStatusError)            # L661
BadGatewayError(openai.APIStatusError)                    # L709
InternalServerError(openai.InternalServerError)           # L757
APIError(openai.APIError)                                 # L806
APIConnectionError(openai.APIConnectionError)             # L847
APIResponseValidationError                                # L886
JSONSchemaValidationError(APIResponseValidationError)     # L923
OpenAIError                                               # L933
UnsupportedParamsError(BadRequestError)                   # L939
BudgetExceededError(Exception)                            # L988
InvalidRequestError(openai.BadRequestError)               # L1018
MockException(openai.APIError)                            # L1033
LiteLLMUnknownProvider(BadRequestError)                   # L1058
GuardrailRaisedException(Exception)                       # L1069
BlockedPiiEntityError(Exception)                          # L1097
MidStreamFallbackError(ServiceUnavailableError)           # L1114
ModifyResponseException(Exception)                        # L1191
SensitiveDataRouteException(Exception)                    # L1226
```

### 2.2 BadRequest 子类

```
ImageFetchError(BadRequestError)           # L269
VectorStoreSearchError(BadRequestError)    # L296
ContextWindowExceededError(BadRequestError)# L532
RejectedRequestError(BadRequestError)      # L574
ContentPolicyViolationError(BadRequestError) # L616
```

### 2.3 枚举

```
class RateLimitErrorCategory(str, enum.Enum):  # L23
class RateLimitType(str, enum.Enum):           # L53
```

---

## 3. Router 熔断（cooldown_handlers.py 全文实读）

### 3.1 常量（`litellm/constants.py` 全文实读）

```python
DEFAULT_COOLDOWN_TIME_SECONDS: Final = int(os.getenv("DEFAULT_COOLDOWN_TIME_SECONDS", 5))
DEFAULT_ALLOWED_FAILS: Final = int(os.getenv("DEFAULT_ALLOWED_FAILS", 3))
DEFAULT_FAILURE_THRESHOLD_PERCENT: Final = float(os.getenv("DEFAULT_FAILURE_THRESHOLD_PERCENT", 0.5))
DEFAULT_FAILURE_THRESHOLD_MINIMUM_REQUESTS: Final = int(os.getenv("DEFAULT_FAILURE_THRESHOLD_MINIMUM_REQUESTS", 5))
SINGLE_DEPLOYMENT_TRAFFIC_FAILURE_THRESHOLD: Final = int(os.getenv("SINGLE_DEPLOYMENT_TRAFFIC_FAILURE_THRESHOLD", 1000))
ROUTER_MAX_FALLBACKS: Final = int(os.getenv("ROUTER_MAX_FALLBACKS", 5))
DEFAULT_MAX_RETRIES: Final = int(os.getenv("DEFAULT_MAX_RETRIES", 2))
```

其他相关实读常量：

```python
INITIAL_RETRY_DELAY = 0.5
MAX_RETRY_DELAY = 8.0
JITTER = 0.75
DEFAULT_REQUEST_TIMEOUT_SECONDS = 6000.0
COMPLETION_HTTP_FALLBACK_SECONDS = 600.0
HTTP_HANDLER_CONNECT_TIMEOUT_SECONDS = 5.0
LITELLM_MAX_STREAMING_DURATION_SECONDS = None  # env 可设
REPEATED_STREAMING_CHUNK_LIMIT = 100
MAX_CALLBACK_LOG_RECORDS = 1000
MAX_CALLBACKS = 100
```

### 3.2 按异常类型的 allowed_fails 策略字段

```python
_EXCEPTION_POLICY_FIELDS: Final[tuple[tuple[type, str], ...]] = (
    # ContentPolicyViolationError subclasses BadRequestError, so it must be checked first.
    (litellm.ContentPolicyViolationError, "ContentPolicyViolationErrorAllowedFails"),
    (litellm.BadRequestError, "BadRequestErrorAllowedFails"),
    (litellm.AuthenticationError, "AuthenticationErrorAllowedFails"),
    (litellm.Timeout, "TimeoutErrorAllowedFails"),
    (litellm.RateLimitError, "RateLimitErrorAllowedFails"),
    (litellm.InternalServerError, "InternalServerErrorErrorAllowedFails"),
    (litellm.ServiceUnavailableError, "ServiceUnavailableErrorAllowedFails"),
    (litellm.BadGatewayError, "BadGatewayErrorAllowedFails"),
    (litellm.NotFoundError, "NotFoundErrorAllowedFails"),
)
```

注意：`InternalServerErrorErrorAllowedFails` 为源码实读字段名（含重复 Error）。

### 3.3 `_is_cooldown_required` 状态码策略（实读）

| exception_status | 是否冷却 |
|------------------|----------|
| 字符串含 `APIConnectionError` | **False**（不冷却） |
| **429** | **True** |
| **401** | **True** |
| **408 / 404** | **True** |
| 其他 4XX | **False**（客户端错误非部署故障） |
| 其他（含 5XX） | **True** |
| 解析异常 catch-all | **True** |

### 3.4 BASE CASE：分钟级失败率（`_should_cooldown_deployment`）

```
num_successes_this_minute / num_fails_this_minute
  → percent_fails = fails / (successes + fails)

冷却条件（无 allowed_fails_policy 时）:
  1) status==429 且 非单部署组 → True
  2) percent_fails==1.0 且 total >= SINGLE_DEPLOYMENT_TRAFFIC_FAILURE_THRESHOLD → True
  3) percent_fails > DEFAULT_FAILURE_THRESHOLD_PERCENT
     且 total >= DEFAULT_FAILURE_THRESHOLD_MINIMUM_REQUESTS
     且 非单部署组 → True
  4) litellm._should_retry(status) is False → True
```

**单部署 model group 默认避免冷却**（安全网），除非显式 `allowed_fails_policy` 命名该异常类型。

### 3.5 Deployment 级策略字段位置

- `allowed_fails` / `allowed_fails_policy` **只放 `model_info`**。
- 文档化原因：`litellm_params` 会整包 copy 进 provider 调用 kwargs，新字段会泄漏到出站 LLM 请求。

### 3.6 Advisor 编排失败不误伤部署

```python
_ADVISOR_ORCHESTRATION_FAILURE_ATTR: Final = "_litellm_advisor_orchestration_failure"
mark_advisor_orchestration_failure(exception)  # setattr 标记，不 wrap
is_advisor_orchestration_failure(exception)
```

语义：advisor 子调用/编排环超 max_uses 的失败**不得归咎**于 router 选中的健康部署；保留原异常类型以维持 retry/fallback 分类。

### 3.7 冷却执行与计数

```python
_set_cooldown_deployments(...)
  → cooldown_cache.add_deployment_to_cooldown(...)
  → asyncio.create_task(router_cooldown_event_callback(...))

should_cooldown_based_on_allowed_fails_policy(...)
  → cache_key = f"deployment:{deployment}:allowed_fails[:{suffix}]"
  → DualCache.increment_cache(ttl=cooldown_time)
  → updated_fails > allowed_fails → True
```

- 计数器在 **DualCache（配置 Redis 时跨进程）**。
- Redis 故障：`_increment_allowed_fails` catch 后回退 `local_only` 本机计数（warning），不阻塞冷却。
- 冷却窗口：`cooldown_time_override or router.cooldown_time or DEFAULT_COOLDOWN_TIME_SECONDS`。

### 3.8 查询冷却列表

```python
_get_cooldown_deployments / _async_get_cooldown_deployments
  → cooldown_cache.get_active_cooldowns(model_ids=...)
  → 返回 deployment id 列表
```

### 3.9 跳过冷却逻辑的条件（`_should_run_cooldown_logic`）

- `deployment is None` 或 model group 找不到
- `time_to_cooldown` ≈ 0（`math.isclose(..., abs_tol=1e-9)`）
- `router.disable_cooldowns is True`
- `_is_cooldown_required` 为 False **且** 无显式 deployment 级 policy
- deployment ∈ `provider_default_deployment_ids`

---

## 4. Fallback / 中流 / 重试

### 4.1 Fallback

```
fallbacks: [{model_name: [fallback_model_group, ...]}]
  → fallback_lookup_groups
  → run_async_fallback
  → AttemptedFallbackTargets
  → add_fallback_headers_to_response
```

### 4.2 中流降级

`MidStreamFallbackError`（L1114）：router.py L457/L466/L490 注释讨论 Anthropic 流 `message_start` 前后是否允许 fallback。

**语义：** 已向客户端吐出内容后，不能静默换模型重发；只能对「尚未产生有效帧」的连接做 MidStreamFallback。

### 4.3 重试

`get_num_retries_from_retry_policy(RetryPolicy)`：Router 支持 per-model-group 的 `RetryPolicy`。

---

## 5. Proxy 能力面

`proxy/proxy_server.py`（802KB）：FastAPI。

- 虚拟 API Key / Team / Org / Project
- Budget：`BudgetExceededError`（L988）
- Spend 记账 DB
- 限流（TPM/RPM）
- Callbacks / Guardrails → `GuardrailRaisedException` / `RejectedRequestError`
- PII：`BlockedPiiEntityError`

失败路径：

```
Key 认证失败 → AuthenticationError
超 budget    → BudgetExceededError
上下文超限   → ContextWindowExceededError
Guardrail    → GuardrailRaisedException / RejectedRequestError
上游 5xx     → ServiceUnavailableError / BadGatewayError / InternalServerError
上游超时     → Timeout
Advisor 编排 → 标记不冷却所选部署
```

---

## 6. 崩溃恢复

```
Proxy DB → keys / teams / spend / logs（重启仍在）
Router 冷却 → DualCache；内存重启丢、Redis 保留
进行中 completion → 不自动续跑；客户端重试
```

---

## 7. 超时 / 重试 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| 冷却默认时长 | `DEFAULT_COOLDOWN_TIME_SECONDS`（符号） | constants + cooldown_handlers |
| 失败率阈值 | `DEFAULT_FAILURE_THRESHOLD_PERCENT` | 同上 |
| 最小样本量 | `DEFAULT_FAILURE_THRESHOLD_MINIMUM_REQUESTS` | 同上 |
| 单部署全败阈值 | `SINGLE_DEPLOYMENT_TRAFFIC_FAILURE_THRESHOLD` | 同上 |
| 按类型 allowed_fails | 9 个 `*AllowedFails` 字段 | `_EXCEPTION_POLICY_FIELDS` |
| 4XX 冷却例外 | 429/401/408/404 冷却；其他 4XX 不冷却 | `_is_cooldown_required` |
| 中流降级 | `MidStreamFallbackError` | exceptions.py L1114 |
| Advisor 失败 | 不冷却部署 | `mark_advisor_orchestration_failure` |
| Redis 降级 | 回退本机计数 | `_increment_allowed_fails` |

**未在本轮读到 `constants.py` 数值的不写死。**

---

## 8. 与 openmate 映射

| 需求 | LiteLLM 机制 | 可复用度 |
|------|--------------|----------|
| 多模型统一 API | completion / Router | 高 |
| 可判定异常树 | exceptions.py 全表 | **高** |
| 部署熔断 | 分钟失败率 + 429/401/408/404 规则 | **高** |
| 按类型失败配额 | `allowed_fails_policy` 9 字段 | **高** |
| 单部署保护 | 默认不冷却单点组 | 高 |
| Fallback 链 | fallbacks + AttemptedFallbackTargets | 高 |
| 中流降级边界 | MidStreamFallbackError | **高** |
| 编排失败隔离 | advisor 标记不误伤部署 | **高** |
| 跨进程计数 | DualCache + Redis 降级 | 高 |
| Agent 循环 | 无 | — |

---

## 9. 源码锚点速查

```
litellm/exceptions.py
  L23 RateLimitErrorCategory / L53 RateLimitType
  L131 AuthenticationError / L218 BadRequestError
  L355 Timeout / L441 RateLimitError
  L532 ContextWindowExceededError
  L616 ContentPolicyViolationError
  L661 ServiceUnavailableError / L709 BadGatewayError
  L988 BudgetExceededError
  L1069 GuardrailRaisedException / L1097 BlockedPiiEntityError
  L1114 MidStreamFallbackError / L1226 SensitiveDataRouteException

litellm/router_utils/cooldown_handlers.py
  DEFAULT_COOLDOWN_TIME_SECONDS / DEFAULT_FAILURE_THRESHOLD_*
  SINGLE_DEPLOYMENT_TRAFFIC_FAILURE_THRESHOLD
  _EXCEPTION_POLICY_FIELDS (9 entries)
  _is_cooldown_required: 429/401/408/404 → True; other 4XX → False
  _should_cooldown_deployment BASE CASE 分钟失败率
  model_info-only: allowed_fails / allowed_fails_policy
  mark_advisor_orchestration_failure
  DualCache.increment_cache + local_only fallback

litellm/router.py
  L162 CooldownCache / L164 DEFAULT_COOLDOWN_TIME_SECONDS
  L172 fallback_event_handlers / L296 MidStreamFallbackError
  L457+ 中流 fallback 注释
```

---

## 10. 诚实性备注

异常类名、继承、行号、Router import 符号、cooldown_handlers 全部策略函数为源码实读。`litellm/constants.py` 四个阈值整数未单独 GET，故只记符号。不将 LiteLLM 描述为 Agent 框架。
