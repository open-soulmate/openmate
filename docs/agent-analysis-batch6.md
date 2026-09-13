# AI Agent 开源项目架构分析 - 第6批

> 调研时间：2026-09-13
> 共13个项目，每个项目10个维度分析

---

## 1. openai/openai-realtime-agents ⭐3k+

OpenAI Realtime API 高级语音 Agent 演示项目，展示 Chat-Supervisor 和 Sequential Handoffs 两种实时语音 Agent 模式。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 实时语音优先。基于 OpenAI Realtime API（WebSocket）+ Agents SDK 构建。两种核心模式：Chat-Supervisor（轻量实时聊天 Agent + 强大文本 Supervisor）和 Sequential Handoffs（受 Swarm 启发的专家 Agent 顺序交接）。强调低延迟语音交互体验 |
| **Agent Loop** | WebSocket 事件驱动。Realtime Agent 通过 WebSocket 接收音频/文本事件→模型推理→tool_calls 解析→执行→结果回传→继续。Supervisor 模式下，chat agent 处理简单任务，复杂任务升级到 supervisor 模型 |
| **工具系统** | 工具定义嵌入 Agent instructions 中（推荐 YAML 格式而非 JSON 避免模型混淆）。通过 Allow List 控制 chat agent 可自行处理的任务范围，其余升级到 supervisor 执行 |
| **流式输出** | 原生实时流式。基于 WebSocket 的音频/文本双向流式传输。语音输入实时转录，模型响应实时音频输出，延迟极低（优于 1.5s+ 的 stitched 模型方案） |
| **错误处理** | 决策边界控制：通过 Allow List 明确 chat agent 可处理的任务，超出范围自动升级到 supervisor。支持 chain-of-thought 提升 supervisor 准确性 |
| **上下文管理** | Session 管理通过 Realtime API 的 session.update 事件动态更新。Handoff 时触发 session.update 切换 instructions 和 tools |
| **记忆系统** | 无独立记忆系统。依赖 Realtime API 的会话上下文窗口 |
| **任务规划** | 隐式规划：chat agent 收集信息后升级到 supervisor 处理复杂任务。Sequential Handoffs 通过 agent graph 定义明确的交接路径 |
| **可观测性** | 基础日志。无内置 tracing 系统，需自行集成 |
| **扩展机制** | 自定义 Agent Config（定义 instructions、tools、handoffs）。支持多种模型组合（realtime-mini + gpt-4.1、o4-mini 等）。可扩展 tool 定义和 decision boundary |

---

## 2. firebase/genkit (Google) ⭐2k+

Google Firebase 出品的开源 AI 应用框架，支持 JavaScript/Go/Python 多语言，提供统一 API 对接多家模型提供商。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 全栈 AI 应用框架，Firebase 生态集成。统一接口对接 Google/OpenAI/Anthropic/Ollama 等模型。核心概念：generate（生成）、flows（工作流）、tools（工具调用）、RAG（检索增强）。强调快速构建和部署生产级 AI 应用 |
| **Agent Loop** | Flow 编排模式。`ai.generate()` 驱动 LLM 调用，支持 tool calling 循环。Flow 定义多步 AI 工作流，每步可调用不同模型/工具。支持 structured output 和 multimodal |
| **工具系统** | 统一 API 抽象。通过 plugin 系统接入不同模型提供商（googleAI、openai、anthropic、ollama 等）。支持 tool calling、structured output、context-aware generation |
| **流式输出** | 支持流式生成。通过 streaming API 实时返回模型输出。前端可集成实时 UI 更新 |
| **错误处理** | Flow 级别错误处理。支持重试、超时配置。Plugin 系统隔离不同提供商的错误 |
| **上下文管理** | 支持 context-aware generation（RAG）。通过 indexer 和 retriever 管理上下文数据 |
| **记忆系统** | 通过 RAG 和向量存储实现知识检索。支持多种向量数据库集成 |
| **任务规划** | Flow 编排：定义多步骤 AI 工作流，支持条件分支和并行执行。无高级 Agent 规划器 |
| **可观测性** | 内置 CLI Developer UI：运行、调试、评估 flows。支持 trace 逐步分析。集成 OpenTelemetry |
| **扩展机制** | Plugin 架构：模型提供商 plugin、向量数据库 plugin、第三方集成 plugin。支持 Firebase/Cloud Run 部署 |

