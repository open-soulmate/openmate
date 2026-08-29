# 4-Page Merge Analysis: admin / permission / enterprise / soma-admin

> Generated: 2026-08-30 | 仅分析，不改代码

---

## 1. admin-client.tsx (775行)

### 核心功能
系统运维仪表盘 — 监控 OpenSoul 全部 25+ 组件的健康状态和统计数据。

### 数据源
- `GET /api/admin/overview` — 返回 `SystemOverview`（health + stats），30秒轮询
- `POST /api/admin/caches/clear` — 清缓存
- `POST /api/admin/cleanup` — 清理过期数据
- `POST /api/admin/backup` — 创建备份
- `GET /api/admin/export/config` — 导出配置（触发文件下载）
- `GET /api/admin/report` — 系统报告（触发文件下载）
- `GET /api/diagnostics/check-all` — 全量健康检查

### 独特特性
- **无认证**：直接用 `getApiBaseUrl()`，无 token 头
- **卡片网格布局**：4个状态卡片（Health/Files/LLM/Trajectories） + 7个 ActionCard（Quick Actions）
- **Organ Status 网格**：显示每个 organ 的 ok/error 状态（3-8列自适应）
- **Component Statistics**：20+ StatsCard 展示各组件统计（Vein/Gland/Immune/Gene/Hippo/Vital/Mind/Vision/Pipeline/Trajectory/Reflex/Mirror/Echo/Link/Marrow/Sense/Nerve/Will/Limb/Pulse/Heredity/Cortex/Voice/Nest/Knowledge/Agent/Graph/Entity/Search/Capture/Workflow）
- **子组件**：`ActionCard`（可执行操作+结果展示）、`StatsCard`（emoji+2x2数据网格）
- **纯英文 UI**：无 i18n key（硬编码 "System Admin"/"Refresh"/"Execute" 等）
- **自动刷新**：30秒 interval

### UI 风格
- `border-border` 边框，`bg-card` 背景
- ActionCard：左侧彩色图标 + 右侧描述 + Execute 按钮 + 结果状态
- StatsCard：emoji + 标题 + 2x2 数据网格

---

## 2. permission-client.tsx (331行)

### 核心功能
RBAC 权限策略管理 — 管理访问控制策略（policies）和角色分配（roles）。

### 数据源
- `GET /api/permission/policies` — 获取策略列表
- `POST /api/permission/policy` — 创建策略（role/resource/action/effect）
- `DELETE /api/permission/policy` — 删除策略
- `GET /api/permission/roles/{username}` — 查询用户角色
- `POST /api/permission/role` — 分配角色
- `DELETE /api/permission/role` — 删除角色

### 独特特性
- **有认证**：`getToken()` + `Authorization: Bearer` 头
- **双 Tab**：Policies（策略表） + Roles（角色查询/分配）
- **表格列表**：Policies 用 `<table>` 展示（role/resource/action/effect/删除），唯一用表格的页面
- **搜索过滤**：前端 client-side 搜索（role/resource/action）
- **内联删除确认**：点击删除后出现确认/取消按钮
- **i18n 完整**：所有文案都用 `t()` 包裹
- **效果标签**：allow=绿色、deny=红色 badge
- **无自动刷新**：手动点击"刷新"

### UI 风格
- `max-w-6xl mx-auto` 居中
- `bg-card` 表单区域
- 表格 `border rounded-lg overflow-x-auto`
- `bg-muted/50` thead 背景

---

## 3. enterprise-client.tsx (568行)

### 核心功能
企业级用户/角色/权限/审计管理 — 独立认证体系的完整 RBAC + 审计日志。

### 数据源
- `POST /api/enterprise/auth/login` — 企业认证登录
- `POST /api/enterprise/auth/register` — 企业用户注册
- `GET /api/enterprise/health` — 健康检查
- `GET /api/enterprise/users/list` — 用户列表
- `POST /api/enterprise/users/{id}/roles` — 分配角色
- `POST /api/enterprise/roles` — 创建角色
- `POST /api/enterprise/permissions` — 分配权限
- `GET /api/enterprise/audit` — 审计日志（支持 limit + action 过滤）

### 独特特性
- **独立认证体系**：有自己的 `enterprise-token`（localStorage），与主应用 token 分离
- **自动认证**：`ensureEntAuth()` — 挂载时自动尝试登录/注册（admin/admin），无需用户手动登录
- **三 Tab**：Users & Roles + Role Management + Audit Log
- **审计日志**：带 action 过滤、分页限制（20/50/100/200）、状态颜色标签
- **用户列表**：头像首字母圆圈 + 用户名 + email + 角色 badge
- **角色管理**：创建角色（名称+逗号分隔权限）+ 角色列表展示权限标签
- **权限分配**：user_id + resource + action(read/write/delete/admin)
- **错误横幅**：顶部红色 AlertTriangle 错误提示，可关闭
- **i18n 完整**：所有文案都用 `t()` 包裹
- **无自动刷新**：手动刷新

