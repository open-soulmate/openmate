# OpenMate 多主题系统设计 v3

> 7 套主题：6 套标准 + 1 套自定义
> 遵循 WCAG AA 标准，低饱和、语义色统一
> CSS 变量直接可用，支持一键切换

---

## 主题列表

| # | ID | 名称 | 风格 | 适用场景 |
|---|---|---|---|---|
| 1 | `deep-abyss` | 深海静谧 | 冷深蓝·工程风 | Agent后台、控制台 |
| 2 | `cream-mocha` | 奶油摩卡 | 暖棕低饱和 | OpenFace前端、AI对话 |
| 3 | `nord-night` | 北欧极夜 | 冷灰极简 | 代码面板、技术文档 |
| 4 | `obsidian-cyan` | 青空黑曜石 | 青蓝科技风 | AI产品、演示Demo |
| 5 | `twilight-violet` | 暮光紫罗兰 | 紫调优雅 | 可视化、流程图 |
| 6 | `dune-sand` | 沙丘黄昏 | 暖灰工业风 | 大屏监控、运维 |
| 7 | `custom` | 自定义 | 用户自选 | 高级用户 |

---

## 变量映射

用户提供的变量名 → 系统变量名对应关系：

| 用户变量 | 系统变量 | 用途 |
|---|---|---|
| `--bg-primary` | `--color-background` | 主背景 |
| `--bg-secondary` | `--color-card` / `--color-muted` / `--color-secondary` | 二级背景 |
| `--bg-card` | `--color-accent` / `--color-border` | 卡片/分割线 |
| `--text-primary` | `--color-foreground` | 正文 |
| `--text-secondary` | `--color-muted-foreground` | 次要文字 |
| `--accent` | `--color-primary` | 主强调色 |
| `--success` | `--color-syntax-string` | 成功/绿色 |
| `--warning` | `--color-syntax-number` | 警告/橙色 |
| `--danger` | `--color-destructive` | 错误/红色 |

---

## 每套主题完整 CSS 变量定义

### 主题1：深海静谧 Deep Abyss

```css
.theme-deep-abyss {
  --color-background: #121826;
  --color-foreground: #cdd6f4;
  --color-card: #1c2437;
  --color-card-foreground: #cdd6f4;
  --color-popover: #1c2437;
  --color-popover-foreground: #cdd6f4;
  --color-primary: #7aa2f7;
  --color-primary-foreground: #121826;
  --color-secondary: #252f46;
  --color-secondary-foreground: #a9b1d6;
  --color-muted: #1c2437;
  --color-muted-foreground: #7d88a8;
  --color-accent: #252f46;
  --color-accent-foreground: #cdd6f4;
  --color-destructive: #f7768e;
  --color-destructive-foreground: #121826;
  --color-border: #252f46;
  --color-input: #252f46;
  --color-ring: #7aa2f7;
  --color-sidebar: #0e1420;
  --color-sidebar-foreground: #a9b1d6;
  --color-sidebar-accent: #1c2437;
  --color-syntax-keyword: #7aa2f7;
  --color-syntax-string: #9ece6a;
  --color-syntax-number: #e0af68;
  --color-syntax-comment: #7d88a8;
  --color-syntax-function: #bb9af7;
  --color-thinking-bg: #1c2437;
  --color-thinking-border: #7aa2f7;
  --color-thinking-title: #7dcfff;
  --color-thinking-text: #cdd6f4;
  --color-tool-bg: #1c2437;
  --color-tool-border: #7aa2f7;
  --color-tool-name: #e0af68;
  --color-tool-status-running: #7dcfff;
  --color-tool-status-done: #9ece6a;
  --color-tool-status-fail: #f7768e;
}
.theme-deep-abyss-light {
  --color-background: #f1f5fc;
  --color-foreground: #20293d;
  --color-card: #e4ebf7;
  --color-card-foreground: #20293d;
  --color-popover: #e4ebf7;
  --color-popover-foreground: #20293d;
  --color-primary: #2b5cb8;
  --color-primary-foreground: #f1f5fc;
  --color-secondary: #dce3f2;
  --color-secondary-foreground: #565f89;
  --color-muted: #e4ebf7;
  --color-muted-foreground: #7d88a8;
  --color-accent: #dce3f2;
  --color-accent-foreground: #20293d;
  --color-destructive: #c53b4e;
  --color-destructive-foreground: #f1f5fc;
  --color-border: #d0d8ec;
  --color-input: #d0d8ec;
  --color-ring: #2b5cb8;
  --color-sidebar: #e8edf7;
  --color-sidebar-foreground: #565f89;
  --color-sidebar-accent: #dce3f2;
  --color-syntax-keyword: #2b5cb8;
  --color-syntax-string: #387028;
  --color-syntax-number: #a1621c;
  --color-syntax-comment: #7d88a8;
  --color-syntax-function: #6b3fa0;
  --color-thinking-bg: #e4ebf7;
  --color-thinking-border: #2b5cb8;
  --color-thinking-title: #2b5cb8;
  --color-thinking-text: #20293d;
  --color-tool-bg: #e4ebf7;
  --color-tool-border: #2b5cb8;
  --color-tool-name: #a1621c;
  --color-tool-status-running: #2b5cb8;
  --color-tool-status-done: #387028;
  --color-tool-status-fail: #c53b4e;
}
```

