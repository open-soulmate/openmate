# Agent 思考过程可见性 — 详细设计方案

> 创建日期：2026-09-03
> 状态：待开发
> 优先级：高
> 影响范围：所有 Agent（SoulMate、Hermes、OpenClaw、OpenCode）

---

## 1. 背景与目标

### 问题
当前 OpenMate 只渲染 Agent 的最终回复文本（`agent_message_chunk` / `agent_message`），忽略了 ACP 协议中的：
- **思考过程**（`agent_thought_chunk`）— Agent 的推理链、内心独白
- **工具调用**（`tool_call` / `tool_call_update`）— Agent 调用外部工具的过程

用户无法看到 Agent "在想什么"、"调用了什么工具"，体验像一个黑盒。

### 目标
- 所有 Agent 的思考过程实时可见（流式渲染）
- 工具调用过程可见（开始 → 进度 → 结果）
- UI 美观、可折叠、不干扰主回复
- 协议层通用，不区分 Agent 类型

---

## 2. ACP 协议分析

### 2.1 session/update 消息格式

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "xxx",
    "update": {
      "role": "assistant",
      "parts": [
        {
          "type": "text",
          "text": "内容...",
          "sessionUpdate": "agent_thought_chunk"
        }
      ],
      "last": false
    }
  }
}
```

### 2.2 sessionUpdate 类型枚举

| sessionUpdate 值 | 含义 | 当前处理 | 计划处理 |
|---|---|---|---|
| `agent_message_chunk` | 最终回复流式块 | ✅ 渲染 | 保持 |
| `agent_message` | 最终回复完整消息 | ✅ 渲染 | 保持 |
| `agent_thought_chunk` | 思考过程流式块 | ❌ 忽略 | ✅ 新增渲染 |
| `agent_thought` | 思考过程完整消息 | ❌ 忽略 | ✅ 新增渲染 |
| `tool_call` | 工具调用开始 | ❌ 忽略 | ✅ 新增渲染 |
| `tool_call_update` | 工具调用进度/结果 | ❌ 忽略 | ✅ 新增渲染 |
| `user_message_chunk` | 用户消息回显 | ❌ 忽略 | 保持忽略 |

### 2.3 ContentChunk 结构

```typescript
interface ContentChunk {
  type: 'text';           // 内容类型
  text: string;           // 文本内容
  sessionUpdate: string;  // 更新类型标识
  annotations?: Record<string, unknown>;
}
```

### 2.4 ToolCall 结构

```typescript
// tool_call — 工具调用开始
{
  type: 'text',
  text: '{"name":"web_search","arguments":{"query":"..."}}',
  sessionUpdate: 'tool_call'
}

// tool_call_update — 工具调用进度/结果
{
  type: 'text',
  text: '{"name":"web_search","result":"..."}',
  sessionUpdate: 'tool_call_update'
}
```

> 注：工具调用的 text 字段是 JSON 字符串，需要 parse。

---

## 3. 数据模型设计

### 3.1 Message 类型扩展

```typescript
interface ThinkingBlock {
  id: string;           // 唯一标识
  content: string;      // 思考内容（累积）
  isStreaming: boolean; // 是否还在流式接收
}

