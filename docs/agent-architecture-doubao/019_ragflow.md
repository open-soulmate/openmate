# 019 · infiniflow/ragflow 源码级调研报告

> 调研日期：2026-09-13 ｜ rank 19 / GitHub Top 100 AI Agent 第 19 位
> 证据：README.md + `rag/svr/task_executor.py`（jsDelivr @main）。注：初步清单标"Go"，源码实测**主语言为 Python**（ragflow_server.py / task_executor.py），前端为 web/（React）。

---

## 1. 项目概述与定位

| 项目 | 内容 |
|---|---|
| 名称 | infiniflow/ragflow |
| GitHub | https://github.com/infiniflow/ragflow |
| Star | 约 90,596（初步清单） |
| 主语言 | Python 3.13（后端）+ React（前端 web/）；DeepDoc 文档解析 |
| 当前版本 | v0.25.6（README Docker tag 实测） |
| License | Apache-2.0 |

**一句话定位**：开源 RAG 引擎——自研 DeepDoc 做深度文档理解，DAG/流水线编排解析→分块→混合检索→重排→生成，每个答案可溯源到原文；近期叠加 agentic workflow、MCP、代码执行沙箱与 Agent Memory，向"Agent 上下文层"演进。

**目标用户**：需要企业级知识库问答、可控引用溯源的团队；自托管（Docker Compose）。

**成熟度**：v0.25、Docker 镜像、丰富 roadmap、多语言 README，生产级平台。

---

## 2. 源码结构总览（源码确认）

```
ragflow/
├── rag/
│   ├── svr/task_executor.py   # ★ 异步任务执行器（Redis 队列消费）
│   │   task_executor_limiter.py # task/chunk/embed/minio/kg 限流
│   ├── svr/ragflow_server.py   # Flask API 后端
│   ├── nlp/ deepdoc/          # ★ DeepDoc 文档解析（OCR/表格/版面）
│   └── app/                   # 业务逻辑、prompt、对话
├── api/db/                    # MySQL 模型、TaskService
├── common/                    # exceptions(TaskCanceledException)、redis_lock
├── web/                       # React 前端
└── docker/                    # compose / entrypoint.sh（supervisor 重启）
```

**入口/启动**（README 确认）：`ragflow_server.py`（API）+ `task_executor.py`（异步 worker）；依赖 MySQL、Elasticsearch（或 Infinity）、MinIO、Redis。

---

## 3. 系统架构分析

**编排模式：Workflow-DAG / 流水线（ingestion pipeline）+ 检索式问答，叠加 agentic workflow。** 证据（源码确认，task_executor.py）：
- 任务类型映射 `TASK_TYPE_TO_PIPELINE_TASK_TYPE`：parse / raptor / graphrag / mindmap / memory / wiki / skill / structure_graph / timeline / session_graph / structure——表明 ingestion 是**多类型流水线**（不止解析，还有 RAPTOR 树、GraphRAG、时间线、记忆抽取等）。
- **Redis 队列消费**：`collect()` 从 Redis stream 取任务 → `handle_task()` 处理 → `redis_msg.ack()`。
- **任务 fan-out**：`_KB_FANOUT_TASK_TYPES`（graphrag/raptor/mindmap 等）用 fake sentinel doc_id + `doc_ids` 列表做知识库级扇出。

**核心组件**：
- **ragflow_server**（Flask）：同步 API。
- **task_executor**：异步 worker，跑解析/嵌入/索引等重活。
- **DeepDoc**：文档理解。
- **检索**：多召回 + 融合重排（README「Multiple recall paired with fused re-ranking」）。

**数据流**：
```
上传文档 → 任务入 Redis 队列 → task_executor 消费
  → DeepDoc 解析 → 分块 → 嵌入 → 写 ES/Infinity + MinIO(原文)
问答 → 混合检索 → 重排 → 带引用生成
```

**关键类/函数**（源码确认）：`handle_task()`、`collect()`、`TaskManager.run_refactored_task/dry_run_task`、`report_status()`、`set_progress()`、`RedisDistributedLock`、`task_limiter/chunk_limiter/embed_limiter/minio_limiter/kg_limiter`。

