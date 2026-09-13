# browser-use — Deep Source Report

**Repo:** browser-use/browser-use  
**Version analyzed:** 0.13.10 (`pyproject.toml`)  
**License:** MIT  
**Python:** >=3.11,<4.0  
**Source verification:** LIVE via jsDelivr CDN mirror of `main` (raw.githubusercontent.com was intermittently 404/timeout from this network; jsDelivr `cdn.jsdelivr.net/gh/browser-use/browser-use@main/...` served current files).  
**Date:** 2026-09-13

---

## 1. What it actually is

browser-use is a Python library that turns an LLM into a browser agent. The agent repeatedly:

1. Captures a simplified DOM + optional screenshot from a Chromium browser via CDP.
2. Asks the LLM to pick zero-or-more actions from a typed action registry.
3. Executes those actions with page-change guards.
4. Tracks failures, loops, budget, and optional judge verdicts.

It is **not** a thin Playwright wrapper. As of 0.13.x it has its own CDP client stack (`cdp-use==1.4.5`), event bus (`bubus==1.5.6`), browser session with reconnect watchdogs, skills-as-actions system, message compaction, loop detection, planning, and a judge LLM.

Key dependency evidence from `pyproject.toml`:

```
cdp-use==1.4.5
bubus==1.5.6
mcp==2.1.1
browser-use-sdk==3.4.2
browser-harness==0.1.13
```

Optional `core` extra installs platform wheels `browser-use-core==0.13.3` (darwin/linux/win32, x64+arm64) — a separate native package.

---

## 2. Module map (verified file paths)

| Path | Role |
|------|------|
| `browser_use/agent/service.py` | `Agent` class (~3520 lines) — main loop, retry, fallback, judge |
| `browser_use/agent/views.py` | `AgentSettings`, `AgentState`, `AgentOutput`, `ActionLoopDetector`, `ActionResult` |
| `browser_use/agent/prompts.py` | `SystemPrompt` — template selection by model/mode |
| `browser_use/agent/message_manager/service.py` | Token-budgeted message assembly |
| `browser_use/browser/session.py` | `BrowserSession` (~3499 lines) — CDP lifecycle, reconnect, watchdogs |
| `browser_use/browser/profile.py` | `BrowserProfile` — launch args, timeouts, keep_alive |
| `browser_use/browser/views.py` | `BrowserStateSummary`, `BrowserStateHistory` |
| `browser_use/dom/service.py` | DOM build/serialize (~50KB) |
| `browser_use/dom/views.py` | `DEFAULT_INCLUDE_ATTRIBUTES`, `SimplifiedNode`, selectors |
| `browser_use/utils.py` | `SignalHandler`, model helpers (~31KB) |
| `browser_use/exceptions.py` | `LLMException(status_code, message)` |

**Refactor note (important):** `browser_use/browser/context.py` and `browser_use/browser/browser.py` are now thin re-exports:

```python
from browser_use.browser.profile import BrowserProfile
from browser_use.browser.session import BrowserSession
Browser = BrowserSession
BrowserConfig = BrowserProfile
```

Controller files (`browser_use/controller/service.py`, `registry/service.py`) returned 404 on CDN at analysis time — they appear to have moved into the `browser-use-core` binary wheel or a sibling package. **Gap: action registry implementation not source-verified in this pass.**

---

## 3. Agent loop — concrete constants

From `browser_use/agent/service.py` constructor defaults:

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `max_failures` | `5` | Consecutive failures before force-done |
| `max_actions_per_step` | `5` | Cap on actions LLM may emit per step |
| `step_timeout` | `180` | Seconds per step (wraps `_execute_initial_actions` and steps) |
| `llm_timeout` | auto | 30s Gemini, 90s o3, else 75s (code: `_get_model_timeout`) |
| `max_clickable_elements_length` | `40000` | Char cap for clickable elements in prompt |
| `use_vision` | `True` or `'auto'` | DeepSeek/XAI auto-disabled with warning |
| `llm_screenshot_size` | auto | Claude Sonnet → `(1400, 850)` |
| `final_response_after_failure` | `True` | One recovery LLM call after max_failures |
| `planning_replan_on_stall` | `3` | Consecutive failures before replan nudge |
| `planning_exploration_limit` | `5` | Steps without plan before exploration nudge |
| `loop_detection_window` | `20` | Rolling window for action similarity |
| `loop_detection_enabled` | `True` | |
| `max_history_items` | `None` | Unlimited unless set |

`Agent.run()` default `max_steps=500`.

### Message compaction (`agent/views.py` → `MessageCompactionSettings`)

```
enabled: True
compact_every_n_steps: 25
chars_per_token: 4.0
keep_last_items: 6
summary_max_chars: 6000
```

### Fallback LLM retryable status codes

```python
retryable_status_codes = {401, 402, 429, 500, 502, 503, 504}
```

Also retryable: `ModelRateLimitError`, `ModelOutputTruncatedError`. Once switched to `fallback_llm`, agent stays on fallback (`_using_fallback_llm` flag; no second fallback).

