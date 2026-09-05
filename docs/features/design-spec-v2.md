# OpenMate 设计规范 v2.0

> 整合 HyperOS4 设计语言 + 全平台适配（Web/桌面端/移动端）
> 更新时间：2026-09-05
>
> **适用范围**：网页端（浏览器）、桌面端（Tauri）、移动端（Tauri Mobile / 响应式网页）共用一套规范。
> 差异仅在壳层和交互方式，不影响设计规范核心。

---

## 一、设计原则

### 来自 HyperOS4 的通用原则

1. **三层色彩体系**：70% 背景层 + 20% 次级层 + 10% 强调层
2. **语义色固定含义**：蓝=选中/链接、绿=成功、黄=警告、红=错误
3. **文字层级**：主要信息100%、次要信息60%、辅助信息40%
4. **圆角 = 尺寸的1/4**：大卡片16px、中卡片12px、小元素6px
5. **不纯黑不纯白**：暗色模式用 #0a0a0f ~ #1a1a2e，不用 #000

### 三端适配对比

| 维度 | 移动端 | 网页端/桌面端 | 原因 |
|---|---|---|---|
| 最小点击目标 | 48dp（手指） | 32px（鼠标） | 手指面积 > 鼠标精度 |
| 安全区边距 | ≥12px | ≥8px | 防止手指误触边缘 |
| 字号基数 | 16px | 14px | 手机屏幕距离近，字号可大 |
| 圆角风格 | 偏大（柔润感） | 适中（专业感） | 移动端偏消费级，桌面端偏效率工具 |
| 布局模式 | 单列/全屏 | 多面板/侧边栏 | 手机屏幕窄，桌面屏幕宽 |
| 导航方式 | 底部Tab栏 | 左侧边栏 | 手机单手操作，桌面鼠标效率 |
| 交互方式 | 触摸+手势 | 鼠标+键盘 | 设备输入方式不同 |
| 信息密度 | 低（呼吸感） | 高（效率优先） | 手机屏幕小，桌面可展示更多 |

---

## 二、圆角规范（三端适配）

| 元素类型 | 移动端 | 网页端/桌面端 | CSS Token |
|---|---|---|---|
| 大卡片/弹窗 | 20px | 16px | `--radius-lg` |
| 中卡片/按钮 | 14px | 10px | `--radius-md` |
| 小元素/头像 | 10px | 6px | `--radius-sm` |
| 徽章/标签 | 6px | 4px | `--radius-xs` |
| 圆形头像 | 50% | 50% | `--radius-full` |
| 侧边栏/导航项 | — | 8px | `--radius-nav` |
| 消息气泡 | 16px | 12px | `--radius-bubble` |
| 底部Sheet | 20px 20px 0 0 | — | `--radius-sheet` |

```css
:root {
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-full: 50%;
  --radius-nav: 8px;
  --radius-bubble: 12px;
  --radius-sheet: 20px;
}

/* 移动端覆盖 */
@media (max-width: 768px) {
  :root {
    --radius-xs: 6px;
    --radius-sm: 10px;
    --radius-md: 14px;
    --radius-lg: 20px;
    --radius-bubble: 16px;
  }
}
```

---

## 三、字体规范

### 字体选择
```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
--font-cn: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
```

> **MiSans**：小米定制字体，可从小米官网下载后添加到 `--font-sans` 链头。
> 桌面端默认 Inter 更通用，移动端可用 MiSans 获得更原生的 HyperOS 感觉。

### 字阶体系（三端适配）

| 层级 | 移动端 | 网页端/桌面端 | 字重 | 透明度 | 用途 |
|---|---|---|---|---|---|
| Display | 30px | 28px | 600 | 100% | 大数据统计 |
| H1 | 22px | 20px | 600 | 100% | 页面标题 |
| H2 | 18px | 16px | 600 | 100% | 区域标题 |
| H3 | 16px | 14px | 500 | 100% | 卡片标题 |
| Body | 16px | 14px | 400 | 100% | 正文内容 |
| Caption | 13px | 12px | 500 | 60% | 辅助说明 |
| Overline | 11px | 10px | 500 | 40% | 标签/徽章 |

```css
:root {
  --text-display: 28px;
  --text-h1: 20px;
  --text-h2: 16px;
  --text-h3: 14px;
  --text-body: 14px;
  --text-caption: 12px;
  --text-overline: 10px;
}

/* 移动端：正文和标题更大，提升可读性 */
@media (max-width: 768px) {
  :root {
    --text-display: 30px;
    --text-h1: 22px;
    --text-h2: 18px;
    --text-h3: 16px;
    --text-body: 16px;
    --text-caption: 13px;
    --text-overline: 11px;
  }
}
```

---

## 四、间距规范

### 间距体系（8px 网格，三端通用）

