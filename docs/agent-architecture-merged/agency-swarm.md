# Agency Swarm

## 概述

Agency Swarm 是一个多Agent协作框架。

**仓库**: https://github.com/VRSEN/agency-swarm | **语言**: Python

## 核心架构

> **项目**: [VRSEN/agency-swarm](https://github.com/VRSEN/agency-swarm)
> **定位**: 基于 OpenAI Agents SDK 的多智能体编排框架
> **许可证**: MIT
> **版本**: v1.x（完全重写，基于 OpenAI Agents SDK）
> **语言**: Python 3.12+

Agency Swarm 的设计哲学源于一个直觉类比：**将 AI 多智能体系统映射为现实世界的组织架构**。框架的创始人 Arsenii Shatokhin（VRSEN）提出，通过"公司组织结构"的隐喻来构建 AI 代理机构，使代理之间的协作关系对开发者和用户都更加直观。

这一理念体现在三个核心原则上：

1. **角色专业化**：每个 Agent 拥有明确的职责描述（如 CEO、Developer、Virtual Assistant），就像公司中的岗位分工
2. **层级化通信**：Agent 之间的通信路径通过显式的 `communication_flows` 定义，模拟组织中的汇报关系
3. **自主性与可控性平衡**：Agent 在护栏（guardrails）内自主决策，同时人类可以通过入口 Agent 直接干预

v1.x 版本是基于 OpenAI Agents SDK 的完全重写，从 v0.x 的 Assistants API 黑盒模式转向了更透明、更可控的架构。

Agency Swarm 的架构分为四层：

[详见源码]

**Agency** 是顶层编排器，管理一组 Agent 实例，定义它们之间的通信规则，并提供对话持久化和运行入口。它本质上是一个"组织容器"。

**Agent** 是核心执行单元，封装了 OpenAI Agents SDK 的 `Agent` 类，增加了指令管理、工具加载、文件上传等能力。

**Tool** 是 Agent 执行动作的手段，支持三种定义方式：`@function_tool` 装饰器、`BaseTool` 类、OpenAPI Schema 转换。

Agent 类是框架的核心构建块，每个 Agent 封装了以下关键属性：

| 属性 | 说明 |
|------|------|
| `name` | Agent 名称，用于标识和通信 |
| `instructions` | 系统提示词，可以是字符串或指向 `.md` 文件的路径，也支持动态生成函数 |
| `description` | 角色描述，供其他 Agent 了解该 Agent 的能力 |
| `model` | 使用的模型（如 `gpt-5.6-luna`），支持通过 LiteLLM 路由到第三方模型 |
| `model_settings` | 模型调优参数（temperature、max_tokens、reasoning effort 等） |
| `tools` | 工具列表，支持混合使用 `@function_tool` 和 `BaseTool` |
| `tools_folder` / `files_folder` / `schemas_folder` | 从文件夹自动加载工具、文件和 OpenAPI Schema |
| `output_type` | 结构化输出类型（Pydantic 模型），用于强制 Agent 返回特定格式 |
| `output_guardrails` / `input_guardrails` | 输入输出护栏，替代了 v0.x 的 `response_validator` |

Agent 的关键设计决策：

- **指令与代码分离**：`instructions` 可以外置为 Markdown 文件，便于非技术人员编辑
- **文件夹约定**：通过 `tools_folder`、`schemas_folder` 等约定目录结构，实现工具的自动发现和加载
- **结构化输出**：通过 `output_type` 支持 Pydantic 模型，确保 Agent 返回可解析的数据结构
- **Reasoning 支持**：通过 `Reasoning(effort="medium")` 控制推理深度

Agency Swarm 的核心创新在于其**显式通信流**机制。Agent 之间的通信路径通过 `communication_flows` 参数在 Agency 创建时声明：

```python
agency = Agency(
    ceo,
    communication_flows=[
        ceo > dev,      # CEO 可以向 Developer 发起对话
 

## 关键技术

Agency Swarm 的设计哲学源于一个直觉类比：**将 AI 多智能体系统映射为现实世界的组织架构**。框架的创始人 Arsenii Shatokhin（VRSEN）提出，通过"公司组织结构"的隐喻来构建 AI 代理机构，使代理之间的协作关系对开发者和用户都更加直观。

这一理念体现在三个核心原则上：

1. **角色专业化**：每个 Agent 拥有明确的职责描述（如 CEO、Developer、Virtual Assistant），就像公司中的岗位分工
2. **层级化通信**：Agent 之间的通信路径通过显式的 `communication_flows` 定义，模拟组织中的汇报关系
3. **自主性与可控性平衡**：Agent 在护栏（guardrails）内自主决策，同时人类可以通过入口 Agent 直接干预

v1.x 版本是基于 OpenAI Agents SDK 的完全重写，从 v0.x 的 Assistants API 黑盒模式转向了更透明、更可控的架构。

Agency Swarm 的核心创新在于其**显式通信流**机制。Agent 之间的通信路径通过 `communication_flows` 参数在 Agency 创建时声明：

```python
agency = Agency(
    ceo,
    communication_flows=[
        ceo > dev,      # CEO 可以向 Developer 发起对话
        ceo > va,       # CEO 可以向 Virtual Assistant 发起对话
        dev > va        # Developer 可以向 Virtual Assistant 发起对话
    ],
)
```

`>` 运算符定义了**有向通信路径**——左侧 Agent 可以主动与右侧 Agent 通信，但反之不行。这模拟了组织中的汇报关系。

框架提供两种核心编排模式：

最简洁的方式，将普通函数转换为 Agent 工具。函数签名自动转换为参数 Schema，Docstring 作为工具描述。

基于 Pydantic 的类定义方式，适合需要复杂验证逻辑的工具。支持 `async def run()` 异步执行。字段通过 `Field` 定义并自动转换为参数描述。

## 对openmate的启示

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（38-agency-swarm.md）
