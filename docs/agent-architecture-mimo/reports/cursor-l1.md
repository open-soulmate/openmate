# Cursor — Deep Source Report

**Repo:** getcursor/cursor  
**Product:** Cursor — AI code editor / coding agent (closed-source commercial product)  
**Source verification:** NOT OPEN SOURCE. The GitHub repo is issues/marketing only (README 622 bytes fetched). Public architecture reconstructed from official docs (`docs.cursor.com`).  
**Date:** 2026-09-13

---

## 1. What it actually is

Cursor is a **VS Code fork** with an integrated coding agent. Product surfaces:

| Mode | Role |
|------|------|
| **Agent** | Multi-file autonomous edits, terminal, browser, MCP |
| **Plan Mode** | Scope/design before applying changes |
| **Tab / autocomplete** | Inline next-edit prediction |
| **Chat / Ask** | Q&A over codebase |
| **Bugbot / review** | PR review |

It is the dominant "AI IDE" commercial product. Unlike open-source alternatives (Continue, Cline, Roo), **no agent loop source is public**.

### Why this report is different

| Aspect | Open-source reports in this series | Cursor |
|--------|-------------------------------------|--------|
| Source files cited | Yes, via jsDelivr/raw GitHub | **No** — repo is issues-only |
| Constants (timeouts, retries) | Extracted from code | **Not available** |
| Architecture | Verified from imports/classes | **Inferred** from docs + product |
| Gap honesty | "file not fetched" | "**product is closed**" |

We document everything the public surface actually supports and mark the rest unavailable. No invented constants.

---

## 2. Verified public facts (docs.cursor.com)

### Model matrix (VERIFIED from docs)

Cursor hosts many models with explicit context windows:

| Model | Provider | Default ctx | Max ctx | Caps |
|-------|----------|-------------|---------|------|
| Claude 4.5 Sonnet | Anthropic | 200k | 1M | Agent, Thinking, Images |
| Claude 4.6 Opus | Anthropic | 200k | 1M | Agent, Thinking, Images |
| Claude 4.7 Opus | Anthropic | 300k | 1M | Agent, Thinking, Images |
| Claude Opus 5 | Anthropic | 300k | 1M | Agent, Thinking, Images |
| Claude Sonnet 5 | Anthropic | 200k | 1M | Agent, Thinking, Images |
| Composer 2.5 | **Cursor** | 200k | - | Agent, Thinking, Images |
| GPT-5.x / Codex | OpenAI | 272k | up to 1M | Agent, Thinking, Images |
| Gemini 3.x | Google | 200k | 1M | Agent, Thinking, Images |
| Grok 4.5 / 4.6 | Cursor×SpaceXAI | 256k | - | Agent, Thinking |
| Kimi K3 | Moonshot | 200k | 1M | Agent, Thinking, Images |
| GLM 5.2 | Z.ai | 200k | - | Agent, Thinking |
| Muse Spark 1.3 | Meta | 300k | 1M | Agent, Thinking, Images |

**First-party models:** Composer (Cursor), Grok 4.5/4.6 (joint with SpaceXAI).

### Pricing/ops notes from docs (VERIFIED strings)

- Many models **"Hidden by default"** — opt-in.
- **"Requires Max Mode on legacy request-based plans"** for 1M-context variants.
- Claude 4.5 Haiku: Bedrock/Vertex regional endpoints **+10% surcharge**; cache writes **1.25x**, reads **0.1x**.
- Claude 4 Sonnet 1M: **2x cost when input exceeds 200k tokens**.
- Gemini 3 Pro Image Preview: image output **$120/1M tokens** (~$0.134 per 1K/2K image).
- GPT-5.4+: **90% discount on cached input tokens**.
- GPT-5.4 Fast: 15% faster, **2x pricing**.
- Claude Fable 5/5.1: ~2x Opus cost; guardrail-tripped requests auto-route to Opus; Fable 5.1 prompt-cache reads $0.25/M (75% below standard cache-read rate).
- Thinking variants: **"counts as 2 requests in legacy pricing"**.

### Customization surface (from docs nav)

```
Plugins, Skills, MCPs, Rules — "from one place"
```

