# OpenMate 开发报告

**日期**: 2026-09-15  
**提交**: `03bcf7a1`  
**分支**: main  
**改动**: 9个文件，+2494/-1020行

---

## 一、开发背景

用户反馈OpenMate聊天应用存在以下问题：
1. AI回复的Markdown格式渲染混乱，表格无法自适应窗口宽度
2. 文件面板显示"暂无文件"，无法查看会话中收发的文件
3. 文件无法预览，只能通过消息中的链接下载
4. HTML文件预览只显示代码，不渲染页面内容

---

## 二、问题定位与修复

### 2.1 Markdown渲染（表格自适应）

**问题**: AI回复的Markdown内容只渲染代码块，其他文本以纯文本显示。表格使用`white-space: nowrap`导致在移动端溢出。

**根因**: 
- `markdown-content.tsx`只解析代码块，其余内容用`<span className="whitespace-pre-wrap">`包裹
- `.markdown-body thead th`设置了`white-space: nowrap`，列宽不收缩

**修复**:
```css
/* globals.css */
.markdown-body thead th {
  word-break: break-word;  /* 原: white-space: nowrap */
}
```

安装`remark-gfm`，将非代码块文本改用`ReactMarkdown`渲染：
```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

<ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown-body">
  {text}
</ReactMarkdown>
```

---

### 2.2 文件面板恢复

**问题**: 点击"文件"tab显示"暂无文件"。

**根因**: 
1. `chat-client.tsx`被evo pipeline自动提交改坏（1159行损坏版本，混入markdown代码块标记）
2. 文件提取逻辑只找`type: 'file'`的parts，但SoulMate ACP回复只返回`type: 'text'`，从不返回文件类型

**修复**:
1. 从git commit `45988e80`恢复完整的2229行版本
2. 在`fileAttachments`的`useMemo`中增加MEDIA标签扫描：
```tsx
// 扫描text parts中的MEDIA:标签
for (const p of msg.parts) {
  if (p.type === 'text' && p.text) {
    const mediaMatches = p.text.matchAll(/MEDIA:(\/[^\s\n]+)/g);
    for (const m of mediaMatches) {
      const filePath = m[1];
      const fileName = filePath.split('/').pop() || filePath;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const mimeType = ext === 'html' || ext === 'htm' ? 'text/html' 
        : ext === 'md' ? 'text/markdown' 
        : ext === 'json' ? 'application/json' : 'text/plain';
      if (!files.some(f => f.filePath === filePath)) {
        files.push({ name: fileName, filePath, mimeType, data: undefined, ... });
      }
    }
  }
}
```

---

### 2.3 文件卡片样式统一

**问题**: 消息视图和文件视图的文件卡片样式不一致，文件视图缺少时间戳和功能按钮。

**修复**: 统一为三段式卡片结构：
```
┌─────────────────────────┐
│ 路径/日期（灰色条）      │  ← border-b bg-muted/20
├─────────────────────────┤
│ 📎 文件名               │  ← 文件图标 + 名称
│    mime-type            │
├─────────────────────────┤
│ 👁 预览  ⬇ 下载  📋 复制 │  ← border-t bg-muted/20
└─────────────────────────┘
```

消息视图新增预览按钮（原来只有下载）。

---

### 2.4 跨组件文件预览（核心难点）

**问题**: 点击预览按钮，日志显示所有步骤成功（API 200、blob URL创建、store更新），但workspace面板不显示文件。

**根因**: **两套独立的状态系统互不相通**
- `chat-client.tsx`调用`store.addWorkspaceTab()` → 更新`app-store.ts`的`workspaceTabsBySession`
- `WorkspacePanel`组件（`packages/openface/`）有自己的内部`workspaceMap`状态，**完全不读外部store**
- 源码注释明确写着：`// Self-contained state — no external store dependency`

**修复方案**: 通过props桥接两套状态

1. **`app-store.ts`** — 新增`pendingFilePreview`字段：
```typescript
pendingFilePreview: { url: string; name: string; mimeType?: string } | null;
setPendingFilePreview: (file) => set({ pendingFilePreview: file }),
```

