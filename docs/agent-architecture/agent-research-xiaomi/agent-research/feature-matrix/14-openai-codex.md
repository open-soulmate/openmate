# OpenAI Codex 功能研究

研究时间：2026-09-16 02:45
源码：github.com/openai/codex（121270 stars，Apache-2.0）

## 架构概述

Codex CLI是OpenAI的编码agent，本地运行。Rust+TypeScript。

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| 终端agent | ❌ | ❌ | 大 | 轻量级终端编码agent |
| IDE集成 | ❌ | ❌ | 中 | VS Code/Cursor/Windsurf |
| 桌面App | ❌ | ❌ | 中 | codex app |
| 云端agent | ❌ | ❌ | 中 | Codex Web (chatgpt.com/codex) |
| ChatGPT登录 | ❌ | ❌ | 小 | 用ChatGPT账号认证 |
| 多平台安装 | ✅ | ❌ | 小 | npm/brew/脚本 |

## 可复用设计

1. **Rust实现**：高性能终端agent
2. **本地+云端混合**：本地CLI+云端Web，无缝切换
3. **IDE插件模式**：同一agent引擎，多IDE适配
