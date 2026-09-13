# STORM — Deep Source Report

**Repo:** Stanford-oval/storm  
**Branch analyzed:** `main`  
**Source verification:** LIVE via jsDelivr. Files fetched: `knowledge_storm/storm_wiki/engine.py`, `modules/knowledge_curation.py`, `modules/outline_generation.py`, `modules/article_generation.py`, `modules/persona_generator.py`, `interface.py`, `utils.py`, `lm.py`.  
**Date:** 2026-09-13

---

## 1. What it actually is

STORM (Stanford topic outline research module) writes Wikipedia-like long-form articles by:

1. Generating **perspectives** (personas) for a topic.
2. Running **simulated conversations** per persona that ask questions and search.
3. Building an **outline** from those conversations.
4. Writing **sections in parallel**, each grounded in retrieved references.
5. Optionally **polishing** (adding intro/lead, citations).

It is built on **DSPy** (`dspy.Module`, `dspy.Signature`, `dspy.Predict`). This is not a free-form ReAct agent — it's a structured multi-stage LM pipeline with typed signatures.

Also has a collaborative variant: `knowledge_storm/collaborative_storm/` (Co-STORM) with human-in-the-loop chat.

---

## 2. Pipeline stages (verified)

From `storm_wiki/engine.py` → `STORMWikiRunner`:

```
run_knowledge_curation_module()   → StormInformationTable
run_outline_generation_module()   → StormArticle (outline)
run_article_generation_module()   → StormArticle (sections filled)
run_article_polishing_module()    → polished article
post_run()                        → persist
```

`run()` orchestrates these; each can also be called individually (resume-friendly).

### Module classes

| Stage | Class | File |
|-------|-------|------|
| Persona gen | `StormPersonaGenerator` | `modules/persona_generator.py` |
| Knowledge curation | `StormKnowledgeCurationModule` | `modules/knowledge_curation.py` |
| Outline | `StormOutlineGenerationModule` | `modules/outline_generation.py` |
| Article sections | `StormArticleGenerationModule` | `modules/article_generation.py` |
| Polish | (in `modules/article_polish.py`, listed in tree) | |

---

## 3. Hardcoded runner defaults (`STORMWikiRunnerArguments`)

These are real dataclass field defaults from `engine.py`:

```python
@dataclass
class STORMWikiRunnerArguments:
    output_dir: str                          # required
    max_conv_turn: int = 3                   # Q turns per persona conversation
    max_perspective: int = 3                 # personas to consider
    max_search_queries_per_turn: int = 3     # queries generated per turn
    disable_perspective: bool = False
    search_top_k: int = 3                    # search results per query
    retrieve_top_k: int = 3                  # refs per section title
    max_thread_num: int = 10                 # thread pool size
```

**Effective fan-out per topic:**
- 3 personas × 3 turns × 3 queries × 3 results = up to **81 search hits** before filtering.
- Article generation: up to **10 threads** writing sections concurrently.

Help text on `max_thread_num` explicitly says: *"Consider reducing it if keep getting 'Exceed rate limit' error when calling LM API."*

---

## 4. LM configuration (`STORMWikiLMConfigs`)

Five separate DSPy LM slots with different defaults:

| Slot | Default model | max_tokens |
|------|---------------|------------|
| conv_simulator | `gpt-4o-mini-2024-07-18` | 500 |
| question_asker | `gpt-4o-mini-2024-07-18` | 500 |
| outline_gen | `gpt-4-0125-preview` | 400 |
| article_gen | `gpt-4o-2024-05-13` | 700 |
| article_polish | `gpt-4o-2024-05-13` | 4000 |

Azure variants mirror the same structure with `azure/` prefix.

This is a **purpose-split model budget** — cheap mini for conversation, stronger GPT-4o for generation, high token cap only for polish.

Setters: `set_conv_simulator_lm`, `set_question_asker_lm`, `set_outline_gen_lm`, `set_article_gen_lm`, `set_article_polish_lm`.

---

## 5. Knowledge curation (`modules/knowledge_curation.py`)

### DSPy signatures (typed prompts)

```
AskQuestion
AskQuestionWithPersona
QuestionToQuery
AnswerQuestion
```

### `TopicExpert` module

