# Sandbox E2B Daytona

## 概述

- 成功拉取: `packages/js-sdk/src/index.ts`（完整导出）、`packages/js-sdk/src/sandbox/sandboxApi.ts`（完整 SandboxApi，约 800 行，含 lifecycle / network / fork / IAM / snapshot），主要使用 TypeScript（https://github.com/e2b-dev/e2b）

## 核心架构

- | 路径 | 职责 |
- |------|------|
- | `packages/js-sdk/src/sandbox/sandboxApi.ts` | Sandbox CRUD / lifecycle / network / fork / IAM |
- | `packages/js-sdk/src/sandbox/commands/` | 命令执行 / PTY |
- | `packages/js-sdk/src/sandbox/filesystem/` | 文件系统操作 / watch |

## 关键技术

- 支持工具调用、记忆管理、沙箱执行等核心能力

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- MiMo报告
