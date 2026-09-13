# Letta

## 概述

Letta 是一个有状态AI Agent框架。

**仓库**: https://github.com/letta-ai/letta

## 核心架构

> **项目**: [letta-ai/letta](https://github.com/letta-ai/letta) | **Stars**: 24.6K | **License**: Apache 2.0
> **定位**: 有状态 AI Agent 平台——具有高级记忆系统，能够随时间学习和自我改进
> **前身**: MemGPT（UC Berkeley BAIR 实验室研究成果）
> **当前状态**: V1 服务器代码归档于此仓库 `archive` 分支，新代码已迁移至 `letta-ai/letta-code`

Letta 的核心理念源自 MemGPT 论文——将 LLM 视为操作系统的内核，Agent 就是运行在这个操作系统上的进程。系统采用分层记忆架构，灵感来自计算机体系结构中的虚拟内存管理：

- **核心记忆（Core Memory）** → 寄存器/L1 缓存：始终在上下文窗口内
- **对话记忆（Recall Memory）** → RAM：可搜索的历史对话
- **归档记忆（Archival Memory）** → 磁盘：长期向量存储
- **文件系统（Filesystem）** → 外部存储：Git 版本化的文件

[详见源码]

这个 `ContextWindowOverview` 精确追踪上下文窗口中每个组成部分的 token 消耗，类似于操作系统的内存使用报告。

Letta 定义了丰富的 Agent 类型枚举，每种类型对应不同的运行时行为和工具集：

[详见源码]

这种设计体现了 Letta 从单一 MemGPT 向多种 Agent 模式演进的过程。`memgpt_agent` 是经典的"心跳+工具调用"循环；`letta_v1_agent` 简化了这个循环；`react_agent` 则是标准的 ReAct 模式；`sleeptime_agent` 引入了"睡眠时间计算"——让 Agent 在空闲时进行记忆整理。

Agent 的执行循环采用双层设计，外层 `step()` 管理链式调用（chaining），内层 `inner_step()` 执行单次 LLM 交互：

[详见源码]

**关键设计**：心跳（heartbeat）机制是 MemGPT 的核心创新——当 Agent 调用工具并设置 `request_heartbeat=True` 时，外层循环会自动注入一条心跳消息，触发下一轮 LLM 调用，实现多步工具链式执行。

`inner_step` 是 Agent 的核心执行单元，每一步都遵循严格的六步流程：

[详见源码]

Step 0 的记忆同步机制确保了多 Agent 共享 Block 时的一致性——每次执行前都从数据库重新读取最新状态。

Letta 的记忆系统基于 `Block` 概念——每个 Block 是一个带标签、描述和大小限制的文本块，Agent 可以通过工具主动编辑这些 Block：

[详见源码]

记忆更新采用"脏检查"模式——对比新旧 Memory 的 `compile()` 输出，只在有变化时才写入数据库：

[详见源码]

---

## 关键技术

Letta 定义了丰富的 Agent 类型枚举，每种类型对应不同的运行时行为和工具集：

[详见源码]

这种设计体现了 Letta 从单一 MemGPT 向多种 Agent 模式演进的过程。`memgpt_agent` 是经典的"心跳+工具调用"循环；`letta_v1_agent` 简化了这个循环；`react_agent` 则是标准的 ReAct 模式；`sleeptime_agent` 引入了"睡眠时间计算"——让 Agent 在空闲时进行记忆整理。

Letta 的记忆系统基于 `Block` 概念——每个 Block 是一个带标签、描述和大小限制的文本块，Agent 可以通过工具主动编辑这些 Block：

[详见源码]

记忆更新采用"脏检查"模式——对比新旧 Memory 的 `compile()` 输出，只在有变化时才写入数据库：

[详见源码]

工具执行通过 `ToolExecutionSandbox` 实现沙箱隔离，支持 Composio 集成和 MCP 工具：

[详见源码]

工具调用结果通过 `ToolExecutionResult` 返回，包含状态、标准输出和标准错误：

[详见源码]

Letta 引入了 `ToolRulesSolver` 来约束 Agent 的工具调用序列，这是传统 ReAct 框架不具备的能力：

[详见源码]

这允许开发者定义 Agent 的工具调用图——哪些工具必须按顺序调用、哪些是终止工具、哪些触发继续执行。

---

## 对openmate的启示

| 维度 | Letta 方案 | 可借鉴之处 |
|------|-----------|-----------|
| 记忆架构 | Block + Memory 的分层记忆 | 核心记忆始终在上下文中，历史可压缩 |
| Agent 循环 | step → inner_step 双层 | 外层管链式调用，内层管单次 LLM 交互 |
| 心跳机制 | request_heartbeat 触发自动链式执行 | Agent 自主决定是否继续执行 |
| 工具约束 | ToolRulesSolver 规则引擎 | 限制工具调用图，比 ReAct 更可控 |
| 记忆更新 | 脏检查 + DB 同步 | 只在变化时写入，支持多 Agent 共享 |
| 上下文压缩 | 摘要 + 内存压力检测 | 自动检测并压缩，避免超限 |
| 错误处理 | 三级错误 + 重试 + 心跳恢复 | Agent 可以自我修复错误 |
| 类型体系 | 9 种 Agent 类型 | 不同场景用不同类型 |
| 睡眠计算 | sleeptime_agent | 空闲时记忆整理 |
| 多 Agent | Group + Identity + 工具 | 原生多 Agent 协作支持 |

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（10-letta.md）