| Token | 值 | 移动端用途 | 网页端/桌面端用途 |
|---|---|---|---|
| `--space-1` | 4px | 图标与文字间距 | 图标与文字、标签内边距 |
| `--space-2` | 8px | 按钮内边距 | 列表项内、按钮内边距 |
| `--space-3` | 12px | 卡片内边距 | 卡片内边距、表单项间距 |
| `--space-4` | 16px | 区域分隔 | 区域分隔、侧边栏内边距 |
| `--space-6` | 24px | 大区块间距 | 面板之间、标题与内容 |
| `--space-8` | 32px | 页面级分隔 | 页面级分隔 |
| `--space-12` | 48px | 移动端底部安全区 | — |

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}
```

### 安全区（三端适配）

| 场景 | 移动端 | 网页端/桌面端 |
|---|---|---|
| 内容区边距 | ≥16px | ≥8px |
| 弹窗/模态框 | ≥20px | ≥16px |
| 卡片内边距 | ≥16px | ≥12px |
| 按钮最小高度 | 48px（手指） | 32px（鼠标） |
| 按钮最小宽度 | 48px | 64px |
| 底部安全区 | ≥env(safe-area-inset-bottom) | — |

```css
/* 移动端底部安全区（刘海屏/Home指示器） */
@media (max-width: 768px) {
  .bottom-bar {
    padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
  }
}
```

---

## 五、颜色规范（三层体系）

### 暗色主题示例（深海静谧）

```css
/* 主色层 70% — 决定整体气质 */
--color-bg: #0a0a0f;
--color-bg-secondary: #12121a;

/* 次级层 20% — 卡片/侧边栏/弹窗 */
--color-surface: #1a1a2e;
--color-surface-hover: #22223a;
--color-sidebar: #0f0f18;

/* 强调层 10% — 按钮/选中/高亮 */
--color-primary: #3b82f6;
--color-primary-hover: #60a5fa;
--color-success: #22c55e;
--color-warning: #f59e0b;
--color-error: #ef4444;
```

### 亮色主题示例（奶油摩卡）

```css
--color-bg: #faf8f5;
--color-bg-secondary: #f5f0eb;
--color-surface: #ffffff;
--color-surface-hover: #f8f5f0;
--color-sidebar: #f0ebe5;
--color-primary: #8b5e3c;
--color-primary-hover: #a0714f;
```

### 配色规则

1. **不纯黑不纯白**：暗色背景用 #0a0a0f ~ #1a1a2e，亮色背景用 #faf8f5 ~ #f5f0eb
2. **层级色同色系**：背景和卡片用同一色相，明度差 ±8~15
3. **主强调色1个**：语义色 ≤4 个（蓝/绿/黄/红）
4. **高亮色饱和度**：S=30~50，不刺眼
5. **WCAG AA 对比度**：正文 ≥4.5:1，大字 ≥3:1

---

## 六、交互规范

### 网页端/桌面端交互

#### Hover 状态
```css
/* 所有可交互元素必须有 hover 状态 */
.hoverable:hover {
  background-color: var(--color-surface-hover);
  transition: background-color 150ms ease;
}

/* 按钮 hover 微上浮 */
button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
```

#### Focus 状态（键盘导航）
```css
/* 键盘 Tab 聚焦时显示轮廓 */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

### 移动端交互

#### 触摸反馈
```css
/* 触摸时无 hover，用 active 状态替代 */
@media (max-width: 768px) {
  .touchable:active {
    opacity: 0.7;
    transform: scale(0.98);
    transition: all 80ms ease;
  }
  
  /* 禁用 hover 效果（移动端 hover 状态不稳定） */
  .hoverable:hover {
    background-color: unset;
    transform: none;
  }
}
```

#### 手势支持
```css
/* 左滑删除 */
.swipeable {
  touch-action: pan-y;
  overflow-x: hidden;
}

/* 下拉刷新区域 */
.pull-to-refresh {
  overscroll-behavior-y: contain;
}

/* 长按菜单 */
.long-pressable {
  -webkit-touch-callout: none;
  user-select: none;
}
```

#### 键盘弹出处理
```css
/* 移动端键盘弹出时，输入框固定在底部 */
@media (max-width: 768px) {
  .chat-input-bar {
    position: sticky;
    bottom: 0;
    /* 虚拟键盘兼容 */
    bottom: env(keyboard-inset-height, 0px);
  }
}
```

### 通用动画

```css
/* 全局过渡 */
--transition-fast: 150ms ease;
--transition-normal: 200ms ease;
--transition-slow: 300ms ease;

/* 滚动条（桌面端） */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-surface-hover);
  border-radius: 3px;
}

/* 移动端隐藏滚动条但保留滚动 */
@media (max-width: 768px) {
  ::-webkit-scrollbar {
    display: none;
  }
  .scrollable {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
}
```

---

## 七、组件规范

### 消息气泡（三端通用）
```css
/* 用户消息 — 右对齐，主色调 */
.msg-user {
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-bubble) var(--radius-bubble) var(--radius-xs) var(--radius-bubble);
  max-width: 70%;
  padding: var(--space-2) var(--space-3);
}

/* AI 消息 — 左对齐，表面色 */
.msg-ai {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border-radius: var(--radius-bubble) var(--radius-bubble) var(--radius-bubble) var(--radius-xs);
  max-width: 80%;
  padding: var(--space-2) var(--space-3);
}

/* 系统消息 — 居中，小字 */
.msg-system {
  color: var(--color-text-secondary);
  font-size: var(--text-caption);
  text-align: center;
  padding: var(--space-2) 0;
}
```

