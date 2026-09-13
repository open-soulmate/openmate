# AI Agent 开源项目架构分析 - 第4批

> 调研时间：2026-09-13
> 共13个项目，每个项目10个维度分析

---

## 1. openai-agents-python (openai/openai-agents-python) ⭐28.9k

OpenAI 官方 Agent SDK，轻量级多 Agent 工作流框架。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 轻量、Provider-agnostic。核心抽象为 Agent（LLM + instructions + tools + guardrails + handoffs），强调"Agent as Tool"和 Handoff 两种协作模式。支持 OpenAI Responses/Chat Completions API 及 100+ LLM |
| **Agent Loop** | `Runner.run_sync()` / `Runner.run()` 驱动循环。Agent 收到消息→调用 LLM→解析 tool_calls→执行工具→结果回传→继续循环，直到产生 final_output 或触发 handoff |
| **工具系统** | Function Tool（Python 函数装饰）、MCP Tool（标准 MCP 协议接入）、Hosted Tool（OpenAI 托管工具如 Code Interpreter/File Search）。工具通过 Pydantic schema 自动提取参数定义 |
| **流式输出** | 原生支持。Realtime Agent 基于 WebSocket 流式传输音频/文本事件；Voice Pipeline 支持 STT→Agent→TTS 流式管道；文本 Agent 支持 streaming 事件 |
| **错误处理** | Guardrails 机制：Input Guardrails（输入校验）和 Output Guardrails（输出校验），可配置安全检查。工具执行异常被捕获并回传给 LLM 处理 |
| **上下文管理** | Sessions 系统自动管理对话历史，支持跨 Agent run 的上下文持久化。可选 Redis 后端存储 session |
| **记忆系统** | 内置 Sessions API 提供短期对话记忆。长期记忆需自行实现或通过工具接入外部存储 |
| **任务规划** | 通过 Agent Handoff（转移控制权）和 Agent-as-Tool（Agent 作为子工具调用）实现多步任务分解。无内置规划器 |
| **可观测性** | 内置 Tracing 系统，追踪 Agent 运行全流程（LLM 调用、工具执行、handoff），支持 OpenTelemetry 导出 |
| **扩展机制** | Custom Agent（自定义 Agent 类型）、Sandbox Agent（容器沙箱执行）、Realtime Agent（实时语音 Agent）。支持自定义 LLM Provider（通过 LiteLLM/any-llm） |

---

## 2. anthropic-cookbook (anthropics/anthropic-cookbook) ⭐52.6k

Anthropic 官方 Claude 使用指南和代码示例集合，非框架而是示例库。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 教程/食谱驱动，展示 Claude API 最佳实践。包含 tool_use、agentic_search、managed_agents、patterns/agents 等模块化示例。非框架而是参考实现集合 |
| **Agent Loop** | 无统一封装。各示例自行实现 agent loop：消息发送→tool_use 解析→工具执行→结果回传→循环。提供 patterns/agents 目录下的参考模式 |
| **工具系统** | 展示 Claude 原生 tool_use 协议。示例包括 customer_service_agent、calculator_tool、computer_use 等。工具以 JSON schema 定义输入输出 |
| **流式输出** | 展示 Claude Messages API 的 streaming 模式（event stream）。无封装层，直接消费 API 流 |
| **错误处理** | 示例级别处理：重试逻辑、rate limit 处理、tool_use 错误回退。无统一框架级错误处理 |
| **上下文管理** | 展示 prompt caching 技术优化上下文窗口使用。无自动上下文管理 |
| **记忆系统** | 未实现（示例级别无持久化记忆） |
| **任务规划** | 展示 sub-agents 模式（Haiku 作为 Opus 的子 Agent）。无内置规划器 |
| **可观测性** | 有 observability 目录，集成 Langfuse 等第三方可观测工具的示例 |
| **扩展机制** | 第三方集成示例（Pinecone、VoyageAI、Wikipedia 等）。提供 managed_agents 目录展示多 Agent 编排模式 |

---

## 3. mastra (mastra-ai/mastra) ⭐28.0k