### 主题2：奶油摩卡 Cream Mocha

```css
.theme-cream-mocha {
  --color-background: #1e1e2e;
  --color-foreground: #cdd6f4;
  --color-card: #26273a;
  --color-card-foreground: #cdd6f4;
  --color-popover: #26273a;
  --color-popover-foreground: #cdd6f4;
  --color-primary: #89b4fa;
  --color-primary-foreground: #1e1e2e;
  --color-secondary: #313244;
  --color-secondary-foreground: #a6adc8;
  --color-muted: #26273a;
  --color-muted-foreground: #6c7086;
  --color-accent: #313244;
  --color-accent-foreground: #cdd6f4;
  --color-destructive: #f38ba8;
  --color-destructive-foreground: #1e1e2e;
  --color-border: #313244;
  --color-input: #313244;
  --color-ring: #89b4fa;
  --color-sidebar: #181825;
  --color-sidebar-foreground: #a6adc8;
  --color-sidebar-accent: #26273a;
  --color-syntax-keyword: #89b4fa;
  --color-syntax-string: #a6e3a1;
  --color-syntax-number: #fab387;
  --color-syntax-comment: #6c7086;
  --color-syntax-function: #f9e2af;
  --color-thinking-bg: #26273a;
  --color-thinking-border: #89b4fa;
  --color-thinking-title: #89dceb;
  --color-thinking-text: #cdd6f4;
  --color-tool-bg: #26273a;
  --color-tool-border: #89b4fa;
  --color-tool-name: #fab387;
  --color-tool-status-running: #89dceb;
  --color-tool-status-done: #a6e3a1;
  --color-tool-status-fail: #f38ba8;
}
.theme-cream-mocha-light {
  --color-background: #eff1f5;
  --color-foreground: #4c4f69;
  --color-card: #e6e9ef;
  --color-card-foreground: #4c4f69;
  --color-popover: #e6e9ef;
  --color-popover-foreground: #4c4f69;
  --color-primary: #3e7fb6;
  --color-primary-foreground: #eff1f5;
  --color-secondary: #dce0e8;
  --color-secondary-foreground: #8c8fa1;
  --color-muted: #e6e9ef;
  --color-muted-foreground: #8c8fa1;
  --color-accent: #dce0e8;
  --color-accent-foreground: #4c4f69;
  --color-destructive: #d20f39;
  --color-destructive-foreground: #eff1f5;
  --color-border: #ccd0da;
  --color-input: #ccd0da;
  --color-ring: #3e7fb6;
  --color-sidebar: #e8e9ef;
  --color-sidebar-foreground: #8c8fa1;
  --color-sidebar-accent: #dce0e8;
  --color-syntax-keyword: #3e7fb6;
  --color-syntax-string: #40a02b;
  --color-syntax-number: #df8e1d;
  --color-syntax-comment: #8c8fa1;
  --color-syntax-function: #8839ef;
  --color-thinking-bg: #e6e9ef;
  --color-thinking-border: #3e7fb6;
  --color-thinking-title: #3e7fb6;
  --color-thinking-text: #4c4f69;
  --color-tool-bg: #e6e9ef;
  --color-tool-border: #3e7fb6;
  --color-tool-name: #df8e1d;
  --color-tool-status-running: #3e7fb6;
  --color-tool-status-done: #40a02b;
  --color-tool-status-fail: #d20f39;
}
```

