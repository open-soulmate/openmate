# 58 — LiteLLM 架构分析

> **项目**: [BerriAI/litellm](https://github.com/BerriAI/litellm)  
> **Stars**: 58.6k+ | **语言**: Python + Rust | **许可**: MIT  
> **定位**: 开源 AI Gateway，统一 100+ LLM API 为 OpenAI 兼容格式

## 1. 核心定位与价值主张

LiteLLM 的核心使命是**消除 LLM 生态的碎片化**。它同时提供两种使用形态：

- **Python SDK**：直接在代码中 `import litellm`，一行调用任意 LLM
- **AI Gateway（Proxy Server）**：部署为集中式服务，为团队提供统一入口

关键卖点：
- **统一 API**：100+ LLM 提供商，一套 OpenAI 兼容接口
- **Drop-in 替换**：只需改 `model` 参数即可切换提供商，零代码改动
- **生产就绪**：虚拟 API Key、花费追踪、Guardrails、负载均衡、管理后台开箱即用
- **高性能**：8ms P95 延迟 @ 1k RPS

## 2. 整体架构分层

LiteLLM 采用**双层架构**——SDK 层与 Proxy 层分离，共享核心翻译逻辑：

```
┌─────────────────────────────────────────────┐
│            Proxy Layer (AI Gateway)          │
│  proxy_server.py → auth → hooks → router    │
│  ├── 认证/授权 (API Key, JWT, OAuth2)        │
│  ├── 花费追踪 (DBSpendUpdateWriter)          │
│  ├── 速率限制 (parallel_request_limiter)     │
│  ├── Guardrails                              │
│  └── 管理端点 (teams, keys, users)           │
├─────────────────────────────────────────────┤
│              SDK Layer (litellm/)            │
│  main.py → utils.py → llm_http_handler.py   │
│  ├── Provider 翻译层 (llms/{provider}/)      │
│  ├── 流式处理 (streaming_handler.py)         │
│  ├── 缓存 (caching/)                         │
│  ├── Router 负载均衡 (router.py)             │
│  └── 集成回调 (integrations/)                │
├─────────────────────────────────────────────┤
│           Infrastructure Layer               │
│  PostgreSQL + Redis + APScheduler            │
│  Prisma ORM + DualCache                      │
└─────────────────────────────────────────────┘
```

## 3. 请求处理流程

### SDK 路径

```
litellm.completion()
  → main.py (入口)
    → utils.py get_llm_provider() (解析 model → provider)
      → llms/custom_httpx/llm_http_handler.py (HTTP 编排)
        → llms/{provider}/chat/transformation.py (请求翻译)
          → HTTPHandler (实际 HTTP 调用)
            → Provider API
              → transform_response() (响应翻译)
                → streaming_handler.py (流式处理)
                  → ModelResponse (统一响应)
                    → integrations/ (异步回调: Langfuse, Datadog 等)
```

### Proxy 路径

```
POST /v1/chat/completions
  → proxy_server.py chat_completion()
    → auth/user_api_key_auth.py (认证 + 限流)
      → common_request_processing.py (预处理)
        → Router (路由选择 + 负载均衡)
          → SDK 路径 (同上)
            → proxy_track_cost_callback.py (成本计算)
              → DBSpendUpdateWriter (批量写入 spend logs)
```

## 4. 翻译层架构（Translation Layer）

这是 LiteLLM 最核心的设计——**每个提供商的 API 差异被隔离在独立的 transformation 文件中**：

```python
class ProviderConfig(BaseConfig):
    def transform_request(self, model, messages, optional_params, litellm_params, headers):
        # OpenAI 格式 → 提供商原生格式
        return {"messages": transformed_messages, ...}

    def transform_response(self, model, raw_response):
        # 提供商原生响应 → OpenAI ModelResponse
        return ModelResponse(...)
```

关键翻译文件分布：

| 入口 API | 提供商 | 翻译文件 |
|----------|--------|----------|
| `/v1/chat/completions` | Anthropic | `llms/anthropic/chat/transformation.py` |
| `/v1/chat/completions` | Bedrock | `llms/bedrock/chat/invoke_transformations/` |
| `/v1/chat/completions` | Gemini | `llms/gemini/chat/transformation.py` |
| `/v1/chat/completions` | Vertex AI | `llms/vertex_ai/gemini/transformation.py` |
| `/v1/chat/completions` | OpenAI | `llms/openai/chat/gpt_transformation.py` |
| `/v1/messages` (透传) | Anthropic | `llms/anthropic/experimental_pass_through/` |

这种设计使得**添加新提供商只需 3 步**：创建 `llms/{provider}/chat/transformation.py`，实现 `Config` 类的 `transform_request()` 和 `transform_response()`，然后添加测试。

## 5. Router 与负载均衡

Router（`router.py`）是 SDK 层的核心组件，负责：

- **多部署管理**：同一模型组（model group）可关联多个部署（不同提供商/区域）
- **路由策略**：支持 `simple-shuffle`（随机）、`lowest-latency`（最低延迟）、`lar1` 等算法
- **Fallback 机制**：主部署失败时自动切换到备用部署，支持跨提供商 fallback
- **健康检查**：`_run_background_health_check` 持续监控部署健康状态
- **冷却机制**：失败的部署自动进入冷却期

Router 内部维护 `model_name_to_deployment_indices` 索引，实现 O(1) 模型查找而非 O(n) 线性扫描。每个部署的元数据（TPM/RPM 限制、冷却状态等）存储在 `Router.cache: DualCache`（内存 + Redis 双层缓存）中。

## 6. 缓存体系

LiteLLM 实现了**三层缓存**架构：

| 层级 | 组件 | 用途 |
|------|------|------|
| Proxy 层 | `InternalUsageCache` | API Key 缓存、速率限制计数（内存 + Redis） |
| Router 层 | `Router.cache (DualCache)` | TPM/RPM 追踪、部署冷却状态 |
| SDK 层 | `LLMCachingHandler` + `Cache` | LLM 响应/Embedding 结果缓存 |

`DualCache` 是关键抽象——先查内存 L1，miss 后查 Redis L2，兼顾速度与分布式一致性。

## 7. 认证与授权

Proxy 层的认证体系（`proxy/auth/`）支持多种方式：

- **API Key 认证**：`LiteLLM_VerificationToken` 表存储虚拟 Key，支持 Key 轮换（`key_rotation_manager.py`，每小时自动处理）
- **JWT 认证**：对接外部身份提供商
- **OAuth2/SSO**：`custom_sso.py` 支持企业 SSO 集成
- **团队隔离**：`LiteLLM_TeamTable` 实现多租户，每个团队独立的模型访问权限和预算

认证结果缓存在 `InternalUsageCache` 中，避免每次请求都查库。

## 8. 花费追踪与成本计算

这是 LiteLLM 的差异化能力之一：

1. **成本计算**：`cost_calculator.py` 中的 `litellm.completion_cost()` 根据 token 用量和模型定价计算费用
2. **响应注入**：`response_metadata.py` 将成本存入 `response._hidden_params["response_cost"]`
3. **Header 透传**：`common_request_processing.py` 提取成本写入 `x-litellm-response-cost` 响应头
4. **异步写入**：`_ProxyDBLogger.async_log_success_event()` 触发回调 → `DBSpendUpdateWriter` 批量写入 `LiteLLM_SpendLogs` 表
5. **定期报告**：APScheduler 调度周报/月报通过 Slack 发送花费报告

`DBSpendUpdateWriter` 采用**批量写入**策略（每 60 秒聚合一次），避免高频 DB 写入成为瓶颈。

## 9. 后台任务调度

LiteLLM 使用 APScheduler 管理所有后台任务：

| 任务 | 间隔 | 功能 |
|------|------|------|
| `update_spend` | 60s | 批量写入 spend logs |
| `add_deployment` | 10s | 从 DB 同步新模型部署 |
| `cleanup_old_spend_logs` | cron | 清理历史 spend logs |
| `check_batch_cost` | 30min | 计算 batch job 成本 |
| `process_rotations` | 1hr | 自动轮换 API Key |
| `health_check` | 持续 | 模型部署健康检查 |
| `weekly/monthly_spend_report` | 周/月 | Slack 花费告警 |

这些任务在 `ProxyStartupEvent.initialize_scheduled_background_jobs()` 中统一初始化。

## 10. 数据访问层与存储

### Prisma ORM + Repository 模式

LiteLLM 采用**模型 + 仓库**的分层数据访问：

- **Model 层**（`litellm/models/`）：Pydantic 模型定义，如 `LiteLLM_VerificationToken`、`LiteLLM_TeamTable`、`LiteLLM_UserTable`
- **Repository 层**（`litellm/repositories/`）：`BaseRepository[T]` 提供泛型 CRUD（`find_by_id`, `find_many`, `create`, `update`, `delete`, `count`, `exists`），实体 Repository 在此基础上扩展领域查询
- **Schema 定义**：`proxy/schema.prisma` 使用 Prisma schema 定义数据库结构

### 存储基础设施

- **PostgreSQL**：主存储（API Key、团队、用户、spend logs），支持读写分离（writer + reader）
- **Redis**：缓存层（速率限制、模型状态、LLM 响应缓存）
- **Object Store**：版本化对象存储（proxy 状态 + 文件上传）

JSON 列的处理遵循统一约定：写入时 `json.dumps()`，读取时 `json.loads()`，由 Repository 层的 `_to_model` 和 `_build_*_data` 辅助方法封装。

### 添加新实体的流程

1. 在 `litellm/models/` 下定义 Pydantic 模型
2. 如需向后兼容，在 `proxy/_types.py` 中重新导出
3. 在 `litellm/repositories/` 下添加 Repository（继承 `BaseRepository`）
4. 在 `proxy/schema.prisma` 中添加对应表定义

---

## 总结：LiteLLM 的架构哲学

LiteLLM 的核心设计哲学是**"翻译层隔离 + 统一接口"**：

1. **Provider 隔离**：每个 LLM 提供商的差异被封装在独立的 `transformation.py` 中，互不干扰
2. **统一抽象**：所有请求最终归一为 OpenAI 格式的 `ModelResponse`，上层代码无需感知底层差异
3. **双模部署**：SDK 和 Proxy 共享翻译层，避免代码重复
4. **渐进式复杂度**：简单场景用 SDK 一行代码，复杂场景用 Proxy 获得认证/限流/追踪/负载均衡
5. **Rust 性能层**：`litellm-rust/` 目录表明关键路径已用 Rust 重写，确保 Gateway 性能

对于 OpenMate 而言，LiteLLM 的架构提供了重要参考：**如何用翻译层模式统一异构 API，以及如何在 SDK 和 Gateway 之间共享核心逻辑**。
