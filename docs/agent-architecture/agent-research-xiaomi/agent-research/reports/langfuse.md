# langfuse/langfuse — Agent 可观测性与评估基础设施调研

> 目标：为 openmate 提供 Agent 运行 trace、崩溃诊断、评估与自进化闭环参考。
> 来源：github.com/langfuse/langfuse、langfuse.com/docs。

---

## 1. 项目定位

Langfuse 是**开源 LLM 工程平台**，覆盖开发、监控、评估、调试 AI 应用。

- MIT（`ee/` 目录除外）
- 自托管：docker compose（本地/VM）、K8s Helm、Terraform（AWS/Azure/GCP）
- 存储：ClickHouse（2026-01 起团队并入 ClickHouse）
- SDK：Python / JS/TS；OpenTelemetry 原生
- 集成：OpenAI、LangChain、LlamaIndex、LiteLLM、Vercel AI SDK、CrewAI、smolagents 等

---

## 2. 核心数据模型

```
Session (1) ──o── (n) Trace (1) ──o── (n) Observation
```

| 概念 | 含义 |
|------|------|
| **Observation** | 应用中的单步：LLM call、tool call、检索步骤等；可嵌套；类型含 generation / event 等 |
| **Trace** | 一次完整请求（如一轮对话到最终回复），共享 `trace_id` |
| **Session** | 聚合多轮对话/工作流中的多条 trace（如一个聊天线程） |

Trace 级属性（`user_id`、`session_id`、`tags`、`metadata`）会由 SDK 自动传播到每条 observation——概念上一张 observations 表，每行含 observation 数据 + trace 属性副本，便于快速查询聚合。

其他属性维度：Environments（prod/staging）、Tags、Users、Metadata、Releases/Versions。

---

## 3. 数据摄入与 HA 特性

### 3.1 基于 OpenTelemetry

- 不锁定 Langfuse SDK；可同时导出到 Datadog 等
- 也支持手动 SDK 埋点与 drop-in OpenAI 包装

### 3.2 异步批处理（关键稳定性设计）

```
App ──createTrace()──► SDK ──enqueue──► 本地队列（非阻塞）
                                              │
                                    后台 Exporter 定时/按批
                                              │
                                              ▼
                                        Langfuse 后端
```

- **应用响应延迟不受影响**
- 长驻进程：后台自动 flush
- **短命进程必须显式 `flush()`**，否则队列未发送、进程退出 → **trace 丢失**

### 3.3 自托管形态

| 方式 | 场景 |
|------|------|
| docker compose | 5 分钟本地起 |
| 单 VM docker compose | 小规模生产 |
| Kubernetes Helm | **推荐的生产部署** |
| Terraform | AWS / Azure / GCP |

---

## 4. 可观测性能力

- **Tracing**：完整生命周期——prompt、completion、token、延迟、tool/retrieval 中间步
- **Token & Cost tracking**：模型用量与成本
- **Scores**：质量指标打到 trace/observation 上
- **Custom dashboards**：成本/延迟/量/质量自定义面板
- **Alerts**：指标跨阈值告警
- **Sessions**：多轮对话视图
- **Prompt Management**：中心化版本控制 + 强缓存（服务端+客户端），迭代不加延迟
- **LLM Playground**：从坏 trace 直接跳到 playground 迭代

---

## 5. 评估（Evals）体系

评估贯穿 AI 工程环：Trace → Monitor → Build datasets → Experiment → Evaluate。

### 5.1 在线 vs 离线

| 模式 | 用途 |
|------|------|
| **Online** | 对生产实时 trace 打分，跟踪质量趋势 |
| **Offline** | 在预定义 dataset 上跑改动，上线前防回归 |

### 5.2 评估方法

| 方法 | 场景 |
|------|------|
| **LLM-as-a-Judge** | 自动给生产 trace 打分 |
| **Code evaluators** | 确定性检查 |
| **User Feedback** | 终端用户反馈 |
| **Annotation Queues** | 人工标注 |
| **Scores via API/SDK** | 自定义管道 |
| **Text scores** | 开放式备注 |

### 5.3 实验与 CI/CD

