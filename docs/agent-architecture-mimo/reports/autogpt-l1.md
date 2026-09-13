# AutoGPT — Deep Source Report

**Repo:** Significant-Gravitas/AutoGPT  
**Version analyzed:** **0.4.7** (classic open-source agent). `master`/`main` listing exceeded jsDelivr's 50MB package limit (`status: 403`). Current README describes the commercial **AutoGPT Platform** (AutoPilot / Agents / Marketplace), which is a different product surface.  
**Source verification:** LIVE via jsDelivr `@0.4.7` for classic agent. Platform internals NOT verified.  
**Date:** 2026-09-13

---

## 1. What it actually is

Two distinct things share this repo name:

| Surface | What | Source status |
|---------|------|---------------|
| **Classic AutoGPT 0.4.x** | Local LLM agent: think → command → repeat, with cycle budget | SOURCE-VERIFIED |
| **AutoGPT Platform (current)** | Cloud agent builder, marketplace, AutoPilot chat, scheduling | README only; code not fetched |

This report documents the **classic agent** from real source, then honestly notes the platform gap.

Current README (verified): 185k+ stars, four product surfaces (AutoPilot, Agents dashboard, Marketplace, self-host). Pushes `platform.agpt.co`. Self-host section exists but details not extracted this pass.

---

## 2. Classic agent architecture (VERIFIED 0.4.7)

```
autogpt/agents/base.py      → BaseAgent (think/prompt/token budget)
autogpt/agents/agent.py     → Agent (execute, plugins, command parse)
autogpt/app/main.py         → run_auto_gpt, run_interaction_loop
autogpt/commands/*.py       → execute_code, file_ops, git, web, shell
autogpt/models/command_registry.py
autogpt/command_decorator.py
autogpt/core/agent/simple.py → newer core agent (separate)
```

### `BaseAgent` (`agents/base.py`)

```python
class BaseAgent(metaclass=ABCMeta):
    def __init__(
        self,
        ...,
        default_cycle_instruction: str = DEFAULT_TRIGGERING_PROMPT,
        cycle_budget: Optional[int] = 1,
        send_token_limit: Optional[int] = None,
        summary_max_tlength: Optional[int] = None,
    ):
        self.cycle_budget = cycle_budget
        self.cycles_remaining = cycle_budget
        self.cycle_count = 0
        self.send_token_limit = send_token_limit or self.llm.max_tokens * 3 // 4
        # summary: max_summary_tlength = summary_max_tlength or self.send_token_limit // 6
```

**Real constants:**

| Constant | Value | Meaning |
|----------|-------|---------|
| `cycle_budget` default | `1` | One unsupervised cycle unless continuous mode |
| `send_token_limit` | `llm.max_tokens * 3 // 4` | Prompt budget = **75%** of model max tokens |
| `summary_max_tlength` | `send_token_limit // 6` | History summary cap ≈ **12.5%** of model max |

### `think()` — one cycle

```python
def think(self, instruction=None, thought_process_id="one-shot"):
    instruction = instruction or self.default_cycle_instruction
    prompt = self.construct_prompt(instruction, thought_process_id)
    prompt = self.on_before_think(prompt, thought_process_id, instruction)
    raw_response = create_chat_completion(
        prompt, self.config,
        functions=get_openai_command_specs(self.command_registry)
        if self.config.openai_functions else None,
    )
    self.cycle_count += 1
    return self.on_response(...)
```

Optional OpenAI function-calling path via command registry specs.

### Prompt construction

```
1. system / ai name+role
2. history (trimmed to send_token_limit - reserve_tokens)
3. cycle_instruction (user message at end)
```

`reserve_tokens += history.max_summary_tlength` then `+= count_message_tokens(append_messages)`. History filled via `add_history_upto_token_limit`.

Overflow guard in `on_before_think`:

```python
if current_tokens_used + tokens_to_add > self.send_token_limit:
    # trim / summarize
```

---

## 3. `Agent.execute` — command path with output guard (VERIFIED)

