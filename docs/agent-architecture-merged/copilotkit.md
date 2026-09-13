# CopilotKit

## 概述

CopilotKit 是一个AI Copilot开发框架。

**仓库**: https://github.com/CopilotKit/CopilotKit | **语言**: TypeScript | **License**: MIT

## 核心架构

**编排模式（源码确认：非 agent 编排，是协议/中间层）**：CopilotKit 不做任务规划。其核心是 **AG-UI 事件流协议**：runtime 作为中间层，向后调用用户的 agent runner，向前把 agent 的状态变化封装为标准事件推给前端。

**核心组件划分（源码确认）**：
- **Runtime 中间层（`packages/runtime`）**：`createCopilotRuntimeHandler` 接收前端请求，代理鉴权、路由到对应 agent runner，把执行过程转成事件流。
- **Runner（`runner/`）**：对接后端 agent 框架（LangGraph 等；package.json 导出 `./langgraph`）。
- **前端组件层（`packages/core` + react/angular）**：消费事件流渲染聊天、生成式 UI。
- **Intelligence Platform（`intelligence-platform/`）**：托管 threads（CreateThreadRequest/ThreadSummary/ListThreads/Subscribe/Update）。
- **MCP（源码确认）**：`export type { MCPClient, MCPTransport } from "@ai-sdk/mcp"`——运行时通过 AI SDK 的 MCP 客户端接线工具。

**数据流**：前端发请求 → runtime fetch handler → 路由到 agent runner → runner 执行（可挂 MCP 工具）→ 每步产出 AG-UI 事件（消息增量、工具调用、状态更新、生命周期）经 SSE 推回 → 前端流式渲染。

**关键导出（源码确认）**：`createCopilotRuntimeHandler`、`CopilotRuntimeHooks`（`HookContext/HandlerHookContext/ResponseHookContext/ErrorHookContext`）、`CopilotCorsConfig`、`ChannelsControl/ChannelStatus`、`MCPClient/MCPTransport`。

```mermaid
flowchart LR
 FE[React/Angular 前端] |AG-UI SSE 事件流| RT[createCopilotRuntimeHandler]
 RT --> R[runner: LangGraph/CrewAI/...]
 RT --> MCP[MCPClient via @ai-sdk/mcp]
 RT --> TH[intelligence-platform threads]
```

## 关键技术

1. **协议先行（AG-UI）**：把"agent↔UI 如何通信"抽象成标准事件流，换 agent 框架不用改前端，换前端框架不用改 agent。
2. **框架无关 fetch handler（源码确认）**：runtime 核心只依赖 Web `Request`，一套逻辑适配 express/hono/bun/edge。
3. **v1→v2 平滑迁移（源码确认）**：v1 入口加 deprecation 注释与 IDE 警告，`v1-deprecated-compatibility` 保留兼容，避免破坏存量。
4. **Hooks 可观测/可拦截（源码确认）**：error/response/handler 钩子让中间层能插鉴权、审计、错误归一。
5. **MCP 一等公民（源码确认）**：直接 re-export `@ai-sdk/mcp` 类型，工具生态即插即用。

- **错误钩子归一（源码确认）**：`CopilotRuntimeHooks` 含 `ErrorHookContext`，中间层可在错误冒泡到前端前统一捕获/改写，前端拿到的是结构化错误事件而非裸异常。
- **请求-响应钩子（源码确认）**：`HandlerHookContext`/`ResponseHookContext` 包住请求生命周期，便于注入超时/鉴权/限流逻辑（机制已留，具体策略在用户侧）。
- **CORS 显式配置（源码确认）**：`CopilotCorsConfig` 显式管理跨域，避免默认放开。
- **版本兼容层（源码确认）**：`v1-deprecated-compatibility` 把破坏性变更隔在兼容层后，运行时不因升级崩。
- **框架无关降级**：同一 handler 在不同运行时/edge 都能跑，部署环境故障可换适配器。
- **边界**：`createCopilotRuntimeHandler` 直接吃 `Request`，输入契约明确，避免包装层歧义。

- **无状态中间层（架构/源码推断）**：runtime 是请求代理，会话状态在后端 agent 与 intelligence-platform（threads），本身无状态、可水平扩。
- **异步 SSE 流（架构确认）**：事件流异步推送，长任务不阻塞；前端断线靠事件重连语义。
- **多运行时部署（源码确认）**：express/hono/node/bun/edge 适配器，可按环境选最优（edge 低延迟、node 生态全）。
- **Channels 控制面（源码确认）**：`channel-manager` 管理通道状态，便于多连接/多端的连接生命周期治理。
- **托管 threads（源码确认）**：会话持久化在 intelligence-platform，runtime 重启不丢会话。
- **可观测（源码确认）**：hooks 天然是埋点点（handler/response/error），用户可挂 metrics。

- **非 agent，无运行时自学习**：CopilotKit 不改变模型权重。
- **工具生态（MCP，源码确认）**：agent 的能力靠挂 MCP 工具（`MCPClient`）扩展，能力增长来自工具生态而非在线学习。
- **Threads 会话沉淀（源码确认）**：`CreateThread/SubscribeToThread` 把对话会话结构化托管，可作为后续个性化/历史上下文的底座。
- **Generative UI 的反馈闭环（架构）**：agent 产出结构化 UI，用户交互回流为事件——这是"界面层的自反馈"，但非模型自改进。
- **结论**：自我进化不在此层；它提供的是让 agent 进化的"管道"（事件流 + 工具 + 会话）。

## 对openmate的启示

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 豆包（077_CopilotKit.md）
