# AgentVerse

## 概述

AgentVerse 是一个Agent协作平台。

**仓库**: https://github.com/OpenBMB/AgentVerse | **语言**: Python | **License**: Apache-2.0

## 核心架构

> **项目地址**: https://github.com/OpenBMB/AgentVerse
> **论文**: [AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors in Agents](https://arxiv.org/abs/2308.10848)
> **Star**: 5,120+ | **Fork**: 516+ | **License**: Apache-2.0 | **语言**: Python 3.9+
> **ICLR 2024 接收** | NVIDIA 官方博客推荐

AgentVerse 是清华大学 OpenBMB 团队开发的多智能体协作框架，旨在简化多个 LLM Agent 的部署与协作。其核心创新在于将多智能体系统抽象为**任务求解（Task-Solving）**和**行为模拟（Simulation）**两大框架，并通过高度模块化的设计实现灵活扩展。

AgentVerse 的架构围绕两条主线展开：

- **Task-Solving 模式**：将多个 Agent 组装为自动化的多智能体系统，协作完成特定任务（如软件开发、咨询系统、代码生成）。核心流程为：**任务分解 → 角色分配 → 多轮讨论 → 执行评估**。
- **Simulation 模式**：允许用户自定义环境，观察多个 Agent 之间的行为涌现和社会交互（如课堂模拟、囚徒困境、Pokemon 游戏）。核心流程为：**环境初始化 → 轮次推进 → 行为观察 → 交互记录**。

两条模式共享底层的 Agent、LLM、Memory 基础设施，但环境层和规则层完全独立。这种分离设计使得研究者可以专注于行为模拟的学术探索，而工程团队可以利用任务求解模式构建生产级系统。

项目目录结构清晰体现了模块化思想：

[详见源码]

每个模块通过 `Registry` 注册表实现松耦合，新增组件只需装饰器注册即可被框架发现和构建。

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

`BaseEnvironment` 定义了环境的核心接口：

```python
class BaseEnvironment(BaseModel):
    agents: List[BaseAgent]      # 参与的 Agent 列表
    rule: BaseRule               # 环境规则
    max_turns: int = 10          # 最大轮次
    cnt_turn: int = 0          

## 关键技术

项目目录结构清晰体现了模块化思想：

[详见源码]

每个模块通过 `Registry` 注册表实现松耦合，新增组件只需装饰器注册即可被框架发现和构建。

AgentVerse 的核心扩展机制是基于装饰器的**注册表模式**：

[详见源码]yaml
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

## 对openmate的启示

> 仓库: https://github.com/OpenBMB/AgentVerse  
> 抓取通道: cdn.jsdelivr.net/gh/OpenBMB/AgentVerse@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供双框架（task-solving / simulation）/ 五规则环境 / 多 Agent 借鉴

---

| 需求 | AgentVerse 机制 | 可复用度 |
|------|----------------|----------|
| 双框架分离 | task-solving vs simulation | **高** |
| 环境五规则 | Describer/Order/Selector/Updater/Visibility | **高** |
| Order 类型 | random/sequential/concurrent | **高** |
| 可见性过滤 | Visibility + Updater 只更新可见者 | **高** |
| 无效消息过滤 | Selector | **高** |
| config.yaml 声明环境 | environment+agents+rule | **高** |
| output parser 注册表 | @output_parser_registry.register | **高** |
| memory_type | chat_history | 中 |
| 多 LLM 后端 | OpenAI/Azure/vLLM/FSChat | **高** |
| ToolServer 外置 | XAgent ToolServer | 中 |
| BMTools 可选 | 带工具 simulation | 中 |
| GUI | Gra

```python
class Environment:
    describer: Describer   # 每回合每 agent 描述
    order: Order           # random|sequential|concurrent
    selector: Selector     # 过滤无效输出
    updater: Updater       # 更新可见者记忆
    visibility: Visibility # 可见列表
```

openmate:
- 五组件可插拔
- 默认 basic 实现
- 自定义通过 config 注入

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（83-agentverse.md）
- MiMo报告（agentverse-l1.md）
- MiMo卡片（agentverse.md）
