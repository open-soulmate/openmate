# N8N

## 概述

n8n 采用版本化节点架构，所有节点（包括 AI Agent）都通过 `VersionedNodeType` 基类管理多版本。这种设计允许节点在不破坏现有工作流的情况下持续演进。，主要使用 TypeScript（https://github.com/n8n-io/n8n）

## 核心架构

- 执行引擎是 n8n 的心脏，负责工作流的调度和执行。它使用 `PCancelable` 实现可取消的异步执行，支持部分执行（Partial Execution）优化。
- **源码位置**: `packages/core/src/execution-engine/workflow-execute.ts`
- export class WorkflowExecute {
- private status: ExecutionStatus = 'new';
- private readonly abortController = new AbortController();
- | 路径 | 职责 |
- |------|------|
- | `packages/cli/src/commands/worker.ts` | Worker 进程入口命令 |

## 关键技术

- 支持工具调用、记忆管理、沙箱执行等核心能力

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
- MiMo报告
