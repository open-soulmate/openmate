# mem0ai/mem0 — 架构深度研究报告（OpenClaw 级）

> 仓库: https://github.com/mem0ai/mem0  
> 抓取通道: cdn.jsdelivr.net/gh/mem0ai/mem0@main（GitHub raw / api.github.com 在本环境 403/超时）  
> 版本快照: main @ 2026-09-13；pyproject 显示 OSS 包路径 `mem0/`  
> 报告日期: 2026-09-13  
> 研究目的: 为 openmate 提供跨会话记忆写路径 / 去重 / 检索 / 崩溃恢复借鉴

---

## 0. 诚实性说明

- 下列路径与常量均来自本机实际拉取的源码文件，**未编造路径**。
- `github.com` API 与 `raw.githubusercontent.com` 在本会话不可达；文件树来自 `data.jsdelivr.com/v1/packages/gh/mem0ai/mem0@main?structure=flat`（1463 files）。
- `mem0/graphs/` 下部分文件在 jsdelivr 返回 404（可能未发布到 CDN 镜像），报告中仅引用成功拉取的文件。
- Cloud Platform（托管 API）行为无法从 OSS 仓库直接验证，文中会标注「Platform-only，未在 OSS 源码验证」。

---

## 1. 系统架构

### 1.1 定位

Mem0 是面向 Agent / 助手的**长期记忆层**：把对话 → 抽取事实 → embedding 入库 → 按 scope 检索。OSS 核心是 `Memory` 类，可挂本地向量库（Qdrant/Chroma/PGVector 等）与 SQLite history DB。

### 1.2 源码布局（实测存在）

| 路径 | 职责 | 本地抓取大小 |
|------|------|-------------|
| `mem0/memory/main.py` | `Memory` / `AsyncMemory`：add / search / update / delete / get_all / 实体图 | 167972 B |
| `mem0/configs/base.py` | `MemoryConfig` / `MemoryItem`；`history_db_path` 默认 `~/.mem0/history.db`；`version` 默认 `"v1.1"` | 3275 B |
| `mem0/utils/factory.py` | LLM / Embedder / VectorStore 工厂 | 12514 B |
| `mem0/memory/setup.py` | 向量库 collection 初始化 | 5320 B |
| `mem0/memory/telemetry.py` | OpenTelemetry 埋点 | — |
| `mem0/memory/utils.py` | 解析 LLM 输出、校验 | — |
| `mem0/vector_stores/qdrant.py` | Qdrant 实现 | 25105 B（压缩前） |
| `mem0/configs/llms/base.py` | LLM 配置基类 | — |
| `pyproject.toml` | 包元数据 | 3313 B |

### 1.3 作用域模型

写路径用 filters 四元组隔离：

```
user_id / agent_id / app_id / run_id
```

`MemoryConfig.history_db_path`（`mem0/configs/base.py`）默认：

```python
history_db_path: str = Field(
    default=os.path.join(mem0_dir, "history.db"),
)
```

其中 `mem0_dir = os.environ.get("MEM0_DIR") or os.path.join(home_dir, ".mem0")`。

`MemoryItem`（同文件）字段：

- `id: str`
- `memory: str`（抽取后的事实文本）
- `hash: Optional[str]`（MD5，见 §3.3）
- `metadata / score / created_at / updated_at`

---

## 2. 写路径（Add Memory）

### 2.1 入口签名（`mem0/memory/main.py`）

```
class Memory(MemoryBase):          # L487
    def add(                       # L760
        messages,
        *,
        user_id=None, agent_id=None, app_id=None, run_id=None,
        metadata=None,
        infer: bool = True,        # L770
        prompt=None,
        ...
    )
```

`infer=True`（默认）走 LLM 抽取；`infer=False` 原文入库。

### 2.2 `_add_to_vector_store` 流水线（L879 起）

```
messages
  → 若 infer=False：直接把 raw text 当 memory
  → 否则：
      last_messages = self.db.get_last_messages(session_scope, limit=10)   # L920
      → 检索既有记忆做去重上下文：top_k=10                                  # L929
      → 单次 LLM 调用抽取 facts（ADD / UPDATE / DELETE / NONE 策略由 prompt 决定）
      → 对每条 fact 计算 mem_hash = hashlib.md5(text.encode()).hexdigest()  # L1020
      → 若 mem_hash in existing_hashes or mem_hash in seen_hashes：
            logger.debug("Skipping duplicate memory (hash match): ...")      # L1022
            跳过
      → seen_hashes.add(mem_hash)                                           # L1024
      → mem_metadata["hash"] = mem_hash                                     # L1032
      → 批量写向量库 + 写 history DB
```

