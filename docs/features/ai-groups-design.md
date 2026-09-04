# AI 群组功能设计方案 — "微信群"模式

> 核心理念：像微信群一样，多个 Agent 在同一个群里讨论、协作、完成任务

---

## 一、产品定位

**一句话**：用户创建一个群，拉多个 Agent 进群，发任务后 Agent 们自动讨论分工、执行、互相评审。

**类比**：
- 微信群 = 多人聊天
- AI 群组 = 多 Agent 协作
- 群主 = 用户
- 群成员 = 各种角色的 Agent

---

## 二、核心功能

### 2.1 群组管理

| 功能 | 描述 |
|------|------|
| 创建群组 | 群名 + 描述 + 选择 Agent 成员 |
| 添加/移除成员 | 动态管理群成员，设置角色 |
| 角色系统 | 群主(用户) + Advisor(顾问) + Executor(执行) + Verifier(审核) |
| 群组设置 | 发言规则、轮次上限、超时设置 |

### 2.2 群聊交互

| 功能 | 描述 |
|------|------|
| 群聊消息流 | 类似微信群的聊天气泡，每个 Agent 有自己的头像/颜色 |
| @提及 | 用户可以 @某个 Agent 单独提问 |
| Agent 发言 | Agent 自动参与讨论，带意图标签（认领/建议/推荐/评论/结果/评分） |
| 发言顺序 | 按角色优先级：Advisor 先建议 → Executor 认领 → Verifier 评分 |
| 消息类型 | 文本、代码块、文件引用、任务卡片 |

### 2.3 任务协作

| 功能 | 描述 |
|------|------|
| 发布任务 | 用户在群里发一条消息作为任务 |
| 讨论分工 | Agent 们自动讨论谁做什么（3-5轮） |
| 并行执行 | 多个 Executor 同时执行子任务 |
| 结果汇总 | 所有结果合并，Verifier 审核 |
| 评分反馈 | Agent 互相评分，形成能力画像 |

### 2.4 可视化工作区

| 功能 | 描述 |
|------|------|
| 任务看板 | 显示任务状态（讨论中/执行中/审核中/完成） |
| 文件收集 | Agent 产出的文件自动收集到工作区 |
| 讨论回放 | 可以回看整个讨论过程 |
| 能力雷达图 | 每个 Agent 的能力评分可视化 |

---

## 三、技术架构

```
┌─────────────────────────────────────────────┐
│                  前端 (Next.js)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 群组列表  │  │  群聊区   │  │ 工作区   │   │
│  │ (sidebar) │  │ (chat)   │  │(workspace)│   │
│  └──────────┘  └──────────┘  └──────────┘   │
│         │            │              │         │
│         └────────────┼──────────────┘         │
│                      │ WebSocket              │
├──────────────────────┼────────────────────────┤
│                 ACP Proxy (:8092)             │
│  ┌──────────────────────────────────────┐     │
│  │         GroupOrchestrator            │     │
│  │  ┌─────────┐  ┌──────────────────┐   │     │
│  │  │ 讨论引擎 │  │ 任务分发器       │   │     │
│  │  │(Discussion│  │(TaskDispatcher)  │   │     │
│  │  │ Engine)  │  │                  │   │     │
│  │  └─────────┘  └──────────────────┘   │     │
│  │  ┌─────────┐  ┌──────────────────┐   │     │
│  │  │ 评分系统 │  │ 结果合并器       │   │     │
│  │  │(Scoring) │  │(ResultMerger)    │   │     │
│  │  └─────────┘  └──────────────────┘   │     │
│  └──────────────────────────────────────┘     │
│                      │                        │
│         ┌────────────┼────────────┐           │
│         ▼            ▼            ▼           │
│    Agent A       Agent B       Agent C        │
│   (Advisor)    (Executor)    (Verifier)       │
├───────────────────────────────────────────────┤
│              OpenSoul (:8090)                  │
│         群组/成员/消息/任务 持久化              │
└───────────────────────────────────────────────┘
```

---

## 四、数据模型

### 4.1 群组 (Group)
```typescript
interface AIGroup {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  settings: {
    max_rounds: number;        // 最大讨论轮次，默认5
    timeout_seconds: number;   // 单轮超时，默认60
    auto_score: boolean;       // 是否自动评分
    discussion_mode: 'free' | 'ordered' | 'voting';  // 讨论模式
  };
  agents: AgentMember[];
  created_at: string;
}
```

### 4.2 群成员 (AgentMember)
```typescript
interface AgentMember {
  agent_id: string;
  name: string;
  role: 'advisor' | 'executor' | 'verifier' | 'moderator';
  model?: string;           // 可指定不同模型
  system_prompt?: string;   // 角色特定提示词
  capabilities: string[];   // 能力标签
  joined_at: string;
}
```