TypeScript 现代 AI Agent 框架，支持 Agent、Workflow、Voice、MCP 等全栈能力。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 全栈 TypeScript AI 框架。核心概念：Agent（LLM + tools + memory）、Workflow（DAG 编排）、Voice（TTS/STT）、Integrations。Monorepo 架构，packages/core 为核心，支持 Next.js/React 等前端框架 |
| **Agent Loop** | Agent 核心循环：接收输入→LLM 推理→tool_calls 解析→执行→结果注入→继续。支持 streaming 和 sync 两种模式。Workflow 引擎支持 step-by-step 条件分支 |
| **工具系统** | 工具定义基于 TypeScript schema（Zod）。支持 MCP 工具接入、内置工具库、自定义函数工具。工具与 Agent 解耦，可跨 Agent 复用 |
| **流式输出** | 原生 streaming 支持。Agent.generateStream() 返回异步迭代器。Voice 模块支持实时音频流。前端通过 @mastra/react 等 hooks 消费流 |
| **错误处理** | Workflow 层面支持 step 重试、条件分支错误路由。Agent 层面工具执行异常被捕获并回传 LLM |
| **上下文管理** | Agent 内置上下文管理，支持 system prompt + message history。Workflow 支持 step 间数据传递 |
| **记忆系统** | 内置 Memory 模块，支持多种存储后端（stores 目录）。支持对话历史持久化和检索增强 |
| **任务规划** | Workflow DAG 编排：step 定义、条件分支、并行执行、循环。Agent 可调用 Workflow 作为高级任务规划 |
| **可观测性** | 内置 observability 包，支持 OpenTelemetry。提供 mastra.ai 云平台仪表盘 |
| **扩展机制** | Integrations（第三方服务集成）、Deployers（部署适配器：Vercel/Cloudflare/Docker 等）、Voice（TTS/STT 提供者）、channels（消息渠道适配） |

---

## 4. ai-sdk (vercel/ai) ⭐26.6k

Vercel 出品的 TypeScript AI SDK，统一 Provider 接口，深度集成前端框架。

| 维度 | 分析 |
|------|------|
| **架构哲学** | Provider-agnostic TypeScript 工具包。统一 API 对接 OpenAI/Anthropic/Google 等所有主流 Provider。深度集成 Next.js/React/Svelte/Vue。核心抽象：generateText、streamText、generateObject、ToolLoopAgent |
| **Agent Loop** | `ToolLoopAgent` 类驱动循环：generateText→解析 tool_calls→执行→注入结果→循环直到无 tool_calls。支持 maxSteps 限制循环次数 |
| **工具系统** | 工具通过 Zod schema 定义输入输出。内置工具（openai.tools.imageGeneration 等）。支持 MCP 工具接入。工具执行通过 execute 函数 |
| **流式输出** | 核心能力。streamText() 返回 AIStream，前端通过 useChat/useCompletion hooks 消费。支持 token-by-token 流式、工具调用中间状态流式。createAgentUIStreamResponse 用于 Agent UI 流式 |
| **错误处理** | 工具执行异常被捕获并回传 Agent 处理。支持 maxSteps 限制防止无限循环。Provider 错误统一包装 |
| **上下文管理** | 无自动管理，由应用层维护 message 数组。useChat hook 自动管理前端消息状态 |
| **记忆系统** | 未实现（需外部实现）。通过 tools 目录可接入外部存储 |
| **任务规划** | Agent 通过工具调用实现隐式规划。无内置 Workflow/DAG 引擎 |
| **可观测性** | 未内置。可集成第三方（Langfuse 等） |
| **扩展机制** | Provider SDK 生态（@ai-sdk/openai、@ai-sdk/anthropic 等）。AI SDK UI hooks（useChat、useCompletion、useObject）。支持自定义 Provider 实现 |

---

## 5. atomic-agents (eigenwise/atomic-agents) ⭐~2.5k

