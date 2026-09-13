# DeepAgents

## 概述

DeepAgents 是一个深度Agent框架。

**仓库**: https://github.com/langchain-ai/deepagents | **语言**: Python

## 核心架构

> **项目**: langchain-ai/deepagents
> **定位**: 开源 Agent Harness（智能体运行框架）
> **许可证**: MIT
> **技术栈**: Python / LangGraph / LangChain
> **灵感来源**: Claude Code — 试图提炼其通用性并推向更远

DeepAgents 自我定位为 **"batteries-included agent harness"** —— 一个开箱即用、高度固执己见（opinionated）的智能体运行框架。它的核心设计理念可以用四句话概括：

- **固执己见** — 默认配置针对长周期、多步骤任务优化，而非追求最大灵活性
- **可扩展** — 任何组件都可以覆盖或替换，无需 fork 代码
- **模型无关** — 支持所有具备 tool calling 能力的 LLM（前沿 API、开源权重、本地部署）
- **生产就绪** — 构建在 LangGraph 之上，具备流式传输、持久化、检查点能力

与 LangChain 生态的关系是层级式的：**LangGraph** 是底层图运行时 → **LangChain `create_agent`** 是轻量 agent harness → **DeepAgents** 是更重的 opinionated harness。三者可组合使用，任何 LangGraph `CompiledStateGraph` 都可以作为 DeepAgents 的子智能体传入。

这种分层设计体现了"渐进式复杂度"的工程哲学：需要轻量控制时用 LangGraph，需要标准 harness 时用 LangChain，需要全套开箱能力时用 DeepAgents。

DeepAgents 的架构围绕四大能力域组织，每个域对应一个独立的中间件层：

DeepAgents 的核心架构模式是 **中间件栈（Middleware Stack）**。每个能力域对应一个中间件组件：

| 中间件 | 职责 | 可配置性 |
|--------|------|---------|
| `FilesystemMiddleware` | 虚拟文件系统操作 | 可限制工具子集，不可移除 |
| `SubAgentMiddleware` | 子智能体委托 | 可禁用，不可移除 |
| `TodoListMiddleware` | 任务计划（v0.7+ 可选） | 可选加入 |
| Skills 中间件 | 按需加载技能 | 自动管理 |
| Memory 中间件 | 持久化上下文 | 通过 `AGENTS.md` 配置 |

关键设计约束：`FilesystemMiddleware` 和 `SubAgentMiddleware` 是 **不可移除的基础设施**。试图通过 `excluded_middleware` 移除它们会抛出错误。这种"强制保留"的设计确保了 agent 始终具备基本的文件操作和任务委托能力。

虚拟文件系统是 DeepAgents 的核心基础设施之一，提供 8 个标准工具：

| 工具 | 功能 |
|------|------|
| `ls` | 列出目录及元数据（大小、修改时间） |
| `read_file` | 读取文件内容，支持 offset/limit，支持多模态 |
| `write_file` | 创建或覆盖文件 |
| `edit_file` | 精确字符串替换（支持全局替换） |
| `delete` | 删除文件或递归删除目录（v0.7+） |
| `glob` | 通配符模式搜索 |
| `grep` | 内容搜索（仅文件名/带上下文/仅计数） |
| `execute` | Shell 命令执行（仅沙箱后端） |

后端通过 `FilesystemMiddleware(backend=...)` 注入，支持：
- **内存后端** — 开发测试用
- **本地磁盘** — 直接操作宿主文件系统
- **LangGraph Store** — 持久化存储
- **沙箱后端** — 隔离环境执行

权限系统采用 **声明式规则列表**，每条规则包含 `operations`（read/write）、`paths`（glob 模式）、`mode`（allow/deny），按声明顺序首匹配优先。