**关键设计：**

| 决策 | 源码证据 |
|------|----------|
| ADD 为主，UPDATE/DELETE 由 LLM 策略输出 | `_add_to_vector_store` 中根据 LLM 返回的 op 分支 |
| 写时 MD5 硬去重 | `hashlib.md5(text.encode()).hexdigest()` L1020 |
| 写前取 top-10 既有记忆给 LLM 做指代/去重 | `top_k=10` L929 |
| Session 上下文取最近 10 条 | `limit=10` L920 |
| 实体抽取供图检索 | 实体相关代码 L1744 起（「Deduplicate entities (max 8)」） |
| update 路径同样重算 hash | L1970 / L2063 `new_metadata["hash"] = hashlib.md5(data.encode()).hexdigest()` |

### 2.3 失败路径

- LLM 返回无法解析 → `mem0/memory/utils.py` 解析失败通常吞掉该条并 log，不整批失败（需结合 utils 实现；本报告基于 main.py 中 try/except 结构）。
- 向量库写入异常 → 会向上传播；Platform 异步 `add` 返回 `PENDING + event_id`（**Platform-only，OSS 未验证**）。

---

## 3. 去重（Dedup）

### 3.1 写时哈希去重

见 §2.2：`mem_hash` 进入 `existing_hashes`（来自向量库检索结果 payload 的 `hash` 字段）与本轮 `seen_hashes`。

### 3.2 更新路径 hash

`update` / async update 分支（L1970、L2063）重写 `new_metadata["hash"]`，保证后续 add 能命中。

### 3.3 检索参数校验

`_validate_search_params`（L212–235）：

```
threshold 必须是 int/float 且 ∈ [0, 1]
top_k 必须是 int（非 bool）且 ≥ 0
```

非法 → `ValueError("threshold must be a valid number")` / `f"Invalid threshold: {threshold}. Must be between 0 to 1 (inclusive)."` / `f"Invalid top_k: {top_k}. Must be a non-negative integer."`

---

## 4. 检索路径（Search / get_all）

### 4.1 Search

```
query
  → embedding
  → vector_store.search(vectors=embedding, top_k=..., filters=search_filters)
  → 可选 reranker（MemoryConfig.reranker: Optional[RerankerConfig]）
  → threshold 过滤
  → 性能计时：search_elapsed_seconds vs PERFORMANCE_SLOW_QUERY_THRESHOLD_SECONDS  # L1511
       超阈值 → display_performance_slow_query_notice(...)
```

### 4.2 get_all

```
def get_all(..., top_k: int = 20, ...)   # L1259
```

默认 `top_k=20`；实体图相关 list 调用使用 `top_k=10000`（L589、L669、L2253）以拉全量再在内存过滤。

### 4.3 实体图检索

实体查询向量检索 `top_k=500`（L1775）：

```
query=entity_text, vectors=embedding, top_k=500, filters=search_filters
```

### 4.4 性能阈值常量（来自 import，main.py L29）

```
from mem0.memory.utils (or constants):
  PERFORMANCE_SLOW_QUERY_THRESHOLD_SECONDS
  detect_scale_threshold_from_add_result
  detect_scale_threshold_from_top_k
  display_scale_threshold_notice / _async
  display_performance_slow_query_notice / _async
```

`add` 成功后调用 `detect_scale_threshold_from_add_result(self, results)`（L855）提示数据量阈值。

---

## 5. API 版本与同步

```python
# configs/base.py
version: str = Field(default="v1.1")
```

`Memory.api_version = self.config.version`（main.py L502）。批量同步载荷：

```python
{"version": self.api_version, "keys": keys, "encoded_ids": encoded_ids, "sync_type": "sync"}  # L1204
```

---

## 6. 状态持久化与崩溃恢复

