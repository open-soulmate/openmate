# Nanobot

## 概述

Nanobot 采用**消息驱动的分层架构**，核心数据流如下：，主要使用 Python（https://github.com/HKUDS/nanobot）

## 核心架构

- Nanobot 采用**消息驱动的分层架构**，核心数据流如下：
- Channel (CLI/WebUI/Chat Apps)
- → MessageBus (InboundMessage)
- → AgentLoop (session, workspace, context)
- → AgentRunner (provider/tool loop)
- 1. **小核心 Agent Loop**：消息进来→LLM 决定是否用工具→记忆/技能按需注入为上下文
- 2. **多通道**：WebUI、终端 TUI、Telegram/Discord/Slack/WeChat/Email/Mattermost
- 3. **Gateway 模式**：`nanobot gateway --background` 作为长驻服务，客户端退出后仍运行

## 关键技术

- | 常量 | 值 | 出处 |
- |---|---|---|
- | `_SUBAGENT_TERMINAL_WAIT_SECONDS` | `300.0` | loop.py L124 |
- | `_PROVIDER_STATE_CHECKPOINT_VERSION` | `"v1"` | loop.py L261 |
- | `_RUNTIME_CHECKPOINT_KEY` | `"runtime_checkpoint"` | loop.py L258 |

## 对openmate的启示

- 1. **Gateway 长驻 + 多客户端**：核心是服务进程，WebUI/终端/IM 都是客户端
- 2. **小核心哲学**：避免重编排层，工具/记忆/技能按需作为上下文注入

## 参考来源

- 我们
- MiMo报告
- MiMo卡片
