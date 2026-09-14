# GPT Pilot (Pythagora-io/gpt-pilot) 架构深度分析

> **项目地址**: https://github.com/Pythagora-io/gpt-pilot  
> **Stars**: 33.8K | **Forks**: 3,469  
> **定位**: "The first real AI developer" — 由 Pythagora 开发的 AI 驱动软件开发框架，核心理念是 AI 可以编写 95% 的代码，但剩余 5% 仍需要开发者介入直至实现完全 AGI。  
> **⚠️ 安全警告**: 该仓库已于 2025-2026 年间被注入供应链恶意代码（藏于 `core/telemetry/` 中的凭据窃取蠕虫），目前不再积极维护。

---

## 1. 整体架构设计

GPT Pilot 采用**多 Agent 流水线架构**，核心由一个 `Orchestrator`（编排器）驱动多个专职 Agent 协同完成从需求描述到可运行应用的全栈代码生成。

**目录结构**:
```
core/
├── agents/          # 所有 Agent 实现
│   ├── base.py      # Agent 基类
│   ├── orchestrator.py  # 主编排器
│   ├── spec_writer.py   # 需求规格编写
│   ├── tech_lead.py     # 技术负责人
│   ├── developer.py     # 开发者 Agent
│   ├── code_monkey.py   # 代码实现 Agent
│   ├── troubleshooter.py # 问题排查
│   ├── problem_solver.py # 问题解决
│   ├── wizard.py        # 配置向导
│   └── ...
├── state/           # 状态管理
│   └── state_manager.py # 核心状态管理器
├── db/              # 数据库模型
├── llm/             # LLM 客户端封装
├── proc/            # 进程管理
├── templates/       # 项目模板
└── ui/              # UI 接口层
```

架构的核心设计哲学是**状态驱动的 Agent 流水线**：每个 Agent 运行后产生一个 `AgentResponse`，Orchestrator 根据响应类型决定下一步调用哪个 Agent，形成一个持续循环直到项目完成或用户退出。

---

## 2. Agent 角色体系

GPT Pilot 定义了约 **15+ 个专职 Agent**，模拟了一个真实软件开发团队的分工：

| Agent | 角色 | 职责 |
|-------|------|------|
| **Orchestrator** | 编排器 | 主循环控制，决定调用哪个 Agent，管理状态提交 |
| **SpecWriter** | 需求分析师 | 将用户自然语言描述转化为详细技术规格说明 |
| **TechLead** | 技术负责人 | 将需求拆解为 Epic → Task 层级，制定开发计划 |
| **Developer** | 开发者 | 将 Task 分解为具体实现步骤（save_file / command） |
| **CodeMonkey** | 代码实现者 | 实际执行文件写入，处理 diff 和代码审查 |
| **Troubleshooter** | 测试排查者 | 获取用户反馈，生成 bug 报告，驱动迭代修复 |
| **ProblemSolver** | 问题解决者 | 当排查陷入循环时，生成替代解决方案 |
| **Executor** | 命令执行者 | 执行 shell 命令（npm install 等） |
| **TechnicalWriter** | 文档编写者 | 生成 README 文档 |
| **HumanInput** | 人工输入 | 处理需要人类介入的代码修改（INPUT_REQUIRED） |
| **Frontend** | 前端专家 | 处理前端特定逻辑 |
| **Architect** | 架构师 | 项目架构设计 |
| **BugHunter** | Bug 猎手 | 自动化 bug 定位 |
| **ExternalDocumentation** | 外部文档 | 获取外部依赖文档 |
| **Importer** | 导入器 | 导入已有项目 |

这种多 Agent 分工模式的核心优势是**关注点分离**——每个 Agent 只需关心自己的职责，通过标准化的 `AgentResponse` 进行通信。

---

## 3. 状态管理机制

状态管理是 GPT Pilot 最核心的子系统之一，由 `StateManager` 类负责：

**双态设计（current_state / next_state）**:
```python
class StateManager:
    current_state: ProjectState  # 只读，表示当前状态
    next_state: ProjectState     # 写入，表示待提交状态
```

