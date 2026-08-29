# 4-Page Merge Analysis

## 1. admin/admin-client.tsx (775 lines, 34KB)

**核心功能**: OpenSoul系统全局管理面板
**数据源**: `GET /api/admin/overview` (30秒自动刷新)
**API基础**: `getApiBaseUrl()` (opensoul :8090)

**结构**:
- 无Tab切换，单页滚动布局
- **状态卡片** (4个): System Health, File Store, LLM Usage, Trajectories
- **Quick Actions** (7个ActionCard): Clear Caches, Cleanup Expired, Run Backup, Export Config, System Report, Health Check, Refresh Overview
- **Organ Grid**: 25+器官状态网格 (ok/error)
- **Component Statistics**: 25+ StatsCard (每个器官的详细统计)
- **子组件**: `ActionCard` + `StatsCard`

**独特特性**:
- 直接调用opensoul的admin API
- 30秒轮询overview
- 无认证headers (不需要token)
- 展示所有25+器官的统计 (vein/gland/immune/gene/hippo/vital/mind/vision/pipeline/trajectory/reflex/mirror/echo/link/marrow/sense/nerve/will/limb/pulse/heredity/cortex/voice/nest/knowledge/agent/graph/entity/search/capture/workflow)
- ActionCard支持客户端下载JSON (export/report)

---

## 2. permission/permission-client.tsx (331 lines, 17KB)

**核心功能**: RBAC权限策略管理
**数据源**: 
- `GET /api/permission/policies`
- `GET /api/permission/roles/{username}`
- `POST /api/permission/policy` (创建)
- `DELETE /api/permission/policy` (删除)
- `POST /api/permission/role` (分配角色)
- `DELETE /api/permission/role` (删除角色)
**API基础**: `getApiBaseUrl()` + `getToken()` Bearer认证

**结构**:
- **2个Tab**: Policies (访问策略) / Roles (角色管理)
- Policies Tab: 搜索 + 创建表单 + 策略表格(role/resource/action/effect + 删除)
- Roles Tab: 查询用户角色 + 分配角色表单

**独特特性**:
- 使用Bearer token认证
- 策略模型: {role, resource, action, effect} — 简单的allow/deny
- 删除策略需二次确认
- effect用颜色badge区分 (green=allow, red=deny)
- 搜索过滤策略列表
- 最小的页面 (331行)

---

## 3. enterprise/enterprise-client.tsx (568 lines, 28KB)

**核心功能**: 企业级用户/角色/权限/审计管理
**数据源**:
- `GET /api/enterprise/health`
- `POST /api/enterprise/auth/login` + `/register`
- `GET /api/enterprise/users/list`
- `POST /api/enterprise/users/{id}/roles`
- `POST /api/enterprise/roles`
- `POST /api/enterprise/permissions`
- `GET /api/enterprise/audit?limit=N&action=X`
**API基础**: `getApiBaseUrl()` + 独立enterprise-token (localStorage)

**结构**:
- **3个Tab**: Users & Roles / Role Management / Audit Log
- Users Tab: 分配角色 + 分配权限 + 用户列表(头像+角色badge)
- Roles Tab: 创建角色(名称+逗号分隔权限) + 角色列表
- Audit Tab: 搜索过滤 + 条数选择 + 审计记录列表(action/resource/user/ip/timestamp/details)

**独特特性**:
- **独立认证系统**: 有自己的enterprise-token，与主app token分离
- 自动注册admin用户 (如果登录失败)
- 有完整审计日志功能
- 用户列表有头像圆圈(首字母)
- Health状态指示器
- 深色主题风格 (bg-blue-900/30, bg-red-900/30)
- 审计日志支持action过滤和limit选择

---

## 4. soma-admin/soma-admin-client.tsx (613 lines, 32KB)

**核心功能**: Soma (opensoma :8091) 连接器和收集器管理
**数据源**:
- `GET http://localhost:8091/api/status`
- `GET http://localhost:8091/api/connectors`
- `GET http://localhost:8091/api/collectors`
- `POST http://localhost:8091/api/connectors/{name}/toggle`
**API基础**: 硬编码 `http://localhost:8091` (somaBase)

**结构**:
- **4个Tab**: Dashboard / Connectors / Collectors / Config
- Dashboard: 系统状态卡片(4个) + 系统详情 + Uptime
- Connectors: 列表+详情master-detail布局(移动端有overlay)
- Collectors: 统计卡片(4个) + 收集器列表(卡片式)
- Config: JSON展示系统配置 + 连接信息

**独特特性**:
- **硬编码somaBase** = `http://localhost:8091` (不通过apiBase)
- STATUS_COLORS映射 (online/running/active=绿, offline/error=红, degraded=黄)
- formatTime函数 (相对时间: 刚刚/N分钟前/N小时前)
- Connectors支持toggle启用/禁用
- **移动端适配**: useIsMobile() + overlay详情面板
- 4Tab布局，每个tab按需加载数据
- Badge标签 "Soma"

---

## 功能重叠矩阵

| 功能 | admin | permission | enterprise | soma-admin |
|------|-------|------------|------------|------------|
| 健康检查 | ✅ 全局 | ❌ | ✅ enterprise | ✅ soma |
| 用户管理 | ❌ | ❌ | ✅ 用户列表 | ❌ |
| 角色管理 | ❌ | ✅ 查看/分配 | ✅ 创建/查看 | ❌ |
| 权限策略 | ❌ | ✅ CRUD | ✅ 分配 | ❌ |
| 审计日志 | ❌ | ❌ | ✅ | ❌ |
| 系统统计 | ✅ 25+器官 | ❌ | ❌ | ✅ 4卡片 |
| 快捷操作 | ✅ 7个 | ❌ | ❌ | ❌ |
| 连接器管理 | ❌ | ❌ | ❌ | ✅ toggle |
| 收集器管理 | ❌ | ❌ | ❌ | ✅ |
| 配置查看 | ✅ 导出 | ❌ | ❌ | ✅ JSON |
| Tab数量 | 0 | 2 | 3 | 4 |
| 认证方式 | 无 | Bearer token | 独立token | 无 |

## 重叠分析

### 高重叠: permission ↔ enterprise (角色/权限管理)
- **permission**: 简单策略模型 (role+resource+action+effect)
- **enterprise**: 完整企业级 (用户CRUD+角色创建+权限分配+审计)
- **合并建议**: enterprise功能是permission的超集，permission可作为enterprise的精简视图或被合并

### 中重叠: admin ↔ soma-admin (系统监控)
- **admin**: 监控opensoul全部25+器官
- **soma-admin**: 专门管理opensoma连接器/收集器
- **差异**: admin是只读监控+操作，soma-admin是可交互的连接器管理
- **合并建议**: 不建议合并，管辖范围不同

### 低重叠: admin ↔ enterprise (健康检查)
- 都有健康检查，但admin是全局的，enterprise是enterprise模块专属

## 共性模式

1. **布局**: 全部使用 `<PageLayout>` 包裹
2. **响应式**: 全部有 `lg:px-6` / `lg:py-4` 等断点适配
3. **状态管理**: useState + useCallback + useEffect
4. **API调用**: fetch + AbortSignal.timeout
5. **加载状态**: Loader2 animate-spin
6. **空状态**: 居中图标+文字
7. **边框颜色**: 大量使用 `border-border` (admin/soma) vs 混合 (permission/enterprise)
8. **翻译**: 全部 useTranslation (admin/soma用t(), permission/enterprise混合)
