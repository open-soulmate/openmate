# OpenFace 设计规范 — 基于 HyperOS4 生命感美学

> 提取自小米澎湃OS4 开发者平台设计规范，适配 OpenFace Web/Tauri 桌面端

---

## 一、圆角规范

HyperOS 核心规则：**圆角 = 元素尺寸的 1/4**

| 元素类型 | 尺寸 | 圆角 | CSS Token |
|---|---|---|---|
| 大卡片/弹窗 | 容器级 | 16px | `--radius-lg` |
| 中卡片/按钮 | 48dp 等效 | 12px | `--radius-md` |
| 小图标/头像 | 24dp 等效 | 6px | `--radius-sm` |
| 徽章/标签 | 16dp 等效 | 4px | `--radius-xs` |
| 圆形头像 | 正方形 | 50% | `--radius-full` |
| 小部件容器 | 手机 1080p | 55px (≈14px @2x) | `--radius-widget` |

**安全区（内容不贴边）：**
- 手机：≥ 12px
- 平板/桌面：≥ 16px
- 弹窗/模态框：≥ 20px

---

## 二、字体规范

### 字体选择
```css
--font-sans: 'MiSans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'MiSans Mono', monospace;
```

### 字阶体系（rem 基准 16px）

| 层级 | 用途 | 字号 | 字重 | 透明度 | Token |
|---|---|---|---|---|---|
| Display | 大数据/统计 | 2rem (32px) | Demibold (600) | 100% | `--text-display` |
| H1 | 页面标题 | 1.5rem (24px) | Demibold (600) | 100% | `--text-h1` |
| H2 | 区域标题 | 1.25rem (20px) | Demibold (600) | 100% | `--text-h2` |
| H3 | 卡片标题 | 1rem (16px) | Medium (500) | 100% | `--text-h3` |
| Body | 正文内容 | 0.875rem (14px) | Regular (400) | 100% | `--text-body` |
| Caption | 辅助说明 | 0.75rem (12px) | Medium (500) | 60% | `--text-caption` |
| Overline | 标签/徽章 | 0.625rem (10px) | Medium (500) | 40% | `--text-overline` |

### HyperOS 文字层级映射
- **主要信息** → MiSans Demibold, 100% 不透明
- **次要信息** → MiSans Medium, 40% 透明度
- **辅助信息** → MiSans Regular, 60% 透明度

---

## 三、颜色层级

### 三层色彩体系

| 层级 | 用途 | 占比 | 说明 |
|---|---|---|---|
| 主色层 | 背景/底色 | 70% | 决定整体气质，不纯黑不纯白 |
| 次级层 | 卡片/侧边栏/弹窗 | 20% | 同色系明度 ±8~15 |
| 强调层 | 按钮/选中/高亮 | 10% | 主强调色 1 个，语义色 ≤4 个 |

### 语义色固定含义（全局统一）

| 语义色 | 含义 | 使用场景 |
|---|---|---|
| 主强调色 | 选中/激活/链接 | 按钮、光标、链接、选中态 |
| 绿色 | 成功/正常/注释 | 操作成功、在线状态、代码注释 |
| 黄/橙色 | 警告/变量/常量 | 警告提示、代码常量 |
| 红色 | 错误/危险 | 错误提示、删除确认、代码错误 |

### 文字颜色层级

```css
/* 主要文字 — 100% 不透明 */
--text-primary: var(--color-foreground);

/* 次要文字 — 60% 不透明 */
--text-secondary: var(--color-muted-foreground);

/* 辅助文字 — 40% 不透明 */
--text-tertiary: color-mix(in srgb, var(--color-foreground) 40%, transparent);
```

---

## 四、间距规范

基于 4px 网格系统：

| Token | 值 | 用途 |
|---|---|---|
| `--space-1` | 4px | 紧凑元素间距 |
| `--space-2` | 8px | 按钮内边距、图标间距 |
| `--space-3` | 12px | 卡片内边距 |
| `--space-4` | 16px | 区域间距 |
| `--space-6` | 24px | 大区域分隔 |
| `--space-8` | 32px | 页面边距 |

---

## 五、阴影与层次

### 柔光玻璃材质（HyperOS4 核心）

```css
/* 卡片基础阴影 */
--shadow-card: 0 2px 8px rgba(0, 0, 0, 0.12);

/* 弹窗/浮层阴影 */
--shadow-popup: 0 8px 32px rgba(0, 0, 0, 0.24);

/* 柔光玻璃效果 */
--glass-blur: blur(20px);
--glass-bg: color-mix(in srgb, var(--color-card) 70%, transparent);
--glass-border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);

/* 卡片组件 */
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}
```

---

## 六、动效规范

| 动效类型 | 时长 | 缓动 | Token |
|---|---|---|---|
| 微交互（hover/press） | 150ms | ease-out | `--duration-fast` |
| 状态切换 | 200ms | ease-in-out | `--duration-normal` |
| 页面过渡 | 300ms | ease-in-out | `--duration-slow` |
| 弹窗出现 | 250ms | cubic-bezier(0.16, 1, 0.3, 1) | `--duration-popup` |

---

## 七、响应式断点

| 断点 | 宽度 | 布局 |
|---|---|---|
| 手机 | < 640px | 单栏，底部导航 |
| 平板 | 640px - 1024px | 侧边栏 + 主内容 |
| 桌面 | 1024px - 1440px | 侧边栏 + 主内容 + 右面板 |
| 大屏 | > 1440px | 全展开，多面板 |

---

## 八、无障碍标准

- **WCAG 2.1 AA**：正文对比度 ≥ 4.5:1，大标题 ≥ 3:1
- **高饱和限制**：亮色饱和度 S 控制在 30~50，不用 S=100
- **深色模式**：必须支持，不纯黑 #000，不纯白 #FFF
- **焦点态**：所有可交互元素必须有键盘焦点样式

---

## 九、CSS Token 汇总（可直接导入）

```css
:root {
  /* 圆角 */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* 间距 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* 动效 */
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --duration-popup: 250ms;
  --ease-out: ease-out;
  --ease-in-out: ease-in-out;
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);

  /* 阴影 */
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.12);
  --shadow-popup: 0 8px 32px rgba(0, 0, 0, 0.24);

  /* 柔光玻璃 */
  --glass-blur: blur(20px);
  --glass-opacity: 0.7;
}
```

---

*文档来源：小米澎湃OS4 开发者平台 (dev.mi.com) + hyperos.mi.com*
*适配目标：OpenFace Web 面板 / Tauri 桌面端 / 移动端 PWA*
