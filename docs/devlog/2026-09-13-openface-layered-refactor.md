# openface 分层架构重构 — TopBar/BottomBar/RightPanel 统一用 openface 壳

**日期**: 2026-09-13
**提交**: abefc06
**类型**: 重构

## 背景

openmate 和 openface 各维护一套 TopBar/BottomBar/RightPanel 实现，改一处漏一处。
正确做法是分层：openface 提供纯 UI 壳（布局、滚动、动画），openmate 填业务内容到 slot。

## 改动

### TopBar（132行 → 113行）
- 改前：openmate 自己写 `<div className="flex h-12...">`，内含 scrollRef、wheel handler、三区布局
- 改后：用 openface 的 `<TopBar left={...} middle={...} right={...} />`，openmate 只填业务内容（logo、导航项、设置按钮）

### BottomBar（373行 → 300行）
- 改前：openmate 自己写 CSS wave bump、wheel scroll、auto-scroll、safe-area、nav 结构
- 改后：用 openface 的 `<BottomBar left={...} middle={...} centerButton={...} showBump />`，openmate 只填业务内容（用户菜单、导航项、语音按钮）

### RightPanel
- 改前：openmate 的 `right-panel.tsx`（无全屏按钮）
- 改后：用 openface 的 `WorkspacePanel`（含全屏按钮 + SkirtTabs）

### LeftPanel
- 已经是 openface 的 re-export，无需改动

### 其他修复
- 移除 sidebar 搜索框上方的 `Loading...` 提示（app-shell.tsx:436）
- 恢复被 evo agent 截断的 app-store.ts（158行 → 1021行）
- 恢复被 evo agent 截断的 task-choice-menu.tsx（152行 → 131行）

## 架构规则

| 它是否… | 放哪 |
| --- | --- |
| 知道"会话/agent/消息"等业务概念、要调 API、管状态 | → **openmate** 组合层 |
| 纯展示和交互原语（panel 就是容器、无业务含义） | → **openface** |
| 主题、颜色、间距 token | → **openface** |

三个实践：
1. 变体优先加在 openface（不在 openmate 里 fork）
2. openface 独立 semver 发版，openmate 锁版本
3. 主题 token 归 openface，业务样式写在组合层

## 注意事项

- evo agent 会截断大文件（app-store.ts 1021行 → 158行），需要从 git 恢复
- openface 的 BottomBar 已内置 wave bump CSS，openmate 不需要重复写
- openface 的 TopBar 已内置 wheel → horizontal scroll，openmate 不需要重复写
