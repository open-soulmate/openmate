# Hermes Agent 功能研究

研究时间：2026-09-16 02:20
源码：github.com/NousResearch/hermes-agent

## 架构概述

Hermes Agent是我们的核心agent，231个agent模块+262个tools模块+完整gateway/cron/skills系统。

## 功能清单（对照OpenMate/OpenSoul）

### Agent核心（agent/目录，231个模块）

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| turn_*（完整的turn生命周期） | ❌ | 部分 | 大 | 25+个turn模块：preflight、retry、overflow、truncation、recovery、stop_gates等 |
| vault_*（密钥管理） | ❌ | ❌ | 大 | vault_store、vault_backends、vault_login_classifier |
| verification_*（验证系统） | ❌ | ❌ | 大 | verification_evidence、verification_stop、verify_hooks |
| background_review | ❌ | ❌ | 中 | 后台代码审查 |
| activity_tracking | ❌ | 部分 | 中 | 活动追踪 |
| account_usage/aux_accounting | ❌ | ❌ | 中 | 账户用量统计 |
| web_search_registry/provider | ✅ | 部分 | 小 | 已有 |
| video_gen_provider/registry | ❌ | ❌ | 中 | 视频生成provider抽象 |
| vision_message_prep | ❌ | 部分 | 中 | 视觉消息预处理 |
| trajectory_compressor | ❌ | 部分 | 中 | 轨迹压缩 |
| hermes_state_*（30+状态模块） | ❌ | 部分 | 大 | 完整状态管理系统：FTS搜索、WAL、压缩、修复、rewind等 |

### Tools（tools/目录，262个模块）

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| approval_*（审批系统） | ❌ | 部分（immune） | 大 | 7个审批模块：detection、floors、gateway_wait、human_wait、prompt、smart |
| browser_*（浏览器控制） | ❌ | ❌ | 大 | camofox、cdp_tool、dialog_tool、extension_router、lightpanda、supervisor |
| bot_*（机器人系统） | ❌ | ❌ | 大 | failure_reasons、live_delivery、mode_dm、mode_probe、relay |
| delegate/async_delegation | ❌ | ❌ | 大 | 异步任务委托 |
| blueprints（蓝图） | ❌ | ❌ | 中 | 任务蓝图模板 |

### Gateway（gateway/目录）

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| browser_control_broker | ❌ | ❌ | 大 | 浏览器控制代理 |
| builtin_hooks | ❌ | 部分 | 中 | 内置钩子系统 |
| channel_directory | ✅ | ❌ | 小 | 渠道目录 |
| bot_loop_guard | ❌ | ❌ | 中 | 机器人循环保护 |
| cgroup_cleanup | ❌ | ❌ | 小 | cgroup清理 |

### Cron（cron/目录）

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| blueprint_catalog | ❌ | ❌ | 中 | 蓝图目录 |
| delivery_queue | ❌ | ❌ | 中 | 投递队列 |
| incidents | ❌ | ❌ | 中 | 事件管理 |
| lifecycle_guard | ❌ | ❌ | 中 | 生命周期保护 |

### Skills（skills/目录）

| 功能 | OpenMate | OpenSoul | 差距 | 说明 |
|------|----------|----------|------|------|
| 13个skill分类 | ✅ | ❌ | 小 | OpenMate有skills面板 |
| index-cache | ❌ | ❌ | 小 | 索引缓存 |

## 关键发现

### OpenMate/OpenSoul完全缺少的高价值功能

1. **turn生命周期管理**（25+模块）：preflight、retry、overflow、truncation、recovery、stop_gates——完整的turn状态机
2. **审批系统**（7模块）：智能审批检测、审批层级、人机等待、审批提示
3. **浏览器控制**（6+模块）：camofox、CDP、对话框、扩展路由、supervisor
4. **vault密钥管理**：安全存储、后端抽象、登录分类
5. **验证系统**：证据收集、停止条件、验证钩子
6. **状态管理**（30+模块）：FTS搜索、WAL、压缩、修复、rewind、portability
7. **bot系统**：失败原因、实时投递、DM模式、中继
8. **异步委托**：任务委托+异步执行
9. **轨迹压缩**：trajectory_compressor
10. **视频生成**：provider抽象+registry

## 可复用设计

1. **turn状态机**：25个模块的turn生命周期，可借鉴到OpenSoul的cortex
2. **审批层级**：approval_floors定义不同操作的审批要求
3. **状态FTS搜索**：hermes_state_fts提供全文搜索能力
4. **浏览器supervisor**：browser_supervisor_frames/dialogs管理浏览器会话
5. **异步委托模式**：async_delegation支持任务委托
