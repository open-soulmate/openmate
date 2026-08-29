# OpenMate 页面三栏布局规划

## 设计原则
- **Sidebar（左）**：清单/列表/导航 — 可选择、可搜索、可过滤
- **主内容区（中）**：预览/总览 — 可视化、统计、卡片网格
- **Workspace（右）**：详情/编辑 — 选中项的完整信息、操作面板

## 一、知识管理域

### knowledge（知识库）
- **Sidebar**: 知识条目列表（按分类/标签分组，支持搜索）
- **主内容**: 知识卡片网格/列表预览
- **Workspace**: 选中条目的完整内容、编辑、关联关系

### graph（知识图谱）
- **Sidebar**: 实体列表（按类型过滤：人物/组织/概念...）
- **主内容**: 力导向图可视化
- **Workspace**: 选中实体的详情、关联关系、编辑

### learn（学习）
- **Sidebar**: 课程/章节列表
- **主内容**: 学习内容预览/进度概览
- **Workspace**: 当前章节详情、笔记

### tags（标签）
- **Sidebar**: 标签树/分类列表
- **主内容**: 标签云 + 关联内容预览
- **Workspace**: 选中标签的详情、关联条目

### search（搜索）
- **Sidebar**: 搜索历史/保存的搜索
- **主内容**: 搜索结果列表
- **Workspace**: 选中结果的详情预览

### knowledge-requests（知识请求）
- **Sidebar**: 请求列表（待处理/已完成）
- **主内容**: 请求概览/统计
- **Workspace**: 选中请求的详情

### kb-sharing（知识共享）
- **Sidebar**: 共享项目列表
- **主内容**: 共享内容预览
- **Workspace**: 共享设置/权限详情

## 二、系统运维域

### dashboard（仪表盘）
- **Sidebar**: 指标分类导航（CPU/内存/网络/磁盘...）
- **主内容**: 系统概览卡片、实时图表
- **Workspace**: 选中指标的详细图表、历史趋势

### diagnostics（诊断）
- **Sidebar**: 诊断项目列表
- **主内容**: 诊断结果概览
- **Workspace**: 选中诊断的详细报告

### metrics（指标）
- **Sidebar**: 指标分类列表
- **主内容**: 指标图表/仪表盘
- **Workspace**: 选中指标的详细数据

### benchmark（基准测试）
- **Sidebar**: 测试项目列表
- **主内容**: 测试结果概览
- **Workspace**: 选中测试的详细报告

### system（系统）
- **Sidebar**: 系统模块列表（服务/进程/端口...）
- **主内容**: 系统状态概览
- **Workspace**: 选中模块的详细信息

### sessions（会话管理）
- **Sidebar**: 会话列表（按时间/状态排序）
- **主内容**: 会话概览/统计
- **Workspace**: 选中会话的详情

### activity（活动）
- **Sidebar**: 活动类型过滤（系统/用户/Agent...）
- **主内容**: 活动时间线
- **Workspace**: 选中活动的详情

### changelog（变更日志）
- **Sidebar**: 版本列表
- **主内容**: 变更内容预览
- **Workspace**: 选中版本的详细变更

## 三、Agent/智能体域

### skills（技能）
- **Sidebar**: 技能列表（按分类/状态）
- **主内容**: 技能卡片概览
- **Workspace**: 选中技能的详情、配置、使用情况

### mcp（MCP服务）
- **Sidebar**: MCP服务列表
- **主内容**: 服务状态概览
- **Workspace**: 选中服务的配置、工具列表

### plugins（插件）
- **Sidebar**: 插件列表（已安装/可用）
- **主内容**: 插件卡片概览
- **Workspace**: 选中插件的详情、配置

### cron（定时任务）
- **Sidebar**: 任务列表（按状态分组）
- **主内容**: 任务时间线/概览
- **Workspace**: 选中任务的详情、执行历史

