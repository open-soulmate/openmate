# 22 - LlamaIndex 架构深度分析

> **项目**: [run-llama/llama_index](https://github.com/run-llama/llama_index)
> **Stars**: 52.1k | **Forks**: 8.1k | **Commits**: 7,930
> **许可证**: MIT
> **定位**: 面向数据增强的 LLM 应用框架，核心解决「如何用私有数据增强 LLM」的问题

---

## 1. 项目定位与核心价值

LlamaIndex（原名 GPT Index）由 Jerry Liu 于 2022 年创建，定位为**文档处理与 AI 数据框架**。其核心价值主张是：

- **数据连接器**：从 API、PDF、文档、SQL 等多种来源摄取数据
- **数据结构化**：通过索引（Index）和图（Graph）组织数据，使其可被 LLM 高效使用
- **高级检索/查询接口**：将任意 LLM 提示输入转换为检索上下文和知识增强输出
- **应用框架集成**：与 LangChain、Flask、Docker、ChatGPT 等无缝集成

与 LangChain 偏向通用 Agent 编排不同，LlamaIndex 的差异化在于**数据为中心**——索引构建、检索优化、文档解析是其一等公民能力。

## 2. 仓库结构与模块化设计

LlamaIndex 采用**核心+集成**的双层包结构：

```
llama_index/
├── llama-index-core/              # 核心框架（必装）
│   └── llama_index/core/
│       ├── agent/                 # Agent 实现
│       ├── tools/                 # 工具系统
│       ├── memory/                # 记忆管理
│       ├── llms/                  # LLM 抽象层
│       ├── embeddings/            # 嵌入模型
│       ├── indices/               # 索引系统
│       ├── retrievers/            # 检索器
│       ├── query_engine/          # 查询引擎
│       ├── workflow/              # 工作流引擎
│       └── prompts/               # 提示模板
├── llama-index-integrations/      # 300+ 集成插件
├── llama-index-instrumentation/   # 可观测性
├── llama-index-utils/             # 工具库
└── llama-dev/                     # 开发工具
```

**包导入命名约定**：
- `from llama_index.core.xxx` —— 使用核心包
- `from llama_index.xxx.yyy` —— 使用集成包

这种设计允许用户通过 `pip install llama-index`（全家桶）或 `pip install llama-index-core`（最小安装 + 按需集成）灵活选择。

## 3. Agent 架构设计

### 3.1 BaseWorkflowAgent：三重继承的 Agent 基类

LlamaIndex Agent 的核心设计亮点是 **BaseWorkflowAgent** 同时继承自三个基类：

```python
class BaseWorkflowAgent(
    Workflow,        # 工作流引擎（事件驱动执行）
    BaseModel,       # Pydantic 数据模型（配置验证）
    PromptMixin,     # 提示词管理（运行时提示修改）
    metaclass=BaseWorkflowAgentMeta  # 元类解决多重继承冲突
):
```

这使得每个 Agent **既是可配置的数据模型，又是可执行的工作流，还能动态管理提示词**。

### 3.2 三种 Agent 实现

| Agent 类型 | 核心机制 | 适用场景 |
|-----------|---------|---------|
| **ReActAgent** | Thought → Action → Observation 循环 | 不支持 function calling 的 LLM |
| **FunctionAgent** | 原生 function calling 工具调用 | 支持 function calling 的 LLM |
| **CodeActAgent** | 生成并执行代码来完成任务 | 需要代码执行能力的场景 |

### 3.3 Agent 核心抽象方法

每个 Agent 必须实现三个核心方法，定义了 Agent 的完整生命周期：

```python
async def take_step(ctx, llm_input, tools, memory) -> AgentOutput:
    """单步推理：接收 LLM 输入和工具列表，返回输出或工具调用"""

async def handle_tool_call_results(ctx, results, memory) -> None:
    """处理工具调用结果，更新内部状态（scratchpad/reasoning）"""

async def finalize(ctx, output, memory) -> AgentOutput:
    """最终化：将对话历史写入 memory，清理临时状态"""
```

这种三阶段设计将**推理、工具执行、状态管理**清晰分离。

### 3.4 ReActAgent 详细机制

ReActAgent 维护一个 `current_reasoning` 列表，记录完整的推理链：

1. **格式化输入**：通过 `ReActChatFormatter` 将工具描述、聊天历史、已有推理步骤组装为 LLM 输入
2. **解析输出**：`ReActOutputParser` 解析 LLM 输出为 `ActionReasoningStep`（执行工具）或 `ResponseReasoningStep`（返回答案）
3. **错误恢复**：当输出解析失败时，返回 `retry_messages` 让 LLM 自我纠正
4. **推理累积**：每步推理结果追加到 `current_reasoning`，供后续步骤参考

### 3.5 FunctionAgent 详细机制

FunctionAgent 利用 LLM 原生的 function calling 能力：

1. 使用 `llm.achat_with_tools()` 或 `llm.astream_chat_with_tools()` 获取工具调用
2. 维护 `scratchpad`（暂存区）记录完整的工具调用-结果对话
3. 支持 `initial_tool_choice` 强制首次调用特定工具
4. 支持 `allow_parallel_tool_calls` 并行工具调用
5. 最终将 scratchpad 内容合并到 memory

## 4. 多 Agent 协作系统

### 4.1 AgentWorkflow 编排器

`AgentWorkflow` 是多 Agent 协作的顶层编排器，支持：

- **多 Agent 注册**：将多个 Agent 组合为一个工作流
- **Handoff 机制**：Agent 之间通过专用 `handoff` 工具转移控制权
- **权限控制**：`can_handoff_to` 字段定义 Agent 间的转移权限图
- **共享状态**：所有 Agent 共享同一个 `Context` 中的 state

### 4.2 Handoff 协议

```python
async def handoff(ctx: Context, to_agent: str, reason: str) -> str:
    """将聊天控制权移交给指定 Agent"""
    # 1. 验证目标 Agent 存在
    # 2. 验证当前 Agent 有权移交
    # 3. 设置 next_agent 标记
    # 4. 返回移交说明
```

这是一种**显式、受控的 Agent 切换**机制，与 OpenAI Swarm 的 handoff 概念类似。

## 5. 工具系统架构

### 5.1 工具类型层次

```
BaseTool (抽象基类)
├── AsyncBaseTool (异步基类)
│   ├── FunctionTool       # 从 Python 函数创建工具
│   ├── QueryEngineTool    # 将查询引擎包装为工具
│   ├── RetrieverTool      # 将检索器包装为工具
│   └── QueryPlanTool      # 查询计划工具
```

### 5.2 ToolMetadata 数据模型

```python
@dataclass
class ToolMetadata:
    description: str          # 工具描述（最大 1024 字符）
    name: Optional[str]       # 工具名称
    fn_schema: Optional[Type[BaseModel]]  # 参数 schema（Pydantic）
    return_direct: bool = False  # 是否直接返回给用户
```

`to_openai_tool()` 方法将元数据转换为 OpenAI function calling 格式。

### 5.3 FunctionTool 的智能适配

FunctionTool 是最核心的工具实现，具有以下特性：

- **自动 schema 生成**：从函数签名和类型注解自动生成 Pydantic schema
- **同步/异步互转**：`sync_to_async` / `async_to_sync` 自动适配
- **Context 感知**：检测函数参数是否为 `workflow.Context`，自动注入
- **Callback 机制**：支持执行前后回调，可覆盖默认输出
- **LangChain 互操作**：`to_langchain_tool()` / `to_langchain_structured_tool()` 转换

### 5.4 ToolOutput 的多模态支持

```python
class ToolOutput(BaseModel):
    blocks: List[ContentBlock]  # 支持 TextBlock, ImageBlock, AudioBlock 等
    tool_name: str
    raw_input: Dict[str, Any]
    raw_output: Any
    is_error: bool = False
```

工具输出已从纯文本升级为**多模态内容块**，支持文本、图片、音频、视频、文档等。

## 6. 记忆系统

Agent 的记忆通过 `BaseMemory` 接口管理，默认实现 `ChatMemoryBuffer`：

- **滑动窗口**：保留最近 N 条消息
- **Token 限制**：基于 token 数截断
- **持久化**：通过 `StorageContext` 支持磁盘持久化
- **AgentWorkflow 级别共享**：多 Agent 共享同一 memory 实例

Agent 的 `finalize()` 方法负责将 scratchpad/reasoning 中的临时对话写入 memory。

## 7. 工作流引擎（Workflow Engine）

Agent 构建在 LlamaIndex 的通用工作流引擎之上：

- **事件驱动**：通过 `StartEvent` / `StopEvent` / 自定义事件驱动执行
- **Step 装饰器**：`@step` 标记工作流步骤
- **Context 状态管理**：`ctx.store` 提供异步键值存储
- **流式输出**：`ctx.write_event_to_stream()` 实时推送中间状态
- **并发控制**：`num_concurrent_runs` 控制并发执行数
- **超时管理**：`timeout` 参数控制整体执行超时

## 8. 索引与检索系统

LlamaIndex 的差异化能力在于索引系统：

- **VectorStoreIndex**：向量索引，基于嵌入相似度检索
- **Knowledge Graph Index**：知识图谱索引
- **Tree Index**：树形层级索引
- **Keyword Table Index**：关键词表索引
- **Composable Graph**：组合多种索引的图结构

每个索引都可包装为 `QueryEngineTool`，供 Agent 作为工具调用。

## 9. LLM 抽象层

```python
# 核心接口
from llama_index.core.llms import LLM

# 集成实现（300+）
from llama_index.llms.openai import OpenAI
from llama_index.llms.ollama import Ollama
from llama_index.llms.anthropic import Anthropic
# ...
```

LLM 抽象层提供统一接口：
- `achat()` / `astream_chat()` —— 聊天补全
- `achat_with_tools()` / `astream_chat_with_tools()` —— 带工具的聊天
- `get_tool_calls_from_response()` —— 从响应中提取工具调用
- `metadata.is_function_calling_model` —— 判断是否支持 function calling

## 10. 企业级生态（LlamaParse / LlamaCloud）

LlamaIndex 不仅是开源框架，还构建了完整的企业级生态：

| 产品 | 功能 |
|------|------|
| **LlamaParse** | Agent 驱动的 OCR 和文档解析（130+ 格式） |
| **LlamaExtract** | 从文档中结构化数据提取 |
| **LlamaIndex Cloud** | 数据摄取、索引和 RAG 管道 |
| **LlamaSplit** | 大文档拆分为子类别 |
| **LlamaAgents** | 端到端文档 Agent 部署 |

开源框架与云服务形成互补：框架提供灵活性，云服务提供开箱即用的生产能力。

---

## 架构总结

```
┌──────────────────────────────────────────────────┐
│                  AgentWorkflow                    │
│  (多 Agent 编排、Handoff、共享状态)               │
├────────────┬────────────┬────────────────────────┤
│ ReActAgent │FunctionAgent│     CodeActAgent      │
│ (推理循环) │(函数调用)   │    (代码执行)          │
├────────────┴────────────┴────────────────────────┤
│              BaseWorkflowAgent                    │
│  Workflow + BaseModel + PromptMixin               │
├──────────────────────────────────────────────────┤
│           工具系统 (BaseTool/FunctionTool)         │
│  自动schema | 同步异步互转 | Context注入 | 多模态  │
├──────────────────────────────────────────────────┤
│           工作流引擎 (Workflow/Context)            │
│  事件驱动 | @step | 流式输出 | 并发控制            │
├──────────────────────────────────────────────────┤
│  LLM抽象 │ 索引系统 │ 检索器 │ 记忆 │ 存储上下文   │
└──────────────────────────────────────────────────┘
```

**LlamaIndex 的架构哲学**：以数据为中心，通过索引将私有数据转化为 LLM 可用的知识；通过工作流引擎将 Agent 执行标准化为事件驱动的步骤序列；通过多 Agent 协作支持复杂任务分解。其最显著的工程特点是三重继承的 Agent 基类设计——每个 Agent 同时是可配置的数据模型、可执行的工作流、和可管理的提示系统。