interface ToolCallInfo {
  id: string;           // 唯一标识
  name: string;         // 工具名称
  arguments?: string;   // 调用参数（JSON）
  result?: string;      // 调用结果
  status: 'calling' | 'running' | 'done' | 'error';
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;           // 最终回复内容
  thinking?: ThinkingBlock[]; // 思考过程块（新增）
  toolCalls?: ToolCallInfo[]; // 工具调用记录（新增）
  timestamp: number;
  status: 'sending' | 'streaming' | 'done' | 'error';
  // ... 其他现有字段
}
```

### 3.2 Store 中的消息存储

消息在 `sessionMessages` Map 中存储。新增字段可选，不影响现有数据。

```typescript
// 每个 session 的消息结构不变，只是 Message 类型新增了可选字段
sessionMessages: Map<string, Message[]>
```

---

## 4. 流式接收逻辑

### 4.1 handleAgentChunk 修改

当前代码（行 575-608）只处理 `agent_message_chunk`。需要扩展：

```typescript
const handleAgentChunk = (sessionId: string, update: SessionUpdate) => {
  const sessionUpdate = update.parts?.[0]?.sessionUpdate;
  const text = update.parts?.find(p => p.type === 'text')?.text || '';

  switch (sessionUpdate) {
    // === 最终回复（现有逻辑）===
    case 'agent_message_chunk':
      // 累积到 message.content
      break;

    case 'agent_message':
      // 设置完整内容 + 标记完成
      break;

    // === 思考过程（新增）===
    case 'agent_thought_chunk':
      // 找到最后一个 thinking block（未完成的），累积内容
      // 如果没有未完成的 block，创建新的
      break;

    case 'agent_thought':
      // 创建完整的 thinking block，标记完成
      break;

    // === 工具调用（新增）===
    case 'tool_call':
      // 解析 JSON，创建新的 ToolCallInfo，status='calling'
      break;

    case 'tool_call_update':
      // 找到对应的 ToolCallInfo，更新 result/status
      break;
  }
};
```

### 4.2 思考过程的状态机

```
[开始] → thinking block 创建 (isStreaming=true)
  ↓ (收到更多 agent_thought_chunk)
内容累积
  ↓ (收到 agent_thought 或 agent_message_chunk)
thinking block 标记 isStreaming=false
  ↓
[完成]
```

### 4.3 工具调用的状态机

```
[开始] → ToolCallInfo 创建 (status='calling')
  ↓ (收到 tool_call_update)
status → 'running'，更新 result
  ↓ (收到最终结果)
status → 'done'
  ↓
[完成]
```

---

## 5. UI 设计

### 5.1 消息气泡布局

```
┌─────────────────────────────────┐
│ ▼ 💭 思考过程 (3s)              │ ← 可折叠，默认收起
│ ┌─────────────────────────────┐ │
│ │ 我需要搜索一下这个话题...    │ │ ← 半透明灰色背景
│ │ 让我分析一下用户的意图...    │ │
│ └─────────────────────────────┘ │
│                                 │
│ 🔧 web_search("OpenMate")       │ ← 工具调用标签
│    → 找到 5 条结果              │
│                                 │
│ OpenMate 是一个 AI agent 编排...│ ← 最终回复（正常样式）
│                                 │
└─────────────────────────────────┘
```

### 5.2 样式规范

**思考过程区块：**
- 背景：`bg-gray-100 dark:bg-gray-800/50`（半透明灰色）
- 边框：`border-l-2 border-purple-300 dark:border-purple-600`（左侧紫色竖线）
- 文字：`text-sm text-gray-500 dark:text-gray-400`（小号灰色）
- 折叠：默认收起，点击标题栏展开
- 流式指示：展开时显示打字光标 `▊`

**工具调用标签：**
- 背景：`bg-blue-50 dark:bg-blue-900/30`
- 图标：🔧
- 状态色：
  - calling: `text-yellow-500`（黄色，进行中）
  - running: `text-blue-500`（蓝色，运行中）
  - done: `text-green-500`（绿色，完成）
  - error: `text-red-500`（红色，失败）
- 结果折叠：默认只显示工具名+状态，点击展开完整参数和结果

### 5.3 折叠交互

- **思考过程**：默认收起（用户不想看时无干扰），点击展开
- **工具调用**：默认只显示一行摘要，点击展开详情
- **流式状态**：正在接收时自动展开，完成后 3 秒自动收起（可配置）
- **记忆**：用户手动展开/收起的状态在 session 内保持

### 5.4 动画

- 思考过程区块展开/收起：`transition-all duration-200 ease-in-out`
- 流式接收时的光标闪烁：`animate-pulse`
- 工具调用状态变化：渐变色过渡

---

## 6. 组件设计

### 6.1 新增组件

```
src/components/
  thinking-block.tsx      ← 思考过程折叠区块
  tool-call-block.tsx     ← 工具调用信息区块
  message-bubble.tsx      ← 消息气泡（改造，整合上述组件）