### Empty-action retry

`_get_model_output_with_retry`: if model returns empty action, one retry with clarification message; if still empty, insert safe noop action.

---

## 4. Step pipeline (verified method chain)

From `agent/service.py`:

```
run()
  → browser_session.start()
  → _register_skills_as_actions()
  → asyncio.wait_for(_execute_initial_actions(), timeout=step_timeout)
  → step() loop:
       _prepare_context()          # always include_screenshot=True (cloud sync)
       _maybe_compact_messages()
       _get_next_action()          # asyncio.wait_for(llm, llm_timeout)
       _execute_actions()          # multi_act(...)
       _post_process()             # consecutive_failures bookkeeping
       _finalize()
```

`step()` also does Phase-0 captcha wait via `browser_session.wait_if_captcha_solving()` (non-fatal on error).

### multi_act page-change guards

`multi_act()` docstring (source):

> Two layers of protection prevent executing actions against stale DOM:
> 1. Static flag: actions tagged with `terminates_sequence=True` (navigate, search, go_back, switch) automatically abort remaining queued actions.
> 2. Runtime detection: after every action, the current URL and focused target are compared to pre-action values. Any change aborts the remaining queue.

Additional rules in source:
- `done` action is allowed only as a single action — if it appears at `i > 0`, remaining actions are dropped.
- `wait_between_actions` sleep between actions (default `0.1s` from `BrowserProfile`).
- On `result.error` or `result.is_done`, remaining actions are not executed.

---

## 5. Loop detection (real thresholds)

`ActionLoopDetector` in `agent/views.py`:

- Window: 20 action hashes.
- Hash = `action_name|json.dumps(filtered_params, sort_keys=True)` (None values excluded).
- Page fingerprint: `url`, `element_count`, first 16 chars of SHA-256 of DOM text.

Nudge thresholds (source):

```
max_repetition_count >= 12  → strong warning
max_repetition_count >= 8   → medium warning
max_repetition_count >= 5   → soft heads-up
```

Also tracks `consecutive_stagnant_pages` (same page fingerprint across steps).

---

## 6. Failure and recovery paths

### Connection errors

`_is_connection_like_error` / `_is_browser_closed_error` detect CDP/WebSocket failures.

On connection-like error during step:
```
wait_timeout = browser_session.RECONNECT_WAIT_TIMEOUT
await asyncio.wait_for(browser_session._reconnect_event.wait(), timeout=wait_timeout)
```
If reconnect succeeds → retry step. If reconnect times out → treat as step failure.

`BrowserSession.is_cdp_connected` checks `_cdp_client_root.ws.state is State.OPEN`.

### Consecutive failure accounting

```
max_total_failures = max_failures + int(final_response_after_failure)
```
So with defaults: 5 + 1 = 6 attempts before hard stop.

On any non-error action result, `consecutive_failures` resets to 0.

### Force-done after failures

```python
if consecutive_failures >= max_failures and final_response_after_failure:
    msg = f'You failed {max_failures} times. Therefore we terminate the agent.'
```

### Force-done after last step

```python
msg = 'You reached max_steps - this is your last step. Your only tool available is the "done" tool...'
```

### Budget warning injection

When `steps_used / max_steps` crosses thresholds, injects:
```
BUDGET WARNING: You have used {steps_used}/{max_steps} steps...
```

---

## 7. BrowserSession / BrowserProfile

### Profile defaults (`browser/profile.py`)

```
minimum_wait_page_load_time: 0.25   # seconds before capturing page state
wait_between_actions: 0.1
keep_alive: None                    # keep browser alive after agent run
BROWSERUSE_DEFAULT_CHANNEL = BrowserChannel.CHROMIUM
```

`CHROME_DEFAULT_ARGS` is a large list; `ignore_default_args` can strip them or pass `True` to ignore all.

Default permissions: `['clipboardReadWrite', 'notifications']`.

### Session features (`browser/session.py`)

- Direct CDP via `cdp_use.CDPClient` (not Playwright).
- `ResilientEventBus(EventBus)` — event bus for session + watchdogs.
- Watchdogs: captcha (`captcha_watchdog.py`), reconnect events (`BrowserReconnectingEvent`, `BrowserReconnectedEvent`).
- Cloud browser support: `cloud_profile_id`, `cloud_proxy_country_code`, `use_cloud` / `cloud_browser` (BC alias).
- Target model: `Target(target_id, target_type, url, title)` — pages, iframes, workers.
- `CDPSession(cdp_client, target_id, session_id)` with private `_lifecycle_events`.
- `TimeoutWrappedCDPClient` from `browser_use/browser/_cdp_timeout.py`.

Constructor exposes both cloud-style kwargs (`profile_id`, `proxy_country_code`, `timeout`) and local-launch kwargs (`executable_path`, `headless`, `user_data_dir`, `args`, `cdp_url`).

---

## 8. DOM extraction

`DEFAULT_INCLUDE_ATTRIBUTES` in `dom/views.py`:

