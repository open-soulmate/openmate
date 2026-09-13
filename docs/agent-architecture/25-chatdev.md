# ChatDev 架构深度分析

> **项目**: OpenBMB/ChatDev (GitHub ⭐ 34,272)
> **论文**: *ChatDev: Communicative Agents for Software Development* (ACL 2024)
> **最新版本**: ChatDev 2.0 "DevAll" (2026年1月发布)
> **许可**: Apache-2.0

---

## 一、项目定位与演进

ChatDev 经历了两个截然不同的代际：

- **ChatDev 1.0 (Legacy)** — 虚拟软件公司范式。将 LLM 驱动的 Agent 映射为 CEO、CTO、Programmer、Tester 等角色，通过"功能研讨会"（Functional Seminar）在聊天中完成需求分析、设计、编码、测试、文档全流程。论文发表于 ACL 2024，成为 Communicative Agent Collaboration 的奠基性工作。
- **ChatDev 2.0 (DevAll)** — 零代码多 Agent 编排平台。从"软件公司"泛化为通用的 DAG 工作流引擎，用户通过 YAML 配置即可定义 Agent、节点、边、记忆和工具，无需编程。经典 v1.x 已迁移至 `chatdev1.0` 分支维护。

这一演进反映了多 Agent 领域的趋势：从特定场景（软件开发）向通用编排框架的跃迁。

---

## 二、核心架构（v2.0）

v2.0 的架构分为五层：

### 2.1 Entity 层 — 配置定义

`entity/configs/` 定义了所有可序列化配置的 Pydantic/Dataclass：

| 配置类 | 职责 |
|---|---|
| `GraphDefinition` / `DesignConfig` | 工作流整体定义：节点列表、边列表、记忆存储、组织名 |
| `AgentConfig` | Agent 节点配置：provider、model、prompt、thinking、memories |
| `EdgeConfig` / `EdgeConditionConfig` / `EdgeProcessorConfig` | 边的连接、条件判断（keyword/function）、载荷处理（regex/function） |
| `MemoryStoreConfig` / `SimpleMemoryConfig` / `Mem0MemoryConfig` / `FileMemoryConfig` / `BlackboardMemoryConfig` | 多种记忆后端 |
| `HumanConfig` | 人工介入节点 |
| `SubgraphConfig` | 子图嵌套（支持文件路径或内联定义） |
| `PythonRunnerConfig` | Python 代码执行节点 |

`GraphConfig` 作为运行时包装器，将 `GraphDefinition` 与输出目录、变量绑定、日志级别等运行时元数据组合在一起。

### 2.2 Runtime 层 — 执行引擎

`runtime/` 包含节点执行器、边条件评估器、工具管理器和 Agent 提供者抽象。

**节点注册机制** — `runtime/node/registry.py` 实现了一个可插拔的节点类型注册表：

```python
register_node_type("agent", config_cls=AgentConfig, executor_cls=AgentNodeExecutor,
                    capabilities=NodeCapabilities(exposes_tools=True))
register_node_type("human", config_cls=HumanConfig, executor_cls=HumanNodeExecutor)
register_node_type("subgraph", config_cls=SubgraphConfig, executor_cls=SubgraphNodeExecutor)
register_node_type("python", config_cls=PythonRunnerConfig, executor_cls=PythonNodeExecutor)
register_node_type("passthrough", ...)
register_node_type("literal", ...)
register_node_type("loop_counter", ...)
register_node_type("loop_timer", ...)
```

每种节点类型由三元组 `(name, config_cls, executor_cls)` 定义，通过 `NodeExecutorFactory.create_executors()` 统一实例化。

**ExecutionContext** — 所有执行器共享的上下文对象，捆绑了 `ToolManager`、`FunctionManager`、`LogManager`、`MemoryManager`、`ThinkingManager`、`TokenTracker` 和 `HumanPromptService`。

### 2.3 Workflow 层 — 编排引擎

`workflow/` 是整个系统的心脏，包含：

- **`GraphContext`** — 运行时图上下文，持有节点映射、边列表、拓扑层、子图、环检测状态和输出目录。
- **`GraphExecutor`** — 核心执行器，负责：
  1. 构建全局记忆（`_build_global_memories`）
  2. 构建 Thinking Manager（`_build_thinking_managers`）
  3. 构建 Agent 记忆管理器（`_build_agent_memories`）
  4. 构建节点执行器（`_build_node_executors`）
  5. 根据图拓扑选择执行策略

