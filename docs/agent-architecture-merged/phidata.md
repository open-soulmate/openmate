# Phidata

## 概述

1. [三层架构：Framework / AgentOS / Control Plane](#1-三层架构framework--agentos--control-plane)，主要使用 Python（https://github.com/agno-agi/agno）

## 核心架构

- Agno 最显著的架构特征是**三层分离**，将开发、运行、管理三个关注点彻底解耦：
- | 层级 | 组件 | 职责 |
- |------|------|------|
- | **Layer 1** | SDK (Framework) | 提供 Agent、Team、Workflow 三大原语，开发者编写逻辑 |
- | **Layer 2** | AgentOS (Runtime) | 将 Agent 注册为 FastAPI 服务，提供 REST API + SSE + WebSocket |

## 关键技术

- 预构建的 100+ 工具集成，覆盖 GitHub、Slack、Postgres、DuckDuckGo、Exa 等：
- from agno.tools.github import GitHubTools
- from agno.tools.slack import SlackTools
- Agno 原生支持 Model Context Protocol，既是 MCP 消费者也是 MCP 服务器：
- from agno.tools.mcp import MCPTools

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
