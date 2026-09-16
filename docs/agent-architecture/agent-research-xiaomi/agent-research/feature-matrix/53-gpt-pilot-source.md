# gpt-pilot (#53, Pythagora-io, 32k★) 功能研究（文档级，理由见下）

> ⚠️ **两个硬信号**：①README明言"This repo is not being maintained anymore"（公司转闭源Pythagora.ai）；②**2025-08-24遭供应链蠕虫攻击**（恶意commit 065ee8eb伪装成revert，Shai-Hulud类：窃取AWS/GitHub/npm/SSH凭证并横向传播，payload藏在core/telemetry/_runtime.bin）。→ 不clone、不引用其代码，仅记录架构遗产。

## 功能清单（历史架构，多已在他处互证）

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **多角色开发流水线**：Spec Writer→Architect→Tech Lead→Developer→Code Monkey→Reviewer分阶段prompt链 | 无 | ai_engine任务分解(非角色链) | 完全没有 | 已被MetaGPT/ChatDev覆盖（见22/61号报告），无需单独抄gpt-pilot |
| 2 | **dev_steps逐步开发记录**：每步存prompt/响应/diff，可回滚到任意步 | 无 | trajectory扁平事件 | 部分 | 与Cline checkpoint/opencode快照同族（互证） |
| 3 | **PostgreSQL/SQLite双库+workspace文件追踪**（fs.ignore_paths排除编译产物） | - | - | 部分 | ignore_paths模式已被Continue DEFAULT_SECURITY_IGNORE超越 |
| 4 | VS Code扩展形态 | 无 | - | 不建议跟进 | 公司已转闭源 |

## 结论
- gpt-pilot架构遗产已被MetaGPT(#22)/ChatDev(#61)/OpenHands(#17)三家更活跃项目完整覆盖，**研究价值归零**，从优先级列表移除
- **安全教训值得记录**：agent项目的telemetry目录是供应链攻击的理想藏身处（网络+凭证访问权限天然存在）——OpenSoul immune应对第三方agent依赖做：①telemetry类模块专项审计 ②出网目的地白名单（goose EgressInspector方向）③CI里bun/二进制文件出现即告警
