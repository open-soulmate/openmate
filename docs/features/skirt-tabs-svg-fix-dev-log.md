# 裙摆按钮 SVG 样式修复 — 开发记录

> 开发日期：2026-09-12
> 状态：已完成
> 提交：`545576b`, `11adc79`, `d2f32bd`, `d231656`, `2722dcb`, `4e2bf1e`

---

## 问题描述

OpenFace 组件库中的 `SkirtTabs`（裙摆按钮组件）在 Tailwind v4 迁移后出现三个视觉问题：

1. **裙摆描边不可见** — 活跃标签的 SVG 路径描边完全消失
2. **下划线和分割线不跟主题** — 硬编码颜色 `#27272a` / `#333`，换主题后颜色不匹配
3. **顶部描边偏细** — SVG viewBox 从 y=0 开始，strokeWidth=1px 的描边上方0.5px被裁切
4. **延长线与裙摆有间隙** — 下划线宽度计算多减了1px

## 根因分析

### 问题1：CSS 变量名不匹配

**关键文件**：`packages/openface/src/components/skirt-tabs.tsx`

Tailwind v4 使用 `@theme` 系统定义主题变量：

```css
/* src/app/globals.css */
@theme {
  --color-border: #44475a;  /* Tailwind v4 的命名规范 */
}
```

但组件引用的是旧变量名：

```tsx
// 修复前
style={{ stroke: isActive ? 'var(--border)' : 'transparent' }}
```

`var(--border)` 在 Tailwind v4 的 CSS 中不存在（只有 `--color-border`），导致 stroke 解析为空值。

**修复**：使用带 fallback 的 CSS 变量引用：

```tsx
// 修复后
style={{ stroke: isActive ? 'var(--color-border, var(--border))' : 'transparent' }}
```

这样无论宿主应用用 `--color-border`（Tailwind v4）还是 `--border`（传统 CSS），都能正确解析。

### 问题2：硬编码颜色

默认参数使用 hex 硬编码：

```tsx
// 修复前
underlineColor = '#27272a',
dividerColor = '#333',
```

**修复**：改为 CSS 变量：

```tsx
// 修复后
underlineColor = 'var(--color-border, var(--border, #27272a))',
dividerColor = 'var(--color-border, var(--border, #333))',
```

保留 hex 作为最终 fallback，确保在没有定义 CSS 变量的环境也能工作。

### 问题3：SVG viewBox 裁切

SVG 的 stroke 在路径线两侧各延伸 `strokeWidth/2`。当路径在 y=0 处，viewBox 也从 y=0 开始时，上方的0.5px描边被裁切：

```
viewBox="... 0 ..."  →  y=0 处的描边上半部分被裁掉
```

**修复**：viewBox 向上扩展1px：

```
viewBox="... -1 ... ${height + 1}"  →  留出描边完整渲染空间
```

### 问题4：延长线间隙

下划线段宽度计算中多减了1px：

```tsx
// 修复前
width: Math.max(0, activeTabLeft - barLeft - SKIRT - 1)  // -1 造成间隙
```

**修复**：去掉多余的 `-1`：

```tsx
// 修复后
width: Math.max(0, activeTabLeft - barLeft - SKIRT)
```

## 改动文件

| 文件 | 改动 |
|------|------|
| `packages/openface/src/components/skirt-tabs.tsx` | SVG stroke 变量名、默认参数、viewBox、下划线计算 |

## 经验总结

1. **Tailwind v4 的 `@theme` 系统改变了 CSS 变量命名** — 从 `--border` 变为 `--color-border`，组件库需要兼容两种命名
2. **SVG stroke 在路径边界处会被裁切** — viewBox 需要预留 `strokeWidth/2` 的额外空间
3. **内联 style 比 JSX 属性优先级更高** — SVG 标签上有 `stroke` 属性时，`style={{ stroke }}` 不生效；必须删除属性只用 style
4. **组件库的默认值应该用 CSS 变量 + hex fallback** — 确保在不同主题系统下都能正确渲染
