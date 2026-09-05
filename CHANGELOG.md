# Changelog

本文件记录 OpenMate 每个版本的主要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 新增
- 项目文档体系（docs/README.md + ADR + 目录索引）
- 开发记录系统（/devlog 页面 + API）

---

## [0.3.0] - 2026-09-05

### 新增
- **AI 群组功能**：WebSocket 消息广播、讨论引擎（523行编排器）、成员管理、讨论触发 UI
- **模型路由器**：4种路由模式（cost/balance/intelligence/auto）、复杂度估算、设置页面 UI
- **UI 设计规范 v2.0**：整合 HyperOS4 设计语言、三端适配（Web/桌面/移动端）、Design Token 体系
- **7 套主题系统**：深海静谧、奶油摩卡、北欧极夜、青空黑曜石、暮光紫罗兰、沙丘黄昏、自定义主题
- **自定义主题颜色编辑面板**：9个颜色选择器、实时预览、3套预设
- **Agent 思考过程可见性**：ThinkingBlock / ToolCallBlock 组件、流式接收、折叠交互、开关按钮
- **ACP 多模态 prompt 支持**：图片 base64 附件
- **PTY 模式**：ACP Proxy 使用 pty 替代 pipe，禁用 echo

### 修复
- AI 群组成员管理 API 修复（addAgent/removeAgent/saveEditAgent 改用正确端点）
- session/prompt RPC 响应触发 handleSessionComplete
- temp session 跳过 loadHistory 防止清空刚发送的消息
- migrateSessionId 保留当前 agentId

### 变更
- 开发规范页面改为动态加载（/api/dev-specs/list API，移除硬编码）
- 设计规范从 v1.0 升级到 v2.0

---

## [0.2.0] - 2026-09-01

### 新增
- **ACP 协议集成**：WebSocket 代理、JWT 认证、流式 SSE
- **A2A 协议 MVP**：Agent 对等通信
- **MCP Server**：Agent 工具调用
- **会话管理**：创建、切换、删除、流式输出
- **多 Agent 支持**：每个 Agent 独立 session、独立配置
- **聊天界面**：消息气泡、输入框、侧边栏、三栏布局
- **SoulMate Agent**：默认 Agent 实现
- **OpenSoul 后端**：用户认证、Agent 管理、会话存储
- **前端框架**：Next.js 16 + React 19 + Zustand + Tailwind CSS 4
- **Tauri 桌面端**：Tauri 2.x 集成

---

## [0.1.0] - 2026-08-28

### 新增
- 项目初始化
- 技术栈选型（Next.js + Tauri + FastAPI）
- 基础目录结构
- 开发环境搭建

---

*格式：[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)*
