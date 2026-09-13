# Roo Code

## 概述

Roo Code 采用 **VS Code Extension + WebView UI** 的经典双进程架构，是一个运行在编辑器中的 AI 自主编码代理。其核心是一个 **Task 循环引擎**——用户发起任务后，系统通过 LLM 驱动的 ReAct 循环（推理→工具调用→观察→推理）自主完成编码工作。，主要使用 TypeScript（https://github.com/RooCodeInc/Roo-Code）

## 核心架构

- Roo Code 采用 **VS Code Extension + WebView UI** 的经典双进程架构，是一个运行在编辑器中的 AI 自主编码代理。其核心是一个 **Task 循环引擎**——用户发起任务后，系统通过 LLM 驱动的 ReAct 循环（推理→工具调用→观察→推理）自主完成编码工作。
- 项目使用 **pnpm monorepo + Turborepo** 管理，包含以下主要包：
- ├── build/          # 构建配置
- ├── config-eslint/  # ESLint 共享配置
- **以 VS Code Extension 为宿主的 Cline 系 Agent：Task 为中心的消息/工具循环 + 多模式（Code/Architect/Ask/Debug/Custom）+ Checkpoints（git 工作区快照）+ MCP + Orchestrator 子任务；后期抽出 `@roo-code/core`/`types`/`ipc` 支撑 CLI/headless。**
- - 写文件 / `new_task` 等副作用工具触发 **workspace snapshot**
- - 支持 chat 内 **previous checkpoint 导航**
- - 恢复策略通常可拆：仅消息状态 / 仅文件 / 两者

## 关键技术

- | 路径 | 职责 |
- | `src/`（extension） | VS Code 插件本体：webview UI、Task、providers、tools |
- | `packages/core` | 平台无关逻辑，exports `./cli`、`./browser` |
- | `packages/types` | 类型 + 配置 schema + npm 发布 `@roo-code/types` |

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
- MiMo报告
