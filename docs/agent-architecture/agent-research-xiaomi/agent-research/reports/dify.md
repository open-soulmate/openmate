# langgenius/dify — 工作流平台 / Agent 节点 / 生产运维 调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/langgenius/dify |
| 文档 | https://docs.dify.ai（本报告依据 2026-09 self-host 文档索引） |
| 语言 | Python（api）+ TypeScript（web / worker） |
| License | Dify Open Source License（Apache 2.0 + 附加条款） |
| 定位一句话 | 开源 LLM 应用平台：可视化 Workflow / Agent / RAG / 插件 / LLMOps，从原型到生产 |
| 部署 | Docker Compose（最低 2C/4G）、源码、Dify Cloud、企业版 |

> 对 openmate：Dify 是「平台级」工作流编排标杆，**节点级错误处理（None / Default Value / Fail Branch）**、**Human Input 人审节点（Web Form + Email + 超时分支）**、**新 Agent 节点自带沙箱**、**Iteration 容错策略** 已产品化，可直接映射到 openmate 的长任务审批与故障恢复。

---

## 1. 系统架构

### 1.1 核心分层

```
┌──────────────────────────────────────────────────────────┐
│ Web App / Embed / REST API / MCP Server / difyctl CLI    │
├──────────────────────────────────────────────────────────┤
│ Orchestrator（Workflow / Chatflow / Agent / Text Gen）   │
│  Start → LLM/Agent/Tool/Code/HTTP → Human Input → Output │
│  If-Else / Question Classifier / Iteration / Loop        │
│  Trigger：Schedule / Webhook / Integration               │
├──────────────────────────────────────────────────────────┤
│ Knowledge（RAG Pipeline）+ Plugins + Model Providers     │
│ Observability（内置 Dashboard + Langfuse/Opik/Phoenix…） │
├──────────────────────────────────────────────────────────┤
│ 运行时：api + worker + sandbox 服务 + db/redis/对象存储   │
└──────────────────────────────────────────────────────────┘
```

### 1.2 节点体系（Workflow 关键）

| 类别 | 节点 |
|---|---|
| 模型/智能 | LLM、Agent（Classic + New）、Knowledge Retrieval、Parameter Extractor、Question Classifier |
| 逻辑控制 | If-Else、Iteration、Loop、Variable Aggregator、List Operator、Template、Code |
| 集成 | HTTP Request、Tool Node、Document Extractor、Human Input |
| 触发 | Start、Schedule Trigger、Webhook Trigger、Plugin Trigger |
| 输出 | Answer（Chatflow）、Output |

### 1.3 Agent 节点双轨

- **Classic Agent**：Function Calling / ReAct 策略；Max Iterations 防死循环；TokenBufferMemory；输出含 Final Answer、Tool Outputs、Reasoning Trace、Iteration Count、Success Status、Agent Logs。
- **New Agent（beta）**：完整 worker + **独立沙箱**；可邀请已发布 Agent 或节点内一次性构建；声明输出（text / 结构化 / 文件，文件默认上限 50MB，`DIFY_AGENT_STUB_UPLOAD_FILE_SIZE_LIMIT` 可调）；跨节点不共享沙箱状态。

---

## 2. 四个关键维度深潜

### 2.1 错误恢复（Error Recovery）

**节点级预置错误处理**（LLM / HTTP / Code / Tool）三种行为：

| 行为 | 语义 | 典型用途 |
|---|---|---|
| **None**（默认） | 失败即整流停止，返回原始错误 | 调试期；该步不可绕过 |
| **Default Value** | 注入与输出类型匹配的备份值，继续执行 | 限流时返回「稍后重试」文案 |
| **Fail Branch** | 失败走橙色独立分支 | 换备份 API、告警、写日志 |

失败分支可读变量：`error_type`、`error_message`，可按类型分支（如 `rate_limit` vs 其他）。

**Loop / Iteration 子节点失败策略**：

- **Loop**：任一子节点失败 → 立即终止整个 Loop 并返回错误。
- **Iteration** 可配置：
  - `terminated`：任一 item 失败即停（默认）
  - `continue-on-error`：跳过失败项，输出数组对应位置为 `null`
  - `remove-abnormal-output`：跳过并从最终数组剔除失败结果

**错误类型体系**（debug/error-type）：

- Code：`CodeNodeError` / `OutputValidationError` / `DepthLimitError` / `CodeExecutionError`（沙箱服务不可用）
- LLM：`VariableNotFoundError` / `ModelNotExistError` / `LLMModeRequiredError` / `InvalidVariableTypeError` 等
- HTTP：`AuthorizationConfigError` / `ResponseSizeError`（10MB 上限）/ `InvalidURLError`
- Tool：`ToolParameterError` / `ToolInvokeError` / `ToolProviderNotFoundError`
- 系统级：`InvokeConnectionError` / `InvokeServerUnavailableError` / `InvokeRateLimitError` / `QuotaExceededError`

