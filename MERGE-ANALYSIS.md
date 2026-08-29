# 4-Page Analysis: admin / permission / enterprise / soma-admin

## 1. admin-client.tsx (775行, 34KB)

### 核心功能
OpenSoul系统运维管理面板——监控所有25+组件(organ)健康状态，执行运维操作。

### 数据源
- **API**: `GET /api/admin/overview` (30秒轮询)
- **操作API**:
  - `POST /api/admin/caches/clear` — 清缓存
  - `POST /api/admin/cleanup` — 清理过期数据
  - `POST /api/admin/backup` — 手动备份
  - `GET /api/admin/export/config` — 导出配置
  - `GET /api/admin/report` — 下载系统报告
  - `GET /api/diagnostics/check-all` — 全量健康检查

### 布局结构
- **Header**: 标题 + Refresh按钮
- **4张状态卡片**: System Health, File Store, LLM Usage, Trajectories
- **6个Quick Action卡片**: 清缓存/清过期/备份/导出/报告/健康检查
- **Organ网格**: 3-8列网格显示每个组件的ok/error状态
- **25+组件统计卡片**: vein/gland/immune/gene/hippo/vital/mind/vision/pipeline/trajectory/reflex/mirror/echo/link/marrow/sense/nerve/will/limb/pulse/heredity/cortex/voice/nest/knowledge/agent/graph/entity/search/capture/workflow

### 独特特性
- 使用`PageLayout`但内部自己做了Header（重复了）
- 没有Tab切换，单页面展示所有内容
- 使用`ActionCard`和`StatsCard`两个自定义组件
- 操作结果实时反馈（cleared/cleaned数量）
- 组件统计是动态的——后端返回哪些就显示哪些

---

## 2. permission-client.tsx (331行, 17KB)

### 核心功能
RBAC权限策略管理——管理角色的资源访问控制策略。

### 数据源
- **API**:
  - `GET /api/permission/policies` — 策略列表
  - `POST /api/permission/policy` — 创建策略
  - `DELETE /api/permission/policy` — 删除策略
  - `GET /api/permission/roles/{username}` — 查询用户角色
  - `POST /api/permission/role` — 分配角色
  - `DELETE /api/permission/role` — 删除用户角色
- **认证**: 使用主app token (Bearer)

### 布局结构
- **Header**: Shield图标 + 标题 + 副标题
- **2个Tab**: 访问策略(policies) / 角色管理(roles)
- **Policies Tab**:
  - 搜索栏 + 新建策略按钮
  - 创建策略表单(role/resource/action/effect)
  - 策略表格(5列: role, resource, action, effect, 删除)
- **Roles Tab**:
  - 查询用户角色（输入用户名搜索）
  - 角色结果展示（标签式 + 可删除）
  - 分配角色（用户名 + 角色名）

### 独特特性
- **表格视图**——唯一使用`<table>`的页面
- 策略模型: `{role, resource, action, effect}` — 标准RBAC
- 删除策略有二次确认
- 搜索功能（角色/资源/操作模糊匹配）
- 效果标签: allow=绿色, deny=红色

---

## 3. enterprise-client.tsx (568行, 28KB)

### 核心功能
企业级用户/角色/权限/审计管理——独立于主app的认证体系。

### 数据源
- **独立认证**: `POST /api/enterprise/auth/login`, `POST /api/enterprise/auth/register`
  - 使用`localStorage["enterprise-token"]`，独立于主app token
  - 自动注册admin/admin并登录
- **API** (需要enterprise token):
  - `GET /api/enterprise/health` — 健康检查
  - `GET /api/enterprise/users/list` — 用户列表
  - `POST /api/enterprise/users/{id}/roles` — 分配角色
  - `POST /api/enterprise/roles` — 创建角色
  - `POST /api/enterprise/permissions` — 分配权限
  - `GET /api/enterprise/audit` — 审计日志

### 布局结构
- **Header**: Shield图标 + 标题 + 副标题 + 健康状态指示 + Refresh
- **3个Tab**: Users & Roles / Role Management / Audit Log
- **Users Tab**:
  - 分配角色表单(User ID + Role)
  - 分配权限表单(User ID + Resource + Action)
  - 用户列表(头像首字母 + 用户名 + 角色标签)
- **Roles Tab**:
  - 创建角色表单(名称 + 逗号分隔权限)
  - 角色列表(角色名 + 权限标签)
- **Audit Tab**:
  - 搜索/过滤(action筛选) + 条数选择(20/50/100/200)
  - 审计列表(action标签 + resource + username + ip + timestamp + details)

### 独特特性
- **独立认证体系**——有自己的一套token，不依赖主app
- **自动认证**——ensureEntAuth()自动注册/登录
- **审计日志**——唯一有audit功能的页面
- 用户列表用头像首字母圆圈
- 审计条目有status标签(success=绿, failure=红)
- 使用`entFetch`辅助函数（自动带enterprise token）

