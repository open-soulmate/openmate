# mem0ai/mem0 — Agent 记忆层基础设施调研

> 目标：为 openmate 提供跨会话记忆、崩溃后知识恢复、稳定性与自进化能力参考。
> 来源：github.com/mem0ai/mem0、docs.mem0.ai（2026-09 抓取）。

---

## 1. 项目定位

Mem0 是面向 AI Agent / 助手的**生产级长期记忆层**。核心价值：

- 多级记忆：User / Session / Agent 三层作用域
- 跨会话持久化：同一 user_id 下的知识可被后续会话检索
- 双形态：OSS SDK（本地向量库）+ Cloud Platform（托管 API）
- Apache 2.0 开源（库与自托管服务）

2026-04 新算法（v3）：LoCoMo 92.5、LongMemEval 94.4，单次 LLM 调用抽取，约 7K token / <1s 延迟。

---

## 2. 写路径（Add Memory）

### 2.1 流水线（ADD-only）

```
对话消息
  → 取 top-10 相关既有记忆（去重上下文）
  → 单次 LLM 调用：抽取全部新事实（不 UPDATE/DELETE）
  → 批量 embedding
  → MD5 哈希去重
  → 批量写入向量库
  → 实体抽取（供实体匹配检索）
```

关键设计决策：

| 决策 | 含义 |
|------|------|
| **ADD-only** | 记忆只累积不覆盖；“过时”由检索排序解决，而非写时删除 |
| **Agent 生成事实一等公民** | Agent 确认的动作与用户话语同权存储 |
| **实体链接** | 实体被抽取、embedding、跨记忆链接，用于检索加权 |
| **infer 开关** | `infer=True`（默认）走 LLM 抽取；`infer=False` 原文入库 |
| **expiration_date** | 支持记忆过期，过期条目默认从 search/get_all 隐去 |
| **异步事件** | Platform `add` 返回 `PENDING` + `event_id`，可轮询完成状态 |

### 2.2 作用域标识

- `user_id` / `agent_id` / `app_id` / `run_id`
- `run_id` 可视为一次会话/任务
- Platform 自动拉取同标识历史上下文解析指代（“他”→ 上文实体）

---

## 3. 检索路径（Search）

```
自然语言 Query
  → 预处理（lemmatize、实体抽取）
  → 并行三路打分：
      1. Semantic（向量余弦）
      2. BM25 关键词（归一化）
      3. Entity matching（实体重叠加权）
  → 分数融合 → Top-K
```

要点：

- BM25 与实体匹配是**排序加权信号**，不扩展候选集（候选仅来自语义检索）
- 默认 `top_k=20`、`threshold=0.1`
- 实体 ID 必须放在 `filters` 内：`m.search(q, filters={"user_id": "alice"})`
- `explain=True` 返回 `score_details`（语义分 / BM25 / 实体加权 / 融合分 / 阈值）
- 可选 reranker 二次排序

### 多信号融合公式（概念）

```
final_score = fuse(semantic, bm25_norm, entity_boost)
```

可用依赖降级：无 spaCy → 仅语义；无 fastembed（Qdrant）→ 无 BM25。始终可用语义检索。

---

## 4. Graph Memory（图记忆）

**重要变更：图记忆已从 OSS 移除，成为 Platform 内置特性。**

| 项目 | 说明 |
|------|------|
| 旧 OSS | `enable_graph` + `graph_store`（Neo4j / Memgraph / Kuzu / AGE / Neptune） |
| 新状态 | OSS 删除约 4000 行图驱动代码；Platform 内置 always-on 图记忆，无需外部图库 |
| OSS 替代 | 无直接替代；OSS 用 `{collection}_entities` 实体集合做实体匹配加权（非图遍历） |
| 搜索结果 | OSS 不再返回 `relations` 字段 |

**openmate 启示**：若需要实体关系图，要么接 Platform，要么自建实体索引；不要依赖已废弃的 OSS graph_store。

---

## 5. 部署形态

| 形态 | 适用 | 要点 |
|------|------|------|
| Library (`pip install mem0ai`) | 原型/测试 | 无 dashboard |
| Self-Hosted Server | 团队自建 | `cd server && make bootstrap` 或 `docker compose up`；默认开 Auth |
| Cloud Platform | 零运维生产 | Dashboard + 管理配额 + 全功能 |
| CLI | 终端管理 | `mem0 add` / `mem0 search` |
| Agent 自注册 | Agent 自助开 key | `mem0 init --agent --agent-caller <name>`，人后续可绑定邮箱 |

存储依赖：向量库（Qdrant 等 15 种）、LLM（默认 gpt-5-mini）、Embedding（默认 text-embedding-3-small，推荐 Qwen 600M 级别以启用混合检索）。

---

## 6. openmate 应借鉴的设计

### 6.1 记忆持久化（跨会话 / 崩溃恢复）

1. **分层作用域**：`user_id` / `agent_id` / `run_id` 三层，openmate 至少要区分「用户长期偏好」「Agent 身份记忆」「单次任务上下文」。
2. **ADD-only + 检索解决冲突**：写路径极简（单次 LLM、无状态 diff），崩溃后重放友好；过时信息靠时间感知检索压制。
3. **哈希去重**：MD5 防精确重复，避免崩溃重试导致记忆膨胀。
4. **异步事件 + 轮询**：Platform 的 `PENDING`/`event_id` 模式适合把记忆写入从主链路解耦，提高可用性。
5. **过期语义**：`expiration_date` 支持临时任务记忆自动失效。
6. **实体集合旁路**：主记忆表 + `{collection}_entities` 并行集合，检索时批量打分——openmate 可做「事实库 + 实体索引」双表。

### 6.2 HA / 稳定性

- 记忆服务与 Agent 主进程解耦（Library 嵌入 vs Server 独立）
- 向量库可替换（15 种后端），避免单点
- 缺依赖时优雅降级（语义-only），不因 spaCy/Qdrant 缺失而失败
- Platform 异步 ingest：Agent 崩溃不丢已提交消息（若已 ACK）

### 6.3 自进化

- 记忆累积而非覆盖 → 可审计历史决策
- `metadata` 自定义标签（category 等）支撑后期策略挖掘
- 可与 Langfuse 联动：记忆检索结果作为 trace observation 写入，评估检索质量

### 6.4 落地建议（openmate）

```
短期：Library 模式 + Qdrant/本地向量库，user_id/agent_id/run_id 三层
中期：自托管 Server（docker compose），开 Auth + Dashboard
长期：实体索引 + 时间感知排序；评估是否需要 Platform 图记忆
不要：依赖 OSS enable_graph（已移除）
```

---

## 7. 风险与注意

- v3 破坏性变更：search 的 entity ID 必须进 `filters`；top_k/threshold 默认值变了
- `infer=False` 混用会双写同一事实
- TS/Python 共享向量库时 lemmatized 字段命名不一致（snake vs camel），需分 collection
- OSS 无 reranker 时需自配；`[nlp]` extra 仅支持 Python 3.10–3.12
- 需为向量库用户预创建 `{collection}_entities` 权限

---

## 8. 参考链接

- https://github.com/mem0ai/mem0
- https://docs.mem0.ai/core-concepts/memory-operations/add
- https://docs.mem0.ai/core-concepts/memory-operations/search
- https://docs.mem0.ai/migration/oss-v2-to-v3
- https://docs.mem0.ai/platform/features/graph-memory