```python
def execute(self, command_name, command_args, user_input) -> str:
    if command_name is not None and command_name.lower().startswith("error"):
        result = f"Could not execute command: {command_name}{command_args}"
    elif command_name == "human_feedback":
        result = f"Human feedback: {user_input}"
        self.log_cycle_handler.log_cycle(...)
    else:
        for plugin in self.config.plugins:
            if plugin.can_handle_pre_command():
                command_name, arguments = plugin.pre_command(command_name, command_args)
        command_result = execute_command(command_name=command_name, arguments=command_args, agent=self)
        result = f"Command {command_name} returned: {command_result}"

        result_tlength = count_string_tokens(str(command_result), self.llm.name)
        memory_tlength = count_string_tokens(str(self.history.summary_message()), self.llm.name)
        if result_tlength + memory_tlength > self.send_token_limit:
            result = (
                f"Failure: command {command_name} returned too much output. "
                f"Do not execute this command again with the same arguments."
            )

        for plugin in self.config.plugins:
            if plugin.can_handle_post_command():
                result = plugin.post_command(command_name, result)

    if result is None:
        self.history.add("system", "Unable to execute command", "action_result")
    else:
        self.history.add("system", result, "action_result")
    return result
```

**Key design:** if `result_tokens + memory_summary_tokens > send_token_limit`, the result is **replaced entirely** with a failure string that tells the model not to retry the same args. Not truncated — rejected.

Plugin hooks: `pre_command` (can rewrite name/args) and `post_command` (can rewrite result).

---

## 4. Cycle budget & interaction loop (VERIFIED — `app/main.py`)

```python
def _get_cycle_budget(continuous_mode: bool, continuous_limit: int) -> int | None:
    if continuous_mode:
        cycle_budget = continuous_limit if continuous_limit else math.inf
    else:
        cycle_budget = 1
    return cycle_budget
```

| Mode | cycle_budget |
|------|--------------|
| Default | `1` (human check-in every cycle) |
| Continuous with limit N | `N` |
| Continuous without limit | `math.inf` |

### `run_interaction_loop`

```python
cycle_budget = cycles_remaining = _get_cycle_budget(config.continuous_mode, config.continuous_limit)

def graceful_agent_interrupt(signum, frame):
    if cycles_remaining in [0, 1, math.inf]:
        sys.exit()
    logger.info("Interrupt signal received. Stopping continuous command execution.")
    cycles_remaining = 1

while cycles_remaining > 0:
    # ... agent.think + execute ...
    if cycles_remaining == 1:  # last cycle → ask user
        user_feedback, user_input, new_cycles_remaining = get_user_feedback(...)
        # User can alter budget:
        if new_cycles_remaining is not None:
            if cycle_budget > 1:
                cycle_budget = new_cycles_remaining + 1
            cycles_remaining = new_cycles_remaining + 1
        # RESUMING CONTINUOUS EXECUTION message includes cycle_budget
        # Agent used up budget → reset: cycles_remaining = cycle_budget + 1
```

`UserFeedback` enum includes `EXIT`. SIGINT handled by `graceful_agent_interrupt` — forces `cycles_remaining = 1` so the loop asks the user instead of hard-killing mid-command.

---

## 5. Command registry (VERIFIED)

### Decorator (`command_decorator.py`)

```python
AUTO_GPT_COMMAND_IDENTIFIER = "auto_gpt_command"

def command(name, description, parameters, enabled=True, disabled_reason=None, aliases=[]):
    def decorator(func):
        typed_parameters = [
            CommandParameter(
                name=param_name,
                description=parameter.get("description"),
                type=parameter.get("type", "string"),
                required=parameter.get("required", False),
            )
            for param_name, parameter in parameters.items()
        ]
        cmd = Command(name=..., method=func, parameters=typed_parameters, ...)
        wrapper.command = cmd
        setattr(wrapper, AUTO_GPT_COMMAND_IDENTIFIER, True)
        return wrapper
    return decorator
```

Typed parameters with `type`, `description`, `required`. Commands tagged via identifier attribute for discovery.

### Registry (`models/command_registry.py`)

```python
class CommandRegistry:
    def register(self, cmd: Command) -> None
    def unregister(self, command: Command) -> None
    def reload_commands(self) -> None   # module reload + re-register
    def get_command(self, name) -> Command | None
    def call(self, command_name, **kwargs) -> Any
    def command_prompt(self) -> str     # all commands for prompt
    def with_command_modules(modules, config) -> CommandRegistry
    def import_command_module(self, module_name) -> None
```

`with_command_modules` **unregisters commands incompatible with current config** — e.g. disable web search if no API key.

Duplicate register: log warning and overwrite.

---

## 6. Code execution (`commands/execute_code.py`)

