# 四页面合并分析：admin / permission / enterprise / soma-admin

> 生成时间：2026-08-30 | 仅分析，未修改任何代码

---

## 1. 页面概览

| 页面 | 文件 | 行数 | 核心功能 | API前缀 |
|------|------|------|----------|---------|
| **admin** | admin-client.tsx | 775 | 系统运维仪表盘 | `/api/admin/*` + `/api/diagnostics/*` |
| **permission** | permission-client.tsx | 331 | CASL风格RBAC策略管理 | `/api/permission/*` |
| **enterprise** | enterprise-client.tsx | 568 | 企业级用户/角色/审计 | `/api/enterprise/*` |
| **soma-admin** | soma-admin-client.tsx | 613 | OpenSoma连接器/采集器管理 | `http://localhost:8091/api/*` |

**总计：2,287行**

---

## 2. 各页面详细分析

### 2.1 admin (775行)

**核心功能：** OpenSoul全系统运维监控仪表盘

**数据源：**
- `GET /api/admin/overview` — 轮询30秒，获取系统健康+各organ统计
- `POST /api/admin/caches/clear` — 清缓存
- `POST /api/admin/cleanup` — 清理过期数据
- `POST /api/admin/backup` — 手动备份
- `GET /api/admin/export/config` — 导出配置JSON
- `GET /api/admin/report` — 系统报告JSON
- `GET /api/diagnostics/check-all` — 全组件健康检查

**独特特性：**
- **无认证**：直接用`getApiBaseUrl()`，不需要token
- **ActionCard组件**：6个运维操作卡片（清缓存/清理/备份/导出/报告/健康检查）
- **StatsCard组件**：展示25+个organ的统计（vein/gland/immune/gene/hippo/vital/mind/vision/pipeline/trajectory/reflex/mirror/echo/link/marrow/sense/nerve/will/limb/pulse/heredity/cortex/voice/nest/knowledge/agent/graph/entity/search/capture/workflow）
- **Organ状态网格**：3-8列自适应，绿/红指示
- **4个顶部统计卡**：Health/Files/Tokens/Trajectories

**UI结构：** PageLayout > Header > 状态卡片(4) > Quick Actions(6) > Organ Grid > Stats Cards(25+)

---

### 2.2 permission (331行)

**核心功能：** 访问控制策略(CASL)管理

**数据源：**
- `GET /api/permission/policies` — 获取策略列表
- `POST /api/permission/policy` — 创建策略
- `DELETE /api/permission/policy` — 删除策略
- `GET /api/permission/roles/{username}` — 查询用户角色
- `POST /api/permission/role` — 分配角色
- `DELETE /api/permission/role` — 删除角色

**独特特性：**
- **需要认证**：用`getToken()`设置Bearer token
- **2个Tab**：policies(策略表格) / roles(角色管理)
- **策略表格**：role/resource/action/effect四列，支持搜索、新建、删除(确认模式)
- **角色管理**：查询用户角色 + 分配角色 + 删除角色
- **最简页面**：没有顶部统计卡片，纯CRUD

**UI结构：** PageLayout > Title > Tabs > [策略:搜索+表格 | 角色:查询+分配]

---

### 2.3 enterprise (568行)

**核心功能：** 企业级IAM（用户/角色/权限/审计）

**数据源：**
- `GET /api/enterprise/health` — 健康检查
- `POST /api/enterprise/auth/login` — 独立登录（enterprise-token）
- `POST /api/enterprise/auth/register` — 注册
- `GET /api/enterprise/users/list` — 用户列表
- `POST /api/enterprise/roles` — 创建角色
- `POST /api/enterprise/users/{id}/roles` — 分配角色
- `POST /api/enterprise/permissions` — 分配权限
- `GET /api/enterprise/audit?limit=N&action=X` — 审计日志

**独特特性：**
- **双token系统**：有自己的`enterprise-token`（localStorage），与主app token分离
- **自动认证**：`ensureEntAuth()`自动尝试admin/admin登录或注册
- **3个Tab**：users / roles / audit
- **审计日志**：按action过滤、分页(limit)、显示status/ip/timestamp
- **用户列表**：带头像首字母、角色badge
- **权限分配**：user_id + resource + action(read/write/delete/admin)
- **红色错误横幅**：带AlertTriangle图标和关闭按钮

**UI结构：** PageLayout > Header(含health状态) > Tabs > [Users:分配角色+分配权限+列表 | Roles:创建+列表 | Audit:过滤+列表]

---

### 2.4 soma-admin (613行)

**核心功能：** OpenSoma(8091)连接器和采集器管理