### pipeline（流水线）
- **Sidebar**: 流水线列表
- **主内容**: 流水线状态概览
- **Workspace**: 选中流水线的详情、执行记录

### workflow / workflow-builder（工作流）
- **Sidebar**: 工作流列表
- **主内容**: 工作流画布/可视化
- **Workspace**: 选中节点的配置详情

### will（意志/目标）
- **Sidebar**: 目标列表
- **主内容**: 目标进度概览
- **Workspace**: 选中目标的详情

### intelligence（智能）
- **Sidebar**: 智能模块列表
- **主内容**: 模块状态概览
- **Workspace**: 选中模块的详情

### ai-engine（AI引擎）
- **Sidebar**: 引擎/模型列表
- **主内容**: 引擎状态概览
- **Workspace**: 选中引擎的配置详情

### marketplace（市场）
- **Sidebar**: 分类/标签过滤
- **主内容**: 商品卡片网格
- **Workspace**: 选中商品的详情

## 四、OpenSoul器官域

### soma / soma-admin（体细胞）
- **Sidebar**: 组件/模块列表
- **主内容**: 组件状态概览
- **Workspace**: 选中组件的详情

### cortex（皮层）
- **Sidebar**: 处理模块列表
- **主内容**: 模块状态概览
- **Workspace**: 选中模块的详情

### soul（灵魂）
- **Sidebar**: 核心配置列表
- **主内容**: 配置概览
- **Workspace**: 选中配置的详情

### 其他器官页面（gene/gland/hippo/heredity/immune/limb/marrow/mirror/nerve/nerve/nest/pulse/reflex/sense/vein/vision/vital/voice/mind/link/echo/body-map/trajectory/topology/healer）
统一模式：
- **Sidebar**: 该器官的子模块/功能列表
- **主内容**: 状态概览/可视化
- **Workspace**: 选中项的详情

## 五、管理域

### settings（设置）
- **Sidebar**: 设置分类导航（账户/外观/模型/通知...）
- **主内容**: 当前分类的设置表单
- **Workspace**: 不需要（设置本身就是详情）

### admin（管理）
- **Sidebar**: 管理模块列表
- **主内容**: 管理概览
- **Workspace**: 选中模块的详情

### permission（权限）
- **Sidebar**: 角色/用户列表
- **主内容**: 权限矩阵概览
- **Workspace**: 选中角色/用户的权限详情

### enterprise（企业）
- **Sidebar**: 企业模块列表
- **主内容**: 企业信息概览
- **Workspace**: 选中模块的详情

### notifications（通知）
- **Sidebar**: 通知分类（全部/未读/系统/Agent...）
- **主内容**: 通知列表
- **Workspace**: 选中通知的详情

### download（下载）
- **Sidebar**: 下载任务列表
- **主内容**: 下载状态概览
- **Workspace**: 选中任务的详情

## 六、其他

### workspace（工作空间）
- **Sidebar**: 工作空间项目列表
- **主内容**: 项目概览
- **Workspace**: 选中项目的详情

### capture（捕获）
- **Sidebar**: 捕获记录列表
- **主内容**: 捕获内容预览
- **Workspace**: 选中记录的详情

### discovery（发现）
- **Sidebar**: 发现内容分类
- **主内容**: 推荐内容网格
- **Workspace**: 选中内容的详情

### registry（注册表）
- **Sidebar**: 注册项列表
- **主内容**: 注册项概览
- **Workspace**: 选中项的详情

---

## 实现优先级

### P0（核心页面，用户最常用）
1. knowledge — 知识库管理
2. graph — 知识图谱
3. settings — 设置
4. notifications — 通知
5. plugins — 插件
6. skills — 技能
7. cron — 定时任务

### P1（重要页面）
8. dashboard — 仪表盘
9. sessions — 会话管理
10. mcp — MCP服务
11. system — 系统
12. learn — 学习
13. search — 搜索
14. marketplace — 市场

### P2（其他页面）
15-63. 其余页面按统一模式改造
