# Open Interpreter

## 概述

Open Interpreter 经历了一次根本性的架构跃迁。最初以 Python 实现的 "自然语言 → 代码执行" 概念起家，允许用户用自然语言控制计算机。当前版本已完全用 **Rust 重写**，基于 OpenAI 的 Codex 项目分叉而来，定位从"通用代码解释器"转变为"面向低成本模型优化的编码 Agent"。原 Python 版本已由社区维护为独立 fork（`endolith/open-interpreter`）。，主要使用 Python（https://github.com/OpenInterpreter/open-interpreter）

## 核心架构

- 项目核心位于 `codex-rs/` 目录，采用 Rust workspace 组织，主要 crate 包括：
- | Crate | 职责 |
- |-------|------|
- | `codex-core` | 核心引擎：Agent 控制、会话管理、执行策略、沙箱、MCP、Harness |
- | `codex-cli` | CLI 入口：登录、命令解析、子命令分发 |
- openmate-runtime (Codex-like core 或自研)
- ├── harness/
- │     ├── native.rs

## 关键技术

- | 路径 / 入口 | 说明 |
- | `codex-rs/` | Rust 主体（Codex 基座） |
- | `scripts/write_provider_catalog.py` | 供应商目录生成 |
- | `scripts/test-codex-sdk-compat.sh` | Codex SDK 兼容测试 |

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
- MiMo报告