---

## 4. 功能拆解

- **DeepDoc 深度文档理解**：处理复杂版面、表格、扫描件、PDF 内图像（多模态）。
- **模板化分块**：可解释、可人工干预（可视化 chunking）。
- **接地引用**：答案可回溯原文出处，降幻觉。
- **agentic workflow + MCP**（2025-08）、Python/JS 代码执行器（gVisor 沙箱，2025-05）、Agent Memory（2025-12）。
- **可编排 ingestion pipeline**（2025-10）、MinerU/Docling 解析后端（2025-10）。
- **异构数据源同步**：Confluence/S3/Notion/Discord/GDrive（2025-11）。

---

## 5. 技术亮点与优势

1. **解析质量是护城河**：DeepDoc 把"非结构化复杂文档"变成高质量 chunk，是 RAG "quality in, quality out" 的关键。
2. **任务/资源双层限流**：task/chunk/embed/minio/kg 五个 limiter 分别控并发，防嵌入/MinIO/ONNX 各自被打爆。
3. **worker 内存回收**：针对 ONNX Runtime BFCArena 不释放内存的痛点，`MAX_TASKS_PER_WORKER` 完成 N 个任务后主动退出，由 supervisor 重启——直击生产内存泄漏。
4. **灰度双跑（dry-run 对比）**：`TE_RUN_MODE=1` 同时跑新旧两版任务执行器并对比结果，支持无风险重构。
5. **心跳 + 分布式锁**：worker 向 Redis 上报心跳，过期心跳清理用 `RedisDistributedLock` 选主，支撑多 worker。

---

## 6. 稳定性机制【重点】（源码确认）

**错误分类**（`handle_task`，源码确认）：
- `TaskCanceledException` → 计入 `DONE_TASKS`（取消不算失败）。
- 其他 `Exception` → 计入 `FAILED_TASKS`，unwrap `ExceptionGroup`，`set_progress(prog=-1, msg="[Exception]: ...")` 把错误写回任务进度。
- 任务被取消/不存在 → `FAILED_TASKS += 1` 并 ack 跳过。

**取消机制**：`has_canceled(task_id)` 在处理中反复检查；取消抛 `TaskCanceledException`，优雅中止。

**worker 回收（内存泄漏兜底）**：
- `MAX_TASKS_PER_WORKER`：完成 N 个任务后主动退出（软阈值，在飞任务允许做完）。
- `RECYCLE_SHUTDOWN_TIMEOUT=300`：给在飞任务最多 300s，防止单个 hang 任务阻塞退出。
- `docker/entrypoint.sh` 的 `while true; do task_executor.py & wait; done` supervisor 自动拉起。

**优雅停机**：`signal_handler` 收到中断 → `stop_event.set()`；`finally` 里 `reset_llm_request_context(ctx_token)` 清理上下文。

**限流保护**：五类 limiter（task/chunk/embed/minio/kg）分别控制，防止某资源耗尽拖垮全局。

---

## 7. 高可用机制【重点】（源码确认）

**分布式 worker**：
- 多 task_executor 实例用 **Redis consumer group** 消费队列（`queue_info(..., SVR_CONSUMER_GROUP_NAME)` 查 pending/lag）。
- `report_status()` 周期性把 `{ip,pid,pending,lag,done,failed,current}` 心跳写 Redis zset；`WORKER_HEARTBEAT_TIMEOUT=120`。
- 过期心跳清理用 `RedisDistributedLock("clean_task_executor", timeout=60)` **选主**，避免多实例同时清理。

**水平扩展**：worker 无状态，靠 Redis 队列分发，可加实例扩容；`TE_IDX` 标识消费者。

**依赖组件**：MySQL（元数据）、ES/Infinity（全文+向量）、MinIO（文件）、Redis（队列+心跳）——经典微服务，Docker Compose 编排。