### 4.3 群消息 (GroupMessage)
```typescript
interface GroupMessage {
  id: string;
  group_id: string;
  role: 'user' | 'agent' | 'system';
  agent_id?: string;
  agent_name?: string;
  content: string;
  intent?: 'claim' | 'suggest' | 'refer' | 'comment' | 'result' | 'score' | 'question' | 'answer';
  target_agent_id?: string;  // @某人
  task_id?: string;          // 关联的任务
  metadata?: Record<string, any>;
  created_at: string;
}
```

### 4.4 群任务 (GroupTask)
```typescript
interface GroupTask {
  id: string;
  group_id: string;
  title: string;
  description: string;
  status: 'discussing' | 'assigned' | 'executing' | 'reviewing' | 'completed' | 'failed';
  assignments: {
    agent_id: string;
    subgoal: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    result?: string;
  }[];
  scores: {
    scorer_agent_id: string;
    score: number;
    reason: string;
  }[];
  round: number;
  created_at: string;
  completed_at?: string;
}
```

---

## 五、讨论流程（核心算法）

```
用户发任务
    │
    ▼
┌─────────────────────────────────┐
│  Round 1: 理解任务               │
│  - Advisor: 分析任务，提出方案    │
│  - Moderator: 拆分子任务         │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Round 2: 认领任务               │
│  - Executor A: "我认领子任务1"   │
│  - Executor B: "我认领子任务2"   │
│  - Verifier: "我负责审核"        │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Round 3-4: 执行 & 反馈         │
│  - Executor: 输出结果            │
│  - Advisor: "建议加上错误处理"   │
│  - Verifier: "代码逻辑正确"      │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Round 5: 评分 & 总结            │
│  - Verifier: 打分 (1-10)        │
│  - Moderator: 汇总最终结果       │
│  - 系统: 更新 Agent 能力画像     │
└─────────────────────────────────┘
    │
    ▼
  任务完成，结果推送给用户
```

---

## 六、前后端 API

### 6.1 群组管理 (已有 OpenSoul API)
- `GET /api/ai-groups` — 列表
- `POST /api/ai-groups` — 创建
- `GET /api/ai-groups/:id` — 详情
- `PUT /api/ai-groups/:id` — 更新
- `DELETE /api/ai-groups/:id` — 删除

### 6.2 群消息 (需要新增)
- `GET /api/ai-groups/:id/messages` — 历史消息
- `POST /api/ai-groups/:id/messages` — 发送消息（用户发任务）
- `WS /ws/group/:id` — WebSocket 实时消息

### 6.3 群任务 (需要新增)
- `GET /api/ai-groups/:id/tasks` — 任务列表
- `POST /api/ai-groups/:id/tasks` — 创建任务
- `GET /api/ai-groups/:id/tasks/:taskId` — 任务详情

### 6.4 讨论引擎 (ACP Proxy 新增)
- `POST /api/ai-groups/:id/discuss` — 启动讨论
- `POST /api/ai-groups/:id/discuss/next` — 下一轮
- `GET /api/ai-groups/:id/discuss/status` — 讨论状态

---

## 七、实施计划

### Phase 1: 群聊基础（1-2天）
- [ ] 修复群组 CRUD（确保创建/添加成员正常）
- [ ] 实现群消息 WebSocket（WS /ws/group/:id）
- [ ] 群聊 UI（消息流、@提及、Agent 头像）
- [ ] 用户发消息 → Agent 响应（单轮）

### Phase 2: 讨论引擎（2-3天）
- [ ] GroupOrchestrator 核心引擎
- [ ] 讨论流程控制（轮次、优先级、超时）
- [ ] 意图识别（认领/建议/评分等）
- [ ] 讨论 UI（轮次指示器、意图标签）

### Phase 3: 任务协作（2-3天）
- [ ] 任务拆分 & 分发
- [ ] 并行执行（多 Agent 同时工作）
- [ ] 结果合并 & 汇总
- [ ] 评分系统 & 能力画像

### Phase 4: 工作区（1-2天）
- [ ] 任务看板（状态流转）
- [ ] 文件收集（Agent 产出物）
- [ ] 讨论回放
- [ ] 能力雷达图

---

## 八、关键设计决策

1. **讨论模式**：默认 `ordered`（按角色顺序发言），可切换 `free`（自由讨论）或 `voting`（投票决策）
2. **模型选择**：每个 Agent 可以用不同模型（Advisor 用强模型，Executor 用快模型）
3. **超时处理**：单轮超时自动跳过，全局超时结束讨论
4. **消息存储**：OpenSoul 数据库持久化，支持历史回看
5. **WebSocket**：实时推送所有 Agent 发言，前端即时渲染

---

*请确认方案，我开始实现。*
