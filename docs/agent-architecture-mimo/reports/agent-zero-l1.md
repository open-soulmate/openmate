# agent-zero — Deep Source Report

**Repo:** frdel/agent-zero  
**Branch analyzed:** `main`  
**Source verification:** LIVE via jsDelivr. Verified: root `agent.py` (1408 lines, 61KB), `initialize.py`, `run_ui.py`. File tree listing verified (414 files). Many helper paths under `python/helpers/` returned CDN 404 (possibly gitignored or different layout).  
**Date:** 2026-09-13

---

## 1. What it actually is

agent-zero is a **personal AI assistant framework** with:

- A **monologue loop** (LLM talks to itself until it emits a final response tool).
- **Extension hooks** at every lifecycle point (message_loop_start, prompts_before/after, hist_add_*, system_prompt, etc.).
- **Sub-agents** and prompt-file overrides per agent type.
- Web UI (`run_ui.py`) + CLI.

It is closer to a "OS for an agent" than a fixed pipeline — almost everything is extension-driven.

---

## 2. Core classes (VERIFIED from `agent.py`)

### `AgentContext`

Per-session context. Registry pattern:

```python
AgentContext.get(id)
AgentContext.use(id)
AgentContext.current()
AgentContext.set_current(ctxid)
AgentContext.first()
AgentContext.all()
AgentContext.remove(id)
AgentContext.generate_id()
```

Holds:
- `agent0` — root agent reference
- log, notification manager
- `communicate(msg, broadcast_level=1)`
- `run_task(...)`
- `nudge()` — injects `fw.msg_nudge.md` system message
- `reset()`, `kill_process()`, `is_running()`
- data bag: `get_data` / `set_data` / `get_output_data` / `set_output_data` (with `recursive` flag for subagents)

### `LoopData`

Passed through the monologue loop:

```python
class LoopData:
    user_message: history.Message | None
    history_output: list[history.OutputMessage]
    protocol_temporary: OrderedDict
    protocol_persistent: OrderedDict
    extras_temporary: OrderedDict
    extras_persistent: OrderedDict
    iteration: int          # incremented each loop
    params_temporary: dict  # cleared each iteration
    system: list[str]
```

**Design:** `protocol_*` and `extras_*` are injectable context channels. Temporary ones clear each turn; persistent ones survive.

### `Agent`

```python
def __init__(self, number: int = 0, name: str = "Agent Zero", ...):
    self.history = history.History(self)
    self.last_user_message: history.Message | None = None
```

---

## 3. Monologue loop (VERIFIED)

`async def monologue(self)` — the heart:

```
loop:
  loop_data = LoopData(user_message=last_user_message)
  call extensions "monologue_start"
  while True:  # message loop until response tool
    loop_data.iteration += 1
    loop_data.params_temporary.clear()
    call extensions "message_loop_start"
    prompt = await prepare_prompt(loop_data)
    call extensions "before_main_llm_call"
    # stream LLM with reasoning_callback + stream_callback
    #   → "reasoning_stream_end", "response_stream_end"
    call extensions "message_loop_result"
    if tools_result:  # final response tool emitted
      break
  call extensions "message_loop_end"
call extensions "monologue_end"
```

There is **no hardcoded max iteration count** in `agent.py` itself — termination is by the LLM calling a response tool, or by exception/kill. Extensions or outer UI enforce limits.

---

## 4. Prompt assembly (VERIFIED — `prepare_prompt`)

```python
async def prepare_prompt(self, loop_data: LoopData) -> list[BaseMessage]:
    await extension.call_extensions_async("message_loop_prompts_before", ...)

    responses_history.start_prompt(loop_data)
    loop_data.system = await self.get_system_prompt(loop_data)
    loop_data.history_output = self.history.output()

    await extension.call_extensions_async("message_loop_prompts_after", ...)

    system_text = files.remove_code_fences("\n\n".join(loop_data.system), language="json")

    protocol = self._build_context_message(
        "agent.context.protocol.md", "protocol",
        {**loop_data.protocol_persistent, **loop_data.protocol_temporary},
        include_empty=False,
    )
    extras = self._build_context_message(
        "agent.context.extras.md", "extras",
        {**loop_data.extras_persistent, **loop_data.extras_temporary},
        include_empty=True,
    )
    loop_data.protocol_temporary.clear()
    loop_data.extras_temporary.clear()

    history_langchain = history.output_langchain(protocol + loop_data.history_output + extras)

    full_prompt = [SystemMessage(content=system_text), *history_langchain]
    full_text = ChatPromptTemplate.from_messages(full_prompt).format()
    responses_history.remember_prompt(loop_data, full_text, full_prompt[0], protocol)

    self.set_data(Agent.DATA_NAME_CTX_WINDOW, {
        "text": full_text,
        "tokens": tokens.approximate_prompt_tokens(full_text),
    })
    return full_prompt
```

Key behaviors:
- JSON code fences stripped from system examples.
- Protocol/extras rendered via markdown templates `agent.context.protocol.md` / `agent.context.extras.md`.
- **Context window text + approximate token count stored** on the agent for extensions to inspect.
- Extension hooks can mutate system prompt and history **after** defaults are set.

---

## 5. Extensibility model (VERIFIED)

Decorated with `@extension.extensible`:

| Method | Hook points |
|--------|-------------|
| `handle_exception` | location + exception |
| `get_system_prompt` | extensions append to `system_prompt` list |
| `parse_prompt` | override prompt file resolution |
| `read_prompt` | override prompt loading |
| `hist_add_message` | `hist_add_before` content mutation |
| `hist_add_user_message` | intervention flag for human interrupts |
| `hist_add_ai_response` | |
| `hist_add_warning` | |
| `hist_add_tool_result` | |

