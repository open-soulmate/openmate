# AgentOps (#86, 6k★) 功能研究

研究时间：2026-09-16 18:40（cron自动）
源码：codeload tarball → ~/agent-research-src/agentops（150MB含docs/tests，tar校验OK，源码级）
定位：agent可观测性SDK——OTel标准span追踪+10个agent框架零代码插桩+5个LLM provider插桩。**正对用户"我都不知道他们在干嘛"痛点的专职产品**。

## 功能清单

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **Session→Span层级模型**（v0.4架构）：Session=根trace（无session无span），Agent/Tool/Workflow/LLM等span类型层级嵌套组织——**"Event概念全面转向Span"**是其架构宣言 | sdk/README.md + semconv/span_kinds.py | 无 | trajectory扁平事件表 | 完全没有 | 与langfuse三层模型互证（第二方），OpenSoul trajectory升级的直接图纸 |
| 2 | **CommonInstrumentor声明式插桩**：InstrumentorConfig+WrapConfig(package/class/method/trace_name/attribute_handler)——**一个配置对象零代码包住任意框架方法**为OTel span；dependencies声明版本兼容 | instrumentation/common/instrumentor.py | 无 | 无 | 完全没有 | OpenSoul给cortex/limb/hippo各模块套span=一个WrapConfig列表，几百行 |
| 3 | **10框架现成插桩**：crewai/ag2/google_adk/agno/langgraph/openai_agents/smolagents/haystack/xpander/mem0 + providers(anthropic/openai/google_genai/ibm_watsonx) | instrumentation/{agentic,providers}/ | 无 | 无 | 完全没有 | 若OpenSoul要托管外部agent（LobeChat式），直接复用其插桩 |
| 4 | **TokenUsageExtractor多格式归一**：从response/usage object/**crewai字符串格式**/attributes四种来源提取token——**格式差异被隔离在一个extractor里** | common/token_counting.py | 无 | gland/token_meter | 部分有 | OpenSoul多provider token统计可抄此归一层 |
| 5 | **token_efficiency + cache_efficiency指标**：token利用效率/缓存命中效率两个派生指标函数——不止记账，还算效率 | token_counting.py:135-156 | 无 | 无 | 完全没有 | "进化了没有"的量化维度：缓存效率提升=实打实的成本进化 |
| 6 | **OTel语义约定(semconv)agent领域扩展**：agent.py/tool.py/workflow.py/message.py/span_attributes.py/span_kinds.py/status.py/meters.py——**为agent领域定义标准span属性词表** | semconv/ | 无 | 无 | 完全没有 | OpenSoul自建trajectory应直接采用其属性命名，未来可接任何OTel后端 |
| 7 | **流式span管理**：streaming.py处理LLM流式响应的span生命周期（首个chunk/完成/中断）+span_management.py | common/ | 无 | 无 | 完全没有 | 流式场景span容易烂尾，有现成方案 |
| 8 | **装饰器自定义span**：sdk/decorators——用户代码@decorator标注AgentSpan/ToolSpan | sdk/decorators/ | 无 | 无 | 完全没有 | |
| 9 | **integration/callbacks**：向第三方回调式框架提供事件入口 | integration/ | 无 | 无 | 完全没有 | |

## 源码亮点
1. **"Event→Span"迁移论**：v0.4把所有event tracking改叫spans——事件是扁平的，span有父子/耗时/状态，观测从"日志流"升级为"调用树"。OpenSoul trajectory目前正是"扁平事件"阶段。
2. **attribute handler纯函数**：`(args, kwargs, return_value) -> AttributeMap`——插桩的业务逻辑全是纯函数，可单测。
3. semconv的存在说明agent观测正在标准化——**OpenSoul自定义事件字段若不向OTel semconv靠拢，未来接Langfuse/Grafana要重写一遍**。

## 可复用设计
1. **P0：trajectory升级为Span模型**（Session根+Agent/Tool/LLM子span+状态），属性命名抄semconv——与langfuse报告的P0互证，第二次独立确认。
2. **P1：CommonInstrumentor式WrapConfig声明插桩**——OpenSoul模块可观测化的一次性基建。
3. **P1：token/cache效率指标**——回应"没有进化"：每月缓存效率曲线就是进化证据。
4. **P2：TokenUsageExtractor归一层**——多provider记账统一。

## grep确认
NONE：span_factory / token_efficiency / cache_efficiency / instrumentor / semconv / session_span
部分：opentelemetry=OpenMate metrics-client.tsx仅UI文案提及（无SDK埋点）；token_meter=gland有计量（无效率指标/span归因）

## 跨项目互证更新
- **Span层级观测模型**：langfuse(Trace→Observation→Score) + agentops(Session→Span) 两方独立确认 → OpenSoul trajectory升级P0不变
- **"不知道在干嘛"解法栈**至此五方：langfuse观测模型、agentops插桩基建、daytona录制回放、devika三联屏UI、claude-code noop自报——OpenSoul缺的是把这五件拼起来
