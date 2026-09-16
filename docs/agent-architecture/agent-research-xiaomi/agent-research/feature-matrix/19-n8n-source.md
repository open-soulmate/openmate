# n8n 功能研究（#19, 80k★, TypeScript, workflow-platform）

研究方式：`git clone --depth 1` → ~/agent-research-src/n8n（358MB，pnpm monorepo）
重点包：packages/{workflow,core,cli}，cli/src/{scaling,evaluation.ee,deduplication,eventbus,concurrency}

n8n 不是"聊天agent"而是**生产级工作流自动化运行时**。它对 OpenSoul 最大价值在
**执行运行时的成熟度**（队列水平扩展、部分重跑、去重、评估、审计总线），这些是
OpenSoul will/ 引擎最薄弱的层。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **Evaluation Test-Runs**：数据集(collection)驱动的批量测试运行，多指标聚合，冻结配置快照 | ❌ 无 | 🟡 benchmark/evaluator 有5维自评，无数据集/批量/test-run | 完全没有 | P0。会话质量靠人工看，无法回归测试。建 dataset 表 + test_run 表 + 批量回放引擎 |
| 2 | **LLM-as-Judge**：llm-judge-provider-registry，用 LLM 给每次运行打分，provider 可插拔 | ❌ | ❌ 无 llm_judge | 完全没有 | P0。evaluator 现为规则打分，接 gland LLM 做裁判，直击"不进化"痛点的度量闭环 |
| 3 | **Metric Scales 归一化**：metric-scales 把不同量纲指标归一到统一分值，用**冻结快照**的 scale 而非当前配置 | ❌ | ❌ | 完全没有 | 中。防止历史分数被当前配置改动扭曲，20行 |
| 4 | **部分执行重跑**：partial-execution-utils/ 从图中任一节点起重跑（find-start-nodes/find-subgraph/recreate-stack/rewire-graph/handle-cycles） | ❌ | ❌ 无 partial/rerun | 完全没有 | P0。调试长工作流必备，"改一处只重跑一处"（呼应 claude-code resumeFromRunId） |
| 5 | **数据去重**：DeduplicationHelper，按 mode(latestIncrementalKey/latestDate) + contentHash 丢弃重复触发项，多 scope | ❌ | 🟡 仅记忆合并去重 + timeline event_id，**非工作流项级去重** | 完全没有 | 中。webhook/轮询重复投递是真实问题，vein 已有内容寻址存储可复用 |
| 6 | **Durable Poll Cursor**：poll-cursor-hooks 用 staging scope 提交游标，轮询去重可跨重启持久 | ❌ | ❌ 无 durable cursor | 完全没有 | 中。OpenSoul 无轮询触发器，先有 poll 再谈 |
| 7 | **外部密钥提供器**：external-secrets-proxy，密钥外置(Vault/AWS/GCP)统一 getSecret/hasProvider | ❌ | ❌ 无 external_secret | 完全没有 | 中。政企合规需要，OpenSoul 现密钥散落配置 |
| 8 | **SSH 隧道管理器**：ssh-clients-manager 池化 SSH 连接 + 空闲超时 + 指纹缓存 | ❌ | 🟡 仅 soma_discovery 提及 ssh | 完全没有 | 低。特定场景 |
| 9 | **队列水平扩展**：scaling/ — Redis 队列 + job-processor + **leader-election-client** + multi-main-setup + worker-pools + pubsub + redis-lock | ❌ | ❌ 无 leader_election/pubsub/queue | 完全没有 | P1。单机 OpenSoul 暂不必须，但这是"能不能上生产"的分水岭 |
| 10 | **消息事件总线**：eventbus/message-event-bus + writer，审计/日志可靠投递与重放 | ❌ | ❌（仅响应里一个 event_bus:true 假标志） | 完全没有 | P1。trajectory/ 已有事件轨迹，升级为可靠总线 |
| 11 | **Context Establishment Hooks**：@ContextEstablishmentHook 装饰器自动发现，从触发项构建执行上下文(global/subExecution 两类) | ❌ | ❌ 无 context_hook | 完全没有 | 中。与 CrewAI 四点 Hook、OpenHands Hook 同族，OpenSoul 需统一 Hook 层 |
| 12 | **Eval LLM Mock**：eval-mock-helpers 用一次性 RSA key + 占位符脱敏，让 HTTP 请求被 LLM 拦截生成模拟响应做离线评估 | ❌ | ❌ | 完全没有 | 中。评估不打真 API 省钱，SECRET/CONFIG name 正则可直接抄 |
| 13 | **Data Tables**：工作流内可查询/写入的结构化数据表（节点级数据存储） | ❌ | ❌ 无 data_table | 完全没有 | 中。OpenSoul 有 SQLite，可作工作流中间态存储 |
| 14 | **表达式沙箱**：expression-sandboxing + expression-evaluator-proxy + jmespath-query，安全求值用户表达式 | ❌ | ❌ | 完全没有 | P1。工作流参数动态求值需防注入，直击安全痛点 |
| 15 | **Concurrency Control**：concurrency/ 并发控制服务，按额度限流执行 | ❌ | 🟡 immune/rate_limiter 有滑窗限流(用户级) | 部分有 | 升级为"执行级并发额度" |
| 16 | **Auth 脱敏**：auth-redaction + credential-domain-restrictions，凭证按域限制 + 日志脱敏 | ❌ | 🟡 immune 有审计但无凭证域级限制 | 部分有 | 中。呼应 claude-code JWT claim 级脱敏 |
| 17 | **NoOp Poll Job Manager**：空对象模式，durable path 关闭时绑定，调用方靠 isinstance 判断而非重推导 | ✅ 设计模式 | — | 可复用 | 抄设计：让"特性未启用"成为一等类 |
| 18 | **@n8n/nodes-langchain AI Agent 节点**：把 agent 作为工作流节点，工具/记忆/LLM 组合 | ❌ | 🟡 will/ 有 AGENT/ORGAN 动作类型 | 部分有 | 中。已有雏形，缺工具动态绑定 |

