# Devika 架构深度分析

> **仓库**: [stitionai/devika](https://github.com/stitionai/devika)  
> **Stars**: 19.5k | **License**: MIT  
> **定位**: 首个开源 Agentic AI Software Engineer，对标 Cognition AI 的 Devin  
> **目标**: 在 SWE-bench 基准测试中达到甚至超越 Devin 的成绩

---

## 1. 总体架构概览

Devika 是一个面向软件工程全流程的 AI Agent 系统。其核心设计理念是将复杂的编程任务分解为多个子步骤，由不同的专用子 Agent 协作完成。系统采用**多 Agent 协作 + 工具调用 + 持久化状态**的三层架构：

- **前端层**: 基于 Bun + React 的 Web UI（端口 3001），提供聊天界面和项目管理
- **后端层**: Flask + SocketIO 服务（端口 1337），处理 WebSocket 实时通信
- **Agent 层**: 多个专用子 Agent 协作执行规划、研究、编码等任务
- **持久化层**: SQLite 数据库存储项目、对话和 Agent 状态

```
┌─────────────────────────────────────────────┐
│              Web UI (Bun + React)            │
│         端口 3001 / SocketIO 连接            │
└──────────────────┬──────────────────────────┘
                   │ WebSocket
┌──────────────────▼──────────────────────────┐
│          Flask + SocketIO 后端               │
│            端口 1337                         │
├─────────────────────────────────────────────┤
│  Agent Core (Orchestrator)                  │
│  ┌─────────┬──────────┬──────────┐          │
│  │ Planner │Researcher│  Coder   │          │
│  ├─────────┼──────────┼──────────┤          │
│  │ Action  │  Runner  │ Feature  │          │
│  ├─────────┼──────────┼──────────┤          │
│  │ Patcher │ Reporter │Decision  │          │
│  └─────────┴──────────┴──────────┘          │
├─────────────────────────────────────────────┤
│  LLM 层 │ Browser 层 │ Services 层          │
├─────────────────────────────────────────────┤
│           SQLite (SQLModel ORM)             │
└─────────────────────────────────────────────┘
```

---

## 2. 多 Agent 编排模型

Devika 的核心是 `Agent` 类（`src/agent/agent.py`），它作为中央调度器协调 9 个专用子 Agent：

| 子 Agent | 职责 | 触发时机 |
|----------|------|----------|
| **Planner** | 将高层需求分解为逐步计划 | 首次任务接收 |
| **Researcher** | 从计划中提取搜索关键词和上下文 | 规划完成后 |
| **Coder** | 根据计划和研究结果生成代码 | 研究完成后 |
| **Action** | 根据用户后续消息决定动作类型 | 后续交互 |
| **Runner** | 在沙箱中执行代码并流式输出 | 运行代码时 |
| **Feature** | 基于规格添加新功能到现有项目 | 功能扩展 |
| **Patcher** | 分析错误并修复代码 | Bug 修复 |
| **Reporter** | 生成项目综合报告（含 PDF 导出） | 报告生成 |
| **Decision** | 处理特殊命令（git clone、浏览器交互等） | 其他场景 |

**编排流程**：
```
用户输入 → Planner → Researcher → Web搜索 → Coder → 输出代码
                                        ↑
后续输入 → Action → (Runner/Feature/Patcher/Reporter/Decision)
```

每个子 Agent 使用 Jinja2 模板化的 Prompt 与 LLM 交互，实现了**关注点分离**——每个 Agent 只需理解自己领域的上下文，降低了单个 Prompt 的复杂度。

---

## 3. LLM 抽象层

`LLM` 类（`src/llm.py`）提供了统一的模型接口，支持：

- **Claude 3**（Anthropic）— 官方推荐的最佳性能选择
- **GPT-4 / GPT-3.5**（OpenAI）
- **Gemini**（Google）
- **Mistral**
- **Groq**
- **本地模型** 通过 Ollama 集成
- **LM Studio** 通过兼容端点

关键设计：
- 统一的 `generate_completion(prompt)` 接口，子 Agent 无需关心底层模型
- **Token 用量追踪**：每个状态步累计 token 消耗，可在 UI 中查看
- **模型列表发现**：`list_models()` 动态返回可用模型列表
- 配置通过 `config.toml` 管理，支持运行时通过 UI 修改 API Key 和端点

这种抽象使得 Devika 可以在不同成本/性能需求间灵活切换，也可以无缝迁移至本地模型。

---

## 4. 浏览器交互引擎

浏览器能力是 Devika 区别于纯代码生成 Agent 的关键差异。系统包含两个核心组件：

**Browser 类**（`src/browser/browser.py`）：
- 基于 **Playwright**（Chromium headless）实现底层自动化
- 支持：页面导航、截图、HTML/Markdown/PDF 内容提取、文本抽取
- 异步架构（`async/await`），20 秒导航超时保护
- 截图自动通过 SocketIO 推送至前端实时展示

**Crawler Agent**：
- 接收自然语言目标，与页面进行交互式操作
- 预定义浏览器动作：scroll、click、type 等
- 循环机制：页面状态 → LLM 决策 → 执行动作 → 更新状态 → 重复
- 本质上是一个**页面级 Agent Loop**，与 ReAct 模式类似

**信息获取流程**：
```
Planner 生成搜索关键词 → Bing/Google/DuckDuckGo 搜索
→ Browser 爬取 Top 结果 → Crawler 交互式提取
→ Markdown/PDF 格式化 → 传递给 Coder Agent
```

这种设计让 Devika 能够获取最新技术文档、API 参考和 Stack Overflow 答案，而非仅依赖 LLM 的训练数据。

---

## 5. 状态管理机制

`AgentState` 类（`src/state.py`）实现了完整的 Agent 状态追踪系统：

**状态结构**（每步一个状态对象）：
```python
{
    "internal_monologue": "",      # Agent 的"内心独白"
    "browser_session": {
        "url": None,               # 当前浏览的 URL
        "screenshot": None         # 页面截图
    },
    "terminal_session": {
        "command": None,           # 执行的命令
        "output": None,            # 命令输出
        "title": None              # 终端标题
    },
    "step": 1,                     # 步骤编号
    "message": None,               # 当前消息
    "completed": False,            # 任务是否完成
    "agent_is_active": True,       # Agent 是否活跃
    "token_usage": 0,              # Token 累计用量
    "timestamp": "..."             # 时间戳
}
```

关键特性：
- **State Stack 模型**：每个项目维护一个状态栈，支持追加和回溯
- **SQLite 持久化**：通过 SQLModel ORM 存储 `agent_state` 表
- **实时推送**：每次状态变更通过 `emit_agent("agent-state", ...)` 推送至前端
- **内部独白**：模拟 AI 的"思考过程"，增强可解释性
- **Token 追踪**：`update_token_usage()` 累计每次 LLM 调用的 token 消耗

---

## 6. 项目管理系统

`ProjectManager` 类（`src/project.py`）管理项目的完整生命周期：

- **项目创建/删除**：在 `data/projects/` 下维护项目目录
- **对话历史**：JSON 序列化存储在 SQLite `projects` 表中
- **消息分类**：区分 `from_devika`（AI）和 `from_user`（人类）消息
- **文件浏览**：`get_project_files()` 递归读取项目目录中的所有代码文件
- **导出功能**：`project_to_zip()` 将项目打包为 ZIP 文件下载

数据模型：
```
Projects 表
├── id (主键)
├── project (项目名)
└── message_stack_json (JSON 序列化的对话历史)
```

---

## 7. 外部服务集成

Devika 通过模块化的 Service 层集成外部能力：

- **GitHub Service**：Git clone/pull 操作、列出仓库/提交/文件
- **Netlify Service**：Web 应用部署，提供即时可访问的 URL
- **搜索引擎**：Bing API、Google Search API、DuckDuckGo 三种选择

集成模式统一：每个 Service 封装认证、HTTP 请求和响应解析，通过配置文件管理 API Key。这种模块化设计使得添加新服务（如 Vercel、Railway）非常简单。

---

## 8. 前端交互设计

前端采用 **Bun + React** 技术栈（`ui/` 目录），核心交互模式：

- **聊天界面**：自然语言输入，支持多轮对话
- **项目选择器**：创建/切换项目，每个项目独立上下文
- **模型和搜索引擎配置**：通过 UI 页面直接设置 API Key
- **实时状态面板**：通过 WebSocket 接收 Agent 状态，展示：
  - Agent 的内部独白
  - 浏览器截图和当前 URL
  - 终端命令和输出
  - 步骤进度
  - Token 用量

前端与后端通过 SocketIO 双向通信，实现了类似 IDE 的实时反馈体验。

---

## 9. 配置与可扩展性

`Config` 类（`src/config.py`）采用**单例模式**，管理全局配置：

- **TOML 格式**：`config.toml` 存储所有配置
- **自动补全**：首次运行时从 `sample.config.toml` 复制，后续运行自动补充缺失键
- **分区管理**：API_KEYS、API_ENDPOINTS、STORAGE、LOGGING、TIMEOUT 五大分区
- **运行时修改**：支持通过 UI 动态修改配置并持久化
- **存储路径可配**：SQLite 数据库、截图目录、PDF 目录、项目目录、日志目录、仓库目录均可自定义

可扩展性设计：
- 新增 LLM Provider：在 `LLM` 类中添加新的 API 调用分支
- 新增 Service：创建新的 Service 类并在 Agent Core 中注册
- 新增 Agent：在 `src/agent/` 下添加新的子 Agent 类，使用 Jinja2 Prompt 模板
- 新增浏览器动作：在 Crawler 中扩展预定义动作列表

---

## 10. 局限性与改进方向

**当前局限**：
- **实验阶段**：项目自述为"very early development/experimental"，存在大量未实现/损坏的功能
- **线性编排**：Agent Core 采用线性流水线（Planner → Researcher → Coder），缺乏并行执行和动态路由
- **无验证循环**：代码生成后缺少自动测试、验证和迭代修正的闭环
- **浏览器交互脆弱**：基于 LLM 的页面交互（"CLICK 12"）在复杂页面上容易失败
- **无代码执行沙箱**：Runner 直接在主机上执行命令，缺乏真正的沙箱隔离
- **状态管理粗粒度**：整个对话历史和状态栈以 JSON 字符串存储，无法高效查询
- **缺乏记忆系统**：无跨会话的记忆或知识库，每次对话都是独立的

**可借鉴的设计亮点**：
1. **多 Agent 分工模式**：每个子 Agent 有独立的 Prompt 模板，关注点清晰
2. **状态可视化**：内部独白 + 截图 + 终端输出的实时推送，提升了可解释性
3. **搜索增强生成**：通过浏览器实时获取最新信息，弥补 LLM 知识截止的缺陷
4. **模型无关设计**：统一的 LLM 抽象层使得底层模型可随时切换

**后续迭代**（Opcode 项目）：Devika 的作者已推出第二代产品 [Opcode](https://opcode.sh/)，代表了该架构的演进方向。

---

## 总结

Devika 作为首个对标 Devin 的开源 Agentic AI Software Engineer，其架构设计体现了 2024 年早期 AI Agent 的典型范式：**多子 Agent 协作 + Prompt 模板驱动 + 工具调用增强 + 状态持久化**。虽然在工程成熟度上还有很大提升空间，但其模块化的 Agent 设计、浏览器集成、状态可视化等思路为后续开源 Agent 项目提供了有价值的参考。核心价值在于证明了"用多个专用 Agent 替代单一通用 Agent"这一架构方向的可行性。