这是一个**乐观锁模式**的变体：Agent 读取 `current_state`，将修改写入 `next_state`，只有在 Agent 成功完成后才将 `next_state` 提交（commit）到数据库，成为新的 `current_state`。如果 Agent 失败，修改可以被丢弃。

**ProjectState 模型**包含：
- `epics`: Epic 列表（大功能模块）
- `tasks`: Task 列表（具体任务）
- `steps`: 实现步骤列表
- `files`: 项目文件列表
- `iterations`: 迭代记录（bug 修复循环）
- `specification`: 项目规格说明
- `knowledge_base`: 项目知识库（页面、API、工具函数）

所有状态持久化到 SQLite 数据库（通过 SQLAlchemy async session），支持项目级别的多分支管理。

---

## 4. 主循环与流程编排

`Orchestrator.run()` 实现了核心的**事件循环**：

```python
while True:
    agent = self.create_agent(response)  # 根据状态和上一个响应决定下一个 Agent
    if isinstance(agent, list):
        responses = await asyncio.gather(*[a.run() for a in agent])  # 并行执行
        response = self.handle_parallel_responses(agent[0], responses)
    else:
        response = await agent.run()  # 串行执行

    if response.type == ResponseType.EXIT:
        break
    if response.type == ResponseType.DONE:
        response = await self.handle_done(agent, response)  # 提交状态，确定下一步
```

`create_agent()` 方法是一个**路由函数**，根据当前项目状态（当前任务状态、迭代状态、步骤类型等）决定下一个应该执行的 Agent：

- 无规格说明 → `SpecWriter`
- 有规格但无 Epic → `TechLead`  
- 有 Task 且步骤类型为 `save_file` → `CodeMonkey`（支持并行多个）
- 有 Task 且步骤类型为 `command` → `Executor`
- 需要人工输入 → `HumanInput`
- 任务完成需要测试 → `Troubleshooter`
- 陷入循环 → `ProblemSolver`

---

## 5. LLM 调用策略

每个 Agent 通过 `get_llm()` 方法获取专用的 LLM 客户端：

```python
def get_llm(self, name=None, stream_output=False, route=None):
    config = get_config()
    llm_config = config.llm_for_agent(name or self.__class__.__name__)
    client_class = BaseLLMClient.for_provider(llm_config.provider)
    # ... 创建带流式处理和错误处理的客户端
```

关键设计点：
- **Agent 级别的模型配置**：不同 Agent 可以使用不同的 LLM 模型（如 SpecWriter 用更强的模型，CodeMonkey 用更快的模型）
- **Pydantic Schema 约束**：通过 `require_schema()` 和 `JSONParser` 将 LLM 输出约束为结构化 JSON
- **流式输出**：支持 `stream_output=True` 将 LLM 生成过程实时推送到 UI
- **请求日志**：所有 LLM 请求自动记录到数据库，支持回放和调试
- **温度控制**：不同场景使用不同温度（如代码生成用 temperature=0，创意方案用 temperature=1）

---

## 6. 对话管理（AgentConvo）

`AgentConvo` 类封装了与 LLM 的对话上下文管理：

```python
convo = AgentConvo(self)
    .template("epic_breakdown", epic_number=1, epic_description="...")
    .require_schema(EpicPlan)
```

核心能力：
- **模板系统**：通过 `.template()` 加载预定义的 prompt 模板
- **Schema 约束**：通过 `.require_schema()` 指定期望的 Pydantic 输出模型
- **对话裁剪**：当对话过长时（如 `len(convo.messages) > 6`），自动裁剪早期消息
- **上下文注入**：自动注入当前项目状态、文件列表、任务信息等上下文

---

## 7. 迭代与修复机制

GPT Pilot 的一个关键创新是其**人机协作的迭代修复循环**：

1. **Developer** 实现 Task → 生成代码
2. **Troubleshooter** 提示用户测试 → 收集反馈
3. 用户反馈分三种：
   - "Continue" → 任务完成，进入下一个 Task
   - "There is an issue" → 生成 bug 报告，进入修复循环
   - "I want to make a change" → 更新规格说明

**循环检测**：
```python
LOOP_THRESHOLD = 3  # 连续 3 次迭代视为循环
if len(self.next_state.iterations) == LOOP_THRESHOLD:
    await self.trace_loop("loop-start")
```

