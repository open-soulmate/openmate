# Admin/Permission/Enterprise/Soma-Admin 四页面合并分析

> 分析时间：2026-08-30  
> 目的：为合并这4个管理页面做准备，识别共性与差异

---

## 1. Admin (`admin/admin-client.tsx`) — 775行

### 核心功能
- **系统全局仪表盘**：展示所有25+组件(organ)的健康状态和统计数据
- **快速操作面板**：清除缓存、清理过期数据、运行备份、导出配置、下载报告、健康检查
- **组件统计详情**：每个组件(vein/gland/immune/gene/hippo/vital/mind/vision/pipeline/trajectory/reflex/mirror/echo/link/marrow/sense/nerve/will/limb/pulse/heredity/cortex/voice/nest/knowledge/agent/graph/entity/search/capture/workflow)的详细指标

### 数据源
- `GET /api/admin/overview` — 主数据源，返回 `SystemOverview`（health + stats）
- `POST /api/admin/caches/clear` — 清除缓存
- `POST /api/admin/cleanup` — 清理过期数据
- `POST /api/admin/backup` — 运行备份
- `GET /api/admin/export/config` — 导出配置
- `GET /api/admin/report` — 系统报告
- `GET /api/diagnostics/check-all` — 全量健康检查

### 独特特性
- 30秒自动轮询刷新
- 独有 `ActionCard` 组件（带loading/result状态的操作卡片）
- 独有 `StatsCard` 组件（emoji标题+2x2指标网格）
- 使用 `getApiBaseUrl()` 但**不使用 `getToken()`** — 无认证头
- **纯只读仪表盘**，无CRUD操作（操作是命令式触发，不是数据管理）

### 布局
- PageLayout + 顶部Header（标题+刷新按钮）
- 4列状态卡片 → Quick Actions 3列网格 → Organ Status 小方格网格 → Component Statistics 卡片网格
- **全部是卡片视图**，无列表/表格

---

## 2. Permission (`permission/permission-client.tsx`) — 331行

### 核心功能
- **访问策略管理**：CRUD RBAC策略（role/resource/action/effect）
- **角色管理**：查询用户角色、分配/删除角色

### 数据源
- `GET /api/permission/policies` — 获取策略列表
- `POST /api/permission/policy` — 创建策略
- `DELETE /api/permission/policy` — 删除策略
- `GET /api/permission/roles/{username}` — 查询用户角色
- `POST /api/permission/role` — 分配角色
- `DELETE /api/permission/role` — 删除角色

### 独特特性
- **双Tab布局**：Policies（策略列表+搜索+创建表单） / Roles（查询+分配）
- 策略列表用**表格**展示（role/resource/action/effect + 删除按钮）
- 使用 `getToken()` + `Authorization: Bearer` 认证
- 删除策略有**二次确认**（inline confirm/cancel）
- 有搜索过滤功能
- effect用颜色badge区分（allow=绿色, deny=红色）

### 布局
- PageLayout + 顶部标题区
- Tab切换 → 搜索栏+新建按钮 → 表格/表单
- **表格列表**（唯一用table的页面）

---

## 3. Enterprise (`enterprise/enterprise-client.tsx`) — 568行

### 核心功能
- **用户管理**：列出用户、分配角色、分配权限
- **角色管理**：创建角色（带权限列表）
- **审计日志**：查看操作审计记录

### 数据源
- `GET /api/enterprise/health` — 健康检查
- `POST /api/enterprise/auth/login` — 企业独立登录
- `POST /api/enterprise/auth/register` — 企业注册
- `GET /api/enterprise/users/list` — 用户列表
- `POST /api/enterprise/users/{id}/roles` — 分配角色
- `POST /api/enterprise/permissions` — 分配权限
- `POST /api/enterprise/roles` — 创建角色
- `GET /api/enterprise/audit` — 审计日志

### 独特特性
- **三Tab布局**：Users & Roles / Role Management / Audit Log
- **独立认证系统**：有自己的 `enterprise-token`（localStorage），与主app token分离
- **自动认证**：mount时自动尝试登录/注册，无需用户手动操作
- 用户列表用**列表视图**（头像+用户名+角色badge）
- 审计日志支持**过滤**（按action）和**分页**（limit选择）
- 健康状态显示在header右上角
- 使用 `getToken()` 解析JWT获取username用于自动登录

