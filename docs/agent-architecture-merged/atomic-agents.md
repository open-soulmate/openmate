# Atomic Agents

## 概述

Atomic Agents 是一个模块化Agent框架。

**仓库**: https://github.com/BrainBlend-AI/atomic-agents | **语言**: Python

## 核心架构

> **项目**: [BrainBlend-AI/Atomic Agents](https://github.com/BrainBlend-AI/atomic-agents)（现维护者 Eigenwise）
> **定位**: 基于 Instructor + Pydantic 的模块化 AI Agent 框架
> **核心理念**: 用软件工程原则构建 AI 应用——Schema 驱动、类型安全、组件可替换
> **分析日期**: 2026-09-13

Atomic Agents 采用**"原子化"设计哲学**——将 Agent 系统拆解为最小可组合单元。与 LangChain 等"重量级框架"不同，它不提供预构建的 Chain/Agent 模板，而是提供一组**低层原语（primitives）**，开发者像搭乐高一样组合。

核心包结构：

[详见源码]

- **泛型绑定**：每个 Tool 明确声明输入/输出类型
- **Schema 即文档**：`tool_name` 和 `tool_description` 自动从 input_schema 的 JSON Schema 推导
- **可覆盖**：通过 `BaseToolConfig` 可以覆盖默认的 title/description
- **独立运行**：Tool 不依赖 Agent，可以单独测试和使用

Atomic Agents 支持多种编排模式，但**不提供内建的编排器**——编排逻辑由开发者在 Python 层面实现：

AtomicAgent 集成 Instructor 的 Hook 系统，支持细粒度的监控和错误处理：

```python
agent.register_hook("parse:error", handle_parse_error)
agent.register_hook("completion:kwargs", log_request)
agent.register_hook("completion:response", log_response)
```

支持的事件：
- `parse:error`：Pydantic 校验失败
- `completion:kwargs`：请求发送前
- `completion:response`：响应接收后
- `completion:error`：请求失败
- `completion:last_attempt`：最后一次重试

这使得生产环境的可观测性、重试逻辑、性能监控可以完全解耦于业务逻辑。

---

## 关键技术

Atomic Agents 最显著的特征是**所有交互都通过 Pydantic Schema 定义**。这是整个框架的基石。

[详见源码]python
class BaseTool[InputSchema: BaseIOSchema, OutputSchema: BaseIOSchema](ABC):
    @abstractmethod
    def run(self, params: InputSchema) -> OutputSchema:
        pass
```

Atomic Forge 是社区贡献的工具集合，采用**"非包"设计**——每个工具是一个可独立下载的文件夹，而非统一的 pip 包。包含：

- Tavily Search（网络搜索）
- 更多社区工具...

通过 **Atomic Assembler CLI** 管理工具的下载和集成。

通过 `Union[ToolAInput, ToolBInput]` 作为输出 schema，让 LLM 自主选择工具。Pydantic 的 discriminated union 保证类型安全路由。

## 对openmate的启示

对于 OpenMate 而言，Atomic Agents 的 Schema-First 理念和泛型 Tool 系统值得借鉴——特别是将 Pydantic schema 同时作为类型约束和 prompt 源的设计，可以显著减少 prompt 维护成本。

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（42-atomic-agents.md）
