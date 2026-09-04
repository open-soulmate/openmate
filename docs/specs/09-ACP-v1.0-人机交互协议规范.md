# OpenMate ACP v1.0 完整协议规范（Agent Client Protocol）

> 基于官方 ACP v1.0 规范（agent-client-protocol 0.9.0）对齐
> 更新时间：2026-09-04

## 0. 总览 & 定位

### 0.1 协议全称

ACP（Agent Client Protocol）

人机控制协议：用于 Human ↔ Agent / Host ↔ Agent 双向可控会话通信

### 0.2 核心定位（与 A2A 严格隔离）

- ACP = 人机通道：会话、流式输出、人工审批、状态展示、用户干预
- A2A = 智能体对等协作通道：任务委派、子任务、Artifact、SSE、多 Agent 调度
- 永远不混用：人操作 Agent 走 ACP，Agent 调 Agent 走 A2A

### 0.3 传输层规范

- 底层标准：JSON-RPC 2.0 严格合规
- WebSocket 链路：`ws://127.0.0.1:8092/ws/acp`（唯一标准入口）
- 子进程 stdio 链路：NDJSON 换行分隔（一行一帧 JSON-RPC）
- 日志隔离：stdout = 协议流，stderr = 日志，禁止混写

### 0.4 架构

```
前端（原生 ACP JSON-RPC）
        ↓ ws://8092/ws/acp
ACP Gateway 8092（无翻译、纯透传路由）
        ├ agent_id=soulmate → spawn python -m agent.start --stdio
        ├ agent_id=hermes → spawn hermes acp
        ├ agent_id=openclaw → spawn openclaw acp
        └ agent_id=opencode → spawn opencode acp
```

## 1. 基础报文结构（强制标准）

### 1.1 请求报文（Client → Agent，必须带 `id`）

```json
{
  "jsonrpc": "2.0",
  "id": number | string,
  "method": "session/xxx",
  "params": {}
}
```

### 1.2 响应报文（Agent → Client，对应 `id`）

```json
{
  "jsonrpc": "2.0",
  "id": number | string,
  "result": {}
}
```

