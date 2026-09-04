# Agent 思考过程可见性 — 开发记录

> 开发日期：2026-09-03 ~ 2026-09-04
> 状态：已完成
> 提交：
>   - `feat: Agent思考过程可见性 — ThinkingBlock/ToolCallBlock组件+流式接收+折叠交互`
>   - `feat: 思考过程开关 — 💭按钮切换显隐+localStorage持久化+VSCode配色`

---

## 开发概述

实现 ACP 协议中 `agent_thought_chunk`（思考过程）和 `tool_call`（工具调用）的流式接收、存储、渲染，以及用户可控的显隐开关。

## 实现内容

### 1. 数据层
- `ThinkingBlock` 接口：`{ id, text, isComplete }`
- `ToolCallInfo` 接口：`{ toolCallId, toolName, serverName, state, args, content }`
- Message 类型扩展 `thinking?` 和 `toolCalls?` 字段

### 2. 流式接收（WebSocket handler）
- `agent_thought_chunk` → 累积思考文本
- `agent_thought` → 完整思考消息
- `tool_call` → 创建工具调用记录（state: running）
- `tool_call_update` → 更新状态/结果

### 3. UI 组件
- `ThinkingBlockComponent`：紫色左边框 + VSCode 暗色背景，折叠/展开，流式时自动展开，完成后 500ms 自动折叠
- `ToolCallBlockComponent`：蓝色左边框，🔧 图标 + 工具名 + 状态标签（⏳/✅/❌），spinner 动画

### 4. VSCode 暗色主题配色
| 元素 | 颜色 |
|------|------|
| 背景 | #1e1e1e |
| 悬停 | #2d2d2d |
| 边框 | #3c3c3c |
| 思考标题 | #569cd6（蓝色） |
| 思考边框 | #c586c0（紫色） |
| 工具名 | #dcdcaa（黄色） |
| 工具边框 | #569cd6（蓝色） |
| 完成状态 | #6a9955（绿色） |
| 失败状态 | #f44747（红色） |

### 5. 思考过程开关
- 输入框旁 💭 按钮
- 激活：`text-[#c586c0]` 紫色高亮
- 未激活：灰色低调
- 状态存 `localStorage('chat-show-thinking')`，默认开启
- 关闭时隐藏 ThinkingBlock 和 ToolCallBlock

## 文件变更
- `src/app/(app)/chat/chat-client.tsx`：+323 行（类型+处理+组件+渲染+开关）

## 验证
- `tsc --noEmit`：通过
- `next build`：通过
- 全 Agent 通用：协议层面处理，不区分 Agent