From file tree, shipped extensions include:

```
python/extensions/message_loop_end/_10_organize_history.py
python/extensions/message_loop_end/_90_save_chat.py
python/extensions/message_loop_prompts_after/_50_recall_memories.py
python/extensions/message_loop_prompts_after/_51_recall_solutions.py
python/extensions/message_loop_prompts_after/_60_include_current_datetime.py
```

Naming convention: `_NN_description.py` — numeric priority ordering.  
Memory recall and solution recall are **extensions**, not core — drop-in/out.

---

## 6. Exception handling (VERIFIED — notable)

```python
@extension.extensible
async def handle_exception(self, location: str, exception: Exception):
    if exception:
        raise exception  # exception handling is done by extensions
```

Core **always re-raises**. The commented-out block shows previous design (mask secrets, log, `HandledException`). Current design: **extensions own exception policy**. Core is policy-free.

---

## 7. Model access (VERIFIED signatures)

```python
def get_chat_model(self)
def get_utility_model(self)
def get_embedding_model(self)

async def call_utility_model(...)
async def call_chat_model(...)
async def call_chat_model_turn(...)
async def rate_limiter_callback(...)
async def handle_intervention(self, progress: str = "")
async def wait_if_paused(self)
async def process_llm_result_tools(self, llm_result: LLMResult)
```

Three model tiers: chat / utility / embedding.  
`rate_limiter_callback` is a hook — rate limiting is pluggable.  
`handle_intervention` + `wait_if_paused` — human interrupt support in-loop.

OpenAI Responses API state tracking methods present:

```python
_responses_state_for_model
_responses_input_items_since
_responses_input_items_for_message
_remember_llm_result_state
```

---

## 8. History & tokens

- `history.History` + `responses_history` dual tracking.
- `tokens.approximate_prompt_tokens(full_text)` — approximate, not tiktoken-exact (in core path).
- `hist_add_user_message` calls `self.history.new_topic()` — user messages start new history topics.
- Intervention messages use a different template (`intervention=True`).

---

## 9. Sub-agents & prompts

```python
def parse_prompt(self, _prompt_file, **kwargs):
    dirs = subagents.get_paths(self, "prompts")
    prompt = files.parse_file(_prompt_file, _directories=dirs, _agent=self, **kwargs)
```

Prompt files resolve through a **search path** per subagent type — allows overriding any prompt by dropping a file in the agent's prompt dir. `is_full_json_template` detection strips fences for JSON-shaped prompts.

---

## 10. Entry points

- `run_ui.py` (2.4KB) — UI launcher
- `initialize.py` (3.8KB) — bootstrap
- Root `agent.py` is the framework; `python/` holds API routes (`python/api/*.py` — chat export/load/reset, scheduler, tunnel, upload, etc.)

API surface (from tree): `message`, `message_async`, `poll`, `nudge`, `pause`, `restart`, `rfc`, `scheduler_*`, `ctx_window_get`, `history_get`, `settings_*`.

---

## 11. Failure / recovery (from verified code)

| Mechanism | Where |
|-----------|-------|
| Exception policy delegated to extensions | `handle_exception` |
| Human nudge injection | `AgentContext.nudge()` → `fw.msg_nudge.md` |
| Pause gate in loop | `wait_if_paused()` |
| Intervention | `handle_intervention(progress)` |
| Context window snapshot | `DATA_NAME_CTX_WINDOW` with token estimate |
| Rate limit as callback | `rate_limiter_callback` |

**No hardcoded max_retries / max_loop in core `agent.py`.** Safety limits are expected from extensions or the hosting UI. This is a real risk if extensions are incomplete.

---

## 12. What OpenClaw-class systems can learn

1. **Protocol vs extras context channels** with temporary/persistent split — cleaner than one flat system prompt.
2. **Extension hooks at every hist_add / prompt / loop boundary** — enable memory recall without forking core.
3. **`_NN_name.py` priority-ordered extensions** — simple, greppable.
4. **Core re-raises; extensions decide** — policy stays out of the kernel.
5. **Three model tiers** (chat/utility/embedding) with independent config.
6. **Store ctx window text + approx tokens** on the agent for downstream tools.
7. **Nudge as injectable system message**, not a special API call.
8. **Prompt file search-path overrides** per agent type — no code changes to customize.

---

## 13. Honest gaps

- `python/helpers/*.py` (filesystem, tool_no_overlap, message_processor, agent_zero helpers) returned CDN 404 — helper internals not verified.
- Tool implementation (`process_llm_result_tools` body) not fully read.
- No explicit max-loop constant in core — safety depends on extensions.
- Token counting is approximate — not verified against tiktoken.
- jsDelivr may lag `main`.

---

## 14. Source citations (CDN URLs used)

- `https://cdn.jsdelivr.net/gh/frdel/agent-zero@main/agent.py` (1408 lines)
- `https://cdn.jsdelivr.net/gh/frdel/agent-zero@main/initialize.py`
- `https://cdn.jsdelivr.net/gh/frdel/agent-zero@main/run_ui.py`
- File tree: `https://data.jsdelivr.com/v1/packages/gh/frdel/agent-zero@main?structure=flat` (414 files)

---

*Report depth: monologue loop, prompt assembly, extension model, and history hooks are source-verified. Helper modules and tool executors marked as gaps.*
