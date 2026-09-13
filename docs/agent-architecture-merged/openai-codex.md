# Openai Codex

## 概述

| 语言 | Rust（`codex-rs` monorepo） |，主要使用 Rust（https://github.com/openai/codex）

## 核心架构

- | Crate | 职责 |
- | `codex-tui` | 终端交互界面 |
- | `codex-cli` | 命令行入口、参数解析 |
- | `codex-core` | Agent 循环、工具、会话、审批 |

## 关键技术

- | 路径 | 说明 |
- | `codex-rs/` | Rust 主 monorepo |
- | `codex-rs/core/` | Agent 循环、工具、会话核心 |
- | `codex-rs/tui/` | 终端 UI |

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- MiMo报告
