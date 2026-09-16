# LiteLLM 功能研究

研究时间：2026-09-16（cron第26轮）
GitHub: https://github.com/BerriAI/litellm （Python，Rust core + Python SDK，100+ provider）
研究方式：shallow clone源码，逐模块阅读litellm/目录

## 架构概述

LiteLLM是**LLM API网关**：统一OpenAI格式调用100+ provider。两大形态：
- **SDK**：`litellm.completion()` 一个函数调所有模型
- **Proxy**：独立网关服务，带路由、负载均衡、成本、预算、缓存、告警、审计
- 核心模块：`router.py`（路由策略）、`caching/`（8种缓存后端）、`integrations/`（40+日志/监控集成）、`cost_calculator.py`、`budget_manager.py`

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **统一provider抽象**：100+ LLM API统一为OpenAI格式调用 | ❌前端无 | 部分：Hermes有多provider支持（262 tools模块），OpenSoul经acp-proxy调用 | 部分有 | Hermes已覆盖大部分，OpenSoul自身如需直连多provider可评估引入litellm SDK |
| 2 | **智能路由策略**（router_strategy/）：lowest_cost、lowest_latency、least_busy、lowest_tpm_rpm、quality_router、complexity_router、tag_based、adaptive | ❌ | 部分：acp-proxy管调度超时重试，但无"按成本/延迟/质量选模型" | 完全没有 | 高价值。复杂度路由（简单任务→便宜模型，复杂任务→强模型）省钱且用户关心资源。实现：任务分类器+模型映射表 |
| 3 | **Fallback链**：主模型失败自动降级到备用模型/备用provider | ❌ | 部分：Hermes有provider fallback | 部分有 | OpenSoul层需同样机制，防止单provider故障 |
| 4 | **成本计算**（cost_calculator.py + model_prices_and_context_window.json）：内置1000+模型单价，自动算每次调用成本 | ❌ | ❌ | 完全没有 | 最高价值。litellm开源维护这份JSON，直接复用（定期同步），OpenSoul记录每次调用成本 |
| 5 | **预算管理**（budget_manager.py）：按用户/团队/项目设预算上限，超限拦截 | ❌ | ❌（immune/rate_limiter只限频率不限钱） | 完全没有 | 中高价值。售前多项目场景按项目分账。实现：预算表+调用前检查 |
| 6 | **多层缓存**（caching/）：内存、Redis、Redis Cluster、Disk、S3、GCS、Azure Blob、**语义缓存**（Qdrant/Redis/Valkey embedding相似度匹配） | ❌ | 部分：reflex缓存 + acp-proxy缓存 | 部分有 | 已有基础缓存。**语义缓存**是亮点：相似问题直接命中缓存，售前重复问题多，价值高 |
| 7 | **40+日志/监控集成**（integrations/）：Langfuse、OpenTelemetry、Prometheus、Datadog、S3、Slack告警、Braintrust、W&B、MLflow、Traceloop… | ❌ | 部分：vital/collector.py | 部分有 | 不必全接。做trace时先落本地库，预留OTel导出口 |
| 8 | **Prometheus指标端点**：TTFT、TPM、RPM、错误率、成本等标准指标 | ❌ | ❌ | 完全没有 | 中价值。OpenSoul加/prometheus端点，运维标准 |
| 9 | **健康检查+冷却**（router_utils/health_state_cache + cooldown_handlers）：provider故障自动冷却、定期探活 | ❌ | 部分：vital/health.py有系统健康检查 | 部分有 | LLM provider级健康检查缺失。加"定期探活各provider，故障摘除" |
| 10 | **限流**：按key/用户/团队的TPM/RPM限流 | ❌ | ✅immune/rate_limiter.py | 已有 | 已有频率限流，可补token级限流 |
| 11 | **Guardrails钩子**（integrations/custom_guardrail.py）：pre-call/post-call钩子挂安全检查 | ❌ | 部分：本轮NeMo研究建议的Rail管线可对接此模式 | 部分有 | 与NeMo-Guardrails研究结论一致：LLM调用统一入口加pre/post钩子 |
| 12 | **A2A协议支持**（a2a_protocol/）：代理层支持Agent-to-Agent协议 | ❌ | ✅src/a2a/已有 | 已有 | 已有 |
| 13 | **MCP客户端**（experimental_mcp_client/）：代理层透传MCP工具 | ❌ | ✅src/mcp/已有 | 已有 | 已有 |
| 14 | **Batch API支持**：异步批量推理（50%折扣） | ❌ | ❌ | 完全没有 | 低优先级，售前实时场景为主 |
| 15 | **Fine-tuning管理**：统一入口管理多provider微调任务 | ❌ | ❌ | 完全没有 | 低优先级 |
| 16 | **Prompt管理**（custom_prompt_management.py）：从外部prompt库拉取prompt模板 | ❌ | 部分：gene/模板系统 | 部分有 | gene/已覆盖 |
| 17 | **凭证管理**（credential_endpoints、clientside_credential_handler）：集中管理API key、支持外部secret manager | ❌ | 部分：config/.env | 部分有 | 单机自用够用 |
| 18 | **影子评估**（shadow_eval_logger.py）：生产流量镜像到新模型做对比评估 | ❌ | ❌ | 完全没有 | 亮点功能。切换模型前用真实流量对比质量，售前演示场景降低翻车风险 |
| 19 | **合规检查**（compliance_checks.py）：请求内容合规扫描 | ❌ | 部分：immune/moderator.py | 部分有 | 与NeMo研究结论合并处理 |
| 20 | **Rust核心**（litellm-rust/）：性能关键路径用Rust重写 | ❌ | ❌（纯Python） | 完全没有 | 用户明确不偏好Rust，跳过。Python 20MB内存占用足够 |

## 源码亮点

1. **router_strategy/的策略插件化**：每种路由策略一个文件（lowest_cost.py、least_busy.py…），统一基类。OpenSoul如果做"模型选择器"，直接抄这个结构。
2. **语义缓存**（qdrant_semantic_cache.py等）：相似度>阈值的提问直接返回缓存答案。售前场景"XX产品参数是多少"高频重复，省token省时间。
3. **cooldown机制**：provider报错→进冷却池→定期探活恢复。比简单重试优雅得多。
4. **model_prices_and_context_window.json**：1000+模型的价格和上下文窗口数据，社区维护。这是公开数据文件，直接拉取使用。
5. **shadow_eval**：生产流量复制到候选模型，对比输出质量后再切换。"模型升级不翻车"的关键。

## 可复用设计（针对OpenSoul/acp-proxy）

- **成本追踪**（最高价值，与Langfuse研究合并）：
  ```
  1. 拉取litellm的model_prices_and_context_window.json作为价格源
  2. acp-proxy每次LLM调用后：token数 × 单价 = 成本，落库
  3. OpenMate展示：按会话/按天/按模型的成本报表
  ```
- **复杂度路由**：cortex/task_planner.py已有任务分析，在其后加"模型选择"步骤：简单任务（闲聊/查资料）→小模型，复杂任务（方案/代码）→大模型。省成本立竿见影。
- **pre/post钩子**：acp-proxy的LLM调用入口加钩子机制，pre-hook挂输入rails（NeMo），post-hook挂输出rails+trace记录。一个改动同时解决安全和可观测性。
- **语义缓存**：OpenSoul reflex/缓存升级为语义缓存（本地embedding + SQLite向量检索，无需Qdrant）。

## 与OpenMate的对接

- 运维页面增加"模型成本"面板：今日/本周/本月成本、按模型分布
- 模型选择器：对话页面允许手动指定模型，或"自动"（复杂度路由）
