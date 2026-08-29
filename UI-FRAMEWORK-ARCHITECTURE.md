# @opensoulmate/openface — 设计系统架构文档

## 定位

@opensoulmate/openface 是 Open-Soulmate 生态的统一 UI 框架。不只是内部组件库，而是一个**通用设计系统**，任何新项目都可以使用。

## 设计哲学

1. **做链接和编排，不做重复实现** — 一次定义，到处使用
2. **修改即升级** — 改一处，所有消费方自动生效
3. **C端伴生系统风格** — 面向个人用户，不是企业后台
4. **移动端和桌面端一套代码** — 响应式，不用条件渲染区分

## 包结构

```
@opensoulmate/openface
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # 统一导出
│   │
│   ├── components/                 # 通用组件
│   │   ├── page-layout.tsx         # 三栏布局框架（sidebar+main+workspace）
│   │   ├── left-panel.tsx          # 左侧列表面板（搜索+列表）
│   │   ├── detail-panel.tsx        # 右侧详情面板（sections）
│   │   ├── data-card.tsx           # 数据卡片（图标+数值+标签）
│   │   ├── status-dot.tsx          # 状态指示灯（绿/红/灰）
│   │   ├── metric-gauge.tsx        # 指标仪表盘（进度条+颜色阈值）
│   │   ├── data-table.tsx          # 数据表格（排序+筛选）
│   │   ├── chart-wrapper.tsx       # 图表容器（标题+操作+空状态）
│   │   ├── empty-state.tsx         # 空状态占位
│   │   ├── loading-skeleton.tsx    # 加载骨架屏
│   │   └── confirm-dialog.tsx      # 确认对话框
│   │
│   ├── layout/                     # 布局系统
│   │   ├── app-shell.tsx           # 应用外壳（topbar+sidebar+content+bottombar）
│   │   ├── top-bar.tsx             # 顶部导航栏
│   │   ├── bottom-nav.tsx          # 底部导航栏
│   │   ├── sidebar.tsx             # 左侧边栏（可折叠）
│   │   └── workspace-panel.tsx     # 右侧工作区面板（可折叠）
│   │
│   ├── design-tokens/              # 设计规范
│   │   ├── colors.ts               # 颜色系统（主色/辅色/语义色/边框色#27272a）
│   │   ├── typography.ts           # 字体系统（字号/字重/行高）
│   │   ├── spacing.ts              # 间距系统（4px基准）
│   │   ├── borders.ts              # 边框系统（统一#27272a，1px）
│   │   ├── radius.ts               # 圆角系统（sm=8, md=12, lg=16）
│   │   ├── shadows.ts              # 阴影系统
│   │   └── animations.ts           # 动画系统（折叠/滑入/淡入）
│   │
│   ├── hooks/                      # 共享Hooks
│   │   ├── use-mobile.ts           # 移动端检测
│   │   ├── use-sidebar.ts          # 侧边栏状态
│   │   ├── use-workspace.ts        # 工作区状态
│   │   ├── use-theme.ts            # 主题切换
│   │   ├── use-resize-observer.ts  # 尺寸监听（用于ECharts等）
│   │   └── use-local-storage.ts    # 本地存储
│   │
│   ├── theme/                      # 主题系统
│   │   ├── dark.ts                 # 深色主题（默认）
│   │   ├── light.ts                # 浅色主题
│   │   ├── purple.ts               # 紫色主题
│   │   └── provider.tsx            # 主题Provider
│   │
│   ├── charts/                     # 图表组件
│   │   ├── line-chart.tsx          # 折线图（ECharts封装）
│   │   ├── bar-chart.tsx           # 柱状图
│   │   ├── pie-chart.tsx           # 饼图
│   │   ├── gauge-chart.tsx         # 仪表盘
│   │   ├── area-chart.tsx          # 面积图
│   │   └── heatmap-chart.tsx       # 热力图
│   │
│   ├── store/                      # 状态管理
│   │   ├── app-store.ts            # 全局状态（sidebar/workspace/theme）
│   │   └── types.ts                # 类型定义
│   │
│   └── lib/                        # 工具函数
│       ├── cn.ts                   # className合并（clsx+twMerge）
│       ├── api-client.ts           # API客户端基础
│       ├── format.ts               # 格式化工具（时间/数字/货币）
│       └── i18n.ts                 # 国际化配置
│
├── styles/
│   └── globals.css                 # 全局样式（CSS变量+Tailwind）
│
└── README.md
```

## 设计规范

### 颜色系统
```typescript
// 边框统一色
const BORDER = '#27272a';        // zinc-800
const BORDER_LIGHT = '#3f3f46';  // zinc-700 (hover)

// 语义色
const SUCCESS = '#22c55e';       // green-500
const WARNING = '#f59e0b';       // amber-500
const ERROR = '#ef4444';         // red-500
const INFO = '#3b82f6';          // blue-500

// 主色（可通过主题切换）
const PRIMARY = '#7c3aed';       // violet-600
```

### 间距系统
- 基准：4px
- 常用：4/8/12/16/20/24/32/48/64

### 圆角系统
- sm: 8px（按钮、输入框）
- md: 12px（卡片）
- lg: 16px（对话框）
- full: 9999px（徽章）

### 字体系统
```
H1: 黑体 二号 (22px)
H2: 宋体 三号 (16px)
H3: 宋体 四号 (14px)
正文: 仿宋 小四 (12px) 缩进2字符
标签: 10px
```

### 边框规则
- 统一使用 `border-border`（映射到 #27272a）
- 厚度 1px
- 下划线规则：只在填写内容上有下划线，固定文字无下划线

## 使用方式

### 安装
```bash
# 从 GitHub Packages 安装
pnpm add @opensoulmate/openface

# 或从本地开发
pnpm add link:../openface
```

### 引入组件
```tsx
import { PageLayout, LeftPanel, DetailPanel } from '@opensoulmate/openface';
import { useSidebar, useTheme } from '@opensoulmate/openface/hooks';
import { DARK_THEME } from '@opensoulmate/openface/theme';
```

### 引入样式
```tsx
// globals.css
@import '@opensoulmate/openface/styles/globals.css';
```

### 引入设计Token
```tsx
import { colors, spacing, borders } from '@opensoulmate/openface/design-tokens';
```

## 版本策略

- 主版本（1.x → 2.x）：破坏性变更，需要消费方修改代码
- 次版本（1.0 → 1.1）：新增组件/功能，向后兼容
- 补丁版本（1.0.0 → 1.0.1）：Bug修复，透明升级

消费方使用 `^1.0.0` 锁定主版本，自动获取次版本和补丁版本。

## 开发流程

1. 在 `openface` 仓库开发
2. 发布到 GitHub Packages（或本地 link 测试）
3. 各项目 `pnpm update @opensoulmate/openface` 升级
4. 设计规范变更时，更新 design-tokens，所有消费方自动生效

## 消费方列表

| 项目 | 用途 | 端口 |
|------|------|------|
| OpenMate | C端伴生系统 | 3002 |
| OpenSoul | 企业端管理 | 8090 |
| OpenSoma | 数据收集 | 8091 |
| ACP Proxy | 代理服务 | 8092 |
| 未来新项目 | 任意 | - |
