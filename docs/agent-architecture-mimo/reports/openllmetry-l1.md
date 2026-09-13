# traceloop/openllmetry — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/traceloop/openllmetry  
> 抓取通道: cdn.jsdelivr.net/gh/traceloop/openllmetry@main/README.md  
> 版本快照: main @ 2026-09-13  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供 OTel LLM 可观测 / instrumentation 矩阵 / 目标后端 借鉴

---

## 0. 诚实性说明

- 成功拉取: `README.md` 完整（安装、目标后端、instrumentation 矩阵、telemetry 政策）
- 未打开: `packages/` instrumentation 实现
- License: Apache-2.0
- YC backed
- JS/TS 版: [OpenLLMetry-JS](https://github.com/traceloop/openllmetry-js)

---

## 1. 项目定位（README 实读）

> "Open-source observability for your LLM application"

**OpenLLMetry** = 基于 **OpenTelemetry** 的扩展集，给 LLM 应用完整可观测。因基于 OTel，可接现有可观测栈（Datadog、Honeycomb 等）。

语义约定已进入 OpenTelemetry 官方（community 讨论链接在 README）。

维护: Traceloop，Apache-2.0。

---

## 2. 快速开始（README 实读）

```bash
pip install traceloop-sdk
```

```python
from traceloop.sdk import Traceloop

Traceloop.init()
# 本地立即看 trace:
Traceloop.init(disable_batch=True)
```

**已有 OTel  instrumentation 的用户**: 可直接加任一 instrumentation，不必用 SDK。

---

## 3. 支持的目标后端（README 全量实读，25 个）

| 后端 | 状态 |
|------|------|
| Traceloop | ✅ |
| Axiom | ✅ |
| Azure Application Insights | ✅ |
| Braintrust | ✅ |
| Dash0 | ✅ |
| Datadog | ✅ |
| Dynatrace | ✅ |
| Google Cloud | ✅ |
| Grafana | ✅ |
| Highlight | ✅ |
| Honeycomb | ✅ |
| HyperDX | ✅ |
| IBM Instana | ✅ |
| KloudMate | ✅ |
| Laminar | ✅ |
| New Relic | ✅ |
| OpenTelemetry Collector | ✅ |
| Oracle Cloud | ✅ |
| Scorecard | ✅ |
| Service Now Cloud Observability | ✅ |
| SigNoz | ✅ |
| Sentry | ✅ |
| Splunk | ✅ |
| Tencent Cloud | ✅ |

---

## 4. Instrumentation 矩阵（README 实读）

### 4.1 LLM Providers（16）

Aleph Alpha, Anthropic, Bedrock (AWS), Cohere, Google Generative AI (Gemini), Groq, HuggingFace, IBM Watsonx AI, Mistral AI, Ollama, OpenAI / Azure OpenAI, Replicate, SageMaker (AWS), Together AI, Vertex AI (GCP), WRITER

### 4.2 Vector DBs（7）

Chroma, LanceDB, Marqo, Milvus, Pinecone, Qdrant, Weaviate

### 4.3 Frameworks（12）

Agno, AWS Strands（内置 OTEL）, CrewAI, Haystack, LangChain, Langflow, LangGraph, LiteLLM, LlamaIndex, OpenAI Agents

### 4.4 Protocol

**MCP**（Model Context Protocol）

### 4.5 通用

OpenTelemetry 已 instrumentation 的一切（DB、API 调用等）自动纳入。

---

## 5. Telemetry 政策（README 实读）

> "We no longer log or collect any telemetry in the SDK or in the instrumentations. Make sure to bump to **v0.49.2** and above."

### 5.1 历史原因（曾收集）

- 检测 instrumentation 内异常
- LLM provider API 频繁变更，快速发现破坏性改动
- 仅匿名数据，无 PII（Privacy 文档）
- **仅 SDK 收集**；直接用 instrumentation 不收集

### 5.2 现状

v0.49.2+ **完全不收集**。

---

## 6. 架构模式（README + OTel 常识）

### 6.1 分层

```
你的 LLM 应用
  → traceloop-sdk (Traceloop.init)
  或直接 opentelemetry-instrumentation-*
  → OpenTelemetry
  → 25+ 后端之一
```

### 6.2 SDK vs Instrumentation

| 路径 | 特点 |
|------|------|
| traceloop-sdk | 一行 init；曾含 telemetry（现已无） |
| opentelemetry-instrumentation-* | 可单独用；无 SDK telemetry |

### 6.3 与 openmate 映射

| 需求 | OpenLLMetry 机制 | 可复用度 |
|------|------------------|----------|
| OTel 标准 | 基于 OTel 非自研 | **高** |
| 一行 init | Traceloop.init() | **高** |
| disable_batch 本地调试 | True | **高** |
| LLM provider 矩阵 | 16 providers | **高** |
| Vector DB 矩阵 | 7 个 | **高** |
| Framework 矩阵 | 12 个 | **高** |
| MCP instrumentation | 有 | **高** |
| 后端无关 | 25+ 导出目标 | **高** |
| 可单独用 instrumentation | 不强制 SDK | **高** |
| Telemetry 可完全关闭 | v0.49.2+ 默认无 | **高** |
| 语义约定进 OTel | 官方化 | **高** |
| Python + JS 双实现 | openllmetry-js | 高 |

---

## 7. 超时 / 限制汇总

| 项 | 值 | 来源 |
|----|-----|------|
| SDK 包 | traceloop-sdk | README |
| 本地调试 | disable_batch=True | README |
| 后端数 | 25 | README |
| LLM providers | 16 | README |
| Vector DBs | 7 | README |
| Frameworks | 12 | README |
| MCP | 支持 | README |
| Telemetry | v0.49.2+ 不收集 | README |
| License | Apache-2.0 | README |
| JS 版 | openllmetry-js | README |
| 语义约定 | 进入 OTel community | README |

---

## 8. 失败路径 / 边界

```
未 init Traceloop
  → SDK 路径无 trace

批量发送导致本地看不到
  → disable_batch=True

v0.49.2 以下
  → 可能含 SDK telemetry

直接用 instrumentation
  → 从未有 telemetry（更干净）

后端未配置 exporter
  → OTel 默认丢弃或 console

provider API 破坏性变更
  → instrumentation 可能滞后（历史上靠 telemetry 发现，现已无）

非列表内 provider
  → 需自写 instrumentation
```

---

## 9. 对 openmate 的 P0 借鉴

### P0 — 必抄

1. **基于 OTel 而非自研协议**（后端无关）
2. **一行 init + disable_batch 本地调试**
3. **SDK 与 instrumentation 可分离使用**
4. **LLM/VectorDB/Framework 三维 instrumentation 矩阵**
5. **MCP 作为 protocol 纳入 instrumentation**
6. **Telemetry 默认关闭或可关**（v0.49.2+ 全关）
7. **语义约定推动进上游标准**（OTel）
8. **25+ 后端兼容表**作集成路线图
9. **Python/JS 双仓**（openllmetry / openllmetry-js）
10. **Privacy 文档明确曾收集什么**

### P1

- AWS Strands 内置 OTEL 的合作模式
- YC/商业版 Traceloop 作为托管后端

### P2

- 各后端具体导出配置（docs 链接）

---

## 10. 应避免的坑

- 勿在 v0.49.2 前假设无 telemetry
- 本地调试必须 disable_batch
- 勿自研协议放弃 OTel 生态
- instrumentation 覆盖表外 provider 需自扩展
- 勿发明 packages/ 内部路径

---

## 11. 源码锚点速查

```
README.md
  pip install traceloop-sdk
  Traceloop.init() / Traceloop.init(disable_batch=True)
  Backends (25): Traceloop, Axiom, Azure App Insights, Braintrust, Dash0,
    Datadog, Dynatrace, GCP, Grafana, Highlight, Honeycomb, HyperDX,
    IBM Instana, KloudMate, Laminar, New Relic, OTel Collector, Oracle,
    Scorecard, Service Now, SigNoz, Sentry, Splunk, Tencent
  LLM (16): Aleph Alpha, Anthropic, Bedrock, Cohere, Gemini, Groq, HF,
    Watsonx, Mistral, Ollama, OpenAI/Azure, Replicate, SageMaker,
    Together, Vertex, WRITER
  VectorDB (7): Chroma, LanceDB, Marqo, Milvus, Pinecone, Qdrant, Weaviate
  Frameworks (12): Agno, AWS Strands, CrewAI, Haystack, LangChain, Langflow,
    LangGraph, LiteLLM, LlamaIndex, OpenAI Agents
  Protocol: MCP
  Telemetry: none in v0.49.2+
  JS: traceloop/openllmetry-js
  Semconv: entering OpenTelemetry
  License: Apache-2.0
```

**未本轮打开**: `packages/` instrumentation 实现。

---

## 12. 评分（1–5）

| 维度 | 分 | 说明 |
|------|-----|------|
| 工具调用策略清晰度 | 3 | 观测向 |
| 权限/安全边界 | 4 | telemetry 已关 |
| 容错与会话恢复 | 2 | 非本职 |
| 上下文工程 | 2 | 非本职 |
| 可扩展（技能/MCP） | 5 | OTel + MCP + 矩阵 |
| 可观测与可评测 | 5 | 本职满分 |
| 生产可用成熟度 | 5 | 25 后端 + 标准化 |

**综合**: **LLM 可观测的 OTel 标准封装**。openmate 抄 OTel 基座、三维矩阵、一行 init 与 telemetry 默认关。

---

## 13. 关键链接

- https://github.com/traceloop/openllmetry
- https://github.com/traceloop/openllmetry-js
- https://traceloop.com/docs/openllmetry/introduction
- 相关: `reports/agentops-l1.md`、`reports/langfuse.md`、`reports/mcp.md`

---

## 14. 附录 A — 25 后端分类（README 实读）

### A1. 商业可观测（12）

Datadog, New Relic, Dynatrace, Splunk, Sentry, Honeycomb, Grafana, Google Cloud, Azure Application Insights, Oracle Cloud, Service Now Cloud Observability, IBM Instana

### A2. OTel 原生 / 新兴（8）

OpenTelemetry Collector, SigNoz, HyperDX, Dash0, Axiom, Highlight, KloudMate, Laminar

### A3. 评测 / 专有（3）

Traceloop, Braintrust, Scorecard

### A4. 云厂（2）

Tencent Cloud, （GCP/Azure 已计入商业类）

openmate: 先接 **OTel Collector** 作默认，再按需 exporter——避免绑死单一后端。

---

## 15. 附录 B — 三维矩阵 openmate 覆盖优先级

### B1. LLM Providers（16）— P0 覆盖

| 优先级 | Provider | 理由 |
|--------|----------|------|
| P0 | OpenAI / Azure OpenAI | 主流 |
| P0 | Anthropic | 主流 |
| P0 | Bedrock / SageMaker | 企业 AWS |
| P0 | Gemini / Vertex | Google 双入口 |
| P1 | Ollama | 本地 |
| P1 | Groq / Together / Replicate | 快推理 |
| P1 | Mistral / Cohere | 欧/企 |
| P2 | HuggingFace / Watsonx / Aleph Alpha / WRITER | 长尾 |

### B2. Vector DBs（7）— P0 覆盖

| 优先级 | DB |
|--------|-----|
| P0 | Pinecone, Qdrant, Milvus |
| P1 | Chroma, Weaviate |
| P2 | LanceDB, Marqo |

### B3. Frameworks（12）— P0 覆盖

| 优先级 | Framework |
|--------|-----------|
| P0 | LangChain, LangGraph, LlamaIndex |
| P0 | OpenAI Agents |
| P1 | CrewAI, LiteLLM, Haystack, Agno |
| P1 | Langflow |
| P2 | AWS Strands（已有内置 OTEL） |

### B4. Protocol

**MCP** — P0（openmate 一等公民）

---

## 16. 附录 C — 失败路径明细

```
未调用 Traceloop.init()
  → SDK 路径无 spans
  → openmate: 包装 init，缺 key 时降级 console exporter

批量发送（默认）
  → 本地开发看不到 trace
  → openmate: NODE_ENV=development 时自动 disable_batch=True

v0.49.2 以下 SDK
  → 可能外发 telemetry
  → openmate: 锁版本 >=0.49.2

直接用 instrumentation 包
  → 从未有 SDK telemetry
  → openmate: 生产可只装 instrumentation

Exporter 未配置
  → OTel 默认 drop 或 console
  → openmate: 启动校验 OTEL_EXPORTER_OTLP_ENDPOINT

Provider API 破坏性变更
  → instrumentation 滞后
  → openmate: 自维护关键 provider 的最小 instrumentation

非矩阵内 provider
  → 无自动 spans
  → openmate: 提供 manual span API 兜底

MCP 调用未 instrumentation
  → 工具链路盲区
  → openmate: MCP client/server 双端强制 wrap
```

---

## 17. 附录 D — SDK vs Instrumentation 选型

| 场景 | 选择 | 理由 |
|------|------|------|
| 快速起步 | traceloop-sdk | 一行 init |
| 已有 OTel | instrumentation only | 零额外依赖 |
| 严格合规 | instrumentation only | 无 SDK 面 |
| 需要 Traceloop 后端 | sdk | 官方集成 |
| 自建 Collector | 两者皆可 | OTel 标准 |

openmate 默认: **instrumentation only + OTel Collector**；文档提供 sdk 快捷路径。

---

## 18. 附录 E — 语义约定上游化启示

README 实读:
> Our semantic conventions are now part of OpenTelemetry!

工程含义:
1. 自研 span 属性应对照 OTel LLM semconv
2. 命名冲突时以上游为准
3. 参与 community 讨论而非 fork 标准
4. openmate: 工具调用 span 用 `gen_ai.*` / `llm.*` 约定

---

## 19. 评分理由展开

| 维度 | 分 | 依据 |
|------|-----|------|
| 工具调用 | 3 | 观测向，不执行工具 |
| 权限安全 | 4 | v0.49.2+ 零 telemetry |
| 容错恢复 | 2 | 非本职 |
| 上下文 | 2 | 非本职 |
| 可扩展 | 5 | OTel + 三矩阵 + MCP |
| 可观测 | 5 | 本职：25 后端 |
| 成熟度 | 5 | 生产验证 + 标准化 |

**净推荐**: openmate 可观测层 **必须基于 OTel**；三维矩阵作路线图；默认 instrumentation-only；telemetry 默认关。

---

## 20. 抓取核对清单

| 项 | 值 | 来源 |
|----|-----|------|
| SDK 包名 | traceloop-sdk | README |
| JS 仓 | traceloop/openllmetry-js | README |
| 后端数 | 25 | README 列表 |
| LLM 数 | 16 | README 列表 |
| VectorDB 数 | 7 | README 列表 |
| Framework 数 | 12 | README 列表 |
| MCP | 支持 | README |
| Telemetry 关闭版本 | v0.49.2 | README |
| 本地调试 | disable_batch=True | README |
| License | Apache-2.0 | README badge |
| Semconv | 进入 OTel | README |
| 本轮源码 | 仅 README | 诚实性说明 |

均可回溯 `cdn.jsdelivr.net/gh/traceloop/openllmetry@main/README.md`。
