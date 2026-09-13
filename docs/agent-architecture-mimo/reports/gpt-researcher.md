# gpt-researcher — Deep Source Report

**Repo:** assafelovic/gpt-researcher  
**Branch analyzed:** `master`  
**Source verification:** LIVE via jsDelivr (`cdn.jsdelivr.net/gh/assafelovic/gpt-researcher@master/...`). Files fetched: `gpt_researcher/agent.py`, `config/variables/default.py`, `config/config.py`, `skills/researcher.py`, `skills/writer.py`, `actions/query_processing.py`, `context/compression.py`, `memory/embeddings.py`, `actions/web_scraping.py`.  
**Date:** 2026-09-13

---

## 1. What it actually is

GPT-Researcher is an autonomous research agent that:

1. Plans sub-queries from a user question.
2. Searches multiple retrievers in parallel.
3. Scrapes and summarizes sources into a compressed context.
4. Writes a long-form report (basic, detailed, or deep-research).

It is a **research pipeline orchestrator**, not a general tool-using agent. The main class is `GPTResearcher` in `gpt_researcher/agent.py`; orchestration lives in `skills/researcher.py` (`ResearchConductor`) and `skills/writer.py` (`ReportGenerator`).

---

## 2. Hardcoded defaults (`gpt_researcher/config/variables/default.py`)

These are real constants from source:

```python
DEFAULT_CONFIG: BaseConfig = {
    "RETRIEVER": "tavily",
    "EMBEDDING": "openai:text-embedding-3-small",
    "SIMILARITY_THRESHOLD": 0.42,
    "FAST_LLM": "openai:gpt-4o-mini",
    "SMART_LLM": "openai:gpt-4.1",
    "STRATEGIC_LLM": "openai:o4-mini",
    "FAST_TOKEN_LIMIT": 3000,
    "SMART_TOKEN_LIMIT": 6000,
    "STRATEGIC_TOKEN_LIMIT": 4000,
    "BROWSE_CHUNK_MAX_LENGTH": 8192,
    "CURATE_SOURCES": False,
    "SUMMARY_TOKEN_LIMIT": 700,
    "TEMPERATURE": 0.4,
    "MAX_SEARCH_RESULTS_PER_QUERY": 5,
    "MEMORY_BACKEND": "local",
    "TOTAL_WORDS": 1200,
    "REPORT_FORMAT": "APA",
    "MAX_ITERATIONS": 3,
    "SCRAPER": "bs",
    "MAX_SCRAPER_WORKERS": 15,
    "SCRAPER_RATE_LIMIT_DELAY": 0.0,
    "MAX_SUBTOPICS": 3,
    "LANGUAGE": "english",
    "REPORT_SOURCE": "web",
    "DEEP_RESEARCH_BREADTH": 3,
    "DEEP_RESEARCH_DEPTH": 2,
    "DEEP_RESEARCH_CONCURRENCY": 4,
    "MCP_STRATEGY": "fast",
    "REASONING_EFFORT": "medium",
    "IMAGE_GENERATION_MAX_IMAGES": 3,
    "IMAGE_GENERATION_ENABLED": False,
    "IMAGE_GENERATION_PROVIDER": "google",
    "IMAGE_GENERATION_MODEL": "models/gemini-2.5-flash-image",
}
```

### Three-tier LLM ladder

| Tier | Default model | Token limit | Used for |
|------|---------------|-------------|----------|
| FAST | `openai:gpt-4o-mini` | 3000 | Summaries, sub-queries |
| SMART | `openai:gpt-4.1` | 6000 | Report writing |
| STRATEGIC | `openai:o4-mini` | 4000 | Planning, subtopic gen |

This separation is the project's main cost/latency lever.

---

## 3. `GPTResearcher` class (`gpt_researcher/agent.py`)

Constructor signature (partial, from source):

```python
def __init__(
    self,
    query: str,
    report_type: str = ReportType.ResearchReport.value,
    report_format: str = "markdown",
    report_source: str = ReportSource.Web.value,
    tone: Tone = Tone.Objective,
    config: Config | None = None,
    subtopics: list | None = None,
    headers: dict | None = None,
    max_subtopics: int = 5,
    mcp_strategy: str | None = None,
    mcp_max_iterations: int | None = None,  # deprecated
    context=None,
    ...
):
```

Key instance state:

```python
self.context = context or []
self.research_conductor = ResearchConductor(self)
self.report_generator: ReportGenerator = ReportGenerator(self)
self.context_manager: ContextManager = ContextManager(self)
self.retrievers = get_retrievers(self.headers, self.cfg)
```

### MCP strategy resolution

`_resolve_mcp_strategy` priority:

