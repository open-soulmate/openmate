# MetaGPT 源代码深度研究

研究时间：2026-09-16 03:30
源码：github.com/FoundationAgents/MetaGPT（70300 stars）

## 已读源代码文件

### 1. metagpt/roles/role.py
- Role核心实现
- 继承：BaseRole, SerializationMixin, ContextMixin, BaseModel
- 属性：name, profile, goal, constraints, desc, is_human
- RoleContext：运行时上下文（env, msg_buffer, memory, working_memory, state, todo, watch）
- RoleReactMode：REACT/BY_ORDER/PLAN_AND_ACT
- think()：选择下一步动作
- act()：执行动作
- _observe()：观察新消息
- publish_message()：发布消息
- put_message()：放入消息缓冲
- 关键设计：角色+动作+状态机+消息传递

### 2. metagpt/actions/action.py
- Action核心实现
- 继承：SerializationMixin, ContextMixin, BaseModel
- 属性：name, i_context, prefix, desc, node, llm_name_or_type
- ActionNode：动作节点
- run()：执行动作
- _aask()：调用LLM
- _run_action_node()：运行动作节点
- 关键设计：动作+LLM调用+节点

### 3. metagpt/team.py
- Team核心实现
- 属性：env, investment, idea, use_mgx
- hire()：雇佣角色
- invest()：投资（预算控制）
- _check_balance()：检查余额
- run_project()：运行项目
- run()：运行N轮
- 关键设计：团队+预算+环境+轮次控制

### 4. metagpt/schema.py
- Schema定义
- SerializationMixin：序列化/反序列化
- Document/Documents：文档管理
- Message：消息（content, role, cause_by, sent_from, send_to）
- LongTermMemoryItem：长期记忆
- 关键设计：序列化+文档+消息+记忆

## 核心架构发现

### 1. 角色系统
- Role：角色（name, profile, goal, constraints）
- Action：动作（可组合）
- RoleContext：运行时上下文
- RoleReactMode：反应模式（REACT/BY_ORDER/PLAN_AND_ACT）

### 2. 消息传递系统
- Message：消息（content, cause_by, sent_from, send_to）
- publish_message()：发布消息
- put_message()：放入缓冲
- MessageQueue：消息队列
- Environment：环境（路由消息）

### 3. 团队系统
- Team：团队（roles, env, investment）
- hire()：雇佣角色
- invest()：投资（预算控制）
- run()：运行N轮
- Environment：环境（消息路由）

### 4. 序列化系统
- SerializationMixin：序列化/反序列化
- Document/Documents：文档管理
- JSON文件：存储到workspace/storage/

## OpenMate/OpenSoul差距

| 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|------|----------|----------|------|----------|
| 角色系统 | ❌ | ❌ | 大 | Role+Action+RoleContext |
| 消息传递系统 | ❌ | ❌ | 大 | Message+publish/put+MessageQueue |
| 团队系统 | ❌ | ❌ | 大 | Team+hire+invest+run |
| 序列化系统 | ❌ | ❌ | 大 | SerializationMixin+JSON存储 |
| 预算控制 | ❌ | ❌ | 中 | investment+cost_manager |

## 可复用设计

1. **角色系统**：Role(name, profile, goal, constraints)+Action+RoleContext
2. **消息传递系统**：Message+publish_message()+put_message()+MessageQueue
3. **团队系统**：Team+hire()+invest()+run()
4. **序列化系统**：SerializationMixin+JSON存储
5. **预算控制**：investment+cost_manager+NoMoneyException