### 布局
- PageLayout + Header（标题+健康状态+刷新）
- Tab切换 → 内容区
- **列表视图**（用户列表用div列表，审计用div列表）

---

## 4. Soma-Admin (`soma-admin/soma-admin-client.tsx`) — 613行

### 核心功能
- **Soma系统仪表盘**：状态、版本、uptime
- **连接器管理**：列出connector、查看详情、启用/禁用
- **采集器管理**：列出collector、统计运行状态
- **配置查看**：展示系统配置JSON

### 数据源（直连 `http://localhost:8091`）
- `GET /api/status` — 系统状态
- `GET /api/connectors` — 连接器列表
- `POST /api/connectors/{name}/toggle` — 启用/禁用连接器
- `GET /api/collectors` — 采集器列表

### 独特特性
- **四Tab布局**：Dashboard / Connectors / Collectors / Config
- **直连Soma服务**（`localhost:8091`），不通过apiBase代理
- **无认证** — 直接fetch，无token
- Connector详情有**桌面/移动端双布局**：桌面=右侧inline面板，移动端=全屏overlay滑入
- 使用 `useIsMobile()` hook 做响应式切换
- 连接器列表+详情的**master-detail**模式（唯一使用此模式的页面）
- 有 `formatTime()` 工具函数做相对时间显示
- 状态颜色映射 `STATUS_COLORS` 常量

### 布局
- PageLayout + Header（标题+badge+刷新）
- Tab切换 → 内容区
- **卡片列表**（connector用可点击卡片，collector用卡片列表）
- **Config tab**：纯JSON pre块展示

---

## 对比矩阵

| 维度 | Admin | Permission | Enterprise | Soma-Admin |
|------|-------|------------|------------|------------|
| **行数** | 775 | 331 | 568 | 613 |
| **Tab数** | 0 | 2 | 3 | 4 |
| **数据源** | apiBase | apiBase | apiBase+entToken | localhost:8091 |
| **认证** | 无 | Bearer token | 独立enterprise-token | 无 |
| **视图类型** | 纯卡片 | 表格+表单 | 列表+表单 | 卡片列表+JSON |
| **CRUD** | 无(只读+命令) | CRUD策略+角色 | 创建角色+分配 | toggle连接器 |
| **搜索/过滤** | 无 | 策略搜索 | 审计过滤 | 无 |
| **自动刷新** | 30s轮询 | 无 | 无 | 无 |
| **独特组件** | ActionCard/StatsCard | 表格 | 用户头像列表 | master-detail |
| **移动端适配** | 响应式grid | 响应式 | 响应式 | useIsMobile双布局 |
| **边框颜色** | border-border | border | border-border | border-border |

---

## 重叠分析

### 高度重叠
- **Permission ↔ Enterprise**：都管理用户/角色/权限，数据模型相似（role/permission/user），API路径不同但功能几乎相同
  - Permission: `/api/permission/*`（策略+角色）
  - Enterprise: `/api/enterprise/*`（用户+角色+权限+审计）
  - Enterprise是Permission的**超集**（多了用户列表、审计日志、独立认证）

### 中度重叠
- **Admin ↔ Soma-Admin**：都是仪表盘+组件状态监控
  - Admin监控OpenSoul所有organ（通过apiBase）
  - Soma-Admin监控Soma连接器/采集器（直连8091）
  - 功能互补但UI模式相似（卡片网格+状态指示）

### 无重叠
- Admin的Quick Actions（备份/清理/导出）是独有的运维功能
- Soma-Admin的connector toggle是独有的设备管理功能
- Enterprise的审计日志是独有的

---

## 合并建议（待定）

1. **Permission → Enterprise**：Permission的策略管理可作为Enterprise的一个子Tab
2. **Admin + Soma-Admin → 统一运维中心**：合并为一个"系统运维"页面，Tab分为：概览/OpenSoul组件/Soma连接器/快速操作
3. 或者保持4个独立页面但统一UI风格（边框、卡片、列表风格）

> ⚠️ 本次只做分析，不做任何代码修改