---

## 3. microsoft/semantic-kernel ⭐28.5k

微软企业级 AI Agent SDK（现已演进为 Microsoft Agent Framework），支持 Python/.NET/Java 多语言，面向企业级多 Agent 编排。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 企业级 Agent 编排框架。已演进为 Microsoft Agent Framework (MAF) 1.0。核心抽象：Kernel（运行时容器）、Agent（LLM + plugins + memory + planning）、Plugin（工具/技能）。强调企业级可靠性、多提供商支持、跨运行时互操作（A2A/MCP） |
| **Agent Loop** | `ChatCompletionAgent.get_response()` 驱动循环。Agent 收到消息→LLM 推理→FunctionChoiceBehavior 自动解析 tool_calls→执行 plugins→结果回传→循环。支持单 Agent 和多 Agent 模式 |
| **工具系统** | Plugin 系统：Native Code Functions（原生代码函数）、Prompt Templates（提示模板）、OpenAPI Specs（API 规范）、MCP Tools（标准 MCP 协议）。通过 KernelPluginFactory 注册，Pydantic schema 自动提取参数 |
| **流式输出** | 支持 streaming 模式。Chat Completions API 支持 token-by-token 流式返回 |
| **错误处理** | 内置 Guardrails 机制。Plugin 执行异常被捕获并回传 LLM。支持 structured output 约束输出格式 |
| **上下文管理** | ChatHistoryAgentThread 管理对话历史。支持跨 Agent 的上下文传递（Agent 作为 Plugin 时自动共享上下文） |
| **记忆系统** | 内置 Memory 模块，支持多种向量数据库（Azure AI Search、Elasticsearch、Chroma 等）。支持语义记忆和对话历史持久化 |
| **任务规划** | Process Framework：结构化工作流建模。Multi-Agent 编排：Triage Agent 路由到 Specialist Agents。支持 Agent-as-Plugin 模式 |
| **可观测性** | 内置 tracing 和日志。集成 Azure Monitor / Application Insights。支持 OpenTelemetry |
| **扩展机制** | Plugin 生态（自定义函数、OpenAPI、MCP）、多语言 SDK（Python/.NET/Java）、多模型提供商（OpenAI/Azure/HuggingFace/NVidia/Ollama）、向量数据库集成、A2A 协议支持 |

---

## 4. google/adk-python (Agent Development Kit) ⭐21.5k

Google 官方 Agent Development Kit，code-first Python 工具包，支持 Gemini 优化但模型无关，提供 Agent + Workflow 双层抽象。

| 维度 | 分析 |
|------|------|
| **架构哲学** | Code-first、模块化、软件工程原则驱动。双层抽象：Agent（AI 逻辑定义）+ Workflow（图执行引擎）。强调灵活性、可测试性、版本控制。兼容 Gemini 但模型无关，支持 A2A/MCP 互操作 |
| **Agent Loop** | Agent 收到输入→LLM 推理→tool_calls→执行→结果回传→循环。Workflow 引擎提供图执行：routing、fan-out/fan-in、loops、retry、state management、dynamic nodes |
| **工具系统** | 丰富工具生态：预构建工具、自定义函数工具、OpenAPI specs、MCP tools、Google 生态集成。Tool Confirmation（HITL）机制：guard tool execution with explicit confirmation |
| **流式输出** | 支持流式事件模型。Event-driven 架构支持实时流式输出 |
| **错误处理** | Workflow 层面支持 retry、timeout、error routing。Task API 支持 structured delegation 和 error recovery |
| **上下文管理** | State management 内置于 Workflow 引擎。支持 Human-in-the-loop（HITL）暂停/恢复 |
| **记忆系统** | 通过工具和外部存储实现。无内置独立记忆模块，依赖 Agent instruction 和 context |
| **任务规划** | Task API：结构化 Agent-to-Agent 委托，支持多轮 task mode、单轮 controlled output、混合委托模式。Workflow：图编排（edges、routing、loops） |
| **可观测性** | 内置 evaluation 框架。支持 tracing 和调试。Vertex AI Agent Engine 提供生产级监控 |
| **扩展机制** | 多语言 SDK（Python/Java/Kotlin/Go/TypeScript）。社区工具生态（adk-python-community）。部署到 Cloud Run / Vertex AI Agent Engine |

