# LangGraph 深度源码功能研究（第二阶段）

研究时间：2026-09-16（cron第29轮）
源码：github.com/langchain-ai/langgraph（41.5k stars，浅克隆于 /tmp/langgraph，commit 230927f）
仓库结构：libs/ 下 8 个子包——langgraph（核心运行时）、checkpoint、checkpoint-sqlite、checkpoint-postgres、prebuilt、cli、sdk-py、sdk-js

## 一、核心架构（读码摘要）

### 1. Pregel 超步运行时（libs/langgraph/langgraph/pregel/）
- 图执行 = **同步超步（super-step）模型**：每步并行执行所有就绪任务，写入 channels，下一步读取
- `_algo.py`（prepare_next_tasks/apply_writes）、`_loop.py`（主循环）、`_runner.py`（任务执行器）、`_retry.py` 分层明确
- 任务级执行策略：RetryPolicy / TimeoutPolicy / CachePolicy / TracePolicy 四种独立配置（types.py:418-560）
  - RetryPolicy：initial_interval=0.5s、backoff_factor=2.0、max_interval=128s、max_attempts=3、jitter、retry_on 可自定义异常类/谓词
  - TimeoutPolicy：run_timeout 硬墙钟 + `refresh_on="auto"`（回调事件自动刷新）+ `runtime.heartbeat()` 协作式续命
  - CachePolicy：key_func（默认 pickle hash 输入）+ TTL，节点级结果缓存

### 2. Channels 状态通道（channels/，9种）
状态不是 dict 直接改，而是**通道归约器**：LastValue / LastValueAfterFinish / AnyValue / EphemeralValue / UntrackedValue / Topic（pub-sub多值）/ BinaryOperatorAggregate（Annotated[list, operator.add] 自动归约）/ NamedBarrierValue（多路汇聚屏障）/ DeltaChannel（增量流）。
→ 同一图内不同 key 可有不同合并语义，并行节点写同一 list key 自动 append 合并。

### 3. 图构建 API（graph/state.py，1978行）
- add_node（支持 sync/async/Runnable，set_node_defaults 批量设 retry/cache/timeout）
- add_edge / add_conditional_edges（路由函数返回节点名或 Send 列表）/ add_sequence（链式流水线糖）
- **Send API**（types.py:704）：条件边动态扇出——`return [Send("node", custom_state) for s in ...]`，每份 state 独立，实现 map-reduce 并行；Send 还可带 per-task TimeoutPolicy
- **子图**：节点本身可以是另一张 CompiledStateGraph，流式输出带命名空间前缀自动穿透
- compile() 时校验图结构（validate：死节点/断连/环检测入口）

### 4. 检查点与时间旅行（libs/checkpoint/）
- BaseCheckpointSaver 抽象：get/ag​​et_tuple/aput/put_writes + **get_state_history（全历史快照链）+ update_state（外部改写任意快照）**
- 实现：InMemorySaver、SqliteSaver（checkpoint-sqlite）、PostgresSaver（checkpoint-postgres），另有 checkpoint-conformance 一致性测试包
- **Durability = Literal["sync","async","exit"]**（types.py:89）：检查点同步写/异步写/仅退出时写，三档耐久性可按 run 配置
- **时间旅行**：`Command(resume=..., checkpoint_id=...)` 从任意历史快照分叉重放
- 序列化：serde/ JsonPlusSerializer（msgpack+JSON，支持 pydantic/dataclass/bytes）

### 5. 人机协作 HITL（types.py:575-978）
- `interrupt(value)`：节点内任意点抛可恢复异常，value 发给客户端；恢复时 `Command(resume=answer)`，节点**从头重放**，同节点多个 interrupt 按顺序匹配 resume 值（幂等要求文档明示）
- 静态断点：compile(interrupt_before=[...], interrupt_after=[...])
- Interrupt 带 interrupt_id 支持多断点追踪

### 6. 流式输出 7 种模式（types.py:122）
values / updates / checkpoints / tasks / debug / **messages（LLM token级+元数据）** / custom（节点内 StreamWriter 任意推数据）
→ tasks 模式"任务开始/结束/结果/错误"事件，直接匹配用户"我都不知道他们在干嘛"的可观测性需求。