**隐私/可观测**：`_redact_task_user()` 在日志/心跳里把 user_id 替换为布尔，不暴露原始用户标识；`set_progress` 把每页进度回写，前端可见。

---

## 8. 自我进化机制【重点】（源码确认/部分）

- **Agent Memory**（2025-12）：PipelineTaskType.MEMORY 抽取会话/知识库记忆，是面向 Agent 的记忆层。
- **RAPTOR / GraphRAG**：在 chunk 之上做树状摘要与知识图谱构建，是"从原文自动归纳出更高层结构"的组织机制。
- **dry-run 对比**：`TE_RUN_MODE` 双跑新旧实现并对比结果，是工程层的自我校验（非模型自进化）。
- **无在线学习**：检索/重排是确定性管线，无权重在线更新。

---

## 9. openmate 可借鉴点【重点】

**P0｜任务队列 + 多 worker + 心跳选主**
- 借鉴什么：重活（解析/嵌入/长任务）放 Redis 队列，多 worker 消费；心跳写 Redis，过期清理用分布式锁选主。
- 怎么用：openmate 桌面/手机端把耗时任务（文档解析、批量工具调用）提交到任务队列，后端多 worker 跑；移动端只看进度。
- 预期收益：长任务不阻塞 UI、可水平扩容、worker 挂了自动重平衡。

**P0｜worker 定期回收防内存泄漏**
- 借鉴什么：完成 N 个任务后主动退出、supervisor 自动重启；给在飞任务留宽限。
- 怎么用：openmate 后端 worker 处理完一批任务后回收进程，避免长运行累积内存。
- 预期收益：长跑服务不 OOM。

**P1｜错误三分类 + 取消可检查**
- 借鉴什么：取消→计 DONE、异常→计 FAILED 并回写进度；处理循环里反复查 `has_canceled`。
- 怎么用：openmate 任务执行支持用户取消，处理中可中断；错误按取消/失败/未知分流。
- 预期收益：用户取消响应快、失败可诊断。

**P1｜五类资源独立限流**
- 借鉴什么：把"嵌入/外部 API/对象存储/CPU"分别设信号量。
- 怎么用：openmate 多端并发调用 LLM/工具时，按资源分别限流，避免某上游限流拖垮全局。
- 预期收益：背压可控。

**P2｜灰度双跑对比**
- 借鉴什么：新旧两版执行器同时跑、对比结果再切流。
- 怎么用：openmate 改核心流程时，小流量双跑对比，确认一致再全量。
- 预期收益：迭代不回退。

---

## 10. 源码验证标注

**源码直接阅读**（jsDelivr @main）：
- README：版本 v0.25.6、DeepDoc、模板分块、接地引用、多召回融合重排、agentic workflow/MCP/代码执行沙箱/Agent Memory、依赖（MySQL/ES/MinIO/Redis）、ragflow_server.py + task_executor.py 入口、gVisor。
- `rag/svr/task_executor.py`：`TASK_TYPE_TO_PIPELINE_TASK_TYPE` 与 `_KB_FANOUT_TASK_TYPES`、`task/chunk/embed/minio/kg_limiter`、`MAX_TASKS_PER_WORKER`/`RECYCLE_SHUTDOWN_TIMEOUT=300`、`signal_handler`/`stop_event`、`handle_task` 的 TaskCanceledException/Exception 分类与 ExceptionGroup unwrap、`report_status` 心跳字段与 `WORKER_HEARTBEAT_TIMEOUT=120`、`RedisDistributedLock("clean_task_executor")`、`_redact_task_user`、`TE_RUN_MODE` 三模式（dry-run 对比）、`redis_msg.ack()`。

**文档/推断**：
- DeepDoc 内部、检索重排算法、agent workflow DAG 节点实现来自 README 描述，未读源码。
- "Go 后端"的初步标注经源码核验为 **Python**（纠正）。

**源码不可得**：本轮 GitHub API 限流，未读取 `rag/nlp/`、DeepDoc、`api/db/`、检索/重排模块源码；未读取 Docker compose 的资源配置细节。
