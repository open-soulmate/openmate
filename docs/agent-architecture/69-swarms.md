# 69. Swarms（kyegomez/swarms）架构深度分析

> **项目地址**: https://github.com/kyegomez/swarms
> **许可证**: Apache-2.0
> **Stars**: 7,165 | **Forks**: 1,017 | **Commits**: 5,347
> **定位**: 企业级生产就绪多 Agent 编排框架

---

## 1. 核心设计理念

Swarms 的设计哲学是**"一个路由，多种拓扑"**。它不强制用户学习多种 API，而是通过 `SwarmRouter` 这个统一入口，用一个 `swarm_type` 字符串参数切换不同的多 Agent 编排策略。框架预置了 14 种以上的编排模式（SequentialWorkflow、ConcurrentWorkflow、AgentRearrange、MixtureOfAgents、GroupChat、HierarchicalSwarm、HeavySwarm、GraphWorkflow、RoundRobin、MajorityVoting、CouncilAsAJudge、LLMCouncil、DebateWithJudge、PlannerWorkerSwarm），并在 `structs/` 目录下提供了 60+ 个实现文件。

核心原则：
- **渐进式复杂度**：从 2 个 Agent 的顺序链到 60+ 结构的 DAG 编排，按需升级
- **生产优先**：内置遥测（OpenTelemetry）、自动保存、fallback swarm 降级、批量/并发执行
- **互操作性**：兼容 MCP 协议、LiteLLM 全模型支持、Agent Skills（Anthropic 格式）

---

## 2. Agent 核心抽象（`structs/agent.py`）

`Agent` 类是整个框架的基石，约 2000+ 行代码，职责远超"调用 LLM"：

```python
class Agent:
    def __init__(self,
        agent_name: str,
        system_prompt: str,
        model_name: str = "gpt-4o",
        max_loops: int = 1,           # "auto" 启用自主循环
        tools: List[BaseTool] = None, # 原生工具
        mcp_urls: List[str] = None,   # MCP 服务器
        skills_dir: str = None,       # Anthropic Agent Skills
        long_term_memory: BaseVectorDatabase = None,
        fallback_models: List[str] = None,
        output_type: OutputType = "str",
        transforms: TransformConfig = None,  # 上下文窗口压缩
        prompt_caching: bool = False,
        ...
    )
```

**关键能力**：
- **自主循环（`max_loops="auto"`）**：通过 `AutonomousAgentLoop` 实现 ReAct 模式的自动推理，支持 `think`、`create_plan`、`complete_task` 等 12 种工具选择
- **MCP 集成**：`mcp_urls` / `mcp_configs` 直接连接 MCP 服务器，工具自动发现与路由
- **上下文管理**：`transforms` 配置支持滑动窗口、摘要压缩等策略应对上下文长度限制
- **模型降级**：`fallback_models` 列表，主模型失败时自动切换
- **遥测**：`@capture_init` / `@trace_run` 装饰器自动上报 OpenTelemetry

---

## 3. SwarmRouter —— 统一编排入口

`SwarmRouter` 是框架的编排门面（Facade），核心逻辑：

```python
SwarmType = Literal[
    "AgentRearrange", "MixtureOfAgents", "SequentialWorkflow",
    "ConcurrentWorkflow", "GroupChat", "MultiAgentRouter",
    "HierarchicalSwarm", "MajorityVoting", "CouncilAsAJudge",
    "HeavySwarm", "LLMCouncil", "DebateWithJudge",
    "RoundRobin", "PlannerWorkerSwarm",
]
```

**设计亮点**：
- **懒初始化**：首次 `run()` 时才创建底层 swarm 实例，并按 `swarm_type + agents` 缓存
- **Fallback 降级链**：`fallback_swarms` 参数指定备选 swarm 类型列表，主 swarm 失败时依次尝试
- **三种执行模式**：`run()`（单任务）、`batch_run()`（串行批量）、`concurrent_run()`（并行批量）
- **自动保存**：`autosave=True` 时在 `workspace_dir/swarms/SwarmRouter/{name}-{timestamp}/` 下保存 `config.json`、`state.json`、`metadata.json`
- **协作提示注入**：`multi_agent_collab_prompt=True` 时自动向 Agent 的 system prompt 注入团队协作指令（仅对 SequentialWorkflow 和 AgentRearrange 生效）

---

## 4. 编排模式详解

### 4.1 SequentialWorkflow（顺序工作流）
最简单的链式编排：Agent A 的输出 → Agent B 的输入 → ... → 最终输出。内部实际委托给 `AgentRearrange` 执行，自带**语义漂移检测**（Drift Detection）：用一个独立 LLM 调用评估最终输出与原始任务的对齐程度（0.0-1.0 分）。

### 4.2 AgentRearrange（动态重排）
支持 Flow DSL 语法定义 Agent 间的拓扑关系：
```
"a -> b, c"  # a 的输出分发给 b 和 c
"a -> b -> c"  # 线性链
"a -> b, c -> d"  # 分叉汇合
```
这是最灵活的编排器，被 SequentialWorkflow 内部使用。

### 4.3 GraphWorkflow（DAG 工作流）
基于 `Node` 和 `Edge` 的有向无环图编排，支持两种后端：NetworkX（Python 原生）和 Rustworkx（Rust 加速）。功能包括：
- 拓扑排序与层级编译
- 并行层执行（同一层的节点并发运行）
- Graphviz 可视化导出
- JSON 序列化/反序列化（含运行时状态保存恢复）
- 入口点/出口点验证

