# 92 - DeepAgents 架构深度分析

> **项目**: langchain-ai/deepagents
> **定位**: 开源 Agent Harness（智能体运行框架）
> **许可证**: MIT
> **技术栈**: Python / LangGraph / LangChain
> **灵感来源**: Claude Code — 试图提炼其通用性并推向更远

---

## 1. 项目定位与设计哲学

DeepAgents 自我定位为 **"batteries-included agent harness"** —— 一个开箱即用、高度固执己见（opinionated）的智能体运行框架。它的核心设计理念可以用四句话概括：

- **固执己见** — 默认配置针对长周期、多步骤任务优化，而非追求最大灵活性
- **可扩展** — 任何组件都可以覆盖或替换，无需 fork 代码
- **模型无关** — 支持所有具备 tool calling 能力的 LLM（前沿 API、开源权重、本地部署）
- **生产就绪** — 构建在 LangGraph 之上，具备流式传输、持久化、检查点能力

与 LangChain 生态的关系是层级式的：**LangGraph** 是底层图运行时 → **LangChain `create_agent`** 是轻量 agent harness → **DeepAgents** 是更重的 opinionated harness。三者可组合使用，任何 LangGraph `CompiledStateGraph` 都可以作为 DeepAgents 的子智能体传入。

这种分层设计体现了"渐进式复杂度"的工程哲学：需要轻量控制时用 LangGraph，需要标准 harness 时用 LangChain，需要全套开箱能力时用 DeepAgents。

---

## 2. 核心架构分层

DeepAgents 的架构围绕四大能力域组织，每个域对应一个独立的中间件层：

### 执行环境（Execution Environment）
- **Tools** — 自定义函数、API、数据库调用
- **Virtual Filesystem** — 可插拔后端的文件操作（内存、本地磁盘、LangGraph Store、远程沙箱）
- **Filesystem Permissions** — 声明式访问控制（glob 模式 + allow/deny 规则 + 首匹配优先）
- **Code Execution** — 沙箱 Shell 执行 + 进程内 QuickJS JavaScript 解释器

### 上下文管理（Context Management）
- **Skills** — 按需加载的领域知识包（遵循 Agent Skills 标准）
- **Memory** — 通过 `AGENTS.md` 文件加载的持久化指令与偏好
- **Summarization & Offloading** — 自动压缩对话历史和大型工具输出
- **Prompt Caching** — 静态 prompt 段缓存（Anthropic/Bedrock 自动启用）

### 委托（Delegation）
- **Task Planning** — 可选的 `write_todos` 工具，结构化任务追踪
- **Subagents** — 临时子智能体，隔离上下文窗口执行子任务

### 控制（Steering）
- **Human-in-the-loop** — 基于 LangGraph interrupts 的人工审批机制
- **Permissions** — 文件系统级声明式权限控制

---

## 3. 中间件架构（Middleware Architecture）

DeepAgents 的核心架构模式是 **中间件栈（Middleware Stack）**。每个能力域对应一个中间件组件：

| 中间件 | 职责 | 可配置性 |
|--------|------|---------|
| `FilesystemMiddleware` | 虚拟文件系统操作 | 可限制工具子集，不可移除 |
| `SubAgentMiddleware` | 子智能体委托 | 可禁用，不可移除 |
| `TodoListMiddleware` | 任务计划（v0.7+ 可选） | 可选加入 |
| Skills 中间件 | 按需加载技能 | 自动管理 |
| Memory 中间件 | 持久化上下文 | 通过 `AGENTS.md` 配置 |

关键设计约束：`FilesystemMiddleware` 和 `SubAgentMiddleware` 是 **不可移除的基础设施**。试图通过 `excluded_middleware` 移除它们会抛出错误。这种"强制保留"的设计确保了 agent 始终具备基本的文件操作和任务委托能力。

---

## 4. 文件系统抽象与后端设计

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

---

## 5. 子智能体（Subagents）机制

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

---

## 6. 上下文工程（Context Engineering）

DeepAgents 的上下文管理是其区别于轻量 agent 框架的关键能力，分为四层：

### 输入上下文
系统提示 + 记忆 + 技能 + 工具提示构成初始上下文。

### 压缩机制
内置的 offloading 和 summarization 机制自动压缩对话历史和大型中间结果。

### 隔离机制
子智能体将重型子任务隔离在独立上下文中，仅返回最终结果。

### 长期记忆
通过虚拟文件系统中的持久化存储跨线程携带信息。

**Prompt Caching** 是一个亮点：对 Anthropic 和 Bedrock 模型，系统提示中的静态部分（基础指令、记忆、技能内容）自动启用缓存，避免跨调用重复处理相同 token，降低延迟和成本。

---

## 7. 技能系统（Skills）

技能系统遵循 [Agent Skills 标准](https://agentskills.io/)，每个技能是一个目录，包含：

- `SKILL.md` — 技能定义文件（YAML frontmatter + Markdown 正文）
- 脚本、模板、参考文档等支持资源

**渐进式披露（Progressive Disclosure）** 是关键设计：agent 启动时仅读取 `SKILL.md` 的 frontmatter（名称和描述），完整内容仅在任务需要时才加载。这保持了启动上下文的紧凑性，同时在需要时提供丰富能力。

---

## 8. 模型无关与 MCP 支持

DeepAgents 支持任何具备 tool calling 能力的 LLM：
- **前沿 API** — OpenAI、Anthropic、Google
- **开源权重** — Baseten、Fireworks 等托管服务
- **本地部署** — Ollama、vLLM、llama.cpp

通过 LangChain 的 chat model 抽象统一接入。

**MCP（Model Context Protocol）** 支持是另一个重要特性：可以通过 MCP 服务器连接数据库、API、文件系统等，使用标准接口。这使得 DeepAgents 可以无缝接入任何 MCP 生态工具。

---

## 9. Human-in-the-Loop 与安全模型

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

## 10. 生态定位与竞品对比

DeepAgents 在 LangChain 生态中的位置：

```
LangGraph (图运行时)
  └── LangChain create_agent (轻量 harness)
        └── DeepAgents (opinionated harness)
              └── DeepAgents Code (预构建编码 agent，类似 Claude Code)
```

与竞品的关键差异：

| 维度 | DeepAgents | Claude Code | Cursor |
|------|-----------|-------------|--------|
| 开源 | ✅ MIT | ❌ | ❌ |
| 模型无关 | ✅ 任意 LLM | ❌ Claude only | 部分 |
| 可扩展性 | 中间件可替换 | 有限 | 有限 |
| 子智能体 | ✅ 内置 | ✅ | ❌ |
| 持久化 | LangGraph 检查点 | 有限 | 有限 |
| MCP 支持 | ✅ | ✅ | ✅ |

**DeepAgents Code** 是其预构建的终端编码 agent，安装方式为 `curl -LsSf https://langch.in/dcode | bash`，定位为 Claude Code 和 Cursor 的开源替代品。

---

## 总结

DeepAgents 代表了一种"中间道路"的 agent 架构思路 —— 既不像 AutoGPT 那样激进地全自动，也不像 LangChain 那样提供纯原语。它通过中间件栈的方式将文件系统、子智能体、上下文管理、技能等能力模块化，每个模块可配置但核心不可移除。这种设计在"开箱即用"和"可定制"之间找到了平衡点。

其最大的架构亮点是：(1) 渐进式技能加载的上下文工程；(2) 中间件栈的可组合性；(3) 子智能体的隔离执行模型；(4) 与 LangGraph 生态的深度集成。对于需要构建生产级长周期 agent 的团队，DeepAgents 提供了一个比从 LangGraph 原语组装更高效的起点。