```python
def execute_python_file(filename, agent) -> str:
    if we_are_running_in_a_docker_container():
        # execute file_path directly
    client = docker.from_env()
    # pull python image if missing
    container = client.containers.run(...)
    container.wait()
    logs = container.logs().decode("utf-8")
    container.remove()
```

`we_are_running_in_a_docker_container()` = `os.path.exists("/.dockerenv")`.

Nested-container detection avoids Docker-in-Docker when already containerized. Image pull via `docker.APIClient()`. Failure message points users to install Docker.

Also: `execute_shell`, `execute_shell_popen`, `validate_command(command, config)`.

---

## 7. Shipped command modules (from 0.4.7 tree)

```
commands/execute_code.py
commands/file_operations.py
commands/file_operations_utils.py
commands/git_operations.py
commands/image_gen.py
commands/system.py
commands/times.py
commands/web_search.py
commands/web_selenium.py
```

Classic surface: code, files, git, images, system, time, web search, Selenium browser.

---

## 8. Core agent rewrite (`core/agent/simple.py`)

Present in 0.4.7 — a newer `autogpt.core` package with `simple.py` (14KB). Not fully extracted this pass. Indicates an in-progress architecture split (platform-ready core vs legacy app).

---

## 9. Logging

`LogCycleHandler` — structured per-cycle debug logs:

```python
self.log_cycle_handler.log_cycle(ai_name, created_at, cycle_count, data, filename)
```

Logs at: before think (prompt), after think (response), execute (command result), human feedback.

---

## 10. What OpenClaw-class systems can learn

1. **`send_token_limit = max_tokens * 3/4`** — always leave 25% for completion. Simple, portable.
2. **Summary budget = send_limit / 6** — explicit ratio, not magic absolute.
3. **Reject oversized command output** (replace with "don't retry same args") rather than silent truncate — model learns.
4. **cycle_budget vs cycles_remaining** — budget is the policy; remaining is the runtime counter; user can extend mid-run.
5. **SIGINT → cycles_remaining=1** — graceful check-in instead of hard exit.
6. **Plugin pre/post command hooks** — rewrite args/results without forking execute().
7. **Config-aware command registry** — auto-unregister tools that can't work in this environment.
8. **Docker-in-Docker detection** via `/.dockerenv`.
9. **Command decorator with typed parameters** → generates both prompt text and OpenAI function specs.

---

## 11. Honest gaps

- **Current `master` AutoGPT Platform code not fetched** (jsDelivr 403: package >50MB). Platform builders, scheduling, marketplace internals unverified.
- `autogpt/core/agent/simple.py` not fully read.
- LLM retry/backoff in `llm/utils.py` not extracted.
- Selenium/browser command timeouts not read.
- 0.4.7 is **not** current production platform code — treat as historical reference architecture for the classic loop.

---

## 12. Source citations (CDN URLs used)

- `https://cdn.jsdelivr.net/gh/Significant-Gravitas/AutoGPT@0.4.7/autogpt/agents/agent.py`
- `https://cdn.jsdelivr.net/gh/Significant-Gravitas/AutoGPT@0.4.7/autogpt/agents/base.py`
- `https://cdn.jsdelivr.net/gh/Significant-Gravitas/AutoGPT@0.4.7/autogpt/app/main.py`
- `https://cdn.jsdelivr.net/gh/Significant-Gravitas/AutoGPT@0.4.7/autogpt/commands/execute_code.py`
- `https://cdn.jsdelivr.net/gh/Significant-Gravitas/AutoGPT@0.4.7/autogpt/models/command_registry.py`
- `https://cdn.jsdelivr.net/gh/Significant-Gravitas/AutoGPT@0.4.7/autogpt/command_decorator.py`
- `https://cdn.jsdelivr.net/gh/Significant-Gravitas/AutoGPT@0.4.7/autogpt/core/agent/simple.py`
- `https://cdn.jsdelivr.net/gh/Significant-Gravitas/AutoGPT@0.4.7/README.md` (via master README at analysis start)
- File tree: `https://data.jsdelivr.com/v1/packages/gh/Significant-Gravitas/AutoGPT@0.4.7?structure=flat` (302 files)

---

*Report depth: classic 0.4.7 cycle budget, token limits, output rejection, command registry, and interaction loop are source-verified. Current Platform product code explicitly not verified.*
