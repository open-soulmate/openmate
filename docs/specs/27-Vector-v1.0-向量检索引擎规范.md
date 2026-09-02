**OpenSoulMate\_Vector\_v1.0\_向量检索引擎规范（定稿冻结）**

**0. 总则**

**0.1 规范目的**

标准化 OpenSoulMate 体系向量引擎的 **Embedding 生成、向量存储、索引构建、相似度检索、知识库召回、向量生命周期管理**。

统一向量维度、模型策略、检索算法、阈值规则、缓存策略，保障全集群知识库检索一致性、高精度、低延迟，支撑 Agent 长记忆、私有知识库、项目知识库、全局公共知识库推理业务。

**0.2 适用范围**

* 全局 Embedding 生成服务
* 向量数据库读写模块
* 知识库切片与向量化流水线
* Artifact 语义检索接口
* Agent 记忆召回模块
* 全体系 RAG 业务链路

**0.3 层级定位**

* 依赖上层：Artifact 知识库规范、ACP 会话业务
* 支撑下层：任务调度、智能体推理、语义问答、文档检索
* 独立数据层：向量数据与业务数据隔离存储

**0.4 基础约束**

* 统一向量维度：固定维度对齐，禁止动态维度
* 统一相似度算法：余弦相似度 cosine\_similarity
* 统一检索阈值：业务默认阈值 0.7
* 字符编码：UTF-8
* 索引策略：增量索引 + 定时全量重建
* 隔离策略：多 namespace 严格数据隔离

**1. 核心数据模型**

**1.1 向量条目标准结构**

|  |
| --- |
| json {  "vectorId": "vec-xxxx",  "artifactId": "art-kb-xxxx",  "namespace": "global|project|agent-private",  "chunkText": "",  "embedding": [],  "dimension": 1024,  "score": 0.0,  "metadata": {  "source": "",  "category": "",  "chunkIndex": 0  },  "createdAt": 1788000000,  "updatedAt": 1788000000 } |

**1.2 切片规则标准**

* 单切片最大长度：**512 token**
* 重叠长度：**64 token**
* 优先语义切片，其次固定长度兜底
* 代码 / 表格 / 配置文件单独分片策略

**2. 标准 RPC 接口**

**2.1 vector/embed 生成 Embedding**

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":1,  "method":"vector/embed",  "params":{  "text":"",  "namespace":"global"  } } |

**2.2 vector/search 语义检索**

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":2,  "method":"vector/search",  "params":{  "query":"",  "namespace":"global",  "topK":5,  "threshold":0.7  } } |

**2.3 vector/index/build 手动构建索引**

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":3,  "method":"vector/index/build",  "params":{  "namespace":"",  "fullRebuild":false  } } |

**2.4 vector/delete 删除向量条目**

|  |
| --- |
| json {  "jsonrpc":"2.0",  "id":4,  "method":"vector/delete",  "params":{  "vectorId":""  } } |

**3. 检索策略规范**

**3.1 阈值分级**

* 高精准场景：阈值 **0.85**
* 常规问答场景：阈值 **0.70**
* 宽泛素材召回：阈值 **0.55**

**3.2 排序规则**

1. 相似度分数降序
2. 时间新内容优先
3. 同分数优先官方 / 全局知识库

**3.3 命名空间隔离强制规则**

* agent-private：仅归属 Agent 可检索
* project：项目内所有 Agent 共享
* global：全集群公开可读

**4. 索引与缓存机制**

1. **增量索引**：新增知识库实时入索引
2. **定时全量重建**：每 6 小时自动重建，修复碎片
3. **检索缓存**：高频 Query 结果缓存 5 分钟
4. **失效清理**：软删除工件对应向量自动过期清理

**5. 错误与异常规范**

严格依从 ErrorCode\_v1.0

* 70001 EMBEDDING\_GENERATE\_FAIL
* 70002 VECTOR\_DB\_CONNECT\_FAIL
* 70003 VECTOR\_DIM\_MISMATCH

**6. 依赖关联规范**

* 上层依赖：Artifact 工件知识库规范
* 错误体系：全局错误码规范
* 链路追踪：全局日志追踪规范

**7. 版本信息**

* 规范版本：v1.0
* 状态：定稿冻结
* 生效时间：2026-09-02
* 兼容策略：维度固定、算法固定，后续增量扩展不破坏兼容

|（注：部分内容可能由 AI 生成）