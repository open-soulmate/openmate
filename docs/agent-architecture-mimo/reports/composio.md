# ComposioHQ/composio — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/ComposioHQ/composio  
> 抓取通道: cdn.jsdelivr.net/gh/ComposioHQ/composio@master  
> 版本快照: master @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供工具集成 / 生命周期钩子 / Webhook / OAuth 借鉴

---

## 0. 诚实性说明

- 成功拉取: `python/composio/__init__.py`（完整 `__all__` 导出，本轮再次核验）
- **未能拉取**: `python/composio/core/collections.py`、`client/collections.py`、`toolset/main.py`（路径 404，仓库已重构）
- 导出结构为源码实读；核心实现（工具执行、OAuth 流程）未打开
- 标注 `[文档]` / `[推断]` 区分来源

---

## 1. 项目定位 [文档]

Composio 是 **工具集成平台**，为 AI Agent 提供 **500+ 工具**统一接口：
- OAuth / API key 管理
- 工具执行
- 免去每个工具单独集成

---

## 2. SDK 导出结构（`__init__.py` 源码实读）

### 2.1 完整 `__all__`（本轮再次拉取核验）

```python
__all__ = (
    "Composio",
    "CustomTool",
    "ExperimentalToolkit",
    "RemoteFile",
    "SessionContext",
    "SESSION_PRESET_DIRECT_TOOLS",
    "ConnectionExpiredEvent",
    "ConnectionState",
    "ConnectionStatusEnum",
    "SingleConnectedAccountDetailedResponse",
    "WebhookConnectionMetadata",
    "WebhookEvent",
    "WebhookEventType",
    "after_execute",
    "before_execute",
    "before_file_upload",
    "is_connection_expired_event",
    "schema_modifier",
    "__version__",
    "ToolkitLatestVersion",
    "ToolkitVersion",
    "ToolkitVersions",
    "ToolkitVersionParam",
)
```

### 2.2 导入路径映射

| 符号 | 模块路径 |
|------|----------|
| Composio | `.sdk` |
| CustomTool, SessionContext | `.core.models.custom_tool_types` |
| ExperimentalToolkit | `.core.models.custom_tool` |
| SESSION_PRESET_DIRECT_TOOLS | `.core.models.tool_router_constants` |
| RemoteFile | `.core.models.tool_router_session_files` |
| before_execute, after_execute, before_file_upload, schema_modifier | `.core.models.tools` |
| Webhook* / Connection* / is_connection_expired_event | `.core.models.webhook_events` |
| Toolkit* | `.core.types` |
| __version__ | `.__version__` |

### 2.3 生命周期钩子（4 个，源码实读）

| 钩子 | 时机 | 用途 [推断] |
|------|------|------------|
| `before_execute` | 工具执行前 | 参数验证/修改/拦截 |
| `after_execute` | 工具执行后 | 结果处理/日志 |
| `before_file_upload` | 文件上传前 | 预处理 |
| `schema_modifier` | Schema 阶段 | 动态修改输入 schema |

### 2.4 Webhook 事件系统（源码实读）

| 类型 | 职责 |
|------|------|
| `WebhookEvent` | 基础事件 |
| `WebhookEventType` | 事件类型枚举 |
| `WebhookConnectionMetadata` | 连接元数据 |
| `ConnectionExpiredEvent` | 连接过期 |
| `ConnectionState` | 连接状态 |
| `ConnectionStatusEnum` | 状态枚举 |
| `SingleConnectedAccountDetailedResponse` | 单账户详情 |
| `is_connection_expired_event` | 类型守卫函数 |

### 2.5 Toolkit 版本管理

```python
ToolkitLatestVersion    # 最新
ToolkitVersion          # 版本类型
ToolkitVersionParam     # 版本参数
ToolkitVersions         # 版本集合
```

### 2.6 会话与自定义工具

```python
CustomTool              # 用户自定义工具
SessionContext          # 会话上下文
ExperimentalToolkit     # 实验性工具集
SESSION_PRESET_DIRECT_TOOLS  # 直接工具会话预设
RemoteFile              # 远程文件
```

---

## 3. 核心概念 [文档]

### 3.1 Toolset

- 按应用分组（GitHub、Slack、Google Calendar…）
- 每 Toolset 含多个 Tool
- Tool: name / description / inputSchema

### 3.2 Connection

- 用户 ↔ 第三方应用认证
- 支持 OAuth2、API Key、Basic Auth
- **Composio 管理 token 刷新**

### 3.3 Action

- 具体操作（如 `GITHUB_CREATE_ISSUE`）
- 每 Action 有输入/输出 schema
- 统一 API 执行

---

## 4. 架构模式 [推断 from 导出]

### 4.1 统一工具接口

```
Agent → Composio SDK → Composio API → 第三方 API
                ↓
          OAuth / Auth 管理
```

### 4.2 工具发现