- **Rules** — project/user instructions (`.cursor/rules` or similar).
- **MCP** — Model Context Protocol servers.
- **Skills** — reusable agent capabilities.
- **Plugins** — extensions.

### Integrations (docs)

GitHub, GitLab, Azure DevOps, Bitbucket, JetBrains, Slack, Linear.

### Capabilities taxonomy (docs)

`Agent`, `Thinking`, `Images` per model — capabilities are first-class product metadata, not implicit.

---

## 3. Inferred architecture (NOT source-verified — marked)

What the public surface strongly implies:

```
Cursor Client (VS Code fork)
    ├─ Indexer (codebase embeddings / structural index)
    ├─ Agent runtime
    │    ├─ Planner (Plan Mode)
    │    ├─ Tool executor (edit, terminal, browser, search)
    │    ├─ MCP client
    │    └─ Context builder (rules + skills + retrieval)
    ├─ Tab model (first-party autocomplete)
    └─ Cloud relay
         ├─ Model router (Anthropic/OpenAI/Google/first-party)
         ├─ Cache / usage metering
         └─ Privacy / retention controls
```

**Evidence for cloud relay:** usage-based pricing, Max Mode, model routing, privacy mode, regional Bedrock/Vertex surcharges.

**Evidence for local indexing:** "Understand your code / Trace how a repo fits together" + standard AI-IDE practice. Exact index tech (embeddings vs AST vs both) is **not public**.

**Evidence for first-party models:** Composer 2.5 and Grok 4.5/4.6 listed with Cursor as provider.

---

## 4. What we can compare to open-source peers

| Concern | Cursor (public signal) | Open-source analog |
|---------|------------------------|--------------------|
| Context window | 200k–1M, model-dependent | Config per provider |
| Max Mode | Paid tier for long ctx | Just raise `max_tokens` / use 1M models |
| Cache pricing | Explicit 1.25x write / 0.1x read (Anthropic) | Same if you pass cache flags |
| Thinking = 2 requests | Legacy plan quirk | N/A |
| Capabilities flags | Agent/Thinking/Images | Schema fields |
| Rules | User/project rules files | CLAUDE.md, AGENTS.md, .cursorrules |
| MCP | First-class | mcp client libs |
| Skills | Productized | Skill markdown packs |
| Privacy mode | Enterprise | Self-host |

---

## 5. Product modes (docs nav — VERIFIED labels)

| Mode | Docs claim |
|------|------------|
| **Understand your code** | "Trace how a repo fits together and find the right places to start" |
| **Plan and build features** | "Scope changes, use Plan Mode, and ship bigger work with confidence" |
| **Find and fix bugs** | "Reproduce issues, narrow the root cause, and verify the fix" |
| **Review changes** | "Inspect diffs, run checks, and catch problems before you merge" |
| **Customize Cursor** | "Add plugins, skills, MCPs, and rules from one place" |
| **Connect your workflow** | GitHub, GitLab, Azure DevOps, Bitbucket, JetBrains, Slack, Linear |

**Plan Mode** is called out by name as a first-class mode — not just a prompt prefix. This is a product-level state machine (plan → approve → apply), even though transition internals are private.

---

## 6. Pricing mechanics extracted from model notes (VERIFIED strings)

These are real operational constraints from the docs table:

| Mechanic | Detail |
|----------|--------|
| Long-context surcharge | Claude 4 Sonnet 1M: **2x cost when input > 200k tokens** |
| Extended context (no surcharge) | Claude 4.5+ Sonnet/Opus, Kimi K3: "Up to 1M tokens at the same per-token rates" |
| Cache pricing (Anthropic) | writes **1.25x**, reads **0.1x** |
| Bedrock/Vertex | regional endpoints **+10% surcharge** |
| Thinking variants | "counts as **2 requests** in legacy pricing" |
| Fast modes | GPT-5 Fast **2x price**; GPT-5.4 Fast 15% faster **2x pricing**; Opus 4.8 fast **3x lower** per-token than Opus 4.7 fast |
| Cached input discount | GPT-5.4 family: **90% discount** on cached input tokens |
| Image output | Gemini 3 Pro Image Preview: **$120/1M tokens** (~$0.134 per 1K/2K image) |
| Fable 5.1 cache reads | **$0.25/M**, "75% below the standard cache-read rate" |
| Max Mode | Required for many 1M-context / newest models on "legacy request-based plans" |
| Hidden by default | Majority of models require opt-in |