---

## 5. google/a2a-protocol ⭐5k+

Google 贡献的 Agent-to-Agent 开放协议（Linux Foundation），定义 Agent 间通信和互操作标准，非框架而是协议规范。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 开放协议标准，非框架。基于 JSON-RPC 2.0 over HTTP(S)。核心概念：Agent Card（能力发现）、Task（任务生命周期）、Message/Artifact（数据交换）。强调 Agent 间不透明协作——不暴露内部状态、记忆或工具 |
| **Agent Loop** | 协议级定义：Client 发起 Task→Server Agent 处理→返回 Message/Artifact。支持同步请求/响应、流式（SSE）、异步推送通知三种模式 |
| **工具系统** | 非工具框架。A2A 定义 Agent 间通信协议，工具由各 Agent 内部实现。Agent Card 声明 Agent 能力（skills），Client 通过 Agent Card 发现和选择 Agent |
| **流式输出** | 支持 SSE 流式传输。Task 可通过 streaming 返回中间结果和最终 artifact |
| **错误处理** | 协议级错误码定义。Task 有完整生命周期状态（submitted/working/input-required/completed/failed/canceled） |
| **上下文管理** | 通过 Task 上下文传递。Message 包含 text/file/structured data。不共享内部上下文 |
| **记忆系统** | 不涉及。A2A 协议不定义记忆系统，各 Agent 自行管理 |
| **任务规划** | 通过 Agent Card 发现能力，Client 编排多 Agent 协作。支持 long-running tasks 和 human-in-the-loop |
| **可观测性** | 协议级设计考虑 observability。支持 enterprise security、authentication、observability 集成 |
| **扩展机制** | 多语言 SDK（Python/Go/JS/Java/.NET/Rust）。兼容任意 Agent 框架（ADK/LangGraph/BeeAI 等）。与 MCP 互补（MCP 管工具，A2A 管 Agent 间通信） |

---

## 6. modelcontextprotocol/python-sdk ⭐10k+

MCP 协议的官方 Python SDK（v2），实现 Model Context Protocol 标准，支持构建 MCP Server 和 Client。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 协议 SDK，非 Agent 框架。实现 MCP 规范（2026-07-28），为 LLM 应用提供标准化的工具/资源/提示词暴露方式。核心概念：Server（暴露 tools/resources/prompts）、Client（连接消费）。类似"面向 LLM 的 Web API" |
| **Agent Loop** | 不实现 Agent Loop。MCP 是工具层协议，由上层 Agent 框架驱动循环。Server 端被动响应 Client 的 tool calls |
| **工具系统** | 核心能力。`@mcp.tool()` 装饰器注册工具，Python 类型注解自动提取 JSON Schema。`@mcp.resource()` 注册模板化资源。`@mcp.prompt()` 注册提示词模板。无需手写 schema 或验证代码 |
| **流式输出** | 支持 Streamable HTTP 传输，可流式返回工具结果 |
| **错误处理** | 协议级错误处理。Server 端工具执行异常通过 MCP 协议返回给 Client |
| **上下文管理** | 不涉及。MCP 不管理对话上下文，由上层框架负责 |
| **记忆系统** | 不涉及。MCP 是无状态协议（resources 可提供持久数据） |
| **任务规划** | 不涉及。MCP 是工具暴露协议，不包含任务规划 |
| **可观测性** | 支持 MCP Inspector 调试工具。`mcp dev` 命令启动调试 UI |
| **扩展机制** | 传输层扩展（stdio/Streamable HTTP/SSE）。Server 可被任何 MCP Host 消费。Client 可连接任意 MCP Server。与 A2A 互补 |

