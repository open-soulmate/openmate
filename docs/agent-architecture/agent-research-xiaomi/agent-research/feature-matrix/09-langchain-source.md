# LangChain v1 (#9, 146k stars, Python) 功能研究 — 源码级

源码：~/agent-research-src/langchain（69MB；monorepo: libs/{core, langchain, langchain_v1, partners, text-splitters, standard-tests, model-profiles}）
重点：langchain_v1（活跃包）的 agents/middleware 体系。langchain-classic已冻结不再加功能。
研究时间：2026-09-16 深夜轮

## 功能清单（15项，源码确认）

| # | 功能 | 源码位置 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|---------|----------|----------|------|---------|
| 1 | **Middleware钩子体系**：AgentMiddleware类定义 before_model / after_model / wrap_model_call / wrap_tool_call（各带async版），加@wrap_tool_call装饰器独立函数形式 | agents/middleware/types.py | ❌ | ⚠️部分（acp-proxy有中间件思想但非公开钩子API） | **完全没有** | **P0架构级**：OpenSoul推理管线应定义这4个标准钩子，所有横切功能（缓存/审计/限流/压缩）都变插件 |
| 2 | Summarization middleware：token近似计数→超限触发LLM摘要→trim_messages保留边界，带防抖 | summarization.py | ❌ | ⚠️部分（opensoul有compaction但未做成可插拔middleware） | 部分有 | P1。挂进钩子体系后成本极低 |
| 3 | Model fallback middleware：降级模型链，**自动剥离非Anthropic模型不兼容的cache_control标记**（外层缓存middleware不会重跑，故fallback层负责清理） | model_fallback.py | ❌ | ❌ | 完全没有 | P1。gemini-cli也有fallback——两个顶级项目印证，P1升P0 |
| 4 | model_retry / tool_retry / model_call_limit / tool_call_limit：重试与调用次数上限middleware | model_retry.py等 | ⚠️部分（acp-proxy超时重试） | ⚠️部分 | 部分有 | P1 |
| 5 | **LLM-based tool_selector**：工具太多时先用小模型筛选本次可用工具子集 | tool_selection.py | ❌ | ❌ | 完全没有 | P1。与codex tool_search同方向（一个搜索一个LLM筛选） |
| 6 | provider_tool_search：**调provider侧工具搜索API**（OpenAI/Anthropic的服务端工具检索） | provider_tool_search.py | ❌ | ❌ | 完全没有 | P2。留意provider API演进 |
| 7 | PII middleware：内置检测器（信用卡/邮箱/IP/MAC/URL）+ RedactionRule策略（脱敏/阻断等），StreamTransformer流式内处理 | pii.py + _redaction.py | ❌ | ⚠️部分（immune管安全无PII检测） | **完全没有** | **P0**：与codex secrets redact合并做——一个防key泄漏一个防PII泄漏 |
| 8 | human_in_the_loop middleware：基于langgraph interrupt()的工具审批暂停/恢复 | human_in_the_loop.py | ⚠️部分 | ❌ | 部分有 | P0（与codex execpolicy、gemini confirmation-bus三方印证） |
| 9 | todo middleware：自动维护结构化TODO列表注入状态 | todo.py | ⚠️部分（Hermes todo工具） | ❌ | 部分有 | P2 |
| 10 | context_editing：上下文窗口编辑（裁剪/重组） | context_editing.py | ❌ | ⚠️部分 | 部分有 | P1 |
| 11 | file_search / shell_tool middleware：开箱即用工具封装 | file_search.py shell_tool.py | ✅ | ✅ | 已有 | - |
| 12 | tool_emulator / tool_error：工具异常标准化处理 | tool_emulator.py tool_error.py | ❌ | ❌ | 完全没有 | P2 |
| 13 | MCP elicitation支持：mcp/elicitation.py，MCP协议的用户征询流 | mcp/elicitation.py | ❌ | ❌ | 完全没有 | P1。与codex elicitation同概念——MCP标准正在把它正式化 |
| 14 | _subagent_transformer：子agent调用的内部转换层 | agents/_subagent_transformer.py | ⚠️部分 | ⚠️部分 | 部分有 | P2 |
| 15 | structured_output：工厂内建结构化输出支持 | agents/structured_output.py | ✅ | ✅ | 已有 | - |

## 源码亮点

1. **"middleware即产品"**：LangChain v1把agent框架收缩为create_agent(model, tools, middleware)一个入口+一组middleware。框架的差异化全在middleware。
2. **cache_control标记的fallback清理**：注释里写明"外层caching middleware不会在fallback时重跑，所以fallback层必须知道provider特有标记"——横切关注点交互的血泪教训，设计钩子时必须考虑执行顺序语义。
3. **model-profiles包**：按模型维护配置档案（能力/限制/参数），独立成包。
4. **standard-tests包**：给所有集成提供共享测试套件——生态治理手段。
5. langchain-classic冻结策略：老包只修bug不加功能，生态迁移靠文档+工具而非强推。

## 可复用设计

1. **四钩子标准**（P0，架构级）：OpenSoul推理管线定义 before_model/after_model/wrap_model_call/wrap_tool_call。这是把OpenSoul从"一坨管线"变成"平台"的关键一步。与用户架构分层记忆一致：acp-proxy执行层挂wrap_tool_call，cortex挂wrap_model_call。
2. **PII检测器集**（P0，3天）：信用卡Luhn校验/邮箱/IP/MAC/URL正则现成可抄，挂immune。
3. **model fallback链**（P0，2天）：provider失败自动降级，注意清理provider特有请求标记（OpenSoul多provider场景必踩）。
4. **tool_selector小模型筛选**（P1，3天）：工具集大时省token。
5. **model-profiles思路**（P1）：OpenSoul/models-manager已有雏形（AutoGPT的LLM目录调研同结论），三方印证应升优先级。

## 三方印证结论（codex × gemini-cli × langchain）
- 工具审批流：execpolicy / confirmation-bus / HITL middleware —— OpenSoul完全没有 → **P0**
- 模型降级链：compact_model_fallback / fallback handler / model_fallback middleware → **P0**
- 工具集按需加载：tool_search / - / tool_selection+provider_tool_search → **P1**
- PII与secrets脱敏：secrets redact / - / pii middleware → **P0**
- elicitation暂停恢复：elicitation / scheduler confirmation / mcp elicitation → **P1**
