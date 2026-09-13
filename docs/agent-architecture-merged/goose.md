# Goose

## 概述

Goose 是一个AI编程Agent。

**仓库**: https://github.com/aaif-goose/goose | **语言**: Python

## 核心架构

> 供 openmate（混合 coding + personal agent，需稳定性重构）参考
> 调研日期：2026-09-13
> 资料来源：GitHub README（aaif-goose/goose，历史 block/goose）、goose-docs.ai 架构/Recipes/Extensions/Custom Distros、CUSTOM_DISTROS.md

**Interface（Desktop/CLI）→ Agent 循环 → Extensions（MCP tools）**；Provider 抽象多模型；**Recipes** 把 instructions/extensions/parameters/activities 打成可分享的可执行工作流；**Custom Distro** 支持白牌。

[详见源码]

- Interface 可同时开 **多个 Agent** 并行任务
- Extensions 同时挂多个；tool calling 由模型发起、goose 执行并回灌

| 路径 | 内容 |
|---|---|
| `crates/goose` | 核心 agent、providers、config、recipe、ACP server |
| `crates/goose-mcp` | 内建 MCP 扩展 |
| `crates/goose-cli` | CLI、`acp`、manpage 生成 |
| `crates/goose/src/providers/*` | Provider trait + declarative JSON providers |
| `crates/goose/src/recipe/*` | Recipe schema / template / validate / sub_recipes |
| `crates/goose/src/agents/subagent_*.rs` | Subagent / Summon delegate |
| `crates/goose/src/acp/server.rs` | ACP server |
| `crates/goose/src/prompts/system.md` | 系统提示（可品牌化） |
| `ui/desktop` | Electron 客户端、built-in/bundled extensions JSON |

两类错误：
- **Traditional**：网络/模型不可用 → `anyhow::Error` 抛给调用方  
- **Agent Errors**：未知工具名、参数错、工具执行失败 → **作为 tool response 回给 LLM**，错误文案当“提示词”让模型自愈  

`ToolUse` / `ToolResult` 均包在 `Result`；provider 负责翻译成各家 API 合法消息。

## 关键技术

1. **命令-效果分离（源码确认）**：step 只产生 `Effect`，由 `EffectHandler` 统一应用——纯计算与副作用解耦，便于测试/回放/撤销。
2. **每步从持久层重建会话（源码确认）**：`run()` 每轮 `runtime.load(session_id)`，天然支持崩溃恢复与跨进程/跨端续接。
3. **结构化取消（源码确认）**：`CancellationToken` 贯穿，`tokio::select!{biased; cancel.cancelled() => return Ok(None)}` 优先响应取消。
4. **Rust 性能与单二进制**：本地优先、跨端、无运行时依赖。
5. **工具名冲突静态拦截**：注册期即拒绝重复工具名。

- **取消控制（源码确认）**：`self.cancel.is_cancelled()` 在每个 step 前检查；`tokio::select!{biased}` 在收集工具时优先响应对取消；取消后调 `step.cancel()` 收尾。
- **崩溃恢复（源码确认）**：状态外置到 sqlite，`run()` 每步 `load(session_id)`，进程重启后从最后会话继续——天然 checkpoint。
- **错误传播（源码确认）**：`anyhow::Result` 贯穿；`step_fut.await?` 把 step 错误上抛；重复工具名是硬错误。
- **边界处理**：`conversation()` 缺失时 `anyhow!("state-machine session loaded without conversation")`；效果产出后 `effect.ensure_message_ids()` 保证消息 ID 完整。
- **可重入**：`yield_to_client` 让 Agent 在等待用户输入时干净让出。

- **并发模型**：async Rust（tokio），`tokio::select!`、`OperationFuture` 异步步骤。
- **资源管理**：工具收集用 `HashSet` 去重避免重复注册；`Emitter` 异步事件出口。
- **持久化与扩展**：sqlite + migrate 内置会话存储；API（axum）形态可作服务端。
- **可观测性（源码确认）**：`tracing`/`tracing-appender` 依赖，`Emitter` 事件流；opentelemetry 可选。
- **无分布式协调**：本地 Agent，单机模型。

- **上下文管理（源码确认）**：独立 `goose-context-management` crate——管理送入模型的上下文，做压缩/裁剪，是对"长上下文漂移"的自我维护。
- **会话累积**：每次推理结果作为 effect 落库，跨轮累积 conversation。
- **工具注册而非学习**：新能力靠注册 MCP 工具，而非在线学习。
- **无运行时权重更新**：进化=上下文管理 + 工具/扩展生态。

## 对openmate的启示

goose 是 **「通用本机 agent + 工作流产品化」** 参考：比纯 coding agent 更接近 openmate 的 personal 侧。建议 **P0 抄错误回注、context revision、recipe retry/信任边界**；**P1 抄 schedule + structured output + subagent scoping**；运行时实现语言可继续 TS，但 **Recipe 数据模型与 MCP 扩展面** 应直接对标 goose，避免自创封闭工作流格式。

---

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 豆包（047_goose.md）
- MiMo报告（goose.md）