受 Atomic Design 启发的极轻量模块化 Agent 框架，基于 Instructor + Pydantic。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 原子化设计：每个组件尽可能小且单一职责。基于 Instructor 库实现结构化输出，Pydantic 做数据校验。强调可组合性、可维护性、开发者体验 |
| **Agent Loop** | `AtomicAgent` 类驱动循环：输入→LLM 推理（结构化输出）→工具调用→结果注入→循环。循环由 Pydantic schema 约束输出格式 |
| **工具系统** | 工具继承 `BaseTool`，通过 Pydantic 定义输入/输出 schema。工具独立于 Agent，可跨项目复用。支持任意 Instructor 兼容的 LLM Provider |
| **流式输出** | 未实现（依赖 Instructor 的 streaming 能力） |
| **错误处理** | Pydantic 校验天然提供输入/输出验证。工具异常需自行处理 |
| **上下文管理** | 通过 `SystemPromptGenerator` 管理系统提示。对话历史由开发者手动维护 |
| **记忆系统** | 未实现（需自行集成） |
| **任务规划** | 未实现（无内置规划器或 Workflow 引擎） |
| **可观测性** | 未实现（需自行集成） |
| **扩展机制** | 通过继承 BaseTool/BaseAgent 扩展。支持 Instructor 兼容的所有 LLM Provider（OpenAI/Ollama/Groq/Mistral/Anthropic/Gemini 等） |

---

## 6. agentstack (AgentOps-AI/AgentStack) ⭐2.19k

Agent 项目脚手架工具，类似 create-react-app，快速搭建 Agent 项目。

| 维度 | 分析 |
|------|------|
| **架构哲学** | "Agent 的 create-react-app"。CLI 脚手架工具，不是框架而是代码生成器。支持多框架（CrewAI/LangGraph/OpenAI Swarms/LlamaStack），提供统一 CLI 接口管理 Agent/Task/Tool |
| **Agent Loop** | 不实现自己的 Agent Loop，委托给底层框架（CrewAI/LangGraph 等）。生成的项目代码使用所选框架的 Agent 循环 |
| **工具系统** | 维护最大的框架无关工具仓库。`agentstack tools add` CLI 命令一键添加工具。工具适配层兼容不同框架 |
| **流式输出** | 未实现（取决于底层框架） |
| **错误处理** | 未实现（取决于底层框架） |
| **上下文管理** | 未实现（取决于底层框架） |
| **记忆系统** | 未实现（取决于底层框架） |
| **任务规划** | 通过 `agentstack generate agent/task` 生成 Agent 和 Task 配置。agents.yaml 和 tasks.yaml 声明式配置 |
| **可观测性** | AgentOps 深度集成（默认内置）。提供 Agent 运行追踪和分析 |
| **扩展机制** | 框架适配器（支持 CrewAI/LangGraph/Swarms/LlamaStack）、工具插件系统（社区工具仓库）、CLI 代码生成（`agentstack generate`） |

---

## 7. rivet (ironclad/rivet) ⭐4.68k

可视化 AI 编程环境和 TypeScript 库，用于创建复杂 AI Agent 和 Prompt Chain。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 可视化节点图编程。桌面 IDE + TypeScript 运行时库。节点图代表 AI 工作流，每个节点是一个处理单元（LLM 调用、逻辑判断、数据处理等）。强调可视化调试和嵌入式使用 |
| **Agent Loop** | 图执行引擎驱动。从起始节点开始，按节点图拓扑顺序执行。每个节点处理输入→产生输出→传递给下游节点。支持条件分支、循环节点 |
| **工具系统** | 节点即工具。内置节点类型：LLM 调用、向量数据库、条件判断、代码执行等。支持自定义节点扩展 |
| **流式输出** | 支持 LLM 节点流式输出。节点间数据传递支持流式 |
| **错误处理** | 图执行层面的错误处理：节点失败可配置重试、错误路由到特定下游节点 |
| **上下文管理** | 通过节点图中的数据流管理上下文。支持变量节点存储和传递上下文 |
| **记忆系统** | 支持向量数据库集成（Pinecone）用于检索增强记忆。无内置持久化对话记忆 |
| **任务规划** | 可视化图即任务规划。通过拖拽节点和连线定义工作流。支持子图嵌套实现分层规划 |
| **可观测性** | 桌面 IDE 内置调试器：节点级断点、输入/输出查看、执行追踪 |
| **扩展机制** | 自定义节点插件、TypeScript API 嵌入（@ironclad/rivet-core）、支持 OpenAI/Anthropic/AssemblyAI 等集成 |

---

## 8. flowise (FlowiseAI/Flowise) ⭐55.4k

