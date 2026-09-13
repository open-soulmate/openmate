# Langroid

## 概述

Langroid 是一个多Agent编程框架。

**仓库**: https://github.com/Langroid/langroid | **语言**: Python | **License**: MIT

## 核心架构

> 仓库: https://github.com/langroid/langroid  
> 版本快照: main branch · Commits 2,525 · 近期版本 0.67.x（2026-08）  
> 星数: ~4.1k · Fork ~399  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Actor 式多 Agent Task 编排、ToolMessage、DocChatAgent、预算/终止借鉴  
> License: MIT

[详见源码]

核心概念（README + 代码结构）：

1. **Agent** = 消息变换器，默认 3 个 responder（LLM / Agent / User）
2. **Task** 包装 Agent，管理 responder 轮转与多 Agent 层级委派
3. `Task.run()` 与 Agent responder **同签名** — 这是子任务可被当作额外 responder 的关键
4. `single_round=True`：一步有效响应即结束
5. `llm_delegate=True`：LLM 接管任务推进

任务控制信号（版本演进）：
- `PASS_TO` / `SEND_TO`
- `done_sequences`：声明式事件模式终止
- `max_cost` / `max_tokens`：预算耗尽退出（`ChatDocument.metadata.status` 带原因码）
- `Task.kill()` / `Task.kill_session(session_id)`：经 Redis 存 kill 状态
- 环检测：cycle-length ≤ 10（可配）的精确循环检测
- `@"name"` 寻址：实体按名寻址（llm/user/agent/子任务名）

**ToolMessage（Pydantic）**：
```python
class ProbeTool(lr.agent.ToolMessage):
    request: str = "probe"          # 映射到 agent 方法名
    purpose: str = "..."            # 注入 LLM 的使用说明
    number: int
```

关键机制：
- 同一开发者接口同时支持 OpenAI function-calling 与原生 tools（`use_tools` / `use_functions_api`）
- **LLM 幻觉出畸形 JSON → Pydantic 校验错误回传 LLM 自修复**（生产级细节）
- few-shot examples：`(description, tool_instance)` 元组列表，**全部**用作 few-shot（非随机抽一）
- `_handler` 覆盖默认 handler 方法名
- XML-based tools（0.17+）
- **RewindTool**：回退并重做过去消息，lineage 清理依赖消息
- **MCP adapter**：MCP server tools → ToolMessage；支持多 server **namespacing**（0.66）
- **TaskTool**（0.56）：agent 可 spawn 带特定工具/配置的子 agent

## 关键技术

Langroid 的架构设计灵感来源于 **Actor 模型**（Actor Framework），这是其区别于 LangChain、CrewAI 等框架的根本差异。在 Langroid 中：

- **Agent** 是独立的计算单元，拥有自己的 LLM、向量存储和工具集
- **Task** 是 Agent 的执行容器，负责驱动 Agent 的消息循环
- **消息传递** 是 Agent 间协作的唯一方式——Agent 之间不共享状态，只通过 `ChatDocument` 交换消息

这种设计使得多 Agent 系统天然具备并发能力、解耦特性和可测试性。每个 Agent 都是一个独立的"演员"，通过消息协议协调完成复杂任务。

Langroid 的工具系统是其最具特色的设计之一。与传统框架将工具定义为"函数+描述"不同，Langroid 使用 **Pydantic 模型** 定义工具：

```python
class SquareTool(lr.ToolMessage):
    request = "square"       # 工具名，映射到 Agent 的 agent_square() 方法
    purpose = "to compute the square of a number"
    number: int              # 参数字段

    def handle(self) -> str:
        return str(self.number ** 2)
```

关键设计点：
- **`ToolMessage` 继承自 Pydantic BaseModel**，天然获得类型验证、JSON Schema 生成、序列化/反序列化能力
- **`request` 字段** 自动映射到 Agent 的 `handle_()` 或 `agent_()` 方法
- **`llm_function_schema()`** 自动生成 OpenAI 兼容的 Function/Tool Schema，包括参数描述（从 docstring 提取）、required 字段、嵌套对象等
- **`format_instructions()`** 为非 OpenAI LLM 生成文本格式的工具使用说明
- **`examples()` 类方法** 支持 few-shot 示例，帮助 LLM 理解工具用法
- **`_strict` 标志** 控制是否强制 OpenAI 的 strict schema 模式
- **XML 工具支持**：`XMLToolMessage` 子类支持 XML 格式的工具调用，兼容不支持 JSON 的 LLM

这种"模型即工具"的设计让工具定义兼具类型安全、自文档化和多格式兼容三大优势。

Langroid 的多 Agent 协作通过精心设计的消息协议实现：

**`ChatDocument`** 是消息传递的载体，包含：
- `content`：消息文本内容
- `metadata`：发送者（`sender`）、接收者（`recipient`）、状态码（`StatusCode`）、工具调用信息等
- `tool_messages`：结构化的工具消息列表
- `files`：文件附件

**协作模式**：

1. **串行链式**：Agent A 的输出作为 Agent B 的输入（通过 `add_sub_task`）
2. **并行扇出**：多个子 Task 同时处理同一输入，结果汇总
3. **消息路由**：通过 `SEND_TO` 或 `RecipientTool` 将消息定向发送给特定 Agent
4. **人类参与**：`Entity.USER` 作为特殊的 Responder，在需要时插入人类反馈

**Orchestration 工具**（`agent/tools/orchestration.py`）：
- `DoneTool`：标记任务完成
- `PassTool`：跳过当前 Responder
- `SendTool`：定向发送消息
- `ForwardTool`：转发消息
- `AgentDoneTool`：Agent 级别的完成信号
- `FinalResultTool`：携带最终结果的完成信号
- `TaskTool`：动态委托子任务

---

## 对openmate的启示

> 研究目的: 为 openmate 提供 Actor 式多 Agent Task 编排、ToolMessage、DocChatAgent、预算/终止借鉴

> 对 openmate：Langroid 的 **Task 包装 Agent + 层级委派**、**Pydantic ToolMessage（坏 JSON 回传修复）**、**max_cost/max_tokens 预算**、**kill session** 对个人助手稳定性与工具协议极有参考价值。

- 无 OpenClaw 式 writer claim

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（70-langroid.md）
- MiMo报告（langroid-l1.md）
- MiMo卡片（langroid.md）
