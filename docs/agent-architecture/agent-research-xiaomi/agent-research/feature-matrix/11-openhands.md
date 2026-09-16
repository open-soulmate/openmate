# OpenHands 功能研究

研究时间：2026-09-16 02:45
源码：github.com/All-Hands-AI/OpenHands（82254 stars）

## 架构概述

OpenHands是"自托管开发者控制中心"——运行OpenHands、Claude Code、Codex、Gemini或任何ACP兼容agent。

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| Agent Canvas | ❌ | ❌ | 大 | 多agent画布，always-on工程团队 |
| 多后端切换 | ❌ | ❌ | 大 | 本地/Docker/VM/云无缝切换 |
| 自动化工作流 | ❌ | 部分（will） | 大 | Slack/GitHub/Linear集成，定时/webhook触发 |
| ACP兼容 | ✅ | ✅ | 无 | 已有 |
| 多agent支持 | ❌ | ❌ | 大 | OpenHands/Claude Code/Codex/Gemini |
| 自带模型 | ✅ | ✅ | 小 | 任意LLM |
| 自托管 | ✅ | ✅ | 无 | 已有 |

## 可复用设计

1. **Agent Canvas**：多agent并行工作画布，每个agent独立workspace
2. **多后端抽象**：统一接口，本地/Docker/VM/云无缝切换
3. **自动化触发器**：定时+webhook+事件驱动
