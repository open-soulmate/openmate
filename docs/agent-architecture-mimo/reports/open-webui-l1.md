# Open WebUI 深度架构报告（openmate 参考级）

> 供 openmate 参考：SQLite 生产化 PRAGMA、工具调用迭代、流式 delta 分块、Redis 哨兵
> 调研日期：2026-09-13
> 资料来源：jsDelivr 实拉 `open-webui/open-webui@main`
> 版本锚点：根 `package.json` → `"name": "open-webui"`, `"version": "0.11.3"`

---

## 0. 验证状态（诚实）

jsDelivr **包列表 API 对本仓库 403**，但 **单文件 CDN 可拉**。以下为实拉成功文件：

| 路径 | 字节 |
|---|---|
| `backend/open_webui/main.py` | 121383 |
| `backend/open_webui/config.py` | 129887 |
| `backend/open_webui/env.py` | 51237 |
| `backend/open_webui/utils/middleware.py` | 286932 |
| `backend/open_webui/utils/tools.py` | 68998 |
| `backend/open_webui/utils/chat.py` | 13857 |
| `backend/open_webui/utils/plugin.py` | 17288 |
| `backend/open_webui/utils/auth.py` | 21135 |
| `package.json` | 5337 |

**多次 404 未拉到：** `apps/webui/routers/chats.py`、`apps/webui/models/chats.py`、`utils/tool_executor.py`、`apps/socket/main.py`。报告不引用这些文件内部。

前端：SvelteKit + Vite；Node `>=18.13.0 <=22.x.x`（package.json engines）。

---

## 1. SQLite 生产化 PRAGMA（`env.py` L326-354）— openmate 最该抄

| 环境变量 | 默认值 | 含义 |
|---|---|---|
| `DATABASE_URL` | `sqlite:///{DATA_DIR}/webui.db` | L267 |
| `DATABASE_ENABLE_SQLITE_WAL` | **`True`** | L326 |
| `DATABASE_SQLITE_PRAGMA_SYNCHRONOUS` | **`NORMAL`** | L334 |
| `DATABASE_SQLITE_PRAGMA_BUSY_TIMEOUT` | **`5000`** ms | L338 |
| `DATABASE_SQLITE_PRAGMA_CACHE_SIZE` | **`-65536`**（约 64MB） | L341 |
| `DATABASE_SQLITE_PRAGMA_TEMP_STORE` | **`MEMORY`** | L345 |
| `DATABASE_SQLITE_PRAGMA_MMAP_SIZE` | **`268435456`**（256MB） | L349 |
| `DATABASE_SQLITE_PRAGMA_JOURNAL_SIZE_LIMIT` | **`67108864`**（64MB） | L354 |
| `DATABASE_ENABLE_SESSION_SHARING` | `False` | L362 |
| `ENABLE_REALTIME_CHAT_SAVE` | `False` | L365 |
| `ENABLE_QUERIES_CACHE` | `False` | L366 |
| `ENABLE_DB_MIGRATIONS` | `True` | L151 |

**openmate P0：** WAL + busy_timeout 5000 + synchronous NORMAL + mmap 256MB 是个人助手 SQLite 的正确默认。没有这些，并发写会频繁 `database is locked`。

---

## 2. Redis 配置（`env.py` L374-430）

| 变量 | 默认 |
|---|---|
| `REDIS_URL` | `''` |
| `REDIS_CLUSTER` | `False` |
| `REDIS_KEY_PREFIX` | `open-webui` |
| `REDIS_SENTINEL_HOSTS` | `''` |
| `REDIS_SENTINEL_PORT` | `26379` |
| `REDIS_SENTINEL_MAX_RETRY_COUNT` | **`2`** |
| `REDIS_SOCKET_KEEPALIVE` | `False` |
| `REDIS_HEALTH_CHECK_INTERVAL` | `''` |
| `REDIS_RECONNECT_DELAY` | `''` |

---

## 3. AIOHTTP 客户端调优（`env.py`）