- **Datasets**：可复用测试集 / benchmark
- **Experiments**：并排比较 prompt / 模型 / 代码变体（UI / SDK / OTel）
- **CI 集成**：`langfuse/experiment-action` GitHub Action；实验脚本抛 `RegressionError` 即 fail PR
- **Score Analytics**：分数随时间趋势

---

## 6. 集成方式

| 集成 | 支持 |
|------|------|
| SDK 手动埋点 | Python, JS/TS |
| OpenAI drop-in | 自动捕获模型调用 |
| LangChain callback | 自动 |
| LlamaIndex callback | 自动 |
| LiteLLM proxy | 100+ LLM |
| API | OpenAPI + Postman + 类型化 SDK |
| Agent Skill | 官方 skill 编码埋点最佳实践 |

---

## 7. openmate 应借鉴的设计

### 7.1 Trace 模型（Agent 运行可观测）

1. **三层结构强制落地**：`Session`（用户会话）→ `Trace`（一次 Agent 任务）→ `Observation`（每次 LLM / tool / 检索）。
2. **嵌套 observation**：Agent 循环中的子步骤（工具调用、重试、记忆检索）全部嵌套进同一 trace。
3. **属性下放**：user_id / session_id / env / version 自动传播，崩溃时可按 session 串起全链路。
4. **Tool call 作为 observation type**：工具输入输出、耗时、isError 一并记录——与 MCP 工具协议字段对齐。

### 7.2 崩溃恢复 / HA

1. **异步批处理 + 显式 flush**：
   - Agent 长驻服务：后台 exporter 即可
   - **短命任务 / 崩溃前 shutdown hook：必须 `flush()`**，否则丢 trace
2. **OpenTelemetry 标准**：不绑死后端；Langfuse 挂了可切其他 sink。
3. **ClickHouse 后端**：高吞吐观测数据，适合 Agent 密集工具调用场景。
4. **自托管 K8s Helm**：生产 HA 部署路径清晰。
5. **trace 与业务状态解耦**：观测失败不应阻塞 Agent 主流程（本地队列 + 后台发送）。

### 7.3 评估与自进化闭环

```
生产 Agent 运行
    → 全量 trace 入 Langfuse
    → 在线 LLM-as-judge / 用户反馈 打 score
    → 低分/异常 trace 进 Annotation Queue
    → 好例子抽成 Dataset
    → 改 prompt/工具/记忆策略 → Experiments 对比
    → CI 跑 experiment-action，回归则 block merge
    → 通过后上线，Score Analytics 验证趋势
```

这是 openmate「自进化」的**度量与门禁**基础设施：

- 没有可观测就没有可评估
- 没有可评估的“进化”是盲改
- CI 硬门禁防劣化

### 7.4 与其他组件联动

| 组件 | 联动 |
|------|------|
| **Mem0** | 记忆检索结果写成 observation；记忆质量用 judge 打分 |
| **MCP** | tools/call 的 name、arguments、isError、structuredContent 直接映射 trace 字段 |
| **E2B/Daytona** | 沙箱创建/执行/销毁各为 observation；沙箱 ID 进 metadata，崩溃可定位 |

### 7.5 落地建议

```
短期：@observe() 或 OTel 埋点 Session/Trace/Observation
      短命进程 shutdown 必 flush()
      至少记录：LLM call、tool call、记忆检索
中期：自托管 docker compose；Prompt Management 上线
      在线 LLM-as-judge + 用户反馈 score
长期：Dataset + Experiment + CI experiment-action 门禁
      Score Analytics 驱动记忆/工具/提示策略迭代
```

---

## 8. 风险与注意

- 短命应用不 flush = 静默丢数据（官方明确警告）
- MIT 授权但 `ee/` 目录另有许可
- 自托管生产优先 K8s Helm，而非 compose
- 观测本身有成本（token/存储），需配采样与保留策略（文档另有 best practices）
- Langfuse 不替代业务侧状态存储；崩溃恢复仍靠 mem0 + 沙箱 persistence

---

## 9. 参考链接

- https://github.com/langfuse/langfuse
- https://langfuse.com/docs/tracing
- https://langfuse.com/docs/observability/data-model
- https://langfuse.com/docs/evaluation/overview
- https://langfuse.com/self-hosting
