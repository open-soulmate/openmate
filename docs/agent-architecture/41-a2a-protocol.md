# 41. A2A (Agent2Agent) Protocol 深度架构分析

> **协议全称**: Agent2Agent (A2A) Protocol
> **版本**: v1.0.0（2025年正式发布，Linux Foundation 托管）
> **GitHub**: https://github.com/a2aproject/A2A （25.5k stars，2.6k forks，617 commits）
> **官网**: https://a2a-protocol.org
> **许可证**: Apache License 2.0
> **发起者**: Google，由 Linux Foundation Agentic AI Foundation 管理
> **官方SDK**: Python、Go、JS、Java、.NET、Rust（六语言全覆盖）

---

## 一、协议定位与设计哲学

A2A 是业界首个专门为 **Agent 间对等通信** 设计的开放协议。它解决的核心问题是：不同框架（LangGraph、CrewAI、ADK）、不同厂商、不同服务器上运行的 AI Agent，如何像"同事"一样协作，而非仅仅作为"工具"被调用。

A2A 的五大设计原则：

1. **简洁性（Simple）**：复用既有标准——HTTP、JSON-RPC 2.0、Server-Sent Events（SSE），不发明新的传输层。
2. **企业就绪（Enterprise Ready）**：认证、授权、安全、隐私、追踪、监控均对齐企业既有实践。
3. **异步优先（Async First）**：原生支持长时间运行任务（LRO）和 human-in-the-loop 场景。
4. **模态无关（Modality Agnostic）**：文本、音频、视频、表单、iframe、结构化 JSON 均可交换。
5. **不透明执行（Opaque Execution）**：Agent 协作时无需暴露内部记忆、逻辑或工具实现——保护知识产权。

**A2A 与 MCP 的本质区别**：MCP 连接 LLM 与工具/数据源（纵向集成），A2A 连接 Agent 与 Agent（横向协同）。两者互补而非竞争——复杂 Agent 系统同时需要两者。

---

## 二、三层分层架构

A2A 规范采用清晰的三层架构设计，确保核心语义在不同协议绑定间保持一致：

### Layer 1：规范数据模型（Canonical Data Model）

定义协议的核心数据结构，以 Protocol Buffers（`spec/a2a.proto`）为唯一权威规范源（normative source），JSON Schema 为构建时自动生成的非规范产物：

| 核心类型 | 说明 |
|----------|------|
| `AgentCard` | Agent 的"数字名片"——身份、能力、技能、端点、认证要求 |
| `AgentSkill` | Agent 能力声明，含 ID、名称、描述、输入/输出模态 |
| `AgentInterface` | 支持的协议绑定（JSONRPC / GRPC / HTTP+JSON）及版本 |
| `Task` | 工作单元——有生命周期、状态机、工件、历史记录 |
| `Message` | 一次通信轮次——含 role（user/agent）和多个 Part |
| `Part` | 最小内容单元——text / raw（字节）/ url（URI引用）/ data（JSON） |
| `Artifact` | 任务产出物——文档、图片、结构化数据 |
| `Extension` | 协议扩展机制——URI 标识，可选/必须 |

### Layer 2：抽象操作（Abstract Operations）

独立于具体绑定的核心操作：

| 操作 | 说明 |
|------|------|
| `SendMessage` | 发送消息，返回 Task 或直接 Message |
| `SendStreamingMessage` | 发送消息，SSE 流式返回更新 |
| `GetTask` | 获取任务当前状态 |
| `ListTasks` | 分页列出任务（支持按 context/status 过滤） |
| `CancelTask` | 取消进行中的任务 |
| `SubscribeToTask` | 订阅已有任务的实时更新 |
| `CreateTaskPushNotificationConfig` | 创建 WebHook 推送配置 |
| `GetTaskPushNotificationConfig` | 获取推送配置 |
| `ListTaskPushNotificationConfigs` | 列出推送配置 |
| `DeleteTaskPushNotificationConfig` | 删除推送配置 |
| `GetExtendedAgentCard` | 认证后获取扩展 Agent Card |

### Layer 3：协议绑定（Protocol Bindings）

将抽象操作映射到具体协议：

- **JSON-RPC 2.0 over HTTP(S)**：主要绑定，方法名如 `message/send`、`tasks/get`
- **gRPC**：通过 `a2a.proto` 直接生成服务定义
- **HTTP+JSON/REST**：RESTful 端点，如 `POST /message:send`、`GET /tasks/{id}`
- **Custom Bindings**：允许扩展自定义绑定

---

## 三、Agent Card 与能力发现机制

Agent Card 是 A2A 协议的**发现基石**。每个 A2A Server 在 `/.well-known/agent.json`（RFC 8615）发布一个 JSON 描述文档：