---

## 4. soma-admin-client.tsx (613行, 32KB)

### 核心功能
Soma服务(OpenSoma, 端口8091)管理——连接器、采集器、系统状态、配置。

### 数据源
- **直连Soma**: `http://localhost:8091` (硬编码，不走gateway)
- **API**:
  - `GET /api/status` — 系统状态
  - `GET /api/connectors` — 连接器列表
  - `POST /api/connectors/{name}/toggle` — 启停连接器
  - `GET /api/collectors` — 采集器列表

### 布局结构
- **Header**: Bot图标 + 标题 + badge + Refresh
- **4个Tab**: Dashboard / Connectors / Collectors / Config
- **Dashboard Tab**:
  - 4张状态卡片: status, version, connectors_count, collectors_count
  - 系统详情(动态KV)
  - Uptime显示
- **Connectors Tab**:
  - 左侧连接器列表(卡片式，点击选中)
  - 右侧详情面板(类型/状态/启用/最后活跃/错误数/配置JSON/最近错误)
  - 启停按钮
  - **移动端**: 列表和详情切换（overlay滑入）
- **Collectors Tab**:
  - 4张统计卡片(总数/运行/停止/错误)
  - 采集器列表(卡片式，状态图标 + 详情)
- **Config Tab**:
  - 系统配置JSON展示
  - 连接信息(soma URL, soul URL)

### 独特特性
- **直连localhost:8091**——唯一的硬编码服务地址
- **列表+详情** master-detail布局（connectors tab）
- 移动端自适应——使用`useIsMobile()`做overlay切换
- 使用`STATUS_COLORS`统一状态颜色映射
- `formatTime()`时间格式化工具函数
- 唯一使用`cn()`合并class的页面
- 唯一有badge标签的header
- 唯一使用`useIsMobile` hook

---

## 交叉对比矩阵

| 特性 | admin | permission | enterprise | soma-admin |
|------|-------|------------|------------|------------|
| 行数/体积 | 775/34KB | 331/17KB | 568/28KB | 613/32KB |
| Tab数 | 0 | 2 | 3 | 4 |
| 认证方式 | 无(主app) | 主app token | **独立token** | 无(直连) |
| 数据展示 | 卡片网格 | **表格** | 列表 | 卡片+详情 |
| CRUD操作 | 执行操作 | 创建/删除策略 | 创建角色/分配权限 | 启停连接器 |
| 搜索功能 | ❌ | ✅ | ✅(audit) | ❌ |
| 轮询 | 30s | ❌ | ❌ | ❌ |
| 移动适配 | 一般 | 一般 | 一般 | **好(overlay)** |
| 审计日志 | ❌ | ❌ | ✅ | ❌ |
| PageLayout | ✅ | ✅ | ✅ | ✅ |
| 自定义子组件 | ActionCard, StatsCard | ❌ | ❌ | ❌ |
| useIsMobile | ❌ | ❌ | ❌ | ✅ |
| cn() | ❌ | ❌ | ❌ | ✅ |

## 功能重叠分析

### permission vs enterprise（高度重叠）
- **相同**: 都管理角色和权限，都有角色CRUD，都有用户角色分配
- **不同**: 
  - permission用表格视图，enterprise用列表视图
  - permission的RBAC模型是`{role, resource, action, effect}`
  - enterprise的模型是`{role, permissions[]}` + 独立认证
  - enterprise有审计日志，permission没有
  - enterprise有独立token体系
- **结论**: enterprise是permission的超集，可合并

### admin vs soma-admin（部分重叠）
- **相同**: 都监控系统状态，都有健康检查
- **不同**:
  - admin监控OpenSoul全部25+组件，soma-admin只管Soma服务
  - admin有运维操作(清缓存/备份)，soma-admin有连接器管理
  - admin用gateway API，soma-admin直连8091
- **结论**: 可合并为统一系统管理页面，按Tab分区

## 合并建议

### 方案: 2个页面 → 1个系统管理页面

**System Admin** (合并admin + soma-admin + permission + enterprise)
- Tab 1: **Overview** — 系统健康 + organ网格 + 统计卡片 (来自admin)
- Tab 2: **Connectors** — 连接器/采集器管理 (来自soma-admin)
- Tab 3: **Users & Roles** — 用户/角色/权限管理 (合并permission+enterprise)
- Tab 4: **Audit** — 审计日志 (来自enterprise)
- Tab 5: **Operations** — 运维操作(清缓存/备份/导出) (来自admin)

**关键改动**:
1. 统一认证方式（去掉enterprise独立token，复用主app token）
2. 统一API路径（soma-admin的直连改走gateway代理）
3. 统一UI风格（列表视图 + 统一边框#27272a）
4. 移动端统一用soma-admin的overlay方案
5. 统一使用`cn()` + `useIsMobile()`
