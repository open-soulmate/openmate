# 52. OpenHands（原 OpenDevin）架构深度分析

> 项目地址：https://github.com/All-Hands-AI/OpenHands
> SDK 仓库：https://github.com/OpenHands/software-agent-sdk
> 文档：https://docs.openhands.dev/sdk
> 论文：arXiv:2511.03690
> SWEBench 得分：77.6%
> 被 TikTok、VMware、Roche、Amazon、Netflix、Mastercard、Apple、NVIDIA、Google 等企业采用

---

## 一、项目定位与演进

OpenHands 最初以 **OpenDevin** 之名诞生，定位为"AI 驱动的软件开发平台"。经过重大架构重构后，项目更名为 OpenHands，并从单一仓库拆分为 **多仓库架构**（multi-repo），形成了清晰的职责边界：

| 仓库 | 职责 |
|---|---|
| `OpenHands/OpenHands` | Agent Canvas 前端、用户控制中心、后端选择、本地栈编排 |
| `OpenHands/software-agent-sdk` | Python SDK、Agent Server、Agent 实现、工具、对话、工作空间、事件、REST/WebSocket API |
| `OpenHands/typescript-client` | 浏览器兼容的 TypeScript 客户端 |
| `OpenHands/automation` | 自动化定义、调度、Webhook、运行历史、任务分发 |

这种拆分体现了从"单体 AI 编码助手"到**开发者控制中心（Developer Control Center）**的转型——不仅运行 OpenHands 自研 Agent，还能接入 Claude Code、Codex、Gemini 等任何 ACP（Agent-Client Protocol）兼容的第三方 Agent。

---

## 二、四包架构（Four-Package Architecture）

SDK 采用 **四包分离** 设计，每个包有明确的边界和可选性：

### 1. `openhands.sdk`（核心包，必选）
提供 Agent 框架的基础组件：
- **Agent**：实现推理-行动（Reasoning-Action）循环
- **Conversation**：管理对话状态和生命周期
- **LLM**：Provider 无关的语言模型接口，内置重试和遥测
- **Tool System**：类型化的 Action/Observation/Executor 模式
- **Events**：类型化事件框架（Action、Observation、用户消息、状态更新等）
- **Workspace**：基础工作空间类（`Workspace` → `LocalWorkspace` → `RemoteWorkspace`）
- **Skill**：可复用的用户自定义 Prompt，支持触发器激活
- **Condenser**：对话历史压缩，用于 Token 管理
- **Security**：动作风险评估和执行前验证

设计原则：**无状态、不可变组件、类型安全的 Pydantic 模型**。

### 2. `openhands.tools`（工具包）
预构建的标准化工具，遵循统一的 Action/Observation/Executor 模式：
- `BashTool`：终端命令执行
- `FileEditorTool`：文件编辑
- `TaskTrackerTool`：任务追踪
- `GrepTool`：代码搜索
- 以及更多...

工具在 Agent 所在的环境中运行（本地/容器/远程），不通过 Workspace API 间接执行。

### 3. `openhands.workspace`（工作空间包，可选）
扩展 SDK 基类的具体实现：
- **DockerWorkspace**：在 Docker 容器中运行 Agent，提供沙箱隔离
- **RemoteAPIWorkspace**：通过 HTTP 连接远程 Agent Server

### 4. `openhands.agent_server`（服务端包，可选）
基于 FastAPI 的 HTTP/WebSocket 服务器，提供：
- 对话的 CRUD 操作和 WebSocket 实时通信
- OpenAI 兼容的 `/v1/chat/completions` 和 `/v1/responses` 端点
- Bash、文件、Git、VSCode、MCP、插件、技能等路由
- 每用户隔离的会话管理和 API Key 认证

---

## 三、两种部署模式

OpenHands 的核心设计亮点是**同一份 Agent 代码可在两种模式下无缝切换**：

### 模式一：本地开发
```
pip install openhands-sdk openhands-tools
```
- `LocalWorkspace` 内置于 SDK，无需额外安装
- 单进程运行，适合原型开发
- 无需 Docker

### 模式二：生产/沙箱
```
pip install openhands-sdk openhands-tools openhands-workspace openhands-agent-server
```
- `RemoteWorkspace` 自动在容器中启动 Agent Server
- 沙箱执行确保安全
- 支持多用户部署和 Kubernetes 分布式系统

切换方式：只需将 `LocalWorkspace` 替换为 `DockerWorkspace` 或 `RemoteAPIWorkspace`，Agent 代码无需修改。

---

## 四、Agent 核心循环

Agent 的核心是**推理-行动循环（Reasoning-Action Loop）**：

```
用户输入 → Agent 推理 → LLM 决策 → 选择工具 → 执行动作 → 获取观察 → 继续推理或结束
```

具体流程：
1. 用户发送消息到 Conversation
2. Agent 将消息和历史上下文发送给 LLM
3. LLM 返回工具调用指令（如 `BashTool("touch hello.txt")`）
4. Agent 将指令路由到对应的 Tool Executor
5. Tool 在当前环境中执行并返回 Observation
6. Agent 将结果反馈给 LLM，决定下一步
7. 循环直到 LLM 判断任务完成

Agent 支持 **Skill 系统**——可复用的 Prompt 模块，通过触发条件自动激活，为特定任务提供领域知识。

---

## 五、事件系统（Event System）

OpenHands 使用**类型化事件框架**作为各组件间的通信机制：

- **Action**：Agent 发出的动作指令（如执行命令、编辑文件）
- **Observation**：动作执行后的结果（如命令输出、文件变更）
- **UserMessage**：用户输入消息
- **StateUpdate**：状态变更通知

