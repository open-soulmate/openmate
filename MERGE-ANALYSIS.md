# 4页面分析：admin / permission / enterprise / soma-admin

> 纯分析，未修改任何代码。2026-08-30

---

## 1. admin-client.tsx（775行 / 33KB）

**核心功能**：OpenSoul 系统总控面板

**数据源**：
- `GET /api/admin/overview` → SystemOverview（health + stats），30秒轮询
- 6个操作端点：`/api/admin/caches/clear`、`/api/admin/cleanup`、`/api/admin/backup`、`/api/admin/export/config`、`/api/admin/report`、`/api/diagnostics/check-all`

**UI结构**：
- PageLayout包裹
- 顶部：4张统计卡片（System Health、File Store、LLM Usage、Trajectories）
- 中部：6个ActionCard（Quick Actions）— 清缓存、清过期、备份、导出配置、系统报告、健康检查
- 底部：Organ状态网格（3-8列响应式）+ 28个StatsCard展示各组件统计

**独特特性**：
- 28个组件统计卡片（vein/gland/immune/gene/hippo/vital/mind/vision/pipeline/trajectory/reflex/mirror/echo/link/marrow/sense/nerve/will/limb/pulse/heredity/cortex/voice/nest/knowledge/agent/graph/entity/search/capture/workflow）
- ActionCard + StatsCard 两个子组件
- 文件下载功能（导出配置/系统报告）
- 最大的页面，纯展示+操作，无CRUD

**与permission重叠**：无

---

## 2. permission-client.tsx（331行 / 17KB）

**核心功能**：访问控制策略管理（RBAC）

**数据源**：
- `GET /api/permission/policies` → Policy[]
- `POST /api/permission/policy` → 创建策略
- `DELETE /api/permission/policy` → 删除策略
- `GET /api/permission/roles/{username}` → RoleInfo
- `POST /api/permission/role` → 分配角色
- `DELETE /api/permission/role` → 删除角色

**UI结构**：
- PageLayout包裹
- 2个Tab：policies（策略列表） + roles（角色管理）
- Policies Tab：搜索 + 创建表单（4列grid: role/resource/action/effect） + 表格列表
- Roles Tab：查询用户角色 + 分配角色

**独特特性**：
- 使用 `getToken()` 做认证（Bearer token）
- 表格视图展示策略（role/resource/action/effect + 删除确认）
- 搜索过滤（role+resource+action 模糊匹配）
- effect用彩色badge（allow=green, deny=red）
- 最小最精简的页面

**与enterprise重叠**：角色管理功能高度重叠（但permission用表格，enterprise用列表）

---

## 3. enterprise-client.tsx（568行 / 28KB）

**核心功能**：企业级用户/角色/权限/审计管理

**数据源**：
- `GET /api/enterprise/health` → 健康检查
- `POST /api/enterprise/auth/login` + `POST /api/enterprise/auth/register` → 独立认证
- `GET /api/enterprise/users/list` → User[]
- `GET /api/enterprise/roles` → Role[]
- `POST /api/enterprise/roles` → 创建角色
- `POST /api/enterprise/users/{id}/roles` → 分配角色
- `POST /api/enterprise/permissions` → 分配权限
- `GET /api/enterprise/audit` → AuditEntry[]

**UI结构**：
- PageLayout包裹
- 3个Tab：users（用户+角色分配+权限分配）、roles（角色创建+列表）、audit（审计日志）
- Users Tab：分配角色表单 + 分配权限表单 + 用户列表（头像首字母+角色badge）
- Roles Tab：创建角色表单 + 角色列表（权限badge）
- Audit Tab：过滤+分页选择+审计条目列表（action badge+resource+username+IP+时间）

**独特特性**：
- **独立认证系统**：enterprise有自己的token（localStorage: enterprise-token），自动注册/登录
- 3个Tab（比permission多audit）
- 审计日志功能（最完整的操作追踪）
- 用户列表用头像首字母+角色badge样式
- 蓝色主题色（区别于permission的默认色）
- `entFetch` 封装了企业认证的fetch

**与permission重叠**：
- 角色CRUD和分配角色功能几乎相同
- 都管理RBAC，但enterprise更完整（多了users列表+audit）

---

## 4. soma-admin-client.tsx（613行 / 32KB）

**核心功能**：Soma（opensoma:8091）连接器/收集器管理面板

**数据源**：
- `GET http://localhost:8091/api/status` → SystemStatus
- `GET http://localhost:8091/api/connectors` → Connector[]
- `GET http://localhost:8091/api/collectors` → Collector[]
- `POST http://localhost:8091/api/connectors/{name}/toggle` → 启停连接器

**UI结构**：
- PageLayout包裹
- 4个Tab：dashboard（状态卡片+系统详情+uptime）、connectors（列表+详情面板）、collectors（统计卡片+列表）、config（JSON展示+连接信息）
- Connectors Tab：左侧列表 + 右侧详情面板（移动端用overlay滑入）
- Collectors Tab：4张统计卡片 + 收集器卡片列表

**独特特性**：
- **直连localhost:8091**（somaBase硬编码），不经过apiBase
- 4个Tab（最多）
- 移动端适配最好：connectors用overlay滑入面板（`useIsMobile()` + fixed overlay）
- `STATUS_COLORS` 颜色映射 + `formatTime` 相对时间
- 连接器启停toggle功能
- 配置JSON raw展示
- cyan主题色
- connector详情有mobile/desktop两套渲染（违反"一套代码"原则）

---

## 功能重叠矩阵

| 功能 | admin | permission | enterprise | soma-admin |
|------|-------|-----------|------------|------------|
| 系统健康检查 | ✅ | ❌ | ✅ | ✅ |
| 用户管理 | ❌ | ❌ | ✅ | ❌ |
| 角色CRUD | ❌ | ✅ | ✅ | ❌ |
| 权限策略 | ❌ | ✅ | ✅ | ❌ |
| 审计日志 | ❌ | ❌ | ✅ | ❌ |
| 组件统计 | ✅(28个) | ❌ | ❌ | ✅(4个) |
| 连接器管理 | ❌ | ❌ | ❌ | ✅ |
| 收集器管理 | ❌ | ❌ | ✅(audit) | ✅ |
| 系统操作 | ✅(6个) | ❌ | ❌ | ❌ |
| 配置展示 | ✅(导出) | ❌ | ❌ | ✅(raw) |

## 合并可行性判断

1. **permission + enterprise** → 高度可合并。enterprise是permission的超集（多users列表+audit+独立认证）。合并后enterprise的3Tab结构可以覆盖permission所有功能。
2. **admin** → 独立性强，功能完全不同（系统运维面板），不宜合并。
3. **soma-admin** → 独立性强（连接器管理），但connectors的mobile/desktop双套渲染需要清理。

## 边框统一现状

| 页面 | 边框用法 |
|------|---------|
| admin | `border-border`（统一） |
| permission | `border`（无颜色指定，靠Tailwind默认） |
| enterprise | `border-border`（统一） |
| soma-admin | `border-border`（统一） |

permission页面的 `border` 需要改为 `border-border` 以统一为 `#27272a`。