```
'title', 'type', 'checked', 'id', 'name', 'role', 'value',
'placeholder', 'data-date-format', 'alt', 'aria-label',
'aria-expanded', 'data-state', 'aria-checked'
```

(`class` is commented out — excluded by default.)

Two serializers:
- Interactive: `DOMTreeSerializer.serialize_tree` with indexes for clicking.
- Eval: `DOMEvalSerializer.serialize_tree` — no interactive indexes, richer attributes, for judge/eval contexts.

`DOMInteractedElement` stores `node_id` and `backend_node_id` for history.

---

## 9. System prompt selection

`SystemPrompt.__init__` picks markdown template files:

| Condition | Template |
|-----------|----------|
| `is_browser_use_model` + flash | `system_prompt_browser_use_flash.md` |
| `is_browser_use_model` + thinking | `system_prompt_browser_use.md` |
| `is_browser_use_model` no thinking | `system_prompt_browser_use_no_thinking.md` |
| Anthropic 4.5 + flash | `system_prompt_anthropic_flash.md` |
| flash + anthropic | `system_prompt_flash_anthropic.md` |
| flash | `system_prompt_flash.md` |
| thinking | `system_prompt.md` |

Claude Opus 4.5 / Haiku 4.5 detected for prompt-cache minimum length (4096+ tokens).  
`override_system_message` replaces entirely; `extend_system_message` appends.  
`SystemMessage(content=prompt, cache=True)` — cache flag set.

Default `SystemPrompt.max_actions_per_step = 3` (note: Agent constructor default is 5 — Agent passes its own value).

---

## 10. Output schema

`AgentBrain` / `AgentOutput`:

```
thinking: str | None
evaluation_previous_goal: str
memory: str
next_goal: str
current_plan_item: int | None
plan_update: list[str] | None
action: list[ActionModel]
```

Variants: `AgentOutputNoThinking`, `AgentOutputFlashMode` (disables evaluation_previous_goal + next_goal, sets use_thinking=False).

`ActionResult`:

```
is_done, success, judgement: JudgementResult | None
error, attachments, images, long_term_memory
extracted_content, include_extracted_content_only_once
metadata, include_in_memory
```

Validation: `success=False` only for actions that fail (enforced in model validator).

`JudgementResult`: `reasoning`, `verdict: bool`, `failure_reason`, `impossible_task`, `reached_captcha`.

---

## 11. Signal handling

`run()` registers `SignalHandler(loop, pause_callback=self.pause, resume_callback=self.resume, custom_exit_callback=on_force_exit_log_telemetry, exit_on_second_int=True)`.

- First Ctrl+C → pause.
- Second Ctrl+C → custom exit telemetry + flush + terminate.

---

## 12. Telemetry

`browser_use/telemetry/service.py` + PostHog (`posthog==7.7.0`). Agent logs `CreateAgentSessionEvent`, `CreateAgentTaskEvent` via eventbus. `_log_agent_event(max_steps=..., agent_run_error=...)` on force exit.

---

## 13. What OpenClaw-class systems can learn

1. **Page-change guards in multi-action execution** — static `terminates_sequence` + runtime URL/focus diff. Avoids stale-DOM cascade failures.
2. **Loop detector with graded nudges (5/8/12)** — soft prompt injection before hard abort.
3. **Fallback LLM with sticky switch** and explicit retryable status-code set.
4. **Always-capture screenshots** even when `use_vision=False` (for cloud sync/debug) — cheap now.
5. **Compaction settings as dataclass** with chars_per_token heuristic, not opaque "context full" logic.
6. **Reconnect event bus** separate from step failure counting.
7. **Template matrix by model family** (Anthropic 4.5 cache-length, flash, no-thinking) rather than one prompt.
8. **max_clickable_elements_length=40000** as a hard prompt-size guard on DOM-derived content.

---

## 14. Honest gaps

- **Controller / action registry source not fetched** (404 on `browser_use/controller/*` at CDN). Actions are defined somewhere outside the main package tree or inside `browser-use-core` wheel.
- **`browser-use-core` is a binary wheel** — native/compiled portion not inspectable.
- **Cloud browser backend** (`cloud_profile_id`, `use_cloud`) is an API client; server implementation is not in this repo.
- **Skills system** (`_register_skills_as_actions`) exists in agent/service.py but the SkillService implementation was not fetched (`memory/service.py` also 404).
- raw.githubusercontent.com was unreliable from this network; jsDelivr may lag `main` slightly.

---

## 15. Source citations (absolute CDN URLs used)

- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/pyproject.toml`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/agent/service.py`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/agent/views.py`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/agent/prompts.py`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/agent/message_manager/service.py`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/browser/session.py`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/browser/profile.py`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/browser/views.py`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/dom/views.py`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/dom/service.py`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/utils.py`
- `https://cdn.jsdelivr.net/gh/browser-use/browser-use@main/browser_use/exceptions.py`

---

*Report depth: source-verified architecture with real constants. Controller/action-registry internals marked as gap.*
