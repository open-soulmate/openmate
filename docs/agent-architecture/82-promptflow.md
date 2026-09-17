# 82. PromptFlow 架构深度分析

> **项目**: [microsoft/promptflow](https://github.com/microsoft/promptflow)
> **Stars**: 11.2k+ | **License**: MIT | **语言**: Python
> **定位**: 端到端 LLM 应用开发工具链——从原型、测试到生产部署与监控

---

## 1. 总体架构与设计哲学

PromptFlow 的核心设计哲学是**将 LLM 应用抽象为有向无环图（DAG）或 Python 函数**，然后围绕这一抽象构建完整的开发工具链。项目采用**分层包结构**，源码位于 `src/` 下共 10 个子包：

| 包名 | 职责 |
|---|---|
| `promptflow-tracing` | 底层追踪（OpenTelemetry 集成） |
| `promptflow-core` | 核心运行时：Flow 定义、Executor、连接管理、Serving |
| `promptflow-devkit` | 开发工具：CLI、SDK、批量运行、编排器 |
| `promptflow-tools` | 内置工具（LLM、Python、Prompt） |
| `promptflow-azure` | Azure AI 云集成 |
| `promptflow-evals` | 评估框架 |
| `promptflow-parallel` | 并行执行支持 |
| `promptflow-rag` | RAG 场景专用组件 |
| `promptflow-recording` | 录制/回放（用于测试） |
| `promptflow` | 聚合元包 |

这种分层设计的核心优势是**最小依赖原则**——生产部署只需 `promptflow-core`，不需要开发工具链的重依赖。

---

## 2. Flow 定义模型（双范式）

PromptFlow 支持两种 Flow 定义范式，这是其架构最独特的设计决策：

### DAG Flow（声明式）
通过 `flow.dag.yaml` 文件定义节点（Node）之间的依赖关系。每个节点对应一个 Tool（函数），节点间通过输入输出引用连接。执行器根据拓扑排序自动调度。

```yaml
# flow.dag.yaml 示例结构
inputs:
  chat_input:
    type: string
outputs:
  chat_output:
    type: string
nodes:
  - name: llm_node
    type: llm
    inputs:
      prompt: "${prompt_node.output}"
      deployment_name: gpt-35-turbo
    connection: open_ai_connection
```

### Flex Flow（命令式）
直接用 Python 函数或类作为入口点，通过 `flow.flex.yaml` 指向入口。适合复杂控制流（if-else、循环）和与 LangChain 等框架的集成。

**设计洞察**：双范式策略体现了 PromptFlow 的务实主义——DAG 适合可视化拖拽和低代码场景，Flex 适合开发者直接编码。两者共享同一套追踪和评估基础设施。

---

## 3. 执行引擎（Executor）

执行引擎是 PromptFlow 的核心，位于 `promptflow/executor/` 目录下，包含以下关键组件：

### FlowExecutor（主执行器）
`flow_executor.py` 是统一入口，负责：
- 解析 Flow YAML 定义
- 验证节点依赖关系（通过 `FlowValidator`）
- 调度节点执行
- 处理输入输出映射

### DAG Manager（DAG 调度器）
`_dag_manager.py` 实现了基于拓扑排序的节点调度。它维护节点状态机（pending → running → completed/failed），支持：
- 并行执行无依赖的节点
- 条件分支处理
- 错误传播与恢复

### Async Nodes Scheduler
`_async_nodes_scheduler.py` 提供异步节点调度，支持 `asyncio` 并发执行，适用于高 I/O 场景（如多 LLM 并行调用）。

### 批量执行
`_line_execution_process_pool.py` 和 `_process_manager.py` 实现多进程批量执行——每条数据行在独立进程中运行，支持大规模数据集的评估和测试。

---

## 4. Tool 系统（可扩展工具框架）

Tool 是 Flow 的基本构建单元。PromptFlow 定义了三种内置工具：

- **LLM Tool**：封装 LLM 调用，支持 Jinja2 模板渲染 prompt
- **Python Tool**：执行任意 Python 函数
- **Prompt Tool**：纯字符串 prompt 拼接

工具系统的关键设计是**Tool Resolver**（`_tool_resolver.py`），它负责：
- 根据节点配置解析实际的工具实现
- 绑定连接凭据
- 处理输入参数的类型转换和引用解析（`_input_assignment_parser.py`）

用户还可以创建**自定义工具包**，通过 Python 包的形式分发和共享。

---

## 5. 连接管理（Connection）

连接系统（`promptflow/core/_connection.py`）统一管理外部服务的凭据：

| 连接类型 | 用途 |
|---|---|
| Azure OpenAI | Azure 托管的 GPT 模型 |
| OpenAI | 直接 OpenAI API |
| Cognitive Search | Azure 认知搜索 |
| Serp | 搜索引擎结果 |
| Serverless | 无服务器推理端点 |
| Custom | 自定义键值对 |

**安全设计**：本地环境使用加密存储密钥；Azure 环境通过 Key Vault 管理。连接名在 Flow YAML 中以引用方式使用，实现凭据与逻辑分离。

---

## 6. 追踪系统（Tracing）

`promptflow-tracing` 是一个独立的轻量级包，基于 **OpenTelemetry** 构建：

- **`_tracer.py`**：核心追踪器，拦截函数调用生成 Span
- **`_trace.py`**：追踪装饰器，用于标注需要追踪的函数
- **`_span_enricher.py`**：Span 增强器，添加 LLM 特有的元数据（token 用量、模型名等）
- **`_integrations/`**：与 OpenAI SDK 等第三方库的自动集成
- **`_operation_context.py`**：线程本地的运行上下文，携带 trace_id、run_id 等

追踪系统的设计亮点是**零侵入**——通过装饰器和 monkey-patching 自动捕获 LLM 调用链，无需修改业务代码。

---

## 7. Serving 层（部署服务化）

`promptflow/core/_serving/` 提供了基于 **Flask** 的 HTTP 服务：

- **`app.py` / `app_base.py`**：Flask 应用工厂
- **`flow_invoker.py`**：将 HTTP 请求转换为 Flow 执行
- **`response_creator.py`**：构造标准化响应
- **`swagger.py`**：自动生成 OpenAPI/Swagger 文档
- **`v1/` / `v2/`**：API 版本管理
- **`monitor/`**：请求监控中间件

支持的部署方式包括：
- 本地 Flask 服务（`pf flow serve`）
- Docker 容器化部署
- Azure AI 在线端点

---

## 8. 开发工具链（DevKit）

`promptflow-devkit` 提供完整的开发体验：

### CLI（`_cli/`）
`pf` 命令行工具，覆盖完整生命周期：
- `pf flow init` — 初始化 Flow
- `pf flow test` — 测试 Flow（支持交互模式）
- `pf run create` — 创建批量运行
- `pf connection create` — 管理连接

### SDK（`_sdk/` + `client/`）
Python SDK 封装了 Flow 管理、运行管理、连接管理等操作。

### 编排器（`_orchestrator/`）
负责批量运行的编排，管理数据输入、并行度控制、结果收集。

### 批量处理（`batch/`）
支持大规模数据集的批量推理和评估。

---

## 9. 评估框架（Evals）

`promptflow-evals` 提供了 LLM 应用质量评估的框架：

- 内置评估指标（准确性、相关性、忠实度等）
- 支持自定义评估 Flow
- 与 CI/CD 集成能力
- 评估结果可视化

评估 Flow 是一种特殊的 Flow，接收标准/聊天 Flow 的输出作为输入，计算质量指标。这种"Flow 评估 Flow"的递归设计非常优雅。

---

## 10. 与 Azure AI 的深度集成

`promptflow-azure` 包实现了与 Azure AI Studio / Azure ML 的深度集成：

- **云端运行**：将 Flow 提交到 Azure 计算集群执行
- **共享连接**：团队级别的连接管理
- **实验追踪**：与 Azure ML 的实验管理集成
- **模型部署**：一键部署到 Azure 在线端点

但 PromptFlow 的核心设计**不依赖 Azure**——`promptflow-core` 完全独立运行，Azure 集成是可选的扩展层。这种"本地优先、云增强"的策略使得开源用户可以零成本使用。

---

## 架构总结

```
┌─────────────────────────────────────────────┐
│              promptflow (元包)                │
├──────────┬──────────┬───────────┬───────────┤
│ devkit   │  azure   │   evals   │  parallel │
│ CLI/SDK  │  云集成   │   评估     │   并行     │
├──────────┴──────────┴───────────┴───────────┤
│              promptflow-core                 │
│  ┌─────────┬──────────┬──────────┐          │
│  │ Flow    │ Executor │ Serving  │          │
│  │ 定义模型 │ DAG调度  │ Flask服务 │          │
│  ├─────────┼──────────┼──────────┤          │
│  │  Tool   │Connection│  Model   │          │
│  │  系统    │  管理    │  Config  │          │
│  └─────────┴──────────┴──────────┘          │
├─────────────────────────────────────────────┤
│           promptflow-tracing                 │
│    OpenTelemetry · Span · 自动追踪           │
└─────────────────────────────────────────────┘
```

PromptFlow 的架构核心优势在于：**分层解耦**（核心运行时与开发工具分离）、**双范式并存**（DAG + Flex）、**追踪驱动可观测性**、**工具可扩展性**。它不是一个 Agent 框架，而是一个 LLM 应用的"开发运维平台"——覆盖从 prompt 调试到生产监控的全生命周期。
