# CrewAI

## 概述

CrewAI 是一个多Agent协作框架。

**仓库**: https://github.com/crewAIInc/crewAI | **Stars**: 58,000+ | **语言**: Python | **License**: MIT

## 核心架构

> 基于 crewAIInc/crewAI 源码（2025年最新版本），10维度深度剖析
> GitHub: https://github.com/crewAIInc/crewAI | Stars: 58,000+ | License: MIT

CrewAI 是一个**角色扮演式多Agent协作框架**，核心设计理念是将AI Agent组织成"船员"(Crew)来协作完成复杂任务。架构分为两大范式：

- **Crews（自主协作）**：基于角色的Agent团队，优化自主性和协作智能
- **Flows（事件驱动控制）**：事件驱动的工作流，提供精确的流程控制

源码目录结构（`lib/crewai/src/crewai/`）：

[详见源码]

[详见源码]

Guardrail 在任务执行后验证输出，签名必须为 `(TaskOutput) -> Tuple[bool, Any]`，第一个元素表示是否通过，第二个是修正后的输出。

[详见源码]

**三种执行模式**：
- **sequential**：任务按顺序依次执行，前一个任务的输出可作为后一个的上下文
- **hierarchical**：由manager_agent（经理Agent）动态分配任务给下属Agent
- **consensual**（TODO）：计划中的共识模式

[详见源码]

[详见源码]

**工具类型注册表**（支持检查点反序列化）：

[详见源码]

[详见源码]

**设计要点**：
- 支持 function calling 和纯文本两种路径
- 自动重试机制（最多 `max_attempts` 次）
- 部分JSON解析容错（`handle_partial_json`）
- 同步/异步双版本（`to_pydantic` / `ato_pydantic`）

[详见源码]

**复合评分公式**：
[详见源码]

**事件类型覆盖**：
- Crew事件：`CrewKickoffStartedEvent`、`CrewKickoffCompletedEvent`、`CrewKickoffFailedEvent`
- Task事件：`TaskStartedEvent`、`TaskCompletedEvent`、`TaskFailedEvent`
- Agent事件：`LiteAgentExecutionStartedEvent`、`LiteAgentExecutionCompletedEvent`
- Memory事件：`MemorySaveStartedEvent`、`MemoryQueryCompletedEvent`
- LLM事件：`LLMStreamChunkEvent`

**关键特性**：
- 单例模式 + 双重检查锁定
- 同步Handler在ThreadPoolExecutor（max_workers=10）中执行
- 异步Handler在专用事件循环（守护线程）中执行
- 支持Handler依赖关系（`Depends`）和执行计划缓存
- 支持事件回放（replay）机制

| 维度 | CrewAI的选择 | 对比LangGraph |
|------|-------------|--------------|
| **抽象层级** | 高层抽象（Crew/Agent/Task） | 底层图编程 |
| **Agent定义** | 角色扮演（role/goal/backstory） | 节点+函数 |
| **流程控制** | 枚举模式（sequential/hierarchical） | 自定义图 |
| **状态管理** | Pydantic模型 + 检查点 | TypedDict + Reducer |
| **工具系统** | BaseTool + 类型注册表 | @tool装饰器 |
| **输出验证** | Guardrail + Converter | 无内建 |
| **记忆** | 统一Memory（LanceDB/ChromaDB） | 外部集成 |
| **事件系统** | 内建EventBus | 外部集成 |
| **协议支持** | MCP + A2A | MCP |
| **学习曲线** | 低（声明式） | 中（编程式） |

## 关键技术