**三种执行策略**：

| 策略 | 适用场景 | 实现 |
|---|---|---|
| `DagExecutionStrategy` | 无环 DAG | `DAGExecutor` — 按拓扑层顺序执行 |
| `CycleExecutionStrategy` | 含环图 | `CycleExecutor` — 支持循环执行、终止条件 |
| `MajorityVoteStrategy` | 无边并行投票 | `ParallelExecutor` + 投票收集 |

### 2.4 Server 层 — Web 服务

`server/` 提供 FastAPI 后端，`frontend/` 提供 Vue 3 Web 控制台。用户可以通过 Web UI 定义工作流、启动执行、查看日志。

### 2.5 Tools 层 — 工具集成

支持三种工具来源：
- **MCP Local** — 本地 MCP 服务器（stdio）
- **MCP Remote** — 远程 MCP 服务器（HTTP）
- **Function Tools** — Python 函数注册为工具

---

## 三、Agent 设计模式

ChatDev 2.0 的 Agent 节点是高度可配置的：

- **Prompt 模板** — 支持 `{{variable}}` 模板变量，由上游节点输出填充
- **Provider 抽象** — 支持 OpenAI、多种本地/远程 LLM 提供者
- **Memory 扩展** — Agent 可挂载全局记忆存储，支持 Simple、File、Mem0、Blackboard 等后端
- **Thinking 扩展** — 支持 Reflection Thinking 等推理增强模式
- **Skills 系统** — Agent 可配置技能（`AgentSkillsConfig`）
- **Retry 策略** — `AgentRetryConfig` 控制失败重试行为

与 v1.0 的"角色扮演"不同，v2.0 的 Agent 是工作流图中的一个节点，角色语义由 prompt 和配置隐式定义。

---

## 四、记忆系统

记忆系统支持多种后端实现：

- **SimpleMemory** — JSON 文件持久化，最简单的键值存储
- **FileMemory** — 基于文件的读写
- **Mem0Memory** — 集成 Mem0 记忆框架
- **BlackboardMemory** — 黑板模式，多 Agent 共享读写

Agent 通过 `MemoryManager` 挂载全局记忆，支持声明式引用：

```yaml
nodes:
  - id: researcher
    type: agent
    config:
      memories:
        - name: shared_knowledge
          mode: read_write
```

全局记忆在工作流开始时加载（`_build_global_memories`），执行结束后自动持久化（`_save_memories`）。

---

## 五、边条件与载荷处理

边是节点之间的数据管道，支持两种增强机制：

1. **Edge Condition（条件判断）** — 决定边是否激活
   - `KeywordEdgeConditionConfig` — 基于关键词匹配
   - `FunctionEdgeConditionConfig` — 调用自定义 Python 函数判断

2. **Edge Processor（载荷处理）** — 对传递的消息进行变换
   - `RegexEdgeProcessorConfig` — 正则提取
   - `FunctionEdgeProcessorConfig` — 自定义函数处理

条件和处理器都通过工厂模式（`ConditionFactoryContext`、`ProcessorFactoryContext`）创建，支持运行时扩展。

---

## 六、工作流定义方式

工作流通过 YAML 定义，核心结构：

```yaml
graph:
  nodes:
    - id: plan
      type: agent
      config:
        provider: openai
        model: gpt-4o
        prompt_template: "为以下任务制定计划：{{content}}"
    - id: code
      type: agent
      config:
        provider: openai
        model: gpt-4o
        prompt_template: "根据计划编写代码：{{plan}}"
    - id: test
      type: agent
      config:
        prompt_template: "测试以下代码：{{code}}"
  edges:
    - source: plan
      target: code
    - source: code
      target: test
```

变量通过 `${VAR}` 引用环境变量，`vars` 字段可覆盖。工作流支持子图嵌套（`subgraph` 节点）和动态 Map-Reduce 模式。

---

## 七、循环与终止控制

v2.0 引入了完善的循环支持：

- **CycleManager** — 管理图中的环路，记录迭代次数
- **LoopCounterNode** — 计数器节点，达到阈值后阻断下游
- **LoopTimerNode** — 计时器节点，超时后阻断
- **CycleExecutionStrategy** — 环感知的执行策略，按 `cycle_execution_order` 有序执行