### 主题3：北欧极夜 Nord Night

```css
.theme-nord-night {
  --color-background: #2e3440;
  --color-foreground: #eceff4;
  --color-card: #3b4252;
  --color-card-foreground: #eceff4;
  --color-popover: #3b4252;
  --color-popover-foreground: #eceff4;
  --color-primary: #81a1c1;
  --color-primary-foreground: #2e3440;
  --color-secondary: #434c5e;
  --color-secondary-foreground: #d8dee9;
  --color-muted: #3b4252;
  --color-muted-foreground: #93a1b2;
  --color-accent: #434c5e;
  --color-accent-foreground: #eceff4;
  --color-destructive: #bf616a;
  --color-destructive-foreground: #eceff4;
  --color-border: #3b4252;
  --color-input: #3b4252;
  --color-ring: #81a1c1;
  --color-sidebar: #272d38;
  --color-sidebar-foreground: #d8dee9;
  --color-sidebar-accent: #3b4252;
  --color-syntax-keyword: #81a1c1;
  --color-syntax-string: #a3be8c;
  --color-syntax-number: #d08770;
  --color-syntax-comment: #616e88;
  --color-syntax-function: #ebcb8b;
  --color-thinking-bg: #3b4252;
  --color-thinking-border: #b48ead;
  --color-thinking-title: #88c0d0;
  --color-thinking-text: #eceff4;
  --color-tool-bg: #3b4252;
  --color-tool-border: #88c0d0;
  --color-tool-name: #ebcb8b;
  --color-tool-status-running: #88c0d0;
  --color-tool-status-done: #a3be8c;
  --color-tool-status-fail: #bf616a;
}
.theme-nord-night-light {
  --color-background: #eceff4;
  --color-foreground: #2e3440;
  --color-card: #e5e9f0;
  --color-card-foreground: #2e3440;
  --color-popover: #e5e9f0;
  --color-popover-foreground: #2e3440;
  --color-primary: #5e81ac;
  --color-primary-foreground: #eceff4;
  --color-secondary: #d8dee9;
  --color-secondary-foreground: #616e88;
  --color-muted: #e5e9f0;
  --color-muted-foreground: #616e88;
  --color-accent: #d8dee9;
  --color-accent-foreground: #2e3440;
  --color-destructive: #a84848;
  --color-destructive-foreground: #eceff4;
  --color-border: #d8dee9;
  --color-input: #d8dee9;
  --color-ring: #5e81ac;
  --color-sidebar: #e5e9f0;
  --color-sidebar-foreground: #616e88;
  --color-sidebar-accent: #d8dee9;
  --color-syntax-keyword: #5e81ac;
  --color-syntax-string: #4c7248;
  --color-syntax-number: #b46948;
  --color-syntax-comment: #616e88;
  --color-syntax-function: #9a6b32;
  --color-thinking-bg: #e5e9f0;
  --color-thinking-border: #5e81ac;
  --color-thinking-title: #5e81ac;
  --color-thinking-text: #2e3440;
  --color-tool-bg: #e5e9f0;
  --color-tool-border: #5e81ac;
  --color-tool-name: #b46948;
  --color-tool-status-running: #5e81ac;
  --color-tool-status-done: #4c7248;
  --color-tool-status-fail: #a84848;
}
```

### 主题4：青空黑曜石 Obsidian Cyan

