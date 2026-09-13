# 29 - FlowiseAI/Flowise 架构深度分析

> **GitHub**: https://github.com/FlowiseAI/Flowise
> **Star**: 50k+ | **语言**: TypeScript | **许可**: Apache 2.0
> **状态**: 已归档（2026年），推荐查看 [Future of Flowise](https://github.com/FlowiseAI/Flowise/discussions/6727)

## 1. 项目定位与核心价值

Flowise 是一个**可视化 AI 工作流构建器**，定位为低代码/无代码平台，让用户通过拖拽式界面连接 AI 模型、工具、向量存储等组件，构建复杂的对话式 AI 应用。其核心理念是：**将 LangChain 的编排能力可视化**，降低 AI 应用开发门槛。

与 Dify、n8n 等同类产品相比，Flowise 的独特之处在于：它本质上是 **LangChain 的图形化前端**，每个节点都对应一个 LangChain Runnable，执行引擎直接复用 LangChain 的组合操作符。这意味着 LangChain 生态的任何新能力都能快速集成到 Flowise 中。

## 2. 整体架构设计

### 2.1 Monorepo 结构

Flowise 采用 **Turborepo + pnpm workspaces** 管理的 monorepo，包含 4 个核心模块：

```
Flowise/
├── packages/
│   ├── server/          # Express.js 后端，提供 REST API、执行引擎、数据库管理
│   ├── ui/              # React + Vite 前端，ReactFlow 画布编辑器
│   ├── components/      # 第三方节点集成库（LLM、工具、向量存储等）
│   └── api-documentation/ # 自动生成的 Swagger UI API 文档
├── docker/              # Docker Compose 配置
└── pnpm-workspace.yaml
```

### 2.2 分层架构

系统分为三层：

- **可视化编辑器层**（UI）：React + ReactFlow 画布，处理拖拽、节点连接、表单验证
- **运行时编排层**（Server）：Express.js API 服务器，负责流程执行、状态管理、认证鉴权
- **组件集成层**（Components）：插件库，包含 AI 模型、工具、向量存储等所有节点定义

## 3. 数据流与执行模型

### 3.1 五阶段数据管道

```
用户构建流程 → 流程序列化持久化 → 运行时实例化 → 消息处理与编排 → 响应生成与上下文增强
```

1. **可视化流程构建**：用户在 AgentFlow 画布编辑器中拖拽节点、连接边，NodeInputHandler 将 UI 输入转换为 INodeData 结构
2. **流程序列化与持久化**：AssistantsService 接收 FlowDefinition，验证节点配置，序列化为 JSON 存入数据库的 AssistantEntity
3. **运行时实例化**：聊天请求到达时，AssistantsService 加载 AssistantEntity，反序列化流程定义，使用 StorageProviderFactory 和组件注册表实例化实际 AI 组件
4. **消息处理与编排**：运行时按依赖顺序处理 ChatMessage，每个节点（LLM、检索器、工具）转换消息并传递给连接的节点
5. **响应生成与上下文增强**：最终节点生成响应，附加向量数据库的源文档，返回完整的 ChatMessage 及元数据

### 3.2 核心数据模型

| 模型 | 位置 | 说明 |
|------|------|------|
| `FlowDefinition` | `components/src/Interface.ts` | `nodes: INode[], edges: IEdge[], viewport: {...}`，可视化工作流结构 |
| `ChatMessage` | `server/src/Interface.ts` | `message: string, type: 'userMessage' \| 'apiMessage', sourceDocuments?: Document[]` |
| `INodeData` | `components/src/Interface.ts` | `inputs: {[key: string]: any}, outputs: {[key: string]: any}`，节点配置与连接 |
| `AssistantEntity` | `server/src/database/entities/Assistant.ts` | 存储助手配置，包含序列化的 flowData |

## 4. 组件系统（Components）

### 4.1 节点分类

`packages/components/nodes/` 下包含 **26 个节点类别**：

| 类别 | 说明 | 示例 |
|------|------|------|
| `agents/` | AI Agent 实现 | OpenAI Functions Agent, ReAct Agent |
| `chatmodels/` | 聊天模型集成 | ChatOpenAI, ChatOllama, ChatAnthropic |
| `llms/` | 基础 LLM | OpenAI, HuggingFace, Ollama |
| `embeddings/` | 嵌入模型 | OpenAI Embeddings, HuggingFace |
| `vectorstores/` | 向量存储 | Pinecone, Weaviate, Chroma, FAISS |
| `documentloaders/` | 文档加载器 | PDF, CSV, Web Scraping |
| `textsplitters/` | 文本分割器 | Recursive Character Splitter |
| `chains/` | 链式调用 | Conversational Retrieval Chain |
| `memory/` | 对话记忆 | Buffer Memory, Summary Memory |
| `tools/` | 工具集成 | MCP Toolkit, Web Scraper, Calculator |
| `retrievers/` | 检索器 | Vector Retriever, Multi-Query |
| `prompts/` | 提示模板 | Chat Prompt Template, Few-Shot |
| `multiagents/` | 多 Agent | Multi-Agent Supervisor |
| `sequentialagents/` | 顺序 Agent | Sequential Agent Chain |
| `agentflow/` | Agent 工作流 | 条件分支、循环等控制流 |
| `cache/` | 缓存 | Redis Cache, In-Memory Cache |
| `moderation/` | 内容审核 | OpenAI Moderation |
| `outputparsers/` | 输出解析 | Structured Output Parser |
| `analytic/` | 分析追踪 | LangSmith, LangFuse |
| `engine/` | 执行引擎 | Chatflow Engine, Agentflow Engine |

### 4.2 节点发现机制（NodesPool）

`NodesPool` 类是组件系统的核心，负责在服务启动时发现和注册所有节点：

```typescript
// 伪代码
class NodesPool {
    componentNodes: IComponentNodes = {}
    componentCredentials: IComponentCredentials = {}

    async initialize() {
        await this.initializeNodes()      // 扫描 flowise-components 包的 dist/nodes 目录
        await this.initializeCredentials() // 扫描 dist/credentials 目录
    }

    private async loadNodesFromDir(dir: string) {
        // 递归遍历目录，require 每个 .js 文件
        // 实例化 nodeClass，处理图标路径
        // 过滤条件：跳过 Analytic/SpeechToText 类别、社区节点开关、DISABLED_NODES 环境变量
    }
}
```

关键设计：
- **动态发现**：启动时递归扫描 `flowise-components` 包的 `dist/nodes` 目录
- **社区节点控制**：通过 `showCommunityNodes` 配置和 `author` 字段控制是否加载第三方节点
- **禁用机制**：支持 `DISABLED_NODES` 环境变量禁用特定节点
- **凭证管理**：独立扫描 `dist/credentials` 目录，自动关联节点图标

## 5. 服务端架构（Server）

### 5.1 服务初始化流程

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

### 5.2 路由体系

服务端暴露了 **40+ 个路由模块**，涵盖：

- **核心业务**：`predictions/`（聊天预测）、`chatflows/`、`assistants/`
- **向量存储**：`vectors/`、`upsert-history/`
- **文档管理**：`document-store/`、`get-upload-file/`
- **工具与集成**：`tools/`、`openai-assistants/`、`mcp-server/`、`mcp-endpoint/`
- **系统管理**：`apikey/`、`credentials/`、`variables/`、`settings/`
- **公共接口**：`public-chatbots/`、`public-chatflows/`
- **分析与监控**：`stats/`、`log/`、`marketplaces/`
- **调度与执行**：`webhook-listener/`、`leads/`

### 5.3 核心服务层

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

## 6. 队列模式与水平扩展

### 6.1 双模式架构

Flowise 支持两种部署模式，通过环境变量 `EXECUTION_MODE` 控制：

- **标准模式（Standard）**：单进程执行，Express 服务器同时处理 HTTP 请求和工作流执行。适合开发和低流量场景
- **队列模式（Queue）**：基于 Redis + BullMQ 的分布式架构，支持水平扩展。适合生产环境

### 6.2 队列系统设计

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

## 7. 数据库设计

### 7.1 实体模型

使用 TypeORM 管理的 **19 个实体**：

| 实体 | 说明 |
|------|------|
| `ChatFlow` | 聊天流定义（序列化的流程 JSON） |
| `ChatMessage` | 聊天消息记录 |
| `ChatMessageFeedback` | 消息反馈（点赞/点踩） |
| `Assistant` | 助手配置 |
| `Credential` | 加密凭证存储 |
| `Tool` | 自定义工具定义 |
| `ApiKey` | API 密钥管理 |
| `Variable` | 运行时变量 |
| `DocumentStore` | 文档存储元数据 |
| `DocumentStoreFileChunk` | 文档分块 |
| `Dataset` / `DatasetRow` | 评估数据集 |
| `Evaluation` / `EvaluationRun` / `Evaluator` | 评估系统 |
| `Execution` | 执行记录 |
| `Lead` | 用户线索 |
| `UpsertHistory` | 向量化历史 |
| `CustomTemplate` | 自定义模板 |

### 7.2 多数据库支持

通过 TypeORM 抽象层，支持：
- **SQLite**（默认，适合本地开发）
- **MySQL / MariaDB**
- **PostgreSQL**（生产推荐）

## 8. 安全与认证

### 8.1 认证机制

- **API Key 认证**：用于外部 API 调用，支持细粒度权限控制
- **JWT Token 认证**：用于 UI 登录会话
- **令牌刷新循环**：401 错误时自动调用刷新端点并重试原始请求

### 8.2 隐含的安全风险

根据代码分析，存在以下值得关注的问题：
- 请求体验证不足：仅验证 `req.body` 存在，不验证内部结构
- 配额检查与助手创建之间无事务保护，可能造成配额泄漏
- 权限字符串仅验证是否为字符串，不验证是否为有效权限名
- 使用配额缓存（5 分钟 TTL）可能导致短暂的配额超限

## 9. 扩展性与集成

### 9.1 MCP 协议支持

Flowise 内置了 **Model Context Protocol (MCP)** 支持：
- `mcp-server/` — 将 Flowise 工具暴露为 MCP 服务器
- `mcp-endpoint/` — 连接外部 MCP 服务器作为工具源
- `MCPToolkit` 节点用于在工作流中调用 MCP 工具

### 9.2 多 Agent 架构

支持多种 Agent 模式：
- **单 Agent**：`agents/` 下的各种 Agent 类型
- **多 Agent**：`multiagents/` 提供 Multi-Agent Supervisor
- **顺序 Agent**：`sequentialagents/` 提供顺序执行链
- **Agent 工作流**：`agentflow/` 提供条件分支、循环等控制流

### 9.3 存储抽象

`StorageProviderFactory` 提供统一的文件存储抽象：
- 本地文件系统
- AWS S3
- Google Cloud Storage
- Azure Blob Storage

## 10. 部署与运维

### 10.1 部署方式

- **npm 全局安装**：`npm install -g flowise && npx flowise start`
- **Docker**：官方 Dockerfile + Docker Compose
- **云平台一键部署**：支持 Railway、Render、HuggingFace Spaces、Elestio、Sealos 等
- **主流云厂商**：AWS、Azure、GCP、Digital Ocean、阿里云

### 10.2 环境变量配置

核心配置项（`packages/server/.env`）：
- `PORT` — 服务端口（默认 3000）
- `DATABASE_TYPE` — 数据库类型
- `DATABASE_URL` — 数据库连接串
- `EXECUTION_MODE` — 执行模式（standard/queue）
- `REDIS_URL` — Redis 连接（队列模式必需）
- `APIKEY_STORAGE_TYPE` — API Key 存储方式
- `STORAGE_TYPE` — 文件存储类型
- `DISABLED_NODES` — 禁用的节点列表

### 10.3 运行时反馈循环

系统包含 3 个关键反馈循环：
1. **令牌刷新循环**：401 → 刷新令牌 → 重试请求
2. **配额验证循环**：检查使用量 → 对比限制 → 阻止或放行
3. **组件验证循环**：检测无效配置 → 反馈错误 → 用户修正

## 总结

Flowise 的架构体现了**"LangChain 可视化"**的核心理念：通过将 LangChain 的 Runnable 接口映射为可视化节点，实现了低代码 AI 工作流构建。其 monorepo 结构清晰，组件系统高度可扩展，队列模式支持生产级水平扩展。作为已归档项目，其架构设计思想（特别是组件注册表、节点发现机制、双模式执行引擎）对 OpenMate 的 Agent 架构仍有重要参考价值。