| 变量 | 默认 |
|---|---|
| `AIOHTTP_CLIENT_STREAM_IDLE_TIMEOUT` | `''` |
| `AIOHTTP_CLIENT_ALLOW_REDIRECTS` | **`False`** |
| `AIOHTTP_CLIENT_ASYNC_DNS_RESOLVER` | `False` |
| `AIOHTTP_FILE_STREAM_CHUNK_SIZE` | **`1024 * 1024`**（1MiB） |
| `AIOHTTP_POOL_DNS_TTL` | **`300`** |
| `AIOHTTP_CLIENT_SESSION_SSL` | `True` |
| `RAG_EMBEDDING_TIMEOUT` | `''` |

`ENABLE_COMPRESSION_MIDDLEWARE` 默认 `True`（L775）。

---

## 4. 功能开关矩阵（`config.py` 选摘）

| 开关 | 默认 |
|---|---|
| `ENABLE_OLLAMA_API` | `True` |
| `ENABLE_OPENAI_API` | `True` |
| `ENABLE_DIRECT_CONNECTIONS` | `False` |
| `ENABLE_CODE_EXECUTION` | `True` |
| `ENABLE_CODE_INTERPRETER` | `True` |
| `ENABLE_MEMORIES` | `True` |
| `ENABLE_MEMORY_SYSTEM_CONTEXT` | `True` |
| `ENABLE_MEMORY_BACKGROUND_REVIEW` | **`False`** |
| `ENABLE_RAG_HYBRID_SEARCH` | `''`（即 False） |
| `ENABLE_ASYNC_EMBEDDING` | `True` |
| `ENABLE_MARKDOWN_HEADER_TEXT_SPLITTER` | `True` |
| `ENABLE_WEB_SEARCH` | `False` |
| `ENABLE_WEB_SEARCH_CONFIRMATION` | `False` |
| `ENABLE_WEB_LOADER_SSL_VERIFICATION` | `True` |
| `ENABLE_IMAGE_GENERATION` | `''` |
| `ENABLE_SIGNUP` | `True`（无 WEBUI_AUTH 时 False） |
| `ENABLE_PASSWORD_AUTH` | `True` |
| `ENABLE_INITIAL_ADMIN_SIGNUP` | `False`（env.py L738） |
| `ENABLE_VALVE_ENCRYPTION` | `False`（env.py L752） |
| `ENABLE_WEBSOCKET_SUPPORT` | `True`（env.py L458） |

---

## 5. 聊天中间件与工具迭代（`utils/middleware.py`）

### 5.1 导入的常量

```python
CHAT_RESPONSE_MAX_TOOL_CALL_ITERATIONS,
CHAT_RESPONSE_STREAM_DELTA_CHUNK_SIZE,
ENABLE_CHAT_RESPONSE_BASE64_IMAGE_URL_CONVERSION,
```

### 5.2 工具调用循环（L5551-5579）

```python
tool_call_iterations = 0
max_tool_call_iterations = getattr(
    ...,
    CHAT_RESPONSE_MAX_TOOL_CALL_ITERATIONS,
)
all_tool_call_sources = []  # Accumulated sources across all iterations

while max_tool_call_iterations is None or tool_call_iterations < max_tool_call_iterations:
    tool_call_iterations += 1
```

### 5.3 流式 delta 分块（L4682-4780）

```python
delta_chunk_size = max(
    CHAT_RESPONSE_STREAM_DELTA_CHUNK_SIZE,
    int(metadata.get('params', {}).get('stream_delta_chunk_size') or 1),
)
...
if delta_count >= delta_chunk_size:
    await flush_pending_delta_data(delta_chunk_size)
```

**openmate P1：** SSE 不要每 token 一包；按 `CHAT_RESPONSE_STREAM_DELTA_CHUNK_SIZE` 聚合 flush，且允许 per-request 覆盖。

### 5.4 工具结果错误识别（L148-183）

`_is_tool_result_error` 识别：

- 文本前缀：`error:` / `exception:` / `http error!`
- JSON 内 `error` 字段非空
- `status` ∈ `{error, failed}`

### 5.5 关键处理函数

