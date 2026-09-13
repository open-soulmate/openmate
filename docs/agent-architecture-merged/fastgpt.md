# FastGPT

## 概述

FastGPT 是一个知识库问答平台。

**仓库**: https://github.com/labring/FastGPT | **Stars**: 29.6k | **语言**: Python

## 核心架构

> **仓库**: [labring/FastGPT](https://github.com/labring/FastGPT) (⭐ 29.6k)
> **定位**: 基于 LLM 的知识库平台，提供 RAG 检索、可视化工作流编排、插件系统
> **技术栈**: Next.js + MongoDB + PostgreSQL + Turborepo Monorepo

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

工作流有完整的变量系统（`WorkflowVariableState`），支持：
- 用户输入变量
- 外部提供变量（`externalProvider`）
- 运行时变量（节点输出）
- 文件上下文变量

知识库检索是 FastGPT 的核心能力，源码位于 `packages/service/core/dataset/search/`。

FastGPT 的插件系统支持热更新，插件本质上是预编排好的工作流片段：

| 插件类型 | 说明 |
|----------|------|
| **系统工具插件** | HTTP 请求、代码执行等系统级能力 |
| **RAG 模块插件** | 自定义检索、处理管线 |
| **Agent Loop 插件** | 自定义 Agent 行为逻辑 |
| **AI 实时生成插件** | 运行时由 AI 动态生成的插件 |

插件通过 `dispatchRunPlugin` 节点运行，可以嵌套调用其他插件，形成组合式编排。

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

## 关键技术

- [x] 多库复用、混用
- [x] chunk 记录修改和删除
- [x] 手动输入、直接分段、QA 拆分导入
- [x] 格式: TXT, MD, HTML, PDF, Docx, PPTX, CSV, XLSX；URL 读取；CSV 批量导入
- [x] 混合检索 & 重排
- [x] API 知识库

- [x] **系统工具热更新**
- [ ] RAG 模块热更新
- [ ] Agent-loop 热更新
- [ ] AI 实时生成插件

- [x] 免登录分享窗口
- [x] iframe 一键嵌入
- [x] 统一查阅对话记录并标注
- [x] 应用运营日志

| 依赖 | 版本 | 用途 |
|------|------|------|
| next | catalog | 框架 |
| react / react-dom | catalog | UI |
| @chakra-ui/react | catalog | 组件库 |
| reactflow | ^11.7.4 | **Flow 可视化编排** |
| @dagrejs/dagre | ^1.1.4 | 图布局 |
| @modelcontextprotocol/sdk | catalog | **MCP** |
| mongoose | catalog | MongoDB |
| minio | catalog | 对象存储 |
| mermaid | catalog | 图表 |
| katex | 0.16.22 | 公式 |
| echarts | 5.4.1 + echarts-gl 2.0.9 | 可视化 |
| @xterm/xterm | catalog | 终端（sandbox） |
| esbuild | ^0.25.11 | 插件/worker 构建 |
| zod | catalog | schema |
| i18next / next-i18next | catalog | 国际化 |
| @t3-oss/env-core | catalog | env 校验 |
| undici | catalog | HTTP |
| p-limit | ^7.2.0 | 并发限制 |
| jsondiffpatch | ^0.7.6 | 工作流 diff |
| @node-rs/jieba | catalog | 中文分词 |
| @llamaindex/liteparse-wasm | catalog | 文档解析 |
| ip2region.js | ^3.1.6 | IP 归属 |

- https://github.com/labring/FastGPT
- https://doc.fastgpt.io/
- https://github.com/labring/fastgpt-plugin
- https://github.com/labring/aiproxy
- 相关: `reports/dify.md`、`reports/flowise.md`、`reports/langflow.md`、`reports/mcp.md`

---

## 对openmate的启示

> 仓库: https://github.com/labring/FastGPT  
> 抓取通道: cdn.jsdelivr.net/gh/labring/FastGPT@main  
> 版本快照: main @ 2026-09-13（app package.json version **4.17.0**）  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Flow 工作流编排 / RAG / MCP 双向 / 插件热更新 借鉴

---

| 需求 | FastGPT 机制 | 可复用度 |
|------|-------------|----------|
| 可视化工作流 | reactflow + dagre | **高** |
| 对话 vs 插件工作流 | 两种 Flow 类型 | **高** |
| 双向 MCP | MCP SDK | **高** |
| 知识库多库混用 | 多库复用 | 高 |
| 混合检索+重排 | 已实现 | 高 |
| chunk 级编辑 | 修改删除 | 高 |
| 完整调用链日志 | 已实现 | **高** |
| 应用评测 | 已实现 | 中 |
| 插件热更新 | 系统工具已支持 | **高** |
| iframe 嵌入 | 一键嵌入 | 中 |
| OTel | @fastgpt-sdk/otel | 高 |
| env 校验 | @t3-oss/env-core | 高 |
| 并发限制 | p-limit | 高 |
| 工作流 diff | jsondiffpatch | 中 |

---

基于 FastGPT README 能力清单推导的最小节点集:

| 节点类型 | 职责 | FastGPT 对应 |
|----------|------|--------------|
| LLM | 模型调用 | 对话工作流 |
| KnowledgeSearch | 知识库检索 | 混合检索+重排 |
| HTTP | 外部 API | 插件/RPA |
| MCPClient | 调 MCP server | 双向 MCP |
| MCPServer | 暴露工具 | 双向 MCP |
| Code | 沙箱代码 | sandbox-adapter |
| IF/ELSE | 分支 | Flow |
| Iteration | 循环 | Flow |
| UserInput | 用户交互 | 用户交互 |
| Output | 汇总输出 | 对话工作流 |

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（72-fastgpt.md）
- MiMo报告（fastgpt-l1.md）
- MiMo卡片（fastgpt.md）