```css
.theme-obsidian-cyan {
  --color-background: #111b21;
  --color-foreground: #d8e6ec;
  --color-card: #1a2933;
  --color-card-foreground: #d8e6ec;
  --color-popover: #1a2933;
  --color-popover-foreground: #d8e6ec;
  --color-primary: #5ccfe6;
  --color-primary-foreground: #111b21;
  --color-secondary: #223542;
  --color-secondary-foreground: #b0c4ce;
  --color-muted: #1a2933;
  --color-muted-foreground: #7a96a5;
  --color-accent: #223542;
  --color-accent-foreground: #d8e6ec;
  --color-destructive: #ff6b6b;
  --color-destructive-foreground: #111b21;
  --color-border: #223542;
  --color-input: #223542;
  --color-ring: #5ccfe6;
  --color-sidebar: #0d1519;
  --color-sidebar-foreground: #b0c4ce;
  --color-sidebar-accent: #1a2933;
  --color-syntax-keyword: #5ccfe6;
  --color-syntax-string: #62d2a2;
  --color-syntax-number: #ffc857;
  --color-syntax-comment: #7a96a5;
  --color-syntax-function: #d4b896;
  --color-thinking-bg: #1a2933;
  --color-thinking-border: #5ccfe6;
  --color-thinking-title: #5ccfe6;
  --color-thinking-text: #d8e6ec;
  --color-tool-bg: #1a2933;
  --color-tool-border: #5ccfe6;
  --color-tool-name: #ffc857;
  --color-tool-status-running: #5ccfe6;
  --color-tool-status-done: #62d2a2;
  --color-tool-status-fail: #ff6b6b;
}
.theme-obsidian-cyan-light {
  --color-background: #f4f9fb;
  --color-foreground: #1a2933;
  --color-card: #e6f1f5;
  --color-card-foreground: #1a2933;
  --color-popover: #e6f1f5;
  --color-popover-foreground: #1a2933;
  --color-primary: #0d96b0;
  --color-primary-foreground: #f4f9fb;
  --color-secondary: #d8e8ef;
  --color-secondary-foreground: #547485;
  --color-muted: #e6f1f5;
  --color-muted-foreground: #547485;
  --color-accent: #d8e8ef;
  --color-accent-foreground: #1a2933;
  --color-destructive: #e03e3e;
  --color-destructive-foreground: #f4f9fb;
  --color-border: #c8dae3;
  --color-input: #c8dae3;
  --color-ring: #0d96b0;
  --color-sidebar: #eaf3f7;
  --color-sidebar-foreground: #547485;
  --color-sidebar-accent: #d8e8ef;
  --color-syntax-keyword: #0d96b0;
  --color-syntax-string: #239968;
  --color-syntax-number: #c48b00;
  --color-syntax-comment: #547485;
  --color-syntax-function: #8a6520;
  --color-thinking-bg: #e6f1f5;
  --color-thinking-border: #0d96b0;
  --color-thinking-title: #0d96b0;
  --color-thinking-text: #1a2933;
  --color-tool-bg: #e6f1f5;
  --color-tool-border: #0d96b0;
  --color-tool-name: #c48b00;
  --color-tool-status-running: #0d96b0;
  --color-tool-status-done: #239968;
  --color-tool-status-fail: #e03e3e;
}
```

### 主题5：暮光紫罗兰 Twilight Violet

```css
.theme-twilight-violet {
  --color-background: #242038;
  --color-foreground: #e0def4;
  --color-card: #2f2a48;
  --color-card-foreground: #e0def4;
  --color-popover: #2f2a48;
  --color-popover-foreground: #e0def4;
  --color-primary: #c4a7e7;
  --color-primary-foreground: #242038;
  --color-secondary: #3b345a;
  --color-secondary-foreground: #c2c0d6;
  --color-muted: #2f2a48;
  --color-muted-foreground: #908caa;
  --color-accent: #3b345a;
  --color-accent-foreground: #e0def4;
  --color-destructive: #eb6f92;
  --color-destructive-foreground: #242038;
  --color-border: #3b345a;
  --color-input: #3b345a;
  --color-ring: #c4a7e7;
  --color-sidebar: #1e1a30;
  --color-sidebar-foreground: #c2c0d6;
  --color-sidebar-accent: #2f2a48;
  --color-syntax-keyword: #c4a7e7;
  --color-syntax-string: #9ccfd8;
  --color-syntax-number: #f6c177;
  --color-syntax-comment: #908caa;
  --color-syntax-function: #ebbcba;
  --color-thinking-bg: #2f2a48;
  --color-thinking-border: #c4a7e7;
  --color-thinking-title: #9ccfd8;
  --color-thinking-text: #e0def4;
  --color-tool-bg: #2f2a48;
  --color-tool-border: #c4a7e7;
  --color-tool-name: #f6c177;
  --color-tool-status-running: #9ccfd8;
  --color-tool-status-done: #9ccfd8;
  --color-tool-status-fail: #eb6f92;
}
.theme-twilight-violet-light {
  --color-background: #f4f0f8;
  --color-foreground: #242038;
  --color-card: #e9e2f1;
  --color-card-foreground: #242038;
  --color-popover: #e9e2f1;
  --color-popover-foreground: #242038;
  --color-primary: #8c68b8;
  --color-primary-foreground: #f4f0f8;
  --color-secondary: #ddd4ea;
  --color-secondary-foreground: #726e8c;
  --color-muted: #e9e2f1;
  --color-muted-foreground: #726e8c;
  --color-accent: #ddd4ea;
  --color-accent-foreground: #242038;
  --color-destructive: #d64770;
  --color-destructive-foreground: #f4f0f8;
  --color-border: #d4c9e3;
  --color-input: #d4c9e3;
  --color-ring: #8c68b8;
  --color-sidebar: #ece6f3;
  --color-sidebar-foreground: #726e8c;
  --color-sidebar-accent: #ddd4ea;
  --color-syntax-keyword: #8c68b8;
  --color-syntax-string: #3c7c91;
  --color-syntax-number: #c28120;
  --color-syntax-comment: #726e8c;
  --color-syntax-function: #9a4a6a;
  --color-thinking-bg: #e9e2f1;
  --color-thinking-border: #8c68b8;
  --color-thinking-title: #8c68b8;
  --color-thinking-text: #242038;
  --color-tool-bg: #e9e2f1;
  --color-tool-border: #8c68b8;
  --color-tool-name: #c28120;
  --color-tool-status-running: #8c68b8;
  --color-tool-status-done: #3c7c91;
  --color-tool-status-fail: #d64770;
}
```

