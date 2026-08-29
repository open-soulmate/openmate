# Dashboard 改进计划 (2026-08-30)

## 现状分析

**文件**: `src/app/(app)/dashboard/dashboard-client.tsx` (675行, 31KB)

### 当前结构
```
PageLayout
├── Header (标题 + 副标题)
├── 4个统计卡 (agents/skills/conversations/cronJobs) — 卡片视图
├── 费用统计卡 (tokens/cost/模型分布) — 纯数字列表
├── 系统指标卡 (CPU/Memory/Disk + QPS/Latency/Requests/Alerts) — 进度条
├── 快速链接 (6个入口) — 卡片网格
├── Organ健康 (26个organ状态) — emoji网格
└── 最近活动 (usage记录表 或 cron jobs列表)
```

### 数据源 (5个API)
| API | 用途 | 轮询 |
|-----|------|------|
| `/api/health/all` | 26个organ健康状态 | 手动刷新 |
| `/api/gland/usage` | token用量汇总 | 初始加载 |
| `/api/gland/usage/recent?limit=20` | 最近调用记录 | 初始加载 |
| `/api/cron/jobs` | 定时任务列表 | 初始加载 |
| `/api/vital/stats` | 系统指标(CPU/Mem/Disk/QPS) | **10秒轮询** |

Zustand store: agentNodes, skills, conversations, groups, teams, knowledgeItems, workspaces

### 已有问题
1. **无图表** — 所有数据都是纯数字+文字，缺少可视化
2. **卡片视图** — 统计卡和快速链接都是卡片，应改为列表
3. **边框不统一** — 部分用 `border-border`，部分用 `border-primary/30`
4. **布局冗余** — PageLayout外面又包了一层 `h-full overflow-y-auto > max-w-5xl`
5. **费用计算粗糙** — 固定 $0.01/1K tokens，不区分模型
6. **Organ网格emoji** — 26个emoji在移动端挤成一团，可读性差
7. **无Flint图表** — 已安装 `flint-chart` 和 `echarts-for-react`，但dashboard未使用

---

## 改进步骤 (按优先级)

### Step 1: 统一边框 + 移除卡片视图
- 所有边框统一为 `border-[#27272a]` (1px)
- 统计卡(agents/skills/conversations/cron)改为**列表行**样式
- 快速链接改为**紧凑列表**，去掉卡片包装
- 移除外层 `max-w-5xl` 限制，让内容撑满PageLayout

### Step 2: 添加ECharts图表
用 `echarts-for-react` (已安装，dynamic import无SSR) 添加：
- **Token用量趋势** — 折线图 (按天聚合recent records)
- **模型分布** — 饼图 (by_model数据)
- **系统指标** — 仪表盘 (CPU/Memory/Disk用gauge)

### Step 3: 优化Organ健康展示
- 从emoji网格改为**紧凑列表** (organ名 + 状态点)
- 分组：核心(Soul/Cortex/Nerve/Vein) / 感知(Sense/Vision/Mind) / 基础设施等
- 移动端单列，桌面端2-3列

### Step 4: 优化费用统计
- 模型分布从列表改为**水平条形图**
- 今日/总计/平均合并为一行紧凑指标
- input/output tokens用**堆叠条**可视化

### Step 5: 最近活动优化
- 表格行高更紧凑
- 添加provider图标或颜色标识
- 移动端隐藏provider列，只显示model+tokens

### Step 6: 响应式细节
- 移动端：统计卡单列，图表全宽
- 桌面端：统计卡4列，图表2列布局
- 统一用 `useIsMobile()` hook

---

## 技术约束
- 已有依赖：`echarts@6.1.0`, `echarts-for-react@3.0.6`, `flint-chart@0.5.1`
- 参考：`learn/learning-charts.tsx` 的 ECharts 用法 (dynamic import + SVG renderer)
- 边框：统一 `#27272a`，1px
- 移动端/桌面端：一套代码，CSS响应式
- 列表优于卡片

## 不动的部分
- 5个数据获取API (fetchUsage/fetchRecentUsage/fetchCronJobs/checkOrganHealth/fetchSysMetrics)
- Zustand store的数据结构
- PageLayout组件本身
- 10秒轮询sysMetrics的逻辑
