# 4-Page Merge Analysis: admin / permission / enterprise / soma-admin

> 生成时间: 2026-08-30
> 分析范围: 4个管理类页面的 *-client.tsx 文件

---

## 1. admin-client.tsx (775行, 34KB)

### 核心功能
- **系统仪表盘**: 展示OpenSoul所有organ的健康状态（healthy/total）
- **快速操作**: 6个ActionCard — 清缓存、清理过期、备份、导出配置、系统报告、健康检查
- **组件统计**: 监控20+个organ组件的详细指标（Vein/Gland/Hippo/Vital等）
- **Organ状态网格**: 绿/红点阵展示每个organ在线状态

### 数据源
| API | 方法 | 用途 |
|-----|------|------|
| `/api/admin/overview` | GET | 系统总览（health + stats） |
| `/api/admin/caches/clear` | POST | 清缓存 |
| `/api/admin/cleanup` | POST | 清理过期数据 |
| `/api/admin/backup` | POST | 运行备份 |
| `/api/admin/export/config` | GET | 导出配置 |
| `/api/admin/report` | GET | 系统报告 |
| `/api/diagnostics/check-all` | GET | 全面健康检查 |

### 独特特性
- **轮询**: 每30秒自动刷新overview
- **自定义子组件**: `ActionCard`（带执行按钮+结果状态）、`StatsCard`（emoji标题+双列指标）
- **数据来源**: 主网关 `getApiBaseUrl()`（openmate端口3002代理到opensoul 8090）
- **无认证头**: overview请求无Authorization header
- **卡片式布局**: 全部用卡片，无表格/列表

---

## 2. permission-client.tsx (331行, 17KB)

### 核心功能
- **访问策略管理(CRUD)**: 列表展示 + 搜索 + 创建 + 删除（带确认）
- **角色管理**: 查询用户角色 + 分配角色 + 删除角色
- **2个Tab**: policies（策略表）/ roles（角色查询+分配）

### 数据源
| API | 方法 | 用途 |
|-----|------|------|
| `/api/permission/policies` | GET | 获取所有策略 |
| `/api/permission/policy` | POST | 创建策略 |
| `/api/permission/policy` | DELETE | 删除策略 |
| `/api/permission/roles/{username}` | GET | 查询用户角色 |
| `/api/permission/role` | POST | 分配角色 |
| `/api/permission/role` | DELETE | 删除角色 |

### 独特特性
- **表格布局**: 策略列表用 `<table>` （4列: role/resource/action/effect）
- **带认证**: `Authorization: Bearer {token}` via `apiHeaders()`
- **内联删除确认**: 行内"确认/取消"按钮，非弹窗
- **i18n完整**: 所有文案都有中英文fallback
- **效果标签**: allow=绿/deny=红 的badge

---

## 3. enterprise-client.tsx (568行, 28KB)

### 核心功能
- **用户管理**: 用户列表（头像+角色badge）+ 分配角色 + 分配权限
- **角色管理**: 创建角色（名称+逗号分隔权限）+ 角色列表
- **审计日志**: 可筛选的操作日志（action filter + limit选择）
- **3个Tab**: users / roles / audit

### 数据源
| API | 方法 | 用途 |
|-----|------|------|
| `/api/enterprise/health` | GET | 企业模块健康检查 |
| `/api/enterprise/auth/login` | POST | 企业独立登录 |
| `/api/enterprise/auth/register` | POST | 企业用户注册 |
| `/api/enterprise/users/list` | GET | 用户列表 |
| `/api/enterprise/users/{id}/roles` | POST | 给用户分配角色 |
| `/api/enterprise/roles` | POST | 创建角色 |
| `/api/enterprise/permissions` | POST | 分配权限 |
| `/api/enterprise/audit` | GET | 审计日志 |

### 独特特性
- **独立认证系统**: 有自己的 `enterprise-token`（localStorage），与主app token分离
- **自动登录**: `ensureEntAuth()` — mount时自动尝试admin/admin登录，失败则自动注册+登录
- **entFetch()**: 专用fetch封装，自动注入enterprise-token
- **用户头像**: 首字母圆形头像（蓝底白字）
- **审计日志**: 支持action筛选 + limit（20/50/100/200）+ 状态badge（success/failure）
- **蓝色主题**: 按钮用 `bg-blue-600`，与permission的primary色不同

---

## 4. soma-admin-client.tsx (613行, 32KB)