```json
{
  "name": "Recipe Agent",
  "description": "Agent that helps users with recipes and cooking.",
  "url": "https://recipe-agent.example.com",
  "version": "1.0.0",
  "provider": {"organization": "Example Corp"},
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "extendedAgentCard": true
  },
  "securitySchemes": {
    "oauth2": { "type": "oauth2", "flows": {...} }
  },
  "defaultInputModes": ["text/plain", "application/json"],
  "defaultOutputModes": ["text/plain", "image/png"],
  "skills": [
    {
      "id": "recipe-generation",
      "name": "Recipe Generation",
      "description": "Generates recipes based on ingredients",
      "inputModes": ["text/plain"],
      "outputModes": ["application/json", "image/png"]
    }
  ],
  "supportedInterfaces": [
    { "protocolBinding": "JSONRPC", "protocolVersion": "1.0" },
    { "protocolBinding": "GRPC", "protocolVersion": "1.0" }
  ],
  "extensions": [
    { "uri": "https://example.com/ext/v1", "required": false }
  ]
}
```

**关键设计特点**：

1. **公开/扩展双卡机制**：公开 Card 不含敏感信息；认证后可通过 `GetExtendedAgentCard` 获取更详细的技能列表。
2. **多接口声明**：同一个 Agent 可同时暴露 JSON-RPC、gRPC、REST 多种绑定。
3. **安全方案声明**：OAuth2、API Key、OpenID Connect、HTTP Auth、Mutual TLS 均可在 Card 中声明。
4. **技能级模态覆盖**：全局 `defaultInputModes`/`defaultOutputModes` 可在每个 Skill 级别覆写。
5. **无中心注册表**：基于 URL 的分布式发现——任何能到达 HTTP 端点的 Agent 都可以发现并协作。

---

## 四、任务生命周期与状态机

Task 是 A2A 协议的核心工作单元，具有完整的生命周期状态机：

```
                         ┌──────────┐
                         │ submitted│
                         └────┬─────┘
                              │
                         ┌────▼─────┐
              ┌─────────│ working   │──────────┐
              │         └────┬─────┘          │
              │              │                │
    ┌─────────▼──┐    ┌─────▼──────┐   ┌─────▼──────┐
    │input-required│   │ completed  │   │  failed    │
    └─────────┬──┘    └────────────┘   └────────────┘
              │
         (用户补充输入)
              │
         ┌────▼─────┐
         │ working   │ (继续处理)
         └──────────┘

    另外: canceled（任意阶段可取消）
          rejected（Agent 拒绝任务）
          auth-required（需要额外认证）
```

**状态定义（TaskState 枚举）**：

| 状态 | 含义 |
|------|------|
| `TASK_STATE_SUBMITTED` | 任务已提交并被确认 |
| `TASK_STATE_WORKING` | Agent 正在处理 |
| `TASK_STATE_INPUT_REQUIRED` | 需要客户端补充输入 |
| `TASK_STATE_AUTH_REQUIRED` | 需要额外认证 |
| `TASK_STATE_COMPLETED` | 任务成功完成 |
| `TASK_STATE_FAILED` | 任务执行失败 |
| `TASK_STATE_CANCELED` | 任务已被取消 |
| `TASK_STATE_REJECTED` | Agent 拒绝执行 |

**Task 数据结构** 包含：`id`（服务端生成）、`contextId`（会话分组）、`status`（当前状态+消息）、`artifacts`（产出物列表）、`history`（交互历史）、`metadata`（自定义键值对）。

---

## 五、消息与内容交换模型

### Message 结构

```
Message {
  role: "user" | "agent"
  messageId: string (UUID)
  parts: Part[]          // 一个或多个内容单元
  referenceTaskIds: string[]  // 关联的任务
  metadata: map
  extensions: Extension[]
}
```

### Part 类型（Union / oneof）

| Part 类型 | 字段 | 说明 |
|-----------|------|------|
| `TextPart` | `text: string` | 纯文本内容 |
| `FilePart` | `raw: bytes` 或 `url: string` | 文件内容（内联字节或 URI 引用） |
| `DataPart` | `data: JSON` | 结构化 JSON 数据 |

每个 Part 可附带：`mediaType`（MIME 类型）、`filename`（文件名）、`metadata`（附加信息）。

### Artifact 产出物

Artifact 是任务执行过程中生成的具体交付物，包含：`artifactId`、`name`、`parts[]`。与 Message 不同，Artifact 代表的是"结果"而非"对话"。

---

## 六、三种通信模式

A2A 提供三种互补的通信机制，覆盖从简单到复杂的全场景：

### 1. 同步请求/响应（Polling）

