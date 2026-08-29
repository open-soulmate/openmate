# 4-Page Admin Merge Analysis

## 1. admin-client.tsx (775行, 34KB)

**核心功能**: OpenSoul系统总览 + 运维操作面板

**数据源**: 
- `GET /api/admin/overview` — 系统概览（健康状态、25+组件统计）
- `POST /api/admin/caches/clear` — 清缓存
- `POST /api/admin/cleanup` — 清理过期数据
- `POST /api/admin/backup` — 手动备份
- `GET /api/admin/export/config` — 导出配置JSON
- `GET /api/admin/report` — 下载系统报告
- `GET /api/diagnostics/check-all` — 全量健康检查

**UI结构**:
- 无Tab，单页面布局
- 4个状态卡片：System Health / File Store / LLM Usage / Trajectories
- 6个ActionCard快捷操作（卡片式，带Execute按钮+结果反馈）
- Organ状态网格（3-8列自适应，绿色/红色标记）
- 20+个StatsCard组件统计（每个组件4个指标，emoji图标）

**独特特性**:
- `ActionCard` / `StatsCard` 两个私有子组件（文件底部定义）
- 30秒自动轮询 `fetchOverview`
- 所有操作带 `AbortSignal.timeout`
- 纯只读+运维操作，无CRUD

---

## 2. permission-client.tsx (331行, 17KB)

**核心功能**: RBAC访问策略管理

**数据源**:
- `GET /api/permission/policies` — 策略列表
- `POST /api/permission/policy` — 创建策略
- `DELETE /api/permission/policy` — 删除策略
- `GET /api/permission/roles/{username}` — 查询用户角色
- `POST /api/permission/role` — 分配角色
- `DELETE /api/permission/role` — 删除角色

**UI结构**:
- 2个Tab: Policies（访问策略） / Roles（角色管理）
- Policies Tab: 搜索 + 创建表单（4字段：role/resource/action/effect） + 表格列表
- Roles Tab: 用户角色查询 + 角色分配表单

**独特特性**:
- 表格视图（唯一用`<table>`的页面）
- 策略数据模型: `{role, resource, action, effect}`
- 删除需二次确认（inline confirm按钮）
- 使用`getToken()`做Bearer认证
- 效果标签: allow=绿色, deny=红色

---

## 3. enterprise-client.tsx (568行, 28KB)

**核心功能**: 企业级用户/角色/权限/审计管理

**数据源** (独立认证体系):
- `POST /api/enterprise/auth/login` — 企业系统登录
- `POST /api/enterprise/auth/register` — 注册
- `GET /api/enterprise/health` — 健康检查
- `GET /api/enterprise/users/list` — 用户列表
- `POST /api/enterprise/users/{id}/roles` — 分配角色
- `POST /api/enterprise/roles` — 创建角色
- `POST /api/enterprise/permissions` — 分配权限
- `GET /api/enterprise/audit` — 审计日志

**UI结构**:
- 3个Tab: Users & Roles / Role Management / Audit Log
- Users Tab: 分配角色表单 + 分配权限表单 + 用户列表（头像+角色标签）
- Roles Tab: 创建角色表单 + 角色列表
- Audit Tab: 搜索过滤 + 分页选择 + 审计日志列表

**独特特性**:
- **独立认证系统** — 有自己的token (`enterprise-token` in localStorage)
- 自动认证流程: 尝试admin登录 → 失败则注册再登录
- `entFetch` 封装企业API调用
- 审计日志有action过滤 + limit选择(20/50/100/200)
- 最完整的权限管理（用户+角色+权限+审计四合一）

---

## 4. soma-admin-client.tsx (613行, 32KB)

**核心功能**: Soma连接器/收集器管理面板

**数据源** (直连localhost:8091):
- `GET http://localhost:8091/api/status` — 系统状态
- `GET http://localhost:8091/api/connectors` — 连接器列表
- `GET http://localhost:8091/api/collectors` — 收集器列表
- `POST http://localhost:8091/api/connectors/{name}/toggle` — 开关连接器

**UI结构**:
- 4个Tab: Dashboard / Connectors / Collectors / Config
- Dashboard: 状态卡片(4个) + 系统详情 + Uptime
- Connectors: 左侧列表 + 右侧详情面板（移动端overlay滑入）
- Collectors: 统计卡片(4个) + 收集器列表（卡片式）
- Config: JSON配置展示 + 连接信息

**独特特性**:
- **硬编码somaBase** = `http://localhost:8091`
- `STATUS_COLORS` 映射表（online/running/active/offline/error/degraded）
- `formatTime` 相对时间函数
- 移动端用overlay面板+backdrop实现详情（`useIsMobile()`）
- 连接器toggle开关功能
- 唯一使用`cn()`工具函数的页面

---

## 功能重叠矩阵

| 功能 | admin | permission | enterprise | soma-admin |
|------|:-----:|:----------:|:----------:|:----------:|
| 健康检查 | ✅ | ❌ | ✅ | ✅ |
| 用户管理 | ❌ | ✅(查询) | ✅(CRUD) | ❌ |
| 角色管理 | ❌ | ✅ | ✅ | ❌ |
| 权限策略 | ❌ | ✅ | ✅ | ❌ |
| 审计日志 | ❌ | ❌ | ✅ | ❌ |
| 组件统计 | ✅(25+) | ❌ | ❌ | ✅(连接器) |
| 运维操作 | ✅(6个) | ❌ | ❌ | ❌ |
| 连接器管理 | ❌ | ❌ | ❌ | ✅ |
| 数据收集器 | ❌ | ❌ | ❌ | ✅ |
| 表格视图 | ❌ | ✅ | ❌ | ❌ |
| 列表视图 | 卡片 | 表格 | 列表 | 卡片+列表 |
| 独立认证 | ❌ | ❌ | ✅ | ❌ |

## 认证方式对比

| 页面 | 认证方式 |
|------|---------|
| admin | 无显式认证（依赖全局session） |
| permission | `getToken()` → Bearer header |
| enterprise | 独立 `enterprise-token`，自动注册/登录 |
| soma-admin | 无认证（直连localhost:8091） |

## API基础URL对比

| 页面 | API Base |
|------|---------|
| admin | `getApiBaseUrl()` + `/api/admin/*` |
| permission | `getApiBaseUrl()` + `/api/permission/*` |
| enterprise | `getApiBaseUrl()` + `/api/enterprise/*` |
| soma-admin | `http://localhost:8091` (硬编码) |

## UI风格差异

| 页面 | 布局 | 边框 | 主色调 | Tab样式 |
|------|------|------|--------|---------|
| admin | 单页滚动 | border-border | 无固定色 | 无Tab |
| permission | max-w-6xl居中 | border | primary | 下划线式 |
| enterprise | flex满高 | border-border | blue-500 | 圆角顶部 |
| soma-admin | flex满高 | border-border | cyan-500 | 胶囊式 |
