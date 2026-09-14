# microsoft/agent-framework — 多语言 Agent / Workflow / Durable 调研报告

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/microsoft/agent-framework（~13.5k★）；Go：microsoft/agent-framework-go |
| 文档 | https://learn.microsoft.com/agent-framework |
| 语言 | Python（`python/`）、.NET（`dotnet/`）、Go（独立仓） |
| License | MIT |
| 定位一句话 | 面向生产的开源多语言 Agent 与多 Agent 工作流框架（Semantic Kernel + AutoGen 的继任者） |
| 生态 | Microsoft Foundry、Azure OpenAI、OpenAI、GitHub Copilot SDK、Anthropic、Ollama 等 |

> 对 openmate：MAF 把 **图式多 Agent 工作流（sequential/concurrent/handoff/group）**、**checkpoint / time-travel / HITL**、**Durable Task 扩展（Azure Functions + 状态持久化）**、**Harness Agent（规划 todo、上下文压缩、文件记忆、don’t-ask-again 审批）** 做成企业向基线。仓库存在，按源码与 Learn 文档调研。

---

## 1. 系统架构

### 1.1 四大板块

| 板块 | 说明 |
|---|---|
| **Agents** | 单 Agent：LLM + tools + MCP；多 provider |
| **Harness Agent** | 「有主见」的长任务 Agent：规划/todo、上下文压缩、文件访问与记忆、工具审批、可观测 |
| **Workflows** | 图式编排：顺序、并发、handoff、群组协作；显式执行路径 |
| **Integrations** | 模型、工具、中间件、评估、UI |

### 1.2 仓库结构

```
python/packages/     agent-framework 核心与 providers
dotnet/src/          Microsoft.Agents.AI*
docs/decisions/      ADR（如 agent skills 设计）
declarative-agents/  YAML 声明式 Agent
python/samples/
  01-get-started
  02-agents          tools / middleware / providers / observability
  03-workflows
  04-hosting         A2A、Foundry hosted agents、self-hosted helpers
  05-end-to-end
```

Durable 独立仓：**microsoft/agent-framework-durable-extension**（.NET DurableTask + Azure Functions；Python `packages/durabletask`）。

### 1.3 Agent vs Workflow 选择

| 用 Agent | 用 Workflow |
|---|---|
| 开放式/对话式 | 步骤明确 |
| 自主工具与规划 | 需要显式控制顺序 |
| 单次 LLM（可带工具）足够 | 多 Agent/函数必须协调 |

官方提示：能写成函数就不要上 Agent。

---

## 2. 四个关键维度深潜

### 2.1 长任务 / 持久化（Durable）

**Workflow 能力（README）**：checkpointing、streaming、human-in-the-loop、**time-travel**。

**Durable Extension**：

- .NET：`Microsoft.Agents.AI.DurableTask` + `Microsoft.Agents.AI.Hosting.AzureFunctions`
- Python：`agent-framework` 的 durabletask 包
- 依赖 **Durable Task Scheduler**（可用 emulator；Azure 存储/Azurite、Redis）
- 样例：`DurableAgents/`、`DurableWorkflows/`
- 集成测试环境变量示例：`DURABLE_TASK_SCHEDULER_CONNECTION_STRING`、`AzureWebJobsStorage`、`REDIS_CONNECTION_STRING`

语义对齐 Azure Durable Functions：编排状态外置，崩溃后可从检查点恢复，长等待不占计算资源。

### 2.2 Harness Agent（个人/编码助理向）

Learn overview 明确列出：

- 规划与 todo tracking
- **上下文压缩（compaction）**
- 文件访问与记忆
- **don’t-ask-again 工具审批**（敏感动作一次批准可记策略）
- 可观测

这与 openmate「编码 + 个人助手」混合形态高度同构。

### 2.3 错误恢复 / 中间件

- **Middleware 管道**：请求/响应拦截、异常处理、自定义策略
- Workflow 图上可表达补偿/分支（显式路径，而非纯 prompt 重试）
- Durable 层提供重试与检查点恢复（编排级）
- OpenTelemetry 内置（Python observability sample、.NET telemetry sample）
- 声明式 Agent（YAML）利于版本化与回滚

### 2.4 工具鉴权 / 安全

- **Azure 凭据**：`AzureCliCredential` / `DefaultAzureCredential`；生产建议换 `ManagedIdentityCredential`（避免 fallback 探测延迟与风险）
- MCP tools：`agents/tools/hosted-mcp-tools`
- 第三方系统风险由调用方负责（Transparency FAQ）
- Agent Skills：从文件/内联代码/类库构建领域技能（ADR 0037）
- Foundry Hosted Agents：少改代码即可托管部署

---

## 3. 部署与托管

| 路径 | 说明 |
|---|---|
| 本地 Python | `pip install agent-framework` |
| .NET | `dotnet add package Microsoft.Agents.AI`（+ Foundry 包） |
| Foundry Hosted | 两行代码级接入 |
| Azure Functions | Durable extension 宿主 |
| A2A | `04-hosting` 样例 |
| DevUI | 交互式调试/测试工作流 |

---

## 4. 对 openmate 的可借鉴点

1. **P0 — Harness Agent 能力清单**：规划 todo、上下文压缩、文件记忆、审批策略——可直接作为 openmate 核心 Agent 规格。
2. **P0 — Durable Task 外置编排状态**：长任务检查点进调度器/DB，进程死后续跑；与 n8n durable scheduler 互补（一个偏编排图，一个偏调度队列）。
3. **P1 — Workflow 显式图 + handoff/group**：多 Agent 协作要可控路径，而不是纯对话委派。
4. **P1 — Middleware 统一横切**：超时、重试、审计、审批插入点标准化。
5. **P1 — Time-travel / checkpoint**：调试长链可回放，对「测试暴露各种问题」的 openmate 很有用。
6. **P2 — 生产凭据纪律**：开发可用 DefaultAzureCredential，生产必须具体 credential。
7. **P2 — 双语言 API 一致性**：若 openmate 多端（服务端 TS / 本地 Python），MAF 的跨语言对齐方法可参考。

---

## 5. 参考链接

- 主仓 README：https://github.com/microsoft/agent-framework
- Learn Overview：https://learn.microsoft.com/agent-framework/overview/agent-framework-overview
- Harness Agent：https://learn.microsoft.com/agent-framework/concepts/harness
- Durable extension：https://github.com/microsoft/agent-framework-durable-extension
- 迁移指南：SK / AutoGen → Agent Framework