### 核心功能
- **Soma仪表盘**: 系统状态卡片（status/version/connectors_count/collectors_count）+ 详情 + uptime
- **连接器管理**: 列表+详情面板（桌面端inline/移动端overlay滑出）+ 启用/禁用开关
- **采集器管理**: 统计卡片（总数/运行/停止/错误）+ 采集器列表（状态badge+事件数+错误信息）
- **配置查看**: JSON pre展示系统配置 + 连接信息
- **4个Tab**: dashboard / connectors / collectors / config

### 数据源
| API | 方法 | 用途 |
|-----|------|------|
| `http://localhost:8091/api/status` | GET | Soma系统状态 |
| `http://localhost:8091/api/connectors` | GET | 连接器列表 |
| `http://localhost:8091/api/connectors/{name}/toggle` | POST | 切换连接器 |
| `http://localhost:8091/api/collectors` | GET | 采集器列表 |

### 独特特性
- **直连Soma**: `somaBase = "http://localhost:8091"` 不走主网关代理
- **移动端适配**: `useIsMobile()` + 连接器详情用 `fixed inset-0` overlay滑出面板
- **状态颜色系统**: `STATUS_COLORS` map（online/running/active=绿, offline/error=红, degraded=黄）
- **相对时间**: `formatTime()` 显示"刚刚"/"X分钟前"/"X小时前"
- **Tab延迟加载**: 只在切换到对应tab时才请求数据
- **Cyan主题**: `text-cyan-500`/`bg-cyan-500/10` 贯穿全页
- **toggleConnector**: 启用/禁用连接器，本地乐观更新

---

## 重叠矩阵

| 功能维度 | admin | permission | enterprise | soma-admin |
|----------|-------|------------|------------|------------|
| **健康检查** | ✅ organ级 | ❌ | ✅ enterprise级 | ✅ soma级 |
| **用户管理** | ❌ | ❌ | ✅ 用户列表+角色 | ❌ |
| **角色/权限** | ❌ | ✅ RBAC策略 | ✅ 角色CRUD | ❌ |
| **审计日志** | ❌ | ❌ | ✅ | ❌ |
| **组件监控** | ✅ 20+organ | ❌ | ❌ | ✅ connector+collector |
| **系统操作** | ✅ 6个操作 | ❌ | ❌ | ❌ |
| **配置查看** | ✅ 导出JSON | ❌ | ❌ | ✅ JSON展示 |
| **表格布局** | ❌ | ✅ | ❌ | ❌ |
| **卡片布局** | ✅ | 部分 | 部分 | ✅ |
| **独立认证** | ❌ | 用主token | ✅ enterprise-token | ❌ |
| **Tab数量** | 0 | 2 | 3 | 4 |
| **自动刷新** | ✅ 30s轮询 | ❌ | ❌ | ❌ |

## 可合并点

1. **permission + enterprise 的角色/权限功能高度重叠**: permission有RBAC策略表，enterprise有角色CRUD+权限分配。可统一为一个页面的两个tab
2. **admin + soma-admin 的监控功能**: admin监控opensoul organ，soma-admin监控soma connectors/collectors。可合并为统一监控页
3. **健康检查**: 3个页面都有健康检查，但粒度不同（organ/enterprise/soma），合并后可统一展示
4. **配置导出/查看**: admin有export config，soma-admin有config tab，可统一

## 不可合并（独特功能）

- **admin**: 快速操作（清缓存/备份/清理）+ 20+ organ统计卡片 — 唯一的运维操作页
- **permission**: RBAC策略表（role×resource×action×effect）— 唯一的细粒度策略管理
- **enterprise**: 独立认证系统 + 审计日志 — 唯一有操作审计的页面
- **soma-admin**: 连接器toggle + 采集器监控 + 移动端overlay — 唯一管理外部服务连接的页面

## UI风格差异

| 特征 | admin | permission | enterprise | soma-admin |
|------|-------|------------|------------|------------|
| 主色 | primary | primary | blue-600 | cyan-500 |
| 圆角 | rounded-lg | rounded-md/rounded-lg | rounded-xl | rounded-xl |
| 边框 | border-border ✅ | border ✅ | border-border ✅ | border-border ✅ |
| 布局 | PageLayout+卡片 | PageLayout+表格 | PageLayout+列表 | PageLayout+卡片 |
| 移动适配 | lg断点 | lg断点 | lg断点 | useIsMobile() |
| 认证 | 无 | Bearer token | enterprise-token | 无 |