可视化拖拽式 AI Agent 构建平台，基于 LangChain。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 低代码可视化 Agent 构建。React 前端 + Node.js 后端 + 组件库三层架构。拖拽式画布编排 AI 工作流，底层基于 LangChain.js |
| **Agent Loop** | 基于 LangChain AgentExecutor。画布中定义的节点链自动编译为 LangChain chain/agent。支持 AgentExecutor、OpenAIFunctionsAgent 等多种 Agent 类型 |
| **工具系统** | 组件化工具系统。每个工具是一个可拖拽节点（Calculator、WebBrowser、Wikipedia 等）。支持自定义工具节点、LangChain 工具兼容 |
| **流式输出** | 支持。LLM 节点支持 token 流式输出，前端实时显示。API 端点支持 streaming 响应 |
| **错误处理** | 节点级错误捕获。Agent 执行失败时返回错误信息。支持重试机制 |
| **上下文管理** | 通过 Memory 节点管理对话上下文。支持 Buffer Memory、Vector Store Memory 等 LangChain 内存类型 |
| **记忆系统** | 支持多种 Memory 节点：ConversationBufferMemory、Zep Memory、Motorhead Memory 等。可持久化到数据库 |
| **任务规划** | 画布可视化编排即任务规划。支持条件路由、并行执行、子流程嵌套 |
| **可观测性** | 内置 Chat Logs、执行追踪。支持 LangSmith/LangFuse 集成 |
| **扩展机制** | 自定义组件节点（React 组件）、工具市场、API 文档自动生成、Docker 部署 |

---

## 9. n8n (n8n-io/n8n) ⭐204k

Fair-code 工作流自动化平台，原生 AI 能力，400+ 集成。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 通用工作流自动化平台 + AI 原生能力。TypeScript monorepo，节点式可视化编排。1500+ 集成连接器。"Code when you need it"——可视化 + JavaScript/Python 代码混合 |
| **Agent Loop** | AI Agent 节点基于 LangChain.js AgentExecutor。在工作流画布中作为特殊节点存在，可与普通自动化节点无缝衔接。支持 ReAct Agent、Tools Agent |
| **工具系统** | 海量节点即工具：HTTP Request、Database、CRM、Email 等 1500+ 集成。AI Tool 节点可将任意 n8n 工作流暴露为 Agent 工具。支持 MCP 工具 |
| **流式输出** | 支持 Webhook 响应流式、SSE 流式。AI Agent 节点支持 token 流式 |
| **错误处理** | 工作流级错误处理：Error Trigger 节点、重试配置、错误工作流路由。AI 节点异常可触发补偿流程 |
| **上下文管理** | AI Agent 节点内置 Window Buffer Memory。支持 Redis/PostgreSQL 持久化会话。工作流变量管理全局上下文 |
| **记忆系统** | Memory 节点：Window Buffer、Zep、Motorhead、PostgreSQL Chat Memory。可与工作流数据联动 |
| **任务规划** | 可视化工作流即任务规划。支持条件分支、循环、并行、子工作流、人工审批节点。AI Agent 可调用子工作流实现复杂任务链 |
| **可观测性** | 内置 Execution History（执行历史）、节点级日志。支持 Sentry、OpenTelemetry 集成。企业版审计追踪 |
| **扩展机制** | 自定义节点开发（TypeScript）、社区节点市场、npm 包发布。支持 Webhook 触发、定时触发、消息队列触发等 |

---

## 10. langflow (langflow-ai/langflow) ⭐154.6k

AI Agent 和工作流构建部署平台，可视化 + 源码双模式。

| 维度 | 分析 |
|------|------|
| **架构哲学** | "Visual authoring + Source code access"双模式。Python 后端 + React 前端。每个组件可查看/编辑 Python 源码。支持 MCP Server 部署——将工作流转为工具供外部 Agent 调用 |
| **Agent Loop** | Agent 组件驱动循环。支持多种 Agent 类型（OpenAI Functions Agent、XML Agent 等）。Agent 组件可嵌入工作流画布中，与其他组件（RAG、Tool、Memory）无缝连接 |
| **工具系统** | 组件化工具：每个工具是 Python 类，定义输入/输出。内置工具库 + 自定义工具。支持 MCP 工具协议。工具可通过 API 或 MCP Server 暴露 |
| **流式输出** | 支持。LLM 组件流式输出。Playground 实时交互测试。API 端点支持 streaming |
| **错误处理** | 组件级错误捕获。Playground 提供 step-by-step 调试控制。节点级日志追踪 |
| **上下文管理** | Memory 组件管理对话上下文。支持多种 Memory Type。工作流内通过边连接传递上下文 |
| **记忆系统** | 支持 ConversationBufferMemory、Zep、Cassandra 等多种记忆后端。可自定义 Memory 组件 |
| **任务规划** | 可视化画布编排。支持条件路由、并行分支、子流程。MCP Server 部署使工作流成为可组合工具 |
| **可观测性** | 内置 Playground 调试、LangSmith/LangFuse/Arize Phoenix 集成。完整调用链路追踪 |
| **扩展机制** | 自定义 Python 组件、MCP Server 部署、API 导出、JSON 导出。支持所有主流 LLM 和向量数据库 |