1. **建队期强校验（源码确认）**：把编排错误（缺 manager、尾任务多异步、上下文引用未来 task、首任务是条件任务）在建队时用 pydantic validator 拦下，而非运行时才爆。
2. **Checkpoint 断点续跑（源码确认）**：`Crew.from_checkpoint(path, provider=JsonProvider())` + `RuntimeState.from_checkpoint`，`_restore_runtime()` 重建 agent_executor、`_resuming=True`、`_restore_event_scope()` 恢复事件栈与 emission counter——可从上次完成的 task 续跑。
3. **统一事件总线 + OTel 追踪（源码确认）**：`crewai_event_bus` 派发 `CrewKickoffCompleted/Failed`、`TaskStarted` 等事件，`TraceCollectionListener` 收集 trace。
4. **限速 + 缓存**：`RPMController(max_rpm)` 控制每分钟 LLM 请求；`CacheHandler` 复用工具结果。
5. **自举独立**：README 强调"built from scratch, independent of LangChain"，轻量高性能。

- **配置/编排校验（源码确认）**：见第 3 节一整套 `@model_validator`；`check_config` 要求至少 agents+tasks 或 config。
- **崩溃恢复（源码确认）**：`from_checkpoint` / `RuntimeState.from_checkpoint` / `_restore_runtime` / `_restore_event_scope`——把 crew 序列化到 JSON，重启后从最后完成的 task 续跑，并正确重建运行期对象与事件作用域。`checkpoint: CheckpointConfig` 字段控制自动 checkpoint。
- **降级容错（源码确认）**：知识源初始化失败 `except Exception: self._logger.log("warning", ...)` 不中断建队。
- **安全/身份（源码确认）**：`Fingerprint`/`SecurityConfig`；`_deny_user_set_id` 禁止用户手动设置 crew id。
- **边界**：异步任务拓扑约束（尾端≤1、条件任务不可 async、上下文不能引用未来任务）从语法层防死锁/乱序。
- **回调**：`before_kickoff_callbacks`/`after_kickoff_callbacks`/`task_callback`/`step_callback` 提供钩子点。

- **并发与调度（源码确认）**：`run_for_each_async` 支持异步任务并发；`validate_end_with_at_most_one_async_task` 等规则控制并发拓扑；`concurrent.futures.Future` 在 crew.py 顶部引入。
- **限流（源码确认）**：`RPMController(max_rpm)` 注入每个 agent（`agent.set_rpm_controller`），避免冲爆 LLM 配额——背压式保护。
- **缓存降载（源码确认）**：`CacheHandler` 命中即不重复调工具，降低成本与 QPS。
- **可观测性（源码确认）**：OpenTelemetry `_execution_span`、`attach/detach(baggage)`、`TraceCollectionListener`、`usage_metrics/token_usage` 指标；`execution_logs` 记录任务级日志。
- **扩展点**：事件总线 decouple 执行与观测，便于接外部控制面（Crew Control Plane）。

- **评估回路（源码确认）**：`CrewEvaluator`/`TaskEvaluator`（`utilities/evaluators/`）对 crew/task 输出打分；事件含 `CrewTestCompleted/Failed`、`CrewTrainCompleted/Failed`。
- **训练/数据沉淀（源码确认）**：`CrewTrainingHandler` + `TRAINING_DATA_FIL

## 对openmate的启示

CrewAI的 `Crew + Task + Agent` 三层模型比LangGraph的图模型更适合**协作型Agent场景**，但灵活性较低。对于OpenMate而言：
- 可借鉴其 **角色扮演机制**（role/goal/backstory）增强Agent个性化
- 可参考其 **Guardrail系统** 实现输出质量保障
- 可学习其 **检查点/恢复机制** 支持长时间任务
- 其 **注解系统**（@agent/@task/@crew）提供了优秀的开发者体验

*文档生成时间：2025-09-13 | 基于 crewAIInc/crewAI 源码分析*

- **P0**: 评估其架构模式对openmate核心框架的参考价值
- **P1**: 研究其API设计和扩展机制
- **P2**: 关注其社区生态和集成方案

## 参考来源

- 我们（03-crewai.md）
- 豆包（044_crewAI.md）
- MiMo报告（crewai.md）