```python
# 客户端发送消息，等待 Task 返回
response = POST /message:send {message: {...}}
task = response.task  # 立即返回当前状态
# 需要时轮询
task = GET /tasks/{id}
```

适用：简单集成、低频更新、受限防火墙环境。

### 2. 流式传输（SSE Streaming）

```
POST /message:stream
→ Task (submitted)
→ TaskStatusUpdateEvent (working)
→ TaskArtifactUpdateEvent (artifact A)
→ TaskArtifactUpdateEvent (artifact B)
→ TaskStatusUpdateEvent (completed)
[流关闭]
```

适用：交互式应用、实时仪表盘、实时进度监控。要求 `AgentCard.capabilities.streaming = true`。

**流式响应（StreamResponse）** 是一个联合类型（oneof），每次事件只能是：`task` | `message` | `statusUpdate` | `artifactUpdate` 之一。

### 3. 推送通知（WebHook Push）

```
POST /tasks/{id}/pushNotificationConfigs  // 客户端注册 WebHook
// Agent 在任务状态变化时：
POST client-webhook-url  {StreamResponse payload}
```

适用：服务端到服务端集成、长时间任务、事件驱动架构。要求 `AgentCard.capabilities.pushNotifications = true`。

**关键设计**：不论 Agent 使用何种协议绑定，WebHook 调用一律使用 HTTP + JSON。

---

## 七、多轮对话与上下文管理

A2A 原生支持多轮交互，通过三个关键标识符实现：

### Context（contextId）

- 服务端生成的标识符，逻辑分组相关 Task 和 Message
- 同一 `contextId` 下的所有 Task/Message 视为同一会话
- Agent 可用 `contextId` 维护内部状态、对话历史、LLM 上下文
- 支持过期/清理策略

### Task（taskId）

- 每个 Task 有唯一 ID，服务端生成
- 客户端提供 `taskId` 时必须引用已有任务
- 支持 `referenceTaskIds` 显式关联多个任务

### 多轮模式

1. **上下文延续**：后续消息携带 `contextId` 延续对话
2. **任务细化**：携带 `taskId` 对已有任务追加输入
3. **Input-Required 状态**：Agent 在处理中请求额外输入，客户端用相同 `taskId` + `contextId` 发送新消息
4. **上下文继承**：同一 `contextId` 下的新 Task 可继承之前的交互上下文

**多模态 UX 协商**：客户端可通过 `SendMessageConfiguration.acceptedOutputModes` 声明接受的输出格式，Agent 据此调整输出。

---

## 八、安全与企业级特性

### 认证机制

Agent Card 中声明支持的安全方案：

| 方案 | 说明 |
|------|------|
| `HTTPAuthSecurityScheme` | HTTP Bearer Token（JWT 等） |
| `OAuth2SecurityScheme` | OAuth 2.0（支持 Authorization Code、Client Credentials 等流程） |
| `OpenIdConnectSecurityScheme` | OpenID Connect（基于 URL 发现） |
| `APIKeySecurityScheme` | API Key（Header/Query/Cookie） |
| `MutualTLSSecurityScheme` | 双向 TLS 证书认证 |

### 权限控制

- **数据访问范围**：实现必须确保客户端只能访问自己有权限的任务
- **扩展 Agent Card 访问控制**：认证后的扩展 Card 可根据客户端权限返回不同内容
- **不泄露原则**：服务端不得向未授权客户端泄露资源的存在性

### 企业级能力

- **Observability**：支持分布式追踪（trace_id）
- **多租户**：`tenant` 字段支持路由到不同 Agent/租户
- **版本协商**：`A2A-Version` 头部确保协议版本兼容性
- **幂等性**：Get 操作天然幂等；Send Message 可通过 `messageId` 检测重复

---

## 九、扩展机制与 SDK 生态

### 协议扩展（Extensions）

Agent 可在 AgentCard 中声明自定义扩展：

```json
{
  "extensions": [
    {
      "uri": "https://example.com/extensions/geolocation/v1",
      "description": "Adds geolocation context to messages",
      "required": false,
      "params": { "maxAccuracy": "city" }
    }
  ]
}
```

- 扩展通过 URI 唯一标识
- `required: true` 表示客户端必须理解和遵守
- 客户端通过 `A2A-Extensions` 服务参数声明要使用的扩展

### 六语言 SDK 矩阵

| SDK | 安装方式 | 仓库 |
|-----|---------|------|
| Python | `pip install a2a-sdk` | github.com/a2aproject/a2a-python |
| Go | `go get github.com/a2aproject/a2a-go` | github.com/a2aproject/a2a-go |
| JavaScript | `npm install @a2a-js/sdk` | github.com/a2aproject/a2a-js |
| Java | Maven | github.com/a2aproject/a2a-java |
| .NET | `dotnet add package A2A` | github.com/a2aproject/a2a-dotnet |
| Rust | `cargo add a2a-lf` | github.com/a2aproject/a2a-rs |