技能系统遵循 [Agent Skills 标准](https://agentskills.io/)，每个技能是一个目录，包含：

- `SKILL.md` — 技能定义文件（YAML frontmatter + Markdown 正文）
- 脚本、模板、参考文档等支持资源

**渐进

## 关键技术

DeepAgents 的架构围绕四大能力域组织，每个域对应一个独立的中间件层：

DeepAgents 的核心架构模式是 **中间件栈（Middleware Stack）**。每个能力域对应一个中间件组件：

| 中间件 | 职责 | 可配置性 |
|--------|------|---------|
| `FilesystemMiddleware` | 虚拟文件系统操作 | 可限制工具子集，不可移除 |
| `SubAgentMiddleware` | 子智能体委托 | 可禁用，不可移除 |
| `TodoListMiddleware` | 任务计划（v0.7+ 可选） | 可选加入 |
| Skills 中间件 | 按需加载技能 | 自动管理 |
| Memory 中间件 | 持久化上下文 | 通过 `AGENTS.md` 配置 |

关键设计约束：`FilesystemMiddleware` 和 `SubAgentMiddleware` 是 **不可移除的基础设施**。试图通过 `excluded_middleware` 移除它们会抛出错误。这种"强制保留"的设计确保了 agent 始终具备基本的文件操作和任务委托能力。

子智能体是 DeepAgents 实现任务分解的核心机制，通过内置的 `task` 工具暴露给模型：

- **全新上下文** — 每次调用创建独立的 agent 实例
- **自主执行** — 子智能体独立运行直到完成
- **单次交接** — 最终返回一份报告给主智能体
- **无状态消息** — 子智能体不能发送多条消息回主智能体
- **上下文隔离** — 重型子任务被隔离，结果被压缩

支持两种子智能体模式：
1. **默认通用子智能体** — 内置的 general-purpose 子智能体（默认启用）
2. **自定义子智能体** — 通过声明式配置定义专门化子智能体

任何 LangGraph `CompiledStateGraph` 都可以作为子智能体传入，这意味着自定义编排逻辑可以无缝嵌入 DeepAgents 的默认 harness。

内置的 offloading 和 summarization 机制自动压缩对话历史和大型中间结果。

通过虚拟文件系统中的持久化存储跨线程携带信息。

**Prompt Caching** 是一个亮点：对 Anthropic 和 Bedrock 模型，系统提示中的静态部分（基础指令、记忆、技能内容）自动启用缓存，避免跨调用重复处理相同 token，降低延迟和成本。

DeepAgents 的安全模型遵循 **"trust the LLM"** 原则 —— agent 可以做其工具允许的一切操作。安全边界在工具/沙箱层面强制执行，而非依赖模型自我约束。

Human-in-the-loop 通过 `interrupt_on` 参数实现：

```python
agent = create_deep_agent(
    model="openai:gpt-5.5",
    interrupt_on={"edit_file": True, "execute": True},
)
```

支持三种响应方式：批准执行、添加指导、修改工具输入。这为破坏性操作、昂贵 API 调用和交互式调试提供了运行时安全控制层。

---

## 对openmate的启示

> 仓库: https://github.com/langchain-ai/deepagents  
> 抓取通道: cdn.jsdelivr.net/gh/langchain-ai/deepagents@main  
> 版本快照: main @ 2026-09-13；文件树 346 files  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供「深度编码 Agent」中间件栈 / 虚拟文件系统 / 摘要 / 子 Agent / HITL 借鉴

---

| 维度 | openclaw | deepagents |
|------|----------|------------|
| 循环 | embedded-agent-runner | LangGraph + AgentMiddleware |
| 压缩 | compaction safeguard + context pruning | fraction 0.85 summarization |
| 工具策略 | sandbox + approvals | FilesystemPermission + HITL |
| checkpoint | SQLite per agent | LangGraph Checkpointer |
| checkpoint 优化 | 未在参考中提及 O(N²) | **DeltaChannel O(N)** |
| 技能 | Skills Loader + Workshop | SkillsMiddleware + SKILL.md |

deepagents 的 DeltaChannel 是 openclaw 报告中未覆盖的优化点，值得 openmate 借鉴。

---

| 需求 | deepagents 机制 | 可复用度 |
|------|-----------------|----------|
| 编码 Agent 循环 | FilesystemMiddleware 工具面 | **高** |
| checkpoint 体积 | DeltaChannel O(N) | **高** |
| 自动压缩 | trigger fraction 0.85 | 高 |
| 危险写 HITL | FilesystemPermission → interrupt | 高 |
| 子任务委派 | SubAgent / AsyncSubAgent | 高 |
| 技能包 | SkillsMiddleware + SKILL.md | 高 |
| 与 LangGraph 解耦 | 强依赖 | 中 |

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（92-deepagents.md）
- MiMo报告（deepagents-l1.md）
- MiMo卡片（deepagents.md）
