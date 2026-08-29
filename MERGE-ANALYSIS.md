# 4页面合并分析：admin / permission / enterprise / soma-admin

## 1. admin-client.tsx (775行)

### 核心功能
- **系统总览仪表盘**：展示所有OpenSoul组件的健康状态和统计数据
- **快捷操作面板**：清缓存、清理过期数据、运行备份、导出配置、下载报告、健康检查

### 数据源
- `GET /api/admin/overview` → SystemOverview（health + stats）
- `POST /api/admin/caches/clear` → 清缓存
- `POST /api/admin/cleanup` → 清理过期数据
- `POST /api/admin/backup` → 备份
- `GET /api/admin/export/config` → 导出配置JSON
- `GET /api/admin/report` → 系统报告JSON
- `GET /api/diagnostics/check-all` → 全量健康检查

### 独特特性
- **30秒自动轮询**：setInterval 30s刷新overview
- **25+组件统计卡片**：vein/gland/immune/gene/hippo/vital/mind/vision/pipeline/trajectory/reflex/mirror/echo/link/marrow/sense/nerve/will/limb/pulse/heredity/cortex/voice/nest/knowledge/agent/graph/entity/search/capture/workflow
- **Organ状态网格**：3→8列自适应，绿/红指示
- **ActionCard + StatsCard** 两个子组件（内联定义）
- **纯只读页面**：无CRUD，只有触发式操作

### 布局模式
- PageLayout包裹，无tab
- 4列统计卡片 → Quick Actions 6格 → Organ网格 → 组件统计网格

---

## 2. permission-client.tsx (331行)

### 核心功能
- **RBAC策略管理**：CRUD访问控制策略（role+resource+action+effect）
- **角色管理**：查询用户角色、分配/删除角色

### 数据源
- `GET /api/permission/policies` → Policy[]
- `POST /api/permission/policy` → 创建策略
- `DELETE /api/permission/policy` → 删除策略
- `GET /api/permission/roles/{username}` → RoleInfo
- `POST /api/permission/role` → 分配角色
- `DELETE /api/permission/role` → 删除角色

### 独特特性
- **2个Tab**：policies / roles
- **策略表格**（唯一的表格视图）：role/resource/action/effect四列
- **搜索过滤**：前端filter
- **删除确认**：inline确认按钮
- **effect颜色**：allow绿/deny红
- **用token认证**：getToken() + Bearer header
- **Actions下拉**：read/write/delete/admin/*
- **Effects下拉**：allow/deny

### 布局模式
- PageLayout包裹
- header + tabs → 策略tab（搜索+新建+表格）/ 角色tab（查询+分配）

---

## 3. enterprise-client.tsx (568行)

### 核心功能
- **企业级用户管理**：用户列表、角色分配、权限授予
- **审计日志**：操作审计记录查看

### 数据源
- `GET /api/enterprise/health` → 系统健康
- `POST /api/enterprise/auth/login` → 企业登录（独立token）
- `POST /api/enterprise/auth/register` → 注册
- `GET /api/enterprise/users/list` → User[]
- `POST /api/enterprise/users/{id}/roles` → 分配角色
- `GET /api/enterprise/roles` → Role[]（代码中未实际调用fetch）
- `POST /api/enterprise/roles` → 创建角色
- `POST /api/enterprise/permissions` → 授予权限
- `GET /api/enterprise/audit` → AuditEntry[]

### 独特特性
- **3个Tab**：users / roles / audit
- **独立认证系统**：enterprise-token（localStorage），自动登录admin/admin
- **企业级用户列表**：带头像首字母、邮箱、角色标签
- **审计日志**：action/resource/status/ip/timestamp/details
- **权限直接授予**：user_id + resource + action（绕过策略表）
- **健康状态指示**：header右侧绿/黄/红灯

### 布局模式
- PageLayout包裹
- header（标题+健康状态+刷新）→ tabs → users tab（分配角色+分配权限+用户列表）/ roles tab（创建+列表）/ audit tab（过滤+列表）

---

## 4. soma-admin-client.tsx (613行)

### 核心功能
- **OpenSoma服务管理**：系统状态、连接器管理、采集器管理、配置查看

### 数据源（直连 localhost:8091）
- `GET http://localhost:8091/api/status` → SystemStatus
- `GET http://localhost:8091/api/connectors` → Connector[]
- `POST http://localhost:8091/api/connectors/{name}/toggle` → 开关连接器
- `GET http://localhost:8091/api/collectors` → Collector[]

### 独特特性
- **4个Tab**：dashboard / connectors / collectors / config
- **直连soma服务**：硬编码 `http://localhost:8091`（不走apiBase）
- **连接器详情面板**：列表+详情分栏（桌面inline/移动端slide-over）
- **移动端适配**：useIsMobile() + 移动端overlay面板
- **连接器开关**：toggle enable/disable
- **采集器统计卡片**：total/running/stopped/error四格
- **配置JSON预览**：pre标签展示
- **时间格式化函数**：formatTime（刚刚/N分钟前/N小时前）

### 布局模式
- PageLayout包裹
- header（标题+badge+刷新）→ tabs → dashboard（状态卡片+详情+uptime）/ connectors（列表+详情分栏）/ collectors（统计+列表）/ config（JSON预览+连接信息）

---

## 重叠矩阵

| 功能维度 | admin | permission | enterprise | soma-admin |
|---------|-------|-----------|-----------|-----------|
| 认证方式 | 无（直接fetch） | Bearer token | 独立enterprise-token | 无 |
| 数据源 | opensoul:8090 | opensoul:8090 | opensoul:8090 | soma:8091 |
| Tab结构 | 无 | 2 tabs | 3 tabs | 4 tabs |
| 用户管理 | ❌ | ❌ | ✅ | ❌ |
| 角色管理 | ❌ | ✅ | ✅ | ❌ |
| 权限策略 | ❌ | ✅ | ✅（简化版） | ❌ |
| 审计日志 | ❌ | ❌ | ✅ | ❌ |
| 系统监控 | ✅（25+组件） | ❌ | ❌ | ✅（soma服务） |
| 操作面板 | ✅（7个操作） | ❌ | ❌ | ❌ |
| 连接器管理 | ❌ | ❌ | ❌ | ✅ |
| 采集器管理 | ❌ | ❌ | ❌ | ✅ |
| 健康检查 | ✅ | ❌ | ✅ | ✅ |
| 统计卡片 | ✅（StatsCard） | ❌ | ❌ | ✅（内联） |
| 表格视图 | ❌ | ✅ | ❌ | ❌ |
| 列表视图 | ✅（网格） | ❌ | ✅（divide-y） | ✅（卡片列表） |

## 关键发现

1. **permission和enterprise高度重叠**：都管理角色和权限，但enterprise更完整（含审计），permission更轻量
2. **admin和soma-admin都做监控**：admin监控opensoul全组件，soma-admin只监控soma服务
3. **4个页面全部用PageLayout包裹**，统一布局框架
4. **认证方式不统一**：3种不同的认证策略
5. **没有共享组件**：StatsCard只在admin里定义，其他页面各自实现统计卡片
6. **border颜色**：基本统一用 `border-border`，少量用 `border-border/50`