### 4.4 MixtureOfAgents（混合专家）
多层并行 + 聚合器架构：
```
Layer 0: 每个 Worker 独立处理原始任务（并行）
Layer 1+: 每个 Worker 收到"原始任务 + 上一层所有输出"
最终: Aggregator Agent 综合所有层的对话历史，生成最终答案
```
关键设计：Worker 之间不直接通信，通过聚合器间接共享知识。`layers` 参数控制迭代深度。

### 4.5 HierarchicalSwarm（层级 Swarm）
Director-Worker 模式：Director 创建计划 → 分配子任务给专业 Worker → 收集结果 → 可发新一轮指令（反馈循环）。适合项目管理和团队协调场景。

### 4.6 HeavySwarm（重量级分析）
五阶段工作流：Research → Analysis → Alternatives → Verification → Synthesis，每个阶段由专门 Agent 负责。支持实时 Dashboard 可视化。

---

## 5. 工具与外部集成

### 5.1 MCP 原生支持
- Agent 级别：`mcp_urls` / `mcp_configs` 参数
- 服务器级别：`MCPDeployer` 可将 Agent 作为 MCP Server 暴露，支持自定义认证、多 Agent 共享端口
- 工具自动合并：多个 MCP 服务器的工具被合并，调用自动路由到正确的服务器

### 5.2 Agent Skills
遵循 Anthropic 的 SKILL.md 格式，从目录加载 markdown 格式的能力定义，自动注入 system prompt。

### 5.3 Swarms Marketplace
通过 `marketplace_prompt_id` 一键从 swarms.world 拉取 prompt 模板，需要 `SWARMS_API_KEY`。

---

## 6. 可观测性与遥测

框架深度集成 OpenTelemetry：
- `@capture_init`：记录 Agent/结构的初始化参数
- `@trace_run`：追踪每次 `run()` 的输入输出、耗时
- `ContextThreadPoolExecutor`：线程池执行器，自动传递 trace context
- `log_agent_data`：记录 Agent 状态数据
- `capture_error`：异常自动上报
- Loguru 日志：每个模块独立的 log folder

---

## 7. 对话与上下文管理

`Conversation` 类是所有结构的共享对话存储：
- 支持 `add(role, content)` 添加消息
- `list_all_agents()` 在对话开始时注入团队名册
- `split_last_turn()` / `messages_for()` 等工具函数支持按 Agent 名称过滤上下文
- `history_output_formatter()` 支持多种输出格式（str、dict、json、yaml、xml、list）

`ContextCompressor` 在 Agent 内部处理上下文窗口溢出，`TransformConfig` 配置滑动窗口或摘要策略。

---

## 8. 可靠性工程

- **Fallback Swarm 链**：SwarmRouter 支持 `fallback_swarms` 参数，主 swarm 失败时自动降级
- **可靠性检查**：每个结构在 `__init__` 时调用 `reliability_check()` 验证参数完整性
- **重试机制**：Agent 内置 `retry_attempts` 参数
- **模型降级**：`fallback_models` 列表，主模型不可用时自动切换
- **错误模式**：自定义异常类型 `SwarmRouterRunError`、`SwarmRouterConfigError`、`AgentRunError`、`AgentLLMError`、`AgentToolExecutionError`
- **安全提示**：`SAFETY_PROMPT` 注入安全约束

---

## 9. 序列化与持久化

`SerializableMixin` 基类提供统一的序列化接口：
- `save()` / `load()` 支持 JSON 格式的完整状态保存
- `GraphWorkflow` 支持浅层（仅配置）和深层（含运行时状态、对话历史）两种导出模式
- Schema 版本控制（`schema_version: "1.0.0"`），保证向前兼容
- SwarmRouter 的 autosave 保存 config + state + metadata 三文件

---

## 10. 生态定位与竞品对比

| 维度 | Swarms | AutoGen | CrewAI | LangGraph |
|------|--------|---------|--------|-----------|
| **架构模式数** | 14+（60+ 实现） | 2-3 | 3 | 自定义图 |
| **统一路由** | SwarmRouter ✅ | ❌ | ❌ | ❌ |
| **MCP 原生** | ✅ Agent + Server | 部分 | ❌ | 部分 |
| **DAG 编排** | GraphWorkflow（NetworkX/Rustworkx） | ❌ | ❌ | ✅ |
| **遥测** | OpenTelemetry 深度集成 | 基础 | 基础 | LangSmith |
| **Prompt 缓存** | ✅ Anthropic/OpenAI | ❌ | ❌ | ❌ |
| **Fallback 降级** | ✅ 多级降级链 | ❌ | ❌ | ❌ |

**Swarms 的核心优势**：编排模式的丰富度（14+ 种预置结构）和 SwarmRouter 的统一抽象是其最大差异化。对于需要在不同协作模式间快速切换的场景，Swarms 的 API 设计最为简洁。

**局限性**：Agent 类代码量过大（2000+ 行），职责边界不够清晰；部分结构（如 `SocialAlgorithms`、`AuctionSwarm`）更偏实验性质；与 LangGraph 相比，自定义图的能力和可视化工具仍有差距。

---

*分析基于源码 master 分支，文件：`swarms/structs/agent.py`、`swarm_router.py`、`sequential_workflow.py`、`graph_workflow.py`、`mixture_of_agents.py`、`__init__.py` 等。*
