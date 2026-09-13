# AnythingLLM

## 概述

AnythingLLM 是一个私有化LLM应用平台。

**仓库**: https://github.com/Mintplex-Labs/anything-llm | **Stars**: 40+ | **语言**: TypeScript

## 核心架构

> **项目**: [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm)
> **Stars**: 65,973 | **Forks**: 7,315 | **License**: MIT
> **版本**: v1.16.1 | **语言**: JavaScript (Node.js + React)
> **定位**: 全栈本地优先 AI 应用平台，集成 RAG、Agent、多用户、多工作空间

AnythingLLM 采用 **Monorepo 六模块架构**，每个模块职责清晰：

[详见源码]

后端是整个系统的中枢，基于 **Express.js** 构建，采用模块化的端点注册模式：

[详见源码]

**数据库层**：使用 **Prisma ORM** + SQLite（桌面版）/ PostgreSQL（Docker 版）。这是一个务实的选择——SQLite 零配置适合桌面场景，PostgreSQL 适合多用户生产环境。

**认证体系**：JWT + bcrypt，支持多用户角色权限控制（admin/user），仅 Docker 版本启用。

**关键依赖分析**：
- `langchain` (0.1.36)：用于文本分割、文档加载等，但核心 LLM 交互是自研的
- `@modelcontextprotocol/sdk`：MCP 协议支持
- `@mintplex-labs/bree`：任务调度引擎（用于定时任务）
- `posthog-node`：遥测（可关闭）
- `winston`：日志系统

Agent 是 AnythingLLM 最复杂的子系统，位于 `server/utils/agents/`：

[详见源码]
frontend/src/
├── components/     # UI 组件
├── pages/          # 页面路由
├── hooks/          # React Hooks
├── models/         # 前端数据模型
├── utils/          # 工具函数
└── locales/        # 国际化
```

**关键前端特性**：
- **拖拽上传**：文档直接拖入聊天窗口
- **源引用展示**：RAG 回答附带来源文档引用
- **实时 Agent 状态**：WebSocket 驱动的工具调用过程可视化
- **多用户权限 UI**：admin/user 角色切换
- **嵌入式 Widget**：可嵌入外部网站的聊天组件

**桌面版**通过 Electron 包装，共享同一套前端代码。这意味着 Web 版和桌面版的 UI 完全一致，降低了维护成本。

**安全层**：
- JWT 认证 + bcrypt 密码哈希
- X-Frame-Options: DENY（防止点击劫持）
- robots.txt 禁止爬取（Disallow: /）
- CORS 可配置
- HTTPS 可选启用

**隐私设计**：
- 遥测默认开启但可完全关闭，仅收集事件级元数据（不收集文档内容、聊天内容）
- 使用 PostHog（开源自托管方案）而非 Google Analytics
- 向量数据可完全本地化（LanceDB 默认）
- 零数据外泄架构——所有组件可离线运行

**生产化特性**：
- **定时任务系统**（`scheduledJobEndpoints`）：基于 Bree 调度引擎的 cron 任务
- **Web Push 通知**：浏览器推送通知支持
- **Telegram 集成**：Telegram Bot 接入
- **Outlook/Google 集成**：邮件 Agent 技能
- **开发者 API**：完整的 RESTful API 供外部集成
- **Swagger 文档**：自动生成的 API 文档

**社区生态**：
- Community Hub：社区共享的 Agent 技能和配置
- Embed Widget：可嵌入外部网站
- Browser Extension：Chrome 扩展
- Open Computer：实验性的完整计算机环境给 Agent 使用

| 维度 | 评价 |
|------|------|
| **模块化** | ⭐⭐⭐⭐⭐ 六模块清晰分离，collector 独立进程设计优秀 |
| **可扩展性** | ⭐⭐⭐⭐⭐ 40+ LLM、10+ 向量库、MCP 协议，扩展点极多 |
| **Agent 能力** | ⭐⭐⭐⭐ 自研 aibitat 框架 + 智能工具选择 

## 关键技术

1. **本地优先 + 零配置**：桌面版开箱即用，SQLite/本地存储，隐私与体验兼顾——这正是 openmate 桌面化的参照产品。
2. **自研轻量 Agent 运行时（AIbitat）+ 插件模型**：`aibitat.use(plugin)` 把内置工具/AgentFlow/MCP 统一成插件，命名空间清晰（`@@flow_/@@mcp_/@@hubId`）。
3. **"知识 + Agent"一体**：RAG 文档与 Agent 工具在同一 workspace 内，不是两个割裂产品。
4. **多 provider/多向量库抽象**：换 LLM、换向量库不影响上层。
5. **差异化**：面向"私有化部署的自有智能"，工程上比纯框架更产品化、更易落地。

**部分适用（有源码证据）**：
- **会话模型化**：`workspaceAgentInvocation`、`workspaceChats`、`workspaceParsedFiles` 把一次 agent 调用与中间产物落库（index.js:4-9），失败可追溯/恢复。
- **附件消费即清除**：`getAndClearInvocationAttachments`（:19）保证 invocation 附件不被重复消费。
- **MCP 工具安全加载**：加载 `@@mcp_` 前已确认 server 在运行、工具可用（:649-650 注释），避免加载不存在的工具。
- **不适用/未读**：Agent 循环内部的重试/超时/错误处理未逐行读 `aibitat.js`；桌面进程崩溃恢复（Electron 自动保存）为产品层推断。

**部分适用**：
- **无状态后端 + 持久化**：Express + SQLite（或用户选 DB），会话落库，服务可重启。
- **多用户隔离**：Docker 版多用户、按用户权限（README）。
- **动态模型路由**：按规则把会话路由到合适 provider/模型，provider 故障可换路（README）。
- **定时任务**：`cron` 定时跑带 agent 能力的任务（README）。
- **局限**：单实例部署为主；未见分布式/横向扩展，源码未读连接池/背压。标推断。

**部分适用（有产品证据）**：
- **自动记忆**：`workspace` 级自动+用户管理记忆（README memories），让模型记住用户与 workspace 重要信息——跨会话短期/长期记忆。
- **智能技能选择**：按查询自动选工具，称把无限工具的每查询 token 降 80%（README）——一种工具使用优化。
- **AgentFlow 复盘**：无代码流可沉淀复用。
- **局限（如实）**：未见在线权重学习/A-B 评估回路；"进化"是记忆沉淀与工具选择，非参数式。智能技能选择的具体算法未读源码，标推断。

---

## 对openmate的启示

> 供 openmate 参考：工作区隔离、向量库抽象、Agent 工具链上限
> 调研日期：2026-09-13
> 资料来源：jsDelivr 实拉 `Mintplex-Labs/anything-llm@master`
> 列表：1090 files

---

- AnythingLLM 是 **多租户 RAG 工作区产品**，不是个人 IM 助手。openmate 应抄其 workspace 隔离与工具上限，不要抄其 admin/invite/embed 管理面。
- AIbitat 比 nanobot AgentLoop 更重（多 agent 图），个人助手可只用其单 agent 路径 + abort 语义。
- Collector 与 server 同镜像但分端口；openmate 可合并为单进程内的模块，保留接口边界。

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（68-anything-llm.md）
- 豆包（039_anything-llm.md）
- MiMo报告（anything-llm-l1.md）
- MiMo卡片（anything-llm.md）