---

## 11. dify (langgenius/dify) ⭐96.5k

开源 LLM 应用开发平台，AI Workflow + RAG + Agent + 模型管理。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 一站式 LLM 应用开发平台。Python 后端（Flask）+ React 前端。四大应用类型：Chatbot、Text Generator、Agent、Workflow。可视化编排 + API 服务。支持云/VPC/自托管部署 |
| **Agent Loop** | Agent 模式内置 ReAct/Function Calling 循环。Workflow 模式通过可视化节点编排。Agent 可调用 Workflow 作为工具。支持多 Agent 编排 |
| **工具系统** | 内置工具市场（搜索、图片、代码执行等）。自定义工具通过 OpenAPI Schema 定义。工具可热更新。支持 MCP 协议接入 |
| **流式输出** | 原生支持。Agent/Chatbot 输出流式传输。Workflow 支持节点级流式。API 端点支持 SSE streaming |
| **错误处理** | Workflow 节点级错误处理、重试配置。Agent 工具调用异常捕获。全局错误日志 |
| **上下文管理** | 变量系统管理上下文。Conversation Variable 持久化对话状态。Workflow 内通过变量节点传递 |
| **记忆系统** | 内置对话记忆（Conversation Buffer）。支持外部向量数据库（Weaviate/Qdrant/Milvus 等）作为长期记忆 |
| **任务规划** | Workflow 可视化编排：LLM 节点、条件分支、代码执行、HTTP 请求、知识库检索。支持变量聚合、迭代、参数提取器 |
| **可观测性** | 内置日志系统、调用链追踪。集成 Opik/Langfuse/Arize Phoenix。应用运营日志 |
| **扩展机制** | 插件系统（Plugin）、自定义工具、自定义模型 Provider。API/SDK 集成。支持 Docker/K8s 部署 |

---

## 12. coze (coze-dev/coze-studio) ⭐9.8k

字节跳动开源的 AI Agent 开发平台，可视化低代码 Agent 构建。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 一站式可视化 Agent 开发平台。后端 Golang + 前端 React/TypeScript。微服务架构，领域驱动设计（DDD）。低代码/无代码方式创建 Agent。配合 Coze Loop（Prompt 开发/评测/运维）全生命周期管理 |
| **Agent Loop** | Workflow 引擎驱动，包含 Coze 全部节点类型和编排逻辑。Agent 支持单 Agent 和多 Agent 模式。对话路由在多个专业 Agent 间切换 |
| **工具系统** | Plugin 系统：调用外部 API 的工具。支持自定义 Plugin 注册。内置插件（搜索、图片生成、GitHub 等）。Workflow 本身可作为工具被 Agent 调用 |
| **流式输出** | 支持。Chat SDK 提供流式对话体验。Workflow 执行支持中间状态流式输出 |
| **错误处理** | Workflow 节点级错误处理。Coze Loop 提供 Prompt 评测和调试能力，确保 Agent 稳定性 |
| **上下文管理** | 变量系统 + 数据库组件管理上下文。支持对话变量、用户变量、系统变量 |
| **记忆系统** | 支持数据库持久化。多轮对话记忆通过变量管理。知识库组件提供检索增强 |
| **任务规划** | 可视化 Workflow 编排。支持条件分支、循环、代码块、知识库检索。AI 辅助生成工作流 |
| **可观测性** | Coze Loop 提供全生命周期可观测性：Prompt 开发、调试、评测、监控。调用链路日志 |
| **扩展机制** | Plugin 市场、Knowledge Base、Database、Prompt 模板。Chat SDK 嵌入第三方应用。OpenAPI 集成 |

---

