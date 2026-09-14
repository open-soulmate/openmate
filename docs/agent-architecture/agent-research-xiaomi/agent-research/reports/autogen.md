# microsoft/autogen 架构调研报告（含 ag2ai/ag2）

## 0. 元信息

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/microsoft/autogen |
| 语言 | Python（含 .NET Core 契约） |
| License | MIT（文档 CC-BY） |
| 状态 | **Maintenance Mode** — 官方推荐新项目迁移到 [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) |
| 定位一句话 | 多 Agent 会话编排框架：AgentChat（高层）+ Core（事件驱动运行时）+ Extensions（MCP/模型） |
| 分叉/关联 | **ag2ai/ag2** v1.0 协议化重写；**ag2ai/ag2-classic** 保留 `import autogen` / ConversableAgent / GroupChat |

> 对 openmate：经典「群聊/会话终止」模式仍有借鉴价值；但 **新代码不宜直接押注 AutoGen**，应吸收其 Team/Termination/State 模式，或评估 MAF / AG2。

---

## 1. 系统架构

### 1.1 分层

```
┌──────────────────────────────────────────────┐
│ AutoGen Studio（无代码 GUI，非生产）           │
├──────────────────────────────────────────────┤
│ AgentChat API（autogen-agentchat）            │
│   AssistantAgent / Team(GroupChat)            │
│   TerminationCondition / run_stream           │
├──────────────────────────────────────────────┤
│ Core API（autogen-core）                      │
│   消息传递、事件驱动 Agent、本地/分布式 Runtime │
│   TypeSubscription / Topic 广播               │
├──────────────────────────────────────────────┤
│ Extensions（autogen-ext）                     │
│   OpenAI/Azure 客户端、MCP Workbench、代码执行 │
└──────────────────────────────────────────────┘
```

包路径：`python/packages/autogen-agentchat`、`autogen-core`、`autogen-ext`、`autogen-studio`。

### 1.2 Team 运行时模型（AgentChat）

`BaseGroupChat`（`.../teams/_group_chat/_base_group_chat_manager.py` 及 `_base_group_chat.py`）：

- 每个 Team 有 `team_id`（UUID），生成：
  - `group_topic_*`：广播主题
  - `manager_topic_*`：群聊管理器
  - `participant_topic_*`：各参与者
  - `output_topic_*`：流式输出汇入 `asyncio.Queue`
- 默认内嵌 `SingleThreadedAgentRuntime(ignore_unhandled_exceptions=False)`
- Manager 职责：`handle_start` → 选说话人 → 收 `GroupChatAgentResponse` → **应用终止条件** → 下一轮

关键常量/事件：`GroupChatStart / GroupChatRequestPublish / GroupChatTermination / GroupChatPause / GroupChatResume / GroupChatReset / SerializableException`。

---

## 2. 核心机制深潜

### 2.1 Agent Teams

预置团队类型（文档/源码）：

- `RoundRobinGroupChat`：轮流发言
- `SelectorGroupChat`：按描述/LLM 选说话人
- `Swarm`：handoff 工具驱动
- `Magentic-One`：官方多 Agent 样例（浏览/代码/文件）

参与者既可以是 `ChatAgent`，也可以是嵌套 `Team`（消息会作为该 Team 的 `TaskResult.messages` 广播）。

### 2.2 工具执行

- `AssistantAgent` + tools / `workbench=McpWorkbench(...)`（README quickstart MCP 样例）
- `max_tool_iterations` 限制工具循环
- `AgentTool`：把子 Agent 包装成工具（多 Agent 编排最简路径）
- 扩展：`autogen_ext.tools.mcp`

### 2.3 终止条件（Termination）— 稳定性关键

`autogen_agentchat.conditions` 导出：

| 条件 | 用途 |
|---|---|
| `MaxMessageTermination` | 消息条数上限（防失控） |
| `TimeoutTermination` | 墙钟超时 |
| `TokenUsageTermination` | Token 预算 |
| `TextMentionTermination` | 关键词/停止词 |
| `StopMessageTermination` | 显式 Stop |
| `HandoffTermination` | Swarm 交接完成 |
| `FunctionCallTermination` | 工具调用结束 |
| `SourceMatchTermination` | 指定 Agent 发言即停 |
| `ExternalTermination` | 外部优雅停机（比 cancel 更安全） |
| `FunctionalTermination` | 自定义谓词 |
| `TextMessageTermination` | 按消息类型 |

Manager 逻辑（`_apply_termination_condition`）：

1. 对 delta 调用 `await self._termination_condition(delta)`
2. 命中则 **reset 条件 + 清零 turn** + `_signal_termination(StopMessage)` 
3. 同时检查 `max_turns`
4. 异常 → `_signal_termination_with_error(SerializableException)`

### 2.4 Nested / 多层会话

- Team 可作为 participant 嵌入外层 Team（消息工厂注册产出类型）
- Classic AG2 提供 **nested chats / sequential chats**（`ag2-classic`）
- AG2 v1.0 用 **Network + typed channels** 替代 GroupChat：
  - `conversation`：自由双边
  - `consulting`：一问一答自动关闭
  - `discussion`：N 方 round-robin
  - `workflow`：`TransitionGraph` 声明式交接（最接近旧 GroupChat）

### 2.5 状态保存与恢复