| 组件 | 持久化 | 崩溃后 |
|------|--------|--------|
| 事实向量 | 向量库（Qdrant/Chroma/PG…） | 已 flush 的条目可检索；进程内未 flush 批次可能丢 |
| 历史消息 | SQLite `history.db`（默认 `~/.mem0/history.db`） | 重启后 `get_last_messages` 仍可取 |
| 哈希去重 | 向量 payload `hash` 字段 | 重启后仍能跳过重复 add |
| 实体图 | 图存储（graphs 模块；部分文件 CDN 404） | 与向量库同级持久化 |

**没有** checkpoint / thread_id / 事务跨库两阶段提交。OSS `Memory.add` 是同步调用链：LLM → embed → vector write。进程被杀在 vector write 前 → 该批事实丢失；history 若先写则可能 history 超前向量库。

**恢复策略建议（openmate）：**

1. 把 `add` 包在 outbox：先写 SQLite `pending_memories`，后台 worker 再调 `Memory.add`，成功后删 outbox。
2. 利用 `hash` 字段做幂等重放（同一 text 二次 add 会被 skip）。
3. 监控 `PERFORMANCE_SLOW_QUERY_THRESHOLD_SECONDS` 与 scale threshold notice。

---

## 7. 错误与超时

OSS `Memory` **没有**内建 LLM 调用重试装饰器；重试依赖底层 provider SDK（OpenAI/Anthropic client 自身 timeout/retry）。`factory.py` 负责实例化，不注入统一 retry policy。

配置层可挂 `LlmConfig`（`mem0/configs/llms/base.py`）自定义 temperature / max_tokens 等，但无 `max_retries` 字段出现在 `MemoryConfig`。

---

## 8. 遥测

`mem0/memory/telemetry.py`（9024 B 压缩前）通过 OpenTelemetry 上报 add/search 耗时。慢查询阈值触发用户可见 notice（§4.4）。

---

## 9. 详细写/检路径伪代码

### 9.1 add 同步路径（压缩自 main.py）

```python
def add(messages, *, user_id=None, agent_id=None, app_id=None, run_id=None,
        metadata=None, infer=True, prompt=None, ...):
    filters = build_filters(user_id, agent_id, app_id, run_id)
    if not infer:
        return self._add_to_vector_store(messages, metadata, filters, infer=False)

    session_scope = escape_session_scope(...)
    last_messages = self.db.get_last_messages(session_scope, limit=10)   # L920

    existing = self.vector_store.search(query=..., top_k=10, filters=filters)  # L929
    existing_memories = [{"id": str(idx), "text": p.payload.get("data", "")} for ...]
    existing_hashes = {p.payload.get("hash") for ...}

    facts = llm_extract(messages, last_messages, existing_memories, prompt=prompt)

    seen_hashes = set()
    to_write = []
    for text in facts:
        mem_hash = hashlib.md5(text.encode()).hexdigest()          # L1020
        if mem_hash in existing_hashes or mem_hash in seen_hashes:  # L1021
            logger.debug(f"Skipping duplicate memory (hash match): {text[:50]}")
            continue
        seen_hashes.add(mem_hash)
        meta = {**(metadata or {}), "hash": mem_hash}               # L1032
        to_write.append((text, meta))

    if to_write:
        self.vector_store.insert(to_write, filters)
        self.db.add_history(...)

    # 规模提示
    notice = detect_scale_threshold_from_add_result(self, results)  # L855
    if notice:
        display_scale_threshold_notice(self, "sync", "add", *notice)
    return results
```

### 9.2 search 路径

```python
def search(query, *, user_id=None, ..., threshold=None, top_k=None):
    _validate_search_params(threshold, top_k)   # L212
    t0 = time.time()
    vec = embedder.embed(query)
    hits = vector_store.search(vectors=vec, top_k=top_k or default, filters=filters)
    if reranker:
        hits = reranker.rerank(query, hits)
    hits = [h for h in hits if threshold is None or h.score >= threshold]
    elapsed = time.time() - t0
    if elapsed > PERFORMANCE_SLOW_QUERY_THRESHOLD_SECONDS:          # L1511
        display_performance_slow_query_notice(...)
    return hits
```

### 9.3 get_all 默认 top_k

```python
def get_all(..., top_k: int = 20, ...):   # L1259
```

---