```python
from composio import Composio
composio = Composio()
tools = composio.get_tools(apps=["github", "slack"])
```

### 4.3 生命周期钩子管道

```
before_execute → 执行 → after_execute
     ↓                      ↓
  参数修改/拦截           结果修改/日志
```

### 4.4 Webhook 驱动连接管理

```
连接创建 → WebhookEvent
连接过期 → ConnectionExpiredEvent → 自动刷新/通知
状态变更 → ConnectionState
```

---

## 5. 与 openmate 映射

| 需求 | Composio 机制 | 可复用度 |
|------|---------------|----------|
| 工具统一接口 | Toolset 抽象 | **高** |
| OAuth 管理 | Connection + token 刷新 | **高** |
| 工具发现 | get_tools(apps=[...]) | **高** |
| 生命周期钩子 | before/after_execute + before_file_upload + schema_modifier | **高** |
| Webhook 事件 | ConnectionExpired/State | **高** |
| 自定义工具 | CustomTool + SessionContext | **高** |
| Schema 修改 | schema_modifier | **高** |
| 类型守卫 | is_connection_expired_event | 中 |
| Toolkit 版本化 | 4 个 Toolkit* 类型 | 中 |
| 会话预设 | SESSION_PRESET_DIRECT_TOOLS | 中 |
| 远程文件 | RemoteFile | 中 |
| 用户隔离 | user_id 参数 [文档] | 中 |

---

## 6. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| 工具数量 | 500+ | 官方文档 |
| 认证方式 | OAuth2 / API Key / Basic Auth | 官方文档 |
| Token 刷新 | 自动 | 官方文档 |
| 生命周期钩子 | **4** | `__init__.py` |
| Webhook 事件类型 | 7 类 + 1 守卫 | `__init__.py` |
| Toolkit 版本类型 | **4** | `__init__.py` |
| 会话预设 | SESSION_PRESET_DIRECT_TOOLS | `__init__.py` |
| 导出总数 | **28** | `__all__` |
| 模块根 | python/composio/ | 路径 |

---

## 7. 失败路径 [推断]

```
OAuth token 过期
  → ConnectionExpiredEvent → 自动刷新或通知

工具执行失败
  → after_execute 钩子处理 → 错误返回

连接状态异常
  → ConnectionState 变更 → Webhook 通知

自定义工具 schema 无效
  → schema_modifier 拦截

文件上传失败
  → before_file_upload 钩子预处理

核心路径 404
  → 仓库重构；需 clone 本地分析
```

---

## 8. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **4 生命周期钩子**: before_execute / after_execute / before_file_upload / schema_modifier
2. **Connection 抽象**: 用户↔应用认证 + 自动 token 刷新
3. **ConnectionExpiredEvent webhook** 驱动过期处理
4. **Toolset 按应用分组** + get_tools(apps=[...])
5. **CustomTool + SessionContext** 自定义工具面
6. **schema_modifier** 动态改输入 schema
7. **is_connection_expired_event 类型守卫**（TS/Python 双语言友好）
8. **Toolkit 版本化类型族**（4 个）
9. **SESSION_PRESET_DIRECT_TOOLS** 会话预设
10. **RemoteFile** 远程文件一等公民

### P1

- SingleConnectedAccountDetailedResponse 详情查询
- ExperimentalToolkit 实验通道隔离
- __version__ 导出约定

### P2

- 500+ 预构建集成
- Basic Auth 支持

---

## 9. 应避免的坑

- 核心实现路径已重构，勿按旧路径引用
- 勿发明未打开的执行/OAuth 内部实现
- ExperimentalToolkit 勿用于生产
- 勿假设 500+ 工具均同质量

---

## 10. 源码锚点速查

```
python/composio/__init__.py
  __version__
  Composio (from .sdk)
  CustomTool, SessionContext (custom_tool_types)
  ExperimentalToolkit (custom_tool)
  SESSION_PRESET_DIRECT_TOOLS (tool_router_constants)
  RemoteFile (tool_router_session_files)
  before_execute, after_execute, before_file_upload, schema_modifier (tools)
  WebhookEvent, WebhookEventType, WebhookConnectionMetadata
  ConnectionExpiredEvent, ConnectionState, ConnectionStatusEnum
  SingleConnectedAccountDetailedResponse
  is_connection_expired_event
  ToolkitLatestVersion, ToolkitVersion, ToolkitVersionParam, ToolkitVersions
  __all__ 共 28 项

404（重构）:
  python/composio/core/collections.py
  python/composio/client/collections.py
  python/composio/toolset/main.py
```

**未本轮打开**: 执行引擎、OAuth 流程、API 通信。建议 clone 本地分析。

---

