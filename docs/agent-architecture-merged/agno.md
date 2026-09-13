# Agno

## 概述

Agno 是一个高性能Agent框架。

**仓库**: https://github.com/agno-agi/agno | **语言**: Python

## 核心架构

**单 Agent 主循环（`_run.py` 源码确认）**：非流式核心在 `_run`（:367），执行步骤注释（:3770-3773）自述为：
1. `handle_tool_call_updates`（:3793）处理工具更新；
2. `num_attempts = agent.retries + 1`（:3796）进入重试 `for attempt in range(num_attempts)`；
3. `raise_if_cancelled`（:3800）→ `call_model_with_fallback(agent.model, agent.fallback_config, messages, tools, tool_choice, tool_call_limit, compression_manager=...)`（:3804-3823）——模型调用内含 function calling；
4. `update_run_response` → 若有工具调用且未暂停则把工具结果回灌，再进下一轮；
5. 无工具调用时走结构化输出/followup/收尾。

即标准 ReAct：模型出 tool_calls → `handle_tool_call_updates` 执行 → 回灌 → 再问，直到模型不再要工具。`tool_call_limit`（agent.py:185）作为迭代上限传给模型调用，防止死循环。

**多 Agent / Workflow**：Team 由 leader 经 route/broadcast/tasks 协调专家 agent 并共享状态（架构清单）；Workflow 提供 Step/Parallel/Condition/Loop/Router 的**确定性**流水线（无 LLM 时也能跑）。三层原语对应 `agent/`、`team/`、`workflow/` 三个包。

**关键类/函数（源码确认）**：
- `class Agent`（agent.py:74）；`Agent.run`（:1457）/`arun`（:1564）→ `_run.run_dispatch`（_run.py:1307）。
- `call_model_with_fallback`（_run.py:3804）：带 fallback_config 的模型调用。
- `handle_tool_call_updates` / `ahandle_tool_call_updates`（_tools.py）：同步/异步工具执行。
- `handle_agent_run_paused`（_run.py:3847）：工具 `is_paused` 时暂停 run。
- `register_run` / `raise_if_cancelled`（_run.py:3788、3800）：取消追踪。

```mermaid
flowchart TD
  U[input] --> RD[run_dispatch]
  RD --> PRE[pre-hooks / 加载 session]
  PRE --> LOOP{重试 attempt 循环}
  LOOP -->|raise_if_cancelled| CM[call_model_with_fallback]
  CM --> TC{有 tool_calls?}
  TC -->|是| TU[handle_tool_call_updates 执行工具]
  TU -->|is_paused?| PA[handle_agent_run_paused 挂起等人审]
  TU --> LOOP
...

---

## 关键技术

1. **配置对象与执行内核彻底分离**：`Agent.run` 一行委托 `_run.run_dispatch`，Agent 类近 200+ 字段全是声明式配置，执行四套路径（sync/async × stream/plain）集中在 `_run.py`——替换/调试运行时不必碰 Agent 定义。
2. **模型 fallback 内建于调用**：`call_model_with_fallback(agent.model, agent.fallback_config, ...)`（_run.py:3804）把"主模型失败→备模型"做成一等参数，而非用户自己包一层 try。
3. **工具结果压缩**：`compression_manager` 在 `compress_tool_results` 时挂到模型调用上（:3814）——长工具输出自动压缩，直击 agent 上下文膨胀痛点。
4. **run 级取消追踪**：`register_run(run_id)`（:3788）+ 模型调用前后各一次 `raise_if_cancelled`（:3800、3826），长任务可随时取消。
5. **生产级原语而非玩具**：Team（leader 委派）、Workflow（DAG/循环）、Session 持久化、JWT-RBAC、OTel、Postgres——与"纯 ReAct 脚本"拉开身位。

---

## 对openmate的启示

> 仓库: https://github.com/agno-agi/agno  
> 抓取通道: cdn.jsdelivr.net/gh/agno-agi/agno@main  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 Agent run 循环 / Model 重试 / 缓存 / 工具执行 借鉴

---

| 需求 | Agno 机制 | 可复用度 |
|------|-----------|----------|
| Model 重试 | retries=0, delay=1s, 指数退避可选 | **高** |
| Guidance 重试 | temporary 消息 + 递归 | **高** |
| 不可重试码 | {400,401,403,404,413,422} | 高 |
| Context window 检测 | fast path + 防御性 patterns | 高 |
| 响应缓存 | MD5 key + TTL + 文件存储 | 高 |
| 工具确定性排序 | sort by name（prompt cache 友好） | 高 |
| 后台任务隔离 | ThreadPoolExecutor(3) | 高 |
| 临时消息清理 | temporary=True 标记 | 高 |
| 工具执行指标 | ToolCallMetrics | 中 |
| 会话恢复 | storage + memory v2 | 中 |

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（09-agno.md）
- 豆包（063_agno.md）
- MiMo报告（agno.md）
