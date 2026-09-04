# AI 群组功能开发记录

> 开始时间：2026-09-05 02:30
> 开发模式：逐步开发，每步测试通过再下一步

---

## Step 1: 梳理现有代码 ✅ 完成

### 现有文件
- `src/stores/ai-groups-store.ts` (411行) — Zustand store
- `src/app/(app)/ai-groups/ai-groups-client.tsx` (849行) — 群组主页面
- `src/components/ai-groups-workspace.tsx` (179行) — 工作区面板
- `src/components/ai-groups-sidebar.tsx` (129行) — 群组侧边栏

### 已完成（~60%）
- 群组 CRUD API 全部真实调用
- 讨论引擎 6 个端点全部有真实 fetch
- 任务执行 API 完整
- 角色/意图 UI 系统

### 缺失（~20%）
- WebSocket 实时通信
- 消息历史持久化
- Agent 管理 UI 面板

---

## Step 2: 修复群组 CRUD — 成员管理 API 修复

### 状态：进行中

### 问题发现
前端 store 的 addAgent/removeAgent/saveEditAgent 使用了错误的 API：
- ❌ 用 `PATCH /{group_id}` + agents 数组来更新成员
- ✅ 应该用独立的成员管理端点：
  - `POST /{group_id}/agents` — 添加成员
  - `DELETE /{group_id}/agents/{agent_id}` — 删除成员
  - `PATCH /{group_id}/agents/{agent_id}` — 更新成员

### OpenSoul API 正确路由表
| 操作 | 方法 | 路径 |
|------|------|------|
| 创建群组 | POST | /api/ai-groups |
| 列出群组 | GET | /api/ai-groups |
| 群组详情 | GET | /api/ai-groups/{id} |
| 更新群组 | PATCH | /api/ai-groups/{id} (name/description) |
| 删除群组 | DELETE | /api/ai-groups/{id} |
| 添加成员 | POST | /api/ai-groups/{id}/agents |
| 删除成员 | DELETE | /api/ai-groups/{id}/agents/{agent_id} |
| 更新成员 | PATCH | /api/ai-groups/{id}/agents/{agent_id} |
| 提交任务 | POST | /api/ai-groups/{id}/tasks |
| 任务列表 | GET | /api/ai-groups/{id}/tasks |
| 分配任务 | POST | /api/ai-groups/{id}/tasks/{task_id}/assign |
| 执行任务 | POST | /api/ai-groups/{id}/tasks/{task_id}/execute |
| 完成任务 | POST | /api/ai-groups/{id}/tasks/{task_id}/complete |
| 验证任务 | POST | /api/ai-groups/{id}/tasks/{task_id}/verify |
| 开始讨论 | POST | /api/ai-groups/{id}/discuss |
| 讨论回复 | POST | /api/ai-groups/{id}/discuss/respond |
| 讨论决策 | POST | /api/ai-groups/{id}/discuss/decide |
| 执行子任务 | POST | /api/ai-groups/{id}/discuss/execute |
| 审核结果 | POST | /api/ai-groups/{id}/discuss/review |
| 评分 | POST | /api/ai-groups/{id}/discuss/score |

### 修复计划
修改 `src/stores/ai-groups-store.ts`：
1. addAgent → `POST /{group_id}/agents`
2. removeAgent → `DELETE /{group_id}/agents/{agent_id}`
3. saveEditAgent → `PATCH /{group_id}/agents/{agent_id}`

### 测试结果
- [x] POST /{group_id}/agents — 添加成员 ✅
- [x] DELETE /{group_id}/agents/{agent_id} — 删除成员 ✅
- [x] PATCH /{group_id}/agents/{agent_id} — 更新成员 ✅
- [x] 前端 store 修复 — 已修复 3 个函数 ✅

### 修复内容
- `addAgent`: `PATCH /{id}` + agents → `POST /{id}/agents`（单个agent）
- `removeAgent`: `PATCH /{id}` + 过滤agents → `DELETE /{id}/agents/{agent_id}`
- `saveEditAgent`: `PATCH /{id}` + 替换agents → `PATCH /{id}/agents/{agent_id}`（model/temperature/role）

### 提交
- `fix: AI群组成员管理API修复 — addAgent/removeAgent/saveEditAgent改用正确的独立端点`

---

## Step 3: 实现群消息 WebSocket ✅ 完成

### 实现内容
- 创建 `acp-proxy/ws_group.py` (447行)
- WebSocket 路由: `/ws/group/{group_id}?token=xxx`
- JWT 认证（复用 ws_chat.py 的密钥）
- 房间管理：每个 group_id 一个房间，连接自动加入/离开
- 消息广播：同群组所有客户端实时收到消息
- 消息持久化：存入 OpenSoul discussion_messages 表
- 消息类型：user_message, agent_message, system_message, discussion_round, task_update, typing

### 测试结果
- [x] WS 连接 + JWT 认证 ✅
- [x] 消息广播（两个客户端都收到） ✅
- [x] 消息持久化 ✅

### 提交
- `feat: 群组WebSocket — ws_group.py消息广播+JWT认证+消息持久化+房间管理`

---

## Step 4: 前端群聊 UI 接入 WebSocket

### 状态：待开始

### 目标
- 前端 store 接入 ws_group WebSocket
- 群聊消息实时显示
- 用户发送消息通过 WS