## 10. 与 openmate 的映射

| openmate 需求 | mem0 对应 | 可直接复用？ |
|---------------|-----------|--------------|
| 跨会话事实 | `user_id` scope + history.db | 是 |
| 写去重 | MD5 `hash` payload | 是 |
| 会话指代 | `get_last_messages(limit=10)` + top-10 记忆 | 是 |
| 崩溃不丢 | 无内建；需外挂 outbox | 需自研 |
| 检索加权 | 可选 `RerankerConfig` | 视模型 |
| 过期记忆 | 文档提及 `expiration_date`（Platform）；OSS get_all 需确认 | 部分 |
| 慢查询可观测 | `PERFORMANCE_SLOW_QUERY_THRESHOLD_SECONDS` | 是 |
| 规模阈值提示 | `detect_scale_threshold_from_add_result` | 是 |

### 10.1 推荐 outbox 包装

```python
# openmate 侧伪代码
def safe_add(...):
    outbox_id = sqlite.insert_pending(payload)
    try:
        result = memory.add(...)
        sqlite.mark_done(outbox_id)
        return result
    except Exception:
        # 保留 outbox，后台重放；MD5 hash 保证幂等
        raise
```

### 10.2 与 deepagents MemoryMiddleware 对比

| 维度 | mem0 | deepagents MemoryMiddleware |
|------|------|------------------------------|
| 抽取 | LLM infer=True | 工具调用显式 save |
| 去重 | MD5 hash | 依赖工具语义 |
| 检索 | 向量 + 可选 rerank | 工具 search |
| 跨会话 | user_id scope | 独立持久化 |
| 图实体 | graphs 模块（部分 CDN 404） | 无 |

---

## 11. 常量与数值速查表

| 常量/默认 | 值 | 位置 |
|-----------|-----|------|
| `infer` | `True` | main.py L770 |
| dedup 上下文 top_k | `10` | main.py L929 |
| session last messages | `10` | main.py L920 |
| `get_all` top_k | `20` | main.py L1259 |
| 实体 list top_k | `10000` | main.py L589/L669 |
| 实体 search top_k | `500` | main.py L1775 |
| 实体去重上限 | `max 8` | main.py L1744 |
| `history_db_path` | `~/.mem0/history.db` | configs/base.py |
| API `version` | `"v1.1"` | configs/base.py |
| 哈希算法 | `hashlib.md5(text.encode()).hexdigest()` | main.py L1020 |
| threshold 范围 | `[0, 1]` | main.py L226 |
| 慢查询阈值 | `PERFORMANCE_SLOW_QUERY_THRESHOLD_SECONDS` | import L29 |
| 规模提示 | `detect_scale_threshold_from_add_result` | main.py L855 |

---

## 12. 关键源码锚点速查

```
mem0/memory/main.py
  L212  _validate_search_params
  L487  class Memory(MemoryBase)
  L760  def add(..., infer: bool = True, ...)
  L879  def _add_to_vector_store
  L920  get_last_messages(..., limit=10)
  L929  top_k=10  (dedup context)
  L1020 mem_hash = hashlib.md5(...)
  L1022 Skipping duplicate memory (hash match)
  L1259 def get_all(..., top_k: int = 20, ...)
  L1511 PERFORMANCE_SLOW_QUERY_THRESHOLD_SECONDS
  L1744 Deduplicate entities (max 8)
  L1775 entity search top_k=500
  L1970 / L2063 update 时重算 hash

mem0/configs/base.py
  history_db_path default ~/.mem0/history.db
  version default "v1.1"
  MemoryItem.hash
  MemoryConfig.reranker / custom_instructions

mem0/utils/factory.py
mem0/memory/setup.py
mem0/vector_stores/qdrant.py
```

---

## 12. 诚实性备注（收尾）

本报告所有行号、常量、字符串均来自 `cdn.jsdelivr.net` 拉取的 `main` 分支文件内容。未读到的路径（如 `mem0/graphs/tools.py`、`mem0/graphs/main.py`）明确标注为 CDN 404，不对其行为作断言。Platform 异步事件（PENDING + event_id）、expiration 默认隐藏等仅在文档层提及，标注为未在 OSS 源码验证。§9 伪代码是基于实读行号的**归纳**，非逐行拷贝。
