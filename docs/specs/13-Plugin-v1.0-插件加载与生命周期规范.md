# Plugin v1.0 插件加载与生命周期规范

**归属项目：** OpenSoulMate / OpenMate  
**序号：** 13. Plugin v1.0 插件加载与生命周期规范  
**版本：** v1.1 Final（定稿冻结）  
**编写日期：** 2026-09-03  
**更新日期：** 2026-09-03（新增frontend.nav自动导航注册）

---

## 0 规范总览

### 0.1 定位

本规范定义 OpenMate 插件系统的完整运行标准，包含目录结构、元数据配置、热加载生命周期、工具注册、权限沙箱、跨插件调用、前端嵌入，核心新增：Agent 全自动自编程创建 / 修改 / 重载 / 删除插件能力，与 Skill 系统完全对等对齐，实现 OpenMate 双向无限扩展。

Plugin 为代码级能力单元，Skill 为提示词编排单元，二者构成系统双扩展底座：

- **Plugin：** 提供底层代码工具、文件解析、接口、UI 能力，支持 Agent 自主编程生成
- **Skill：** 提供业务 SOP、任务编排、应答规范，调用 Plugin 工具完成复杂业务

### 0.2 依赖规范

本规范依赖系统基座规范：

- Storage v1.0 分层存储规范
- Auth&RBAC v1.0 权限规范
- Log&Trace v1.0 链路日志规范
- EventBus v1.0 事件总线规范
- Artifact v1.0 工件管理规范

### 0.3 核心设计八大原则

1. **双体系对等扩展：** Plugin / Skill 均可由用户、AI 自主创建编辑
2. **无停机热更新：** 增删改插件无需重启主服务
3. **最小权限准入：** 所有资源权限必须显式声明，默认拦截
4. **沙箱安全隔离：** 插件异常隔离，不击穿主服务
5. **全链路标准化：** 目录、配置、生命周期、调用逻辑统一规范
6. **全操作可审计：** 所有插件调用、修改、创建行为留痕追溯
7. **网关统一调用：** 插件间禁止直接代码引用，统一走工具网关
8. **AI 自编程闭环：** Agent 拥有完整插件生命周期管理权限，自主迭代系统能力

---

## 1 插件目录结构规范

所有插件统一存放在项目根目录 `plugins/`，单插件独立文件夹，全局唯一 ID。

### 1.1 标准插件目录结构

```
plugins/
├── {plugin-id}/
│   ├── plugin.json          # 核心元数据配置（必填）
│   ├── __init__.py           # 插件入口注册文件（必填）
│   ├── router.py             # HTTP 接口路由（可选）
│   ├── tools/                # 业务工具拆分目录（可选）
│   ├── frontend/             # 前端嵌入页面（可选）
│   │   └── page.tsx
│   ├── assets/               # 静态资源（可选）
│   └── README.md             # 插件说明文档（必填）
```

### 1.2 模板仓库目录

系统内置插件模板库，供 Agent 快速生成工程

路径：`plugin-templates/`

内置模板：bidding、crud、file-processor

---

## 2 plugin.json 元数据标准 Schema

### 2.1 完整标准模板

```json
{
  "id": "string",
  "name": "string",
  "version": "semver",
  "description": "string",
  "author": "string",
  "entry": "__init__.py",
  "dependencies": [],
  "tools": [],
  "frontend": {
    "enable": false,
    "entry": "",
    "nav": {
      "label": "string",
      "icon": "string",
      "position": "string"
    }
  },
  "permissions": [],
  "hot_reload": true,
  "protected": false
}
```

### 2.2 字段释义

- **id：** 小写短横线命名，全局唯一，不可重复
- **name：** 前端展示名称
- **version：** 语义化版本号
- **description：** 插件功能描述，用于 AI 理解与自动生成
- **dependencies：** 依赖插件列表，系统自动排序加载，拦截循环依赖
- **tools：** 对外暴露可被 Agent/Skill 调用的工具列表
- **frontend：** 前端嵌入页面开关、路径和导航配置
- **permissions：** 权限白名单，未声明权限全部拦截
- **hot_reload：** 是否开启文件热重载
- **protected：** 系统核心保护插件，禁止 AI / 用户修改删除

### 2.3 frontend.nav 导航配置（v1.1新增）

插件可通过 `frontend.nav` 声明底部导航栏入口，系统自动注册，无需手动修改 `bottom-nav.tsx`。

```json
{
  "frontend": {
    "enable": true,
    "entry": "frontend/page.tsx",
    "nav": {
      "label": "智能投标",
      "icon": "FileText",
      "position": "after:dev-specs"
    }
  }
}
```

**nav字段释义：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| label | string | 是 | 导航显示名称 |
| icon | string | 是 | 图标名称（映射到lucide-react） |
| position | string | 否 | 定位规则，默认"end" |

**position定位规则：**

| 值 | 说明 | 示例 |
|---|------|------|
| `start` | 插入到导航开头 | 插件作为首页入口 |
| `after:{href}` | 插入到指定导航项之后 | `after:dev-specs` |
| `before:{href}` | 插入到指定导航项之前 | `before:chat` |
| `end` | 插入到导航末尾（默认） | 普通插件 |

**支持的图标名称：**

