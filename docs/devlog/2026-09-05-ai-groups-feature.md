# AI 群组功能

> 开发时间：2026-09-05
> 版本：v1.0
> 状态：开发中

## 概述
实现 AI 群组完整功能，包括群组 CRUD、成员管理、WebSocket 实时通信、群聊 UI、讨论引擎等。从现有代码梳理开始，逐步修复和实现缺失功能。

## 开发步骤

### Step 1: 梳理现有代码 ✅
- 分析现有文件：`ai-groups-store.ts`(411行)、`ai-groups-client.tsx`(849行)、`ai-groups-workspace.tsx`(179行)、`ai-groups-sidebar.tsx`(129行)
- 已完成约60%：群组 CRUD API、讨论引擎6个端点、任务执行 API、角色/意图 UI 系统
- 缺失约20%：WebSocket 实时通信、消息历史持久化、Agent 管理 UI 面板

### Step 2: 修复群组 CRUD — 成员管理 API 修复 ✅
- **问题发现**：前端 store 的 addAgent/removeAgent/saveEditAgent 使用了错误的 API（用 `PATCH /{group_id}` + agents 数组）
- **修复方案**：改用独立的成员管理端点：
  - `POST /{group_id}/agents` — 添加成员
  - `DELETE /{group_id}/agents/{agent_id}` — 删除成员
  - `PATCH /{group_id}/agents/{agent_id}` — 更新成员
- **测试结果**：3个端点全部通过 ✅
- **提交**：`fix: AI群组成员管理API修复 — addAgent/removeAgent/saveEditAgent改用正确的独立端点`

### Step 3: 实现群消息 WebSocket ✅
- 创建 `acp-proxy/ws_group.py` (447行)
- WebSocket 路由：`/ws/group/{group_id}?token=xxx`
- JWT 认证（复用 ws_chat.py 的密钥）
- 房间管理：每个 group_id 一个房间，连接自动加入/离开
- 消息广播：同群组所有客户端实时收到消息
- 消息持久化：存入 OpenSoul discussion_messages 表
- 支持消息类型：user_message, agent_message, system_message, discussion_round, task_update, typing
- **提交**：`feat: 群组WebSocket — ws_group.py消息广播+JWT认证+消息持久化+房间管理`

### Step 4: 前端群聊 UI 接入 WebSocket ✅
- store 新增：`wsGroup`, `wsConnected`, `wsTypingUsers`
- 新增 actions：`connectGroupWS`, `disconnectGroupWS`, `sendGroupMessage`, `addMessage`
- `selectGroup` 自动连接 WS，`deleteGroup` 自动断开 WS
- 消息接收处理：user_message/agent_message/system_message/typing/connected/message_ack
- **提交**：`feat: 前端群组WebSocket接入 — connectGroupWS/sendGroupMessage/selectGroup自动连接`

### Step 5: 群聊 UI 完善 ✅
- 消息列表：用户靠右+Agent靠左+系统居中
- 输入框：绑定 sendGroupMessage，Enter 发送
- 连接状态指示器：绿色脉冲圆点
- Agent 成员管理 UI：列表+编辑+删除+添加
- **提交**：`feat: 群聊UI完善 — WS消息列表+输入框+连接状态指示+成员管理面板`

### Step 6: 讨论引擎集成 ✅
- 创建 `acp-proxy/discussion_engine.py` (523行) — 讨论编排器核心
- `DiscussionOrchestrator` 类：按 Advisor→Executor→Verifier 顺序执行多轮讨论
- 每个 Agent 调用 LLM 生成回复，实时广播给所有客户端
- 3 轮讨论 + 单轮超时60s + 全局超时5分钟
- 支持取消（cancel_discussion 消息）
- ws_group.py 新增 start_discussion/cancel_discussion 消息处理
- **提交**：`feat: 讨论引擎 — DiscussionOrchestrator+角色提示词+轮次控制+超时+取消+WS集成`

### Step 7: 前端讨论触发 + 浏览器测试 🔄
- 前端发送 start_discussion 消息触发讨论
- 讨论进度实时显示
- 端到端测试

## 技术决策
1. **成员管理 API 设计**：选择独立端点而非 PATCH 整体更新，支持原子操作和并发安全
2. **WebSocket 房间管理**：基于 group_id 的房间机制，连接时自动加入，断开时自动离开
3. **讨论引擎架构**：Advisor→Executor→Verifier 三角色顺序执行，支持多轮讨论和超时控制
4. **消息持久化**：复用 OpenSoul 的 discussion_messages 表，保持数据一致性

## 已知问题
- 讨论引擎的端到端浏览器测试尚未完成
- 需要处理 WebSocket 断线重连机制
- Agent 管理 UI 面板功能待完善
