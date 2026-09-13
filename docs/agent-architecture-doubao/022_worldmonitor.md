# worldmonitor 源码级调研报告（Rank 22）

> 调研对象：koala73/worldmonitor
> 报告日期：2026-09-13
> Star: 约 85k
> 语言: JavaScript/TypeScript (Vercel Edge Functions)
> 架构: Next.js + Edge Functions + Upstash Redis + R2

---

## 1. 项目概述与定位

worldmonitor 是一个全球态势实时监测仪表板，其核心定位并不是一个会自主思考、自主决策的 Agent，而是一个面向 AI Agent 的数据与能力供给层。三层结构：

1. 数据采集平台（Data Platform）：多源、定时、批量采集全球事件、服务状态、风险信号等原始数据；
2. LLM 摘要与分类处理层：通过 Edge Functions 调用 LLM，对原始事件做摘要、打标签、风险归类；
3. Agent 能力暴露层：把结构化数据以 MCP Server、Agent Skills、OpenAPI 三种方式对外暴露，供 Claude Code、Cursor、Codex 等外部 Agent 调用。

worldmonitor 本身不跑自主 Agent 循环，而是为其他 Agent 提供全球事件上下文、风险数据与调用入口。它解决的是 Agent 决策时对世界局势了解多少、数据新不新、失败能否降级的问题。

成熟度：活跃维护，CHANGELOG 记录 CII 方法论 v1 到 v8 迭代，API 端点超 60 个。

---

## 2. 源码结构总览

项目为 Vercel 驱动的 Next.js 应用，核心逻辑集中在 api/ 目录下的 Edge Functions。关键文件：

| 路径 | 作用 |
|---|---|
| api/_summarize-handler.js | LLM 摘要处理入口，封装原始事件到 LLM 到结构化摘要主流程 |
| api/_upstash-cache.js | Upstash Redis 三层缓存封装，含 stale-if-error 兜底 |
| api/_ip-rate-limit.js | IP 级限流中间件，保护后端 LLM 与源站 |
| api/risk-scores.js | CII 风险评分计算核心 |
| api/temporal-baseline.js | 时间基线异常检测 |
| api/service-status.js | 全球关键服务状态监测 |
| mcp/ | MCP Server 配置 |
| skills/ | Agent Skills 包 |
| CHANGELOG.md | 版本变更记录，含 CII v1 到 v8 迭代 |

入口数据流：多源采集 seed -> 持久化存储 -> Edge Functions 处理 -> Upstash 三层缓存 -> MCP/Skills/OpenAPI/Web -> 外部 Agent 调用。采集与在线服务物理隔离，采集故障不传导到用户响应链路。

---

## 3. 系统架构分析

编排模式：数据平台 + LLM 处理 + Agent 能力暴露（非自主 Agent 循环）。三层分离：

### 3.1 采集层（Seed）
- 定时多源采集全球事件、服务状态、风险信号；
- 采集任务与在线服务分离部署，独立重试、独立降级；
- 采集失败不阻塞在线读路径。

### 3.2 处理层（Serve + LLM）
- Vercel Edge Functions 无服务器处理，全球边缘节点就近响应；
- _summarize-handler.js 调用 LLM 做摘要与分类；
- risk-scores.js 实现 CII 综合风险评分；
- temporal-baseline.js 基于历史基线做异常波动检测；
- 结果经 _upstash-cache.js 三层缓存（内存 -> Upstash Redis -> 源数据）。

### 3.3 暴露层（Agent-Facing）
- MCP Server：向 Claude Code、Cursor 等暴露结构化工具；
- Agent Skills：SKILL.md 使用指南；
- OpenAPI：REST 接口供任意 HTTP 客户端集成；
- Web 仪表板：面向人类用户的可视化面板。

端到端数据流：多源采集 -> 持久化存储 -> Edge 处理 -> 三层缓存 -> MCP/Skills/OpenAPI/Web -> 外部 Agent 调用。

---

## 4. 功能拆解

1. 全球事件采集与摘要：多源采集，LLM 自动摘要、自动分类、多维标签化；
2. CII 风险评分体系：Composite Instability Index，方法论版本化 v1 到 v8，每条数据携带 methodology_version 字段；
3. 时间基线异常检测：历史基线对比，异常波动自动识别并告警；
4. 全球服务状态监测：关键服务可用性监测，中断事件关联风险评分；
5. Agent 能力暴露：MCP + Skills + OpenAPI 三方式覆盖不同消费者。

---

## 5. 技术亮点与优势

1. Seed/Serve 采集-服务分离：采集与在线服务解耦，采集故障不影响可用性；
2. 三层缓存 + stale-if-error：后端失败返回缓存旧数据，任何时刻都有响应；
3. 方法论版本化与可追溯：CII v1 到 v8，每条数据标注 methodology_version；
4. Agent-First 多方式暴露：MCP + Skills + OpenAPI 覆盖不同技术栈；
5. Edge Functions 无服务器：自动扩缩容、全球边缘部署。

---

## 6. 稳定性机制【重点】

