# 四页面分析：admin / permission / enterprise / soma-admin

> 分析日期：2026-08-30
> 目的：为后续合并优化提供依据，不做代码修改

---

## 1. admin-client.tsx (775行)

### 核心功能
OpenSoul 系统级管理员面板——监控所有"器官"(organ)的健康状态，提供系统维护操作。

### 数据源
- `GET /api/admin/overview` → SystemOverview（30秒轮询）
- 7个操作端点：`/api/admin/caches/clear`, `/api/admin/cleanup`, `/api/admin/backup`, `/api/admin/export/config`, `/api/admin/report`, `/api/diagnostics/check-all`

### 独特特性
- **无Tab**，单一视图：4个统计卡片 → Quick Actions(7个ActionCard) → Organ状态网格 → Component Statistics(StatsCard)
- 自带 `ActionCard` 和 `StatsCard` 子组件（内联定义）
- 展示13个organ的统计（vein/gland/immune/gene/hippo/vital/mind/vision/pipeline/trajectory/reflex/mirror/echo/link）
- 30秒自动刷新
- 文件下载功能（导出配置/报告为JSON）

### 布局
- 4列统计卡片 + 3列操作卡片 + 8列organ网格 + 3列统计卡片
- 使用 `border-border` 边框

---

## 2. permission-client.tsx (331行)

### 核心功能
RBAC权限策略管理——创建/搜索/删除策略(Policy)，查询/分配/删除用户角色(Role)。

### 数据源
- `GET /api/permission/policies` → Policy[]
- `POST /api/permission/policy` (创建)
- `DELETE /api/permission/policy` (删除)
- `GET /api/permission/roles/{username}` → RoleInfo
- `POST /api/permission/role` (分配)
- `DELETE /api/permission/role` (删除)

### 独特特性
- **2个Tab**：访问策略(Policies) / 角色管理(Roles)
- 策略表格使用 `<table>` 列表展示（角色/资源/操作/效果/删除）
- 策略搜索过滤
- 效果标签：allow=绿色、deny=红色
- 删除前二次确认（confirm/cancel按钮）
- 使用 `getToken()` 做认证

### 布局
- max-w-6xl 居中
- `border-border` 边框，`bg-card` 卡片背景
- 表格使用 `border rounded-lg overflow-x-auto`

---

## 3. enterprise-client.tsx (568行)

### 核心功能
企业级用户/角色/权限/审计管理——完整的IAM（身份与访问管理）系统。

### 数据源
- 独立认证：`POST /api/enterprise/auth/login` + `/register` → enterprise-token
- `GET /api/enterprise/health` → 健康状态
- `GET /api/enterprise/users/list` → User[]
- `POST /api/enterprise/users/{id}/roles` (分配角色)
- `POST /api/enterprise/roles` (创建角色)
- `POST /api/enterprise/permissions` (分配权限)
- `GET /api/enterprise/audit?limit=&action=` → AuditEntry[]

### 独特特性
- **3个Tab**：用户与角色(Users) / 角色管理(Roles) / 审计日志(Audit)
- **独立认证系统**：有 enterprise-token（存在localStorage），自动注册+登录
- `entFetch` 封装企业API请求
- 用户列表使用头像圆圈+角色标签
- 审计日志支持limit和action过滤
- 角色创建支持逗号分隔权限
- 权限分配：user_id + resource + action

### 布局
- Header带健康状态指示器
- Tab使用 `border-b-2 border-blue-500` 激活态
- `bg-muted/50` 面板背景
- 用户列表用 `divide-y` 分隔

---

## 4. soma-admin-client.tsx (613行)

### 核心功能
Soma服务管理面板——管理OpenSoma(8091)的连接器(Connector)和收集器(Collector)。

### 数据源（直连 localhost:8091）
- `GET /api/status` → SystemStatus
- `GET /api/connectors` → Connector[]
- `GET /api/collectors` → Collector[]
- `POST /api/connectors/{name}/toggle` (启用/禁用)

### 独特特性
- **4个Tab**：仪表盘(Dashboard) / 连接器(Connectors) / 收集器(Collectors) / 配置(Config)
- 直连soma服务 `http://localhost:8091`（不走apiBase）
- 连接器详情：移动端用overlay面板，桌面端用内联右侧展开
- 收集器列表：带统计卡片（总数/运行中/已停止/错误）
- 配置Tab：JSON raw display + 连接信息
- `STATUS_COLORS` 常量映射状态到颜色
- `formatTime` 相对时间函数
- 使用 `useIsMobile()` 做响应式布局
- `cn()` 工具函数做className合并

### 布局
- `border-border` 边框，`bg-card` 卡片背景
- Tab使用 `bg-cyan-500/10 text-cyan-600` 激活态（cyan主题色）
- 连接器列表+详情分栏布局（80宽度列表）

---

## 重叠矩阵

| 功能维度 | admin | permission | enterprise | soma-admin |
|---------|-------|-----------|-----------|-----------|
| Tab结构 | ❌ 无 | ✅ 2个 | ✅ 3个 | ✅ 4个 |
| 健康检查 | ✅ organ级 | ❌ | ✅ enterprise级 | ✅ system级 |
| 用户管理 | ❌ | ❌ | ✅ 用户列表+角色 | ❌ |
| 角色管理 | ❌ | ✅ 查询+分配+删除 | ✅ 创建+列表 | ❌ |
| 权限策略CRUD | ❌ | ✅ 完整CRUD | ✅ 分配 | ❌ |
| 审计日志 | ❌ | ❌ | ✅ | ❌ |
| 连接器管理 | ❌ | ❌ | ❌ | ✅ |
| 统计卡片 | ✅ 4个 | ❌ | ❌ | ✅ 4个 |
| 认证方式 | 无显式token | getToken()主token | 独立enterprise-token | 无认证 |
| 主题色 | 默认 | 默认 | 蓝色(Blue) | 青色(Cyan) |
| 边框色 | `border-border` | `border-border` | `border-border` | `border-border` |

## 重叠功能详情

### 1. 角色管理（permission vs enterprise）
- **permission**：基于用户名查询角色、分配/删除角色，通过主应用token认证
- **enterprise**：创建角色(带权限列表)、按用户ID分配角色，独立认证系统
- **重叠度**：~60%，两个页面都能分配角色但接口不同

### 2. 权限管理（permission vs enterprise）
- **permission**：策略CRUD（role+resource+action+effect），表格展示
- **enterprise**：按用户+资源+动作分配权限
- **重叠度**：~40%，permission更完整（有搜索/过滤/删除），enterprise更简单

### 3. 健康检查（admin vs soma-admin）
- **admin**：检查所有25+ organ状态
- **soma-admin**：检查soma服务自身状态
- **重叠度**：~10%，范围完全不同

## 合并建议

### 高优先级：permission + enterprise 合并
- 两页面功能高度重叠（用户/角色/权限管理）
- enterprise 是 permission 的超集（多审计日志+独立认证）
- 建议：enterprise 作为主页面，permission 作为子视图或tab

### 低优先级：admin + soma-admin
- admin = OpenSoul系统管理，soma-admin = OpenSoma连接器管理
- 职责不同，但布局结构相似（统计卡片+列表+详情）
- 可统一视觉风格但不合并页面

### 统一边框
- 四个页面已统一使用 `border-border`（#27272a）
- admin 的 ActionCard/StatsCard 也使用 `border-border`
- 无需修改边框色