### 1.3 事件通知报文（Agent → Client，无 `id`，纯推送）

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "string",
    "update": {
      "sessionUpdate": "agent_message_chunk",
      "content": {"type": "text", "text": "增量文本"},
      "last": false
    }
  }
}
```

### 1.4 错误报文

```json
{
  "jsonrpc": "2.0",
  "id": number | string | null,
  "error": {
    "code": number,
    "message": "string",
    "data": {}
  }
}
```

## 2. 全部标准 RPC 方法

### 2.0 `initialize` — 握手协商能力

请求：
```json
{
  "jsonrpc": "2.0", "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1
  }
}
```

响应：
```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "protocolVersion": 1,
    "agentInfo": {"name": "hermes-agent", "version": "0.20.5"},
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": {"image": true},
      "sessionCapabilities": {"fork": {}, "list": {}, "resume": {}}
    },
    "authMethods": []
  }
}
```

### 2.0.1 `authenticate` — 认证

请求：
```json
{
  "jsonrpc": "2.0", "id": 1,
  "method": "authenticate",
  "params": {
    "methodId": "string"
  }
}
```

### 2.1 `session/new` — 创建会话

用途：初始化 Agent 会话、分配 session 上下文

请求：
```json
{
  "jsonrpc": "2.0", "id": 2,
  "method": "session/new",
  "params": {
    "cwd": "/path/to/workspace",
    "mcpServers": []
  }
}
```

响应：
```json
{
  "jsonrpc": "2.0", "id": 2,
  "result": {
    "sessionId": "sess-xxxx"
  }
}
```

> 注意：`agent_id` 是 OpenMate 扩展参数（ACP Gateway 路由用），官方 ACP 无此字段

### 2.2 `session/prompt` — 发送用户消息（主交互入口）

请求：
```json
{
  "jsonrpc": "2.0", "id": 3,
  "method": "session/prompt",
  "params": {
    "sessionId": "sess-xxxx",
    "prompt": [
      {"type": "text", "text": "用户输入文本"}
    ],
    "messageId": "msg-xxxx"
  }
}
```

响应（最终结果）：
```json
{
  "jsonrpc": "2.0", "id": 3,
  "result": {
    "sessionId": "sess-xxxx",
    "stopReason": "end_turn"
  }
}
```

> prompt 是数组格式，支持 `TextContentBlock`、`ImageContentBlock`、`AudioContentBlock`

### 2.3 `session/cancel` — 取消当前操作

```json
{
  "jsonrpc": "2.0", "id": 4,
  "method": "session/cancel",
  "params": {"sessionId": "sess-xxxx"}
}
```

### 2.4 `session/close` — 关闭会话

```json
{
  "jsonrpc": "2.0", "id": 5,
  "method": "session/close",
  "params": {"sessionId": "sess-xxxx"}
}
```

### 2.5 `session/list` — 列出所有会话

```json
{
  "jsonrpc": "2.0", "id": 6,
  "method": "session/list",
  "params": {}
}
```

### 2.6 `session/load` — 加载已有会话

```json
{
  "jsonrpc": "2.0", "id": 7,
  "method": "session/load",
  "params": {
    "sessionId": "sess-xxxx",
    "cwd": "/path/to/workspace"
  }
}
```

### 2.7 `session/resume` — 恢复会话

```json
{
  "jsonrpc": "2.0", "id": 8,
  "method": "session/resume",
  "params": {
    "sessionId": "sess-xxxx"
  }
}
```

### 2.8 `session/fork` — Fork 会话

```json
{
  "jsonrpc": "2.0", "id": 9,
  "method": "session/fork",
  "params": {
    "sessionId": "sess-xxxx"
  }
}
```

### 2.9 `session/set_mode` — 设置会话模式

```json
{
  "jsonrpc": "2.0", "id": 10,
  "method": "session/set_mode",
  "params": {
    "sessionId": "sess-xxxx",
    "mode": "string"
  }
}
```

### 2.10 `session/set_model` — 设置模型

```json
{
  "jsonrpc": "2.0", "id": 11,
  "method": "session/set_model",
  "params": {
    "sessionId": "sess-xxxx",
    "model": "string"
  }
}
```

### 2.11 `session/set_config_option` — 设置配置

```json
{
  "jsonrpc": "2.0", "id": 12,
  "method": "session/set_config_option",
  "params": {
    "sessionId": "sess-xxxx",
    "key": "string",
    "value": "any"
  }
}
```

### 2.12 `session/approval` — 人工审批结果回传（OpenMate 扩展）

```json
{
  "jsonrpc": "2.0", "id": 13,
  "method": "session/approval",
  "params": {
    "sessionId": "sess-xxxx",
    "requestId": "req-xxxx",
    "action": "approve | reject",
    "comment": ""
  }
}
```

## 3. 全部标准 Event 事件（Agent → Client）

### 3.1 `session/update` — 流式输出（官方 ACP 标准）

Agent 流式生成内容时，通过无 id 的通知推送每个 chunk：

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess-xxxx",
    "update": {
      "sessionUpdate": "agent_message_chunk",
      "content": {"type": "text", "text": "增量文本片段"},
      "last": false
    }
  }
}
```

最后一个 chunk 设置 `"last": true` 表示完成。

### 3.2 `session/update` — Agent 消息完成

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess-xxxx",
    "update": {
      "sessionUpdate": "agent_message",
      "content": {"type": "text", "text": "完整消息"},
      "last": true
    }
  }
}
```

### 3.3 `human.approval.required` — 申请人工审批（OpenMate 扩展）

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess-xxxx",
    "update": {
      "sessionUpdate": "human_approval_required",
      "requestId": "req-xxxx",
      "toolName": "browser | shell | write_file | delete_file",
      "riskLevel": "low | medium | high",
      "description": "即将执行的高危操作说明"
    }
  }
}
```

