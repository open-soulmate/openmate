# Langroid 架构分析

> **项目**：[Langroid/langroid](https://github.com/Langroid/langroid)
> **定位**：基于多 Agent 编程范式的 LLM 应用开发框架
> **来源**：CMU 与 UW-Madison 研究团队
> **版本**：v0.67.0（2026年8月）
> **Star**：6k+

---

## 1. 核心设计哲学：Actor 模型驱动的多 Agent 协作

Langroid 的架构设计灵感来源于 **Actor 模型**（Actor Framework），这是其区别于 LangChain、CrewAI 等框架的根本差异。在 Langroid 中：

- **Agent** 是独立的计算单元，拥有自己的 LLM、向量存储和工具集
- **Task** 是 Agent 的执行容器，负责驱动 Agent 的消息循环
- **消息传递** 是 Agent 间协作的唯一方式——Agent 之间不共享状态，只通过 `ChatDocument` 交换消息

这种设计使得多 Agent 系统天然具备并发能力、解耦特性和可测试性。每个 Agent 都是一个独立的"演员"，通过消息协议协调完成复杂任务。

---

## 2. Agent 三层继承体系

Langroid 的 Agent 采用清晰的三层继承结构：

| 层级 | 类名 | 职责 |
|------|------|------|
| 基础层 | `Agent`（`base.py`） | 消息处理框架、工具注册/分发、LLM/VectorStore 初始化、用户交互循环 |
| 聊天层 | `ChatAgent`（`chat_agent.py`） | 对话管理（`message_history`）、系统消息注入、工具启用/禁用、OpenAI 工具调用适配、输出格式控制 |
| 专用层 | `DocChatAgent`、`SQLChatAgent`、`RelevanceExtractorAgent` 等 | 针对 RAG、SQL 查询、信息抽取等场景的特化实现 |

**`Agent` 基类** 的核心职责：
- 通过 `AgentConfig` 统一管理 LLM 配置（`LLMConfig`）、向量存储配置（`VectorStoreConfig`）、解析配置（`ParsingConfig`）
- 维护工具注册表 `llm_tools_map`（工具名 → ToolMessage 类的映射），以及 `llm_tools_handled`、`llm_tools_usable`、`llm_tools_known` 三个集合，精确控制每个 Agent 能处理和使用的工具
- 实现 `search_for_tools` 机制：从消息内容（CONTENT）、OpenAI 函数调用（FUNCTIONS）、OpenAI 工具调用（TOOLS）三个维度搜索工具调用意图

**`ChatAgent`** 在此基础上增加了：
- `enable_message()` / `disable_message()` 精细控制工具的使用（use）和处理（handle）权限
- `strict_recovery` 机制：当 LLM 生成的工具调用不符合 schema 时，自动用正确的 schema 提示 LLM 重新生成
- `output_format` 支持：利用某些 LLM 的 grammar-based decoding 强制输出符合指定 JSON schema 的结果

---

## 3. ToolMessage：类型安全的工具定义范式

Langroid 的工具系统是其最具特色的设计之一。与传统框架将工具定义为"函数+描述"不同，Langroid 使用 **Pydantic 模型** 定义工具：

```python
class SquareTool(lr.ToolMessage):
    request = "square"       # 工具名，映射到 Agent 的 agent_square() 方法
    purpose = "to compute the square of a number"
    number: int              # 参数字段

    def handle(self) -> str:
        return str(self.number ** 2)
```

关键设计点：
- **`ToolMessage` 继承自 Pydantic BaseModel**，天然获得类型验证、JSON Schema 生成、序列化/反序列化能力
- **`request` 字段** 自动映射到 Agent 的 `handle_<request>()` 或 `agent_<request>()` 方法
- **`llm_function_schema()`** 自动生成 OpenAI 兼容的 Function/Tool Schema，包括参数描述（从 docstring 提取）、required 字段、嵌套对象等
- **`format_instructions()`** 为非 OpenAI LLM 生成文本格式的工具使用说明
- **`examples()` 类方法** 支持 few-shot 示例，帮助 LLM 理解工具用法
- **`_strict` 标志** 控制是否强制 OpenAI 的 strict schema 模式
- **XML 工具支持**：`XMLToolMessage` 子类支持 XML 格式的工具调用，兼容不支持 JSON 的 LLM

这种"模型即工具"的设计让工具定义兼具类型安全、自文档化和多格式兼容三大优势。

---

## 4. Task：消息循环的执行引擎

`Task` 是 Langroid 中驱动 Agent 运行的核心抽象。它实现了一个 **多响应者消息循环**（multi-responder message loop）：

```
Task.run(msg)
    ↓
step() → 遍历 RESPONDERS 列表 [LLM, Agent, User, SubTask1, SubTask2, ...]
    ↓
第一个返回非空响应的 Responder 获得"发言权"
    ↓
将响应广播给所有 Responder（作为它们的输入）
    ↓
检查 Done 条件 → 继续循环 or 结束
```

**Task 的关键机制**：

- **`add_sub_task(subtask)`**：将子 Task 注册为 Responder，形成层级化的 Agent 协作树
- **三种终止信号**：`DONE`（任务完成）、`PASS`（交给下一个 Responder）、`SEND_TO <name>`（发送给指定 Responder）
- **Orchestration 工具**：`DoneTool`、`PassTool`、`SendTool`、`ForwardTool`、`AgentDoneTool` 等，让 LLM 通过工具调用控制任务流程
- **`DoneSequence`**：声明式的事件序列触发机制——当特定事件序列发生时（如"LLM 生成了 X 工具"→"Agent 做了 Y 处理"），自动结束任务
- **`single_round` 模式**：子 Task 只响应一次就结束，适合"提问-回答"场景
- **预算控制**：`max_cost`、`max_tokens`、`max_time`、`turns` 多维度限制
- **循环检测**：`inf_loop_cycle_len` + `inf_loop_dominance_factor` 检测并中断无限循环
- **异步支持**：`run_async()` 实现，支持 asyncio 协程

---

## 5. 语言模型抽象层

Langroid 通过 `language_models/` 模块实现了 LLM 的统一抽象：

| 文件 | 职责 |
|------|------|
| `base.py` | `LanguageModel` 抽象基类、`LLMMessage`/`LLMResponse`/`LLMFunctionSpec` 等核心数据结构 |
| `openai_gpt.py` | OpenAI GPT 系列实现（兼容所有 OpenAI-compatible API） |
| `azure_openai.py` | Azure OpenAI 适配 |
| `config.py` | 模型配置管理 |
| `model_info.py` | 模型元信息（上下文长度、定价等） |
| `provider_params.py` | 不同 provider 的参数差异处理 |
| `mock_lm.py` | 测试用 Mock LLM |
| `client_cache.py` | LLM 客户端缓存 |

**"OpenAI-compatible" 统一入口**：Langroid 几乎所有 LLM 交互都通过 `OpenAIGPT` 类完成。对于非 OpenAI 的 LLM（如 Ollama、vLLM、LiteLLM），只需指定 `chat_model="local/localhost:8000"` 或 `chat_model="ollama/mistral"`，框架自动处理 API 差异。

**`LLMMessage`** 是贯穿整个框架的消息单元，包含 `role`（SYSTEM/USER/ASSISTANT/TOOL/FUNCTION）、`content`、`tool_calls`、`function_call`、`tool_call_id` 等字段，完整映射 OpenAI 的消息协议。

---

## 6. 向量存储层

`vector_store/` 模块提供了统一的向量数据库抽象：

| 实现 | 向量数据库 |
|------|-----------|
| `chromadb.py` | ChromaDB（本地轻量） |
| `lancedb.py` | LanceDB（列式向量库） |
| `qdrantdb.py` | Qdrant |
| `milvusdb.py` | Milvus |
| `pineconedb.py` | Pinecone（云服务） |
| `postgres.py` | pgvector |
| `weaviatedb.py` | Weaviate |
| `meilisearch.py` | Meilisearch（全文搜索） |

所有向量存储实现都继承自 `VectorStore` 基类，统一 `add_documents()`、`search()`、`delete()` 等接口。配合 `ParsingConfig` 中的分块策略，形成完整的 RAG 管道。

---

## 7. 解析与文档处理

`parsing/` 模块覆盖了从原始文档到可检索内容的完整链路：

- **`parser.py`**：核心分块器，支持按段落、句子、token 分块
- **`document_parser.py`**：PDF、Word、Excel、HTML、Markdown 等格式解析
- **`code_parser.py`**：代码文件的 AST 级分块
- **`table_loader.py`**：表格数据加载
- **`file_attachment.py`**：文件附件处理（支持图片、视频等多媒体）
- **`parse_json.py`**：容错 JSON 提取（从 LLM 输出中提取有效 JSON）
- **`routing.py`**：`@` 寻址消息解析
- **`web_search.py`**：网络搜索集成
- **`spider.py`**：网页爬虫

---

## 8. 专用 Agent 生态

`agent/special/` 目录包含多个场景特化的 Agent：

| Agent | 用途 |
|-------|------|
| `DocChatAgent` | RAG 文档问答，支持多轮对话、引用追踪、相关性抽取 |
| `LanceDocChatAgent` | 基于 LanceDB 的文档问答变体 |
| `RelevanceExtractorAgent` | 从长文档中抽取与查询相关的段落 |
| `RetrieverAgent` | 通用检索 Agent |
| `TableChatAgent` | 表格数据的自然语言查询 |
| `SQLChatAgent` | SQL 数据库查询（位于 `sql/` 子目录） |
| `ArangoDBAgent` | ArangoDB 图数据库查询 |
| `Neo4jAgent` | Neo4j 图数据库查询 |

这些专用 Agent 继承自 `ChatAgent`，复用了工具系统、对话管理和 LLM 抽象层，只需注入特定的系统提示和工具集即可。

---

## 9. 消息传递与协作协议

Langroid 的多 Agent 协作通过精心设计的消息协议实现：

**`ChatDocument`** 是消息传递的载体，包含：
- `content`：消息文本内容
- `metadata`：发送者（`sender`）、接收者（`recipient`）、状态码（`StatusCode`）、工具调用信息等
- `tool_messages`：结构化的工具消息列表
- `files`：文件附件

**协作模式**：

1. **串行链式**：Agent A 的输出作为 Agent B 的输入（通过 `add_sub_task`）
2. **并行扇出**：多个子 Task 同时处理同一输入，结果汇总
3. **消息路由**：通过 `SEND_TO` 或 `RecipientTool` 将消息定向发送给特定 Agent
4. **人类参与**：`Entity.USER` 作为特殊的 Responder，在需要时插入人类反馈

**Orchestration 工具**（`agent/tools/orchestration.py`）：
- `DoneTool`：标记任务完成
- `PassTool`：跳过当前 Responder
- `SendTool`：定向发送消息
- `ForwardTool`：转发消息
- `AgentDoneTool`：Agent 级别的完成信号
- `FinalResultTool`：携带最终结果的完成信号
- `TaskTool`：动态委托子任务

---

## 10. 工程实践与生态

**配置管理**：全框架使用 Pydantic `BaseSettings`，支持环境变量、`.env` 文件。`AgentConfig` 是嵌套配置的根节点，汇聚 LLM、向量存储、解析、提示词四个子配置。

**可观测性**：
- `callbacks/` 目录提供 Token 使用统计、成本追踪
- `HTMLLogger` 生成可交互的 HTML 任务执行日志
- `RichFileLogger` 控制台美化输出

**MCP 集成**：Langroid 提供 MCP 工具适配器，将 MCP Server 的工具自动转换为 `ToolMessage` 实例，让任何 Langroid Agent 都能调用 MCP 服务。

**测试与质量**：完善的 pytest 测试套件、Codecov 覆盖率追踪、GitHub Actions CI/CD。

**Docker 支持**：官方提供多架构 Docker 镜像，支持开箱即用的容器化部署。

---

## 架构总结

Langroid 的架构可以用一句话概括：**以 Actor 模型为骨架，以类型安全的 ToolMessage 为关节，以 Task 消息循环为心脏，构建出一个声明式、可组合、多 Agent 协作的 LLM 应用框架。**

其核心创新点：
1. **Agent-Task 分离**：Agent 定义"能做什么"，Task 定义"怎么运行"
2. **Pydantic 原生工具**：类型验证 + Schema 生成 + 文档化三合一
3. **统一 LLM 入口**：一个 `OpenAIGPT` 类适配所有 OpenAI-compatible API
4. **声明式任务终止**：`DoneSequence` 用事件序列描述完成条件
5. **精细工具控制**：`use`/`handle` 正交控制，让 Agent 充当"工具路由器"

Langroid 适合构建需要多个专业化 Agent 协作的复杂 LLM 应用，如多文档问答系统、自动化研究管道、对话式数据查询平台等。