## 源码亮点

- **eval-mock-helpers 的 SECRET/CONFIG 名称正则**（`/key|secret|token|password|credential|auth|connectionString|apiToken|accessCode/i`）：把凭证属性分成"必须脱敏的密钥"vs"可保留的配置(url/host/region)"，密钥→`<api-key>`占位符喂给 LLM。**安全默认**：分不清就当密钥。可直接抄到 OpenSoul 凭证层。
- **一次性 RSA key 生成**（每进程生成而非硬编码）：注释记载"静态 PEM 腐化成不可解析 key 导致所有 service-account 节点在拦截前就崩"。工程教训可抄。
- **metric-scales 用冻结快照**：每次 test-run 把当时的 eval 配置快照存下，后续归一化用快照 scale 而非当前配置——防止"改了配置导致历史分数含义漂移"。**可复用到任何带阈值的评估系统**。
- **partial-execution 的图算法**：把"从节点 N 重跑"拆成 10 个纯函数（find-trigger / find-subgraph / get-incoming-data / get-source-data-groups / handle-cycles / rewire-graph / recreate-stack）。循环处理单独成文件。这套算法可整体移植到 will/dag_planner。
- **ExecutionContextHookRegistry 用装饰器 + DI 自动发现**：`@ContextEstablishmentHook` 标记的类自动注册，区分 global / subExecution 两类，`init()` 可重复调用重载。OpenSoul 缺统一 Hook 注册中心。

## 可复用设计

1. **部分重跑图算法**（10 个纯函数）→ 直接移植 will/，让 OpenSoul 工作流支持"改一处重跑一处"
2. **SECRET/CONFIG 名称正则 + 占位符脱敏** → OpenSoul 凭证/日志层
3. **Metric Scale 冻结快照归一化** → 任何评估系统防漂移
4. **NoOp 空对象模式**（特性开关降级为类选择）→ 让"未启用"显式化
5. **Evaluation Test-Run 三表模型**（dataset / test_run / test_case_execution）→ OpenSoul 补回归测试能力的骨架

## OpenSoul 现状确认（grep）
- will/{dag_planner,engine,models,proactive}：基础 DAG 引擎（trigger/action/condition/delay/parallel/merge + cron/event/webhook），**有骨架无运行时成熟度**
- benchmark/evaluator.py：5 维自评（accuracy/efficiency/completeness/safety/helpfulness），**规则打分非 LLM 裁判、无数据集批量**
- 无 llm_judge / dataset / test_run / partial / rerun / dedup(项级) / durable cursor / external_secret / tunnel / leader_election / pubsub / context_hook / data_table / 表达式沙箱