### 7. 长期记忆 Store（checkpoint/store/base/）
- 层级命名空间元组 `("users","user_123")` + key-value，支持前缀/后缀通配 ListNamespaces
- **可选向量检索**：IndexConfig（dims、embed 函数、text_extractor 支持 JSONPath 如 `context[*].content`）
- **TTLConfig**：过期自动清理
- batch 原子多操作；Runtime 对象把 store/context/stream_writer/heartbeat 注入节点（runtime.py:125）

### 8. 函数式 API（func/__init__.py）
- `@entrypoint` + `@task` 装饰器：不建图也能写 durable 工作流
- entrypoint 注入 config/previous/runtime；`entrypoint.final` 可返回值与持久值分离；checkpointer+store+cache 三持久化可组合

### 9. prebuilt 预构建 agent（libs/prebuilt/）
- create_react_agent（chat_agent_executor.py，1015行）：**动态模型选择**（callable(state,runtime)->Model，按上下文切便宜/贵模型）、response_format 结构化输出（JSON Schema/Pydantic/TypedDict）、**pre_model_hook / post_model_hook**（消息裁剪/摘要/护栏钩子）、interrupt_before/after、store 注入、state_schema 自定义扩展
- ToolNode：工具批并行执行 + ToolNode 级重试；tool_validator、interrupt 辅助
- 注意：create_react_agent 已标记 deprecated → 迁移到 langchain.create_agent 中间件体系

### 10. 平台 SDK（libs/sdk-py/）
- 客户端分域：assistants / threads / runs / store / **cron（SyncCronClient：create_for_thread/create/update/delete/search/count——图执行的定时调度）** / stream
- Runs 支持 **webhook 回调**（run 进度推送到外部 URL）
- **Auth 框架**（auth/__init__.py）：服务端注册 authenticate + 逐资源授权钩子（allow_thread_create/read/search、scope_store 按用户隔离 store 命名空间）
- encryption/ 客户端字段级加密

### 11. CLI（libs/cli/）
- langgraph up/build/deploy：docker 打包部署；**dependency_tracking.py 自动扫描 pyproject 依赖**；host_backend 本地 dev server（图即 API）；_draw.py 图可视化（mermaid 导出）

## 二、功能对比矩阵

| 功能 | OpenMate（前端） | OpenSoul（后端） | 差距 | 实现建议 |
|---|---|---|---|---|
| 状态图运行时（超步+channel归约） | ❌ | **完全没有**（will/engine.py 是BFS队列顺序遍历，704行） | 大 | will/ 重写为 channels+super-step；先实现 LastValue+BinaryOperatorAggregate 两通道即可跑通 |
| 条件边 | 可视化编辑器有condition字段 | 部分有（Python表达式eval_condition，但错误仅debug日志静默跳过） | 小 | 补路由函数返回多目标（现在一条件一目标） |
| Send动态扇出/map-reduce并行 | ❌ | **完全没有**（queue.pop(0)严格串行） | 大 | 加fan-out：条件路由返回list[Send]，下一超步并行 asyncio.gather |
| 检查点持久化 | ❌ | **完全没有**（engine自述"in-memory"，重启全丢，含工作流定义本身） | **致命** | 最高优先级：workflow定义落SQLite（opensoul.db已有），执行快照表逐步写 |
| 断点续跑/时间旅行 | ❌ | **完全没有** | 大 | 有检查点后顺带：get_state_history + 从快照恢复 |
| 耐久性分级 sync/async/exit | ❌ | ❌ | 中 | 随检查点实现 |
| HITL interrupt()/Command(resume) | ❌ | **完全没有**（工作流无法中途等人确认） | 大 | 审批类节点=先做静态断点（interrupt_before），再做节点内interrupt |
| RetryPolicy（退避+jitter+异常谓词） | ❌ | **完全没有**（节点失败即整个工作流FAILED，will/engine.py:~300） | 大 | 半天可抄：指数退避+retry_on，节点级配置 |
| TimeoutPolicy+heartbeat续命 | ❌ | **完全没有**（仅httpx全局60s超时） | 中 | asyncio.wait_for per节点 |
| 节点级CachePolicy | ❌ | **完全没有** | 中 | reflex/已有缓存思想，加节点输入hash→结果缓存 |
| 流式7模式（尤其tasks/messages/custom） | 部分（聊天流式展示） | 部分（api/event_stream.py 有事件流） | 中 | will执行器加tasks事件流（节点开始/结束/错误）→OpenMate workflow-execution-panel实时刷新，直击可观测性痛点 |
| 长期记忆Store（命名空间+向量+TTL） | ❌ | 部分有（hippo记忆但FTS5+LIKE，无向量无TTL无命名空间通配） | 大 | 已在mem0研究（33号）给出方案，与LangGraph Store设计互相印证：命名空间元组+IndexConfig+TTLConfig |
| 函数式durable API（@entrypoint/@task） | ❌ | ❌ | 中 | 低优先，StateGraph够用后再说 |
| 动态模型选择（按state路由模型） | ❌ | 部分有（cortex/task_planner有复杂度分析，但未接到执行层选模型） | 中 | LiteLLM研究（27号）同结论：把task_planner评分接到调用入口 |
| pre/post_model_hook中间件 | ❌ | 部分有（prompt组装散落各处，无统一钩子） | 中 | cortex/llm调用统一入口加钩子链 |
| 图执行定时调度（cron for graph） | ❌ | 部分有（api/hermes_cron.py桥接Hermes cron） | 小 | 够用，不必自建 |
| Run webhook回调 | ❌ | ❌ | 小 | 有event_stream可后补 |
| 服务端逐资源Auth钩子 | ❌ | 部分有（immune/安全层但无per-resource授权钩子、无store按用户隔离） | 中 | 对齐Composio研究（31号）connected_accounts结论 |
| 图可视化mermaid导出 | 部分有（workflow页面自绘节点） | 部分有（dag_planner.to_mermaid已有） | 小 | 已够 |
| CLI打包部署（docker+依赖追踪） | N/A | 部分有（Dockerfile+docker-compose） | 小 | 不急 |

