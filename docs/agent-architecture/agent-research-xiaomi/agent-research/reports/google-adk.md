# google/adk-python 架构调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/google/adk-python |
| 语言 | Python 3.10+（另有 Java/Kotlin/Go/TypeScript） |
| License | Apache-2.0 |
| 定位一句话 | **Code-first Agent 开发套件**：图执行 Workflow 运行时 + 层级多 Agent + Task API 委派，优化 Gemini 但模型无关 |
| 商业 | Google Cloud Vertex AI Agent Engine；Cloud Run 部署 |
| 文档 | google.github.io/adk-docs/ |

> 对 openmate：ADK 2.0 把「**确定性图执行**」与「**Agent 委派**」拆成两个一等公民（Workflow vs Task API），并支持无代码 Agent Config。openmate 若需要「可测试、可版本化、可部署到容器」的 Agent 工程基座，ADK 的分层很清晰。

---

## 1. 系统架构

### 1.1 两个一等公民

```
┌─────────────────────────────────────────────────────┐
│ Workflow（图执行引擎）                                 │
│  edges 定义确定性流：路由、扇出/扇入、循环、重试          │
│  状态管理、动态节点、HITL、嵌套 Workflow                 │
├─────────────────────────────────────────────────────┤
│ Agent（AI 执行体）                                     │
│  instruction + tools + model                         │
│  可作为 Workflow 节点，也可通过 Task API 委派            │
├─────────────────────────────────────────────────────┤
│ Task API（结构化 A2A 委派）                            │
│  多轮任务模式 / 单轮受控输出 / 混合委派 / HITL            │
├─────────────────────────────────────────────────────┤
│ Session / State / Events / Memory / Artifacts        │
└─────────────────────────────────────────────────────┘
```

### 1.2 快速示例

```python
from google.adk import Agent, Workflow

generate_fruit_agent = Agent(
    name="generate_fruit_agent",
    instruction="Return the name of a random fruit. Return only the name.",
)
generate_benefit_agent = Agent(
    name="generate_benefit_agent",
    instruction="Tell me a health benefit about the specified fruit.",
)
root_agent = Workflow(
    name="root_agent",
    edges=[("START", generate_fruit_agent, generate_benefit_agent)],
)
```

**CLI**：
```bash
adk run path/to/my_agent
adk web path/to/agents_dir
adk eval <agent> <evalset.json>
adk deploy docker --with_ui <agent-folder>
adk deploy cloud_run --with_ui <agent-folder>
```

### 1.3 ADK 2.0 破坏性变更

- Agent API、事件模型、Session schema 均有 breaking change
- ADK 2.0 生成的 session 可被 ADK 1.28+ 读取（多余字段忽略），但与更早 1.x 不兼容

---

## 2. 核心机制深潜

### 2.1 Workflow 图执行引擎

| 能力 | 说明 |
|---|---|
| 路由 | 基于前序结果选择后续边 |
| 扇出/扇入 | 并行分支与汇合 |
| 循环 | 条件循环节点 |
| 重试 | 节点级重试策略 |
| 状态管理 | 工作流级共享状态 |
| 动态节点 | 运行时决定节点 |
| HITL | 人工介入暂停点 |
| 嵌套 Workflow | 可组合子图 |

**edges 语法**：`("START", agent_a, agent_b)` 表示 START → a → b 的链。

### 2.2 Task API（结构化委派）

- **多轮任务模式**：委派方与被委派方多轮交互直至完成
- **单轮受控输出**：一次调用返回受 schema 约束的结果
- **混合委派**：同一流程内混用多轮与单轮
- **Task Agent 作为 Workflow 节点**：任务 Agent 可嵌入图

### 2.3 模块化多 Agent 系统

- 多个专业化 Agent 组合成灵活层级
- 根 Agent 可委派到子 Agent，形成树
- 支持 Agent Config（无代码定义 Agent）

### 2.4 工具生态

| 来源 | 说明 |
|---|---|
| 预置工具 | 内置搜索、代码执行等 |
| 自定义函数 | Python 函数即工具 |
| OpenAPI Spec | 由规范生成工具 |
| MCP | 原生 MCP 工具集成 |
| Google 生态 | 深度整合 Google 服务 |
| Tool Confirmation | 工具执行前 HITL 确认流，可要求自定义输入 |

### 2.5 状态、会话与事件

| 概念 | 说明 |
|---|---|
| Session | 2.0 新 schema；标识一次对话线程 |
| State | Agent/Workflow 共享状态，随事件演进 |
| Event | 统一事件模型（2.0 重构）；驱动 UI 与回放 |
| Plugin | 插件系统扩展运行时行为 |
| Memory | 会话记忆（详见 docs/guides） |
| Artifacts | 产出物管理 |

### 2.6 评估与测试

```bash
adk eval samples_for_testing/hello_world hello_world_eval_set_001.evalset.json
```

- 内置 evalset JSON 格式
- 支持批量评估与回归
- ADK Web UI 内可调试、评估、演示

### 2.7 部署与生产

| 通道 | 命令/方式 |
|---|---|
| Docker | `adk deploy docker --with_ui` |
| Cloud Run | `adk deploy cloud_run --with_ui` |
| Vertex AI Agent Engine | 无缝扩展 |
| 容器化 | 自行构建镜像部署任意平台 |

**约束文件**：官方提供 `constraints-3.10.txt` 到 `constraints-3.14.txt` 保护传递依赖。

**环境变量**：支持 `.env` 或 `--env` 注入。

### 2.8 恢复语义

- Session 持久化使对话可跨请求恢复
- Workflow 图执行的确定性意味着同一输入可重放
- 细粒度断点恢复依赖部署平台（Vertex/Cloud Run 的会话存储）
- 框架层无 MetaGPT 式「删除未完成消息重触发」机制

---

## 3. 对 openmate 的借鉴

| 维度 | 借鉴点 |
|---|---|
| Workflow vs Task 分离 | 确定性图编排与模型驱动委派职责清晰，避免混在一个抽象里 |
| edges 声明式 | 简单的元组边定义即可表达链式流，上手成本低 |
| Tool Confirmation | 工具级 HITL 确认流是生产安全的最小阻塞单元 |
| 多语言 | Python/Java/Kotlin/Go/TS 全线，适合多端统一 |
| evalset | 内置评估格式与 CLI，回归测试友好 |
| Agent Config | 无代码定义 Agent，适合运营侧自助配置 |
| 局限 | 文档站部分路径不稳定；恢复粒度依赖平台而非框架 |

---

## 4. 版本与生态快照（截至 2026-09）

- ADK 2.0：Workflow Runtime + Task API 为最大增量
- 节奏：约双周发版
- 姊妹仓库：adk-samples、adk-web、adk-python-community
- 社区：Reddit r/agentdevelopmentkit、Google Group、定期社区会议
- 提供 `llms.txt` / `llms-full.txt` 供 LLM 编码代理使用
