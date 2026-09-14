# 72. FastGPT 架构深度分析

> **仓库**: [labring/FastGPT](https://github.com/labring/FastGPT) (⭐ 29.6k)
> **定位**: 基于 LLM 的知识库平台，提供 RAG 检索、可视化工作流编排、插件系统
> **技术栈**: Next.js + MongoDB + PostgreSQL + Turborepo Monorepo

---

## 1. 整体架构与项目结构

FastGPT 采用 **Turborepo Monorepo** 架构，核心分为三层：

| 层级 | 路径 | 职责 |
|------|------|------|
| **全局共享层** | `packages/global/` | 类型定义、常量、工具函数、i18n，前后端共用 |
| **服务层** | `packages/service/` | 后端核心业务逻辑：AI 调用、工作流调度、知识库检索、权限、计费 |
| **应用层** | `projects/app/` | Next.js Web 应用，页面路由、前端组件、API Routes |

此外还有：
- `sdk/` — 对外 SDK（JS/Python）
- `deploy/` — 部署配置（Docker Compose、Helm Chart）
- `pro/` — 商业版扩展模块（Git Submodule）

这种分层保证了 `packages/global` 和 `packages/service` 可被多个应用（Web、CLI、SDK）复用，避免重复代码。

---

## 2. 工作流引擎（核心）

FastGPT 最核心的架构是其 **可视化工作流引擎**，源码位于 `packages/service/core/workflow/dispatch/`。

### 2.1 节点类型体系

从 `dispatch/constants.ts` 的 `callbackMap` 可以看到完整的节点类型注册表：

```typescript
callbackMap: Record<FlowNodeTypeEnum, (...args: any[]) => unknown> = {
  [FlowNodeTypeEnum.workflowStart]: dispatchWorkflowStart,    // 入口
  [FlowNodeTypeEnum.chatNode]: dispatchChatCompletion,         // AI 对话
  [FlowNodeTypeEnum.datasetSearchNode]: dispatchDatasetSearch, // 知识库检索
  [FlowNodeTypeEnum.classifyQuestion]: dispatchClassifyQuestion, // 意图分类
  [FlowNodeTypeEnum.contentExtract]: dispatchContentExtract,   // 内容提取
  [FlowNodeTypeEnum.agent]: dispatchRunAgent,                   // Agent 节点
  [FlowNodeTypeEnum.toolCall]: dispatchRunTools,                // 工具调用
  [FlowNodeTypeEnum.http468]: dispatchHttp468Request,           // HTTP 请求
  [FlowNodeTypeEnum.codeSandbox]: dispatchCodeSandbox,          // 代码沙箱
  [FlowNodeTypeEnum.ifElse]: dispatchIfElse,                    // 条件分支
  [FlowNodeTypeEnum.loop]: dispatchLoop,                        // 循环
  [FlowNodeTypeEnum.pluginModule]: dispatchRunPlugin,           // 插件
  [FlowNodeTypeEnum.formInput]: dispatchFormInput,              // 表单交互
  [FlowNodeTypeEnum.userSelect]: dispatchUserSelect,            // 用户选择
  // ... 更多节点类型
}
```

### 2.2 调度引擎（dispatchWorkFlow）

核心函数 `dispatchWorkFlow` 是整个工作流的执行引擎，采用 **类 Tarjan 强连通分量算法** 进行图遍历：

```typescript
// 引入 Tarjan 算法进行 DAG 拓扑排序
import { classifyEdgesByDFS, findSCCs, isNodeInCycle, getEdgeType } from '../utils/tarjan';
```

引擎的关键设计：
- **Runtime Node 运行时**：每个节点有独立的运行时状态（输入输出、执行状态）
- **Runtime Edge 运行时**：边携带条件表达式，支持条件路由
- **Interactive 节点暂停/恢复**：支持用户交互节点（表单输入、用户选择），工作流可暂停等待用户响应后继续
- **Debug 模式**：支持单步调试，记录每个节点的输入输出
- **OpenTelemetry Tracing**：集成 `@opentelemetry/api`，每个工作流步骤都有 Span 追踪

### 2.3 变量系统

工作流有完整的变量系统（`WorkflowVariableState`），支持：
- 用户输入变量
- 外部提供变量（`externalProvider`）
- 运行时变量（节点输出）
- 文件上下文变量

---

## 3. RAG 知识库系统

知识库检索是 FastGPT 的核心能力，源码位于 `packages/service/core/dataset/search/`。

### 3.1 混合检索策略

从 `dispatchDatasetSearch` 可以看到支持多种检索模式：

| 模式 | 说明 |
|------|------|
| **向量检索** | 基于 Embedding 模型的语义相似度检索 |
| **全文检索** | 基于关键词的 BM25 检索 |
| **混合检索** | 向量 + 全文加权混合（`DatasetSearchModeEnum.mixedRecall`） |
| **Deep RAG** | 深度检索，使用 LLM 进行多轮迭代搜索 |

### 3.2 辅助模型链

检索管线中集成了多个辅助模型：
- **Embedding 模型**：将查询文本转为向量
- **Rerank 模型**：对检索结果重排序（可配置权重）
- **Query Extension 模型**：查询扩展，将用户问题改写为多个检索查询
- **VLM 模型**：视觉语言模型，用于图片内容检索
- **Deep Search 模型**：深度搜索时使用 LLM 进行迭代推理

### 3.3 数据处理

支持多种文档格式导入：TXT、MD、HTML、PDF、DOCX、PPTX、CSV、XLSX、URL 抓取。提供三种分段方式：
- 直接分段（按固定长度切分）
- QA 拆分（自动生成问答对）
- 手动输入

---

## 4. AI 对话与 Agent 系统

### 4.1 多模型适配

FastGPT 通过 `thirdProvider/` 模块适配多种 LLM 提供商，支持统一的模型调用接口。从代码结构可以看到：
- 标准 Chat Completion 接口
- Function Calling / Tool Use
- 流式响应（SSE）

### 4.2 Agent Loop

Agent 节点（`dispatchRunAgent`）实现了完整的 Agent 循环：
- 自主决定调用哪些工具
- 多轮工具调用迭代
- 错误处理与重试
- 沙箱环境执行代码

### 4.3 双向 MCP 支持

FastGPT 支持 **双向 MCP（Model Context Protocol）**：
- 作为 MCP Client 调用外部 MCP Server 提供的工具
- 作为 MCP Server 暴露自身能力给其他 AI 应用

---

## 5. 插件系统

FastGPT 的插件系统支持热更新，插件本质上是预编排好的工作流片段：

| 插件类型 | 说明 |
|----------|------|
| **系统工具插件** | HTTP 请求、代码执行等系统级能力 |
| **RAG 模块插件** | 自定义检索、处理管线 |
| **Agent Loop 插件** | 自定义 Agent 行为逻辑 |
| **AI 实时生成插件** | 运行时由 AI 动态生成的插件 |

插件通过 `dispatchRunPlugin` 节点运行，可以嵌套调用其他插件，形成组合式编排。

---

## 6. 数据存储架构

### 6.1 MongoDB

作为主数据库，存储：
- 应用配置（App）
- 对话记录（Chat）
- 知识库元数据（Dataset、Collection）
- 用户与团队数据
- 工作流定义

使用 Mongoose ODM，schema 定义在 `packages/service/` 中。

### 6.2 PostgreSQL + pgvector

用于向量存储，支持：
- 高维向量的相似度检索
- 全文检索（BM25）
- 混合检索（向量 + 全文加权）

### 6.3 S3 对象存储

文件存储使用 S3 兼容的对象存储（如 MinIO），用于：
- 文档原始文件
- 图片资源
- 导出文件

---

## 7. 权限与计费系统

### 7.1 多租户权限

- **Team** 团队作为租户单位
- **Member（tmbId）** 团队成员
- API Key 级别的访问控制
- 知识库按团队成员过滤（`filterDatasetsByTmbId`）

### 7.2 Token 计费

从源码中可以看到完整的用量追踪：
```typescript
const totalPoints = formatModelChars2Points({ model, inputTokens, outputTokens });
await createChatUsageRecord({ teamId, tmbId, source: usageSource });
await pushChatItemUsage({ usageId, totalPoints });
```

每次 AI 调用都会记录 Token 消耗并换算为积分（Points），支持：
- 模型级别的 Token 定价
- 团队积分余额检查（`checkTeamAIPoints`）
- 按应用/技能来源追踪用量

---

## 8. 前端架构

基于 **Next.js** 的 SSR/CSR 混合架构：

| 目录 | 职责 |
|------|------|
| `pages/` | Next.js 页面路由 |
| `components/` | 通用 UI 组件 |
| `pageComponents/` | 页面级组件 |
| `web/` | 客户端工具函数 |
| `global/` | 前端全局状态 |

工作流编辑器是前端最复杂的部分，实现了：
- 可视化拖拽画布
- 节点连线（Edge）编辑
- 节点配置面板
- 实时调试模式
- i18n 国际化（正在迁移到 CSR 模式）

---

## 9. 部署与运维

### 9.1 容器化部署

FastGPT 采用 Docker Compose 一键部署，核心服务包括：
- `fastgpt` — 主应用（Next.js）
- `mongodb` — 文档数据库
- `postgresql` + `pgvector` — 向量数据库
- `sandbox` — 代码执行沙箱（隔离环境）

### 9.2 Sealos 云原生集成

FastGPT 由 [Sealos](https://sealos.io/) 团队开发，天然支持 Kubernetes 部署：
- Helm Chart 部署配置
- 水平扩展能力
- 与 Sealos 云平台深度集成

### 9.3 可观测性

- OpenTelemetry 分布式追踪（Span 级别追踪工作流执行）
- 结构化日志系统（`getLogger` + `LogCategories`）
- 工作流运行指标（`observeWorkflowRun`、`observeWorkflowStep`）

---

## 10. 架构亮点与设计哲学

### 10.1 Graph-based Workflow 而非 Chain

FastGPT 选择了 **DAG（有向无环图）** 而非简单的 Chain 模式：
- 支持并行分支执行（`parallelRun`）
- 支持条件路由（`ifElse` 节点）
- 支持循环（`loop` / `loopRun`）
- 使用 Tarjan 算法处理复杂图拓扑

### 10.2 Interactive 节点——工作流暂停/恢复

这是 FastGPT 的独特设计：工作流可以在特定节点暂停，等待用户输入后继续执行。支持：
- 表单输入（`formInput`）
- 用户选择（`userSelect`）
- 支付暂停（`paymentPause`）
- v2 API 的 Stop Sign 机制

### 10.3 热更新插件

所有插件类型均支持热更新，无需重启服务即可：
- 新增/修改系统工具
- 更新 RAG 处理管线
- 调整 Agent 行为

### 10.4 Deep RAG

超越简单的"检索-生成"模式，支持 LLM 驱动的迭代式深度检索：
- 多轮查询扩展
- 迭代推理
- 结果验证与重检索

### 10.5 代码沙箱隔离

代码执行节点（`codeSandbox`）在独立沙箱中运行，支持：
- JavaScript 原生隔离（V8 Isolate）
- Python 独立进程隔离
- 队列并发控制

---

## 总结

FastGPT 是一个**架构成熟、功能完备**的 RAG + 工作流平台。其核心价值在于：

1. **可视化工作流引擎**：基于 DAG 图遍历 + Tarjan 算法，支持复杂编排
2. **深度 RAG 能力**：混合检索 + 多辅助模型链 + 深度搜索
3. **Interactive 工作流**：支持用户交互暂停/恢复，是区别于其他平台的独特能力
4. **Monorepo 工程化**：Turborepo + 三层分包，代码复用率高
5. **生产级特性**：多租户、计费、可观测性、沙箱隔离一应俱全

对于 OpenMate 而言，FastGPT 的工作流引擎设计（尤其是 Interactive 节点和 Tarjan 拓扑排序）和 RAG 检索管线（混合检索 + Deep RAG）是最值得借鉴的架构模式。