## 三、源码亮点（值得抄的具体设计）

1. **通道即归约器**：`Annotated[list[str], operator.add]` 类型注解直接声明合并语义，免手写merge函数（channels/binop.py）
2. **Send带per-task超时**：扇出的每个子任务可独立TimeoutPolicy（types.py Send.timeout）
3. **interrupt节点头重放语义**：恢复=重放节点全部逻辑，强制interrupt调用幂等——文档直接写明"re-executing all logic"，这个设计约束值得OpenSoul照抄并在文档中明示
4. **checkpoint_conformance 独立测试包**：任何Saver实现跑同一套一致性用例——OpenSoul的workflow持久化也应有此测试
5. **Runtime注入对象**：context/store/stream_writer/heartbeat/execution_info打包成一个runtime参数显式注入节点，比全局单例干净（runtime.py:125）
6. **cancel_execution对比**：OpenSoul cancel只改status标志，`_running_tasks` dict存了Task却没在cancel里用——**正在跑的节点不会真正停下，是现存bug**；LangGraph有drain机制（request_drain优雅退出）

## 四、可复用设计（按性价比排序）

1. **【1-2天】节点级RetryPolicy+TimeoutPolicy**：will/engine.py `_execute_node_async` 外包一层重试/超时装饰，节点模型加两个可选字段。立竿见影：现在一个HTTP节点抖动就整flow报废
2. **【2-3天】工作流定义+执行快照持久化**：opensoul.db加workflows/executions/steps三张表，engine启动load、变更write-through。修掉"重启全丢"致命伤
3. **【1天】tasks事件流**：执行循环里每个节点开始/结束/失败发event，OpenMate workflow-execution-panel从轮询改订阅——用户可观测性痛点
4. **【3-5天】并行超步**：BFS queue改"就绪集"（入度为0的节点集合并行执行），结果写变量时加锁/归约——多agent协作场景吞吐提升
5. **【2-3天】静态HITL断点**：节点加`needs_approval`标志，执行到即挂起状态PENDING_INPUT，OpenMate面板出"批准/拒绝"按钮，resume继续
6. **【战略】channels归约器模型**：现有`execution.variables.update(result)`后写覆盖前写，并行化后立即出竞态——归约器是并行的前提，建议重写时一并引入LastValue+operator.add两档

## 五、与既有研究的交叉印证

- 27-LiteLLM"复杂度路由选模型" ←→ LangGraph动态模型callable(state,runtime)，两个独立实现同一模式，结论可信
- 33-mem0"记忆TTL/审计" ←→ LangGraph Store TTLConfig/命名空间，方向一致
- 本次新增独有结论：**will/引擎的检查点缺失是所有差距里唯一的致命项**（其余是能力增强，这个是正确性问题：进程重启=客户的工作流配置全部消失）