```python
def __init__(self, engine, max_search_queries: int, search_top_k: int):
    self.max_search_queries = max_search_queries
    self.search_top_k = search_top_k

def forward(self, topic, question, ground_truth_url):
    queries = ...  # QuestionToQuery
    queries = queries[: self.max_search_queries]   # hard cap
    # retrieve search_top_k per query
```

Docstring: *"Filter out unreliable sources."*

### `ConvSimulator` module

```python
def __init__(self, engine, max_search_queries_per_turn, search_top_k, max_turn):
    ...
    self.max_turn = max_turn

def forward(...):
    for _ in range(self.max_turn):
        # AskQuestion → QuestionToQuery → retrieve → AnswerQuestion
```

### Concurrent persona conversations

`StormKnowledgeCurationModule._run_conversation`:

```python
def run_conv(persona):
    ...

max_workers = min(self.max_thread_num, len(considered_personas))
with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
    futures = [executor.submit(run_conv, p) for p in considered_personas]
    # as_completed(...)
```

`_get_considered_personas(topic, max_num_persona)` calls persona generator.

### `WikiWriter`

Separates conversation transcripts into structured `DialogueTurn` objects stored in `StormInformationTable`.

---

## 6. Persona generation

`StormPersonaGenerator` (file ~6.6KB). Uses outline_gen_lm (or dedicated) to propose diverse perspectives. Called with `max_num_persona=self.args.max_perspective` (default 3).

`disable_perspective=True` skips this and uses a single default perspective.

---

## 7. Outline generation (`modules/outline_generation.py`)

### `WriteOutline` module

```python
def __init__(self, engine):
    self.draft_page_outline = dspy.Predict(WritePageOutline)
    # + WritePageOutlineFromConv for improving draft with conversation info
```

Flow:
1. `NaiveOutlineGen.forward(topic)` — draft outline without research.
2. `WritePageOutlineFromConv` — improve outline using information-seeking conversation results.

`generate_outline(..., return_draft_outline=False)` can return `(final, draft)` tuple.

### Signatures

```
WritePageOutline
WritePageOutlineFromConv
```

`WritePageOutlineFromConv` docstring (source): *"Improve an outline for a Wikipedia page. You already have a draft outline that covers the general information. Now you want to improve it based on the information learned from an information-seeking conversation to make it more informative."*

This is the **core STORM insight**: draft-then-revise outline grounded in simulated expert Q&A.

---

## 8. Article generation (`modules/article_generation.py`)

```python
class StormArticleGenerationModule(ArticleGenerationModule):
    def __init__(self, article_gen_lm, retrieve_top_k: int = 3, max_thread_num: int = 10):
        self.max_thread_num = max_thread_num
        self.section_gen = ConvToSection(engine=self.article_gen_lm)
```

`generate_article`:
1. `sections_to_write = article_with_outline.get_first_level_section_names()`
2. Skip `introduction` and sections starting with `conclusion`/`summary` (written later by polish).
3. If no sections → write whole topic as one section with query `[topic]`.
4. Else parallel:

```python
with ThreadPoolExecutor(max_workers=self.max_thread_num):
    for section_title in sections_to_write:
        if section_title.lower().strip() == "introduction":
            continue
        if section_title.lower().strip().startswith(...) or startswith("summary"):
            continue
        # submit generate_section(...)
```

`generate_section`:
```python
queries = section_query
# retrieve retrieve_top_k refs
output = self.section_gen(outline=section_outline, section=section_name, ...)
return {"section_name": ..., "section_content": output.section, ...}
```

---

## 9. Retriever (`interface.py`)

```python
class Retriever:
    def __init__(self, rm: dspy.Retrieve, max_thread: int = 1):
        self.max_thread = max_thread

    def retrieve(self, query, ...):
        def process_query(q):
            ...
        with ThreadPoolExecutor(max_workers=self.max_thread):
            ...
```

`collect_and_reset_rm_usage()` tracks RM API usage for cost accounting.

`STORMWikiRunner.__init__` wires: `self.retriever = Retriever(rm=rm, max_thread=self.args.max_thread_num)`.

---

## 10. Data model (`interface.py`)

### `Information`

```python
def __init__(self, url, description, snippets, title, meta=None):
```
Hashable by URL/content; `_md5_hash` helper for dedup.

### `Article` / `ArticleSectionNode`

Tree structure for the article:
- `add_child(new_child_node, insert_to_front=False)`
- `find_section(...)`
- `get_outline_tree()`
- `get_first_level_section_names()`
- `from_string(topic_name, article_text)` — parse back
- `prune_empty_nodes()`

