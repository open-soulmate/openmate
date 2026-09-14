# 44. Semantic Router 架构深度分析

> 项目：[aurelio-labs/semantic-router](https://github.com/aurelio-labs/semantic-router)
> Stars: 3,893 | License: MIT | 语言: Python | 版本: 0.1.2

Semantic Router 是一个**超高速语义决策层**，通过向量空间的语义相似度替代 LLM 推理来做出路由决策。其核心理念是：与其等待缓慢的 LLM 生成来决定调用哪个工具，不如用语义向量的余弦相似度在毫秒级完成决策。

---

## 1. 整体架构与模块划分

项目采用清晰的四层分层架构：

```
semantic_router/
├── route.py          # Route 模型定义
├── schema.py         # 核心数据结构（Message、SparseEmbedding、Metric、Utterance 等）
├── linear.py         # 底层向量相似度计算（纯 numpy）
├── routers/          # 路由器层（核心决策引擎）
│   ├── base.py       # BaseRouter — 所有路由器的基类
│   ├── semantic.py   # SemanticRouter — 纯密集向量路由
│   └── hybrid.py     # HybridRouter — 稠密+稀疏混合路由
├── encoders/         # 编码器层（22+ 种实现）
│   ├── base.py       # DenseEncoder / SparseEncoder 基类
│   ├── openai.py, cohere.py, huggingface.py, clip.py, vit.py ...
│   └── bm25.py, tfidf.py, fastembed.py ...
├── index/            # 索引存储层（向量数据库适配）
│   ├── base.py       # BaseIndex 接口
│   ├── local.py      # LocalIndex — 内存 numpy 索引
│   ├── hybrid_local.py # HybridLocalIndex — 混合本地索引
│   ├── pinecone.py   # PineconeIndex
│   ├── qdrant.py     # QdrantIndex
│   └── postgres.py   # PostgresIndex（pgvector）
├── llms/             # LLM 层（用于动态路由）
│   ├── base.py       # BaseLLM
│   ├── openai.py, cohere.py, llamacpp.py, mistral.py ...
│   └── openrouter.py, zure.py
└── utils/            # 工具函数
    ├── defaults.py   # 默认编码器配置
    ├── function_call.py # 函数调用工具
    └── logger.py     # 日志
```

这种分层设计的核心思想是**策略模式**：路由器（Router）是不变的决策框架，编码器（Encoder）、索引（Index）、LLM 是可替换的策略组件。

---

## 2. Route 模型设计

`Route` 是语义路由的基本决策单元，代表一条"意图路径"：

```python
class Route(BaseModel):
    name: str                              # 路由名称，如 "politics"、"chitchat"
    utterances: List[str]                  # 示例语句列表，用于构建语义空间
    description: Optional[str] = None      # 路由描述
    function_schemas: Optional[List[Dict]] # 关联的函数 schema（用于动态路由）
    llm: Optional[BaseLLM] = None          # 可选的 LLM（用于动态路由参数提取）
    score_threshold: Optional[float] = None # 匹配阈值
    metadata: Optional[Dict[str, Any]] = None # 附加元数据
```

关键设计点：
- **utterances 是路由的"灵魂"**：每条路由通过一组示例语句定义其语义边界，这些语句被编码为向量后构成该路由在语义空间中的"领地"
- **静态路由 vs 动态路由**：普通路由只返回路由名；动态路由（带 `function_schemas` 和 `llm`）还能提取参数并执行函数调用
- **score_threshold** 是路由级别的阈值控制，允许不同路由有不同的匹配严格度

---

## 3. 路由器核心 — BaseRouter

`BaseRouter` 是整个框架的核心引擎，约 800+ 行代码，承担以下职责：

**初始化流程：**
1. 接收 encoder、routes、index、llm 等组件
2. 验证路由唯一性（去重检查）
3. 将 routes 编码为向量并写入 index
4. 通过 hash 机制同步本地与远程状态

**核心 `__call__` 决策流程：**
1. 将用户输入文本通过 encoder 编码为向量
2. 在 index 中执行 top-k 近邻搜索
3. 按路由名聚合分数（支持 mean/max/sum 等策略）
4. 应用 score_threshold 过滤
5. 返回匹配的 `RouteChoice`（含路由名和分数），无匹配返回 `None`

**同步机制（auto_sync）：**
- 通过 `_get_hash()` 计算本地路由配置的哈希值
- 与 index 中存储的远程哈希对比
- 支持 "local"（本地覆盖远程）、"remote"（远程覆盖本地）、"error"（冲突报错）三种策略
- 使用 `UtteranceDiff` 计算本地与远程的差异，执行精确的增量同步

**阈值优化（fit 方法）：**
- 通过随机搜索优化每个路由的 score_threshold
- 使用 `threshold_random_search` 在搜索空间中迭代寻找最优阈值
- 内置 `evaluate` 方法评估准确率

---

## 4. SemanticRouter — 纯密集向量路由

`SemanticRouter` 是最基础的路由器实现，仅使用 DenseEncoder：

```python
class SemanticRouter(BaseRouter):
    def _encode(self, text: list[str], input_type: EncodeInputType) -> np.ndarray:
        match input_type:
            case "queries":
                xq = np.array(self.encoder(text))
            case "documents":
                xq = np.array(self.encoder(text))
        return xq
```

核心特性：
- 支持 **非对称编码**（AsymmetricDenseMixin）：查询和文档使用不同的编码策略，如 Cohere embed-v3 的 search_query vs search_document 模式
- 提供同步和异步两条编码路径（`_encode` / `_async_encode`）
- add 方法将路由 utterances 编码后写入 index，同时维护本地路由列表

---

## 5. HybridRouter — 混合路由

`HybridRouter` 同时使用 DenseEncoder 和 SparseEncoder（如 BM25），是框架中最复杂的路由器：

**核心机制 — Alpha 混合：**
```python
dense_emb = dense_emb * (1 - self.alpha)  # 默认 alpha=0.3，密集权重 70%
sparse_emb = sparse_emb * self.alpha       # 稀疏权重 30%
```

- `alpha` 参数控制稀疏 vs 密集的权重比例
- 默认 alpha=0.3，意味着密集向量权重更大（适合语义理解），稀疏向量作为关键词匹配的补充
- HybridRouter 的 score_threshold 自动按 alpha 缩放：`threshold = encoder.threshold * alpha`

**FittableMixin：**
- 稀疏编码器（如 BM25、TF-IDF）需要在路由数据上 `fit` 后才能使用
- 每次添加新路由后自动重新 fit
- 这是密集编码器（预训练模型）和稀疏编码器（统计模型）的本质区别

**评估体系：**
- `_vec_evaluate` 方法批量评估准确率
- `evaluate` 接口支持 batch_size 参数处理大数据集
- 阈值优化同样支持混合向量

---

## 6. 编码器体系（Encoders）

编码器层是框架的"感知层"，支持 **22+ 种编码器**，覆盖文本、图像、多模态：

**密集编码器（DenseEncoder 子类）：**
| 编码器 | 说明 |
|--------|------|
| OpenAIEncoder | OpenAI text-embedding-3 系列 |
| CohereEncoder | Cohere embed-v3，支持非对称编码 |
| HuggingFaceEncoder | 本地 HuggingFace 模型 |
| GoogleEncoder | Google Vertex AI 嵌入 |
| BedrockEncoder | AWS Bedrock 嵌入 |
| MistralEncoder | Mistral AI 嵌入 |
| JinaEncoder | Jina AI 嵌入 |
| VoyageEncoder | Voyage AI 嵌入 |
| OllamaEncoder | 本地 Ollama 模型 |
| LiteLLMEncoder | 通过 LiteLLM 统一接口 |
| NvidiaNimEncoder | NVIDIA NIM 嵌入 |

**稀疏编码器（SparseEncoder 子类）：**
| 编码器 | 说明 |
|--------|------|
| BM25Encoder | 经典 BM25 算法 |
| TFIDFEncoder | TF-IDF 算法 |
| FastEmbedEncoder | FastEmbed 稀疏嵌入 |
| AurelioSparseEncoder | Aurelio 自研稀疏编码 |

**多模态编码器：**
| 编码器 | 说明 |
|--------|------|
| CLIPEncoder | OpenAI CLIP 图文双模态 |
| ViTEncoder | Vision Transformer 图像编码 |

**关键设计模式：**
- `AsymmetricDenseMixin`：支持查询/文档非对称编码（encode_queries vs encode_documents）
- `AsymmetricSparseMixin`：稀疏编码器的非对称版本
- `FittableMixin`：需要在数据上拟合的编码器接口
- 所有编码器都支持同步 `__call__` 和异步 `acall`

---

## 7. 索引存储层（Index）

索引层抽象了向量存储和检索，支持本地和远程两种模式：

| 索引类型 | 说明 | 适用场景 |
|----------|------|----------|
| LocalIndex | 内存 numpy 数组 | 开发测试、小规模 |
| HybridLocalIndex | 内存密集+稀疏双索引 | HybridRouter 本地 |
| PineconeIndex | Pinecone 云向量数据库 | 生产环境、大规模 |
| QdrantIndex | Qdrant 向量数据库 | 自托管生产环境 |
| PostgresIndex | pgvector 扩展 | 已有 PostgreSQL 的环境 |

**BaseIndex 核心接口：**
- `add(embeddings, routes, utterances, ...)` — 添加向量
- `query(vector, top_k, route_filter, sparse_vector)` — 相似度搜索
- `delete(route_name)` — 按路由名删除
- `get_utterances(include_metadata)` — 获取所有 utterance
- `_read_hash()` / `_write_hash()` — 配置同步哈希
- `_init_index()` — 延迟初始化（允许先创建对象再设置维度）

**元数据策略：**
- 所有索引统一使用 `sr_route`、`sr_utterance`、`sr_function_schema` 三个元数据字段
- `parse_route_info` 函数从元数据中提取路由信息
- 附加元数据通过 `additional_metadata` 字段透传

---

## 8. 动态路由与函数调用

Semantic Router 支持**动态路由**——不仅返回路由名，还能提取参数并调用函数：

**工作流程：**
1. 用户输入匹配到某个 Route
2. Route 携带 `function_schemas`（JSON Schema 格式的函数定义）和 `llm`
3. 构造 prompt，将用户输入和函数 schema 发送给 LLM
4. LLM 返回结构化参数（通过 `<config></config>` 标签包裹）
5. 解析参数后执行函数调用

**支持的 LLM：**
- OpenAILLM、CohereLLM、MistralAILLM
- LlamaCppLLM（完全本地）
- OpenRouterLLM（聚合多模型）
- AzureOpenAILLM

这种设计使 Semantic Router 能够作为 Agent 的**工具选择器**，替代传统的 function calling 流程。

---

## 9. 同步与持久化机制

框架提供了完善的配置同步机制：

**配置序列化：**
- `RouterConfig` 类支持 JSON/YAML 文件的导入导出
- 支持从 index（远程）反向加载配置
- 支持从 tuple 列表快速构建

**本地-远程同步（auto_sync）：**
```
本地 hash ←→ 远程 hash
  ↓ 不匹配时
UtteranceDiff 计算差异
  ↓
local_delete / local_upsert / remote_delete / remote_upsert
  ↓
写入新 hash
```

三种同步策略：
- `"local"` — 本地配置覆盖远程
- `"remote"` — 远程配置覆盖本地
- `"error"` — 不一致时报错

---

## 10. 向量相似度计算

`linear.py` 是最底层的计算模块，纯 numpy 实现：

```python
def similarity_matrix(xq: np.ndarray, index: np.ndarray) -> np.ndarray:
    index_norm = norm(index, axis=1)
    xq_norm = norm(xq.T)
    sim = np.dot(index, xq.T) / (index_norm * xq_norm)
    return sim

def top_scores(sim: np.ndarray, top_k: int = 5) -> Tuple[np.ndarray, np.ndarray]:
    top_k = min(top_k, sim.shape[0])
    idx = np.argpartition(sim, -top_k)[-top_k:]  # O(n) top-k 选择
    scores = sim[idx]
    order = np.argsort(scores)  # 排序
    return scores[order], idx[order]
```

关键优化：
- 使用 `np.argpartition` 实现 O(n) 复杂度的 top-k 选择，而非 O(n log n) 的全排序
- 支持余弦相似度（cosine）、点积（dotproduct）、欧氏距离（euclidean）、曼哈顿距离（manhattan）四种度量

---

## 架构总结

Semantic Router 的核心架构优势：

1. **极致的速度**：向量相似度计算替代 LLM 推理，路由决策从秒级降到毫秒级
2. **高度可插拔**：22+ 编码器、5 种索引、7 种 LLM 自由组合
3. **稠密+稀疏混合**：HybridRouter 结合语义理解和关键词匹配的优势
4. **多模态支持**：CLIP/ViT 编码器使路由不仅限于文本
5. **动态路由能力**：结合 LLM 实现参数提取和函数调用
6. **完善的同步机制**：hash + diff + 策略三者协作，保证本地与远程一致性
7. **阈值自优化**：内置随机搜索阈值优化器，自动调优路由准确率
8. **全异步支持**：所有核心操作都有 async 版本，适合高并发场景

**适用场景**：意图识别、工具选择（Agent function calling 替代）、内容分类、多模态路由、客服分流、对话状态管理。