This table is the closest thing to an "operational constants" source available for Cursor.

---

## 7. Failure / recovery (NOT public)

**Gap — cannot verify from source or docs we fetched:**

- Agent step retry policy
- Tool timeout constants
- Context compaction thresholds
- Index freshness / re-index triggers
- Rate-limit handling / queue depth
- Sandbox model for terminal commands
- How Plan Mode state transitions to Agent apply

Do **not** assume these match any open-source project. They are proprietary.

---

## 8. What OpenClaw-class systems can learn (from public product choices)

1. **Capabilities as explicit model metadata** (`Agent`, `Thinking`, `Images`) — UI and router can gate features per model.
2. **Hidden-by-default models** — reduce choice paralysis; power users opt in.
3. **Separate Plan Mode from apply mode** — scope before mutate.
4. **First-party models** for latency/cost-critical paths (Composer for tab/agent).
5. **Cache pricing surfaced in product docs** — operators can reason about cost.
6. **Rules + Skills + MCP + Plugins in one customization hub** — not four scattered config systems.
7. **Long-context as a paid "Max Mode"** — economic control on 1M windows (Claude 2x over 200k is a real Anthropic charge they pass through).
8. **Joint models** (Grok with SpaceXAI) — differentiation via exclusive weights.
9. **Per-model default vs max context** — default 200–300k, max 1M; don't force 1M cost on every request.
10. **Promotional pricing windows** documented in-model notes (e.g. GPT-5.6 Sol through Nov 21, 2026) — time-bound commercial levers.

---

## 9. Honest gaps (critical)

| Item | Status |
|------|--------|
| Agent loop source | **NOT AVAILABLE** |
| Tool implementations | **NOT AVAILABLE** |
| Indexing algorithm | **NOT AVAILABLE** |
| Retry/timeout constants | **NOT AVAILABLE** |
| Context compaction | **NOT AVAILABLE** |
| Server-side routing | **NOT AVAILABLE** |
| getcursor/cursor GitHub code | Issues-only; no implementation |
| docs.cursor.com deep pages | Agent internals pages not all fetched |

This report is **product-architecture documentation**, not a source audit. Any "constant" here is from public docs tables (context windows, surcharge percentages), not from code.

### What would be needed for a true source audit

Cursor would need to publish (or an insider leak) the agent loop, tool registry, index implementation, and retry policy. The community reverse-engineering of `.cursor/rules` format and tab model behavior exists but is unofficial and out of scope here.

---

## 11. Source citations

- `https://cdn.jsdelivr.net/gh/getcursor/cursor@main/README.md` (622 bytes — marketing/issues pointer)
- `https://docs.cursor.com/en/context/rules` (fetched; landed on models/docs index)
- `https://docs.cursor.com/en/agent/chat/modes` (fetched; same docs shell)
- Models table content is from the live docs page returned in those fetches.

For implementation details, only Cursor's own blog/changelog and reverse-engineering communities discuss internals — **out of scope for source-verified reporting**.

### Follow-up sources (not fetched this session)

- `https://cursor.com/docs/models-and-pricing` (canonical pricing page)
- `https://cursor.com/changelog` (feature history)
- `https://cursor.com/blog` (architecture posts, if any)
- `.cursor/rules` format docs (customization)

### Verification status summary

| Claim type | Status |
|------------|--------|
| Model names and providers | VERIFIED from docs table |
| Context window numbers | VERIFIED from docs table |
| Capability flags | VERIFIED from docs table |
| Pricing multipliers (2x, 1.25x, 0.1x, +10%) | VERIFIED from docs notes |
| Product mode names | VERIFIED from docs nav |
| Integration list | VERIFIED from docs nav |
| Agent loop behavior | **NOT AVAILABLE** |
| Tool timeouts / retries | **NOT AVAILABLE** |

---

*Report depth: public model matrix, pricing mechanics, product modes, and capability flags are documented from official docs. All runtime internals are explicitly marked NOT AVAILABLE. This is not a source-code audit.*
