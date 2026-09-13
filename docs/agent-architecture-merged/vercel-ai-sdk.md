# Vercel Ai Sdk

## 概述

Vercel AI SDK 是由 Next.js 团队打造的 **Provider 无关的 TypeScript AI 工具包**，提供统一 API 对接 OpenAI、Anthropic、Google 等 25+ 模型提供商。其核心设计理念是**三层抽象**：Core 层（generateText/streamText）、Provider 层（统一语言模型规范）、UI 层（框架无关的 React/Svelte/Vue hooks）。本文从 10 个维度深入剖析其架构设计。，主要使用 TypeScript（https://github.com/vercel/ai）

## 核心架构

- AI SDK 的核心创新是定义了一套 **Language Model Specification（语言模型规范）**，所有 Provider 必须实现该规范接口。通过 `@ai-sdk/provider` 包发布规范，`@ai-sdk/provider-utils` 提供工具函数，各 Provider 包（如 `@ai-sdk/openai`）实现具体适配。
- // packages/ai/src/model/resolve-model.ts
- // 模型解析：字符串 → Provider 实例 → LanguageModel
- import type { LanguageModel } from '../types';
- // 支持两种使用方式：

## 关键技术

- 工具系统采用 **Zod Schema 驱动** 的类型安全设计，支持四种工具类型：
- // packages/ai/src/prompt/content-part.ts - 工具调用部分
- export interface ToolCallPart {
- type: 'tool-call';
- /** ID of the tool call. This ID is used to match the tool call with the tool result. */

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