### 主题6：沙丘黄昏 Dune Sand

```css
.theme-dune-sand {
  --color-background: #2c2622;
  --color-foreground: #e6ddd4;
  --color-card: #39322d;
  --color-card-foreground: #e6ddd4;
  --color-popover: #39322d;
  --color-popover-foreground: #e6ddd4;
  --color-primary: #e69875;
  --color-primary-foreground: #2c2622;
  --color-secondary: #473f38;
  --color-secondary-foreground: #c8bfb6;
  --color-muted: #39322d;
  --color-muted-foreground: #a89a8e;
  --color-accent: #473f38;
  --color-accent-foreground: #e6ddd4;
  --color-destructive: #e76f51;
  --color-destructive-foreground: #2c2622;
  --color-border: #473f38;
  --color-input: #473f38;
  --color-ring: #e69875;
  --color-sidebar: #241f1c;
  --color-sidebar-foreground: #c8bfb6;
  --color-sidebar-accent: #39322d;
  --color-syntax-keyword: #e69875;
  --color-syntax-string: #8fb391;
  --color-syntax-number: #e9c46a;
  --color-syntax-comment: #a89a8e;
  --color-syntax-function: #ddb87a;
  --color-thinking-bg: #39322d;
  --color-thinking-border: #e69875;
  --color-thinking-title: #e69875;
  --color-thinking-text: #e6ddd4;
  --color-tool-bg: #39322d;
  --color-tool-border: #e69875;
  --color-tool-name: #e9c46a;
  --color-tool-status-running: #e69875;
  --color-tool-status-done: #8fb391;
  --color-tool-status-fail: #e76f51;
}
.theme-dune-sand-light {
  --color-background: #f7f2ee;
  --color-foreground: #2c2622;
  --color-card: #ede5df;
  --color-card-foreground: #2c2622;
  --color-popover: #ede5df;
  --color-popover-foreground: #2c2622;
  --color-primary: #c96c43;
  --color-primary-foreground: #f7f2ee;
  --color-secondary: #e2d9d1;
  --color-secondary-foreground: #7c7067;
  --color-muted: #ede5df;
  --color-muted-foreground: #7c7067;
  --color-accent: #e2d9d1;
  --color-accent-foreground: #2c2622;
  --color-destructive: #c94b31;
  --color-destructive-foreground: #f7f2ee;
  --color-border: #d8cfc7;
  --color-input: #d8cfc7;
  --color-ring: #c96c43;
  --color-sidebar: #f0e9e3;
  --color-sidebar-foreground: #7c7067;
  --color-sidebar-accent: #e2d9d1;
  --color-syntax-keyword: #c96c43;
  --color-syntax-string: #4c704e;
  --color-syntax-number: #b98b0e;
  --color-syntax-comment: #7c7067;
  --color-syntax-function: #8a5a20;
  --color-thinking-bg: #ede5df;
  --color-thinking-border: #c96c43;
  --color-thinking-title: #c96c43;
  --color-thinking-text: #2c2622;
  --color-tool-bg: #ede5df;
  --color-tool-border: #c96c43;
  --color-tool-name: #b98b0e;
  --color-tool-status-running: #c96c43;
  --color-tool-status-done: #4c704e;
  --color-tool-status-fail: #c94b31;
}
```

