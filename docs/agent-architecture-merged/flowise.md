# Flowise

## 概述

Flowise 是一个可视化LLM工作流。

**仓库**: https://github.com/FlowiseAI/Flowise | **语言**: TypeScript | **License**: Apache-2.0

## 核心架构

> **GitHub**: https://github.com/FlowiseAI/Flowise
> **Star**: 50k+ | **语言**: TypeScript | **许可**: Apache 2.0
> **状态**: 已归档（2026年），推荐查看 [Future of Flowise](https://github.com/FlowiseAI/Flowise/discussions/6727)

系统分为三层：

- **可视化编辑器层**（UI）：React + ReactFlow 画布，处理拖拽、节点连接、表单验证
- **运行时编排层**（Server）：Express.js API 服务器，负责流程执行、状态管理、认证鉴权
- **组件集成层**（Components）：插件库，包含 AI 模型、工具、向量存储等所有节点定义

`FlowiseExpress` 类采用**两阶段初始化**模式：

**阶段一：数据库初始化**
1. 数据库连接（TypeORM，支持 SQLite/MySQL/MariaDB/PostgreSQL）
2. 数据库迁移
3. 组件注册表初始化（NodesPool）
4. 缓存池初始化（CachePool）
5. 遥测初始化
6. 队列管理器初始化（QueueManager）

**阶段二：中间件配置**
1. Express 中间件栈（CORS、Body Parser、静态文件）
2. 认证中间件（API Key 或 JWT）
3. 路由挂载
4. 错误处理中间件

Flowise 支持两种部署模式，通过环境变量 `EXECUTION_MODE` 控制：

- **标准模式（Standard）**：单进程执行，Express 服务器同时处理 HTTP 请求和工作流执行。适合开发和低流量场景
- **队列模式（Queue）**：基于 Redis + BullMQ 的分布式架构，支持水平扩展。适合生产环境

`QueueManager` 采用单例模式，管理三种队列：

| 队列 | 类名 | 用途 |
|------|------|------|
| `prediction` | `PredictionQueue` | 聊天预测任务 |
| `upsert` | `UpsertQueue` | 文档向量化任务 |
| `schedule` | `ScheduleQueue` | 定时任务执行 |

`BaseQueue` 抽象类提供：
- 基于 BullMQ 的 `Queue` 和 `Worker` 管理
- 可配置的并发数（`WORKER_CONCURRENCY`，默认 100000）
- 任务生命周期管理（失败重试、完成清理）
- Redis 事件流（`QueueEvents`）用于实时状态更新
- Bull Board 集成用于队列监控

关键配置：
```bash
REDIS_URL=redis://localhost:6379    # Redis 连接
QUEUE_NAME=flowise-queue             # 队列名称前缀
WORKER_CONCURRENCY=100000            # Worker 并发数
QUEUE_REDIS_EVENT_STREAM_MAX_LEN=10000  # 事件流最大长度
```

支持多种 Agent 模式：
- **单 Agent**：`agents/` 下的各种 Agent 类型
- **多 Agent**：`multiagents/` 提供 Multi-Agent Supervisor
- **顺序 Agent**：`sequentialagents/` 提供顺序执行链
- **Agent 工作流**：`agentflow/` 提供条件分支、循环等控制流

## 关键技术

Flowise 是一个**可视化 AI 工作流构建器**，定位为低代码/无代码平台，让用户通过拖拽式界面连接 AI 模型、工具、向量存储等组件，构建复杂的对话式 AI 应用。其核心理念是：**将 LangChain 的编排能力可视化**，降低 AI 应用开发门槛。

与 Dify、n8n 等同类产品相比，Flowise 的独特之处在于：它本质上是 **LangChain 的图形化前端**，每个节点都对应一个 LangChain Runnable，执行引擎直接复用 LangChain 的组合操作符。这意味着 LangChain 生态的任何新能力都能快速集成到 Flowise 中。

| 模型 | 位置 | 说明 |
|------|------|------|
| `FlowDefinition` | `components/src/Interface.ts` | `nodes: INode[], edges: IEdge[], viewport: {...}`，可视化工作流结构 |
| `ChatMessage` | `server/src/Interface.ts` | `message: string, type: 'userMessage' \| 'apiMessage', sourceDocuments?: Document[]` |
| `INodeData` | `components/src/Interface.ts` | `inputs: {[key: string]: any}, outputs: {[key: string]: any}`，节点配置与连接 |
| `AssistantEntity` | `server/src/database/entities/Assistant.ts` | 存储助手配置，包含序列化的 flowData |

`NodesPool` 类是组件系统的核心，负责在服务启动时发现和注册所有节点：

[详见源码]

关键设计：
- **动态发现**：启动时递归扫描 `flowise-components` 包的 `dist/nodes` 目录
- **社区节点控制**：通过 `showCommunityNodes` 配置和 `author` 字段控制是否加载第三方节点
- **禁用机制**：支持 `DISABLED_NODES` 环境变量禁用特定节点
- **凭证管理**：独立扫描 `dist/credentials` 目录，自动关联节点图标

服务目录包含 20+ 个服务模块，按职责划分：

- `predictions/` — 聊天预测核心逻辑
- `assistants/` — 助手管理（创建、更新、删除）
- `chatflows/` — 聊天流管理
- `document-store/` — 文档存储与向量化
- `vectors/` — 向量数据库操作
- `mcp-server/`、`mcp-endpoint/` — MCP 协议支持
- `openai-assistants/` — OpenAI Assistants API 集成
- `schedule/` — 定时任务调度
- `tools/` — 工具管理
- `variables/` — 变量管理

- **API Key 认证**：用于外部 API 调用，支持细粒度权限控制
- **JWT Token 认证**：用于 UI 登录会话
- **令牌刷新循环**：401 错误时自动调用刷新端点并重试原始请求

根据代码分析，存在以下值得关注的问题：
- 请求体验证不足：仅验证 `req.body` 存在，不验证内部结构
- 配额检查与助手创建之间无事务保护，可能造成配额泄漏
- 权限字符串仅验证是否为字符串，不验证是否为有效权限名
- 使用配额缓存（5 分钟 TTL）可能导致短暂的配额超限

Flowise 内置了 **Model Context Protocol (MCP)** 支持：
- `mcp-server/` — 将 Flowise 工具暴露为 MCP 服务器
- `mcp-endpoint/` — 连接外部 MCP 服务器作为工具源
- `MCPToolkit` 节点用于在工作流中调用 MCP 工具

核心配置项（`packages/server/.env`）：
- `PORT` — 服务端口（默认 3000）
- `DATABASE_TYPE` — 数据库类型
- `DATABASE_URL` — 数据库连接串
- `EXECUTION_MODE` — 执行模式（standard/queue）
- `REDIS_URL` — Redis 连接（队列模式必需）
- `APIKEY_STORAGE_T

## 对openmate的启示

> 仓库: https://github.com/FlowiseAI/Flowise  
> 抓取通道: cdn.jsdelivr.net/gh/FlowiseAI/Flowise@main  
> 版本快照: main @ 2026-09-13（package.json v3.1.4；README 归档声明）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供可视化 Agent 构建、mono-repo 模块划分、执行安全边界、部署矩阵与归档教训借鉴

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（29-flowise.md）
- 豆包（046_Flowise.md）
- MiMo报告（flowise.md）