---

## 7. julep-ai/julep ⭐2k+

Durable、composable AI Agent 框架，以数据流（dataflow）而非循环构建 Agent，支持崩溃恢复、安全重试、步骤溯源。

| 维度 | 分析 |
|------|------|
| **架构哲学** | Durable dataflow 而非 ad-hoc loop。Agent 即可组合的持久化数据流：`@flow` 装饰器将 Python 函数编译为有向无环图（DAG）。核心理念：flows 可崩溃恢复、安全重试、每步可溯源。基于 Temporal 实现持久执行 |
| **Agent Loop** | `@flow` 定义时构建图结构，运行时执行。`think()` 调用 Reasoner（LLM），`cond()/switch()/each()` 控制流，`pure()` 纯函数步骤。`|` 合并记录。支持 `dry_run()` 本地执行 |
| **工具系统** | `@tool(effect="read", idempotent=True)` 注册工具。工具与 Reasoner 解耦。支持 MCP 工具接入（`mcp_tool(server, tool)`）。MCP snapshot 冻结工具表面，运行时 preflight 检查 |
| **流式输出** | CLI `julep run` 支持 trace tree 实时流式。部署后通过 SSE 流式返回执行状态 |
| **错误处理** | 核心能力。每个步骤支持 `retries`、`timeout_s` 配置。Temporal 持久执行保证崩溃恢复。MCP surface drift 检测（工具移除/变更自动失败） |
| **上下文管理** | Projection 系统：从执行图派生可查询的投影数据。`julep trace` 渲染完整执行树 |
| **记忆系统** | 通过 MCP 工具接入外部记忆。控制面板支持 write-only operator vault（加密存储） |
| **任务规划** | `@flow` 即规划：Python 函数签名定义 DAG 拓扑。`each()` 批量并行，`reschedule()` 延迟执行。支持跨 Agent 图（`julep graph`） |
| **可观测性** | 内置 projection（可查询的执行记录）。集成 Langfuse OTLP/HTTP 导出。OpenTelemetry span export。`julep trace` 渲染执行树 |
| **扩展机制** | Extras 系统（temporal/dbos/http/mcp/server/otel/langfuse/wasm 等可选模块）。CLI 工具链（ls/show/graph/lint/test/deploy/serve）。Application 级部署（多 Pipeline、多 Lane） |

---

## 8. motia-dev/motia ⭐1.9k+

Code-first 事件驱动 AI Agent 框架，支持多语言（TypeScript/Python/Ruby），统一 API 端点、后台任务和 Agent 工作流。

| 维度 | 分析 |
|------|------|
| **架构哲学** | Code-first、事件驱动、多语言统一运行时。核心概念：Steps（事件处理单元）、Flows（步骤编排）、Workbench（本地可视化调试）。强调"用已有语言和实践构建生产级 Agent"，零基础设施负担 |
| **Agent Loop** | 事件驱动。Steps 订阅事件→处理→发射新事件→触发下游 Steps。Agent 逻辑嵌入 Steps 中，通过事件流串联。支持 API endpoints、background jobs、agentic workflows 三种 Step 类型 |
| **工具系统** | 利用 NPM/PyPI 生态。Steps 中可调用任意 Python/TypeScript/Ruby 库。LLM 集成通过标准库（OpenAI SDK 等）。无专用工具抽象层 |
| **流式输出** | Workbench 实时可视化执行流程。生产环境通过 MotiaHub 监控实时状态 |
| **错误处理** | Step 级别错误处理。事件驱动架构天然支持重试和错误隔离 |
| **上下文管理** | 通过事件流传递上下文。Steps 间通过事件数据共享状态 |
| **记忆系统** | 未内置。依赖外部存储（通过 Steps 集成数据库等） |
| **任务规划** | Flow 编排：可视化定义 Steps 间事件流转。支持条件路由和并行执行 |
| **可观测性** | Workbench 本地调试：实时查看 flow 执行、日志、状态。MotiaHub 生产监控：性能追踪、执行跟踪、问题调试 |
| **扩展机制** | 多语言支持（TypeScript/Python/Ruby）。CLI 部署（`motia deploy`）。GitHub 集成。MotiaHub 托管 |

