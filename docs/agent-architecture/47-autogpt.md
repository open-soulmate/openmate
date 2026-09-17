# 47. AutoGPT 架构深度分析

> 基于 Significant-Gravitas/AutoGPT 源码分析，覆盖 autogpt_platform（新一代平台）与 classic（经典版）两套架构

## 1. 架构哲学：从自主 Agent 到可视化工作流平台

AutoGPT 的架构经历了根本性演变。早期（classic/）是经典的**自主 Agent 循环**——LLM 自主决定下一步行动、执行工具、观察结果、循环迭代。而新一代 `autogpt_platform/` 则转向了**可视化工作流编排平台**，用户通过拖拽 Block 构建有向图（DAG），由后端执行引擎按拓扑顺序调度执行。

这一转变的核心设计哲学是：**将 Agent 的"推理-行动"循环拆解为可视化的、可审计的、可计费的离散步骤**。每个步骤是一个 Block（节点），步骤之间的数据流通过边（Edge）连接。用户无需理解 Agent 的内部推理过程，只需定义"做什么"和"按什么顺序做"。

```
classic/          →  LLM 自主决策循环（ReAct 风格）
autogpt_platform/ →  可视化 DAG 工作流 + 执行引擎
```

双轨并存是刻意的策略选择：classic 保持 MIT 开源许可供社区使用，platform 采用 Polyform Shield 许可防止被直接作为竞品托管服务售卖。

## 2. 系统分层：四层架构

AutoGPT Platform 采用清晰的四层架构：

```
┌─────────────────────────────────────────┐
│  Frontend (Next.js + React Flow)        │  ← 可视化画布、Agent 管理、Marketplace
├─────────────────────────────────────────┤
│  API Layer (FastAPI)                    │  ← REST + WebSocket，认证、权限、调度
├─────────────────────────────────────────┤
│  Execution Engine (Manager + Scheduler) │  ← DAG 执行、节点调度、成本追踪
├─────────────────────────────────────────┤
│  Blocks & Integrations                  │  ← 40+ 集成节点、LLM 调用、代码执行
└─────────────────────────────────────────┘
```

**Frontend** 基于 Next.js App Router + React Flow 构建可视化工作流编辑器。用户在画布上拖拽 Block、连接边、配置参数，形成完整的 Agent 工作流。技术栈包括 Tailwind CSS、shadcn/ui、Radix UI、React Query（数据获取）、React Hook Form + Zod（表单验证）。使用 pnpm + corepack 管理依赖，Storybook 做组件开发，Playwright 做 E2E 测试。

**API Layer** 使用 Python FastAPI，提供 REST 和 WebSocket 双通道。WebSocket 用于实时推送执行状态更新（节点执行进度、状态变更等）。认证使用 Better Auth（sessions、OAuth、JWT）。

**Execution Engine** 是核心——包含 Manager（执行管理器）、Scheduler（调度器）、BatchExecutor（批量执行器），负责将用户的 Graph 定义转化为实际的节点执行序列。

**Blocks & Integrations** 是能力层，包含 40+ 平台集成（GitHub、Slack、Discord、Notion、HubSpot、Linear、Airtable、Jira、Salesforce、Stripe 等）和多种 AI 能力块（LLM 调用、图像生成、音乐生成、TTS、视频处理等）。

## 3. Block 系统：可组合的执行单元

Block 是 AutoGPT Platform 的核心抽象。每个 Block 是一个独立的执行单元，有明确的输入 Schema 和输出 Schema。

从源码结构看，`backend/blocks/` 目录包含丰富的 Block 实现：

```python
# blocks/_base.py 定义了 Block 基类
# 每个 Block 继承基类并定义：
#   - input_model: Pydantic 模型，定义输入参数
#   - output_model: Pydantic 模型，定义输出参数
#   - run(): 实际执行逻辑
```

