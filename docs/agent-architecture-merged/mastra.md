# Mastra

## 概述

Mastra 是一个面向 TypeScript 生态的 AI Agent 框架，提供 Agent、Workflow、Tool、Memory、MCP Server 等完整能力。其架构以 `@mastra/core` 为核心，围绕 Agent-Tool-Workflow 三角关系构建，支持 40+ 模型提供商，提供 Human-in-the-loop、RAG、评估和可观测性等生产级特性。，主要使用 TypeScript（https://github.com/mastra-ai/mastra）

## 核心架构

- Mastra 的 Agent 是框架的中枢，继承自 `MastraBase`，整合了 LLM 调用、工具执行、记忆管理、信号系统和可观测性。
- // packages/core/src/agent/agent.ts
- export type MastraLLM = MastraLLMV1 | MastraLLMVNext;
- // Agent 配置接口核心字段
- export interface AgentConfig {

## 关键技术

- Mastra 的工具系统基于泛型 `Tool` 类实现，支持完整的输入/输出 Schema 验证、挂起/恢复、审批机制和 MCP 协议集成。
- // packages/core/src/tools/tool.ts
- export const MASTRA_TOOL_MARKER = Symbol.for('mastra.core.tool.Tool');
- export class Tool<
- TSchemaIn = unknown,

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
