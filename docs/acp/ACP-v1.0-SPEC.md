# OpenMate ACP v1.0 完整协议规范（定稿）

> 协议版本：OpenMate ACP v1.0 Final
> 生效时间：2026-09-02
> 兼容：Hermes ACP / ZeroClaw ACP 生态
> 状态：冻结定稿，后续增量不破坏兼容

---

## 0. 总览 & 定位

### 0.1 协议全称

**ACP（Agent Control Protocol）**
人机控制协议：用于 Human ↔ Agent / Host ↔ Agent 双向可控会话通信

### 0.2 核心定位（与 A2A 严格隔离）

- **ACP = 人机通道**：会话、流式输出、人工审批、状态展示、用户干预
- **A2A = 智能体对等协作通道**：任务委派、子任务、Artifact、SSE、多 Agent 调度

**永远不混用**：人操作 Agent 走 ACP，Agent 调 Agent 走 A2A

### 0.3 传输层规范

| 链路类型 | 标准 | 说明 |
|---------|------|------|
| WebSocket | JSON-RPC 2.0 严格合规 | `ws://127.0.0.1:8092/ws/acp`（唯一标准入口） |
| 子进程 stdio | NDJSON 换行分隔 | 一行一帧 JSON-RPC |
| 日志隔离 | stdout = 协议流，stderr = 日志 | 禁止混写 |

### 0.4 架构（方案 A 最终定型）

- **前端**：原生发送 ACP JSON-RPC（彻底废弃 Legacy JSON）
- **ACP Gateway (8092)**：纯路由、鉴权、会话管理、透传，无协议翻译
- **下游全部统一 ACP**：
  - SoulMate Engine (8787)：原生 ACP
  - Hermes / OpenClaw：原生完整 ACP 支持（开箱即用）
  - OpenCode：轻量 ACP Adapter 适配

---

## 1. 基础报文结构（强制标准）

### 1.1 请求报文（Client → Agent，必须带 id）

```json
{
  "jsonrpc": "2.0",
  "id": "number | string",
  "method": "xxx/xxx",
  "params": {}
}
```

### 1.2 响应报文（Agent → Client，对应 id）

```json
{
  "jsonrpc": "2.0",
  "id": "number | string",
  "result": {}
}
```

### 1.3 事件通知报文（Agent → Client，无 id，纯推送）

ACP 所有流式、状态、审批、日志统一走该通知：

```json
{
  "jsonrpc": "2.0",
  "method": "session/event",
  "params": {
    "session_id": "string",
    "event_type": "string",
  ...[truncated]