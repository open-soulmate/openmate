# Khoj 深度架构报告（openmate 参考级）

> 供 openmate 参考：第二大脑语义检索、Django+FastAPI 混合、沙箱代码执行、多服务 docker-compose
> 调研日期：2026-09-13
> 资料来源：jsDelivr 实拉 `khoj-ai/khoj@master`（列表 API 403，单文件可拉）
> 版本锚点：`pyproject.toml` → `name = "khoj"`, description `"Your Second Brain"`, `requires-python = ">=3.10, <3.13"`, license AGPL-3.0-or-later

---

## 0. 验证状态（诚实）

**实拉成功：**

| 路径 | 字节 |
|---|---|
| `pyproject.toml` | 4756 |
| `src/khoj/main.py` | 8735 |
| `src/khoj/routers/api.py` | 8470 |
| `src/khoj/routers/api_chat.py` | 70509 |
| `src/khoj/utils/helpers.py` | 47301 |
| `src/khoj/utils/state.py` | 1368 |
| `src/khoj/processor/conversation/utils.py` | 48872 |
| `src/khoj/processor/conversation/openai/utils.py` | 57906 |
| `src/khoj/processor/conversation/anthropic/utils.py` | 16803 |
| `src/khoj/processor/content/text_to_entries.py` | 16525 |
| `src/khoj/search_type/text_search.py` | 9589 |
| `docker-compose.yml` | 6260 |

**404 未拉到：** `src/khoj/database/models.py`、`processor/conversation/offline/chat_model.py`、`routers/api_agent.py`、`utils/config.py`（仅 322 B 可能不完整）。

---

## 1. 全局状态（`src/khoj/utils/state.py` 全文 1368 B 已读）

```python
embeddings_model: Dict[str, EmbeddingsModel] = None
cross_encoder_model: Dict[str, CrossEncoderModel] = None
openai_client: OpenAI = None
whisper_model: Whisper = None
query_cache: Dict[str, LRU] = defaultdict(LRU)
chat_lock = threading.Lock()
scheduler: BackgroundScheduler = None
schedule_leader_process_lock: ProcessLock = None
telemetry: List[Dict[str, str]] = []
telemetry_disabled: bool = is_env_var_true("KHOJ_TELEMETRY_DISABLE")
device = get_device()
anonymous_mode: bool = False
billing_enabled: bool = (
    os.getenv("STRIPE_API_KEY") is not None
    and os.getenv("STRIPE_SIGNING_SECRET") is not None
    and os.getenv("KHOJ_CLOUD_SUBSCRIPTION_URL") is not None
)
```

**openmate 要点：**

- **`chat_lock = threading.Lock()`**：全局聊天锁（单机串行化聊天）
- **`query_cache: Dict[str, LRU]`**：按 key 的 LRU 查询缓存
- **`schedule_leader_process_lock: ProcessLock`**：多进程调度 leader 选举
- embeddings / cross-encoder / whisper / openai_client 惰性全局单例

---

## 2. 依赖矩阵（`pyproject.toml`）

| 类别 | 包 | 版本 |
|---|---|---|
| Web | fastapi, uvicorn, django==5.1.15, django-unfold | |
| LLM | openai>=2,<3, anthropic==0.75.0, google-genai==1.52.0 | |
| 向量 | **pgvector==0.2.4**, psycopg2-binary, sentence-transformers==3.4.1 | |
| OCR | rapidocr-onnxruntime==1.4.4 | |
| ASR | openai-whisper | |
| PDF | pymupdf==1.24.11 | |
| 分割 | langchain-text-splitters==0.3.11 | |
| 重试 | **tenacity>=9.0.0** | |
| 定时 | apscheduler~=3.10.0, django_apscheduler==0.7.0, schedule==1.1.0 | |
| 沙箱 | **e2b-code-interpreter~=1.0.0** | |
| MCP | **mcp>=1.23.0** | |
| Auth | authlib, itsdangerous, pyjwt 间接 via django | |
| Email | resend==1.2.0, email-validator | |
| 计费 | stripe（optional prod） | |

CLI：`khoj = "khoj.main:run"`

optional extras：

- `prod`: gunicorn==22.0.0, stripe==7.3.0, twilio==8.11, boto3
- `local`: **pgserver==0.1.4**（本地嵌入 Postgres）
- `dev`: pytest-django, freezegun, factory-boy

版本：hatch-vcs（git tag 动态版本，`raw-options.local_scheme = "no-local-version"`）。

---

## 3. Chat API（`routers/api_chat.py` 70509 B）

已验证路由（`@api_chat` + `@requires(["authenticated"])`）：