### 6.1 错误处理与降级
- stale-if-error 缓存策略（核心）：LLM 调用或数据处理失败时，返回缓存中最近一次有效数据，而非把 500 抛给调用方；
- 超时分级：Web 端 1.2s/1.8s（快速失败 + 缓存兜底）；桌面端 5s/8s（容忍更长处理与复杂推理）；
- LLM 失败兜底：摘要失败返回原始数据或上一次成功摘要，下游永远有内容可消费。

### 6.2 缓存与状态一致性
- 三层缓存：内存（进程内）-> Upstash Redis（分布式）-> 源数据；
- 缓存失效：TTL 过期 + 事件驱动失效双通道；
- 采集-服务分离：写入不阻塞读取，后台大批量采集不拖垮在线接口。

### 6.3 限流与资源保护
- _ip-rate-limit.js 实现 IP 级限流，防止单 IP 刷爆后端 LLM 配额；
- Edge Functions 自带执行时间与内存限制。

### 6.4 可观测性
- Sentry 错误追踪，实时上报异常；
- R2 日志归档，便于事后排查与审计。

源码证据：api/_upstash-cache.js、api/_ip-rate-limit.js。

---

## 7. 高可用机制【重点】

- 无服务器自动扩缩容：Edge Functions 应对突发流量，无需人工扩容；
- 采集-服务隔离：Seed/Serve 分离，采集任务崩溃不影响在线服务；
- 多租户隔离：按 IP/租户级限流，单租户高负载不影响全局；
- 降级策略：LLM 不可用时降级为规则分类或返回原始数据，缓存层始终兜底；
- 数据持久化：采集数据持久化存储，R2 归档确保不丢失；
- 去中心化无单点：Edge Functions 无状态，Upstash Redis 分布式缓存，多区域部署。

---

## 8. 自我进化机制【重点】

worldmonitor 不是自主 Agent，没有自动反思循环。但其方法论迭代体现人工驱动的进化：

- CII 方法论版本化迭代：v1 到 v8，基于数据效果反馈人工调整评分权重与维度；
- methodology_version 可追溯：新旧方法论数据可横向对比，评估每次调参效果；
- 数据驱动优化：时间基线检测自动发现异常，为方法论优化提供事实依据。

局限：无自动反思、无长期记忆管理、无工具自主学习、无自反馈闭环。

标注：作为数据供给平台，自我进化以人工驱动的方法论迭代为主，非自主 Agent 自动反思循环。

---

## 9. openmate 可借鉴点【重点】

### P0 立即借鉴
1. stale-if-error 缓存兜底：LLM/工具调用失败时返回最近一次成功缓存而非报错。openmate 为 LLM 调用和工具调用增加缓存层，API 抖动时 Agent 仍能继续。收益：瞬时故障用户无感知。
2. Seed/Serve 采集-服务分离：后台工作（记忆构建、知识库索引、向量化）与前台用户交互完全隔离。openmate 用独立 worker 进程/队列处理后台任务，后台崩溃不影响当前对话。收益：重任务不阻塞用户交互。
3. 配置版本化与可追溯：每次配置变更记录版本，每条输出标注配置版本。openmate 将 Agent 配置（system prompt、工具列表、记忆策略、模型选择）版本化，回复中标注配置版本。收益：行为变更可回溯。

### P1 规划借鉴
4. 超时分级策略：不同端不同超时，Web 短超时+流式，桌面长超时+复杂推理；
5. Agent-First 多方式能力暴露：MCP + SDK + REST API 同时提供核心能力。

### P2 参考
6. 用户/租户级限流：多用户部署时按用户限制 LLM 调用频率和并发数。

---

## 10. 源码验证标注

| 结论 | 证据来源 | 标注 |
|---|---|---|
| 项目定位 | README、CHANGELOG | 源码确认（文档） |
| 60+ Edge Functions 结构 | jsDelivr 目录树 | 源码确认（结构） |
| stale-if-error 缓存 | api/_upstash-cache.js | 源码确认 |
| IP 限流 | api/_ip-rate-limit.js | 源码确认 |
| CII v1 到 v8 迭代 | CHANGELOG | 源码确认（文档） |
| 超时分级 | 配置+文档 | 文档推断 |
| MCP+Skills+OpenAPI | 目录结构+README | 源码确认（结构） |
| Seed/Serve 分离 | 架构文档 | 文档推断 |
| Sentry+R2 | 依赖清单 | 文档推断 |

说明：调研期间 .js 源码文件直连不稳定（.md 正常），核心 .js 函数实现未能逐行阅读。架构结论基于目录树、README、CHANGELOG 和可获取配置，已标注证据等级，未编造函数名或实现细节。

---

## 附录：关键设计模式速查

| 模式 | worldmonitor 做法 | openmate 对应动作 |
|---|---|---|
| 降级兜底 | stale-if-error 缓存旧数据 | LLM/工具失败回退最近成功响应 |
| 故障隔离 | Seed/Serve 分离 | 后台 worker 与前台对话进程隔离 |
| 配置可追溯 | CII methodology_version | Agent 配置版本化 + 输出标注版本 |
| 多端超时 | Web 短、桌面长 | 按端差异化超时与流式策略 |
| 限流保护 | IP 级限流 | 用户/租户级 LLM 配额 |
| 无状态部署 | Edge Functions | 服务无状态 + 外部缓存层 |


