# Semantic Kernel (#66, 25k★, Microsoft) 功能研究（源码级升级）

研究时间：2026-09-16 17:40（cron自动）
源码：git clone → ~/agent-research-src/semantic-kernel（83MB，python/semantic_kernel/全库，源码级深读）
注：此前28-semantic-kernel-deep.md仅读3个文件（web_extract），本篇为clone后完整源码级研究。
行业信号：SK已内置`as_agent_framework_tool()`桥接——Microsoft重心移向新agent-framework（#80），SK成为兼容层。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **Magentic-One编排**：Orchestrator维护**Task Ledger**（facts事实清单+plan计划，各有update提示词做增量更新而非重写）+**Progress Ledger**（当前活动/instruction，每轮让LLM结构化回答"下一步"）+最终答案提示词；HTML escape防注入 | agents/orchestration/magentic.py + prompts/_magentic_prompts.py | 无 | will/DAG骨架 | 完全没有 | "ledger增量更新"设计防计划重写漂移；与LobeChat GoalSupervisor互证 |
| 2 | **Handoffs编排**：OrchestrationHandoffs图（add/add_many声明agent间转移边）+HandoffStart/Request/Response三消息类型+HandoffAgentActor——**OpenAI式handoff的actor实现** | agents/orchestration/handoffs.py | 无 | agent_collaboration.py有点对点context移交 | 部分有 | OpenSoul升级为声明式转移图 |
| 3 | **Concurrent/Sequential编排**：fan-out/fan-in并发+顺序两种标准模式，同一OrchestrationBase协议 | concurrent.py sequential.py | 无 | 无 | 完全没有 | |
| 4 | **Actor运行时**：RoutedAgent+TopicId发布订阅+TypeSubscription路由+CancellationToken协作取消+MessageContext；**双运行时：in_process + dapr（分布式Actor，跨进程/跨机）** | agents/runtime/{core,in_process} | 无 | 无 | 完全没有 | 分布式actor是多agent规模化的Microsoft官方路径 |
| 5 | **Process Framework持久化流程**：step/edge/function_target事件驱动工作流，状态元数据可序列化，**dapr_runtime分布式部署**+local_runtime本地 | processes/ | 无 | will/DAG无运行时 | 完全没有 | 与n8n/Langflow对照：SK是"代码即工作流+dapr持久化"路线 |
| 6 | **Filters双拦截点**：function_invocation filter（调用前改arguments/调用后处理result/**异常处理**）+prompt_render filter（渲染prompt后替换）——Kernel级统一拦截 | filters/ | 无 | 无 | 完全没有 | 与langchain四钩子/CrewAI hooks互证；P0 |
| 7 | **GroupChat策略族**：selection策略（sequential/kernel_function_selection——用Kernel函数选下一个发言者）+termination策略（aggregator**AND/OR聚合多条件**、kernel_function用函数判定终止、default） | agents/strategies/ | 无 | 无 | 完全没有 | "终止=可组合条件函数"是多agent会话的最小正确设计 |
| 8 | **FunctionChoiceBehavior**：auto/none/required/逐次配置，per-call控制函数选择 | function_choice_behavior.py | 无 | 无 | 完全没有 | |
| 9 | **12+模型连接器统一基类**：anthropic/bedrock/google/hugging_face/mistral/nvidia/ollama/onnx/open_ai/azure_ai_inference + **realtime实时语音基类** + audio_to_text/text_to_audio/text_to_image多模态基类 | connectors/ai/ | 无 | gland/router有多provider | 部分有 | OpenSoul缺多模态基类（语音/图像生成） |
| 10 | **API成熟度分级装饰器**：@experimental等feature_stage_decorator标注——公开API按阶段分级管理 | utils/feature_stage_decorator.py | 无 | 无 | 完全没有 | 框架治理细节，OpenSoul对外API可引入 |
| 11 | **data/检索抽象**：vector store + text_search统一接口 | data/ | 无 | hippo自研 | 部分有 | |
| 12 | **三模板引擎**：Kernel/Handlebars/Jinja2 prompt模板同一接口 | prompt_template/ | 无 | gene/templates | 部分有 | |
| 13 | **Agent后端广度**：ChatCompletionAgent/OpenAI Assistant/Azure AI Foundry/Copilot Studio/Bedrock Agent/AutoGen桥/autogen兼容 | agents/ | 无 | 无 | 完全没有 | 异构agent后端抽象与LobeChat heterogeneous互证 |
| 14 | **遥测内建**：KernelFunction调用duration histogram+streaming histogram+OTel tracer/span贯穿chat completion | kernel函数+connectors | 无 | metrics_api.py雏形 | 部分有 | |

## 源码亮点
1. **Task Ledger增量更新**：PLAN_UPDATE_PROMPT/FACTS_UPDATE_PROMPT独立存在——计划和事实清单的修改是"在旧版上apply diff"，不是每轮重新生成（防止长任务计划漂移和token浪费）。
2. **AggregatorTerminationCondition**：多终止条件AND/OR组合枚举——"max轮数 OR LLM说完成 AND 预算未超"这类复合终止一句话表达。
3. **dapr_runtime**：Microsoft把多agent编排直接架在Dapr分布式actor上——同构代码in_process调试、dapr上生产，无重写。
4. 消息全走ChatMessageContent统一类型，编排层不关心agent内部实现。

## 可复用设计
1. **P0：Filters双拦截点**（函数调用±异常+prompt渲染）——OpenSoul cortex最小改造可获得统一拦截层。
2. **P1：termination策略组合化**——OpenSoul多agent会话终止条件从硬编码升级为AND/OR条件列表。
3. **P1：Magentic Ledger模式**（facts/plan增量更新+progress ledger结构化轮询）——比DeerFlow中间件链更"目标显式"的编排，适合will/长任务。
4. **P2：@experimental式API分级**——治理细节。

## grep确认（OpenMate src/ + OpenSoul src/）
全部NONE：magentic / task_ledger / termination_strategy / selection_strategy / function_invocation_filter / prompt_render / dapr / cancellation_token / handoff_request / group_chat / realtime_client / text_to_image