生产可观测：内置 Dashboard、Logs、Annotation Reply；集成 Langfuse / Opik / Phoenix / LangSmith / W&B Weave / Arize / 阿里云 ARMS（OpenTelemetry）。

### 2.2 沙箱（Sandbox）

- **Code 节点**：自定义 Python / JavaScript 在平台沙箱执行；异常归为 `CodeNodeError` / `CodeExecutionError`。
- **New Agent 节点**：每个 Agent 实例自带隔离沙箱；同名 Agent 多次调用互不共享文件/工具安装；生产需替换 `DIFY_AGENT_SERVER_SECRET_KEY`、`DIFY_AGENT_API_TOKEN`。
- **安全边界声明**：社区版用文件访问控制降低跨会话风险，**明确不承诺**互不信任多租户的硬化隔离；强隔离建议企业版/Cloud 或外接硬基础设施。

### 2.3 长任务 / 长运行作业

- **Trigger 体系**：Schedule（定时）、Webhook、Plugin Trigger —— 无界面后台长跑入口。
- **Human Input 超时**：默认开放 **3 天**，超时走 timeout 分支；支持长周期异步审批。
- **Loop 节点**：循环变量跨轮累积 + 终止条件表达式 + Max Loop Count + Exit Loop，适合「内容精修 / 质量闭环」类长迭代。
- **Iteration**：数组逐项处理，支持并行与容错策略，适合批量长任务。
- **版本控制 / Snippets / 实时协作**：长项目可回滚与节点组复用。
- **Observability**：按日志保留策略回看历史运行，支撑审计与排障。

### 2.4 人工审批（Human-in-the-Loop）

**Human Input 节点**是平台级 HITL 原语：

| 能力 | 细节 |
|---|---|
| 投递方式 | Web App 表单（Trigger 启动的流不可用）；Email 链接（工作区成员 / 外部邮箱；持链可答，无需 Dify 账号） |
| 表单内容 | Markdown 展示动态变量（上游 LLM `text` 等）；字段：Paragraph（可选）、Select、Single File、File List（必填字段未填则按钮禁用） |
| 用户动作 | 多按钮分支（如 Approve / Apply Edit / Regenerate），`__action_id` / `__action_value` 下游可读 |
| 超时 | 默认 3 天，走超时分支；未接超时分支则流结束 |
| 下游数据 | `__rendered_content`（完整表单）、字段变量、文件变量 |
| API 驱动 | 外部客户端可通过 Service API 驱动 Web App 表单生命周期 |

**典型内容审核流**：起草 → Human Input（预填草稿可编辑 + feedback）→ Approve 走原稿 / Apply Edit 走编辑稿 / Regenerate 走「按反馈重写 + 校验是否满足反馈」双 LLM。

---

## 3. 生产运维要点

| 主题 | 要点 |
|---|---|
| 最低资源 | 2 Core / 4 GiB；Docker Compose 一键起 |
| 规模 | 自部署 Community / Dify Cloud（Sandbox 含 200 次 GPT-4）/ 企业版 |
| 集成出口 | REST API、MCP Server（供 Claude Desktop / Cursor 等）、Web App Embed、difyctl CLI |
| 工作区治理 | Workspace 成员角色、应用管理、敏感内容审核扩展点、外部数据工具 API |
| 数据 | Knowledge 分块/索引/检索配置；外部知识 API；Notion / 网站同步 |

---

## 4. 对 openmate 的可借鉴点

1. **错误处理三态**（停 / 默认值 / 失败分支 + `error_type`）可直接作为工具节点协议。
2. **Human Input** 的「表单 + 多动作按钮 + 超时分支 + 邮件外发」是审批产品化完整形态。
3. **New Agent 每实例独立沙箱 + 声明式输出（含文件）** 对应 openmate 工具隔离与结果契约。
4. **Iteration 三种容错模式**适合批量研究/采集任务的部分失败语义。
5. **Loop 终止条件 + 循环变量**适合「迭代精修直至质量达标」。
6. **生产侧明确安全边界**（社区版不承诺硬隔离）值得在 openmate 文档中同样诚实声明。

---

## 5. 参考链接

- Workflow & 错误处理：https://docs.dify.ai/en/self-host/use-dify/build/predefined-error-handling-logic.md
- Human Input：https://docs.dify.ai/en/self-host/use-dify/nodes/human-input.md
- Agent 节点：https://docs.dify.ai/en/self-host/use-dify/nodes/agent.md
- Error Types：https://docs.dify.ai/en/self-host/use-dify/debug/error-type.md
- Loop：https://docs.dify.ai/en/self-host/use-dify/nodes/loop.md
- 文档总索引：https://docs.dify.ai/llms.txt
