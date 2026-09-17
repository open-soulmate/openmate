# 63. AgentGPT 架构分析

> **项目**: [reworkd/AgentGPT](https://github.com/reworkd/AgentGPT) (35.8k⭐, 已归档)
> **定位**: 浏览器端自主 AI Agent 组装、配置与部署平台
> **技术栈**: Next.js 13 + FastAPI + LangChain + Prisma/SQLModel + MySQL

---

## 1. 系统总览与双层架构

AgentGPT 采用经典的**前后端分离双层架构**，前端负责 Agent 运行循环的编排与 UI 交互，后端负责 LLM 调用、工具执行和持久化。

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Next.js 13 + TypeScript)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Zustand  │  │ Agent    │  │ Work Pipeline    │  │
│  │ Stores   │  │ RunModel │  │ (Work Items)     │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│         ↕ HTTP API calls                            │
├─────────────────────────────────────────────────────┤
│  Backend (FastAPI + Python)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Views    │  │ Agent    │  │ Tools            │  │
│  │ (Router) │  │ Service  │  │ (search/code/...)│  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│         ↕ LangChain → OpenAI API                   │
└─────────────────────────────────────────────────────┘
```

**关键设计决策**: Agent 的运行循环（autonomous loop）跑在**浏览器前端**，后端仅作为 LLM 代理和工具执行层。这意味着 Agent 的生命周期管理、任务队列、暂停/恢复逻辑全部由前端 TypeScript 代码控制。

---

## 2. Agent 运行循环（核心机制）

AgentGPT 的核心是一个 **Work Pipeline 模式**——`AutonomousAgent` 类维护一个 `workLog`（工作日志队列），按序执行工作单元。

```typescript
// autonomous-agent.ts 核心循环
async run() {
  this.model.setLifecycle("running");
  this.addTasksIfWorklogEmpty();
  while (this.workLog[0]) {
    if (this.model.getLifecycle() === "pausing") 
      this.model.setLifecycle("paused");
    if (this.model.getLifecycle() !== "running") return;
    
    const work = this.workLog[0];
    await this.runWork(work, () => this.model.getLifecycle() === "stopped");
    this.workLog.shift();
    await work.conclude();
    
    const next = work.next();
    if (next) this.workLog.push(next);
    this.addTasksIfWorklogEmpty();
  }
}
```

**生命周期状态机**: `offline → running ⇄ pausing ⇄ paused → stopped`

每个工作单元（AgentWork）是一个独立的步骤，执行完后可以通过 `next()` 链接下一个工作单元，形成流水线。初始工作单元是 `StartGoalWork`。

---

## 3. 工作单元模式（AgentWork 设计模式）

AgentGPT 定义了 7 种工作单元类型，每种封装一个原子操作：

| 工作单元 | 职责 | API 端点 |
|---------|------|---------|
| `StartGoalWork` | 根据目标生成初始任务列表 | `POST /api/agent/start` |
| `CreateTaskWork` | 根据执行结果生成后续任务 | `POST /api/agent/create` |
| `AnalyzeTaskWork` | 分析任务，选择执行策略和工具 | `POST /api/agent/analyze` |
| `ExecuteTaskWork` | 执行具体任务（流式输出） | `POST /api/agent/execute` |
| `SummarizeWork` | 汇总所有执行结果 | `POST /api/agent/summarize` |
| `ChatWork` | 与用户进行对话交互 | `POST /api/agent/chat` |

每个 Work 实现统一接口：
- `run()`: 执行核心逻辑
- `conclude()`: 执行完成后的收尾工作（更新 UI、消息）
- `next()`: 返回下一个工作单元（链式编排）
- `onError()`: 错误处理回调

---

## 4. 前端状态管理（Zustand Store 体系）

前端使用 **Zustand** 进行状态管理，分为多个切片（Slice）：

- **`agentStore`**: Agent 实例引用、生命周期状态、思考状态、工具配置
- **`taskStore`**: 任务列表（started/completed 状态）、任务增删改
- **`messageStore`**: 消息流（Agent 与用户的对话记录）
- **`configStore`**: Agent 配置（名称、目标、迭代次数等）
- **`modelSettingsStore`**: 模型参数（temperature、model name 等）
- **`agentInputStore`**: 输入状态管理

**`AgentRunModel`** 是一个抽象层，将 Zustand store 封装为 Agent 运行所需的数据接口，使 `AutonomousAgent` 不直接依赖 UI 框架：

```typescript
interface AgentRunModel {
  getId(): string;
  getGoal(): string;
  getLifecycle(): AgentLifecycle;
  getRemainingTasks(): Task[];
  getCurrentTask(): Task | undefined;
  updateTaskStatus(task: Task, status: TaskStatus): Task;
  addTask(taskValue: string): void;
}
```

---

## 5. 后端 Agent 服务层

后端 FastAPI 提供 6 个 API 端点，每个端点对应一个 Agent 操作：

```python
# views.py - 路由定义
router.post("/start")    # 生成初始任务
router.post("/analyze")  # 分析任务，选择工具
router.post("/execute")  # 执行任务（支持流式）
router.post("/create")   # 生成后续任务
router.post("/summarize") # 汇总结果（流式）
router.post("/chat")     # 对话交互（流式）
```

**AgentService** 是核心服务类，通过 `agent_service_provider` 工厂函数创建，支持：
- 根据请求动态选择 LLM 模型（默认 GPT-3.5/4，汇总用 16k 版本）
- 流式响应（`StreamingResponse`）用于执行、汇总、对话
- 依赖注入验证器（`dependancies.py`）校验请求参数

---

## 6. 工具系统（Tool Architecture）

AgentGPT 后端实现了可扩展的工具系统，位于 `platform/reworkd_platform/web/api/agent/tools/`：

| 工具文件 | 功能 |
|---------|------|
| `reason.py` | 推理工具（纯 LLM 思考） |
| `search.py` | 网络搜索（Serper API） |
| `sidsearch.py` | SID 搜索引擎 |
| `wikipedia_search.py` | Wikipedia 搜索 |
| `image.py` | 图像生成（Replicate） |
| `code.py` | 代码执行 |
| `conclude.py` | 结论生成 |
| `open_ai_function.py` | OpenAI Function Calling 适配 |

**工具选择机制**: 前端 `analyze` 阶段会将用户激活的工具名称发送到后端，后端通过 `Analysis` 类型返回决策：

```typescript
type Analysis = {
  reasoning: string;
  action: "reason" | "search" | "wikipedia" | "image" | "code";
  arg: string;
};
```

后端根据 `action` 字段路由到对应的工具执行器。工具通过 `tool.py` 基类定义统一接口（`available()`, `call()`, `public_description`）。

---

## 7. LLM 集成与 LangChain

后端使用 **LangChain** 作为 LLM 抽象层：

- **`model_factory.py`**: 工厂模式创建 LLM 实例，支持动态切换模型
- **Prompt 模板**（`prompts.py`）: 定义各类任务的 prompt 模板
- **输出解析**（`task_output_parser.py`）: 解析 LLM 输出为结构化任务列表
- **流式支持**: execute/summarize/chat 端点返回 `StreamingResponse`

LangChain 的主要用途：
1. Prompt 模板管理
2. LLM 调用封装（支持 OpenAI、其他 provider）
3. 输出解析（从 LLM 自由文本中提取结构化数据）
4. 链式调用（Chain）

---

## 8. 数据库与认证

- **ORM**: 前端 Prisma（Next.js 侧）+ 后端 SQLModel（FastAPI 侧）
- **数据库**: MySQL（通过 PlanetScale 托管，或 Docker 本地部署）
- **认证**: NextAuth.js（前端会话管理），后端通过 session 校验用户身份
- **模型**: Agent 配置、运行记录、用户数据等持久化到 MySQL

数据库 Schema 管理通过 Prisma migration 和 SQLModel 的 `create_all` 双轨并行。

---

## 9. 前端 UI 架构

前端采用 Next.js 13 App Router 风格（实际使用 Pages Router）：

```
src/
├── components/     # React 组件（Dashboard, Chat, Task 等）
├── hooks/          # 自定义 hooks（useAgent, useTools 等）
├── services/       # 核心服务层
│   ├── agent/      # Agent 运行逻辑
│   ├── api/        # API 调用封装
│   └── workflow/   # 工作流定义
├── stores/         # Zustand 状态管理
├── types/          # TypeScript 类型定义
├── utils/          # 工具函数
└── ui/             # UI 原子组件
```

**样式**: TailwindCSS + HeadlessUI，schema 校验用 Zod（前端）+ Pydantic（后端）。

---

## 10. 架构评价与启示

### 优势
- **前端驱动的 Agent 循环**: 运行状态完全在浏览器端管理，用户可实时观察、暂停、恢复 Agent
- **Work Pipeline 模式**: 将复杂 Agent 循环拆解为原子工作单元，可组合、可测试
- **双层解耦**: 前端编排 + 后端执行，职责清晰
- **工具可扩展**: 通过基类 + 工厂模式，新增工具只需实现接口

### 局限
- **前端循环的脆弱性**: Agent 循环依赖浏览器保持打开，刷新即中断
- **无持久化运行**: 运行状态仅存于内存和 localStorage，无法跨会话恢复
- **单 Agent 架构**: 不支持多 Agent 协作或嵌套 Agent
- **工具选择简单**: 基于单次 analyze 决策，不支持动态工具组合或链式工具调用

### 对 OpenMate 的启示
1. **Work Pipeline 模式**值得借鉴——将 Agent 执行拆解为可组合的原子单元
2. **AgentRunModel 抽象层**是好的设计——隔离 UI 状态与业务逻辑
3. **前端驱动循环**适合轻量场景，生产级系统应将循环移至后端
4. **工具系统**可参考其基类设计，但应支持更复杂的工具编排（MCP 协议）

---

*分析基于 AgentGPT main 分支源码，项目已于 2026-01-28 归档。*