```

### 6.2 ThinkingBlock 组件

```tsx
interface ThinkingBlockProps {
  blocks: ThinkingBlock[];
  isStreaming: boolean;
  defaultExpanded?: boolean;
}

function ThinkingBlock({ blocks, isStreaming, defaultExpanded = false }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // 流式接收时自动展开
  useEffect(() => {
    if (isStreaming) setExpanded(true);
  }, [isStreaming]);

  const content = blocks.map(b => b.content).join('');

  return (
    <div className="thinking-block">
      <button onClick={() => setExpanded(!expanded)} className="thinking-header">
        <span>💭 {isStreaming ? '正在思考...' : '思考过程'}</span>
        <span>{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="thinking-content">
          <MarkdownRenderer content={content} />
          {isStreaming && <span className="cursor animate-pulse">▊</span>}
        </div>
      )}
    </div>
  );
}
```

### 6.3 ToolCallBlock 组件

```tsx
interface ToolCallBlockProps {
  toolCalls: ToolCallInfo[];
}

function ToolCallBlock({ toolCalls }: ToolCallBlockProps) {
  return (
    <div className="tool-calls">
      {toolCalls.map(tc => (
        <div key={tc.id} className="tool-call-item">
          <span className="tool-icon">🔧</span>
          <span className="tool-name">{tc.name}</span>
          <span className={`tool-status status-${tc.status}`}>
            {statusLabel(tc.status)}
          </span>
          {tc.result && (
            <button className="expand-btn">详情</button>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 7. 实现步骤

### Phase 1：数据层（1h）
1. 扩展 Message 类型，新增 `thinking` 和 `toolCalls` 可选字段
2. 扩展 `SessionUpdate` 类型，支持 `agent_thought_chunk` / `tool_call` 等
3. 确保类型向后兼容（可选字段，不影响现有数据）

### Phase 2：流式接收（1h）
1. 修改 `handleAgentChunk`，新增 switch 分支处理 thought 和 tool_call
2. 实现 thinking block 的累积逻辑
3. 实现 tool call 的状态更新逻辑
4. 测试：模拟发送包含 thinking 和 tool_call 的 update

### Phase 3：UI 组件（2h）
1. 创建 `ThinkingBlock` 组件
2. 创建 `ToolCallBlock` 组件
3. 改造消息渲染逻辑，整合新组件
4. 实现折叠/展开交互
5. 实现流式状态下的自动展开

### Phase 4：样式打磨（1h）
1. 暗色/亮色主题适配
2. 响应式布局（移动端折叠更紧凑）
3. 动画过渡效果
4. Markdown 渲染兼容

### Phase 5：测试验证（1h）
1. SoulMate 测试：发送复杂任务，观察 thinking 和 tool_call
2. Hermes 测试：发送需要工具调用的任务
3. 流式性能测试：长思考过程不卡顿
4. 移动端测试：折叠交互流畅

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 部分 Agent 不发 thought chunk | 功能不生效 | 优雅降级，无 thinking 时不显示区块 |
| 思考过程过长（>1000字） | UI 卡顿 | 虚拟滚动或截断 + "展开全部" |
| tool_call JSON 格式不统一 | 解析失败 | try-catch + 原始文本兜底 |
| 流式状态判断错误 | 显示异常 | 用 `last` flag + RPC 响应双重判断 |
| 移动端折叠体验差 | 用户不满 | 测试后优化，可能用 BottomSheet |

---

## 9. 后续扩展

- **思考过程导出**：支持复制/导出完整的思考链
- **性能指标**：显示思考耗时、token 数量
- **回放功能**：重放 Agent 的完整思考过程
- **多轮对比**：对比不同 Agent 对同一问题的思考方式