### UI 风格
- Header：Shield 图标 + 标题副标题 + 健康状态指示灯
- Tab：`rounded-t-lg` + `border-b-2 border-blue-500` 选中态
- 用户列表：`divide-y divide-border/50` 分割线
- 审计条目：action badge（绿/红/灰） + resource + username + ip + timestamp
- `bg-muted/50 border border-border rounded-xl` 卡片容器
- 蓝色主色调（blue-600 按钮、blue-400 图标）

---

## 4. soma-admin-client.tsx (613行)

### 核心功能
Soma 服务管理面板 — 监控 Soma（8091）的 connectors/collectors 状态和配置。

### 数据源
- `GET http://localhost:8091/api/status` — 系统状态
- `GET http://localhost:8091/api/connectors` — 连接器列表
- `POST http://localhost:8091/api/connectors/{name}/toggle` — 启用/禁用连接器
- `GET http://localhost:8091/api/collectors` — 采集器列表

### 独特特性
- **直连 Soma**：硬编码 `somaBase = "http://localhost:8091"`，不经过 OpenSoul API 代理
- **无认证**：无 token
- **四 Tab**：Dashboard + Connectors + Collectors + Config
- **Connector 详情面板**：点击列表项展示详情（桌面端右侧 inline，移动端 overlay slide-in）
- **移动端适配**：`useIsMobile()` 条件渲染（列表/详情切换、overlay 背景遮罩）
- **Connector Toggle**：启用/禁用连接器开关
- **Collector 统计卡片**：total/running/stopped/error 四个计数
- **Config Tab**：JSON `<pre>` 展示系统配置 + 连接信息
- **STATUS_COLORS 映射**：online/running/active=绿、offline/error=红、degraded=黄
- **formatTime()**：相对时间（刚刚/X分钟前/X小时前/日期）
- **i18n 完整**：所有文案都用 `t()` 包裹（`somaAdmin.*` namespace）
- **按需加载**：tab 切换时才请求对应数据

### UI 风格
- `cyan-500` 主色调（图标、badge、选中态）
- `rounded-xl border border-border bg-card` 卡片
- `rounded-full bg-cyan-500/10 text-cyan-500` badge
- Tab：`rounded-lg` pill 风格（非 underline）
- Connector 详情：移动端 `fixed inset-0` overlay + 右侧 slide-in 面板

---

## 重叠功能矩阵

| 功能维度 | admin | permission | enterprise | soma-admin |
|---------|-------|------------|------------|------------|
| **认证** | ❌ 无 | ✅ Bearer token | ✅ 独立 enterprise-token | ❌ 无 |
| **Tab 结构** | ❌ 无 tab | ✅ 2 tab | ✅ 3 tab | ✅ 4 tab |
| **数据列表** | organ 网格 + stats 卡片 | 策略表格 | 用户列表 + 审计列表 | connector 卡片列表 + collector 列表 |
| **CRUD 操作** | 只执行（清缓存/备份等） | 创建/删除策略 + 分配角色 | 创建角色 + 分配权限/角色 | Toggle connector |
| **搜索过滤** | ❌ | ✅ client-side | ✅ audit action filter | ❌ |
| **自动刷新** | ✅ 30s | ❌ | ❌ | ❌ |
| **移动端适配** | ✅ lg: 响应式 | ✅ lg: 响应式 | ✅ lg: 响应式 | ✅ useIsMobile() 条件渲染 |
| **详情面板** | ❌ | ❌ | ❌ | ✅ connector detail (slide-in) |
| **主色调** | 默认 | 默认 | blue-600 | cyan-500 |
| **i18n** | ❌ 硬编码英文 | ✅ | ✅ | ✅ |
| **API 前缀** | /api/admin/ | /api/permission/ | /api/enterprise/ | localhost:8091/api/ |

## 可合并项

1. **认证模式**：permission 和 enterprise 都用 Bearer token，但 enterprise 有独立 token 体系
2. **Tab 组件**：三个页面都有 tab，但样式各异（underline vs pill vs rounded-t）
3. **列表渲染**：permission 用 table，其他用 div 列表
4. **详情面板**：仅 soma-admin 有 slide-in 详情面板（可复用于其他页面）
5. **统计卡片**：admin 和 soma-admin 都有统计卡片，结构类似

## 不可合并项（需保留独立）

1. **数据源完全不同**：4个页面对接4组不同 API
2. **admin 的 StatsCard/ActionCard** 是独有的大量组件统计展示
3. **enterprise 的独立认证体系** 需要保留
4. **soma-admin 的直连 localhost:8091** 是架构特殊性
