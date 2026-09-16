# OpenLLMetry（traceloop, #94, 3k★）功能研究
研究时间：2026-09-16 夜间cron轮 | 源码：~/agent-research-src/openllmetry（55MB，源码级深读）

OTel标准LLM可观测SDK。语义约定已被OpenTelemetry官方收编（GenAI semconv）。30个instrumentation包（openai/anthropic/litellm/langchain/crewai/mcp/12种向量库…）+ traceloop-sdk产品层。可观测第二方确认（与Langfuse互证）。

## 功能清单
| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|---|---|---|---|
| 1. 一行init全instrumentation（Traceloop.init()自动wrap已安装的LLM库，零代码改动） | 无 | 手工打点 | 完全没有 | OpenSoul llm调用统一走gland，可在router层做等效wrap |
| 2. 装饰器语义分层（@workflow/@task/@agent/@conversation——conversation_id把多次调用归组为一个会话trace） | 无 | trajectory扁平 | 完全没有 | 与Langfuse三层模型互证；conversation装饰器=跨轮次聚合的最小API |
| 3. Prompt注册表（get_prompt(key,**args)：服务端版本化prompt+模板渲染，客户端只拿key） | 无 | gene/templates本地 | 部分有 | prompt版本化+A/B的行业标准做法；OpenSoul gene可加版本号+远程注册表 |
| 4. Guardrails组合器（pii_guard/toxicity_guard声明式组合+on_failure策略raise/...+全部结果写span属性：guard_count/failed_guard_count/duration/error_type） | 无 | immune输入侧正则 | 部分有 | **防护结果本身就是可观测数据**——护栏命中率报表免费获得；OpenSoul immune应把每次检测写trajectory |
| 5. Evaluator（SSE流式执行+field_mapping字段映射——数据集列→评估器输入的适配层） | 无 | benchmark 5维自评 | 部分有 | field_mapping解决"数据集schema≠评估器schema"，评估复用的关键 |
| 6. Experiment（数据集行→并发Semaphore跑任务→逐行结果；**_run_in_github：把评估实验跑在GitHub Actions上**） | 无 | 无 | 完全没有 | 评估与业务进程隔离（CI里跑评估=每次提交自动回归）；本地Semaphore版~100行可抄 |
| 7. Datasets（dataset/row/column/attachment实体，评估数据一等公民） | 无 | 无 | 完全没有 | 与langfuse/n8n/Flowise四方互证 |
| 8. Annotation/user_feedback（给trace挂用户反馈，反馈进数据集） | 无 | mind/user_feedback表(评分) | 部分有 | OpenSoul已有反馈表，补trace/消息级挂载 |
| 9. Metrics（token/latency/cost OTel指标） | 无 | metrics_api.py雏形 | 部分有 | 直接用OTel GenAI semconv别自创 |
| 10. MCP instrumentation（mcp包：MCP调用自动成span） | 无 | 无 | 完全没有 | OpenSoul大量走MCP，无观测=盲区 |
| 11. 30个instrumentation包（含chromadb/milvus/qdrant/weaviate等12向量库、sagemaker/bedrock/vertex云、crewai/langchain框架） | 无 | 无 | 借力 | 自研成本高，直接pip装 |
| 12. VCR cassette测试（API调用录制回放，pytest --record-mode） | 无 | 无 | 完全没有 | LLM调用测试的工业方案：录制一次，CI离线回放 |

## 源码亮点
- **span属性即产品**：guardrail/评估/成本全部落成OTel span attribute→任何后端(Datadog/Honeycomb/Jaeger)都能看——"可观测不绑定厂商"的正确姿势
- Guardrails.run()对sync/async函数统一适配（inspect.iscoroutinefunction），护栏不侵入业务代码
- **语义约定进了OpenTelemetry官方**——行业信号：GenAI观测字段已标准化，OpenSoul trajectory schema应向gen_ai semconv对齐（resource.name/gen_ai.request.model/gen_ai.usage.token等），别自定义字段名

## 可复用设计
1. @conversation装饰器思想 → OpenSoul trajectory按conversation_id分组的trace树（与Langfuse Trace→Observation合并设计）
2. Guardrails span属性方案 → immune每次检测记录(规则名/命中/耗时)进trajectory，出拦截率报表
3. VCR cassette → OpenSoul测试体系（LLM调用录制回放）
4. Prompt注册表key→渲染模式 → gene/templates加版本化远程源