`BaseGroupChat.save_state() / load_state()`：

```python
{
  "agent_states": {
    "agent1": ...,
    "agent2": ...,
    "RoundRobinGroupChatManager": ...
  }
}
```

要点（源码注释）：

- v0.4.9+ 用 **agent name** 作 key，去掉 `team_id`，状态可跨 team/runtime 移植
- **运行中 save 可能不一致**；应在停止后调用
- `load_state` 要求未在运行中
- `pause()` / `resume()` 为 **experimental**：仅 RPC 调用各 agent 的 `on_pause`/`on_resume`，**默认 no-op**，需 Agent 自行实现恢复逻辑

### 2.6 取消与错误

- `CancellationToken`：可立即 kill，但注释警告「可能使 team 不一致」
- 推荐优雅停止：`ExternalTermination`
- Runtime 异常包装为 `SerializableException` 塞进 `GroupChatTermination`，流消费者再 raise `RuntimeError`

---

## 3. 稳定性 / 高可用设计

| 能力 | AutoGen 现状 | 风险/差距 |
|---|---|---|
| Checkpoint | 手动 `save_state/load_state` 映射 | **无自动 checkpoint 链**；无 parent 链；需应用层自己持久化 |
| Resume | load_state 后再 run | 粒度粗；运行中 save 不保证一致 |
| HITL | Studio/人工 proxy；Classic 有 human_input | AgentChat 无 LangGraph 级 interrupt 原语 |
| 优雅暂停 | pause/resume 实验性 | 默认 no-op，不可靠 |
| 错误恢复 | SerializableException + 终止信号 | 崩溃后无自动从最近步骤续跑 |
| 防失控 | 终止条件组合 + max_turns | 设计良好 |
| 取消 | CancellationToken | 强杀不一致 |
| 观测 | Studio / Bench | 生产需自建 |

**结论**：AutoGen 强在「**会话拓扑 + 终止条件**」，弱在「**持久化与崩溃续跑**」。openmate 若要借鉴，应抄终止条件组合与 Team 状态布局，**不要抄其无自动 checkpoint 的模式**。

---

## 4. AG2 对照

| | microsoft/autogen | ag2ai/ag2 v1.0 | ag2-classic |
|---|---|---|---|
| 多 Agent | GroupChat Teams | Hub + Network channels | GroupChat/swarm/nested |
| 导入 | `autogen-agentchat` | `import ag2` | `import autogen` |
| HITL | 分散 | `context.input()` + `hitl_hook` | user proxy |
| 记忆 | 有限 | KnowledgeStore + SummarizeCompact + WorkingMemoryPolicy | 对话历史 |
| 稳定性 | save_state 手动 | WAL 在 Hub（审计/回放），仍非图级 checkpoint | 弱 |

AG2 v1.0 明确：`pip install ag2` **不是** Classic 的 drop-in 升级。

---

## 5. 自我进化

- AutoGen：工具注册、MCP、Studio 原型；记忆非一等公民
- AG2：`knowledge=` 持久知识、`compact=` 历史压缩、middleware/telemetry/evaluation
- 对 openmate：AG2 的 **compaction + working memory 注入 system prompt** 模式更贴个人助手长期记忆

---

## 6. 对 openmate 的借鉴

### 可直接抄（P0）

1. **Termination 组合子**：`max_turns + Timeout + TokenBudget + External` 四件套必须有，避免 agent 循环耗尽资源。
2. **TeamState 布局**：`{agent_name: state}` 便于导出/迁移；Manager 状态与参与者状态分离。
3. **外部优雅停机**：优先「请求停止」而非 cancel 强杀。
4. **AgentTool**：子能力包装为工具，比完整嵌套 Team 更可控。

### 应避免

- 把 pause/resume 当可用特性（实验性且默认空实现）
- 运行中 save_state 当可靠 checkpoint
- 新项目直接押注 AutoGen（maintenance mode → 应看 MAF）
- Studio 当生产 UI

### 重构优先级

| 优先级 | 动作 |
|---|---|
| P0 | 终止条件层 + 优雅停机；状态导出格式统一 |
| P1 | 若需多 Agent 会话，评估 MAF 或自建轻量 Team；借鉴 AG2 HITL hook |
| P2 | 分布式 runtime / 跨语言（一般 openmate 不需要） |

---

## 7. 源码阅读笔记

关键文件：

- `python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_base_group_chat.py`
- `.../_base_group_chat_manager.py`
- `.../conditions/__init__.py`

摘录（cancel 风险）：

> "Setting the cancellation token potentially put the team in an inconsistent state... To gracefully stop the team, use `ExternalTermination` instead."

摘录（save_state 一致性）：

> "When calling save_state on a team while it is running, the state may not be consistent... recommended when the team is not running or after it is stopped."

摘录（pause 实验性）：

> "This is an experimental feature introduced in v0.4.9... By default, the agent will not do anything when called."

### 评分（1–5）

| 维度 | 分 |
|---|---|
| 工具调用策略清晰度 | 4 |
| 权限/安全边界 | 3（MCP 警告在 README） |
| 容错与会话恢复 | **2.5** |
| 上下文工程 | 3 |
| 可扩展 | 4（事件运行时） |
| 可观测与可评测 | 3.5 |
| 生产可用成熟度 | 2.5（维护模式） |
