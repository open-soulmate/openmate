# 73. PrivateGPT 架构深度分析

> **项目**: [imartinez/privateGPT](https://github.com/zylon-ai/private-gpt) (现为 zylon-ai/private-gpt)
> **定位**: 100% 私有的文档问答 AI 系统，基于 RAG 管道，支持完全离线运行
> **核心框架**: FastAPI + LlamaIndex + Python Injector
> **GitHub Stars**: 50K+（2023年5月至今）
> **分析时间**: 2026-09

---

## 一、项目概述与演进

PrivateGPT 于 2023 年 5 月首次发布，是最早一批解决"隐私敏感场景下使用 LLM"问题的开源项目。其核心承诺：**数据永不离开执行环境**。项目经历了三个阶段：

1. **Primordial 版本**（2023.05）：纯离线、教育性质的本地 ChatGPT 实现，保存在 `primordial` 分支
2. **架构重构版**：引入 FastAPI + LlamaIndex + 依赖注入，成为生产级 RAG API 平台
3. **当前版本**（Zylon 维护）：扩展为通用 AI 原语网关，支持 Tool Use、多模型、异步摄取、Celery 任务队列

项目由 Zylon 公司维护，目标市场为金融、国防、医疗等受监管行业。

---

## 二、整体架构（十维度分析）

### 维度 1：分层架构设计

PrivateGPT 采用经典的 **四层分层架构**：

```
┌─────────────────────────────────────────┐
│          Gradio UI (可选)                │
├─────────────────────────────────────────┤
│     High-Level API (RAG 封装)           │
│  ├── Chat/Messages Router               │
│  ├── Ingest Router (文档摄取)            │
│  └── Embeddings Router                  │
├─────────────────────────────────────────┤
│     Low-Level API (原语暴露)             │
│  ├── 嵌入生成                            │
│  └── 上下文块检索                         │
├─────────────────────────────────────────┤
│     Components Layer (组件层)            │
│  ├── LLMComponent                       │
│  ├── EmbeddingComponent                 │
│  ├── VectorStoreComponent               │
│  ├── IngestComponent                    │
│  └── ParseComponent                     │
├─────────────────────────────────────────┤
│     LlamaIndex 核心抽象                  │
│  (LLM, BaseEmbedding, VectorStore等)    │
└─────────────────────────────────────────┘
```

关键设计原则：
- **API 层**（`private_gpt/server/`）：每个 API 模块包含 `*_router.py`（FastAPI 路由）和 `*_service.py`（业务逻辑）
- **组件层**（`private_gpt/components/`）：每个组件负责为 LlamaIndex 抽象提供具体实现
- **极简抽象**：尽可能少的中间层，直接使用 LlamaIndex 原生类型

### 维度 2：依赖注入机制

PrivateGPT 使用 Python `injector` 库实现依赖注入，这是其最核心的架构决策之一。`di.py` 模块管理全局和事件循环级别的 Injector 实例：

```python
# 核心 DI 容器管理
_global_injector: Injector | None = None

def create_application_injector() -> Injector:
    _injector = Injector(auto_bind=True)
    _injector.binder.bind(Settings, to=unsafe_typed_settings)
    return _injector
```

所有 Component 类使用 `@singleton` + `@inject` 装饰器：

```python
@singleton
class LLMComponent:
    @inject
    def __init__(self, settings: Settings, llm_registry: LLMRegistry) -> None:
        ...
```

DI 带来的好处：
- **解耦**：Service 层只依赖抽象（LlamaIndex 的 `LLM`、`BaseEmbedding`），不关心具体实现
- **可测试性**：轻松替换 mock 实现
- **生命周期管理**：Singleton 保证全局单例，支持 async loop 级别的隔离

### 维度 3：模型管理与发现

`LLMComponent` 实现了完整的模型生命周期管理：

1. **静态配置**：从 `settings.models` 读取已配置的模型
2. **自动发现**：通过 `auto_discover_models` 从 OpenAI 兼容 API 自动发现可用模型
3. **工厂注册**：使用 `LLMFactoryRegistry` 按模式（mode）查找工厂并创建实例
4. **别名系统**：支持模型别名，默认模型自动注册为 `default` 别名
5. **降级策略**：单个模型初始化失败时跳过，但默认模型失败则抛出异常

```python
# 模型初始化流程
for model_id, model_config in self.llm_models.items():
    factory = self.factory_registry.get_factory(model_config.mode)
    instance = factory.create_llm(model_config)
    self.registry.register(model_id, instance, aliases=aliases)
```

EmbeddingComponent 采用完全相同的模式管理嵌入模型，支持独立的 API base 和 API key。

### 维度 4：RAG 管道实现

RAG 管道是 PrivateGPT 的核心，分为**摄取**和**查询**两条链路：

**摄取链路**（IngestComponent）：
1. 文件解析（ParseComponent）→ 文档节点
2. 去重检测（基于文件哈希）
3. 元数据附加（artifact_id, collection, LLM/Embedding model, file_hash）
4. 嵌入生成 → 向量存储
5. 支持节点复用（同哈希不同 artifact 可复用已有节点）

**查询链路**（ChatService → ChatRouter）：
1. 接收消息历史 → 构建 LlamaIndex ChatRequest
2. 检索相关上下文块（VectorIndexRetriever）
3. Prompt 工程 + LLM 生成
4. 支持流式/非流式响应
5. 支持 Tool Use（工具调用）和引用标注

### 维度 5：向量存储层

`VectorStoreComponent` 提供了可插拔的向量存储：

- **默认后端**：Qdrant（合作伙伴）
- **工厂模式**：通过 `VectorStoreFactory` 抽象支持多种后端
- **逻辑多租户**：通过 `logical_multitenancy` 配置，使用元数据过滤实现集合隔离
- **检索器配置**：支持 `similarity_top_k`、`score_threshold`、元数据过滤组合

```python
# 多租户过滤
if self.logical_multitenancy and collection:
    tenancy_filter = MetadataFilter(key=MetadataKeys.COLLECTION.value, value=collection)
    filters = MetadataFilters(filters=[tenancy_filter, filters], condition=FilterCondition.AND)
```

### 维度 6：API 兼容性设计

PrivateGPT 遵循并扩展了 OpenAI API 规范：

- **Chat Messages API**：`POST /v1/messages` — 兼容 Anthropic 消息格式（非 OpenAI chat/completions）
- **Embeddings API**：`POST /v1/embeddings`
- **Artifacts API**：`POST /v1/artifacts` — 文档摄取端点

值得注意的是，PrivateGPT 的消息格式更接近 Anthropic 的 Messages API 而非 OpenAI 的 Chat Completions：
- 支持 `content_block` 数组（text、tool_use、tool_result 类型）
- 流式使用 SSE 事件：`message_start`、`content_block_delta`、`message_stop`
- 响应包含 `stop_reason`（`end_turn`、`tool_use`）和 `usage` 统计

### 维度 7：配置系统

`settings.py` 定义了全面的 Pydantic 配置模型，涵盖：

| 配置域 | 关键字段 |
|--------|---------|
| ServerSettings | host, port, cors, auth, network, debug_mode, max_workers |
| NetworkSettings | offline_mode, proxy (HTTP/SOCKS5), SSL (证书/验证) |
| LLMModelConfig | name, mode, api_base, api_key, temperature 等 |
| EmbeddingModelConfig | name, mode, embed_dim, api_base 等 |
| VectorStoreSettings | database, embed_dim, multitenancy, default_collection |
| IngestionSettings | enabled, allow_ingest_from |
| DoclingSettings | table_mode, code_mode, math_mode, image_classifier, OCR 语言 |

配置通过 YAML 文件加载（`settings_loader.py`），支持环境变量覆盖，Pydantic 严格校验。

### 维度 8：文档摄取与解析

IngestComponent 实现了企业级的文档处理管道：

- **多源输入**：支持 Base64 文件、URI（S3/HTTP）、纯文本
- **智能去重**：基于文件哈希的三层检测（同 artifact → 跨 artifact 复用 → 全新处理）
- **进度通知**：通过 `notify_progress` 上下文管理器支持实时进度回调
- **异步摄取**：支持 Celery 任务队列（可选），包含 parse_task 和 store_vectors_task 两阶段
- **错误处理**：区分解析错误（ParseErrors）和加载错误（LoadErrors），支持部分成功
- **高级解析**：集成 Docling 支持表格、代码、数学公式、图像的智能提取

### 维度 9：安全与认证

- **HTTP Basic Auth**：通过 `AuthSettings` 配置，所有 API 路由使用 `Depends(authenticated)` 保护
- **CORS**：可配置的跨域策略，支持 origins 白名单和正则匹配
- **网络隔离**：`offline_mode` 支持完全断网运行
- **代理支持**：HTTP/HTTPS/SOCKS4/SOCKS5 代理，支持独立认证
- **SSL/TLS**：自定义 CA 证书、证书目录、SSL 验证开关
- **数据主权**：所有处理在本地完成，无数据外传

### 维度 10：扩展性与可插拔设计

PrivateGPT 的扩展性体现在多个层面：

**模型层扩展**：
- 通过 `LLMFactoryRegistry` / `EmbeddingFactoryRegistry` 注册新工厂
- 支持 LlamaCPP、OpenAI、Ollama 等多种后端
- 模型自动发现减少配置负担

**存储层扩展**：
- `VectorStoreFactory` 抽象支持 Qdrant、Chroma 等多种向量数据库
- `NodeStoreComponent` 分离节点存储和向量存储

**解析层扩展**：
- `ParseComponent` 支持链式 reader（pdf-inspector-hybrid → docling → vision）
- 可配置的 OCR、表格、代码、数学公式提取模式

**API 层扩展**：
- FastAPI Router 模式，新增 API 只需添加 router + service
- 支持 Tool Use 扩展 LLM 能力
- Celery 异步任务支持大规模文档处理

---

## 三、核心源码目录结构

```
private_gpt/
├── di.py                          # 依赖注入容器管理
├── settings/settings.py           # 全局配置（Pydantic models）
├── server/                        # API 层
│   ├── chat/chat_router.py        # Chat/Messages 端点
│   ├── chat/chat_service.py       # Chat 业务逻辑
│   ├── ingest/ingest_router.py    # 文档摄取端点
│   ├── embeddings/embeddings_router.py  # 嵌入生成端点
│   └── utils/auth.py              # 认证中间件
├── components/                    # 组件层
│   ├── llm/llm_component.py       # LLM 管理
│   ├── embedding/embedding_component.py  # 嵌入模型管理
│   ├── vector_store/vector_store_component.py  # 向量存储
│   ├── ingest/ingest_component.py # 文档摄取管道
│   └── ingest/parse_component.py  # 文档解析
└── paths.py                       # 路径常量
```

---

## 四、架构评价

### 优势
1. **真正的隐私保障**：从架构层面保证数据不外泄（offline_mode + 本地推理）
2. **依赖注入解耦**：使用 Python Injector 实现了 Go/Java 级别的 DI 体验
3. **LlamaIndex 深度集成**：直接使用 LlamaIndex 抽象，避免重复造轮子
4. **生产就绪**：认证、CORS、代理、SSL、异步任务队列一应俱全
5. **API 标准化**：兼容 OpenAI/Anthropic API 格式，降低迁移成本

### 局限
1. **Python Injector 较重**：相比 FastAPI 自带的 Depends，学习曲线更陡
2. **LlamaIndex 强耦合**：核心抽象全部依赖 LlamaIndex，切换框架成本高
3. **配置复杂度**：大量 Pydantic 嵌套模型，新手上手困难
4. **异步混合**：部分地方 asyncio.run() 嵌套调用，可能导致事件循环问题

### 对 OpenMate 的启示
- **组件化设计**：LLM/Embedding/VectorStore 分离是可复用的模式
- **模型自动发现**：减少用户配置负担的理念值得借鉴
- **进度通知机制**：`notify_progress` 上下文管理器可用于长任务 UI 反馈
- **逻辑多租户**：通过元数据过滤而非物理隔离实现集合隔离，轻量实用
