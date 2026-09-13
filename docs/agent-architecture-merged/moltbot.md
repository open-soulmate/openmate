# Moltbot

## 概述

OpenClaw（原 Moltbot）是一个**自托管的个人 AI 助手平台**。其核心理念是"Your own personal AI assistant. Any OS. Any Platform."——用户在自己的设备上运行 Gateway 控制面，通过已有的聊天通道（WhatsApp、Telegram、Slack、Discord、WeChat、Signal 等 20+ 平台）与 AI 交互。，主要使用 TypeScript（https://github.com/moltbot/moltbot）

## 核心架构

- OpenClaw（原 Moltbot）是一个**自托管的个人 AI 助手平台**。其核心理念是"Your own personal AI assistant. Any OS. Any Platform."——用户在自己的设备上运行 Gateway 控制面，通过已有的聊天通道（WhatsApp、Telegram、Slack、Discord、WeChat、Signal 等 20+ 平台）与 AI 交互。
- 与 ChatGPT/Claude 等 SaaS 产品不同，OpenClaw 强调 **"own your data"**——所有数据、会话、记忆都存储在用户自己的机器上。Gateway 只是控制面，产品本身就是助手体验。
- **关键设计决策**：
- - 单用户架构（非多租户），优化个人使用场景
- - Gateway 作为"always-on"后台守护进程运行

## 关键技术

- `src/memory/` + `src/memory-host-sdk/` 构成分层记忆系统：
- - **Session Memory**：会话内短期记忆
- - **Host Memory**：跨会话持久记忆，通过 `memory-host-sdk` 提供宿主接口
- - **Embedding**：向量嵌入支持语义搜索
- - **Session Cards**：`src/session-cards/` 会话摘要卡片

## 对openmate的启示

- **P1**: 可借鉴其架构设计理念，增强openmate的模块化和扩展性
- **P2**: 参考其工具调用和记忆管理机制

## 参考来源

- 我们
