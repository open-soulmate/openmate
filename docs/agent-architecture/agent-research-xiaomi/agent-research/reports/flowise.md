# FlowiseAI/Flowise — 可视化 Agent 编排调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/FlowiseAI/Flowise |
| 文档 | https://docs.flowiseai.com（GitBook，页面可 `.md` 获取） |
| 语言 | TypeScript（server / ui / components mono-repo） |
| License | Apache 2.0 |
| 定位一句话 | 可视化构建 AI Agent 与 LLM 工作流：Assistant / Chatflow / Agentflow V2 |
| 状态提示 | 主仓 README 标注 **archived**，并指向 Discussion「Future of Flowise」；文档与 Cloud 仍可访问，评估长期选型需核实后续路线 |

> 对 openmate：Flowise Agentflow V2 把 **Human-in-the-Loop 做成一等公民**（检查点持久化、应用重启后可恢复、工具级 Require Human Input），对「个人自动化 + 敏感动作审批」参考价值高；同时注意仓库 archived 状态。

---

## 1. 产品与架构

### 1.1 三种构建器

| 模型 | 适用 |
|---|---|
| **Assistant** | 最简：指令 + 工具 + 文件 RAG |
| **Chatflow** | 单 Agent / 聊天流，可 Graph RAG、Reranker 等 |
| **Agentflow** | 多 Agent、复杂编排（V1 弃用路径 → **V2 主线**） |

### 1.2 Agentflow V2 核心思想

- 显式工作流编排：节点原生独立执行单元，画布连线即控制流。
- **Flow State**（`$flow.state`）：单次执行的键值共享状态；Start 节点必须声明初始化键；运行节点只能更新既有键；作用域为单次 run，不跨会话。
- 节点依赖 + 执行队列：精确尊重路径，支持循环、条件分支、HITL。
- 与 n8n/Make 的差异强调在 **Agent 间多轮通信**（Supervisor 委派 Worker、全量对话历史可见）。

### 1.3 V2 节点清单（节选）

Start、LLM、Agent、Tool、Retriever、HTTP、Condition、Condition Agent、Iteration、Loop、**Human Input**、Direct Reply、Custom Function（Node.js 服务端 JS）、Execute Flow（子流程调用）。

---

## 2. 四个关键维度

### 2.1 人工审批 / Human-in-the-Loop（产品化最深）

Flowise 官方能力矩阵直接列出 **Human in the Loop**。两种用法：

**A. Human Input 节点（显式暂停）**

- 执行暂停等待人工，**不阻塞运行线程**。
- **每个检查点落盘保存**：应用重启后可从同一点恢复 → 支撑 **长运行有状态 Agent**。
- 展示内容可 Fixed（静态/变量）或 Dynamic（LLM 生成）。
- 输出双锚点：**proceed / reject**；可开启 Feedback 文本窗。
- 与 **Loop 节点**组合：Reject → Loop Back To 原 Agent（Max Loop Count 默认 5）形成「驳回重写」闭环。

**B. Agent 工具级 Require Human Input**

- Agent 选定工具上勾选 **Require Human Input**。
- 底层流程：LLM 产出 tool call → 执行前插入检查点 → 人工批准才真正执行。
- 官方示例：Gmail 建草稿前暂停审批；适合下单、预订、发信等敏感动作。

**C. 外部审阅**

- Executions 面板 → Share 执行轨迹为公开链接。
- 站外用户可直接 **Approve / Reject**（无需 Flowise 账号）。

官方 HITL 教程场景：邮件自动回复 —— 生成草稿 → 人审 → 批准发信 / 驳回带反馈重写。

### 2.2 错误恢复

| 机制 | 说明 |
|---|---|
| **Loop 节点** | 显式回跳已执行节点 + Max Loop Count 防死循环 |
| **Condition / Condition Agent** | 确定性规则分支 vs LLM 语义路由，错误场景可路由到补偿路径 |
| **If-Else 工具节点** | Chatflow 内经典分支 |
| **Moderation** | OpenAI Moderation / Simple Prompt Moderation（Deny list），输入违规可拦截 |
| **Observability** | 执行日志、可视化调试、外部日志流；集成 Langfuse / LangWatch / Arize / Opik / Phoenix / Lunary |
| **Safe zones / Restricted domains** | 安全控制项含受限域（见能力矩阵 Safety & Control） |

注意：相比 Dify 的节点级 None/Default/FailBranch，Flowise 更依赖 **画布分支 + 循环重试** 表达失败恢复，内置「单节点默认值」语义较弱。

### 2.3 沙箱 / 隔离

| 路径 | 说明 |
|---|---|
| **Code Interpreter by E2B** | 工具节点接入 E2B 云沙箱跑 Python |
| **Custom JS Function** | 服务端 Node.js 执行任意 JS；可访问输入变量、`$flow.sessionId/chatId/chatflowId/input/state`、`$vars` 及已 import 库 —— 权限面取决于部署环境，需自控 |
| **Read/Write File 工具** | 直接读写磁盘 —— 生产需 OS 级权限隔离 |
| **安全控制（企业向）** | RBAC、SSO、加密凭据、Secret Manager、Rate Limit、Restricted Domains |
| **自托管形态** | Docker / 各云 Marketplace；支持 air-gapped 部署 |

Custom Function 与 File 工具默认**无硬沙箱**，多租户部署需自建隔离层。

### 2.4 长运行作业

- **HITL 检查点持久化**：暂停可跨进程重启恢复（长审批链）。
- **Queue 模式**：文档 `running-flowise-using-queue`，高吞吐异步消费。
- **Production 指南**：`running-in-production` + Rate Limit 配置。
- **Monitoring / Analytics**：运行历史与外部可观测。
- **Evaluations**：Datasets / Evaluators 做回归。
- **垂直/水平扩展**：官方宣称支持高吞吐工作流负载。

---

## 3. 部署与生态

| 项 | 内容 |
|---|---|
| 快速启动 | `npm i -g flowise` → `npx flowise start` → :3000 |
| Docker | compose / 镜像 |
| 开发 | pnpm mono-repo：`server` / `ui` / `components`；Node ≥ 20 |
| 模型/向量 | OpenAI、Anthropic、Bedrock、Ollama…；Pinecone、Weaviate、Qdrant、pgvector… |
| MCP | Client/Server 节点，SSE、鉴权 |
| 集成出口 | API、JS/Python SDK、CLI、嵌入式 Chatbot、Zapier、Streamlit、Open WebUI |

---

## 4. 对 openmate 的可借鉴点

1. **工具级 Require Human Input**：在 tool-call 与执行之间插入审批，比「整流暂停」粒度更贴敏感动作。
2. **检查点驱动的长运行**：HITL 暂停 + 状态落盘 + 重启续跑，是个人助理长链刚需。
3. **Execution Share Link**：站外审批，无需账号，适合邮件/IM 协作流。
4. **Flow State 契约**：Start 声明键、节点只能更新，状态 schema 可控。
5. **风险**：主仓 archived；Custom JS / 文件工具默认同进程，多租户隔离要自建。

---

## 5. 参考链接

- 文档首页：https://docs.flowiseai.com/readme.md
- Agentflow V2：https://docs.flowiseai.com/using-flowise/agentflowv2.md
- Human In The Loop 教程：https://docs.flowiseai.com/tutorials/human-in-the-loop.md
- 生产运行 / 队列 / 限流：configuration/running-in-production、running-flowise-using-queue、rate-limit
- 文档索引：https://docs.flowiseai.com/llms.txt
