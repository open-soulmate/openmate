# CrewAI 功能研究

研究时间：2026-09-16 02:40
源码：github.com/crewAIInc/crewAI（Python，MIT）

## 架构概述

CrewAI是多agent编排框架——角色扮演+自主协作。10万+开发者认证。

## 核心功能

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| Crews（角色agent团队） | ❌ | ❌ | 大 | 角色定义+自主协作 |
| Flows（事件驱动工作流） | ❌ | 部分（will） | 大 | 精确工作流控制+单LLM调用 |
| 人机协作 | ❌ | 部分 | 中 | human-in-the-loop |
| 工具集成 | ✅ | ✅ | 小 | 外部工具/API/数据库 |
| 追踪观测 | ❌ | 部分 | 中 | 实时指标/日志/追踪 |
| 控制面板 | ❌ | ❌ | 中 | 集中管理/监控/扩展 |
| 企业安全 | ❌ | 部分（immune） | 中 | 安全合规 |
| 认证课程 | ❌ | ❌ | 小 | learn.crewai.com |

## 可复用设计

1. **Crews模式**：角色定义（goal+backstory+tools）→ 自主协作 → 结果汇总
2. **Flows模式**：事件驱动+精确控制+Crews嵌套
3. **AMP Suite**：企业级追踪/观测/治理/安全