| 方法 | 路径 | 函数 |
|---|---|---|
| GET | `/stats` | `chat_stats` |
| GET | `/export` | `export_conversation` |
| GET | `/conversation/file-filters/{conversation_id}` | `get_file_filter` |
| POST/DELETE | `/conversation/file-filters` + `/bulk` | 增删文件过滤器 |
| POST | `/feedback` | `sendfeedback` |
| POST | `/speech` | `text_to_speech` |
| GET | `/starters` | `chat_starters` |

文件过滤器（file-filters）是 **会话级检索范围控制**：用户可把某次对话限制在指定文件子集。

鉴权装饰器：`@requires(["authenticated"])`（Django permissions 风格，与 FastAPI 路由混用）。

---

## 4. 检索与索引

### 4.1 text_search.py（9589 B）

文本检索入口（结合 pgvector + sentence-transformers）。

### 4.2 text_to_entries.py（16525 B）

文档 → entries 的抽象基类；上层有 org/markdown/pdf/plaintext 等具体实现（列表 API）。

### 4.3 query_cache

`state.query_cache` 是 `defaultdict(LRU)` — 每类查询独立 LRU。

---

## 5. 对话处理器

| 文件 | 字节 | 职责 |
|---|---|---|
| `processor/conversation/utils.py` | 48872 | 对话工具函数 |
| `processor/conversation/openai/utils.py` | 57906 | OpenAI 路径 |
| `processor/conversation/anthropic/utils.py` | 16803 | Anthropic 路径 |
| offline/chat_model.py | （404） | 本地模型 |

依赖 `tenacity>=9.0.0` 做重试。

---

## 6. Docker Compose 多服务（`docker-compose.yml` 全文要点）

| 服务 | 镜像 | 作用 |
|---|---|---|
| **database** | `pgvector/pgvector:pg15` | Postgres + pgvector |
| **sandbox** | `ghcr.io/khoj-ai/terrarium:latest` | 代码沙箱；healthcheck `/health` |
| **search** | `searxng/searxng:latest` | 元搜索 |
| **computer** | `ghcr.io/khoj-ai/khoj-computer:latest` | 操作员计算机（VNC 5900）；需 `KHOJ_OPERATOR_ENABLED=True` |
| **server** | `ghcr.io/khoj-ai/khoj:latest` | 主服务；depends_on database healthy |

Healthcheck 样例：

```yaml
database:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    interval: 30s
    timeout: 10s
    retries: 5
sandbox:
  healthcheck:
    test: ["CMD-SHELL", "curl -f http://localhost:8080/health"]
    interval: 30s
    timeout: 10s
    retries: 2
```

**openmate 启示：** 代码执行必须独立沙箱容器 + healthcheck；不要在主进程 eval。

---

## 7. 失败路径汇总

| 场景 | 行为 | 出处 |
|---|---|---|
| 聊天并发 | 全局 `chat_lock` 串行化 | state.py |
| 查询重复 | LRU query_cache | state.py |
| 多进程调度竞态 | `schedule_leader_process_lock` ProcessLock | state.py |
| LLM 调用失败 | tenacity 重试 | pyproject + processors |
| 未认证 | `@requires(["authenticated"])` 拒绝 | api_chat.py |
| 检索范围失控 | 会话级 file-filters | api_chat.py |
| 数据库未就绪 | compose `condition: service_healthy` | docker-compose.yml |
| 沙箱未就绪 | healthcheck retries=2 | docker-compose.yml |
| 遥测 | `KHOJ_TELEMETRY_DISABLE` 可关 | state.py |
| 计费未配 | `billing_enabled=False`（三 env 全在才 True） | state.py |
| 设备选择 | `get_device()` 自动 cpu/cuda | state.py |

---

## 7b. LRU 实现（`utils/helpers.py` L213-227）

```python
class LRU(OrderedDict):
    def __init__(self, *args, capacity=128, **kwargs):
        ...
    def __getitem__(self, key):
        # 移到末尾（最近使用）
        ...
    def __setitem__(self, key, value):
        # 超容量弹出最旧
        ...
```

| 常量 | 值 |
|---|---|
| LRU 默认 capacity | **128** |

`state.query_cache: Dict[str, LRU] = defaultdict(LRU)` — 每类查询独立 128 容量 LRU。

---

## 7c. 文本检索管道（`search_type/text_search.py` 全文要点）

### 索引计算

```python
def compute_embeddings(entries_with_ids, bi_encoder, embeddings_file, regenerate=False, normalize=True):
    # 已有 embeddings_file 且 !regenerate → torch.load
    # id == -1 的新 entry → bi_encoder.encode(convert_to_tensor=True)
    # 旧 entry → torch.index_select 拷贝
    # normalize → util.normalize_embeddings（点积检索）
    # torch.save 回写
```

### 查询

