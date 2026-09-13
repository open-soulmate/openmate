# Warp — Deep Source Report

**Repo:** warpdotdev/warp  
**Product:** Warp — terminal + agentic development environment (closed-source commercial product)  
**Source verification:** ISSUES-ONLY REPO. README (4.6KB) verified via jsDelivr. Client/server implementation is **not public**. Docs site fetches failed (404/transport) this session.  
**Date:** 2026-09-13

---

## 1. What it actually is

Warp is two products:

1. **Warp Terminal** — modern GPU-accelerated terminal with blocks, AI command search, workflows.
2. **Oz** — "orchestration platform for cloud agents": parallel coding agents, programmable, auditable, steerable.

README thesis (VERIFIED quote):

> We built Warp to solve two problems we kept hitting as a team writing software: terminals haven't kept up with how developers work today, and agentic development tools don't scale beyond your laptop.

> **Warp is a modern terminal built for coding with agents.** Warp brings the terminal into the 21st century with modern UI and code editing features. Use Warp's SOTA built-in agent **Oz**, or run CLI coding agents like **Claude Code, Codex, or Gemini CLI**.

> **Oz is an orchestration platform for cloud agents.** Spin up unlimited parallel coding agents that are programmable, auditable, and fully steerable.

---

## 2. Verified repo contents

`warpdotdev/warp` is explicitly:

> This is an **issues-only repo** for Warp where you can submit issues, bugs and feature requests.

No application source. Open-source plan (VERIFIED):

> We are planning to first open-source our **Rust UI framework**, and then parts and potentially all of our **client codebase**. The **server portion of Warp will remain closed-source** for now.

Discussion link: `https://github.com/warpdotdev/Warp/discussions/400`

### Why this report is different

| Aspect | Open-source reports in this series | Warp |
|--------|-------------------------------------|------|
| Source files cited | Yes, via jsDelivr | **README only** |
| Constants (timeouts, retries) | Extracted from code | **Not available** |
| Architecture | Verified from imports/classes | **Inferred** from README + deps list |
| Server internals | Often partially public | **Permanently closed** |

We document README-verified product claims, dependency-implied client stack, and mark all runtime internals unavailable.

### Already open (from README)

| Artifact | Repo |
|----------|------|
| Themes | warpdotdev/themes |
| Workflows (command patterns) | warpdotdev/workflows |
| Extension points | opened "as we go" |

### Dependencies they credit (VERIFIED list)

```
Tokio, NuShell, Fig Completion Specs, Warp Server Framework (seanmonstar/warp),
Alacritty, Hyper, FontKit, Core-foundation-rs, Smol
```

This confirms a **Rust client** (Tokio, Alacritty heritage, Hyper, Smol) and a separate server framework.

---

## 3. Product surface (from README + public knowledge — mixed confidence)

### High confidence (README)

- Terminal with modern UI + code editing.
- Built-in agent: **Oz**.
- Hosts third-party CLI agents: Claude Code, Codex, Gemini CLI.
- Cloud agent orchestration: unlimited parallel agents.
- Oz marketed as programmable / auditable / steerable.
- Product links: `/agents`, `/code`, `/terminal`, `/drive`.
- Weekly releases, typically Thursdays.
- Docs at `docs.warp.dev`; "How Warp Works" blog at `warp.dev/blog/how-warp-works`.

### Medium confidence (public product, not source)

- **Blocks** — command + output as a first-class unit (not raw scrollback).
- **AI command search** — natural language → shell.
- **Workflows** — parameterized command templates (repo exists).
- **Input editor** — IDE-like multiline editing in the terminal.
- **Themes** — GPU-rendered (Alacritty/GPU heritage).
- **Drive** — shared cloud artifacts (product link `/drive`).

### NOT verified this session

- docs.warp.dev agent-management and warp-ai pages returned 404/transport error.
- No numeric constants (timeouts, queue depths, retry counts) available from README.

---

## 4. Architecture inference (NOT source-verified)

```
Warp Client (Rust, Tokio, GPU UI)
    ├─ Terminal emulator (Alacritty-derived)
    ├─ Block-based session model
    ├─ Local agent runtime (Oz client)
    ├─ Host for external CLIs (Claude Code, Codex, Gemini CLI)
    └─ Sync/auth to Warp server

Warp Server (CLOSED)
    ├─ Auth / accounts
    ├─ Oz cloud agent orchestration
    │    ├─ Agent scheduler (parallel)
    │    ├─ Audit log
    │    └─ Steering / interrupt API
    ├─ Workflows / themes distribution
    └─ Drive storage
```

**"Server portion will remain closed-source"** is an explicit, verified commitment. Cloud agent internals are permanently out of reach for source audit.

---

## 5. Oz product claims (VERIFIED README quotes)

| Claim | Exact wording |
|-------|---------------|
| Parallelism | "Spin up **unlimited parallel** coding agents" |
| Programmable | "programmable, auditable, and fully steerable" |
| Automation | "Automate repetitive tasks, build on agents, and run them in parallel in the cloud" |
| Hosted CLIs | "run CLI coding agents like **Claude Code, Codex, or Gemini CLI**" |
| Built-in agent | "**Oz**" described as "SOTA" |
| CTA | `http://warp.dev/oz` |