Block 分类包括：
- **AI/LLM 类**：`llm.py`（LLM 调用）、`ai_condition.py`（AI 条件判断）、`ai_image_generator_block.py`（图像生成）、`ai_music_generator.py`（音乐生成）、`text_to_speech_block.py`（语音合成）
- **数据处理类**：`data_manipulation.py`、`json_blocks.py`、`text.py`、`maths.py`、`spreadsheet.py`、`sql_query_block.py`
- **集成类**：每个平台一个子目录（`github/`、`slack/`、`discord/`、`notion/`、`hubspot/`、`linear/`、`stripe/` 等）
- **流程控制类**：`branching.py`（分支）、`iteration.py`（循环）、`orchestrator.py`（编排）、`sampling.py`（采样）
- **代码执行类**：`code_executor.py`、`claude_code.py`、`codex.py`
- **人机交互类**：`human_in_the_loop.py`（人工审批）、`autopilot.py`（自动驾驶模式）
- **基础设施类**：`http.py`（HTTP 请求）、`search.py`（搜索）、`rss.py`（RSS 订阅）、`email_block.py`（邮件）

## 4. 执行引擎：DAG 调度与节点管理

执行引擎位于 `backend/executor/` 目录，是整个平台最复杂的模块：

**Manager（manager.py）** 是执行核心，负责：
- 接收 Graph（工作流）定义，解析节点依赖关系
- 按拓扑顺序调度节点执行
- 管理节点执行状态（pending → running → completed/failed）
- 通过 `update_node_execution_status()` 和 `update_graph_execution_stats()` 实时更新状态并广播到前端
- 处理错误传播——`error` 字段始终反映最新的失败信息，确保用户看到的是实际终止执行的错误

**Scheduler（scheduler.py）** 支持定时触发和事件触发，使 Agent 可以按 cron 调度或响应 Webhook 事件自动运行。

**BatchExecutor（batch_executor.py）** 支持批量执行，适用于需要对大量数据集运行相同工作流的场景。

**Simulator（simulator.py）** 提供模拟执行能力，允许用户在不实际调用外部 API 的情况下测试工作流逻辑。

关键执行状态管理：
```python
# 执行状态通过数据库持久化 + WebSocket 实时推送
# GraphExecution: 整个工作流的执行状态
# NodeExecutionResult: 单个节点的执行结果
# ExecutionStatus: pending | running | completed | failed | terminated
```

## 5. SDK 与 Provider 系统：可扩展的集成框架

`backend/sdk/` 提供了构建自定义 Block 和 Provider 的框架：

**ProviderBuilder** 采用 Builder 模式，链式配置 Provider 的元数据：
```python
# builder.py
ProviderBuilder("github")
    .with_description("Issues, PRs, repositories")
    .with_supported_auth_types(CredentialsType.OAUTH2, CredentialsType.API_KEY)
    # ...
```

**Registry（registry.py）** 管理所有已注册的 Block 和 Provider，提供发现和查询能力。

**CostIntegration（cost_integration.py）** 将成本追踪集成到 Block 执行中，每个 Block 的执行都会记录实际的 API 调用成本、token 消耗等。

这种设计使得新增一个平台集成变得标准化：定义 Provider → 实现 Block → 注册到 Registry → 自动出现在前端画布的节点面板中。

## 6. 计费与成本追踪系统

AutoGPT Platform 有完整的计费基础设施，这是其作为商业化产品的关键差异点：

- **`executor/billing.py`**：核心计费逻辑，处理 Agent 运行的成本计算和扣费
- **`executor/cost_tracking.py`**：追踪每次执行的实际成本（模型 token 费、API 调用费等）
- **`blocks/block_cost_tracking_test.py`**：每个 Block 都有成本追踪测试，确保计费准确
- **`executor/billing_reconciliation_test.py`**：计费对账测试，防止成本泄漏

执行流程中嵌入了成本检查：执行前验证余额是否充足，执行中实时追踪消耗，执行后结算。低余额场景（`manager_low_balance_test.py`）和资金不足场景（`manager_insufficient_funds_test.py`）都有专门处理。