1. Explicit `mcp_strategy` parameter.
2. `mcp_max_iterations` (deprecated, logged as warning):
   - `0` → `"disabled"`
   - `1` → `"fast"`
   - `-1` → `"deep"`
3. Config `MCP_STRATEGY`.

MCP auto-added to retrievers **only if user did not set `RETRIEVER` env var** (`_process_mcp_configs`). Respects explicit user choice — good pattern.

### Research ID

`_generate_research_id()` creates a UUID-based id for progress tracking / websocket correlation.

---

## 4. Research conductor (`gpt_researcher/skills/researcher.py`)

Class: `ResearchConductor` (file is ~1000 lines).

### `plan_research(query, query_domains=None)`

Generates sub-queries via FAST_LLM. Stores on researcher.

### `conduct_research()`

Main entry. Flow from source:

1. If `report_type == DeepResearch` and `deep_researcher` exists → `_handle_deep_research()`.
2. Else: generate agent role, plan research, gather context.
3. `self.context = await self.research_conductor.conduct_research()`
4. Optional image pre-generation **before** report writing (better UX).
5. Returns `self.context` (list of strings).

### Web search context path

`_get_context_by_web_search(query, scraped_data, query_domains)`:

```python
# Using asyncio.gather to process the sub_queries asynchronously
context = await asyncio.gather(
    *[
        self._process_sub_query(sub_query, scraped_data, query_domains)
        for sub_query in sub_queries
    ]
)
```

Parallelism = number of sub-queries (not a fixed pool). Combined with `MAX_SCRAPER_WORKERS=15` this can fan out widely.

### Per-sub-query pipeline (`_process_sub_query`)

1. `_search_relevant_source_urls(sub_query, query_domains)` — iterates all configured retrievers.
2. Each retriever: `retriever.search(max_results=cfg.max_search_results_per_query)` via `asyncio.to_thread`.
3. `_scrape_data_by_urls` — concurrent scraping with worker limit.
4. `_extract_content(results)` — chunk to `BROWSE_CHUNK_MAX_LENGTH=8192`.
5. `_summarize_content(query, content)` — FAST_LLM summary capped at `SUMMARY_TOKEN_LIMIT=700`.

### Vectorstore path

`_get_context_by_vectorstore(query, filter)` — uses embedding backend (`MEMORY_BACKEND`, default `"local"`). Skips extra work for `subtopic_report`.

### MCP research path

`_execute_mcp_research_for_queries(queries, mcp_retrievers)` + `_combine_mcp_and_web_context`.  
`_execute_mcp_research(retriever, query)` uses `max_results=cfg.max_search_results_per_query`.

---

## 5. Deep research knobs

From defaults:

```
DEEP_RESEARCH_BREADTH = 3      # parallel branches per level
DEEP_RESEARCH_DEPTH = 2        # recursion depth
DEEP_RESEARCH_CONCURRENCY = 4  # max concurrent deep calls
```

This is a breadth×depth tree (3×2) with concurrency 4 — cheap by default, easily explodable if raised.

Deep research lives in `backend/report_type/deep_research/main.py` (listed in repo tree; not fully fetched this pass).

---

## 6. Report types (from tree + agent.py)

| Type | Module |
|------|--------|
| `ResearchReport` (basic) | `backend/report_type/basic_report/basic_report.py` |
| `DetailedReport` | `backend/report_type/detailed_report/detailed_report.py` |
| `DeepResearch` | `backend/report_type/deep_research/main.py` |
| Subtopic reports | via `max_subtopics` / `MAX_SUBTOPICS` |

`GPTResearcher` constructor: `max_subtopics: int = 5` (API default) while config default is `MAX_SUBTOPICS: 3` — two different knobs; constructor wins when passed.

---

## 7. Scraping

```
SCRAPER = "bs"              # BeautifulSoup
MAX_SCRAPER_WORKERS = 15
SCRAPER_RATE_LIMIT_DELAY = 0.0
BROWSE_CHUNK_MAX_LENGTH = 8192
```

`actions/web_scraping.py` (~3KB) dispatches scrapers. `USER_AGENT` default is a fixed Chrome 119 Edge string — can cause bot-blocking on hardened sites.

`CURATE_SOURCES = False` by default — source curation is opt-in.

---

## 8. Context compression

`gpt_researcher/context/compression.py` (~10KB). Uses embedding similarity with `SIMILARITY_THRESHOLD = 0.42` against `EMBEDDING = openai:text-embedding-3-small`.

Purpose: drop near-duplicate / low-relevance chunks before report writing to stay under model context.

---

## 9. Config loading (`config/config.py`)

`Config` class (~13KB) merges:

1. `DEFAULT_CONFIG` dict.
2. Environment variables (uppercase keys).
3. Constructor overrides.

Env vars like `RETRIEVER`, `FAST_LLM`, `SMART_LLM` are first-class. This is why `_process_mcp_configs` checks `os.getenv("RETRIEVER")` specifically.

---

## 10. Multi-agent layer

Repo tree includes `multi_agents/` (coordinator/executor style) but downloads of `multi_agents/agent.py` and `task.py` returned tiny files (593/85 bytes) — likely path changed or package restructured. **Gap: multi-agent orchestration code not fully source-verified.**

Frontend: Next.js app under `frontend/nextjs/` with websocket hooks (`useWebSocket.ts`), LangGraph component (`Langgraph.js`), research history.

Backend server: `backend/server/` — FastAPI + websocket (`websocket_manager.py`).

---

## 11. Failure / recovery observations

From source structure (not a formal retry framework):

- Retriever calls are per-class; failures typically yield empty result lists rather than raising — pipeline continues with fewer sources.
- Scraping uses worker pool; individual URL failures should not abort gather (standard asyncio pattern; exact exception handling in scraping helpers not fully read).
- No exponential backoff constant found in defaults — `SCRAPER_RATE_LIMIT_DELAY` is the only throttle (default 0).
- MCP has no visible timeout constant in defaults.
- Deep research concurrency 4 is the main flood-control valve.

**Honest gap:** formal retry/backoff/timeout constants were not found as named constants in the files fetched. They may live in retriever implementations (`gpt_researcher/retrievers/*`) which were listed but not all downloaded.

---

## 12. Prompt / report generation

`skills/writer.py` (`ReportGenerator`, ~9KB) uses SMART_LLM / STRATEGIC_LLM depending on report type.  
`TOTAL_WORDS = 1200` guides length.  
`REPORT_FORMAT = "APA"` (also markdown, pdf via reportlab).  
`PROMPT_FAMILY = "default"` — prompt packs swappable.

`actions/report_generation.py`, `actions/query_processing.py`, `actions/agent_creator.py` hold the prompt chains.

---

## 13. What OpenClaw-class systems can learn

1. **Three-tier LLM split** (fast/smart/strategic) with independent token caps — don't use the expensive model for summaries.
2. **Summary token ceiling of 700** per source — aggressive but keeps context bounded.
3. **Chunk length 8192** before summarization — matches common embedding/context sweet spots.
4. **SIMILARITY_THRESHOLD = 0.42** for dedup — tunable, not binary.
5. **Deep research as breadth×depth×concurrency** — explicit productized knobs.
6. **MCP auto-wire only when user didn't set RETRIEVER** — respect operator config.
7. **Image generation before writing** — UX ordering.
8. **Explicit deprecation path** for `mcp_max_iterations` → `mcp_strategy` with warning log.

---

## 14. Honest gaps

- `multi_agents/*` path did not resolve to real source this pass.
- Individual retriever retry/timeout logic (`retrievers/tavily`, `duckduckgo`, `bing`, `exa`, `arxiv`, …) not downloaded.
- Deep research engine body not fully read.
- Compression implementation internals only partially inferred from file presence + defaults.
- jsDelivr may lag `master` slightly.

---

## 15. Source citations (CDN URLs used)

- `https://cdn.jsdelivr.net/gh/assafelovic/gpt-researcher@master/gpt_researcher/agent.py`
- `https://cdn.jsdelivr.net/gh/assafelovic/gpt-researcher@master/gpt_researcher/config/variables/default.py`
- `https://cdn.jsdelivr.net/gh/assafelovic/gpt-researcher@master/gpt_researcher/config/config.py`
- `https://cdn.jsdelivr.net/gh/assafelovic/gpt-researcher@master/gpt_researcher/skills/researcher.py`
- `https://cdn.jsdelivr.net/gh/assafelovic/gpt-researcher@master/gpt_researcher/skills/writer.py`
- `https://cdn.jsdelivr.net/gh/assafelovic/gpt-researcher@master/gpt_researcher/actions/query_processing.py`
- `https://cdn.jsdelivr.net/gh/assafelovic/gpt-researcher@master/gpt_researcher/actions/web_scraping.py`
- `https://cdn.jsdelivr.net/gh/assafelovic/gpt-researcher@master/gpt_researcher/context/compression.py`
- `https://cdn.jsdelivr.net/gh/assafelovic/gpt-researcher@master/gpt_researcher/memory/embeddings.py`
- File tree: `https://data.jsdelivr.com/v1/packages/gh/assafelovic/gpt-researcher@master?structure=flat`

---

*Report depth: defaults and research pipeline are source-verified. Retriever-level retries and multi-agent layer marked as gaps.*