这使得 ChatDev 2.0 可以实现"迭代优化"模式：Agent 反复审查和改进输出，直到满足条件或达到最大迭代次数。

---

## 八、可扩展性设计

ChatDev 2.0 的可扩展性体现在多个层面：

1. **节点类型注册表** — 通过 `register_node_type()` 注册新节点类型，无需修改核心代码
2. **Schema Registry** — `schema_registry` 自动从注册信息生成配置 schema，供前端动态渲染
3. **工具插件** — MCP 协议支持即插即用的工具集成
4. **Provider 扩展** — `runtime/node/agent/providers/builtin_providers.py` 支持注册新 LLM 提供者
5. **思考模式扩展** — `ThinkingManagerFactory` 支持新的推理策略
6. **记忆后端扩展** — `MemoryFactory` 支持新的记忆存储实现

---

## 九、与 v1.0 的架构对比

| 维度 | v1.0 (Legacy) | v2.0 (DevAll) |
|---|---|---|
| 范式 | 虚拟软件公司 | 通用 DAG 工作流 |
| 角色定义 | 硬编码角色（CEO/CTO/Programmer...） | YAML 配置的 Agent 节点 |
| 编排方式 | ChatChain（Phase → Chat） | GraphExecutor（Node → Edge） |
| 记忆 | 简单的聊天历史 | 多后端记忆系统（Simple/File/Mem0/Blackboard） |
| 工具 | 内置软件工程工具 | MCP + Function Tools |
| 循环 | 固定的瀑布式流程 | 环检测 + CycleExecutor + 终止控制 |
| 前端 | 命令行 | Vue 3 Web 控制台 |
| 扩展性 | 配置文件定制 | 插件化注册表 |
| 执行策略 | 单一顺序 | DAG / Cycle / Majority Vote |
| 投票机制 | 无 | 多 Agent 并行 + 多数投票 |

---

## 十、设计哲学与启示

### 10.1 从"角色扮演"到"图编排"

v1.0 的核心洞察是：软件开发可以通过 Agent 间对话模拟。v2.0 进一步抽象，将对话本身泛化为图节点间的消息传递。这使得 ChatDev 从"软件公司"扩展到任意多 Agent 协作场景。

### 10.2 配置驱动 vs 代码驱动

v2.0 坚持"零代码"理念，所有 Agent 行为通过 YAML 声明。这降低了使用门槛，但也意味着复杂逻辑需要通过 Python 节点（`python` 类型）或函数条件来补充。

### 10.3 渐进式复杂度

用户可以从简单的两节点线性流程开始，逐步添加记忆、工具、循环、子图、条件边和投票机制。框架不会强制引入复杂性。

### 10.4 论文支撑

- **v1.0 论文** (ACL 2024): 提出"Communicative Agent"范式，证明 Agent 间聊天可以替代传统瀑布流程
- **v2.0 论文** (NeurIPS 2025): *Multi-Agent Collaboration via Evolving Orchestration* — 提出演进式编排策略，自动优化 Agent 协作拓扑

### 10.5 局限性

- v2.0 将 v1.0 的"公司隐喻"完全抽象掉，丧失了直观的组织结构语义
- 零代码设计对复杂场景的表达力有限，仍需 Python 节点补充
- 论文和代码的对应关系不如 v1.0 直接——v2.0 更像工程框架而非研究系统

---

## 附录：核心代码路径

```
├── entity/configs/          # 配置定义（Node, Edge, Memory, Agent, Tool）
├── entity/messages.py       # 消息类型定义
├── entity/graph_config.py   # 运行时图配置包装
├── runtime/
│   ├── node/
│   │   ├── registry.py      # 节点类型注册表
│   │   ├── builtin_nodes.py # 内置节点类型注册
│   │   └── executor/        # 各类节点执行器
│   ├── edge/                # 边条件和处理器
│   └── bootstrap/schema.py  # Schema 注册引导
├── workflow/
│   ├── graph.py             # GraphExecutor 核心
│   ├── graph_context.py     # 运行时图上下文
│   └── runtime/
│       ├── execution_strategy.py  # DAG/Cycle/Vote 策略
│       └── runtime_builder.py     # 运行时构建器
├── server/                  # FastAPI 后端
├── frontend/                # Vue 3 前端
└── run.py                   # CLI 入口
```
