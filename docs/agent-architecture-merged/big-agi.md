# big-AGI

## 概述

big-AGI 是一个多模型AI聊天界面。

**仓库**: https://github.com/enricoros/big-AGI | **语言**: TypeScript

## 核心架构

> **项目**: [enricoros/big-AGI](https://github.com/enricoros/big-AGI)  
> **版本**: 2.1.1  
> **Stars**: 7.1k | **Commits**: 8,685 | **Forks**: 1.6k  
> **许可证**: MIT  
> **定位**: 面向专家的多模型 AI 工作空间

[详见源码]

架构采用 **三层分离**：`apps/`（应用层）→ `modules/`（功能模块）→ `common/`（基础设施），职责清晰。

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

`src/modules/blocks/` 实现了一个**结构化消息块渲染系统**。每条 AI 消息不是纯文本，而是由多种"块"组成：

- 文本块（Markdown 渲染）
- 代码块（语法高亮 + 执行）
- 图像块（内联显示）
- 表格块（可导出 CSV）
- 思维链块（推理过程展示）
- 工具调用块（函数调用结果）
- 引用块（搜索结果引用）

这种块化设计使得不同内容类型可以独立渲染、交互和导出，也为 Beam 的结果对比提供了结构化基础。

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

`app.nav.ts` 定义了完整的导航配置，支持三种类型的导航项：

1. **NavItemApp**: 应用页面（带路由）
2. **NavItemModal**: 模态框（设置、模型配置）
3. **NavItemExtLink**: 外部链接（Discord、GitHub）

导航项支持丰富的显示控制：`hideOnMobile`、`hideBar`、`hideDrawer`、`panelAsMenu`、`fullWidth` 等，实现了精细的响应式布局控制。

| 维度 | 亮点 |
|------|------|
| **供应商抽象** | 24+ 供应商的统一接口，插件式注册，添加新供应商零侵入 |
| **状态管理** | Zustand 按领域拆分 + Dexie 本地持久化 + Prisma 云端同步的双存储架构 |
| **AI 交互** | AIX 框架统一所有 AI 交互模式，支持流式、并行、多模态 |
| **多模型验证** | Beam 引擎实现并行对比 + 合并，是独特的差异化功能 |
| **消息渲染** | 块化消息系统，支持多种内容类型的独立渲染

## 关键技术

Big-AGI 是一个**独立的、非 VC 资助**的开源 AI 套件，定位为"面向专家的多模型 AI 工作空间"。其核心哲学是：**AI 应该提升你，而不是取代你**。这体现在三个支柱上：

- **Intelligence（智能）**: Beam 多模型去幻觉、原生搜索、支持最新模型（Opus 5、GPT-5.6、Gemini 3.7 等）
- **Control（控制）**: Personas 系统、数据所有权、请求检查、自带 API Key、无厂商锁定
- **Speed（速度）**: Local-first 架构、零延迟、极致优化的 Web 应用

商业模式上，采用**免费开源 + Pro 订阅（$10.99/月）**的模式，Pro 提供跨设备同步和 1GB 存储，订阅收入资助所有开发。

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

- **Local-first**: 所有对话数据默认存储在浏览器 IndexedDB
- **自带 API Key**: 用户直接配置自己的 LLM API Key，不经过中间服务器
- **可选云端同步**: Pro 用户可启用跨设备同步（Prisma + 云端数据库）
- **无追踪**: 分析功能（PostHog、GA）均为可选

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

## 对openmate的启示

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

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（34-big-agi.md）