**数据源：**
- `GET http://localhost:8091/api/status` — 系统状态
- `GET http://localhost:8091/api/connectors` — 连接器列表
- `GET http://localhost:8091/api/collectors` — 采集器列表
- `POST http://localhost:8091/api/connectors/{name}/toggle` — 开关连接器

**独特特性：**
- **直连localhost:8091**：不走apiBase，硬编码somaBase
- **无认证**
- **4个Tab**：dashboard / connectors / collectors / config
- **连接器详情**：列表+详情master-detail布局，移动端overlay滑入
- **移动端适配**：`useIsMobile()`条件切换布局（列表/详情切换）
- **采集器统计**：4个顶部卡片(total/running/stopped/error)
- **连接器开关**：toggle enable/disable
- **Config tab**：JSON pre展示系统配置+连接信息
- **STATUS_COLORS映射**：统一状态颜色(online/running/active=绿, offline/stopped/error=红, degraded=黄)
- **formatTime辅助函数**：相对时间(刚刚/N分钟前/N小时前)

**UI结构：** PageLayout > Header(含badge) > Tabs > [Dashboard:状态卡+详情+Uptime | Connectors:列表+详情(master-detail) | Collectors:统计+列表 | Config:JSON+连接信息]

---

## 3. 重叠分析

### 3.1 功能重叠矩阵

| 功能 | admin | permission | enterprise | soma-admin |
|------|:-----:|:----------:|:----------:|:----------:|
| 健康状态展示 | ✅ organ网格 | ❌ | ✅ health指示器 | ✅ status卡片 |
| 用户管理 | ❌ | ❌ | ✅ 用户列表+角色 | ❌ |
| 角色管理 | ❌ | ✅ 查询+分配 | ✅ 创建+分配 | ❌ |
| 权限策略 | ❌ | ✅ CRUD表格 | ✅ 分配权限 | ❌ |
| 审计日志 | ❌ | ❌ | ✅ 过滤+列表 | ❌ |
| 连接器管理 | ❌ | ❌ | ❌ | ✅ 列表+详情+toggle |
| 采集器管理 | ❌ | ❌ | ❌ | ✅ 列表+统计 |
| 运维操作 | ✅ 6个Action | ❌ | ❌ | ❌ |
| 统计数据 | ✅ 25+ organ | ❌ | ❌ | ✅ 4个卡片 |
| 配置导出 | ✅ JSON下载 | ❌ | ❌ | ✅ JSON展示 |
| Tab切换 | ❌ | ✅ 2tab | ✅ 3tab | ✅ 4tab |
| 搜索过滤 | ❌ | ✅ 策略搜索 | ✅ 审计过滤 | ❌ |
| 认证方式 | 无 | 主app token | 独立enterprise-token | 无 |
| API基础URL | apiBase | apiBase | apiBase | localhost:8091 |

### 3.2 关键差异

1. **认证方式不统一**：admin/soma-admin无认证，permission用主token，enterprise用独立token
2. **API基础URL不统一**：soma-admin直连8091，其他用apiBase
3. **role管理重复**：permission和enterprise都有角色CRUD，但API路径完全不同
4. **permission是enterprise的子集**：permission的策略+角色功能在enterprise中也有，但enterprise更完整（有审计、用户管理）
5. **admin和soma-admin都监控系统**：admin监控OpenSoul全organ，soma-admin只监控OpenSoma

### 3.3 UI模式重叠

| 模式 | 使用页面 |
|------|----------|
| `PageLayout` wrapper | 全部4个 |
| `border-border` 边框 | 全部4个 |
| Tab切换 | permission/enterprise/soma-admin |
| 状态卡片网格 | admin/soma-admin |
| 列表+详情(master-detail) | soma-admin(连接器) |
| 搜索过滤 | permission/enterprise |
| 加载Spinner | 全部4个 |
| 错误横幅 | enterprise |
| 刷新按钮 | 全部4个 |

---

## 4. 合并建议（待讨论，不执行）

### 方案A：两层合并
- **系统管理页**：admin + soma-admin → 统一系统监控（OpenSoul organs + OpenSoma connectors/collectors）
- **权限管理页**：permission + enterprise → 统一IAM（用户/角色/策略/审计）

### 方案B：三层合并
- **系统管理**：admin + soma-admin（监控+运维）
- **权限中心**：permission + enterprise（IAM）
- **企业设置**：从enterprise拆出的独立配置

### 方案C：保持独立
- 4个页面各自独立，统一UI风格和认证方式即可

---

## 5. 统一边框#27272a的影响范围

4个页面都使用`border-border`（CSS变量），实际渲染色取决于主题。如果要硬编码`#27272a`：
- admin：约15处border相关class
- permission：约8处
- enterprise：约12处
- soma-admin：约20处

**建议**：通过CSS变量统一，不逐个替换。
