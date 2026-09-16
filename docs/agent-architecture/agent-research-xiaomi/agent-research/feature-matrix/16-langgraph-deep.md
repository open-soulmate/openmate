# LangGraph 源代码深度研究

研究时间：2026-09-16 03:10
源码：github.com/langchain-ai/langgraph

## 已读源代码文件

### 1. langgraph/graph/state.py
- StateGraph核心实现
- 状态图构建器：节点+边+状态schema
- 节点签名：`State -> Partial`
- Reducer函数：`(Value, Value) -> Value`
- 编译：`graph.compile()` → CompiledStateGraph
- 执行：invoke/stream/astream/ainvoke
- 关键设计：状态图+节点通信+Reducer聚合

### 2. langgraph/graph/message.py
- 消息状态管理
- `add_messages()` — 合并消息列表，按ID更新
- `MessagesState` — 消息状态TypedDict
- `REMOVE_ALL_MESSAGES` — 删除所有消息
- 格式转换：`langchain-openai`格式
- 关键设计：append-only状态+ID去重+格式转换

## 核心架构发现

### 1. 状态图模式
- 节点：读写共享状态
- 边：条件转移
- 状态：TypedDict+Reducer
- 编译：StateGraph → CompiledStateGraph

### 2. 消息管理
- append-only：默认追加
- ID去重：相同ID覆盖
- 删除：RemoveMessage
- 格式：langchain-openai格式

### 3. 检查点系统
- InMemorySaver：内存保存
- 持久化：SQLite/Redis/Postgres
- 恢复：从检查点恢复状态

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 状态图模式 | ❌ | ❌ | 大 | 节点+边+状态机 |
| Reducer聚合 | ❌ | ❌ | 大 | (Value, Value) -> Value |
| 消息ID去重 | ❌ | ❌ | 中 | append-only+ID覆盖 |
| 检查点系统 | ❌ | ❌ | 大 | 内存+持久化+恢复 |
| 格式转换 | ❌ | ❌ | 中 | langchain-openai格式 |

## 可复用设计

1. **状态图模式**：节点读写共享状态+条件边转移
2. **Reducer聚合**：`(Value, Value) -> Value` 聚合多节点更新
3. **消息ID去重**：append-only+相同ID覆盖
4. **检查点系统**：内存+持久化+恢复
5. **格式转换**：统一消息格式
