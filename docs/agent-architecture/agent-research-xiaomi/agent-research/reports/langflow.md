# langflow-ai/langflow — 可视化 Agent 构建器 / 运行时 调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/langflow-ai/langflow（~155k★） |
| 文档 | https://docs.langflow.org（Docusaurus；`/llms.txt`） |
| 语言 | Python（后端，uv/PyPI）+ TypeScript（前端 React Flow） |
| License | MIT |
| 定位一句话 | 构建与部署 AI Agent/工作流的平台：可视化编排 + 内置 API/MCP Server，每条 flow 即工具 |
| 部署 | Desktop（Win/mac）、`uv run langflow run`、Docker、K8s、云 |

> 对 openmate：Langflow 与 Dify/Flowise 同属可视化 Agent 运行时，但更强调 **「Flow 即 API / 即 MCP 工具」**、**组件 Tool Mode（任意组件变工具）**、**Agent 内置 session 记忆**。对 openmate 的启发偏「工具注册与发布面」，HA 深度不如 n8n queue mode。

---

## 1. 系统架构

### 1.1 分层

```
Desktop / Web Editor（React Flow 画布）
    ↓
Flow Runtime（Python）— 执行图：Agent / Chain / 工具组件
    ↓
API Server + MCP Server（flow 发布为 HTTP/MCP 工具）
    ↓
存储：会话/文件；可观测：LangSmith / Langfuse 等
```

### 1.2 核心构建块

| 元素 | 说明 |
|---|---|
| **Flow** | 画布上的节点图；可导入导出 JSON；可版本化 |
| **Agent 组件** | 多 LLM provider、tool calling、system prompt、结构化输出 |
| **Tool Mode** | 任意组件打开 Tool Mode 后暴露 `Toolset` 端口 → 接到 Agent `Tools` |
| **MCP Tools / MCP Client** | Agent 可消费外部 MCP server 工具 |
| **Playground** | 逐步调试：输入、每次 tool call 的 in/out、流式 token |
| **Chat memory** | 按 `session_id` 分组的滚动上下文；可配历史条数；可接 Mem0 |

### 1.3 Agent 组件要点

- **Language Model**：全局 Model Providers 配 key；或画布上接自定义 model 组件
- **Tools**：组件 Tool Mode、其他 Agent（多 Agent）、MCP
- **输出**：`Response`（Message）与 `Structured Response`（按 Output Schema 提取；两路同开 = 两次 LLM 调用）
- **参数**：`handle_parsing_errors`、`add_current_date_tool`、`verbose` 等
- **记忆**：默认用安装实例存储；Structured Response 模式不写 chat history、不发 Playground 事件

---

## 2. 四个关键维度深潜

### 2.1 运行时 / 长任务

| 能力 | 说明 |
|---|---|
| **API 触发** | `concepts-publish`：flow 作为 HTTP API 调用 |
| **Webhook** | 外部事件驱动 flow |
| **MCP Server** | flow 变成 MCP 客户端可调的工具 |
| **A2A Server** | 文档有「Use Langflow as an A2A server」 |
| **多 Worker** | 专页 `deployment-multi-worker`（水平扩展 worker） |
| **K8s 最佳实践** | `deployment-prod-best-practices`：HA/扩展/编排 |

注意：Langflow 的「长任务」更偏 **一次请求内的 agent loop**；跨进程检查点/暂停续跑弱于 Flowise HITL 或 n8n Wait。长研究任务需自行拆 API 调用或外部队列。

### 2.2 错误恢复

- Agent 级：`handle_parsing_errors` 允许模型自修解析错误
- Playground 可见原始 tool 输出，便于诊断
- 组件/flow 层没有 Dify 那种节点级 Fail Branch 三态；错误编排主要靠画布结构与外部重试
- 可观测：LangSmith、Langfuse 等集成

### 2.3 沙箱 / 安全

- 安全指南：https://docs.langflow.org/security
- **Block custom components**（`deployment-block-custom-components`）：生产可禁用户上传自定义 Python 组件
- **Restrict API tweaks**（`deployment-tweaks-policy`）
- 自定义组件 = 服务端 Python 执行面，多租户必须默认关闭或硬隔离
- 模型 API key 存于全局 Model Providers，一 provider 一把 key

### 2.4 工具鉴权

- **模型侧**：Provider API key（OpenAI/Anthropic/…）
- **工具侧**：组件内配置（如搜索 API key）；无 Composio 级统一 OAuth 目录
- **MCP**：可接带鉴权的 MCP server
- **平台用户**：部署层认证（文档 authentication-overview）
- 集成 `composio.lock` 文件暗示官方对接过 Composio 生态

---

## 3. 部署形态

| 方式 | 说明 |
|---|---|
| Desktop | 打包依赖，最低摩擦 |
| 本地 | `uv pip install langflow -U` → `uv run langflow run` → :7860 |
| Docker | `docker run -p 7860:7860 langflowai/langflow:latest` |
| 远程 | Docker + Caddy；或 Nginx + Let’s Encrypt |
| K8s | 生产架构与最佳实践文档 |
| 云示例 | GCP、Hugging Face Spaces 等 |
| 容器化应用 | 把 flows 打进镜像（`develop-application`） |

---

## 4. 对 openmate 的可借鉴点

1. **P0 — 任意工具组件化 + Tool Mode**：openmate 工具应有统一「Toolset 端口」协议，内置工具与外接 MCP 同形。
2. **P0 — Flow 即 API / 即 MCP 工具**：编排结果直接成为可被其他 agent 调用的工具，形成技能市场式扩展。
3. **P1 — session_id 记忆分组**：多用户/多应用共用同一 flow 时靠自定义 session 隔离记忆。
4. **P1 — Structured Response 契约**：按 schema 抽取 + 与自然语言回复分离，避免二次污染上下文。
5. **P1 — 生产禁自定义组件**：默认最小执行面，再按需开放。
6. **P2 — 多 Worker 文档**：水平扩展时的 worker 配置可参考；但队列/检查点仍需 n8n 级方案补齐。

---

## 5. 参考链接

- Agent 文档：https://docs.langflow.org/agents
- 部署总览：https://docs.langflow.org/deployment-overview
- 多 Worker：https://docs.langflow.org/deployment-multi-worker
- 安全：https://docs.langflow.org/security
- Docs 索引：https://docs.langflow.org/llms.txt
