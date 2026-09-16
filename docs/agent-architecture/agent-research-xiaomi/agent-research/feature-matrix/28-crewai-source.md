# CrewAI 功能研究（源码级）

更新：2026-09-16 07:45
来源：github.com/crewAIInc/crewAI（main分支，本地 ~/agent-research-src/crewai-main）
结构：monorepo — lib/crewai（主框架）、lib/crewai-core（auth/token/telemetry）、lib/crewai-tools、lib/crewai-files、lib/cli
读取文件：agent/core.py、crew.py、task.py、memory/unified_memory.py、memory/types.py、skills/loader.py、skills/registry.py、state/runtime.py、security/fingerprint.py、events/event_bus.py、hooks/{dispatch,llm_hooks,tool_hooks}.py、knowledge/knowledge.py、mcp/client.py、a2a/wrapper.py、flow/*（共约10000行）

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | 角色化Agent：role/goal/backstory + system/prompt/response 三段自定义模板 | 部分有（agents页面有角色配置） | 部分有（api/agent.py） | 缺backstory机制和三模板注入 | 在gene模板中加backstory字段，cortex推理时注入 |
| 2 | 多进程编排：sequential / hierarchical（自动创建manager agent）/ conditional task（条件跳过） | 无 | 部分有（will/dag_planner有DAG+Python条件边） | 缺hierarchical的manager自动创建和任务级条件跳过 | will/engine加hierarchical模式：LLM生成的manager选agent |
| 3 | Flow事件驱动框架：@start/@listen（精确/通配/多路OR）/@router/and_/or_ 装饰器DSL | 部分有（workflow-store用xyflow可视化编辑nodes/edges） | 部分有（will/engine执行DAG，to_mermaid可视化） | 缺装饰器DSL、router函数路由、listen通配符匹配、HTML交互式plot导出 | 把will的DAG执行升级为装饰器DSL，比声明式JSON更pythonic |
| 4 | 统一Memory：scope路径命名空间（a/b/c）+ slice视图 + tree() + remember/recall/forget/update + 批量异步embedding管线 + LLM自动提取记忆 + composite评分 | 无 | 部分有（hippo/long_term_memory+decay.py） | 缺：scope/slice命名空间、批量编码后台线程池、drain_writes、按类别统计 | hippo加scope路径（user/project/session三级）；这是Letta记忆块的工程化版本 |
| 5 | Knowledge RAG：PDF/CSV/Excel/JSON/text/docling知识源 + 可配置embedder + query() | 部分有（docs页面） | 部分有（api/knowledge.py上传/标签/搜索） | 缺Excel/docling专用解析器、per-agent知识源绑定、查询时LLM生成搜索词 | 已有基础好，补excel_knowledge_source和agent级knowledge_search_query |
| 6 | Skills系统：本地discover/activate + 远程registry下载（@org/repo@version，版本pin）+ catalog注入prompt + SkillUsedEvent遥测 | 无 | 部分有（api/marketplace.py有skill sources sync） | 缺版本pin、运行时按需激活（loader tool）、使用事件 | marketplace加version pin；agent工具列表加"load_skill"工具（CrewAI的_add_skill_loader_tool模式） |
| 7 | Hooks拦截系统：before/after LLM call、before/after tool call 四个拦截点；可中止(Abort)/改写结果/请求人工输入；全局+scoped作用域 | 无 | 无 | **完全没有**。grep before_llm/intercept无结果 | **高价值**。acp/proxy.py天然位置：LLM调用前后加dispatch，immune模块挂安全hook可中止 |
| 8 | 强类型EventBus：实体注册+事件溯源+replay模式（is_replaying）+ handler_graph + 954行事件基础设施 | 无 | 部分有（api/event_stream.py SSE广播 + nerve/event_bridge） | 缺强类型事件类体系、replay模式（重放时抑制副作用）、handler依赖图 | nerve/event_bridge升级为强类型：每个事件是pydantic类，trajectory已是事件存储天然适配 |
| 9 | Checkpoint系统：RuntimeState全量序列化 → checkpoint(location) → fork(branch) → from_checkpoint恢复继续执行 + lineage链 + checkpoint失败/完成事件 | 无 | 部分有（trajectory/store.py有fork_session+replay，但只是回放查看） | 缺"从checkpoint恢复后继续执行"（当前replay是只读的） | trajectory的fork升级为可执行fork：恢复RuntimeState继续kickoff。**时间旅行调试的关键** |
| 10 | Fingerprint：seed确定性生成UUID（agent/crew/task身份指纹），跨运行跨机器追踪同一实体 | 无 | 无 | **完全没有** | 低成本高价值：opensoul实体加fingerprint=uuid5(seed)，trajectory事件记录fingerprint |
| 11 | Guardrails：agent级+task级输出校验函数，失败自动重试(guardrail_max_retries)，校验器可序列化 | 无 | 部分有（ai_engine.py有工具路由级guardrails：size_check/result_limit/syntax_check） | 缺LLM输出校验+重试环。现有护栏是工具级，不是输出级 | cortex推理后加guardrail链：pydantic校验→失败带错误信息重试 |
| 12 | A2A深度集成：agent card并发获取、委派多轮对话(max_turns)、push notification+签名、A2UI扩展、委派失败事件 | 部分有（lib/a2a-client.ts + dev-specs页面） | 部分有（src/a2a/：api/models/task_manager） | 缺：多轮委派对话、push notification签名、agent card签名验证、委派到远程agent作为工具 | opensoul a2a/wrapper模式：把远程A2A agent包装成本地委派工具，prompt增强+多轮 |
| 13 | MCP多传输：stdio/sse/streamable-http + 工具过滤器 + 资源缓存 + native tool包装 | 有（mcp页面） | 部分有（api/mcp.py） | 缺工具过滤器(filters.py)和结果缓存 | 补filter+cache即可，基础架构已具备 |
| 14 | 执行控制：RPMController限流 + max_execution_time超时 + max_retry_limit + UsageMetrics按任务/crew聚合token成本 | 无 | 无（immune只有rate_limited审计状态，无实际控制器） | **完全没有** | acp-proxy已有超时重试，缺RPM控制器（令牌桶）和token成本聚合。运维必需 |
| 15 | 训练自优化：crew.train(n_iterations) — evaluator LLM打分→反馈→迭代优化agent配置，训练数据存JSON，运行时自动加载 | 无 | 部分有（learn/experience.py + course_engine） | 缺"evaluator反馈闭环自动改agent prompt/配置" | learn模块加train循环：任务结果→evaluator LLM→改gene模板→验证 |
| 16 | 结构化输出：output_pydantic（pydantic模型→JSON schema注入prompt→解析回对象）+ response_template + Converter | 无 | 无 | **完全没有**（无pydantic输出转换机制） | cortex输出层加structured模式，schema注入system prompt+解析容错 |
| 17 | 批量与异步：kickoff_for_each（多输入并行跑同一crew）+ kickoff_async + crew内async task + 并发任务校验规则 | 无 | 无 | **完全没有** | will/engine加batch执行模式，asyncio.gather+并发上限 |
| 18 | 工具失败策略：tool_failure_policy（失败记录ToolFailureRecord→合并→重试/降级/中止），tool_failure_collector上下文 | 无 | 无 | **完全没有** | limb工具执行层加失败收集器，immune定策略 |
| 19 | LiteAgent：轻量单agent模式（无crew开销，1068行独立实现，流式输出） | 有（chat页面） | 部分有 | 已基本对齐 | 无需行动 |

## 源码亮点

1. **monorepo分层干净**：crewai-core（auth/token/telemetry/platform）→ crewai（框架）→ crewai-tools/files（生态）→ cli。OpenSoul的器官命名类似但缺core/tools分离。
2. **Memory的工程化程度惊人**：`_submit_save`后台线程池异步写、`drain_writes()`优雅关闭、`_encode_batch`批量embedding、`remember_many`、composite_score（相关性+新近性+重要性加权）。不是概念，是生产代码。
3. **Hooks的reducer模式**：`before_tool_call_reducer(ctx, result)`返回bool决定是否abort；hook可调`ctx.request_human_input()`暂停等人。scoped_hooks用contextvars实现请求级作用域。**这是immune模块缺失的"人在环中"拦截能力**。
4. **Checkpoint的fork语义**：`Crew.fork(branch)`复制状态开新分支，`from_checkpoint`恢复继续执行，lineage链记录父子。trajectory已有fork_session，差"可继续执行"这一步。
5. **A2A wrapper把远程agent变成本地工具**：并发拉取agent cards→组装委派prompt→多轮对话→解析结构化响应→失败事件。OpenSoul的a2a只有task_manager，缺这层。
6. **Flow的listen匹配**：精确字符串、通配符(`task_*`)、OR多路(`@listen(a, b)`)、and_组合——纯装饰器，无JSON配置。
7. **Fingerprint是确定性UUID**：`uuid5(seed)`，同名agent跨机器同ID，遥测和事件溯源都挂它。157行的小模块解决大问题。

## 可复用设计（OpenSoul优先级）

### P0（1-2天可落地）
1. **Hooks拦截系统** → opensoul/acp/proxy.py加before/after_llm_call和before/after_tool_call dispatch，immune挂安全hook。约300行。
2. **Fingerprint** → 50行。所有实体（agent/crew/task/session）加uuid5指纹，事件全带指纹。
3. **RPM控制器+UsageMetrics** → 令牌桶限流+按会话token成本聚合，vital模块加。

### P1（1周）
4. **Checkpoint可执行fork** → trajectory已有fork_session，加"从fork点恢复继续执行"，配合will/engine。
5. **Guardrail输出校验重试环** → cortex输出后pydantic校验，失败带错误重试N次。
6. **Memory scope命名空间** → hippo加path scope，参考memory_scope.py。

### P2（2-4周）
7. **Flow装饰器DSL** → will/engine上层包@start/@listen/@router。
8. **结构化输出** → pydantic schema注入+解析。
9. **A2A委派wrapper** → 远程agent包装为委派工具。
10. **训练闭环** → evaluator LLM反馈自动优化gene模板。

## 与之前研究的交叉验证

- 记忆系统：CrewAI的Memory(scope/slice)是Letta记忆块（07号研究）的路径化版本——两者都指向"命名空间记忆"是行业共识。
- 事件系统：CrewAI EventBus + AutoGen AgentRuntime（09号）+ MetaGPT MessageQueue（22号）三家同构——OpenSoul的nerve/event_bridge应升级为强类型事件总线。
- Hooks：这是CrewAI独有发现，此前12个agent深读中未见同等粒度的before/after LLM+tool四点拦截。
- Checkpoint/fork：LangGraph（16号）的checkpointer和CrewAI的RuntimeState是同一思想两种实现，OpenSoul trajectory是第三种（只记录不恢复），补齐恢复能力即达行业水平。