当检测到循环时，触发 **ProblemSolver** Agent，生成替代解决方案供用户选择。这种设计避免了 LLM 在同一问题上无限重试。

**BugHunter** Agent 则负责自动化定位 bug，通过分析代码结构和错误信息缩小搜索范围。

---

## 8. 代码实现与 Diff 管理

`CodeMonkey` Agent 负责实际的代码生成和文件修改：

- 使用 `<pythagoracode file="...">` 标签格式化代码输出
- 支持 **Relace**（外部代码编辑 API）和 **OpenAI** 双重后端
- 实现了 `FileDiffMixin` 进行 diff 生成和展示
- 代码审查机制：对生成的 hunk 进行 apply/ignore/rework 决策
- 最大重试次数限制：`MAX_CODING_ATTEMPS = 3`

```python
class CodeMonkey(FileDiffMixin, BaseAgent):
    async def implement_changes(self, data=None):
        # 1. 获取当前文件内容
        # 2. 尝试 Relace API
        # 3. 回退到 OpenAI
        # 4. 返回 {path, old_content, new_content}
    
    async def accept_changes(self, file_path, old_content, new_content):
        # 1. 生成 diff 展示
        # 2. 保存到文件系统和数据库
        # 3. 检查 INPUT_REQUIRED
```

---

## 9. UI 抽象层

GPT Pilot 通过 `UIBase` 抽象接口实现了**前后端解耦**：

```python
class UIBase:
    async def send_message(message, source, project_state_id, extra_info)
    async def ask_question(question, buttons, default, ...)
    async def send_stream_chunk(content, source, project_state_id)
    async def send_file_status(file_name, status, source)
    async def generate_diff(file_path, old_content, new_content, ...)
    async def send_project_stage(stage)
    async def send_run_command(command)
```

这种设计允许 GPT Pilot 支持多种前端：
- **VS Code 扩展**（主要产品形态）
- **CLI 终端**（`main.py` 入口）
- **Docker 容器化部署**

每个 Agent 通过 `AgentSource` 标识自己的 UI 来源，确保消息正确路由。

---

## 10. 项目模板与知识库

**项目模板系统**：
```python
class PROJECT_TEMPLATES:
    vite_react_swagger  # Vite + React + Swagger
    vite_react          # Vite + React（带认证）
```

TechLead Agent 在项目初始化阶段会根据配置自动应用模板，生成基础项目结构，避免从零开始。

**知识库（Knowledge Base）**：
```python
knowledge_base:
    pages: List[str]           # 已实现的前端页面
    apis: List[dict]           # 已实现的 API 端点
    user_options: dict         # 用户配置选项
    utility_functions: List[dict]  # 工具函数
```

知识库在运行过程中持续更新，为后续 Agent 提供项目全局视图。例如 TechLead 在拆解 Epic 时会参考已有的 API 列表，避免重复实现。

---

## 总结：核心设计模式

| 维度 | 设计选择 |
|------|----------|
| **架构模式** | 多 Agent 流水线 + 状态机 |
| **状态管理** | 双态（current/next）乐观锁 + SQLite 持久化 |
| **Agent 通信** | 标准化 AgentResponse 枚举 |
| **LLM 集成** | Agent 级模型配置 + Pydantic Schema 约束 |
| **人机协作** | 迭代反馈循环 + 循环检测 + 替代方案生成 |
| **代码生成** | 模板化 prompt + diff 审查 + 多后端回退 |
| **UI 层** | 抽象接口 + 多前端支持 |
| **项目管理** | Epic → Task → Step 三级分解 |
| **错误处理** | 专用 ErrorHandler Agent + 最大重试限制 |
| **可观测性** | 全量 LLM 请求日志 + 遥测 + 项目统计 |

GPT Pilot 的架构对 Agent 开发的启示：**将复杂的代码生成任务拆解为多个专职 Agent 的协作，通过状态机管理流程，结合人机迭代反馈实现质量保障**。这种模式比单一 Agent 端到端生成更可靠，也更贴近真实软件开发的协作方式。