### 3.4 `agent.tool_call` — 工具调用事件（OpenMate 扩展）

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess-xxxx",
    "update": {
      "sessionUpdate": "tool_call",
      "tool": "string",
      "args": {}
    }
  }
}
```

### 3.5 `session.completed` — 任务正常结束（OpenMate 扩展）

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess-xxxx",
    "update": {
      "sessionUpdate": "session_completed"
    }
  }
}
```

### 3.6 `session.error` — 会话异常（OpenMate 扩展）

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess-xxxx",
    "update": {
      "sessionUpdate": "session_error",
      "code": -32603,
      "message": "错误信息"
    }
  }
}
```

## 4. Agent → Client 请求方法（官方 ACP）

Agent 在执行过程中可以向 Client 发起请求：

| 方法 | 说明 |
|---|---|
| `createTerminal` | 创建终端执行命令 |
| `killTerminal` | 杀死终端 |
| `releaseTerminal` | 释放终端 |
| `terminalOutput` | 获取终端输出 |
| `waitForTerminalExit` | 等待终端退出 |
| `readTextFile` | 读取文件 |
| `writeTextFile` | 写入文件 |
| `requestPermission` | 请求权限 |
| `createElicitation` | 请求用户输入 |

## 5. 错误码规范（ACP 全局统一）

| 错误码 | 含义 |
|---|---|
| -32600 | 无效请求 |
| -32601 | 方法不存在 |
| -32602 | 参数非法 |
| -32603 | 内部错误 |
| -32001 | 鉴权失败 |
| -32002 | Session 不存在 / 已过期 |
| -32003 | Agent 进程异常 |
| -32004 | 审批被拒绝 |
| -32005 | 任务超时 |

## 6. 各 Agent ACP 支持现状

### 6.1 原生完整支持 ACP v1.0

| Agent | ACP 命令 | 版本 | 传输 |
|---|---|---|---|
| Hermes | `hermes acp` | v0.20.5 | stdio NDJSON |
| OpenClaw | `openclaw acp` | 2026.9.1 | stdio NDJSON |
| OpenCode | `opencode acp` | 1.18.27 | stdio NDJSON |

### 6.2 内置 Agent（OpenMate 自己实现）

| Agent | 启动方式 | 说明 |
|---|---|---|
| SoulMate | `python -m agent.start --stdio` | 实现 acp.Agent 协议，接入 MiMo LLM |

### 6.3 不支持 ACP

| Agent | 说明 |
|---|---|
| Codex | 仅 MCP server，无 ACP |
| Claude Code | 未安装 |
| Aider | 未安装 |

## 7. 最终架构链路

```
前端（原生 ACP JSON-RPC）
        ↓ ws://8092/ws/acp
ACP Gateway 8092（无翻译、纯标准路由）
        ├ agent_id=soulmate → spawn python -m agent.start --stdio
        ├ agent_id=hermes → spawn hermes acp
        ├ agent_id=openclaw → spawn openclaw acp
        └ agent_id=opencode → spawn opencode acp

# Agent 内部跨协作（永远不走 ACP）
Hermes → A2A 协议 → OpenCode / OpenClaw
```

## 8. 新旧彻底切割规则

1. 所有新功能、新客户端、新 Agent 只兼容本 ACP v1.0
2. ACP 只做人机控制
3. A2A 只做 Agent 对等委派、Task/Artifact/SSE
4. 双向完全解耦、协议干净、可商业化、可对外标准化输出

## 9. 版本声明

- 协议版本：OpenMate ACP v1.0 Final（基于官方 ACP v1.0）
- 生效时间：2026-09-04
- 兼容：Hermes ACP / OpenClaw ACP / OpenCode ACP 生态
- 状态：冻结定稿，后续增量不破坏兼容