### 侧边栏（网页端/桌面端）
```css
.sidebar {
  width: 280px;
  background: var(--color-sidebar);
  border-right: 1px solid var(--color-border);
  padding: var(--space-3) 0;
}

.sidebar-item {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-nav);
  cursor: pointer;
}

.sidebar-item:hover {
  background: var(--color-surface-hover);
}

.sidebar-item.active {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}
```

### 底部导航栏（移动端）
```css
/* 移动端：侧边栏变底部 Tab 栏 */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 56px;
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    align-items: center;
    border-right: none;
    border-top: 1px solid var(--color-border);
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 100;
  }
  
  /* 主内容区为底部导航留空间 */
  .main-content {
    padding-bottom: calc(56px + env(safe-area-inset-bottom));
  }
}
```

### 弹窗/模态框（三端适配）
```css
/* 桌面端：居中弹窗 */
.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  max-width: 480px;
  max-height: 80vh;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

/* 移动端：底部 Sheet */
@media (max-width: 768px) {
  .modal {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    transform: none;
    border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
    max-width: 100%;
    max-height: 90vh;
    padding: var(--space-4);
    animation: slideUp 300ms ease;
  }
  
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
}
```

### 卡片（三端通用）
```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: all var(--transition-fast);
}

/* 桌面端 hover 效果 */
@media (min-width: 769px) {
  .card:hover {
    border-color: var(--color-border-hover);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
}
```

### 按钮（三端通用）
```css
.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-body);
  font-weight: 500;
  min-height: 32px;
  min-width: 64px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

/* 移动端按钮更大 */
@media (max-width: 768px) {
  .btn-primary {
    min-height: 48px;
    min-width: 48px;
    font-size: 16px;
  }
}

/* 桌面端 hover */
@media (min-width: 769px) {
  .btn-primary:hover {
    background: var(--color-primary-hover);
    transform: translateY(-1px);
  }
}
```

---

## 八、响应式断点

```css
/* 桌面优先，向下适配 */
--breakpoint-sm: 640px;   /* 手机横屏 */
--breakpoint-md: 768px;   /* 平板 */
--breakpoint-lg: 1024px;  /* 小桌面 */
--breakpoint-xl: 1280px;  /* 标准桌面 */
--breakpoint-2xl: 1536px; /* 大桌面 */
```

### 布局规则
- **≥1024px**：侧边栏 + 主内容区 + 可选右面板
- **768-1024px**：侧边栏折叠为图标模式，主内容区全宽
- **<768px**：侧边栏 overlay，底部导航栏，全屏模式

---

## 九、HyperOS 柔光玻璃（桌面端适配版）

HyperOS 的柔光玻璃效果在桌面端可以用 CSS 实现，但要**降低强度**：

```css
/* 桌面端 — 轻度毛玻璃，不抢焦点 */
.glass-light {
  background: rgba(var(--color-surface-rgb), 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.08);
}

/* 移动端可以更重 */
@media (max-width: 768px) {
  .glass-light {
    backdrop-filter: blur(20px);
    background: rgba(var(--color-surface-rgb), 0.6);
  }
}
```

> **注意**：桌面端信息密度高，毛玻璃太重会降低可读性。建议只在弹窗/浮层使用。

---

## 十、与现有主题的映射

| 主题 | 主色层 | 次级层 | 强调色 | 柔光玻璃 |
|---|---|---|---|---|
| 深海静谧 | #0a0a0f | #1a1a2e | #3b82f6 | ✅ 适合 |
| 奶油摩卡 | #faf8f5 | #ffffff | #8b5e3c | ⚠️ 亮色不太需要 |
| 北欧极夜 | #0b0b14 | #161625 | #6366f1 | ✅ 适合 |
| 青空黑曜石 | #0a0f0a | #1a2e1a | #22c55e | ✅ 适合 |
| 暮光紫罗兰 | #0f0a14 | #2e1a3a | #a855f7 | ✅ 适合 |
| 沙丘黄昏 | #140f0a | #3a2a1a | #f59e0b | ✅ 适合 |
| 自定义 | 用户定义 | 用户定义 | 用户定义 | 可选 |

---

## 十一、实施优先级

### P0 — 立即应用（改 CSS 变量即可）
- [x] 圆角规范 → `--radius-*` 变量
- [x] 字阶体系 → `--text-*` 变量
- [x] 间距规范 → `--space-*` 变量
- [ ] 三层色彩体系 → 主题变量分层

### P1 — 下一步
- [ ] Hover/Focus 状态统一
- [ ] 滚动条样式
- [ ] 消息气泡样式统一
- [ ] 按钮组件规范化

### P2 — 锦上添花
- [ ] 柔光玻璃效果（弹窗/浮层）
- [ ] 过渡动画统一
- [ ] 响应式断点优化

---

*规范版本：v2.0 | 基于 HyperOS4 + 桌面端适配*