## 13. fastgpt (labring/FastGPT) ⭐25.2k

基于 LLM 的知识库平台，可视化 AI Workflow 编排。

| 维度 | 分析 |
|------|------|
| **架构哲学** | 知识库驱动的 AI Agent 平台。TypeScript（Next.js）全栈。核心能力：数据处理、RAG 检索、可视化工作流编排。强调开箱即用的问答系统构建。支持 Agent Skill 编排、对话/插件工作流、双向 MCP |
| **Agent Loop** | Agent-loop 热更新机制。高级编排模式下通过 Flow 节点图驱动循环：LLM 调用→工具执行→知识库检索→结果聚合→继续 |
| **工具系统** | 插件工作流系统。系统工具热更新、RAG 模块热更新、Agent-loop 热更新。AI 实时生成插件。支持 HTTP 请求节点、代码执行节点 |
| **流式输出** | 支持。对话流式输出。API 端点支持 SSE streaming |
| **错误处理** | 节点级日志追踪。Debug 调试模式逐节点检查。应用评测系统 |
| **上下文管理** | 对话变量管理。知识库混用和多库复用。引用反馈可修改删除 |
| **记忆系统** | 对话历史记录。知识库作为长期记忆（支持 TXT/MD/HTML/PDF/DOCX/PPTX/CSV/XLSX 导入）。混合检索 + 重排 |
| **任务规划** | Flow 可视化工作流编排。支持对话工作流和插件工作流。包含基础 RPA 节点。辅助生成工作流 |
| **可观测性** | 完整调用链路日志。应用节点日志。应用运营日志。应用评测系统 |
| **扩展机制** | 插件工作流系统、双向 MCP、API 知识库、iframe 嵌入、免登录分享。支持 Docker/Sealos 部署 |

---

## 对比总结

| 项目 | 类型 | 语言 | 核心特色 | Agent Loop | 可视化 | 记忆 |
|------|------|------|---------|-----------|--------|------|
| openai-agents-python | SDK | Python | 轻量、Handoff 模式 | ✅ 内置 | ❌ | Sessions |
| anthropic-cookbook | 示例库 | Python | 最佳实践参考 | 示例级 | ❌ | ❌ |
| mastra | 全栈框架 | TypeScript | Agent+Workflow+Voice | ✅ 内置 | ❌ | ✅ 内置 |
| ai-sdk | SDK | TypeScript | 统一 Provider、前端集成 | ✅ ToolLoopAgent | ❌ | ❌ |
| atomic-agents | 轻量框架 | Python | 原子化设计、Instructor | ✅ 内置 | ❌ | ❌ |
| agentstack | 脚手架 | Python | CLI 代码生成、多框架 | 委托框架 | ❌ | ❌ |
| rivet | 可视化 IDE | TypeScript | 节点图编程、桌面 IDE | ✅ 图执行 | ✅ | 向量DB |
| flowise | 低代码平台 | TypeScript | 拖拽构建、LangChain | ✅ LangChain | ✅ | ✅ 多后端 |
| n8n | 自动化平台 | TypeScript | 1500+集成、AI 原生 | ✅ LangChain | ✅ | ✅ 多后端 |
| langflow | 低代码平台 | Python | 源码可编辑、MCP Server | ✅ 多类型 | ✅ | ✅ 多后端 |
| dify | 应用平台 | Python | 一站式、多应用类型 | ✅ ReAct/FC | ✅ | ✅ 向量DB |
| coze | 应用平台 | Golang/TS | 字节出品、全生命周期 | ✅ Workflow | ✅ | DB |
| fastgpt | 知识库平台 | TypeScript | 知识库驱动、热更新 | ✅ Flow | ✅ | ✅ 知识库 |

### 架构分层趋势

1. **SDK 层**（openai-agents、ai-sdk、atomic-agents）：提供 Agent Loop 原语，开发者自行组装
2. **框架层**（mastra）：提供完整 Agent + Workflow + Memory 抽象，需编码使用
3. **低代码层**（flowise、langflow、rivet）：可视化编排 + 代码扩展双模式
4. **平台层**（dify、coze、fastgpt、n8n）：一站式部署，含用户管理、知识库、评测、运营
5. **脚手架层**（agentstack）：代码生成器，桥接多框架
6. **示例库**（anthropic-cookbook）：参考实现，非框架
