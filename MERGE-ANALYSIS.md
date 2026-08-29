# 四页面合并分析：admin / permission / enterprise / soma-admin

> 分析日期：2026-08-30 | 仅分析，未修改任何代码

---

## 1. 页面概览

| 页面 | 文件 | 行数 | 核心功能 | 数据源 | 认证方式 |
|------|------|------|----------|--------|----------|
| **admin** | admin-client.tsx | 775 | 系统总览 + 快速操作 + 25+组件统计 | `apiBase/api/admin/overview` (30s轮询) | 无（直接fetch） |
| **permission** | permission-client.tsx | 331 | RBAC策略CRUD + 用户角色查询/分配 | `apiBase/api/permission/*` | `getToken()` Bearer |
| **enterprise** | enterprise-client.tsx | 568 | 用户管理 + 角色管理 + 审计日志 | `apiBase/api/enterprise/*` | 独立enterprise-token（localStorage） |
| **soma-admin** | soma-admin-client.tsx | 613 | Soma连接器/收集器管理 + 系统状态 | `somaBase(8091)/api/*` | 无（直接fetch） |

---

## 2. 各页面详细结构

### 2.1 admin-client.tsx（775行）

**核心功能：** OpenSoul系统全局监控仪表盘

**布局：** PageLayout > Header(标题+刷新) > 4列状态卡 > Quick Actions(7个操作卡) > Organ Grid > 组件统计(25+)

**数据接口：**
- `GET /api/admin/overview` → SystemOverview（health + stats）
- `POST /api/admin/caches/clear`
- `POST /api/admin/cleanup`
- `POST /api/admin/backup`
- `GET /api/admin/export/config`
- `GET /api/admin/report`
- `GET /api/diagnostics/check-all`

**独特特性：**
- 30秒自动轮询overview
- 7个Quick Action按钮（清除缓存、清理过期、备份、导出配置、系统报告、健康检查、刷新）
- 25+个StatsCard组件展示各organ统计（vein/gland/immune/gene/hippo/vital/mind/vision/pipeline/trajectory/reflex/mirror/echo/link/marrow/sense/nerve/will/limb/pulse/heredity/cortex/voice/nest/knowledge/agent/graph/entity/search/capture/workflow）
- ActionCard + StatsCard 两个内部组件
- 边框：`border border-border`

**子组件：**
- `ActionCard`（685-748行）：icon + title + description + Execute按钮 + 结果反馈
- `StatsCard`（750-775行）：emoji + title + 2xN grid数据项

---

### 2.2 permission-client.tsx（331行）

**核心功能：** RBAC权限策略管理

**布局：** PageLayout > Header > Tabs(policies/roles) > 内容区

**数据接口：**
- `GET /api/permission/policies` → Policy[]
- `POST /api/permission/policy` → 创建策略
- `DELETE /api/permission/policy` → 删除策略
- `GET /api/permission/roles/{username}` → RoleInfo
- `POST /api/permission/role` → 分配角色
- `DELETE /api/permission/role` → 删除角色

**独特特性：**
- **列表视图**：policies用`<table>`展示（角色/资源/操作/效果/删除）
- 搜索过滤（role/resource/action模糊匹配）
- 创建策略表单（4列grid：角色/资源/操作select/效果select）
- 角色管理tab：查询用户角色 + 分配角色
- 删除确认inline（不是modal）
- effect颜色编码：allow=green, deny=red
- 认证：`getToken()` + Bearer header

**接口定义：**
```typescript
interface Policy { id?, role, resource, action, effect, created_at? }
interface RoleInfo { username, roles[] }
```

---

### 2.3 enterprise-client.tsx（568行）

**核心功能：** 企业级用户/角色/权限/审计管理

**布局：** PageLayout > Header(健康状态) > Tabs(users/roles/audit) > 内容区

**数据接口：**
- `POST /api/enterprise/auth/login` → access_token
- `POST /api/enterprise/auth/register`
- `GET /api/enterprise/health`
- `GET /api/enterprise/users/list` → User[]
- `POST /api/enterprise/users/{id}/roles` → 分配角色
- `POST /api/enterprise/roles` → 创建角色
- `POST /api/enterprise/permissions` → 分配权限
- `GET /api/enterprise/audit?limit=N&action=X` → AuditEntry[]

**独特特性：**
- **独立认证系统**：enterprise-token存在localStorage，与主app token分离
- **自动认证**：ensureEntAuth() → 尝试admin登录 → 失败则自动注册+登录
- **3个tab**：Users & Roles / Role Management / Audit Log
- Users tab：分配角色表单 + 分配权限表单 + 用户列表（头像首字母+角色badge）
- Roles tab：创建角色（名称+逗号分隔权限） + 角色列表
- Audit tab：action过滤 + limit选择(20/50/100/200) + 审计条目列表（status颜色badge）
- 健康状态指示器（header右侧）