### `InformationTable` (ABC)

Base for `StormInformationTable` in `storm_dataclass.py` — stores dialogue turns + retrieved info.

---

## 11. LM wrapper (`lm.py`)

~42KB — wraps OpenAI/Azure/other providers into DSPy-compatible `dspy.dsp.LM` / `HFModel` interfaces. Handles retries, caching, logging via `logging_wrapper.py`.

`utils.py` (~31KB) has file I/O, string processing, parallel helpers.

---

## 12. Co-STORM (collaborative)

Tree includes `knowledge_storm/collaborative_storm/`:

```
engine.py
modules/co_storm_agents.py
modules/expert_generation.py
modules/grounded_question_answering.py
modules/grounded_question_generation.py
modules/information_insertion_module.py
modules/knowledge_base_summary.py
modules/simulate_user.py
modules/warmstart_hierarchical_chat.py
modules/article_generation.py
```

This adds:
- Simulated experts + human user in a chat.
- Warm-start hierarchical chat.
- Grounded QA over a live knowledge base.
- Information insertion from turns.

Not fully downloaded this pass — **gap on Co-STORM internals**.

---

## 13. Failure / rate-limit posture

- No formal circuit breaker found.
- The **primary throttle is `max_thread_num=10`** — operators are told to reduce it on rate limits.
- LM layer (`lm.py`) likely has retries but we did not extract named retry constants.
- Each stage is **checkpointable** (load outline/article from local FS via `_load_*_from_local_fs`) — resume without redoing curation.

Checkpoint methods in `STORMWikiRunner`:
```
_load_information_table_from_local_fs
_load_outline_from_local_fs
_load_draft_article_from_local_fs
```

---

## 14. What OpenClaw-class systems can learn

1. **Persona fan-out before research** — 3 perspectives × 3 turns produces diverse queries automatically.
2. **Draft outline → revise with conversation evidence** — avoids one-shot outline bias.
3. **Five LM slots with different models/token caps** — cheapest model for dialogue, strongest for writing, high cap only for polish.
4. **Section-parallel writing** with explicit skip rules for intro/conclusion.
5. **Hard caps everywhere** (search queries per turn, top_k, max_turn, max_perspective) — no unbounded LLM loops.
6. **Stage-level checkpointing** — curation artifacts reusable across outline retries.
7. **`max_thread_num` as the rate-limit valve** — simple, effective, documented in help text.
8. **DSPy signatures** make prompts testable/versionable vs. free-form strings.

---

## 15. Honest gaps

- Co-STORM collaborative engine not source-read.
- `article_polish.py` listed but not fetched.
- `lm.py` retry/backoff constants not extracted (file is 42KB; only structure known).
- `storm_dataclass.py` internals not read.
- DSPy version pin not captured (in `setup.py`, listed in tree but not fetched).
- jsDelivr may lag `main`.

---

## 16. Source citations (CDN URLs used)

- `https://cdn.jsdelivr.net/gh/stanford-oval/storm@main/knowledge_storm/storm_wiki/engine.py`
- `https://cdn.jsdelivr.net/gh/stanford-oval/storm@main/knowledge_storm/storm_wiki/modules/knowledge_curation.py`
- `https://cdn.jsdelivr.net/gh/stanford-oval/storm@main/knowledge_storm/storm_wiki/modules/outline_generation.py`
- `https://cdn.jsdelivr.net/gh/stanford-oval/storm@main/knowledge_storm/storm_wiki/modules/article_generation.py`
- `https://cdn.jsdelivr.net/gh/stanford-oval/storm@main/knowledge_storm/storm_wiki/modules/persona_generator.py`
- `https://cdn.jsdelivr.net/gh/stanford-oval/storm@main/knowledge_storm/interface.py`
- `https://cdn.jsdelivr.net/gh/stanford-oval/storm@main/knowledge_storm/utils.py`
- `https://cdn.jsdelivr.net/gh/stanford-oval/storm@main/knowledge_storm/lm.py`
- File tree: `https://data.jsdelivr.com/v1/packages/gh/stanford-oval/storm@main?structure=flat`

---

*Report depth: runner defaults, stage classes, DSPy signatures, and parallelism model are source-verified. Co-STORM and polish internals marked as gaps.*