### 主题7：自定义 Custom

用户可在设置页面自定义以下颜色，存 localStorage：

```css
.theme-custom {
  /* 默认值 = Cream Mocha，用户可覆盖 */
  --color-background: var(--custom-bg, #1e1e2e);
  --color-foreground: var(--custom-fg, #cdd6f4);
  --color-card: var(--custom-card, #26273a);
  --color-card-foreground: var(--custom-fg, #cdd6f4);
  --color-popover: var(--custom-card, #26273a);
  --color-popover-foreground: var(--custom-fg, #cdd6f4);
  --color-primary: var(--custom-accent, #89b4fa);
  --color-primary-foreground: var(--custom-bg, #1e1e2e);
  --color-secondary: var(--custom-secondary, #313244);
  --color-secondary-foreground: var(--custom-fg-secondary, #a6adc8);
  --color-muted: var(--custom-card, #26273a);
  --color-muted-foreground: var(--custom-fg-muted, #6c7086);
  --color-accent: var(--custom-secondary, #313244);
  --color-accent-foreground: var(--custom-fg, #cdd6f4);
  --color-destructive: var(--custom-danger, #f38ba8);
  --color-destructive-foreground: var(--custom-bg, #1e1e2e);
  --color-border: var(--custom-border, #313244);
  --color-input: var(--custom-border, #313244);
  --color-ring: var(--custom-accent, #89b4fa);
  --color-sidebar: var(--custom-sidebar, #181825);
  --color-sidebar-foreground: var(--custom-fg-secondary, #a6adc8);
  --color-sidebar-accent: var(--custom-card, #26273a);
  --color-syntax-keyword: var(--custom-accent, #89b4fa);
  --color-syntax-string: var(--custom-success, #a6e3a1);
  --color-syntax-number: var(--custom-warning, #fab387);
  --color-syntax-comment: var(--custom-fg-muted, #6c7086);
  --color-syntax-function: var(--custom-func, #f9e2af);
  --color-thinking-bg: var(--custom-card, #26273a);
  --color-thinking-border: var(--custom-accent, #89b4fa);
  --color-thinking-title: var(--custom-accent, #89b4fa);
  --color-thinking-text: var(--custom-fg, #cdd6f4);
  --color-tool-bg: var(--custom-card, #26273a);
  --color-tool-border: var(--custom-accent, #89b4fa);
  --color-tool-name: var(--custom-warning, #fab387);
  --color-tool-status-running: var(--custom-accent, #89b4fa);
  --color-tool-status-done: var(--custom-success, #a6e3a1);
  --color-tool-status-fail: var(--custom-danger, #f38ba8);
}
```

**自定义主题可调变量（9 个核心色）**：
1. `--custom-bg` — 主背景
2. `--custom-fg` — 正文
3. `--custom-card` — 二级背景/卡片
4. `--custom-accent` — 主强调色
5. `--custom-success` — 成功绿
6. `--custom-warning` — 警告橙
7. `--custom-danger` — 错误红
8. `--custom-fg-muted` — 次要文字
9. `--custom-border` — 分割线

---

## 文件改动清单

| 文件 | 改动 |
|---|---|
| `globals.css` | 新增 13 个主题类（6暗+6浅+1自定义） |
| `src/lib/theme.ts` | ThemeId 扩展 + themes 数组 + applyTheme |
| `src/app/layout.tsx` | FOUC 脚本新增主题 |
| `src/components/command-menu.tsx` | 主题切换命令 |
| `chat-client.tsx` | 硬编码颜色→CSS变量 |
| `terminal-panel.tsx` | 终端主题色跟随 |
| `settings-client.tsx` | 自定义主题调色板 UI |
