# 4-Page Merge Analysis

> 分析时间: 2026-08-30
> 文件: admin-client.tsx (775行), permission-client.tsx (331行), enterprise-client.tsx (568行), soma-admin-client.tsx (613行)

---

## 1. admin-client.tsx — 系统管理员面板

**核心功能**: OpenSoul全部25+组件的监控仪表盘 + 运维操作面板

**数据源**: `GET /api/admin/overview` (30秒轮询)

**结构**:
- 系统健康状态卡片 (4个): 健康率、文件存储、LLM用量、轨迹会话数
- 快速操作按钮 (7个ActionCard): 清除缓存、清理过期、备份、导出配置、系统报告、健康检查、刷新
- Organ状态网格: 动态列出所有organ的ok/error状态
- 组件统计卡片 (25+ StatsCard): Vein/Gland/Immune/Gene/Hippo/Vital/Mind/Vision/Pipeline/Trajectory/Reflex/Mirror/Echo/Link/Marrow/Sense/Nerve/Will/Limb/Pulse/Heredity/Cortex/Voice/Nest/Knowledge/Agent/Graph/Entity/Search/Capture/Workflow

**独特特性**:
- 唯一使用 `ActionCard` + `StatsCard` 子组件的页面
- 唯一做文件下载 (Blob → `<a>` click) 的页面
- 统计数据量最大 (25个组件×4指标)
- 纯只读监控，无CRUD表单

**API端点**:
- `GET /api/admin/overview`
- `POST /api/admin/caches/clear`
- `POST /api/admin/cleanup`
- `POST /api/admin/backup`
- `GET /api/admin/export/config`
- `GET /api/admin/report`
- `GET /api/diagnostics/check-all`

---

## 2. permission-client.tsx — 权限管理

**核心功能**: RBAC策略(Casbin风格)的CRUD + 用户角色查询/分配

**数据源**: `GET /api/permission/policies` (一次性加载)

**结构** (2个Tab):
- **访问策略Tab**: 搜索 + 新建策略表单 + 策略列表(表格)
- **角色管理Tab**: 用户角色查询 + 角色分配表单

**独特特性**:
- 唯一使用 `<table>` 表格展示列表的页面 (其他都用div列表)
- 唯一有删除确认inline交互(点删除→确认/取消按钮)的页面
- 策略数据结构: `{role, resource, action, effect}`
- 使用 `getToken()` 做认证 (Bearer token)

**API端点**:
- `GET /api/permission/policies`
- `POST /api/permission/policy`
- `DELETE /api/permission/policy`
- `GET /api/permission/roles/{username}`
- `POST /api/permission/role`
- `DELETE /api/permission/role`

---

## 3. enterprise-client.tsx — 企业管理

**核心功能**: 独立用户体系的用户/角色/权限/审计日志管理

**数据源**: 有独立认证系统 (`enterprise-token` 存localStorage)

**结构** (3个Tab):
- **用户与角色Tab**: 分配角色表单 + 分配权限表单 + 用户列表
- **角色管理Tab**: 创建角色表单 + 角色列表
- **审计日志Tab**: 筛选 + 审计记录列表

**独特特性**:
- **双token系统**: 主app token + enterprise独立token (localStorage `enterprise-token`)
- **自动认证**: 首次访问自动注册admin用户并登录
- 唯一有审计日志功能的页面
- 唯一有独立health检查 (`/api/enterprise/health`) 的页面
- 用户列表显示头像首字母圆形 + 角色badge
- 审计条目有status颜色标记 (success/failure)

**API端点**:
- `GET /api/enterprise/health`
- `POST /api/enterprise/auth/login`
- `POST /api/enterprise/auth/register`
- `GET /api/enterprise/users/list`
- `POST /api/enterprise/users/{id}/roles`
- `POST /api/enterprise/roles`
- `POST /api/enterprise/permissions`
- `GET /api/enterprise/audit`

---

## 4. soma-admin-client.tsx — Soma连接器管理

**核心功能**: OpenSoma(数据连接层)的连接器/采集器/配置管理

**数据源**: 直连 `http://localhost:8091` (不走apiBase代理)

**结构** (4个Tab):
- **Dashboard Tab**: 系统状态卡片 + 系统详情 + 运行时间
- **Connectors Tab**: 左侧连接器列表 + 右侧详情面板(移动端overlay)
- **Collectors Tab**: 统计卡片 + 采集器列表
- **Config Tab**: JSON配置展示 + 连接信息

**独特特性**:
- **唯一使用 `useIsMobile()` 做响应式布局**的页面 (移动端connector详情用overlay滑入)
- **唯一直连其他服务** (localhost:8091 而非 apiBase)
- **唯一有toggle开关** (启用/禁用连接器)
- **唯一有 `STATUS_COLORS` 映射表**
- **唯一有 `formatTime` 相对时间函数**
- 连接器详情有config JSON展示和error显示

**API端点** (全部localhost:8091):
- `GET /api/status`
- `GET /api/connectors`
- `POST /api/connectors/{name}/toggle`
- `GET /api/collectors`

---

## 交叉对比

| 维度 | admin | permission | enterprise | soma-admin |
|------|-------|------------|------------|------------|
| **行数** | 775 | 331 | 568 | 613 |
| **Tab数** | 0 (单页) | 2 | 3 | 4 |
| **认证方式** | 无 | Bearer token | 双token | 无 |
| **数据刷新** | 30秒轮询 | 手动 | 手动 | 手动 |
| **列表样式** | div网格 | table表格 | div列表 | div卡片+详情面板 |
| **CRUD** | 无(只读+操作) | 策略CRUD+角色 | 用户/角色/权限 | toggle连接器 |
| **移动端适配** | 响应式网格 | 响应式表格 | 响应式 | overlay面板 |
| **子组件** | ActionCard, StatsCard | 无 | 无 | 无 |
| **API基础** | apiBase | apiBase | apiBase | localhost:8091 |

## 功能重叠

| 重叠项 | 涉及页面 | 说明 |
|--------|----------|------|
| 角色管理 | permission, enterprise | 都有角色CRUD，enterprise更完整 |
| 权限分配 | permission, enterprise | permission用策略(resource+action)，enterprise用权限列表 |
| 用户列表 | enterprise | 仅enterprise有 |
| 审计日志 | enterprise | 仅enterprise有 |
| 系统监控 | admin, soma-admin | admin监控OpenSoul，soma-admin监控OpenSoma |
| 连接器管理 | soma-admin | 仅soma-admin有 |
| 采集器管理 | soma-admin | 仅soma-admin有 |