使用lucide-react图标库，常用图标：
`FileText, Upload, Download, Settings, Users, Database, Server, Code, Workflow, Zap, Brain, Shield, Lock, Key, Globe, Mail, Calendar, Clock, Search, Filter, BarChart, PieChart, TrendingUp, Target, Layers, Box, Package, Truck, DollarSign, CreditCard, Receipt, FileInvoice, Briefcase, Building, Home, MapPin, Phone, MessageSquare, Send, Paperclip, Image, Video, Music, BookOpen, GraduationCap, Award, Star, Heart, ThumbsUp, CheckCircle, AlertCircle, AlertTriangle, Info, HelpCircle, XCircle, Plus, Minus, Edit, Trash, Copy, Save, RefreshCw`

### 2.4 系统权限白名单

```
file:read、file:write
storage:read、storage:write
eventbus:publish、eventbus:subscribe
network:http
log:write
```

---

## 3 插件完整生命周期（热加载）

插件管理器实时监听目录变更，全自动执行生命周期：

1. **发现阶段：** 监听插件新增 / 修改 / 删除
2. **校验阶段：** 校验 JSON 合法性、依赖、权限、循环依赖
3. **实例化注册：** 加载入口、注册工具、注册路由、注册前端、注册导航
4. **激活运行：** 状态变更为 active，工具可全局调用，导航自动显示
5. **热重载：** 文件变更自动卸载旧实例、重新加载激活
6. **卸载销毁：** 删除目录 / 指令卸载，回收全部资源、注销工具、移除导航

### 3.1 插件状态枚举

- `pending` - 待处理
- `validating` - 校验中
- `active` - 激活运行
- `error` - 错误
- `unloaded` - 已卸载

---

## 4 工具调用规范

所有插件工具统一注册至全局 Tool 网关

调用链路：`Skill/Agent → 网关鉴权 → 插件执行 → 日志埋点 → 返回`

插件跨调用：仅允许网关调用，禁止代码互导

每次调用自动记录：会话 ID、AgentID、插件 ID、入参、出参、耗时

---

## 5 Agent 自编程插件能力（核心特色）

完全对标 Skill 创建体验，Agent 可全自动独立完成插件全生命周期开发

### 5.1 系统核心内置工具：plugin_manager

支持动作：create、update、reload、delete、list、validate、read

**入参结构：**

```json
{
  "action": "string",
  "plugin_id": "string",
  "template_id": "string",
  "plugin_files": [{"file_path":"","content":""}]
}
```

**出参结构：**

```json
{
  "success": true,
  "plugin_state": "string",
  "message": "",
  "error_details": "",
  "artifact_id": ""
}
```

### 5.2 权限控制

- 专属高危权限：`system:plugin:manage`
- 仅核心 Core Agent 持有，普通 Agent 默认禁用
- 所有操作全审计日志留存

### 5.3 工件绑定机制

- 插件迭代草稿 → L2 存储
- 定稿冻结插件 → L3 归档快照
- 支持版本回溯、回滚迭代

### 5.4 AI 自动创建插件标准流程

1. 接收用户需求
2. 按需拉取模板 / 空白创建
3. AI 自主生成：JSON 配置、Python 逻辑、TSX 前端、说明文档
4. 写入目录自动校验、热加载激活
5. 自检调试、迭代修复
6. 定稿归档为系统正式插件

---

## 6 安全沙箱规范

- **权限强校验：** 所有资源操作必须提前声明
- **高危代码拦截：** 默认禁用系统高危调用
- **资源限额：** 单插件超时、内存限制，防卡死
- **故障隔离：** 插件崩溃不影响主服务与其他插件
- **核心插件保护：** protected 插件禁止任何修改删除

---

## 7 前端嵌入规范

- 基于 OpenFace Next/Tauri 组件体系
- 独立路由：`/plugins/{plugin-id}`
- 独立面板展示
- 复用全局权限体系
- 前端可直接调用本插件后端路由接口
- **自动导航注册：** 通过 `frontend.nav` 声明，系统自动注册到底部导航栏

---

## 8 插件三种创建模式

1. **AI 对话自编程（核心）：** 自然语言需求 → AI 全自动生成完整插件
2. **模板复用创建：** 基于系统预制模板快速改造生成
3. **用户手动创建：** 人工编写配置与代码，保存自动加载

---

## 9 错误异常规范

- 区分阻断级 / 警告级错误
- 工具超时自动终止返回异常
- 插件异常栈完整日志留存
- 依赖缺失、循环依赖、格式错误精准提示，支持 AI 自动修复

---

## 10 Plugin 与 Skill 最终边界定义

### Plugin（插件）

- 代码级底层能力
- 提供工具、接口、文件、UI、系统资源能力
- 支持 AI 自主编程创建

### Skill（技能）

- 提示词级业务编排
- 定义任务流程、应答规范、章节模板、执行 SOP
- 无代码，仅文本配置，支持 AI 自主创建

---

**规范状态：** 定稿冻结  
**归属体系：** OpenSoulMate 基座核心规范 13 号  
**版本历史：**  
- v1.0 (2026-09-03): 初始版本  
- v1.1 (2026-09-03): 新增 frontend.nav 自动导航注册
