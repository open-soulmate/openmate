# 4页面分析：admin / permission / enterprise / soma-admin

> 纯分析，未修改任何代码。2026-08-30（v2 - 完整代码级分析）

---

## 共同模式（4页面共享）

| 模式 | 说明 |
|------|------|
| `"use client"` | 全部客户端组件 |
| `PageLayout` 包裹 | 全部使用 `<PageLayout title="...">` |
| `useTranslation()` | 全部 i18n 支持 |
| `getApiBaseUrl()` | 除 soma-admin 直连 localhost:8091 外全部使用 |
| `border-border` | admin/enterprise/soma-admin 统一，permission 用 `border` 无颜色指定 |
| 响应式 `lg:` 断点 | 全部用 `text-xs lg:text-sm`、`p-3 lg:p-6` 等双断点模式 |
| Lucide 图标 | 全部 lucide-react |
| 列表/表格展示 | permission 用 `<table>`，其余用 list div |
| 加载态 Loader2 | 全部用 `<Loader2 className="animate-spin" />` |

---

## 1. admin-client.tsx（775行 / 34KB）

**核心功能**：OpenSoul 系统总控面板（运维仪表盘）

**数据源**：
- `GET /api/admin/overview` → SystemOverview（health + stats），30秒轮询
- 6个操作端点：`/api/admin/caches/clear`、`/api/admin/cleanup`、`/api/admin/backup`、`/api/admin/export/config`、`/api/admin/report`、`/api/diagnostics/check-all`

**UI结构**：
- PageLayout → `flex h-full flex-col overflow-hidden`
- Header：Shield图标 + "System Admin" + Refresh按钮
- 4张统计卡片网格（sm:grid-cols-4）：System Health、File Store、LLM Usage、Trajectories
- Quick Actions 标题 + 6个 ActionCard 网格（sm:grid-cols-2 lg:grid-cols-3）
- Organ Status 网格（grid-cols-3 ~ grid-cols-8），28+ 组件状态
- Component Statistics 网格（sm:grid-cols-2 lg:grid-cols-3），28个 StatsCard

**子组件**（文件底部定义）：
- `ActionCard`：icon + title + description + Execute按钮 + 结果状态。用 `color`/`bg` prop 控制颜色
- `StatsCard`：emoji + title + 2列items网格。纯展示

**独特特性**：
- 28个组件统计卡片（vein/gland/immune/gene/hippo/vital/mind/vision/pipeline/trajectory/reflex/mirror/echo/link/marrow/sense/nerve/will/limb/pulse/heredity/cortex/voice/nest/knowledge/agent/graph/entity/search/capture/workflow）
- ActionCard + StatsCard 两个文件内子组件
- 文件下载功能（Blob → URL.createObjectURL → a.click）
- 最大的页面，纯展示+操作，无CRUD
- 无 Tab 结构，全部平铺
- 30秒自动刷新

**边框**：统一 `border-border`

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
- PageLayout → `px-3 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6 max-w-6xl mx-auto`
- 标题行：Shield + "权限管理" + 描述
- 错误横幅（红底）
- Tab栏（`border-b` 底部边框）：policies / roles
- Policies Tab：
  - 搜索输入框 + "新建策略"按钮 + 刷新
  - 创建表单（可折叠，4列 grid: role/resource/action/effect）
  - `<table>` 表格（role/resource/action/effect + 删除确认）
- Roles Tab：
  - 查询用户角色卡片
  - 分配角色卡片（3列 grid）

**独特特性**：
- 使用 `getToken()` 做认证（Bearer token header）
- 表格视图展示策略（唯一用 `<table>` 的页面）
- 搜索过滤（role+resource+action 模糊匹配）
- effect用彩色badge（allow=green, deny=red）
- 删除有二次确认（inline confirm/cancel）
- 最小最精简的页面，无子组件
- ACTIONS 常量：`['read', 'write', 'delete', 'admin', '*']`
- EFFECTS 常量：`['allow', 'deny']`

**边框**：Tab栏用 `border-b`（无颜色指定，靠 Tailwind 默认色）

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
- PageLayout → `flex flex-col h-full overflow-hidden`
- Header：Shield(蓝色) + "Enterprise Management" + 健康状态指示器 + Refresh
- Tab栏（`border-b border-border`）：users / roles / audit
- Error横幅（红底，AlertTriangle + 关闭按钮）
- Users Tab：
  - "Assign Role" 表单卡片（2输入+按钮，flex-col sm:flex-row）
  - "Assign Permission" 表单卡片（2输入+select+按钮）
  - Users列表（头像首字母圆圈 + 用户名 + email + 角色badge）
- Roles Tab：
  - "Create Role" 表单卡片
  - Roles列表（角色名 + 权限badge）
- Audit Tab：
  - 搜索过滤 + 分页选择（20/50/100/200）+ Refresh
  - 审计条目列表（action badge + resource + username + IP + 时间 + details）