2. **`workspace-panel.tsx`** — 新增prop和处理逻辑：
```typescript
interface WorkspacePanelProps {
  pendingFilePreview?: { url: string; name: string; mimeType?: string } | null;
}

// 监听prop变化，在内部workspaceMap中打开文件
useEffect(() => {
  if (!pendingFilePreview) return;
  setWorkspaceMap(prev => {
    const current = prev[sessionId] ?? { tabs: [createTab('new-tab')], activeTabId: '' };
    const activeTab = current.tabs.find(t => t.id === current.activeTabId);
    if (activeTab && activeTab.type === 'new-tab') {
      // 更新当前new-tab为file-preview
      const updatedTabs = current.tabs.map(t =>
        t.id === activeTab.id
          ? { ...t, type: 'file-preview', filePath: pendingFilePreview.url, title: pendingFilePreview.name }
          : t
      );
      return { ...prev, [sessionId]: { ...current, tabs: updatedTabs } };
    } else {
      // 创建新tab
      const newTab = { id: `tab-${Date.now()}-ext`, type: 'file-preview', ... };
      return { ...prev, [sessionId]: { tabs: [...current.tabs, newTab], activeTabId: newTab.id } };
    }
  });
}, [pendingFilePreview, sessionId]);
```

3. **`app-shell.tsx`** — 传递prop：
```tsx
const pendingFilePreview = useAppStore((s) => s.pendingFilePreview);
<WorkspacePanel pendingFilePreview={pendingFilePreview} ... />
```

4. **所有预览按钮** — 改用新接口：
```tsx
store.setPendingFilePreview({ url: dataUrl, name: fileName, mimeType });
store.setRightPanelOpen(true);
```

---

### 2.5 HTML文件预览渲染

**问题**: HTML文件预览只显示代码，不渲染页面。

**两个独立原因**:

**原因1 — MIME类型错误**:
`markdown-content.tsx`创建blob时固定用`type: 'text/plain'`，iframe收到text/plain显示纯文本。

修复：根据扩展名设置正确MIME类型：
```typescript
const mimeType = ext === 'html' || ext === 'htm' ? 'text/html' 
  : ext === 'md' ? 'text/markdown' 
  : ext === 'json' ? 'application/json' : 'text/plain';
const blob = new Blob([bytes], { type: mimeType });
```

**原因2 — iframe sandbox阻止JS**:
`html-renderer.tsx`的iframe设置了`sandbox="allow-same-origin"`，缺少`allow-scripts`，HTML里的JavaScript全被浏览器阻止。

修复：
```tsx
// 原: sandbox="allow-same-origin"
sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
```

---

## 三、涉及文件

| 文件 | 改动 |
|------|------|
| `src/app/(app)/chat/chat-client.tsx` | 恢复完整版 + MEDIA扫描 + 文件面板 + 统一卡片 |
| `src/components/markdown-content.tsx` | ReactMarkdown渲染 + MEDIA卡片预览按钮 + MIME类型 |
| `src/stores/app-store.ts` | 新增pendingFilePreview状态 |
| `src/components/app-shell.tsx` | 传递pendingFilePreview给WorkspacePanel |
| `packages/openface/src/components/workspace-panel.tsx` | 新增pendingFilePreview prop + useEffect处理 |
| `packages/openface/.../html-renderer.tsx` | iframe sandbox加allow-scripts |
| `src/app/globals.css` | 表格响应式CSS |
| `package.json` + `pnpm-lock.yaml` | 新增remark-gfm依赖 |

---

## 四、调试过程中的关键发现

1. **evo pipeline自动提交会破坏代码** — `chat-client.tsx`被改坏成1159行（原2229行），混入markdown代码块标记。后续需关注evo pipeline的代码修改质量。

2. **两套store并存** — `app-store.ts`（zustand全局store）和`WorkspacePanel`内部`workspaceMap`（组件本地state）完全独立。这是设计决策（"Self-contained state — no external store dependency"），但导致跨组件通信需要显式props桥接。

3. **用户提供的调试日志至关重要** — 通过在预览按钮加`console.log`，用户反馈日志显示所有步骤成功但UI无变化，直接定位到状态不通的根因。

4. **iframe sandbox默认阻止脚本** — `sandbox="allow-same-origin"`不等于允许JS执行，需要显式加`allow-scripts`。

---

## 五、待办事项

- [ ] 移除`markdown-content.tsx`中的调试`console.log`（`[media-preview]`系列日志）
- [ ] evo pipeline代码质量检查（防止再次破坏chat-client.tsx）
- [ ] 文件面板下载按钮对MEDIA文件的二进制支持（当前只处理文本）
- [ ] 旧WebSocket session重连循环bug（proxy日志持续刷`Failed to receive initialize`）
- [ ] 单次发送消息创建多个WS连接的bug
