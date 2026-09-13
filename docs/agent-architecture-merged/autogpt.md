# AutoGPT

## 概述

AutoGPT 是一个自主AI Agent。

**仓库**: https://github.com/Significant-Gravitas/AutoGPT | **语言**: Python

## 核心架构

> 基于 Significant-Gravitas/AutoGPT 源码分析，覆盖 autogpt_platform（新一代平台）与 classic（经典版）两套架构

AutoGPT 的架构经历了根本性演变。早期（classic/）是经典的**自主 Agent 循环**——LLM 自主决定下一步行动、执行工具、观察结果、循环迭代。而新一代 `autogpt_platform/` 则转向了**可视化工作流编排平台**，用户通过拖拽 Block 构建有向图（DAG），由后端执行引擎按拓扑顺序调度执行。

这一转变的核心设计哲学是：**将 Agent 的"推理-行动"循环拆解为可视化的、可审计的、可计费的离散步骤**。每个步骤是一个 Block（节点），步骤之间的数据流通过边（Edge）连接。用户无需理解 Agent 的内部推理过程，只需定义"做什么"和"按什么顺序做"。

[详见源码]

**Frontend** 基于 Next.js App Router + React Flow 构建可视化工作流编辑器。用户在画布上拖拽 Block、连接边、配置参数，形成完整的 Agent 工作流。技术栈包括 Tailwind CSS、shadcn/ui、Radix UI、React Query（数据获取）、React Hook Form + Zod（表单验证）。使用 pnpm + corepack 管理依赖，Storybook 做组件开发，Playwright 做 E2E 测试。

**API Layer** 使用 Python FastAPI，提供 REST 和 WebSocket 双通道。WebSocket 用于实时推送执行状态更新（节点执行进度、状态变更等）。认证使用 Better Auth（sessions、OAuth、JWT）。

**Execution Engine** 是核心——包含 Manager（执行管理器）、Scheduler（调度器）、BatchExecutor（批量执行器），负责将用户的 Graph 定义转化为实际的节点执行序列。

**Blocks & Integrations** 是能力层，包含 40+ 平台集成（GitHub、Slack、Discord、Notion、HubSpot、Linear、Airtable、Jira、Salesforce、Stripe 等）和多种 AI 能力块（LLM 调用、图像生成、音乐生成、TTS、视频处理等）。

Block 是 AutoGPT Platform 的核心抽象。每个 Block 是一个独立的执行单元，有明确的输入 Schema 和输出 Schema。

从源码结构看，`backend/blocks/` 目录包含丰富的 Block 实现：

[详见源码]
Thought → Action → Observation → Thought → ... → Final Answer
```

LLM 在每一步自主决定是调用工具还是给出最终回答，没有人工预定义的工作流。这种模式的优势是灵活性极高，劣势是行为不可预测、难以审计、成本不可控。

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

**总结**：AutoGPT 从一个"让 GPT 自主完成任务"的实验性项目，演进为一个成熟的可视化 AI Agent 工作流平台。其架构的核心创新在于将 Ag

## 关键技术

1. **四界面一体**：AutoPilot（自然语言建 Agent）、Agents（运行/成本看板）、Marketplace（社区模板）、Build（可视化画布）
2. **Block 工作流**：拖拽连接/分支/检查节点，支持按需、定时、触发器三种运行模式
3. **45+ 集成**：Gmail、GitHub、Slack、Notion、Salesforce 等；数百模型接入
4. **双路径部署**：托管 Platform（付费）与 self-host（MIT classic/ + Polyform Shield platform/）

- 成本与动作看板：每个 Agent 的运行费用、状态、待处理动作一目了然
- Classic 分支保留 Forge 可编程框架 + agbenchmark 基准测试工具
- 触发器/调度/手动三入口，避免"只能手点"的脆弱模式

## 对openmate的启示

1. **`send_token_limit = max_tokens * 3/4`** — always leave 25% for completion. Simple, portable.
2. **Summary budget = send_limit / 6** — explicit ratio, not magic absolute.
3. **Reject oversized command output** (replace with "don't retry same args") rather than silent truncate — model learns.
4. **cycle_budget vs cycles_remaining** — budget is the policy; remaining is the runtime counter; user can extend mid-run.
5. **SIGINT → cycles_remaining=1** — graceful check-in instead of hard exit.
6. **Plugin pre/post command hooks** — rewrite args/results without forking execute().
7. **Config-awar

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（47-autogpt.md）
- MiMo报告（autogpt-l1.md）
- MiMo卡片（autogpt.md）
