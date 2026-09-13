# LiteLLM

## 概述

LiteLLM 是一个统一LLM API代理。

**仓库**: https://github.com/BerriAI/litellm | **语言**: Python

## 核心架构

> **项目**: [BerriAI/litellm](https://github.com/BerriAI/litellm)  
> **Stars**: 58.6k+ | **语言**: Python + Rust | **许可**: MIT  
> **定位**: 开源 AI Gateway，统一 100+ LLM API 为 OpenAI 兼容格式

LiteLLM 采用**双层架构**——SDK 层与 Proxy 层分离，共享核心翻译逻辑：

[详见源码]

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

1. 在 `litellm/models/` 下定义 Pydantic 模型
2. 如需向后兼容，在 `proxy/_types.py` 中重新导出
3. 在 `litellm/repositories/` 下添加 Repository（继承 `BaseRepository`）
4. 在 `proxy/schema.prisma` 中添加对应表定义

LiteLLM 的核心设计哲学是**"翻译层隔离 + 统一接口"**：

1. **Provider 隔离**：每个 LLM 提供商的差异被封装在独立的 `transformation.py` 中，互不干扰
2. **统一抽象**：所有请求最终归一为 OpenAI 格式的 `ModelResponse`，上层代码无需感知底层差异
3. **双模部署**：SDK 和 Proxy 共享翻译层，避免代码重复
4. **渐进式复杂度**：简单场景用 SDK 一行代码，复杂场景用 Proxy 获得认证/限流/追踪/负载均衡
5. **Rust 性能层**：`litellm-rust/` 目录表明关键路径已用 Rust 重写，确保 Gateway 性能

对于 OpenMate 而言，LiteLLM 的架构提供了重要参考：**如何用翻译层模式统一异构 API，以及如何在 SDK 和 Gateway 之间共享核心逻辑**。

## 关键技术

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

## 对openmate的启示

> 仓库: https://github.com/BerriAI/litellm  
> 抓取通道: cdn.jsdelivr.net/gh/BerriAI/litellm@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 LLM 网关 / Router 重试与熔断 / 异常分类 / 中流降级借鉴

---

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

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（58-litellm.md）
- MiMo报告（litellm-l1.md）
- MiMo卡片（litellm.md）