---

## 9. AG2ai/ag2 ⭐10k+

AutoGen 继任者（v1.0 全新架构），开源 AgentOS，协议驱动的 Agent 编排框架。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 协议驱动的 AgentOS。v1.0 从经典 AutoGen 完全重写：`import ag2`（非 `import autogen`）。核心抽象：Agent（模型 + 工具 + prompt）、Network（hub + channels 多 Agent 编排）。强调 Agent 间协作而非对话 |
| **Agent Loop** | `Agent.ask()` 驱动 turn。Agent 收到消息→LLM 推理→tool_calls→执行→结果回传→返回 AgentReply。`reply.ask()` 继续同一对话。全异步设计 |
| **工具系统** | `@tool` 装饰器注册 Python 函数。Agent 自动运行完整 tool-calling loop：模型决定何时调用→AG2 执行→结果回传。支持 async 工具 |
| **流式输出** | 内置 streaming 支持。`ask()` 支持流式返回 |
| **错误处理** | Human-in-the-loop：`context.input()` 暂停执行等待人工输入。支持 evaluation 和 testing 框架 |
| **上下文管理** | Agent Harness：opt-in primitives（persistent knowledge、context assembly、history compaction）。WorkingMemoryPolicy 将记忆注入 system prompt |
| **记忆系统** | Knowledge Store + MemoryStream。支持持久化知识存储、自动 compaction（SummarizeCompact 策略）。事件驱动的压缩：`CompactionCompleted`/`CompactionFailed` 事件 |
| **任务规划** | Network 编排：hub + typed channels 协调多 Agent。支持 structured output 约束输出。Middleware 层支持自定义处理逻辑 |
| **可观测性** | 内置 Telemetry 模块。支持 evaluation 框架和 testing 工具 |
| **扩展机制** | 多模型提供商（OpenAI/Anthropic/Gemini/Ollama）。Middleware/observers 扩展。Network 多 Agent 编排。Classic 框架向后兼容 |

---

## 10. run-llama/llama_index ⭐40k+

文档处理平台 + RAG 框架，从数据索引框架演进为 AI Agent 应用平台，核心聚焦 LlamaParse 文档解析。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 数据框架→Agent 平台演进。当前聚焦文档处理（LlamaParse）。OSS 框架提供 data connectors、indices、retrievers、query engines、agents。核心理念："agents are the new consumers of documents" |
| **Agent Loop** | LlamaAgents（Agent Builder）+ Workflows。Agent 通过 query engine 查询索引→LLM 推理→工具调用→结果返回。Workflow 支持多步编排 |
| **工具系统** | QueryEngine 作为工具。300+ LlamaHub 集成包（LLM/embedding/vector store）。data connectors 接入各种数据源（API/PDF/SQL 等） |
| **流式输出** | 支持 streaming query。query_engine.query() 支持流式返回 |
| **错误处理** | 标准 Python 异常处理。Index persistence 支持断点恢复 |
| **上下文管理** | Index 结构化管理数据上下文。StorageContext 支持持久化。支持 RAG 上下文增强 |
| **记忆系统** | 向量索引即记忆。VectorStoreIndex 支持语义检索。支持持久化到磁盘（`storage_context.persist()`） |
| **任务规划** | Workflow DAG 编排。Agent Builder 定义多步文档处理流程。无高级自主规划 |
| **可观测性** | LlamaParse 云平台提供监控。OSS 框架可观测性有限 |
| **扩展机制** | LlamaHub 生态（300+ 集成）。核心/集成分离架构（`llama-index-core` + 独立集成包）。LlamaParse/LlamaExtract/LlamaCloud 企业级扩展 |

---

## 11. modal-labs/modal ⭐8k+