README also links product surfaces: `/agents`, `/code`, `/terminal`, `/drive`.

**"Drive"** appears as a first-class product (cloud artifacts) — not mentioned in agent context in README but listed next to Agents/Code/Terminal.

---

## 6. Open-source strategy (VERIFIED)

Phased plan from README:

```
Phase 1 (planned):  Open-source Rust UI framework
Phase 2 (planned):  Parts / potentially all of client codebase
Forever closed:     Server portion
```

Already open:

| Repo | Content |
|------|---------|
| `warpdotdev/themes` | Community themes |
| `warpdotdev/workflows` | Command pattern library |
| Extension points | "open-sourcing our extension points as we go" |

Discussion #400 is the canonical roadmap thread.

This is a **moat-preserving openness** strategy: give the community the renderer and extension points; keep orchestration + accounts + billing closed.

---

## 7. Dependency evidence for client stack (VERIFIED README list)

| Crate/library | What it implies |
|---------------|-----------------|
| **Tokio** | Async runtime |
| **Alacritty** | Terminal emulator heritage (GPU) |
| **Hyper** | HTTP client (sync to server) |
| **Smol** | Alternative/lightweight async |
| **NuShell** | Modern shell integration |
| **Fig Completion Specs** | Autocomplete data |
| **FontKit / Core-foundation-rs** | macOS text/rendering |
| **seanmonstar/warp** | Their server framework namesake |

Client is unambiguously **Rust + async + GPU terminal**. Server is a separate long-running service.

---

## 8. Competitive positioning (analysis)

| Dimension | Warp | Open-source peers |
|-----------|------|-------------------|
| Terminal core | Closed (Rust GPU) | Alacritty, WezTerm, Kitty, Ghostty |
| Built-in agent | Oz (cloud) | OpenClaw-style local agents |
| Multi-agent parallel | Oz cloud orchestration | tmux + multiple CLI agents |
| Auditability | Marketed by Oz | DIY logging |
| Third-party CLI hosting | First-class | Just run in any terminal |
| Server | Closed forever | N/A or self-host |
| Workflows | Public repo | Shell scripts, justfile |
| Themes | Public repo | Built-in or user CSS |

Unique claim: **terminal as the agent OS + cloud fan-out**, not a chat sidebar inside an editor (Cursor) and not a local CLI agent (Claude Code / OpenClaw).

---

## 9. What OpenClaw-class systems can learn (from product claims)

1. **Host other agents, don't only build one** — Warp runs Claude Code/Codex/Gemini CLI beside Oz. Terminal as neutral runtime.
2. **Blocks, not scrollback** — treat command+output as addressable objects (enables audit, reuse, diff).
3. **Parallel cloud agents with steering** — "unlimited parallel" + "fully steerable" is the right product grammar for agent fleets.
4. **Audit as a feature**, not a log file — Oz's "auditable" pitch.
5. **Open the UI framework first** — strategic openness that doesn't leak server moat.
6. **Themes/workflows as separate community repos** — extension surface without opening core.
7. **Weekly release cadence** (Thursdays) — predictable shipping.
8. **Issues-only GitHub repo with clear policy** — honest about what's open vs not (unlike projects that imply openness).
9. **Name the cloud orchestrator separately from the terminal** (Oz vs Warp) — clean product split.
10. **Credit upstream deps in README** — Alacritty/Tokio/Hyper heritage builds trust with Rust community.

---

## 10. Honest gaps (critical)

| Item | Status |
|------|--------|
| Client source | **NOT PUBLIC** (Rust UI framework "planned") |
| Server source | **WILL REMAIN CLOSED** (README) |
| Oz agent loop | **NOT AVAILABLE** |
| Retry/timeout/queue constants | **NOT AVAILABLE** |
| docs.warp.dev deep pages | Fetch failed this session |
| Block data model | Not source-verified |
| Steering API | Not source-verified |
| Drive implementation | Not source-verified |

**No code-level constants can be cited.** Anything more specific than the README would be speculation or requires the unreleased Rust UI framework.

### How to deepen later

- Read discussion #400 for open-source milestones.
- Fetch `warpdotdev/workflows` and `warpdotdev/themes` for extension format.
- Monitor for the Rust UI framework release (would unlock client architecture).
- `docs.warp.dev` agent pages when network allows.

---

## 12. Source citations

- `https://cdn.jsdelivr.net/gh/warpdotdev/warp@main/README.md` (4,569 bytes) — sole source-verified artifact
- `https://github.com/warpdotdev/warp/discussions/400` — open-source roadmap (referenced in README)
- `https://docs.warp.dev` — fetched, 404/transport errors this session
- `https://warp.dev/blog/how-warp-works` — linked from README, not fetched

### Follow-up sources (not fetched this session)

- `https://github.com/warpdotdev/workflows` — command pattern format
- `https://github.com/warpdotdev/themes` — theme schema
- `https://docs.warp.dev/getting-started/changelog` — weekly release notes
- Oz product page `http://warp.dev/oz` — capability marketing

---

*Report depth: product thesis, open-source policy, Oz claims, and dependency list are source-verified from README. All runtime architecture is inferred or marked NOT AVAILABLE. This is not a source-code audit.*