事件通过 discriminated union 实现类型安全，支持 `kind` 字段做多态分发。事件端点采用**可扩展的 discriminated union**——新的事件类型可以随时添加，客户端应忽略未知的变体以保持前向兼容。

---

## 六、工具系统（Tool System）

工具系统遵循严格的三层模式：

1. **Action**（动作定义）：声明工具的输入参数和类型，使用 Pydantic 模型验证
2. **Observation**（观察结果）：工具执行的结构化输出
3. **Executor**（执行器）：实际执行逻辑，与运行环境交互

每个工具内置：
- 类型验证（输入/输出均为 Pydantic 模型）
- 错误处理
- 安全策略检查（执行前风险评估）

工具还支持 **MCP（Model Context Protocol）集成**，允许通过标准协议接入外部工具服务。

---

## 七、工作空间与沙箱（Workspace & Sandbox）

工作空间是 Agent 操作的执行环境抽象，采用三层继承：

```
Workspace (基类)
├── LocalWorkspace (本地文件系统)
└── RemoteWorkspace (远程执行基类)
    ├── DockerWorkspace (Docker 容器)
    └── RemoteAPIWorkspace (HTTP API 连接)
```

- **LocalWorkspace**：Agent 直接在本地文件系统操作，适合开发环境
- **DockerWorkspace**：Agent 在 Docker 容器中运行，提供文件系统隔离和安全沙箱
- **RemoteAPIWorkspace**：通过 HTTP 连接远程 Agent Server，支持分布式部署

Agent Server 在容器内或独立进程中运行，管理会话隔离、工作空间文件存储和加密敏感数据。

---

## 八、Agent Server 架构

Agent Server 是整个系统的**服务端核心**，采用 FastAPI + WebSocket 架构：

### API 路由模块化
服务端被拆分为大量独立的路由模块：
- `conversation_router.py`：对话管理
- `bash_router.py` / `bash_service.py`：终端命令
- `file_router.py`：文件操作
- `git_router.py`：Git 操作
- `event_router.py` / `event_service.py`：事件流
- `mcp_router.py`：MCP 协议集成
- `plugins_router.py` / `plugins_service.py`：插件系统
- `skills_router.py` / `skills_service.py`：技能管理
- `vscode_router.py`：VSCode 集成
- `workspace_router.py` / `workspaces_router.py`：工作空间管理
- `settings_router.py`：配置管理
- `auth_router.py`：认证
- `desktop_router.py`：桌面操作
- `sub_agents_router.py`：子 Agent 管理

### 存储设计
- 基于文件系统的本地存储（`conversations/{id}/metadata.json` + `events.jsonl`）
- 支持敏感数据加密（`OH_SECRET_KEY` 环境变量）
- Webhook 通知机制，支持事件缓冲和重试

### 通信协议
- REST API：标准 CRUD 操作
- WebSocket：实时事件流推送
- OpenAI 兼容接口：可被标准 OpenAI 客户端调用

---

## 九、Agent Canvas 前端

Agent Canvas（原 OpenHands UI）是用户交互层，作为**自托管的开发者控制中心**：

- **多后端切换**：可同时连接多个 Agent Server，在本地/远程/云端之间无缝切换
- **多 Agent 支持**：不仅运行 OpenHands Agent，还支持 Claude Code、Codex、Gemini 等
- **自动化工作流**：通过 Automation Server 创建定时任务或 Webhook 触发的工作流
- **第三方集成**：Slack、GitHub、Linear、Notion 等服务的自动化集成

前端通过 TypeScript 客户端与 Agent Server 通信，遵循 OpenAPI 契约进行类型安全的 API 调用。

---

## 十、安全与可观测性

### 安全机制
- **沙箱隔离**：Docker 容器提供文件系统和进程隔离
- **Secret 加密**：LLM API Key、AWS 凭证等敏感数据使用 `OH_SECRET_KEY` 加密存储
- **认证**：可选的 Session API Key 认证
- **CORS**：可配置的跨域访问控制
- **Security 模块**：动作执行前的风险评估和验证

### 可观测性三层体系
| 特性 | 收集内容 | 存储位置 |
|---|---|---|
| **遥测（Telemetry）** | 生命周期/故障事件（白名单），不含 Prompt、消息、文件内容 | PostHog（可选） |
| **LLM 日志** | 完整的 Prompt、响应、原始 Provider 载荷 | 本地磁盘 |
| **OpenTelemetry 追踪** | 分布式追踪和 Span，延迟分析 | OTel/Laminar 后端 |

三层数据完全隔离——遥测不会转发日志或追踪数据。

### 隐私保护设计
- 遥测数据经过**分桶处理**（bucketed），原始数值被模糊化
- `conversation_ref` 使用 keyed digest，不暴露原始 UUID
- 异常消息和堆栈追踪从不读取
- 支持 `DO_NOT_TRACK=1` 全局禁用
- 遵循 GDPR 级别的用户同意机制

---

## 总结

OpenHands 的架构设计体现了以下核心理念：

1. **关注点分离**：多仓库、四包架构，每个组件职责单一
2. **部署灵活性**：同一份代码，LocalWorkspace → DockerWorkspace → RemoteAPIWorkspace 无缝切换
3. **开放性**：不仅自研 Agent，还通过 ACP 协议接入任何第三方 Agent
4. **类型安全**：全链路 Pydantic 模型，OpenAPI 契约驱动
5. **企业级安全**：沙箱隔离、加密存储、细粒度权限控制
6. **可观测性优先**：三层独立的可观测性体系，隐私与调试需求兼顾

这一架构使其从一个 AI 编码助手演进为一个**平台级的 Agent 编排系统**，能够承载从个人开发到企业级多 Agent 协作的各类场景。