Serverless 高性能云平台 SDK，非 Agent 框架但广泛用于 Agent 部署和执行环境。

| 维度 | 分析 |
|------|------|
| **架构哲学** | Serverless 计算平台。提供 Modal SDK（Python/JS/Go）部署高性能无服务器应用。核心概念：Functions（计算单元）、Sandboxes（隔离沙箱）、Volumes（持久存储）。非 Agent 框架，而是 Agent 的执行基础设施 |
| **Agent Loop** | 不实现 Agent Loop。Modal 提供计算环境，Agent 逻辑由用户代码定义。支持长时间运行的函数、GPU 加速、自动扩缩容 |
| **工具系统** | Sandboxes API：隔离执行环境，可运行任意代码。Functions：部署为 API 端点。支持 GPU/CPU 切换、自定义容器镜像 |
| **流式输出** | Functions 支持 streaming 响应。Sandboxes 支持实时输出流 |
| **错误处理** | 平台级：自动重试、超时控制、错误日志。Sandbox 隔离保证错误不扩散 |
| **上下文管理** | 不涉及。Modal 是计算层，上下文由应用代码管理 |
| **记忆系统** | Volumes：持久化存储。Dicts：键值存储。数据库集成通过用户代码实现 |
| **任务规划** | 不涉及。任务规划由用户 Agent 框架负责 |
| **可观测性** | Modal Dashboard：函数执行监控、日志、性能指标。Skills 系统提供 AI coding agent 集成 |
| **扩展机制** | 多语言 SDK（Python/JS/Go）。Skills 系统（`modal skills install`）。CLI 工具。支持任意 Python/Node.js/Go 库 |

---

## 12. PrefectHQ/prefect ⭐20k+

Python 工作流编排框架，专注数据管道韧性编排，支持调度、缓存、重试、事件驱动自动化。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 工作流编排框架，"将脚本提升为生产工作流"。核心抽象：@flow（工作流）、@task（任务步骤）。强调韧性（retries、caching）、动态性（reactive to world changes）、简洁性（几行代码即可编排） |
| **Agent Loop** | 无 Agent Loop。Flow/Task 编排模型：Flow 调用 Tasks→Tasks 执行→结果聚合→Flow 完成。支持同步/异步、并行、映射（map） |
| **工具系统** | Tasks 即工具。`@task` 装饰器定义可复用任务。支持 Integrations（第三方服务集成：数据库、云存储、消息队列等） |
| **流式输出** | Tasks 支持 log_prints 实时日志流。Prefect Cloud/Server UI 实时显示执行状态 |
| **错误处理** | 核心能力。Tasks 支持 `retries`、`retry_delay_seconds`。Caching 避免重复计算。事件驱动自动化响应失败 |
| **上下文管理** | Parameters 系统传递上下文。Tasks 间通过返回值传递数据。Prefect Context 提供运行时元数据 |
| **记忆系统** | 无内置记忆。通过 Integrations 接入外部存储。Caching 提供短期结果复用 |
| **任务规划** | Flow 即规划：Python 函数定义工作流拓扑。Deployments：调度执行（cron、interval、event-based）。支持复杂分支逻辑 |
| **可观测性** | 核心能力。Prefect Server UI：实时监控 flow/task 执行、日志、状态追踪。Prefect Cloud：企业级仪表盘。自动化告警 |
| **扩展机制** | Integrations 生态（数据库、云服务、消息队列等）。Prefect Cloud 企业功能。`prefect-client` 轻量客户端。Events & Automations 事件驱动扩展 |

---

## 13. temporalio/temporal ⭐13k+