| 函数 | 行号 |
|---|---|
| `build_chat_response_context` | 3138 |
| `non_streaming_chat_response_handler` | 4033 |
| `streaming_chat_response_handler` | 4217 |
| `stage_ask_user_tool_calls` | import L84 |

---

## 6. 工具系统（`utils/tools.py`）

| 函数 | 作用 |
|---|---|
| `build_tool_server_headers` | 远程 tool server 鉴权头 |
| `get_async_tool_function_and_apply_extra_params` | 包装 async 工具 |
| `get_tools(request, tool_ids, user, extra_params)` | 按 id 加载工具字典 |
| `make_tool_function` | 远程 tool server → 本地 callable |
| `get_builtin_tools` / `get_terminal_tools` | 内置/终端工具 |
| `get_model_capability` / `is_builtin_tool_enabled` | 能力开关 |
| `has_user_permission` / `has_user_chat_permission` | 权限 |
| `convert_function_to_pydantic_model` | docstring → OpenAI tool schema |
| `clean_openai_tool_schema` | schema 清洗 |

超时：`AIOHTTP_CLIENT_TIMEOUT`, `AIOHTTP_CLIENT_TIMEOUT_TOOL_SERVER`, `AIOHTTP_CLIENT_TIMEOUT_TOOL_SERVER_DATA`。

---

## 7. 失败路径汇总

| 场景 | 行为 | 出处 |
|---|---|---|
| SQLite 并发写 | WAL + busy_timeout 5000ms 重试 | env.py L326-338 |
| SQLite 临时表 | TEMP_STORE=MEMORY | env.py L345 |
| 工具结果报错 | 前缀/JSON error/status 三重检测 | middleware.py L148-183 |
| 工具调用过多 | max_tool_call_iterations 截断 | middleware.py L5551-5579 |
| SSE 过碎 | delta_chunk 聚合 flush | middleware.py L4682-4780 |
| Redis 哨兵 | MAX_RETRY_COUNT=2 | env.py L388 |
| HTTP 重定向 | 默认禁止 allow_redirects=False | env.py L622 |
| Valve 密钥 | 默认不加密，可开 ENABLE_VALVE_ENCRYPTION | env.py L752 |
| 数据库迁移 | ENABLE_DB_MIGRATIONS 默认开 | env.py L151 |
| 实时存聊天 | 默认关（省写放大） | env.py L365 |

---

## 8. openmate 设计抄袭清单

### P0

1. **SQLite PRAGMA 全套**：WAL、synchronous=NORMAL、busy_timeout=5000、cache_size=-65536、temp_store=MEMORY、mmap_size=256MB、journal_size_limit=64MB。**个人助手直接抄这组。**
2. **`ENABLE_REALTIME_CHAT_SAVE=False`**：流式过程中不每 delta 落盘，结束再存。
3. **工具结果错误三重检测**（文本前缀 / JSON error / status 字段）。
4. **工具迭代上限** `CHAT_RESPONSE_MAX_TOOL_CALL_ITERATIONS`（常量在 config，middleware 消费）。

### P1

5. **流式 delta 聚合**：`max(CHAT_RESPONSE_STREAM_DELTA_CHUNK_SIZE, request_override)`。
6. **AIOHTTP_FILE_STREAM_CHUNK_SIZE=1MiB** 文件流分块。
7. **AIOHTTP_POOL_DNS_TTL=300**。
8. **allow_redirects 默认 False**（SSRF 防护）。
9. **Redis key prefix 命名空间**。
10. **功能开关粒度**：memories / code_execution / web_search / hybrid_search / async_embedding 独立 env。

### P2

11. Remote tool server（HTTP callable 包装成本地 tool）。
12. docstring → Pydantic → OpenAI tool schema 自动转换。
13. `ENABLE_MEMORY_BACKGROUND_REVIEW` 后台记忆审阅。
14. Web search confirmation（需用户确认再搜）。
15. Valve 加密（工具密钥落盘加密）。

---

## 9. 插件/工具动态加载（`utils/plugin.py`）

