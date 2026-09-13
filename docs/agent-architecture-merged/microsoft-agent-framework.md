# Microsoft Agent Framework

## 概述

- 成功拉取：`README.md`（全量）、`docs/decisions/0037-agent-skills-design.md`（Agent Skills 多源架构 ADR）。，主要使用 Python（https://github.com/microsoft/agent-framework）

## 核心架构

- | 路径 | 职责 |
- |------|------|
- | `python/packages/` | Python 包集 |
- | `dotnet/src/` | .NET 源码 |
- | `python/samples/01-get-started` … `05-end-to-end` | 渐进样例 |

## 关键技术

- | 特性 | 说明 | 样例路径 |
- |------|------|----------|
- | 多语言 | Python + .NET 一致 API；Go 独立仓 | `python/packages` / `dotnet/src` |
- | 多 Provider | Foundry / Azure OpenAI / OpenAI / Copilot SDK… | `02-agents/providers` |
- | Middleware | 请求/响应、异常、自定义管线 | `02-agents/middleware` |

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- MiMo报告