```python
async def query(raw_query, user, type=SearchType.All, ...):
    search_model = await sync_to_async(get_default_search_model)()
    if not max_distance:
        max_distance = search_model.bi_encoder_confidence_threshold or math.inf
    question_embedding = state.embeddings_model[search_model.name].embed_query(query)
    top_k = 10
    hits = EntryAdapters.search_with_embeddings(..., max_results=top_k, ...)
```

| 常量 | 值 |
|---|---|
| top_k | **10** |
| max_distance | bi_encoder_confidence_threshold 或 inf |
| normalize | 默认 True |

### 重排

```python
def rerank_and_sort_results(hits, query, rank_results, search_model_name):
    rank_results = (rank_results or state.cross_encoder_model[...].inference_server_enabled()) and len(hits) > 1
    if rank_results:
        hits = cross_encoder_score(query, hits, search_model_name)
    hits = sort_results(...)
```

- 仅 **>1 条结果** 时重排
- cross-encoder HTTP 失败 → `cross_scores = [0.0] * len(hits)`（降级不崩）
- 排序：先 bi-encoder score，再 cross-encoder score

### 去重

`collate_results` / `deduplicated_search_responses`：按 `hashed_value` / `corpus_id` / `compiled` 去重。

---

## 7d. SearchType 映射

```python
search_type_to_embeddings_type = {
    SearchType.Org: EntryType.ORG,
    SearchType.Markdown: EntryType.MARKDOWN,
    SearchType.Plaintext: EntryType.PLAINTEXT,
    SearchType.Pdf: EntryType.PDF,
    SearchType.Github: EntryType.GITHUB,
    SearchType.Notion: EntryType.NOTION,
    SearchType.All: None,
}
```

---

## 7e. 其他 helpers 常量

| 函数/类 | 作用 |
|---|---|
| `get_device()` | torch device 自动选择 |
| `get_device_memory()` | 设备内存探测 |
| `is_e2b_code_sandbox_enabled()` | E2B 沙箱开关 |
| `log_telemetry` | 遥测（可关） |
| `load_model` / `get_class_by_name` | 模型动态加载 |
| `create_tool_definition(name, description, schema)` | 工具定义构造 |
| `merge_dicts(priority, default)` | 配置合并 |
| `fix_json_dict` | JSON 修复 |

---

## 8. openmate 设计抄袭清单

### P0

1. **`chat_lock = threading.Lock()`**：单机个人助手聊天串行化，防同会话并发写历史。
2. **`query_cache: Dict[str, LRU]`**：按查询类型分桶 LRU，避免全局单一大缓存。
3. **会话级 file-filters**：用户可把对话限制到指定文件/知识子集。
4. **代码执行独立沙箱容器**（terrarium 模式）+ healthcheck，绝不在主进程 eval。
5. **tenacity 重试** 作为 LLM 调用默认包装。

### P1

6. **pgvector + sentence-transformers** 作为默认语义层（本地 `pgserver` extra 可零外部依赖）。
7. **cross_encoder_model** 独立于 embeddings_model（重排与嵌入分离）。
8. **ProcessLock 做多进程 leader 选举**（cron/调度）。
9. **compose healthcheck 依赖链**：server 等 database healthy。
10. **searxng 独立搜索服务**。
11. **`/speech` TTS 路由** 与 chat 并列。
12. **`/starters` 对话开场建议** 独立端点。
13. **`/export` 会话导出**。

### P2

14. E2B code interpreter 集成。
15. Whisper 全局单例 ASR。
16. RapidOCR 本地 OCR。
17. khoj-computer 操作员容器（VNC 5900）。
18. Stripe 计费开关（三 env 与逻辑）。
19. hatch-vcs 动态版本。
20. Django admin（django-unfold）+ FastAPI 混合。

---

## 9b. openmate 合成建议（终版）

Khoj 对 openmate 的 **可移植层**（个人助手场景）：

| 抄什么 | 具体值/形态 |
|---|---|
| 聊天锁 | `threading.Lock()` 单机串行 |
| 查询缓存 | `defaultdict(LRU)` capacity **128** |
| 检索 top_k | **10** |
| 重排条件 | 结果 >1 条且 cross-encoder 可用 |
| 重排失败 | scores 全 0，不崩 |
| 沙箱 | 独立容器 + healthcheck 30s/10s/retries 2 |
| DB 依赖 | compose `service_healthy` 门闩 |
| LLM 重试 | tenacity |
| 遥测 | env 可关 |
| 会话范围 | file-filters 限制检索子集 |

**不要抄：** Django 全栈、Stripe 计费、khoj-computer VNC 容器（个人助手过重）。

**协议注意：** AGPL-3.0 — 设计可抄，代码勿直接拷贝进闭源 openmate。

**与 CowAgent 互补：** CowAgent 有混合权重 0.7/0.3 与 embedding 缺失降级；Khoj 有 cross-encoder 独立重排与 ProcessLock leader 选举。openmate 记忆层两者都参考。
