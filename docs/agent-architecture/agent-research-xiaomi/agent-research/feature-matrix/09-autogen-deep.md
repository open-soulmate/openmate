# AutoGen 源代码深度研究

研究时间：2026-09-16 03:15
源码：github.com/microsoft/autogen（60999 stars，⚠️维护模式）

## 已读源代码文件

### 1. autogen_core/_agent_runtime.py
- AgentRuntime协议定义
- `send_message()` — 发送消息给agent并获取响应
- `publish_message()` — 发布消息给topic下所有agent
- `register_factory()` — 注册agent工厂
- `register_agent_instance()` — 注册agent实例
- `agent_save_state()` / `agent_load_state()` — 状态保存/加载
- `add_subscription()` / `remove_subscription()` — 订阅管理
- 关键设计：消息传递+发布订阅+状态管理

### 2. autogen_core/_agent.py
- Agent协议定义
- `metadata` — agent元数据
- `id` — agent ID
- `bind_id_and_runtime()` — 绑定ID和运行时
- `on_message()` — 消息处理器
- `save_state()` / `load_state()` — 状态保存/加载
- `close()` — 关闭
- 关键设计：协议接口+消息处理+状态管理

## 核心架构发现

### 1. 消息传递系统
- 点对点：send_message() → agent响应
- 发布订阅：publish_message() → topic下所有agent
- 取消令牌：CancellationToken
- 消息ID：唯一标识

### 2. Agent工厂模式
- 工厂注册：register_factory()
- 实例注册：register_agent_instance()
- 类型系统：AgentType
- 订阅管理：add_subscription()/remove_subscription()

### 3. 状态管理
- 保存：save_state() → JSON序列化
- 加载：load_state() → 反序列化
- 运行时状态：agent_save_state()/agent_load_state()

### 4. 订阅系统
- Topic：消息主题
- Subscription：订阅关系
- 路由：根据subscription路由消息

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 消息传递系统 | ❌ | ❌ | 大 | send_message/publish_message |
| Agent工厂模式 | ❌ | ❌ | 大 | register_factory/register_instance |
| 状态管理 | ❌ | ❌ | 大 | save_state/load_state |
| 订阅系统 | ❌ | ❌ | 大 | Topic+Subscription |
| 取消令牌 | ❌ | ❌ | 中 | CancellationToken |

## 可复用设计

1. **消息传递系统**：点对点+发布订阅
2. **Agent工厂模式**：工厂注册+实例注册+类型系统
3. **状态管理**：JSON序列化+保存/加载
4. **订阅系统**：Topic+Subscription+路由
5. **取消令牌**：CancellationToken取消操作