所有 SDK 均从 `spec/a2a.proto` 自动生成，保证与规范的一致性。

---

## 十、生态位对比与实战价值

### A2A vs MCP vs ANP 横向对比

| 维度 | A2A | MCP | ANP |
|------|-----|-----|-----|
| **通信方向** | Agent ↔ Agent（横向） | LLM → Tool（纵向） | Agent ↔ Agent（开放网络） |
| **交互模型** | 异步任务委托+生命周期 | 同步工具调用 | DID 握手+会话协商 |
| **核心原语** | AgentCard / Task / Message / Artifact | Tools / Resources / Prompts | DID Document / Meta-Protocol |
| **传输层** | HTTP + SSE + Push Notification | stdio / SSE / HTTP | HTTPS + JSON-LD |
| **发现机制** | Agent Card（well-known URL） | 无标准发现（需客户端配置） | DID + 搜索引擎 |
| **状态管理** | 有状态 Task 对象+生命周期 | 无状态（fire-and-forget） | 无状态（DID token 跨连接） |
| **认证模型** | OAuth2 / API Key / mTLS（显式凭证） | 主机信任（隐式） | W3C DID（去中心化身份） |
| **治理** | Linux Foundation | Linux Foundation | 社区驱动 |
| **成熟度** | 生产就绪，100+ 企业采用 | 生产就绪，97M+ SDK 月下载 | 规范阶段 |

### 实战架构建议

在复杂 Agent 系统中，三者构成分层架构：

```
┌─────────────────────────────────────────────┐
│           ANP（开放网络发现层）               │  ← 未来：跨组织 Agent 市场
├─────────────────────────────────────────────┤
│           A2A（Agent 协调层）                │  ← 当下：任务委托、生命周期、Artifact
├─────────────────────────────────────────────┤
│           MCP（工具接入层）                   │  ← 当下：Agent 内部调用工具/数据源
├─────────────────────────────────────────────┤
│        Agent Framework（ADK/LangGraph等）    │  ← 构建 Agent 的框架层
├─────────────────────────────────────────────┤
│           LLM（模型推理层）                   │
└─────────────────────────────────────────────┘
```

**决策规则**：
- 能力是本地、同步的 → 用 MCP
- 涉及另一个自治 Agent、长运行任务、跨组织信任边界 → 用 A2A
- 跨互联网的去中心化 Agent 发现 → 未来用 ANP

### A2A 的核心价值

1. **打破孤岛**：不同框架/厂商的 Agent 无需定制集成即可协作
2. **保护 IP**：Agent 不暴露内部逻辑即可协作——"基于声明的能力和交换的信息协作"
3. **企业级安全**：显式凭证认证、OAuth2 作用域、传输层安全
4. **长任务原生支持**：从毫秒级 API 调用到数小时工作流，同一协议全覆盖
5. **多模态交互**：文本、文件、表单、媒体、iframe 均可作为 Part 交换

### 局限性

1. **无内置在线状态/存在机制**：仅有 Task 状态，无 Agent 级别的 presence
2. **调试困难**：Agent 不透明执行意味着分布式工作流的调试需要额外工具
3. **实现复杂度高**：相比 MCP 的轻量工具调用，A2A 的 10 个协调原语和 6 个交互阶段带来更高的编排复杂度
4. **依赖 HTTP 端点暴露**：跨组织协作需要暴露端点并管理信任关系
5. **生态仍在早期**：虽有 100+ 企业采用，但 Agent 原生支持仍在追赶中

---

## 附录：规范文件结构

```
a2a/
├── specification/
│   ├── a2a.proto              # 唯一权威规范源（Protocol Buffers）
│   ├── json/                  # 构建时自动生成的 JSON Schema（非规范）
│   ├── buf.yaml               # Buf 构建配置
│   └── buf.gen.yaml           # 代码生成配置
├── docs/                      # MkDocs 文档站源文件
├── adrs/                      # 架构决策记录
├── scripts/                   # 工具脚本
├── .devcontainer/             # Dev Container 配置
├── README.md
├── CONTRIBUTING.md
├── GOVERNANCE.md
├── CHANGELOG.md
└── LICENSE                    # Apache 2.0
```

---

*分析基于 A2A Protocol v1.0.0 规范（a2a-protocol.org）、GitHub 源码（a2aproject/A2A）及学术对比论文（arXiv:2607.23884, arXiv:2505.02279）。*
