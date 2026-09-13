# Tabby

## 概述

Tabby 是一个**完全自包含**的 AI 编程助手，不需要外部数据库管理系统或云服务即可运行。其核心理念可以概括为三个关键词：**自托管（Self-hosted）、开放（OpenAPI）、轻量（Consumer GPU）**。，GitHub Stars: 33,874，主要使用 Python（https://github.com/TabbyML/tabby）

## 核心架构

- Tabby 是一个**完全自包含**的 AI 编程助手，不需要外部数据库管理系统或云服务即可运行。其核心理念可以概括为三个关键词：**自托管（Self-hosted）、开放（OpenAPI）、轻量（Consumer GPU）**。
- 与 GitHub Copilot 等商业方案不同，Tabby 的设计哲学是将代码智能完全部署在用户基础设施内。这意味着：
- - 代码不会离开用户的服务器
- - 不依赖任何第三方云 API
- - 支持消费级 GPU（如 RTX 3060/4060），降低硬件门槛

## 关键技术

- 1. **超时控制**：补全接口通过 `TimeoutLayer` 设置独立超时（`completion_timeout`），避免长时间阻塞
- 2. **仓库权限**：通过 `AllowedCodeRepository` 中间件控制代码搜索的范围，在企业版中由 Webserver 动态管理
- 3. **用户识别**：通过 `MaybeUser` header 传递用户身份，用于使用统计
- 4. **条件编译**：`#[cfg(feature = "ee")]` 实现社区版/企业版的功能差异，核心代码共享

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
