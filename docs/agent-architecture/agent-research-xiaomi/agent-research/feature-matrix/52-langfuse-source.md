# Langfuse 功能研究（#52, LLM可观测性平台, TS Next.js + worker + Rust native）

研究方式：`git clone --depth 1` → ~/agent-research-src/langfuse（78MB）
重点：packages/shared/src/{domain,server/queues.ts} + worker/src/features/{evaluation,experiments,traces}

Langfuse = **LLM 应用的可观测 + 评估 + 实验平台**（trace→observation→score→dataset→experiment）。
对 OpenSoul 价值最高——直击用户两大原话痛点："我都不知道他们在干嘛"（trace 可观测）和
"一直没有进化"（eval 度量 + 实验闭环）。OpenSoul trajectory/store.py 是它的极简雏形，差距巨大。

## 功能清单

| # | 功能 | OpenMate | OpenSoul | 差距 | 实现建议 |
|---|------|----------|----------|------|----------|
| 1 | **Trace/Observation/Score 三层模型**：trace 含嵌套 observation(span)，每个可打 score | ❌ | 🟡 trajectory/store.py 扁平事件表(有 parent_event_id)，无 span 嵌套/无 score | 部分有 | **P0**。把扁平事件升级为可嵌套 span + 可挂 score |
| 2 | **LLM-as-Judge 评估**：LLMAsJudgeExecution 队列，对每个 observation/trace 用 LLM 打分 | ❌ | ❌ 无 llm_as_judge | 完全没有 | **P0**。度量闭环，与 n8n 评估、LobeChat rubric 三方互证 |
| 3 | **Code-based 评估**：python/node sandbox 跑代码判定(trace 正确性)，有 code-eval-runners | ❌ | ❌ 无 code_eval | 完全没有 | P1。规则化验收 |
| 4 | **Datasets + Dataset Runs**：数据集管理，dataset-run-items 把运行结果绑回数据集 | ❌ | ❌ 无 dataset_run | 完全没有 | **P0**。回归测试基座，与 n8n Evaluation 同族 |
| 5 | **Experiments（实验）**：ExperimentCreate 队列，scheduleExperimentEvals 对数据集批量跑实验对比 | ❌ | ❌ 无 experiment | 完全没有 | P0。"改了 prompt 效果如何"用数据说话 |
| 6 | **Background Queue 架构**：BullMQ 30+ 队列，**secondary queue 做吞吐隔离**(高流量项目独立队列)，DeadLetter 重试队列 | ❌ | ❌ 无后台队列/dead_letter | 完全没有 | **P0**。可观测+评估都是异步重活，需要队列底座。呼应 n8n scaling |
| 7 | **OTel 接入**：OtelIngestion 队列 + otel-media，标准 OpenTelemetry 埋点摄入 | ❌ | ❌ 无 otel | 完全没有 | P1。标准化埋点，接任意 agent |
| 8 | **Scores（人工+自动）**：score-configs 定义评分维度/量纲，多来源打分 | ❌ | ❌ 无 score 概念 | 完全没有 | P0。评估的统一落点 |
| 9 | **Batch Export**：批量导出 trace 数据 | ❌ | ❌ 无 batch_export | 完全没有 | 中 |
| 10 | **Data Retention / 清理**：data-retention + 各类 cleaner(media/trace/blob)，按策略清理 | ❌ | ❌ 无 data_retention | 完全没有 | 中。合规(数据留存期限) |
| 11 | **Monitor/Alert**：monitor-runner 队列，对指标阈值告警 | ❌ | 🟡 vital/alert.py 有告警 | 部分有 | 中。扩到 trace 级指标(成本/延迟/错误率突增) |
| 12 | **Batch Actions**：对 trace 表批量打标/删除/导出 | ❌ | ❌ | 完全没有 | 低 |
| 13 | **Webhooks**：事件外发 | ❌ | 🟡 link/connector 有 webhook 雏形 | 部分有 | 中 |
| 14 | **Media 处理**：observation 内媒体(图片/音频)存储 + retention | ❌ | ❌ | 完全没有 | 低 |
| 15 | **Tokenisation**：独立分词服务，精确 token 统计 | ❌ | 🟡 gland/token_meter + 事件 token_usage | 部分有 | 升级：按 span 逐项归因(呼应 claude-code SDKContextUsage) |
| 16 | **In-app Agent**：内置 agent + DLQ 重试 + 完整性校验 runner | ❌ | ❌ | 完全没有 | 中 |
| 17 | **Trace Batch Ingestion**：traceBatching + S3-merge，高吞摄入 | ❌ | ❌ | 完全没有 | 中。规模上来才需要 |
| 18 | **ClickHouse 时序存储**：trace/observation 用 ClickHouse 列存 + canonical migration | ❌ | 🟡 SQLite/Postgres | 部分有 | 低。规模问题 |

## 源码亮点

- **三层观测数据模型**（domain/{traces,observations,scores}.ts）：trace→observation(可嵌套 span)→score。这是**一切可观测+评估的通用骨架**。OpenSoul trajectory 扁平事件表只需加 span 嵌套 + score 挂载即可对齐。
- **二级队列做吞吐隔离**（`EvaluationExecutionSecondaryQueue`/`OtelIngestionSecondaryQueue`）："把高吞吐项目与其他项目分开，避免饿死"。**工程细节但极重要**，评估/摄入互不阻塞。
- **DeadLetterRetryQueue**：失败任务进死信队列再重试，可观测系统自身不能丢数据。OpenSoul 完全没有。
- **Deterministic Sampling**（evaluation/deterministicSampling.ts）：确定性采样——同一输入永远采/不采，保证 eval 可复现。可抄。
- **Code-eval runners 双语言**（scripts/code-eval-runners/{node,python}）：用真沙箱跑判定代码。与 E2B 沙箱呼应。
- **dependency 单向原则**（shared 不依赖 web/worker/ee）：clean 分层。OpenSoul 器官模块间耦合可借鉴此纪律。

## 可复用设计

1. **Trace→Observation→Score 三层模型** → 升级 OpenSoul trajectory，P0，直击"不知道在干嘛"+"不进化"
2. **Background Queue 底座**（BullMQ 式 + secondary 隔离 + dead letter）→ 评估/摄入/导出的异步地基，P0
3. **LLM-as-Judge + Dataset/Experiment 闭环** → 度量"进化了没有"，P0
4. **确定性采样**（deterministicSampling）→ eval 可复现
5. **逐 span token 归因** → 升级 token_meter，呼应 claude-code

## OpenSoul 现状确认（grep）
- trajectory/{store,session_fsm}.py：**扁平事件表**(session_start/llm_call/tool_call/…，有 parent_event_id、replay、fork)，是 trace 的**极简雏形**，缺 span 嵌套、score、评估绑定
- timeline/store.py：事件时间线(event_id 去重)
- gland/token_meter.py：token 计量(预算级，非逐 span 归因)
- vital/alert.py：告警(通用，非 trace 指标阈值)
- 无 observation/span(嵌套)/score/dataset_run/experiment/llm_as_judge/code_eval/batch_export/data_retention/otel/dead_letter/后台队列
- **结论**：OpenSoul 有"记录事件"的种子，但**缺整个"观测→评分→实验"闭环和异步队列底座**——这是相对 Langfuse 最系统性的差距，且正好对准用户两大核心抱怨
