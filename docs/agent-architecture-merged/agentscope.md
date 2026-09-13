# AgentScope

## 概述

AgentScope 是一个多Agent仿真框架。

**仓库**: https://github.com/agentscope-ai/agentscope | **Stars**: 23k | **语言**: Python | **License**: Apache-2.0

## 核心架构

> GitHub: [agentscope-ai/agentscope](https://github.com/agentscope-ai/agentscope) | Stars: 23k+ | License: Apache-2.0
> 核心理念："Build and run agents you can see, understand and trust."

AgentScope 2.0 定位为 **production-ready、easy-to-use** 的 Agent 框架，其设计哲学与其他框架有本质区别：

- **不约束模型**：不靠严格的 prompt 模板和固定的编排逻辑来限制 LLM，而是充分利用模型自身的推理和工具调用能力
- **极简抽象**：只提供必要的抽象层（essential abstractions），随着模型能力提升不断简化
- **面向 Agentic LLM**：从 v1 的多智能体对话编排，转向 v2 的单 Agent 深度能力构建（ReAct、规划、记忆、RL 训练）

这与 LangChain 的"链式管道"、AutoGen 的"对话驱动"形成鲜明对比——AgentScope 2.0 更接近 **Claude Code / Codex 的工具型 Agent** 范式。

AgentScope 采用三层架构：

[详见源码]

**SDK 层** 是核心，提供 Agent 的构建积木；**Service 层** 是开箱即用的应用后端；**Infrastructure 层** 提供沙箱执行、可观测性、协议集成等底层能力。

这是 AgentScope 2.0 最精巧的设计之一，采用 **双轨制**：

`Toolkit` 是 AgentScope 工具管理的核心，支持三层工具来源：

[详见源码]
src/agentscope/
├── agent/          # Agent 核心（ReAct、User、A2A、Realtime）
├── message/        # Msg、Block（Text/Data/Thinking/ToolCall/Hint）
├── event/          # 30+ 事件类型（流式输出）
├── pipeline/       # 流水线编排（sequential、goal-driven）
├── tool/           # Toolkit、ToolGroup、内置工具、适配器
├── mcp/            # MCP 客户端集成
├── a2a/            # A2A 协议支持
├── model/          # LLM/Embedding/TTS 模型抽象
├── memory/         # 短期/长期记忆（InMemory、ReMe、Mem0）
├── formatter/      # 消息格式化（DashScope、OpenAI 等）
├── hooks/          # 中间件钩子
├── realtime/       # 实时语音
├── tts/            # 文字转语音
├── rag/            # RAG 检索增强
├── plan/           # 任务规划
├── session/        # 会话管理
├── token/          # Token 计数
├── tune/           # RL 微调
├── tuner/          # 训练器
├── tracing/        # OpenTelemetry 追踪
├── evaluate/       # 评估框架
├── embedding/      # Embedding 模型
├── types/          # 类型定义
└── _utils/         # 工具函数
```

---

## 关键技术

1. **双层记忆抽象**：工作记忆（会话内，可换 redis/sqlalchemy）与长期记忆（mem0/reme，分 personal/task/tool）分离，接口统一。
2. **多模型统一**：dashscope/openai/anthropic/gemini 同构接入，`_model_usage` 统一用量。
3. **MCP 多态客户端**：HTTP 有/无状态、stdio 三种都覆盖，适配不同 MCP Server。
4. **Hook + 规划 + 服务化**：生产级三件套齐全，不是玩具框架。

- **会话持久化（结构确认）**：`session/_json_session.py` + `_session_base` 把会话状态落盘，支持打断/恢复（interrupt/resume）。
- **记忆后端可换（结构确认）**：工作记忆可选 redis/sqlalchemy，进程重启不丢会话上下文。
- **上下文压缩（结构确认）**：`tests/memory_compression_test.py` 覆盖工作记忆压缩，长会话可控。
- **Hook 机制（结构确认）**：`hooks/` + `types/_hook.py` 允许在调用前后插入校验/重试/日志逻辑（教程 task_hook.py 8KB）。
- **token 计数（结构确认）**：`token/_anthropic_token_counter.py` 精确计 token，防上下文溢出。
- **注**：本次 CDN 对 `_react_agent.py`(44KB) 正文返回 link dead，具体最大轮数/超时/重试参数未逐行确认。

- **异步执行（结构确认）**：`tool/_async_wrapper.py` 包装异步工具，ReActAgent 支持并行工具调用与异步执行。
- **多会话服务化（架构确认）**：FastAPI 多租户多会话，配合 redis/sqlalchemy 工作记忆，可水平扩展。
- **实时打断/恢复（架构确认）**：ReActAgent 支持实时打断与恢复，长任务可中断续跑。
- **可观测**：`tracing/` 模块 + AgentScope Studio 可视化追踪。
- **多模型冗余**：`model/` 多家 provider，可切换。

- **长期记忆是核心进化机制（结构确认）**：`_reme` 把记忆分 **personal（用户画像）/task（任务经验）/tool（工具使用经验）** 三类——这是"越用越懂你、越用越会用工具"的结构化沉淀；mem0 实现自动提取记忆。
- **Agent Skill（结构确认）**：examples/agent_skill 用 SKILL.md 标准把能力沉淀为可加载技能。
- **Hook 反馈**：Hook 可在每步后记录/调整，是反馈注入点。
- **benchmark 评估（结构确认）**：`evaluate/_benchmark_base.py` 提供自动评估基类。
- **不足**：未见自动 A/B 或在线权重调整，进化以"记忆沉淀 + 技能 + 评估基类"为主。

## 对openmate的启示

> 研究目的: 为 openmate 提供 ReAct 中间件栈、Permission/HITL、Workspace 沙箱、事件总线、多租户 Agent Service 借鉴

> 对 openmate：AgentScope 2.0 的 **Permission & HITL**、**Context compaction/offload 中间件**、**多后端 Workspace 沙箱**、**Event System 流式** 与 openmate 个人助手需求高度对齐，是 P0 级借鉴源。

**综合**：3.9 / 5 — **openmate P0 借鉴首选之一**。

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（33-agentscope.md）
- 豆包（099_agentscope.md）
- MiMo报告（agentscope-l1.md）
- MiMo卡片（agentscope.md）