## 7. AutoPilot：自然语言到工作流的转换

AutoPilot 是 AutoGPT 的"杀手级"功能——用户用自然语言描述需求，系统自动构建并执行对应的 Agent 工作流。

从源码看，`blocks/autopilot.py` 实现了这一核心逻辑，结合 `copilot/` 模块（AI 辅助）完成从自然语言到 Graph 定义的转换。关键能力包括：

- **意图解析**：理解用户的自然语言需求
- **工作流生成**：自动选择合适的 Block 并编排执行顺序
- **权限管理**（`autopilot_permissions_test.py`）：AutoPilot 生成的工作流可能涉及敏感操作，需要权限审批
- **Codex 集成**（`autopilot_codex_test.py`）：可调用 Codex 进行代码生成和执行

## 8. 经典架构（Classic）：自主 Agent 的原始形态

`classic/` 目录保留了 AutoGPT 的原始架构，分为三个子模块：

- **`original_autogpt/`**：最初的自主 Agent 实现，LLM 自主决策循环
- **`forge/`**：Agent 框架，提供构建自定义自主 Agent 的脚手架
- **`direct_benchmark/`**：基准测试工具（agbenchmark），用于评估 Agent 性能

经典版的 Agent Loop 是标准的 ReAct 模式：
```
Thought → Action → Observation → Thought → ... → Final Answer
```

LLM 在每一步自主决定是调用工具还是给出最终回答，没有人工预定义的工作流。这种模式的优势是灵活性极高，劣势是行为不可预测、难以审计、成本不可控。

## 9. 多 Agent 支持与集群能力

从 executor 模块可以看到多 Agent 和集群执行的支持：

- **`executor/cluster_lock.py`**：集群锁机制，确保分布式部署下的状态一致性
- **`executor/automod/`**：自动调节模块，可能用于 Agent 行为的自动优化
- **`blocks/agent.py`**：Agent Block，允许一个工作流中嵌套调用其他 Agent
- **`blocks/orchestrator.py`**：编排 Block，支持复杂的多 Agent 协作模式

WebSocket 实时通信（`ws.py`）确保前端能实时看到每个 Agent 的执行状态，包括多 Agent 并行执行时的状态同步。

## 10. 部署架构与许可证策略

**部署方式**支持三种：
1. **托管平台**（platform.agpt.co）：官方管理基础设施、模型访问、凭证、可靠性
2. **自托管 Docker**：`docker compose up -d` 一键启动前后端
3. **本地开发**：后端 `poetry run app` + 前端 `pnpm dev`

**许可证策略**精心设计：
- `autogpt_platform/`：Polyform Shield 许可——免费用于个人和内部商业用途，但不能作为竞争性托管服务售卖
- `classic/` 及其他：MIT 许可——完全开源

这种双许可策略保护了商业化路径，同时维护了开源社区的善意。

**技术栈总结**：
| 层级 | 技术 |
|------|------|
| 前端 | Next.js + React Flow + Tailwind + shadcn/ui |
| 后端 | FastAPI (Python) + Poetry |
| 数据库 | PostgreSQL（Prisma ORM） |
| 认证 | Better Auth (OAuth/JWT) |
| 实时通信 | WebSocket |
| 监控 | Sentry |
| 包管理 | pnpm (前端) + Poetry (后端) |
| 容器化 | Docker Compose |

---

**总结**：AutoGPT 从一个"让 GPT 自主完成任务"的实验性项目，演进为一个成熟的可视化 AI Agent 工作流平台。其架构的核心创新在于将 Agent 的自主推理循环解构为可视化的、可审计的、可计费的 Block DAG，同时通过 AutoPilot 保留了自然语言交互的便利性。双轨架构（classic + platform）和双许可策略（MIT + Polyform Shield）体现了开源项目商业化的成熟思考。
