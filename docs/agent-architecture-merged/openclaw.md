# Openclaw

## 概述

OpenClaw 是一个运行在用户设备上、通过已有聊天渠道触达用户的 AI 助手平台。它将模型、工具、消息渠道和伴侣应用统一在一个 Gateway 之下，既可作为个人助手运行在单台笔记本上，也可作为团队共享部署。其核心架构哲学是：**可信网关、不可信执行、确定性策略**。，GitHub Stars: 389k，主要使用 TypeScript（https://github.com/openclaw/openclaw）

## 核心架构

- OpenClaw 采用 **Gateway 中心化** 架构，所有组件围绕一个本地控制平面（Gateway）组织：
- - **Gateway**：本地控制平面，管理会话、工具、事件和渠道连接。它是整个系统的核心枢纽，所有客户端（CLI、UI、TUI）和渠道（Telegram、WhatsApp、Slack 等）都通过 Gateway 进行通信。
- - **Control UI**：Web 管理界面，连接到 Gateway 进行配置和交互。
- - **CLI / TUI**：命令行和终端界面，提供开发者友好的交互方式。
- - **Channels**：消息渠道适配层，将助手带到 WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage 等平台。
- OpenClaw 是一个 TypeScript monorepo（pnpm workspace），核心理念是 **trusted gateway + untrusted execution + deterministic policy**。
- ┌─────────────────────────────────────────────────────────────┐
- │                    Gateway (唯一长驻进程)                      │

## 关键技术

- OpenClaw 是一个 **TypeScript monorepo**，使用 pnpm workspace 管理：
- - **包管理**：pnpm workspace，workspace 根目录定义了 `pnpm-workspace.yaml`，包含 `.`、`ui`、`packages/*`、`extensions/*`、`examples/*` 五个 workspace 组。
- - **构建工具**：使用 [tsdown](https://github.com/nicepkg/tsdown)（基于 Rolldown/esbuild 的 TypeScript 打包器），配置文件为 `tsdown.config.ts` 和 `tsdown.ai.config.ts`。构建产物输出到 `dist/` 目录。
- - **类型系统**：多套 `tsconfig` 分离关注点 —— `tsconfig.core.json`（Node 端生产代码，lib: ES2023）、`tsconfig.ui.json`（DOM/UI 代码）、`tsconfig.extensions.json`（插件代码）、`tsconfig.scripts.json`（构建脚本）。
- - **测试框架**：Vitest 5，配置文件 `vitest.config.ts`。
- - Compaction 前自动运行 silent memory flush turn，提醒 agent 保存重要上下文
- - Flush 使用私有对话副本，housekeeping 消息不出现于后续 turn
- - 可配置独立的 flush model（如本地 ollama）

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
- MiMo报告