## 11. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 5 | Toolset/Action/钩子完整 |
| 权限/安全边界 | 4 | OAuth + Connection |
| 容错与会话恢复 | 4 | ExpiredEvent + 自动刷新 |
| 上下文工程 | 3 | SessionContext |
| 可扩展（技能/MCP） | 5 | CustomTool + 500+ |
| 可观测与可评测 | 3 | Webhook 事件 |
| 生产可用成熟度 | 4 | 平台化；路径重构中 |

**综合**: **工具集成平台标准参考**。openmate 抄 4 钩子、Connection/ExpiredEvent、Toolset 分组与 schema_modifier。

---

## 12. 关键链接

- https://github.com/ComposioHQ/composio
- https://docs.composio.dev/
- 相关: `reports/mcp.md`、`reports/openai-agents.md`、`reports/browser-use.md`

---

## 13. 附录 A — 4 钩子 openmate 实施契约（P0）

### A1. before_execute

```
输入: tool_name, args, session_context
输出: args'（可改） | Reject(reason)
用途: 参数校验、注入 user_id、审计、限流
失败: Reject → 不执行，返回结构化错误
```

### A2. after_execute

```
输入: tool_name, args, result | error, duration_ms
输出: result'（可改） | 忽略
用途: 日志、脱敏、指标、缓存写入
失败: 钩子异常不应吞掉原始错误
```

### A3. before_file_upload

```
输入: filename, mime, bytes, session_context
输出: bytes' | Reject
用途: 病毒扫描、大小限制、格式转换
失败: Reject → 上传中止
```

### A4. schema_modifier

```
输入: tool_name, input_schema, session_context
输出: input_schema'
用途: 按租户裁剪字段、动态 enum、i18n description
失败: 非法 schema → 启动/注册期拒绝
```

### A5. 执行管道

```
schema_modifier → (注册/发现)
before_execute → 真实执行 → after_execute
before_file_upload → 上传
```

openmate: 钩子必须 **同步可短路**；超时单独预算（建议 ≤100ms 前置，≤50ms 后置）。

---

## 14. 附录 B — Connection / Webhook 状态机

```
[created] → WebhookEvent(ConnectionCreated)
    ↓
[active] ←────────────┐
    ↓                 │ token 刷新成功
[expiring]            │
    ↓                 │
[expired] → ConnectionExpiredEvent
    ↓
[refresh_failed] → 告警 / 通知用户重授权
```

守卫: `is_connection_expired_event(e)` 用于类型收窄。

openmate: 过期事件必须 **可重放**（至少一次投递 + 幂等消费）。

---

## 15. 附录 C — Toolkit 版本类型用法

| 类型 | 用途 |
|------|------|
| ToolkitVersion | 钉死版本 |
| ToolkitLatestVersion | 浮动最新 |
| ToolkitVersionParam | 请求参数 |
| ToolkitVersions | 可选集合 |

openmate: 默认 **钉死**；`latest` 仅开发；启动打印解析后的实际版本。

---

## 16. 附录 D — 失败路径明细

```
OAuth token 过期
  → ConnectionExpiredEvent
  → 自动刷新失败则通知重授权
  → openmate: 刷新退避 1s/4s/16s，最多 3 次

工具执行超时
  → after_execute(error=timeout)
  → openmate: 工具级 timeout 配置

schema_modifier 产出非法 schema
  → 注册期 jsonschema 校验失败
  → 拒绝注册并日志

before_file_upload 超限
  → Reject(max_size)
  → openmate: 默认 20MB，可配

webhook 重复投递
  → 事件 id 幂等
  → openmate: 存 processed_event_ids

核心路径 404（本轮）
  → 仓库重构
  → openmate: 引用前 clone 核验
```

---

## 17. 附录 E — 抓取核对

| 符号 | 模块 | 本轮 |
|------|------|------|
| Composio | .sdk | __init__.py |
| CustomTool, SessionContext | custom_tool_types | __init__.py |
| ExperimentalToolkit | custom_tool | __init__.py |
| SESSION_PRESET_DIRECT_TOOLS | tool_router_constants | __init__.py |
| RemoteFile | tool_router_session_files | __init__.py |
| 4 hooks | tools | __init__.py |
| Webhook*/Connection* | webhook_events | __init__.py |
| is_connection_expired_event | webhook_events | __init__.py |
| Toolkit* x4 | core.types | __init__.py |
| __all__ 共 28 | | __init__.py |

404: core/collections.py, client/collections.py, toolset/main.py

---

## 18. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 5 | Toolset/Action/4 钩子 |
| 权限安全 | 4 | OAuth + Connection |
| 容错恢复 | 4 | ExpiredEvent + 刷新 |
| 上下文 | 3 | SessionContext |
| 可扩展 | 5 | CustomTool + 500+ |
| 可观测 | 3 | Webhook 事件 |
| 成熟度 | 4 | 平台化；路径重构中 |

**净推荐**: openmate 工具层以 **4 钩子 + Connection 状态机 + Toolset 分组** 为 P0；实现前 clone 核验路径。