持久执行平台（Durable Execution Platform），源自 Uber Cadence，为分布式应用提供可靠性保证。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 持久执行平台，非 Agent 框架。核心概念：Workflow（持久化应用逻辑）、Activity（可重试操作）、Worker（执行引擎）。自动处理间歇性故障和重试。源自 Uber Cadence，成熟可靠 |
| **Agent Loop** | 不实现 Agent Loop。Temporal 提供 Workflow 执行引擎：Workflow 定义→Activity 调度→执行→结果持久化→继续。Workflow 可跨越数天/数月执行，自动恢复 |
| **工具系统** | Activities 即工具。Activity 是可重试的操作单元，支持超时、心跳、取消。Worker 执行 Activity，支持多语言（Go/Java/Python/TypeScript/.NET） |
| **流式输出** | 支持 Workflow 查询（Query）和信号（Signal）实时交互。Temporal Web UI 实时显示执行状态 |
| **错误处理** | 核心能力。Activity 自动重试（可配置策略）。Workflow 持久化保证崩溃恢复。超时控制（start-to-close、schedule-to-start、schedule-to-close、heartbeat） |
| **上下文管理** | Workflow 持久化上下文。所有 Workflow 状态自动持久化到数据库，进程重启后自动恢复执行点 |
| **记忆系统** | Workflow 即记忆：完整执行历史持久化。支持 Workflow 搜索属性（Search Attributes）和自定义索引 |
| **任务规划** | Workflow 即规划：代码定义任务编排逻辑。支持子 Workflow、并行执行、信号驱动分支、定时器。支持长时间运行的复杂编排 |
| **可观测性** | 核心能力。Temporal Web UI：Workflow 执行可视化、历史回放、状态追踪。支持自定义可观测性插件 |
| **扩展机制** | 多语言 SDK（Go/Java/Python/TypeScript/.NET）。自定义 Task Queue。Namespace 隔离。支持 Kubernetes 部署。社区生态丰富 |

---

## 总结对比

| 项目 | 类型 | 核心定位 | Agent Loop | 持久化 | 最佳场景 |
|------|------|----------|------------|--------|----------|
| openai-realtime-agents | 演示项目 | 实时语音 Agent | WebSocket 事件驱动 | ❌ | 语音客服/助手 |
| firebase/genkit | AI 框架 | 全栈 AI 应用 | Flow 编排 | ❌ | Firebase 生态 AI 应用 |
| semantic-kernel | Agent SDK | 企业级 Agent 编排 | Agent Loop + Multi-Agent | ✅ Memory | 企业级多 Agent 系统 |
| adk-python | Agent SDK | Gemini 优化 Agent 开发 | Agent + Workflow 图引擎 | ❌ | Google 生态 Agent |
| a2a-protocol | 协议标准 | Agent 间通信协议 | 协议级 Task 生命周期 | ❌ | 跨框架 Agent 互操作 |
| mcp-python-sdk | 协议 SDK | 工具暴露标准协议 | 不涉及 | ❌ | LLM 工具集成标准 |
| julep | Agent 框架 | 持久化数据流 Agent | @flow DAG + Temporal | ✅ Temporal | 需要可靠性的 Agent |
| motia | Agent 框架 | 事件驱动多语言 Agent | 事件/Step 驱动 | ❌ | 多语言团队 Agent |
| ag2 | AgentOS | 协议驱动多 Agent 协作 | Agent.ask() + Network | ✅ Knowledge Store | 多 Agent 协作研究 |
| llama_index | 数据框架 | 文档处理 + RAG | QueryEngine + Workflow | ✅ Index | 文档智能/RAG 应用 |
| modal | 计算平台 | Serverless Agent 执行 | 不涉及 | ✅ Volumes | Agent 部署执行环境 |
| prefect | 编排框架 | 数据管道韧性编排 | Flow/Task 编排 | ✅ 状态持久化 | 数据工程/ETL |
| temporal | 执行平台 | 持久化分布式执行 | Workflow/Activity | ✅ 全持久化 | 需要可靠性的分布式系统 |

> **关键洞察：**
> - **协议层**（A2A、MCP）正在标准化 Agent 间通信和工具暴露，成为生态基础设施
> - **持久执行**（Julep + Temporal、Prefect）是生产级 Agent 的关键需求
> - **多语言支持**成为趋势（Genkit/ADK/Motia/A2A/MCP 均支持多语言 SDK）
> - **Agent 编排**从单 Agent Loop 向 DAG/Workflow/Network 多模式演进