### 9.1 frontmatter requirements 安装

```python
# Install required packages found within the frontmatter.
# Runs `pip install` via subprocess, which can take a long time;
# offload to a thread so it doesn't block the event loop.
await asyncio.to_thread(
    install_frontmatter_requirements,
    frontmatter.get('requirements', '')
)
```

- `ENABLE_PIP_INSTALL_FRONTMATTER_REQUIREMENTS` 开关
- **异步 to_thread** 防阻塞 event loop
- `load_tool_module_by_id` / `load_function_module_by_id` 动态 exec 模块
- 找不到 `Tools` / `Function` class → raise
- 加载失败 log.error，不崩进程

### 9.2 Valves（用户级参数）

- `UserValves(BaseModel)`：用户可覆盖的阀门
- `resolve_valves_schema_options`：按用户解析 schema 选项
- `get_model_options`：模型下拉

### 9.3 缓存

```python
def _state_cache(request, name: str) -> dict
def get_tools_cache(request) -> dict
def get_tool_contents_cache(request) -> dict
```

按 request 缓存工具与内容。

---

## 10. 认证（`utils/auth.py`）

| 常量 | 值 | 行号 |
|---|---|---|
| `PASSWORD_BCRYPT_MAX_BYTES` | **72** | L50 |
| `SESSION_SECRET` | `WEBUI_SECRET_KEY` | L48 |

- `create_token(data, expires_delta)`：JWT encode with `SESSION_SECRET` + ALGORITHM
- `decode_token`：jwt.decode
- `is_valid_token(decoded, redis=None)`：可选 Redis 校验
- bcrypt 超 72 字节密码 **截断**（L189, L215）：`plain_password.encode('utf-8')[:72]`
- `validate_password` 对 bcrypt 超长密码直接拒绝

**openmate P1：** bcrypt 72 字节上限必须显式处理，否则长密码静默截断。

---

## 11. RAG 相关 env（config.py / env.py 补充）

| 变量 | 默认 |
|---|---|
| `RAG_SYSTEM_CONTEXT` | `False` |
| `RAG_EMBEDDING_TIMEOUT` | `''` |
| `RAG_METADATA_MAX_VALUE_CHARS` | （config.py L829） |
| `ENABLE_RAG_HYBRID_SEARCH` | `''` |
| `ENABLE_RAG_LOCAL_WEB_FETCH` | 跟随 `ENABLE_LOCAL_WEB_FETCH` |
| `ENABLE_KNOWLEDGE_FILE_RETENTION` | `False` |
| `DEFAULT_WEB_FETCH_FILTER_LIST` | 列表（config.py L1116） |

---

## 12b. 前端与工程约束（package.json 已实拉）

| 项 | 值 |
|---|---|
| name / version | open-webui / **0.11.3** |
| engines.node | `>=18.13.0 <=22.x.x` |
| engines.npm | `>=6.0.0` |
| 前端框架 | SvelteKit + Svelte 5 + Vite 5 |
| 测试 | vitest + cypress |
| lint | eslint + pylint backend + ruff format |
| i18n | i18next-parser |
| 关键依赖 | socket.io-client, pdfjs-dist, mammoth, katex, mermaid, shiki, xterm, pyodide, sql.js, idb, kokoro-js(TTS), @huggingface/transformers |

`pyodide:fetch` 是 build/dev 前置步骤（`scripts/prepare-pyodide.js`）—— **浏览器内 Python** 用于 code interpreter。

---

## 12c. 对 openmate 的特别价值（终版）

1. **SQLite PRAGMA 表**（env.py L326-354）— 本批最直接可用的单机持久化配方。
2. **工具动态加载**：frontmatter requirements → `asyncio.to_thread(pip install)` → exec → Tools class。
3. **工具结果错误三重检测** + **delta 聚合 flush**。
4. **bcrypt 72 字节上限**显式处理。
5. **SvelteKit + Pyodide** 前端内置 Python 方向（P2）。

个人助手可抄后端 env/PRAGMA/middleware 常量；前端栈不必跟 Svelte。
