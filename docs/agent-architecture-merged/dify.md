# Dify

## 概述

Dify 是一个LLM应用开发平台。

**仓库**: https://github.com/langgenius/dify | **语言**: Python

## 核心架构

> 基于 [langgenius/dify](https://github.com/langgenius/dify) 源码分析（154k+ Stars，24.4k Forks）
> 分析源码：`api/core/agent/base_agent_runner.py`、`api/core/agent/cot_agent_runner.py`、`api/core/tools/tool_manager.py`

Dify 的 Agent 采用清晰的三层继承结构：`AppRunner → BaseAgentRunner → CotAgentRunner`。

```python

Dify 的插件系统通过 `PluginToolProviderController` 实现，使用双重检查锁保证线程安全：

```python

| 维度 | Dify 的设计 |
|------|------------|
| **继承体系** | `AppRunner → BaseAgentRunner → CotAgentRunner`，三层分离 |
| **推理模式** | ReAct 循环（Thought → Action → Observation），最大迭代可配置 |
| **工具系统** | 六种 Provider（内置/API/工作流/插件/MCP/数据集），统一 ToolManager 调度 |
| **凭证管理** | 加密存储 + 缓存 + OAuth 自动刷新（过期前 60s） |
| **可观测性** | 每步 Agent Thought 持久化，含 token/价格/工具标签 |
| **上下文管理** | 从 DB 重建历史 + AgentHistoryPromptTransform 压缩 |
| **参数系统** | VariablePool 动态绑定 + 模板解析 + 类型安全转换 |
| **插件架构** | 双重检查锁 + 上下文缓存，线程安全的 Provider 发现 |
| **流式处理** | `CotAgentOutputParser` 流式解析 ReAct 输出，实时发布 AgentThought 事件 |
| **错误处理** | 最大迭代保护、工具不存在兜底、凭证验证失败友好提示 |

Dify 的 Agent 架构体现了「平台级」设计思维：不是单一的 Agent 实现，而是一个可扩展的 Agent 运行时框架，通过清晰的抽象层支持多种推理策略和工具生态。

## 关键技术

1. **工作流即状态机**：把 agent 行为从"代码里的链"变成"画布上可版本化、可回放的 DAG"，非工程师可搭，工程师可运维。
2. **内置 RAG 引擎**：开箱即用的文档解析/切分/检索，免去自建。
3. **模型中性 + 自部署**：不锁死单一厂商，支持完全本地部署——企业落地友好。
4. **工程化 LLMOps**：从搭建到日志监控、prompt 迭代闭环一体。

> 本章据公开架构与 README 描述，未逐行读 `.py`，标注为文档级。

- **运行持久化 / 断点**：工作流每次执行产生 `workflow_run` 与逐 `node_execution` 记录（Dify 的标准设计），节点级入参出参落库——理论上支持执行回放/断点续跑。**具体恢复语义未读源码，推断。**
- **节点级容错**：条件分支(IF/ELSE)、迭代节点有界循环；代码执行节点跑在独立 **sandbox 服务**（docker-compose 中独立容器），与主进程隔离，崩溃不拖垮 api。
- **错误处理/降级**：工具/模型调用失败由节点错误处理策略捕获；多模型供应商可切换。**重试次数/退避参数未读源码。**
- **异步与边界**：异步任务经 worker（Celery 类队列）执行，避免阻塞 API；代码沙箱做资源隔离。
- **边界**：文档解析、输入校验由 RAG/API 层承担。

> 文档级，未读源码。

- **服务拆分**：docker-compose 把 api / web / worker / db(Postgres) / redis / 向量库 / sandbox 拆为独立容器，worker 独立扩容——这是典型的"主服务与执行 worker 分离"的高可用骨架。
- **缓存/队列**：Redis 承担缓存与队列；Postgres 持久化运行记录。
- **横向扩展**：提供 Helm Chart 支持 K8s 部署（README 致谢 dify-helm），说明设计上支持多副本水平扩展；无状态 API 可多实例。
- **可观测性**：内置"持续运营"日志/性能监控，应用日志可视化。
- **资源隔离**：代码执行 sandbox、多租户隔离。

> Dify 是"平台/工具"，其"进化"是**人在生产数据反馈下改进**，而非 agent 自主学习。

- **评估/反馈回路（半）**：README 的"Continuous Operations"——用生产日志与性能数据持续改进 prompt/数据集/模型。这是"数据→人工调优"的闭环，不是 agent 自动改自己。
- **记忆/反思**：Dify 的记忆体现为**应用级对话变量与会话存储**、外部知识数据集（RAG），而非 agent 自我反思；无内置 self-reflection 主循环。
- **工具学习**：插件市场 + 工具注册，用户/开发者手动添加工具，非自动发现。
- **结论**：Dify 把"进化"让渡给**平台使用者**（人工迭代 prompt/数据集），自身不做 agent 自我进化。这是平台型产品与个人常驻 agent（如 hermes）的本质分野。

## 对openmate的启示

> 仓库: https://github.com/langgenius/dify  
> 抓取通道: cdn.jsdelivr.net/gh/langgenius/dify@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供工作流引擎 / GraphEngine / 节点系统 / 变量池 借鉴

---

variable_mapping = node_cls.extract_variable_selector_to_variable_mapping(
    graph_config=workflow.graph_dict, config=node_config
)
variable_mapping = inject_default_system_variable_mappings(...)

[详见源码]

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（12-dify.md）
- 豆包（005_dify.md）
- MiMo报告（dify.md）
