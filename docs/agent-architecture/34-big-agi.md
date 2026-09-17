# 34. Big-AGI 架构深度分析

> **项目**: [enricoros/big-AGI](https://github.com/enricoros/big-AGI)  
> **版本**: 2.1.1  
> **Stars**: 7.1k | **Commits**: 8,685 | **Forks**: 1.6k  
> **许可证**: MIT  
> **定位**: 面向专家的多模型 AI 工作空间

---

## 1. 项目定位与核心理念

Big-AGI 是一个**独立的、非 VC 资助**的开源 AI 套件，定位为"面向专家的多模型 AI 工作空间"。其核心哲学是：**AI 应该提升你，而不是取代你**。这体现在三个支柱上：

- **Intelligence（智能）**: Beam 多模型去幻觉、原生搜索、支持最新模型（Opus 5、GPT-5.6、Gemini 3.7 等）
- **Control（控制）**: Personas 系统、数据所有权、请求检查、自带 API Key、无厂商锁定
- **Speed（速度）**: Local-first 架构、零延迟、极致优化的 Web 应用

商业模式上，采用**免费开源 + Pro 订阅（$10.99/月）**的模式，Pro 提供跨设备同步和 1GB 存储，订阅收入资助所有开发。

---

## 2. 技术栈与框架选型

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| **框架** | Next.js 15.1 (Pages Router) | 使用 Pages Router 而非 App Router，保留 `_app.tsx` 入口 |
| **语言** | TypeScript 6.x | 全量类型安全 |
| **UI 库** | MUI Joy 5.0 (beta) + Emotion | Joy 是 MUI 的新设计系统，比 Material 更轻量 |
| **状态管理** | Zustand 5.0 | 轻量级状态管理，取代 Redux |
| **数据层** | tRPC 11 + Prisma 5.22 + Dexie 4 | tRPC 做端到端类型安全 API，Prisma 做服务端 ORM，Dexie 做 IndexedDB 客户端存储 |
| **查询** | TanStack React Query 5 | 与 tRPC 集成的异步状态管理 |
| **Markdown** | react-markdown + remark-gfm + rehype-katex | 支持 GFM、数学公式、代码高亮 |
| **语音** | tesseract.js (OCR) + tiktoken (分词) | 客户端 OCR 和 token 计算 |
| **拖拽** | @dnd-kit | 对话排序、面板拖拽 |
| **分析** | PostHog + Vercel Analytics | 可选的隐私分析 |

关键决策：**选择 Pages Router 而非 App Router**，表明项目在 App Router 成熟前就已启动，且 Pages Router 的 per-page layout 模式（通过 `Component.getLayout`）在减少页面切换闪烁方面效果更好。

---

## 3. 目录结构与模块化设计

```
big-AGI/
├── app/api/              # tRPC API 路由（cloud/ 和 edge/ 两种部署）
├── pages/                # Next.js 页面路由
│   ├── index.tsx         # 主聊天页（/）
│   ├── call.tsx          # 语音通话（/call）
│   ├── draw.tsx          # 图像生成（/draw）
│   ├── diff.tsx          # 文本对比（/diff）
│   ├── personas.tsx      # Personas 管理
│   ├── tokens.tsx        # Token 分析
│   ├── news.tsx          # 更新日志
│   └── link/             # 分享链接聊天
├── src/
│   ├── apps/             # 应用层（页面对应的完整功能模块）
│   │   ├── chat/         # 核心聊天应用
│   │   ├── call/         # 语音通话应用
│   │   ├── beam/         # Beam 多模型对比
│   │   ├── draw/         # 图像生成
│   │   ├── diff/         # 文本对比
│   │   ├── personas/     # Persona 管理
│   │   └── settings-modal/ # 设置面板
│   ├── common/           # 共享基础设施
│   │   ├── stores/       # Zustand 状态仓库
│   │   ├── components/   # 通用 UI 组件
│   │   ├── layout/       # 布局系统（Optima）
│   │   ├── providers/    # React Providers
│   │   ├── tokens/       # Token 计算
│   │   └── util/         # 工具函数
│   ├── modules/          # 功能模块（按领域划分）
│   │   ├── aix/          # AI 交互框架（核心）
│   │   ├── llms/         # LLM 供应商抽象层
│   │   ├── beam/         # Beam 多模型引擎
│   │   ├── blocks/       # 消息块渲染系统
│   │   ├── browse/       # 网页浏览
│   │   ├── t2i/          # 文本转图像
│   │   ├── speex/        # 语音合成
│   │   ├── persona/      # Persona 引擎
│   │   ├── trade/        # 数据导入导出
│   │   └── youtube/      # YouTube 转录
│   └── server/           # 服务端代码（Prisma schema 等）
└── tools/                # 开发工具（代码生成等）
```

架构采用 **三层分离**：`apps/`（应用层）→ `modules/`（功能模块）→ `common/`（基础设施），职责清晰。

---

## 4. 状态管理架构

Big-AGI 使用 **Zustand** 作为全局状态管理，并按领域拆分为多个独立 store：

| Store | 职责 |
|-------|------|
| `store-ai.ts` | AI 相关配置（模型选择、参数） |
| `store-client.ts` | 客户端状态（用户偏好） |
| `store-ui.ts` | UI 状态（主题、布局） |
| `store-ux-labs.ts` | 实验性功能开关 |
| `stores/chat/` | 对话管理（核心业务状态） |
| `stores/llms/` | LLM 服务配置 |
| `stores/folders/` | 对话文件夹组织 |
| `stores/metrics/` | 使用指标和统计 |
| `stores/blob/` | 二进制对象存储 |
| `stores/workspace/` | 工作区状态 |

**数据持久化策略**：
- **客户端**: 使用 **Dexie**（IndexedDB 包装器）存储对话历史，实现 Local-first
- **服务端**: 使用 **Prisma** + SQLite/PostgreSQL 做可选的云端同步
- **实时性**: Zustand 的订阅机制保证 UI 即时更新

这种**双存储架构**（IndexedDB 本地 + Prisma 云端）是 Big-AGI "Local-first" 理念的技术实现。

---

## 5. LLM 供应商抽象层

Big-AGI 的 LLM 集成是其最核心的架构亮点。`src/modules/llms/` 实现了一个**统一的供应商抽象层**：

### 供应商注册表（Vendor Registry）

`vendors.registry.ts` 维护一个供应商注册表，每个供应商实现 `IModelVendor` 接口：

```typescript
// IModelVendor.ts - 供应商接口
interface IModelVendor {
  // 供应商元数据
  id: string;
  name: string;
  icon: React.ComponentType;
  
  // 模型列表获取
  listModels(): Promise<ModelDefinition[]>;
  
  // 创建聊天完成请求
  createChatCompletion(request: ChatRequest): Promise<ChatResponse>;
  
  // 供应商特定配置 UI
  ServiceSetupComponent: React.ComponentType;
}
```

### 已支持的 24+ 供应商

| 类别 | 供应商 |
|------|--------|
| **多模态服务** | Anthropic, AWS Bedrock, Azure, Google Gemini, Meta AI, OpenAI |
| **LLM 服务** | Alibaba, DeepSeek, Groq, Mistral, Moonshot, NVIDIA NIM, OpenRouter, Perplexity, Together AI, xAI, Z.ai, Cerebras, Cohere, Sakana AI |
| **本地服务** | Ollama, LM Studio, LocalAI |
| **通用兼容** | Modular (任意 OpenAI 兼容端点) |

每个供应商目录包含：模型定义、API 适配器、配置 UI 组件。这种**插件式供应商架构**使得添加新供应商只需创建一个新目录。

---

## 6. AIX 框架 — AI 交互核心

`src/modules/aix/` 是 Big-AGI 2.0 引入的核心框架，分为 `client/` 和 `server/` 两部分：

- **client/**: 前端侧的 AI 请求构建、流式响应处理、消息编排
- **server/**: 后端侧的 API 代理、请求转发、流式 SSE 处理

AIX 框架的设计目标是**统一所有 AI 交互模式**：
- 标准聊天补全
- Beam 多模型并行请求
- 图像生成请求
- 语音合成请求
- 推理模型（o3、R1）的思维链处理

通过 AIX，Big-AGI 实现了"一次编写，多供应商运行"的能力，新功能（如 Beam 2）可以复用同一套流式处理管道。

---

## 7. Beam — 多模型验证引擎

Beam 是 Big-AGI 最具差异化的功能，约 35% 的用户每天使用。其架构特点：

- **并行请求**: 同时向多个 LLM 发送同一提示
- **结果对比**: 并排展示多个模型的输出
- **Merge 合并**: 从多个结果中选择最佳答案或合并
- **Preset 预设**: 保存常用的模型组合
- **Follow-up 追问**: 对 Beam 结果进行追问

Beam 2（2.0 版本）新增了多模态支持、程序化 Beam、追问和预设保存，从简单的"多模型对比"进化为完整的**AI 验证工作流**。

技术实现上，Beam 依赖 AIX 框架的并行流式处理能力，通过 `@tanstack/react-query` 管理多个并发请求的状态。

---

## 8. 消息块渲染系统（Blocks）

`src/modules/blocks/` 实现了一个**结构化消息块渲染系统**。每条 AI 消息不是纯文本，而是由多种"块"组成：

- 文本块（Markdown 渲染）
- 代码块（语法高亮 + 执行）
- 图像块（内联显示）
- 表格块（可导出 CSV）
- 思维链块（推理过程展示）
- 工具调用块（函数调用结果）
- 引用块（搜索结果引用）

这种块化设计使得不同内容类型可以独立渲染、交互和导出，也为 Beam 的结果对比提供了结构化基础。

---

## 9. 应用路由与导航系统

### 路由设计

Big-AGI 使用 Next.js Pages Router，路由定义集中在 `app.routes.ts`：

| 路由 | 应用 | 说明 |
|------|------|------|
| `/` | Chat | 主聊天界面 |
| `/call` | Call | 语音通话 |
| `/draw` | Draw | 图像生成（开发中） |
| `/diff` | Diff | 文本对比 |
| `/personas` | Personas | Persona 管理 |
| `/tokens` | Tokens | Token 分析（开发者工具） |
| `/news` | News | 更新日志 |
| `/link/chat/[id]` | Link Chat | 分享的聊天 |

### 导航系统

`app.nav.ts` 定义了完整的导航配置，支持三种类型的导航项：

1. **NavItemApp**: 应用页面（带路由）
2. **NavItemModal**: 模态框（设置、模型配置）
3. **NavItemExtLink**: 外部链接（Discord、GitHub）

导航项支持丰富的显示控制：`hideOnMobile`、`hideBar`、`hideDrawer`、`panelAsMenu`、`fullWidth` 等，实现了精细的响应式布局控制。

### Provider 嵌套

`_app.tsx` 展示了精心设计的 Provider 嵌套顺序：

```
ProviderTheming          → 主题和 Emotion 缓存
  └─ ProviderSingleTab   → 单标签页管理
    └─ ProviderBackendCapabilities → 后端能力检测 + SSR 边界
      └─ ErrorBoundary   → 错误边界
        └─ ProviderBootstrapLogic → 启动逻辑
```

---

## 10. 部署架构与 API 层

### API 层

`app/api/` 提供两种部署模式：
- **`cloud/[trpc]`**: 云端部署（Vercel 等），完整的 tRPC 路由
- **`edge/[trpc]`**: Edge 部署，适合低延迟场景

tRPC 提供**端到端类型安全**的 API 调用，前后端共享类型定义，消除了传统 REST API 的类型断层。

### 部署选项

| 方式 | 适用场景 | 复杂度 |
|------|----------|--------|
| **Docker** | 自托管、企业内网 | 5-30 分钟 |
| **Vercel** | 快速部署、个人使用 | 2 分钟 |
| **big-agi.com** | 免费/Pro 托管 | 即开即用 |

Docker 部署使用 `Dockerfile` + `docker-compose.yaml`，支持环境变量配置 API Key。

### 数据安全

- **Local-first**: 所有对话数据默认存储在浏览器 IndexedDB
- **自带 API Key**: 用户直接配置自己的 LLM API Key，不经过中间服务器
- **可选云端同步**: Pro 用户可启用跨设备同步（Prisma + 云端数据库）
- **无追踪**: 分析功能（PostHog、GA）均为可选

---

## 总结：架构亮点与可借鉴之处

| 维度 | 亮点 |
|------|------|
| **供应商抽象** | 24+ 供应商的统一接口，插件式注册，添加新供应商零侵入 |
| **状态管理** | Zustand 按领域拆分 + Dexie 本地持久化 + Prisma 云端同步的双存储架构 |
| **AI 交互** | AIX 框架统一所有 AI 交互模式，支持流式、并行、多模态 |
| **多模型验证** | Beam 引擎实现并行对比 + 合并，是独特的差异化功能 |
| **消息渲染** | 块化消息系统，支持多种内容类型的独立渲染和交互 |
| **类型安全** | tRPC 端到端类型安全 + TypeScript 全量覆盖 |
| **Local-first** | IndexedDB 优先，云端可选，用户完全控制数据 |
| **模块化** | apps/modules/common 三层分离，职责清晰 |
| **响应式** | 丰富的导航控制属性，移动端/桌面端精细适配 |
| **开发体验** | 自动生成代码（gen-devtools-workspace）、Prisma schema 驱动 |

Big-AGI 是一个**架构成熟度很高**的开源 AI 前端项目，其供应商抽象层、AIX 框架和 Beam 多模型引擎是最值得研究和借鉴的设计。
