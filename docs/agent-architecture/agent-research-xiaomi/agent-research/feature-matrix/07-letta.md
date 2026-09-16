# Letta 功能研究

研究时间：2026-09-16 02:40
源码：github.com/letta-ai/letta（源码已迁移到letta-ai/letta-code）

## 架构概述

Letta（前MemGPT）是"有状态agent平台"——记忆能学习和自我改进。npm安装，支持终端UI、桌面App、Web、Slack/Telegram/Discord。

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| 有状态agent | ❌ | 部分 | 大 | 记忆持久化+自我改进 |
| 终端UI | ❌ | ❌ | 中 | 交互式终端界面 |
| 桌面App | ❌ | ❌ | 中 | macOS/Windows/Linux |
| App Server | ❌ | 部分 | 中 | 本地/自托管agent服务器 |
| 多渠道集成 | ✅ | ❌ | 小 | Slack/Telegram/Discord |
| Agent SDK | ❌ | ❌ | 大 | TypeScript SDK嵌入应用 |
| Letta Cloud | ❌ | ❌ | 中 | 跨设备记忆同步 |
| 记忆自我改进 | ❌ | 部分 | 大 | agent能从经验中学习 |

## 可复用设计

1. **记忆自我改进**：agent执行后自动更新记忆，下次执行更准确
2. **跨设备同步**：记忆云端同步，多设备共享
3. **Agent SDK模式**：将agent能力嵌入其他应用