**独特特性**：
- **独立认证系统**：enterprise有自己的token（localStorage: `enterprise-token`），`entFetch` 封装
- `ensureEntAuth()`：自动用主token推断用户名 → 尝试登录 → 失败则注册admin再登录
- 3个Tab（比permission多audit）
- 审计日志功能（最完整的操作追踪）
- 用户列表用头像首字母+角色badge样式
- 蓝色主题色（`text-blue-400`、`bg-blue-600`、`border-blue-500`）
- 用数组定义tabs：`const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[]`
- 懒加载：`useEffect` 根据 activeTab 按需 fetch

**与permission重叠**：
- 角色CRUD和分配角色功能几乎相同
- 都管理RBAC，但enterprise更完整（多了users列表+audit+独立认证）

**边框**：统一 `border-border`

---

## 4. soma-admin-client.tsx（613行 / 32KB）

**核心功能**：Soma（opensoma:8091）连接器/收集器管理面板

**数据源**：
- `GET http://localhost:8091/api/status` → SystemStatus
- `GET http://localhost:8091/api/connectors` → Connector[]
- `GET http://localhost:8091/api/collectors` → Collector[]
- `POST http://localhost:8091/api/connectors/{name}/toggle` → 启停连接器

**UI结构**：
- PageLayout → `flex h-full flex-col overflow-hidden`
- Header：Bot图标(青色) + "Soma Admin" + 青色badge + Refresh
- Tab栏（`border-b border-border`，rounded-lg按钮风格）：dashboard / connectors / collectors / config
- Dashboard Tab：
  - 4张状态卡片（systemStatus/version/connectors_count/collectors_count）
  - System Detail 卡片（动态渲染所有字段）
  - Uptime 卡片（虚线边框 cyan-500/30）
- Connectors Tab：
  - 左侧连接器列表（w-80）+ 右侧详情面板
  - 移动端：overlay 滑入（fixed inset-0 z-10 w-72）
  - 详情：type/status/enabled/last_active/error_count + toggle按钮 + config JSON + error
- Collectors Tab：
  - 4张统计卡片（total/running/stopped/error）
  - 收集器卡片列表（状态图标+badge+type+events+last_event+error）
- Config Tab：
  - System Config JSON（pre格式化）
  - Connection Info（somaBase + apiBase）

**独特特性**：
- **直连localhost:8091**（`somaBase` 硬编码），不经过 `apiBase`
- 4个Tab（最多）
- 移动端适配最好：connectors用overlay滑入面板（`useIsMobile()` + fixed overlay）
- `STATUS_COLORS` 颜色映射常量 + `formatTime` 相对时间函数
- 连接器启停toggle功能
- 配置JSON raw展示
- cyan主题色（`text-cyan-500`、`bg-cyan-500/10`）
- **connector详情有mobile/desktop两套渲染**（违反"一套代码"原则，约100行重复代码）
- Tab按钮用 `cn()` 工具函数做条件样式
- 用数组定义tabs：`const tabs: { id: TabId; label: string; icon: React.ReactNode }[]`
- 懒加载：`useEffect` 根据 activeTab 按需 fetch

**边框**：统一 `border-border`

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

## 代码结构对比

| 维度 | admin | permission | enterprise | soma-admin |
|------|-------|-----------|------------|------------|
| 行数 | 775 | 331 | 568 | 613 |
| Tab数 | 0（平铺） | 2 | 3 | 4 |
| 子组件 | ActionCard + StatsCard | 无 | 无 | 无 |
| 认证 | apiBase | getToken() Bearer | 独立enterprise-token | 无 |
| 主题色 | 默认 | 默认 | 蓝色 | 青色(cyan) |
| 列表样式 | 网格卡片 | `<table>` 表格 | list div | list div |
| 移动端适配 | 基础响应式 | 基础响应式 | 基础响应式 | overlay滑入 |
| 自动刷新 | 30秒轮询 | 无 | 无 | 无 |
| 边框 | border-border | border（无色） | border-border | border-border |

## 合并可行性判断

1. **permission + enterprise** → 高度可合并。enterprise是permission的超集（多users列表+audit+独立认证）。合并后enterprise的3Tab结构可以覆盖permission所有功能。
2. **admin** → 独立性强，功能完全不同（系统运维面板），不宜合并。但ActionCard/StatsCard可提取为共享组件。
3. **soma-admin** → 独立性强（连接器管理），但connectors的mobile/desktop双套渲染需要清理（~100行重复代码）。

## 统一边框修复计划

| 页面 | 当前 | 目标 |
|------|------|------|
| admin | `border-border` ✅ | 不变 |
| permission | `border`（无色） | → `border-border` |
| enterprise | `border-border` ✅ | 不变 |
| soma-admin | `border-border` ✅ | 不变 |

permission页面的 `border` 需要改为 `border-border` 以统一为 `#27272a`。涉及约5处：
- Tab栏 `border-b` → `border-b border-border`
- 搜索框 `border rounded-md` → `border border-border rounded-md`
- 创建表单 `border rounded-lg` → `border border-border rounded-lg`
- 表格外层 `border rounded-lg` → `border border-border rounded-lg`
- Roles卡片 `border rounded-lg` → `border border-border rounded-lg`
