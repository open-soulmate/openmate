# A2A Protocol

## 概述

A2A Protocol 是一个Agent间通信协议。

**仓库**: https://github.com/a2aproject/A2A | **语言**: Python

## 核心架构

> **协议全称**: Agent2Agent (A2A) Protocol
> **版本**: v1.0.0（2025年正式发布，Linux Foundation 托管）
> **GitHub**: https://github.com/a2aproject/A2A （25.5k stars，2.6k forks，617 commits）
> **官网**: https://a2a-protocol.org
> **许可证**: Apache License 2.0
> **发起者**: Google，由 Linux Foundation Agentic AI Foundation 管理
> **官方SDK**: Python、Go、JS、Java、.NET、Rust（六语言全覆盖）

A2A 是业界首个专门为 **Agent 间对等通信** 设计的开放协议。它解决的核心问题是：不同框架（LangGraph、CrewAI、ADK）、不同厂商、不同服务器上运行的 AI Agent，如何像"同事"一样协作，而非仅仅作为"工具"被调用。

A2A 的五大设计原则：

1. **简洁性（Simple）**：复用既有标准——HTTP、JSON-RPC 2.0、Server-Sent Events（SSE），不发明新的传输层。
2. **企业就绪（Enterprise Ready）**：认证、授权、安全、隐私、追踪、监控均对齐企业既有实践。
3. **异步优先（Async First）**：原生支持长时间运行任务（LRO）和 human-in-the-loop 场景。
4. **模态无关（Modality Agnostic）**：文本、音频、视频、表单、iframe、结构化 JSON 均可交换。
5. **不透明执行（Opaque Execution）**：Agent 协作时无需暴露内部记忆、逻辑或工具实现——保护知识产权。

**A2A 与 MCP 的本质区别**：MCP 连接 LLM 与工具/数据源（纵向集成），A2A 连接 Agent 与 Agent（横向协同）。两者互补而非竞争——复杂 Agent 系统同时需要两者。

A2A 规范采用清晰的三层架构设计，确保核心语义在不同协议绑定间保持一致：

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

在复杂 Agent 系统中，三者构成分层架构：

[详见源码]

**决策规则**：
- 能力是本地、同步的 → 用 MCP
- 涉及另一个自治 Agent、长运行任务、跨组织信任边界 → 用 A2A
- 跨互联网的去中心化 Agent 发现 → 未来用 ANP

## 关键技术

A2A 是业界首个专门为 **Agent 间对等通信** 设计的开放协议。它解决的核心问题是：不同框架（LangGraph、CrewAI、ADK）、不同厂商、不同服务器上运行的 AI Agent，如何像"同事"一样协作，而非仅仅作为"工具"被调用。

A2A 的五大设计原则：

1. **简洁性（Simple）**：复用既有标准——HTTP、JSON-RPC 2.0、Server-Sent Events（SSE），不发明新的传输层。
2. **企业就绪（Enterprise Ready）**：认证、授权、安全、隐私、追踪、监控均对齐企业既有实践。
3. **异步优先（Async First）**：原生支持长时间运行任务（LRO）和 human-in-the-loop 场景。
4. **模态无关（Modality Agnostic）**：文本、音频、视频、表单、iframe、结构化 JSON 均可交换。
5. **不透明执行（Opaque Execution）**：Agent 协作时无需暴露内部记忆、逻辑或工具实现——保护知识产权。

**A2A 与 MCP 的本质区别**：MCP 连接 LLM 与工具/数据源（纵向集成），A2A 连接 Agent 与 Agent（横向协同）。两者互补而非竞争——复杂 Agent 系统同时需要两者。

将抽象操作映射到具体协议：

- **JSON-RPC 2.0 over HTTP(S)**：主要绑定，方法名如 `message/send`、`tasks/get`
- **gRPC**：通过 `a2a.proto` 直接生成服务定义
- **HTTP+JSON/REST**：RESTful 端点，如 `POST /message:send`、`GET /tasks/{id}`
- **Custom Bindings**：允许扩展自定义绑定

Agent Card 是 A2A 协议的**发现基石**。每个 A2A Server 在 `/.well-known/agent.json`（RFC 8615）发布一个 JSON 描述文档：

[详见源码]

**关键设计特点**：

1. **公开/扩展双卡机制**：公开 Card 不含敏感信息；认证后可通过 `GetExtendedAgentCard` 获取更详细的技能列表。
2. **多接口声明**：同一个 Agent 可同时暴露 JSON-RPC、gRPC、REST 多种绑定。
3. **安全方案声明**：OAuth2、API Key、OpenID Connect、HTTP Auth、Mutual TLS 均可在 Card 中声明。
4. **技能级模态覆盖**：全局 `defaultInputModes`/`defaultOutputModes` 可在每个 Skill 级别覆写。
5. **无中心注册表**：基于 URL 的分布式发现——任何能到达 HTTP 端点的 Agent 都可以发现并协作。

Agent Card 中声明支持的安全方案：

| 方案 | 说明 |
|------|------|
| `HTTPAuthSecurityScheme` | HTTP Bearer Token（JWT 等） |
| `OAuth2SecurityScheme` | OAuth 2.0（支持 Authorization Code、Client Credentials 等流程） |
| `OpenIdConnectSecurityScheme` | OpenID Connect（基于 URL 发现） |
| `APIKeySecurityScheme` | API Key（Header/Query/Cookie） |
| `MutualTLSSecurityScheme` | 双向 TLS 证书认证 |

- **Observability**：支持分布式追踪（trace_id）
- **多租户**：`tenant` 字段支持路由到不同 Agent/租户
- **版本协商**：`A2A-Version` 头部确保协议版本兼容性
- **幂等性**：Get 操作天然幂等；Send Message 可通过 `messageId` 检测重复

Agent 可在 AgentCard 中声明自定义扩展：

```json
{
  "extensions": [
    {
      "uri": "https://example.com/extensions/geolocation/v1",
      "description": "Adds geolocation context to messages",
      "required": false

## 对openmate的启示

在复杂 Agent 系统中，三者构成分层架构：

[详见源码]

**决策规则**：
- 能力是本地、同步的 → 用 MCP
- 涉及另一个自治 Agent、长运行任务、跨组织信任边界 → 用 A2A
- 跨互联网的去中心化 Agent 发现 → 未来用 ANP

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（41-a2a-protocol.md）
