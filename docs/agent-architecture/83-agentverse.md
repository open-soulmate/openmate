# AgentVerse (OpenBMB/AgentVerse) 架构深度分析

> **项目地址**: https://github.com/OpenBMB/AgentVerse
> **论文**: [AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors in Agents](https://arxiv.org/abs/2308.10848)
> **Star**: 5,120+ | **Fork**: 516+ | **License**: Apache-2.0 | **语言**: Python 3.9+
> **ICLR 2024 接收** | NVIDIA 官方博客推荐

AgentVerse 是清华大学 OpenBMB 团队开发的多智能体协作框架，旨在简化多个 LLM Agent 的部署与协作。其核心创新在于将多智能体系统抽象为**任务求解（Task-Solving）**和**行为模拟（Simulation）**两大框架，并通过高度模块化的设计实现灵活扩展。

---

## 1. 整体架构设计：双模式分离

AgentVerse 的架构围绕两条主线展开：

- **Task-Solving 模式**：将多个 Agent 组装为自动化的多智能体系统，协作完成特定任务（如软件开发、咨询系统、代码生成）。核心流程为：**任务分解 → 角色分配 → 多轮讨论 → 执行评估**。
- **Simulation 模式**：允许用户自定义环境，观察多个 Agent 之间的行为涌现和社会交互（如课堂模拟、囚徒困境、Pokemon 游戏）。核心流程为：**环境初始化 → 轮次推进 → 行为观察 → 交互记录**。

两条模式共享底层的 Agent、LLM、Memory 基础设施，但环境层和规则层完全独立。这种分离设计使得研究者可以专注于行为模拟的学术探索，而工程团队可以利用任务求解模式构建生产级系统。

---

## 2. 核心模块结构

项目目录结构清晰体现了模块化思想：

```
agentverse/
├── agents/                    # Agent 定义
│   ├── base.py                # BaseAgent 基类
│   ├── simulation_agent/      # 模拟场景 Agent（教授、学生、囚犯等）
│   └── tasksolving_agent/     # 任务求解 Agent（solver, critic, evaluator 等）
├── environments/              # 环境管理
│   ├── base.py                # BaseEnvironment 基类
│   ├── simulation_env/        # 模拟环境（classroom, pokemon, prisoner 等）
│   └── tasksolving_env/       # 任务求解环境
├── llms/                      # LLM 后端抽象
├── memory/                    # 记忆系统
├── memory_manipulator/        # 记忆操作器
├── output_parser/             # 输出解析器
├── tasks/                     # 任务配置（YAML）
├── registry.py                # 注册表机制
└── message.py                 # 消息定义
```

每个模块通过 `Registry` 注册表实现松耦合，新增组件只需装饰器注册即可被框架发现和构建。

---

## 3. 注册表机制（Registry Pattern）

AgentVerse 的核心扩展机制是基于装饰器的**注册表模式**：

```python
class Registry(BaseModel):
    name: str
    entries: Dict = {}

    def register(self, key: str):
        def decorator(class_builder):
            self.entries[key] = class_builder
            return class_builder
        return decorator

    def build(self, type: str, **kwargs):
        return self.entries[type](**kwargs)
```

框架维护多个注册表：`agent_registry`、`env_registry`、`parser_registry` 等。所有 Agent 类型、环境类型、解析器都通过 `@registry.register("name")` 装饰器自动注册。配置文件中只需指定 `type` 字段，框架即可通过注册表动态实例化对应组件。这种模式避免了硬编码依赖，使得第三方扩展极其便利。

---

## 4. Agent 层设计

`BaseAgent` 是所有 Agent 的基类，基于 Pydantic BaseModel 构建，关键属性包括：

| 属性 | 类型 | 说明 |
|------|------|------|
| `name` | str | Agent 名称 |
| `llm` | BaseLLM | LLM 后端实例 |
| `output_parser` | OutputParser | 输出解析器 |
| `memory` | BaseMemory | 记忆模块（默认 ChatHistoryMemory） |
| `memory_manipulator` | BaseMemoryManipulator | 记忆操作器 |
| `role_description` | str | 角色描述（人设） |
| `prompt_template` | str | 提示词模板 |
| `receiver` | Set[str] | 消息接收者集合（默认 {"all"}） |

Agent 提供同步 `step()` 和异步 `astep()` 两个核心方法，以及 `add_message_to_memory()` 用于维护对话历史。

**Task-Solving 模式的 Agent 角色分工**：
- `RoleAssignerAgent`：根据任务动态分配角色
- `SolverAgent`：执行具体求解
- `CriticAgent`：提供批评和改进建议
- `EvaluatorAgent`：评估方案质量
- `ExecutorAgent`：执行具体操作（如代码运行）
- `ManagerAgent`：协调管理整个流程

**Simulation 模式的 Agent**：
- `ConversationAgent`：对话型 Agent
- `ToolAgent`：带工具使用的 Agent
- 场景专用 Agent（如 `ProfessorAgent`、`StudentAgent`、`PoliceAgent`、`PrisonerAgent`）

---

## 5. 环境层设计（Environment）

`BaseEnvironment` 定义了环境的核心接口：

```python
class BaseEnvironment(BaseModel):
    agents: List[BaseAgent]      # 参与的 Agent 列表
    rule: BaseRule               # 环境规则
    max_turns: int = 10          # 最大轮次
    cnt_turn: int = 0            # 当前轮次
    last_messages: List[Message] # 上一轮消息
    rule_params: Dict = {}       # 规则参数

    async def step(self) -> List[Message]: ...   # 执行一步
    def reset(self) -> None: ...                 # 重置环境
    def is_done(self) -> bool: ...               # 是否结束
```

环境的核心抽象是 **Rule 系统**，将环境行为分解为五个可配置组件：

1. **Order（发言顺序）**：`sequential`（顺序）、`random`（随机）、`concurrent`（并发）等
2. **Visibility（可见性）**：控制哪些消息对哪些 Agent 可见
3. **Describer（环境描述器）**：每轮为每个 Agent 提供环境描述
4. **Selector（选择器）**：筛选本轮参与的 Agent
5. **Updater（更新器）**：将消息更新到 Agent 的记忆中

这种五组件抽象使得同一套 Agent 配置可以适用于完全不同的交互模式——只需替换 Rule 配置即可从"顺序对话"切换到"举手发言"或"分组讨论"。

---

## 6. 消息与通信机制

AgentVerse 的消息系统基于 `Message` 类，支持定向通信。Agent 的 `receiver` 属性定义了消息的接收范围：

- `{"all"}`：广播给所有 Agent
- `{"agent_name"}`：定向发送给特定 Agent
- `{"group_a"}`：发送给特定分组

环境的 `Visibility` 规则决定了消息的实际可见性，即使 Agent A 发送给 "all"，环境规则也可以限制只有部分 Agent 能看到该消息。这种设计使得模拟场景中的信息不对称成为可能（如囚徒困境中两个囚犯无法看到对方的选择）。

---

## 7. LLM 抽象层

AgentVerse 通过 `BaseLLM` 抽象层支持多种 LLM 后端：

- **OpenAI API**：GPT-3.5-turbo、GPT-4、text-davinci-003
- **Azure OpenAI**：企业级部署
- **本地模型**：通过 FSChat/FastChat 支持 LLaMA、Vicuna 等本地模型
- **LangChain 集成**：通过 LangChain 扩展更多提供商

LLM 层还提供了 token 计数和费用追踪功能（`get_spend()` 方法），方便成本控制。

---

## 8. 记忆系统（Memory）

记忆系统分为两层：

- **BaseMemory**：底层记忆存储，管理对话历史
- **BaseMemoryManipulator**：记忆操作器，对记忆进行筛选、压缩、摘要等操作

默认实现为 `ChatHistoryMemory`，按时间顺序保存所有消息。项目规划中提到将支持"更复杂的对话历史记忆"，但截至当前版本，记忆系统仍以全量历史为主，缺乏长期记忆和向量检索能力。这与 AutoGen、CrewAI 等框架相比是一个明显的短板。

---

## 9. 任务配置与输出解析

任务定义完全通过 **YAML 配置文件**驱动，存放在 `agentverse/tasks/` 目录下：

```yaml
environment:
  env_type: basic
  max_turns: 10
  rule:
    order:
      type: sequential
    visibility:
      type: basic

agents:
  - agent_type: conversation_agent
    name: Professor
    role_description: "An NLP professor..."
    llm:
      llm_type: text-davinci-003
      temperature: 0.7
```

每个任务还需定义 `OutputParser`，用于从 Agent 的自由文本输出中提取结构化信息（如动作类型、动作输入）。解析器通过 `@output_parser_registry.register('parser_name')` 注册。

这种"配置即任务"的设计使得新增场景无需编写业务代码，只需编写 YAML 配置和输出解析器即可。

---

## 10. 与同类框架对比

| 维度 | AgentVerse | AutoGen | CrewAI | MetaGPT | ChatDev |
|------|-----------|---------|--------|---------|---------|
| **核心定位** | 双模式（任务+模拟） | 对话驱动 | 角色协作 | SOP 驱动 | 软件开发 |
| **模拟支持** | ✅ 完整 | ❌ | ❌ | ❌ | ❌ |
| **动态角色分配** | ✅ RoleAssigner | ❌ | 手动 | 预定义 | 预定义 |
| **环境建模** | 丰富（五组件抽象） | 简单 | 简单 | 流程化 | 流程化 |
| **涌现行为研究** | ✅ 核心目标 | ❌ | ❌ | ❌ | ❌ |
| **工具集成** | ✅ BMTools/XAgent | ✅ | ✅ | ✅ | ✅ |
| **本地模型** | ✅ FastChat | ✅ | ✅ | ✅ | ✅ |
| **记忆系统** | 基础（ChatHistory） | 丰富 | 中等 | 中等 | 基础 |

**AgentVerse 的独特优势**：
1. **双模式统一**：唯一同时支持任务求解和行为模拟的框架
2. **环境抽象深度**：五组件 Rule 系统提供了最灵活的环境配置能力
3. **涌现行为研究**：专门设计用于观察多 Agent 交互中的涌现现象
4. **学术影响力**：ICLR 2024 论文，NVIDIA 官方推荐

**局限性**：
1. 记忆系统相对简单，缺乏向量检索和长期记忆
2. 文档和教程仍在规划中，上手门槛较高
3. 项目维护活跃度下降（最近更新集中在 2023-2024）
4. 缺乏生产级的错误恢复和重试机制

---

## 总结

AgentVerse 的架构设计体现了清晰的学术导向：通过环境-智能体的解耦抽象，将多智能体协作问题转化为可配置的环境模拟问题。其五组件 Rule 系统和注册表机制为框架的可扩展性奠定了坚实基础。双模式设计使其既能服务于工程应用（如软件开发团队模拟），也能支撑社会行为研究（如课堂互动、囚徒困境中的合作与背叛涌现）。

对于 OpenMate 而言，AgentVerse 的以下设计值得借鉴：
1. **环境五组件抽象**：将通信规则、发言顺序、可见性分离为独立可配置组件
2. **注册表模式**：通过装饰器实现零侵入式的组件注册与发现
3. **YAML 驱动的任务定义**：配置即任务，降低新增场景的开发成本
4. **动态角色分配**：RoleAssigner 模式可根据任务自动组建最优团队