**接口定义：**
```typescript
interface User { id, username, email?, roles[], created_at? }
interface Role { role, permissions[] }
interface AuditEntry { id, timestamp, user_id, username?, action, resource, details?, ip?, status? }
```

---

### 2.4 soma-admin-client.tsx（613行）

**核心功能：** Soma连接器和收集器管理

**布局：** PageLayout > Header(badge) > Tabs(dashboard/connectors/collectors/config) > 内容区

**数据接口：**
- `GET http://localhost:8091/api/status` → SystemStatus
- `GET http://localhost:8091/api/connectors` → Connector[]
- `GET http://localhost:8091/api/collectors` → Collector[]
- `POST http://localhost:8091/api/connectors/{name}/toggle`

**独特特性：**
- **直连somaBase(8091)**，不走apiBase
- Dashboard：4列状态卡 + 系统详情key-value + uptime
- Connectors tab：左侧列表 + 右侧详情（桌面inline，移动端overlay滑出）
- **移动端适配**：useIsMobile() + 条件渲染（列表/详情切换 + 背景遮罩）
- Collectors tab：4列统计卡 + 收集器列表（状态badge + 错误提示）
- Config tab：JSON pre展示 + 连接信息
- toggleConnector：启用/禁用连接器
- STATUS_COLORS映射：online/running/active=emerald, offline/error=red, degraded=amber
- formatTime辅助函数（相对时间）

**接口定义：**
```typescript
interface SystemStatus { status, version?, uptime?, connectors_count?, collectors_count? }
interface Connector { id, name, type, status, enabled?, config?, last_active?, error_count?, last_error? }
interface Collector { id, name, type, status, events_collected?, last_event_at?, error? }
```

---

## 3. 重叠矩阵

| 功能点 | admin | permission | enterprise | soma-admin |
|--------|:-----:|:----------:|:----------:|:----------:|
| PageLayout包装 | ✅ | ✅ | ✅ | ✅ |
| Tab切换 | ❌ | ✅(2) | ✅(3) | ✅(4) |
| 用户列表 | ❌ | ❌ | ✅ | ❌ |
| 角色管理 | ❌ | ✅ | ✅ | ❌ |
| 权限策略CRUD | ❌ | ✅ | 部分 | ❌ |
| 审计日志 | ❌ | ❌ | ✅ | ❌ |
| 系统健康状态 | ✅ | ❌ | ✅ | ✅ |
| 组件统计 | ✅(25+) | ❌ | ❌ | 部分 |
| 连接器管理 | ❌ | ❌ | ❌ | ✅ |
| 收集器管理 | ❌ | ❌ | ❌ | ✅ |
| 快速操作按钮 | ✅(7) | ❌ | ❌ | ❌ |
| 搜索过滤 | ❌ | ✅ | ✅(audit) | ❌ |
| 移动端适配 | 部分 | 部分 | 部分 | ✅(overlay) |
| 自动轮询 | ✅(30s) | ❌ | ❌ | ❌ |
| 独立认证 | ❌ | ❌ | ✅ | ❌ |

---

## 4. 关键差异

### 认证方式
- **admin**：无认证，直接fetch
- **permission**：`getToken()` + Authorization Bearer
- **enterprise**：独立enterprise-token，自动注册/登录流程
- **soma-admin**：无认证，直连8091端口

### API基础URL
- admin/permission/enterprise → `getApiBaseUrl()`（主API）
- soma-admin → `http://localhost:8091`（硬编码）

### UI风格差异
- **admin**：卡片网格布局，无tab
- **permission**：表格列表，简洁
- **enterprise**：列表+badge，蓝色主题
- **soma-admin**：列表+详情面板，cyan主题，移动端overlay

### 边框一致性
- 全部使用 `border border-border`
- soma-admin额外使用 `border-dashed` 用于uptime区域

---

## 5. 合并建议

### 高价值合并点
1. **permission + enterprise的角色管理**：功能高度重叠，enterprise是permission的超集
2. **admin的组件统计** 可独立为子组件，便于其他页面复用
3. **Tab组件**：4个页面都用tab，可抽取统一TabBar组件

### 不建议合并
1. **soma-admin**：独立服务(8091)，功能域完全不同，保持独立
2. **admin**：系统级监控，与其他3个管理页面职责不同

### 潜在合并方案
- **方案A**：permission并入enterprise（enterprise已有权限管理功能）
- **方案B**：4页面统一为一个"系统管理"页面，tab分为：总览(admin) / 权限(permission+enterprise) / 连接器(soma-admin)
