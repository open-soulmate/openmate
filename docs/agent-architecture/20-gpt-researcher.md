# 20. GPT-Researcher 深度架构分析

> **项目**: [assafelovic/gpt-researcher](https://github.com/assafelovic/gpt-researcher)
> **Stars**: 29k+ | **License**: Apache 2.0 | **语言**: Python
> **定位**: 首个开源深度研究 Agent，支持 Web 和本地数据源的自主研究与报告生成

---

## 1. 整体架构概览

GPT-Researcher 采用 **技能化（Skills-based）分层架构**，核心是一个中央协调 Agent（`GPTResearcher` 类），通过组合多个专职技能模块完成研究流程。架构灵感来自 [Plan-and-Solve](https://arxiv.org/abs/2305.04091) 和 [RAG](https://arxiv.org/abs/2005.11401) 论文。

```
┌─────────────────────────────────────────────────────────┐
│                    GPTResearcher (Agent)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Research  │ │ Context  │ │  Report   │ │   Deep     │  │
│  │ Conductor│ │ Manager  │ │ Generator │ │  Research  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
│       │            │            │              │         │
│  ┌────┴────┐ ┌─────┴─────┐ ┌───┴───┐   ┌─────┴──────┐  │
│  │Retrievers│ │Compressor │ │Writer │   │Source      │  │
│  │(Web/MCP/ │ │(Embedding │ │(LLM)  │   │Curator     │  │
│  │ Local)   │ │ Filtering)│ │       │   │            │  │
│  └─────────┘ └───────────┘ └───────┘   └────────────┘  │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │  Memory  │ │  Config  │ │  LLM     │ │  Browser   │  │
│  │(Embeddings│ │ Manager  │ │ Provider │ │  Manager   │  │
│  │ + Vector) │ │          │ │          │ │            │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Agent 核心类**的初始化展示了其模块化组合设计：

```python
class GPTResearcher:
    def __init__(
        self,
        query: str,
        report_type: str = ReportType.ResearchReport.value,
        report_source: str = ReportSource.Web.value,
        tone: Tone = Tone.Objective,
        source_urls: list[str] | None = None,
        vector_store=None,
        config_path=None,
        websocket=None,
        agent=None,
        role=None,
        parent_query: str = "",
        subtopics: list | None = None,
        mcp_configs: list[dict] | None = None,
        mcp_strategy: str | None = None,
        **kwargs
    ):
```

该构造函数暴露了 **20+ 个可配置参数**，覆盖报告类型、数据源、LLM 角色、MCP 集成等维度，体现了高度可定制性。

---

## 2. 研究编排引擎（Research Conductor）

`ResearchConductor` 是研究流程的核心编排器，负责从查询规划到上下文收集的全流程管理。它实现了 **多数据源路由** 和 **子查询并行执行** 两大关键模式。

```python
class ResearchConductor:
    def __init__(self, researcher):
        self.researcher = researcher
        self._mcp_results_cache = None  # MCP 结果缓存
        self._mcp_query_count = 0       # MCP 查询计数

    async def conduct_research(self):
        # 1. 选择 Agent 角色
        if not (self.researcher.agent and self.researcher.role):
            self.researcher.agent, self.researcher.role = await choose_agent(
                query=self.researcher.query,
                cfg=self.researcher.cfg,
                cost_callback=self.researcher.add_costs,
            )
        # 2. 根据数据源类型路由研究策略
        if self.researcher.source_urls:
            research_data = await self._get_context_by_urls(self.researcher.source_urls)
        elif self.researcher.report_source == ReportSource.Web.value:
            research_data = await self._get_context_by_web_search(...)
        elif self.researcher.report_source == ReportSource.Local.value:
            document_data = await DocumentLoader(self.researcher.cfg.doc_path).load()
            research_data = await self._get_context_by_web_search(...)
        elif self.researcher.report_source == ReportSource.Hybrid.value:
            docs_context = await self._get_context_by_web_search(query, document_data)
            web_context = await self._get_context_by_web_search(query, [])
            research_data = self.researcher.prompt_family.join_local_web_documents(docs_context, web_context)
```

研究编排器支持 **5 种数据源模式**：Web、Local、Hybrid（本地+Web）、Azure Blob、LangChain Documents/VectorStore。每种模式都走独立的上下文收集路径。

---

## 3. Plan-and-Solve 查询分解

GPT-Researcher 的核心创新在于将原始查询分解为多个子查询，然后 **并行执行** 每个子查询的研究。这遵循了 Plan-and-Solve 论文的思想。

```python
async def plan_research_outline(
    query: str,
    search_results: List[Dict[str, Any]],
    agent_role_prompt: str,
    cfg: Config,
    parent_query: str,
    report_type: str,
    retriever_names: List[str] = None,
    **kwargs
) -> List[str]:
    # MCP 作为唯一检索器时跳过子查询生成
    if retriever_names and ("mcp" in retriever_names or "MCPRetriever" in retriever_names):
        mcp_only = (len(retriever_names) == 1 and ...)
        if mcp_only:
            return [query]  # 直接返回原查询

    # 使用 strategic LLM 生成子查询
    sub_queries = await generate_sub_queries(
        query, parent_query, report_type, search_results, cfg, cost_callback, **kwargs
    )
    return sub_queries
```

子查询生成使用 **strategic_llm**（轻量模型），而非主 LLM，以降低成本。生成失败时有 **三级降级策略**：strategic_llm → 限制 token 重试 → smart_llm。

---

## 4. 上下文压缩与检索

上下文管理采用 LangChain 的 `ContextualCompressionRetriever` 管线，实现 **分块 → 嵌入过滤 → 相似度排序** 的三阶段压缩。

```python
class ContextCompressor:
    def __init__(self, documents, embeddings, max_results=5, ...):
        self.similarity_threshold = os.environ.get("SIMILARITY_THRESHOLD", 0.35)

    def __get_contextual_retriever(self):
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        relevance_filter = EmbeddingsFilter(
            embeddings=self.embeddings,
            similarity_threshold=self.similarity_threshold
        )
        pipeline_compressor = DocumentCompressorPipeline(
            transformers=[splitter, relevance_filter]
        )
        base_retriever = SearchAPIRetriever(pages=self.documents)
        contextual_retriever = ContextualCompressionRetriever(
            base_compressor=pipeline_compressor, base_retriever=base_retriever
        )
        return contextual_retriever
```

**性能优化**：当文档总量小于阈值（默认 8000 字符）时，跳过昂贵的嵌入计算，直接返回原文：

```python
async def async_get_context(self, query, max_results=5, cost_callback=None):
    total_chars = sum(len(str(doc.get('raw_content', ''))) for doc in self.documents)
    chunk_threshold = int(os.environ.get("COMPRESSION_THRESHOLD", "8000"))
    if total_chars < chunk_threshold and len(self.documents) <= max_results:
        # 快速路径：无需压缩
        direct_docs = [Document(page_content=doc.get('raw_content', ''), metadata=doc)
                      for doc in self.documents[:max_results]]
        return self.prompt_family.pretty_print_docs(direct_docs, max_results)
    # 标准路径：嵌入压缩
    compressed_docs = self.__get_contextual_retriever()
    relevant_docs = await asyncio.to_thread(compressed_docs.invoke, query, **self.kwargs)
```

---

## 5. ContextManager — 多源上下文聚合

`ContextManager` 是上下文管理的统一门面，封装了三种压缩器以适配不同数据源：

```python
class ContextManager:
    def __init__(self, researcher):
        self.researcher = researcher

    async def get_similar_content_by_query(self, query, pages):
        """从网页抓取结果中检索相关内容"""
        context_compressor = ContextCompressor(
            documents=pages,
            embeddings=self.researcher.memory.get_embeddings(),
            prompt_family=self.researcher.prompt_family,
        )
        return await context_compressor.async_get_context(query=query, max_results=10)

    async def get_similar_content_by_query_with_vectorstore(self, query, filter):
        """从向量存储中检索相关内容"""
        vectorstore_compressor = VectorstoreCompressor(
            self.researcher.vector_store, filter=filter, ...
        )
        return await vectorstore_compressor.async_get_context(query=query, max_results=8)

    async def get_similar_written_contents_by_draft_section_titles(
        self, current_subtopic, draft_section_titles, written_contents, max_results=10
    ):
        """从已写内容中检索相关内容（用于子主题报告）"""
        all_queries = [current_subtopic] + draft_section_titles
        results = await asyncio.gather(*[process_query(q) for q in all_queries])
        relevant_contents = set().union(*results)
        return list(relevant_contents)[:max_results]
```

三种压缩器的分工：
- **ContextCompressor**：处理原始网页抓取内容，基于嵌入相似度过滤
- **VectorstoreCompressor**：从已索引的向量库中检索
- **WrittenContentCompressor**：从已生成的报告章节中检索，用于子主题去重

---

## 6. MCP 集成与策略控制

GPT-Researcher 深度集成了 MCP（Model Context Protocol），支持通过外部 MCP 服务器扩展检索能力。系统实现了 **三种 MCP 策略**：

```python
def _get_mcp_strategy(self) -> str:
    """
    MCP 策略优先级：
    1. 实例级设置 (self.researcher.mcp_strategy)
    2. 配置文件设置 (self.researcher.cfg.mcp_strategy)
    3. 默认值 "fast"
    
    策略含义：
    "disabled" = 完全跳过 MCP
    "fast"     = 仅用原始查询运行一次 MCP（默认，性能优先）
    "deep"     = 为每个子查询运行 MCP（全面模式）
    """
    if hasattr(self.researcher, 'mcp_strategy') and self.researcher.mcp_strategy is not None:
        return self.researcher.mcp_strategy
    if hasattr(self.researcher.cfg, 'mcp_strategy'):
        return self.researcher.cfg.mcp_strategy
    return "fast"
```

MCP 结果会被缓存以避免冗余调用：

```python
# Fast 模式下缓存 MCP 结果
if mcp_strategy == "fast":
    mcp_context = await self._execute_mcp_research_for_queries([query], mcp_retrievers)
    self._mcp_results_cache = mcp_context

# 子查询处理时复用缓存
if mcp_strategy == "fast" and self._mcp_results_cache is not None:
    mcp_context = self._mcp_results_cache.copy()  # 复用缓存
```

MCP 与 Web 搜索结果通过 `_combine_mcp_and_web_context` 方法智能合并，确保两种来源的上下文互不覆盖。

---

## 7. 深度研究模式（Deep Research）

`DeepResearchSkill` 实现了递归深度研究，支持 **宽度（breadth）× 深度（depth）** 的二维扩展：

```python
class DeepResearchSkill:
    def __init__(self, researcher):
        self.researcher = researcher
        self.breadth = getattr(researcher.cfg, 'deep_research_breadth', 4)
        self.depth = getattr(researcher.cfg, 'deep_research_depth', 2)
        self.concurrency_limit = getattr(researcher.cfg, 'deep_research_concurrency', 2)
        self.learnings = []
        self.research_sources = []
        self.context = []

    async def generate_search_queries(self, query, num_queries=3):
        """为研究生成 SERP 查询"""
        messages = [
            {"role": "system", "content": "You are an expert researcher generating search queries."},
            {"role": "user", "content": f"Given the following prompt, generate {num_queries} unique search queries...{query}"}
        ]
        response = await create_chat_completion(
            messages=messages,
            llm_provider=self.researcher.cfg.strategic_llm_provider,
            model=self.researcher.cfg.strategic_llm_model,
        )
```

深度研究通过 `ResearchProgress` 追踪进度，上下文总词数限制为 **25000 词**：

```python
MAX_CONTEXT_WORDS = 25000

def trim_context_to_word_limit(context_list: List[str], max_words=MAX_CONTEXT_WORDS):
    """修剪上下文以保持在词数限制内，保留最近/最相关的项"""
    total_words = 0
    trimmed_context = []
    for item in reversed(context_list):  # 从后向前处理，保留最新内容
        words = count_words(item)
        if total_words + words <= max_words:
            trimmed_context.insert(0, item)
            total_words += words
        else:
            break
    return trimmed_context
```

---

## 8. 报告生成管线

`ReportGenerator` 负责将研究上下文转化为结构化报告，支持多种报告类型和子主题管理：

```python
class ReportGenerator:
    def __init__(self, researcher):
        self.research_params = {
            "query": self.researcher.query,
            "agent_role_prompt": self.researcher.cfg.agent_role or self.researcher.role,
            "report_type": self.researcher.report_type,
            "report_source": self.researcher.report_source,
            "tone": self.researcher.tone,
            "websocket": self.researcher.websocket,
            "cfg": self.researcher.cfg,
        }

    async def write_report(self, existing_headers=[], relevant_written_contents=[], ext_context=None, custom_prompt="", available_images=None):
        context = ext_context or self.researcher.context
        report_params = self.research_params.copy()
        report_params["context"] = context
        report_params["custom_prompt"] = custom_prompt
        report_params["available_images"] = available_images

        if self.researcher.report_type == "subtopic_report":
            report_params.update({
                "main_topic": self.researcher.parent_query,
                "existing_headers": existing_headers,
                "relevant_written_contents": relevant_written_contents,
            })
        report = await generate_report(**report_params, **self.researcher.kwargs)
        return report
```

报告生成流程为：**写引言 → 生成子主题 → 为每个子主题生成草稿标题 → 写各章节 → 写结论 → 添加参考文献**。

---

## 9. 多检索器与数据源抽象

系统通过 `get_retrievers` 动态加载检索器，支持 Web 搜索引擎、MCP 服务器、本地文档等多种数据源：

```python
# actions/__init__.py 中的检索器注册
from .retriever import get_retriever, get_retrievers

# ResearchConductor 中的检索器使用
for retriever_class in self.researcher.retrievers:
    if "mcpretriever" in retriever_class.__name__.lower():
        continue  # MCP 检索器走单独路径
    retriever = retriever_class(query, query_domains=query_domains)
    search_results = await asyncio.to_thread(
        retriever.search, max_results=self.researcher.cfg.max_search_results_per_query
    )
    # 区分已含内容的结果和需要抓取的 URL
    for result in search_results:
        url = result.get("href") or result.get("url")
        raw_content = result.get("raw_content") or result.get("body")
        if url and raw_content and len(raw_content) > 100:
            prefetched_content.append({"url": url, "raw_content": raw_content})
        elif url:
            new_search_urls.append(url)
```

系统智能区分 **已含全文的检索结果**（如 PubMed Central）和 **仅返回 URL 的结果**，前者直接使用，后者需额外抓取。

---

## 10. 成本追踪与配置体系

GPT-Researcher 提供了完善的成本追踪机制和分层配置体系：

```python
# agent.py 中的成本追踪
class GPTResearcher:
    # 属性: research_costs, step_costs
    def add_costs(self, cost):
        """累计 API 调用成本"""
        self.research_costs += cost
    
    def get_costs(self):
        return self.research_costs

# config/config.py 中的分层配置
class Config:
    CONFIG_DIR = os.path.join(os.path.dirname(__file__), "variables")

    def __init__(self, config_path=None):
        config_to_use = self.load_config(config_path)
        self._set_attributes(config_to_use)        # 基础属性
        self._set_embedding_attributes()            # 嵌入模型
        self._set_llm_attributes()                  # 多 LLM 类型（fast/smart/strategic）
        self._handle_deprecated_attributes()        # 废弃兼容
        self.mcp_servers = []                       # MCP 服务器配置
        self.mcp_allowed_root_paths = []            # MCP 安全路径

    def _set_attributes(self, config):
        for key, value in config.items():
            env_value = os.getenv(key)  # 环境变量优先于配置文件
            if env_value is not None:
                value = self.convert_env_value(key, env_value, BaseConfig.__annotations__[key])
            setattr(self, key.lower(), value)
```

配置优先级：**环境变量 > JSON 配置文件 > 代码默认值**。系统支持三种 LLM 角色：`fast_llm`（轻量任务）、`smart_llm`（复杂推理）、`strategic_llm`（查询规划），各自有独立的 provider/model/token_limit 配置。

---

## 架构总结

### 核心设计哲学

GPT-Researcher 的设计哲学可以用三个关键词概括：**自主性**、**可组合性**、**成本意识**。

自主性体现在 Agent 可以独立完成从查询理解、信息检索、上下文压缩到报告生成的全流程，无需人工干预。可组合性体现在 Skills-based 架构使得每个模块（检索器、压缩器、写作者、深度研究器）都可以独立替换或扩展。成本意识则贯穿整个系统——从使用轻量 strategic_llm 做查询规划，到嵌入计算的阈值跳过优化，再到分步成本追踪，每一处都体现了对 API 调用成本的精细控制。

### 与其他研究 Agent 的对比

与 OpenAI Deep Research、Perplexity 等闭源方案相比，GPT-Researcher 的核心优势在于：完全开源可审计、支持任意 LLM 提供商、支持 MCP 协议扩展数据源、以及本地文档研究能力。其架构的模块化程度使其成为构建领域专用研究 Agent 的理想基座。

| 维度 | 设计选择 |
|------|---------|
| **核心模式** | Plan-and-Solve + RAG |
| **模块化** | Skills-based 分层（Research/Context/Writer/DeepResearch/Curator） |
| **并行策略** | `asyncio.gather` 并行子查询，`concurrency_limit` 控制深度研究并发度 |
| **上下文管理** | 三级压缩器（Context/Vectorstore/WrittenContent）+ 阈值快速路径 |
| **数据源** | Web/Local/Hybrid/Azure/LangChain 五种模式 + MCP 扩展 |
| **MCP 集成** | disabled/fast/deep 三策略 + 结果缓存 |
| **成本控制** | 分步成本追踪 + strategic_llm 降级策略 |
| **配置体系** | 环境变量 > 配置文件 > 默认值，三种 LLM 角色独立配置 |
| **深度研究** | breadth × depth 递归扩展，25000 词上下文限制 |
| **可观测性** | WebSocket 实时日志 + JSON Handler + 结构化日志 |

GPT-Researcher 的架构精髓在于：**将复杂的研究任务分解为可并行的子任务，通过嵌入相似度过滤海量上下文，最终由 LLM 合成结构化报告**。其 Skills-based 模块化设计使得每个环节（搜索、压缩、写作、深度研究）都可独立替换和扩展。
