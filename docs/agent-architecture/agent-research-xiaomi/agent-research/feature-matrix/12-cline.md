# Cline 功能研究

研究时间：2026-09-16 02:45
源码：github.com/cline/cline（67409 stars，Apache-2.0）

## 架构概述

Cline是开源编码agent——SDK、IDE扩展、CLI助手。5个产品形态。

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| SDK | ❌ | ❌ | 大 | Node.js程序化agent API |
| CLI | ❌ | ❌ | 中 | 终端UI+headless模式 |
| VS Code扩展 | ❌ | ❌ | 中 | IDE内编码助手 |
| JetBrains插件 | ❌ | ❌ | 中 | IntelliJ/PyCharm等 |
| Kanban看板 | ❌ | ❌ | 大 | Web多agent任务板，每个卡片独立worktree+自动提交+依赖链 |
| 人机审批 | ❌ | 部分（immune） | 中 | human-in-the-loop审批 |
| 多agent团队 | ❌ | ❌ | 大 | SDK支持多agent协作 |
| 定时自动化 | ❌ | 部分 | 中 | 定时任务触发 |

## 可复用设计

1. **Kanban模式**：Web任务板，每个任务独立worktree，自动提交，依赖链管理
2. **SDK统一引擎**：CLI/Kanban/VS Code/JetBrains共用同一agent引擎
3. **headless模式**：CI/CD集成，无头执行
