# 4-Page Analysis: admin / permission / enterprise / soma-admin

> 生成时间: 2026-08-30 | 目的: 合并前的功能分析

---

## 1. admin-client.tsx (775行, 34KB)

### 核心功能
- **系统总览仪表盘**: 4个统计卡片(Health/File Store/LLM Usage/Trajectories)
- **7个快捷操作按钮**: 清除缓存、清理过期数据、备份、导出配置、系统报告、健康检查、刷新
- **Organ状态网格**: 25+个organ的在线/离线状态(颜色编码)
- **组件统计详情**: 25个StatsCard展示各organ的详细指标

### 数据源
- `GET /api/admin/overview` (30秒轮询)
- `POST /api/admin/caches/clear`
- `POST /api/admin/cleanup`
- `POST /api/admin/backup`
- `GET /api/admin/export/config`
- `GET /api/admin/report`
- `GET /api/diagnostics/check-all`

### 独特特性
- 两个子组件: `ActionCard` + `StatsCard`
- 30秒自动刷新overview
- 所有organ的emoji图标映射(🩸🧪🛡🧬🧠📊💭🎨🔄📈⚡🪞🔊🔗🦴👁⚡💪💓🔗🧠🎤🏠📚🤖🌐🏷🔍📸⚙)
- 文件下载功能(导出config/report为JSON)
- 卡片式布局(违反"列表优于卡片"规则)

### 边框样式
- `border border-border` → 需统一为 `border border-[#27272a]`

---

## 2. permission-client.tsx (331行, 17KB)

### 核心功能
- **访问策略管理(CRUD)**: 创建/搜索/删除策略
- **角色管理**: 查询用户角色、分配角色、删除角色

### 数据源
- `GET /api/permission/policies`
- `POST /api/permission/policy`
- `DELETE /api/permission/policy`
- `GET /api/permission/roles/{username}`
- `POST /api/permission/role`
- `DELETE /api/permission/role`

### 独特特性
- 2个Tab: policies / roles
- 策略模型: `{role, resource, action, effect}`
- effect用badge显示(allow=green, deny=red)
- 删除二次确认(X按钮)
- 搜索过滤(role/resource/action)
- **最小的页面**，结构最简单

### 边框样式
- `border` / `border-border` → 混用，需统一

---

## 3. enterprise-client.tsx (568行, 28KB)

### 核心功能
- **用户与角色管理**: 查看用户列表、分配角色、分配权限
- **角色创建**: 创建角色+权限组合
- **审计日志**: 按action过滤、可调条数(20/50/100/200)

### 数据源
- `POST /api/enterprise/auth/login` (独立认证)
- `POST /api/enterprise/auth/register`
- `GET /api/enterprise/health`
- `GET /api/enterprise/users/list`
- `POST /api/enterprise/users/{id}/roles`
- `POST /api/enterprise/roles`
- `POST /api/enterprise/permissions`
- `GET /api/enterprise/audit?limit=N&action=X`

### 独特特性
- **独立认证系统**: 有自己的enterprise-token(localStorage)，自动尝试admin/admin登录，失败则注册
- 3个Tab: users / roles / audit
- 用户列表带头像首字母圆圈
- 审计日志支持status颜色(success=green, failure=red)
- 健康状态指示器(header右上角)
- 角色badge用蓝色样式
- `entFetch` 封装了enterprise认证

### 边框样式
- `border border-border` → 需统一

---

## 4. soma-admin-client.tsx (613行, 32KB)

### 核心功能
- **系统仪表盘**: status/version/connectors/collectors 4卡片 + 系统详情 + uptime
- **连接器管理**: 列表+详情面板，支持启用/禁用切换
- **采集器管理**: 列表+统计卡片(总数/运行/停止/错误)
- **配置查看**: JSON格式显示系统配置 + 连接信息

### 数据源
- `GET http://localhost:8091/api/status`
- `GET http://localhost:8091/api/connectors`
- `POST http://localhost:8091/api/connectors/{name}/toggle`
- `GET http://localhost:8091/api/collectors`

### 独特特性
- **硬编码somaBase**: `http://localhost:8091` (不走apiBase)
- 4个Tab: dashboard / connectors / collectors / config
- **移动端适配最完善**: connectors用`useIsMobile()`切换列表/详情模式，移动端有slide-over面板
- STATUS_COLORS映射: online/running/active=emerald, offline/stopped=red, degraded=amber
- `formatTime` 相对时间函数(刚刚/X分钟前/X小时前)
- cyan色系主题(区别于其他页面)
- 重复代码多: connector详情在mobile/desktop各写了一遍

### 边框样式
- `border border-border` → 需统一

---

## 功能重叠矩阵

| 功能 | admin | permission | enterprise | soma-admin |
|------|:-----:|:----------:|:----------:|:----------:|
| 系统健康状态 | ✅ | - | ✅ | ✅ |
| 用户管理 | - | - | ✅ | - |
| 角色管理 | - | ✅ | ✅ | - |
| 权限策略 | - | ✅ | ✅ | - |
| 审计日志 | - | - | ✅ | - |
| 连接器管理 | - | - | - | ✅ |
| 采集器管理 | - | - | - | ✅ |
| 组件统计 | ✅ | - | - | - |
| 快捷操作 | ✅ | - | - | - |
| 配置查看 | ✅(导出) | - | - | ✅(查看) |
| 备份功能 | ✅ | - | - | - |
| 独立认证 | - | - | ✅ | - |

## 合并建议

### 高度重叠
- **permission + enterprise**: 角色管理功能重复。enterprise是permission的超集(多了用户列表、审计日志、独立认证)

### 可合并
- **admin + soma-admin**: 都是系统管理，admin管OpenSoul内部organ，soma-admin管OpenSoma连接器/采集器。可合并为一个"系统管理"页面，Tab分别为: overview / organs / connectors / collectors / config

### 保留独立
- **enterprise**: 独立认证体系、审计日志，功能足够独立
- **permission**: 如果enterprise已覆盖，可合并进enterprise

### 统一边框计划
所有页面的 `border-border` / `border` 需替换为 `border-[#27272a]`，涉及约50+处。
