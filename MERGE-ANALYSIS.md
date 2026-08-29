# 4-Page Merge Analysis (2026-08-30)

## 1. admin-client.tsx (775 lines, 34KB)

### Core Function
系统总控面板 — 监控所有25+ OpenSoul组件的健康状态和统计数据。

### Data Source
- `GET /api/admin/overview` → SystemOverview (health + stats)
- 7个一键操作 endpoint: `/api/admin/caches/clear`, `/api/admin/cleanup`, `/api/admin/backup`, `/api/admin/export/config`, `/api/admin/report`, `/api/diagnostics/check-all`

### Unique Features
- **30秒轮询** 自动刷新 overview
- **7个 ActionCard** 操作面板 (清缓存、清理过期、备份、导出配置、系统报告、健康检查、刷新)
- **Organ Grid** 8列网格显示所有organ在线状态 (绿色/红色)
- **25+ StatsCard** 组件统计 (vein/gland/immune/gene/hippo/vital/mind/vision/pipeline/trajectory/reflex/mirror/echo/link/marrow/sense/nerve/will/limb/pulse/heredity/cortex/voice/nest/knowledge/agent/graph/entity/search/capture/workflow)
- **4个顶部状态卡** (System Health, File Store, LLM Usage, Trajectories)
- 内含 ActionCard 和 StatsCard 两个子组件

### Layout
PageLayout > Header (title + Refresh) > 4状态卡 > 7 ActionCard网格 > Organ Grid > StatsCard网格

### Dependencies
- `getApiBaseUrl()` only (no auth token)
- lucide-react icons, PageLayout

---

## 2. permission-client.tsx (331 lines, 17KB)

### Core Function
RBAC权限管理 — 管理访问策略(CRUD)和用户角色分配。

### Data Source
- `GET /api/permission/policies` → Policy[]
- `POST /api/permission/policy` (创建)
- `DELETE /api/permission/policy` (删除)
- `GET /api/permission/roles/{username}` → RoleInfo
- `POST /api/permission/role` (分配角色)
- `DELETE /api/permission/role` (删除角色)

### Unique Features
- **双Tab**: Policies (表格) + Roles (查询+分配)
- **策略表格**: role/resource/action/effect 四列 + 搜索过滤 + 删除确认
- **角色管理**: 查询用户角色、分配/删除角色
- **Token认证**: 使用 `getToken()` + Bearer header

### Layout
PageLayout > 标题 > Tab切换 > 策略表格或角色管理面板

### Dependencies
- `getApiBaseUrl()` + `getToken()` (Bearer auth)
- PageLayout, i18n

---

## 3. enterprise-client.tsx (568 lines, 28KB)

### Core Function
企业级用户/角色/权限/审计管理 — 独立的用户体系，有自己的auth token。

### Data Source
- `POST /api/enterprise/auth/login` → access_token (独立token体系)
- `POST /api/enterprise/auth/register`
- `GET /api/enterprise/health`
- `GET /api/enterprise/users/list` → User[]
- `POST /api/enterprise/users/{id}/roles`
- `GET/POST /api/enterprise/roles` → Role[]
- `POST /api/enterprise/permissions`
- `GET /api/enterprise/audit?limit=N&action=X` → AuditEntry[]

### Unique Features
- **独立认证体系**: enterprise-token 存 localStorage，自动注册+登录 admin/admin
- **3个Tab**: Users & Roles / Role Management / Audit Log
- **用户列表**: 头像首字母 + 角色徽章
- **角色创建**: name + comma-separated permissions
- **权限分配**: user_id + resource + action (read/write/delete/admin)
- **审计日志**: 带action过滤、条数限制、状态颜色(success/failure)

### Layout
PageLayout > Header (title + health status + refresh) > 3 Tab > Content

### Dependencies
- `getApiBaseUrl()` + `getToken()` (main) + enterprise-token (separate)
- PageLayout, i18n

---

## 4. soma-admin-client.tsx (613 lines, 32KB)

### Core Function
Soma(8091)管理面板 — 管理连接器(connectors)和数据收集器(collectors)。

### Data Source
- `GET http://localhost:8091/api/status` → SystemStatus
- `GET http://localhost:8091/api/connectors` → Connector[]
- `POST http://localhost:8091/api/connectors/{name}/toggle`
- `GET http://localhost:8091/api/collectors` → Collector[]

### Unique Features
- **直连somaBase = "http://localhost:8091"** (不走apiBase!)
- **4个Tab**: Dashboard / Connectors / Collectors / Config
- **Connector详情**: 移动端overlay滑出面板 + 桌面端右侧展开 (使用 `useIsMobile()`)
- **Connector toggle**: 启用/禁用连接器
- **Collector统计卡**: total/running/stopped/error 四卡
- **Config tab**: JSON预览 + 连接信息(somaBase + apiBase)
- **formatTime()** 时间格式化函数 (相对时间)
- **STATUS_COLORS** 常量映射

### Layout
PageLayout > Header (Bot icon + badge + refresh) > Tab bar > Content

### Dependencies
- `getApiBaseUrl()` only (no auth)
- `useIsMobile()` hook
- PageLayout, i18n, cn utility

---

## Overlap Matrix

| 功能 | admin | permission | enterprise | soma-admin |
|------|-------|-----------|------------|------------|
| PageLayout | ✅ | ✅ | ✅ | ✅ |
| Tab切换 | ❌ | ✅ (2) | ✅ (3) | ✅ (4) |
| 用户管理 | ❌ | ❌ | ✅ | ❌ |
| 角色管理 | ❌ | ✅ | ✅ | ❌ |
| 权限策略 | ❌ | ✅ | ✅ | ❌ |
| 审计日志 | ❌ | ❌ | ✅ | ❌ |
| 系统健康 | ✅ | ❌ | ✅ (简单) | ✅ (简单) |
| 组件统计 | ✅ (25+) | ❌ | ❌ | ❌ |
| 操作面板 | ✅ (7个) | ❌ | ❌ | ❌ |
| 连接器管理 | ❌ | ❌ | ❌ | ✅ |
| 收集器管理 | ❌ | ❌ | ❌ | ✅ |
| Config展示 | ❌ | ❌ | ❌ | ✅ |
| Token认证 | ❌ | main token | 独立token | ❌ |
| 移动端适配 | 基础 | 基础 | 基础 | ✅ (overlay) |
| 边框统一 | 部分 | 部分 | 部分 | ✅ border-border |
| i18n | ✅ | ✅ | ✅ | ✅ |

## Merge Suggestions

### 高重叠: permission + enterprise
- 两者都做 用户/角色/权限 管理
- enterprise 是 permission 的超集 (多了audit + 独立auth)
- **建议**: 合并为一个页面，permission的策略管理作为enterprise的一个子tab

### admin 独立
- 纯系统监控+运维操作，与其他3个无功能重叠
- 保持独立

### soma-admin 独立
- 管理soma(8091)的connectors/collectors，功能完全独立
- 保持独立，但可优化UI一致性 (边框、布局模式)
