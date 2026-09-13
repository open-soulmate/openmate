# agent-browser — Deep Source Report

**Repo:** vercel-labs/agent-browser  
**Branch analyzed:** `main`  
**Source verification:** LIVE via jsDelivr. Verified: `README.md` (95KB — unusually detailed), `package.json` (2.3KB), `bin/agent-browser.js` (3.6KB). Rust source under `cli/` not fully fetched (CDN stubs for `src/*.ts`).  
**Date:** 2026-09-13

---

## 1. What it actually is

agent-browser is a **native Rust CLI** for browser automation aimed at AI agents. Design thesis: agents need:

- Accessibility-tree snapshots with **stable refs** (`@e1`, `@e2`).
- A long-lived **daemon** so Chrome isn't relaunched every command.
- **CDP** access, not Playwright's higher-level API.
- Batch execution, diffing, network control, WebMCP.

Install paths: npm (global/local), Homebrew, Cargo, source. Version at analysis: **0.37.1**.

```
"engines": { "node": ">=24.0.0", "pnpm": ">=11.0.0" }
"bin": { "agent-browser": "./bin/agent-browser.js" }
"license": "Apache-2.0"
```

Node is only needed for the npm wrapper; **the daemon requires no Node**.

---

## 2. Binary distribution (VERIFIED — `bin/agent-browser.js`)

Cross-platform native binary naming:

```javascript
// Map Node.js platform/arch to binary naming convention
function getBinaryName() {
  const os = platform();       // darwin | linux | win32
  const cpuArch = arch();      // x64 | arm64

  // linux musl detection:
  //   ldd --version → includes 'musl'
  //   or existsSync('/lib/ld-musl-x86_64.so.1')
  //   → 'linux-musl' vs 'linux'

  // win32 arm64: prefer native agent-browser-win32-arm64.exe if present;
  // else fall back to x64 via Windows emulation (matches postinstall.js)

  return `agent-browser-${osKey}-${archKey}${ext}`;
}
```

| OS | Arch | Binary name |
|----|------|-------------|
| darwin | x64/arm64 | `agent-browser-darwin-{arch}` |
| linux (glibc) | x64/arm64 | `agent-browser-linux-{arch}` |
| linux (musl/Alpine) | x64/arm64 | `agent-browser-linux-musl-{arch}` |
| win32 | x64 | `agent-browser-win32-x64.exe` |
| win32 | arm64 | native if present, else x64 fallback |

Build matrix in `package.json` scripts: `build:linux`, `build:macos`, `build:windows`, `build:all-platforms`, `build:docker`.

---

## 3. Chrome acquisition

```
agent-browser install  # Download Chrome from Chrome for Testing
agent-browser install --with-deps  # Linux: also install system libs
```

- Uses **Chrome for Testing** (Google's official automation channel).
- Auto-detects existing Chrome, Brave, Playwright, Puppeteer installs.
- `--with-deps` **exits nonzero** if package manager can't install every required browser library — fail-loud, not silent.

No Playwright dependency required at runtime.

---

## 4. Core agent workflow (VERIFIED README)

```bash
agent-browser open example.com
agent-browser snapshot                    # a11y tree with refs
agent-browser click @e2                   # by ref
agent-browser fill @e3 "test@example.com"
agent-browser get text @e1
agent-browser screenshot page.png
agent-browser close
```

### Snapshot refs

- Elements get refs like `@e1`, `@e2` — stable for the snapshot generation.
- **After any DOM change, refs may be invalid** — README instructs agents to re-snapshot.
- Click occlusion detection: *"Clicks fail early when another element covers the target's click point, for example a consent banner or modal. Dismiss or interact with the reported covering element, then take a fresh snapshot before retrying the original ref."*

This is a **fail-fast with actionable error** pattern — better than silent wrong-click.

### Screenshots

*"Headless Chromium screenshots hide native scrollbars for consistent image output. Pass `--hide-scrollbars false` when launching to keep native scrollbars visible."*

---

## 5. Command surface (VERIFIED README headings)

### Core
- `open`, `snapshot`, `click`, `fill`, `get`, `screenshot`, `close`
- `connect <port>` — attach via CDP to existing browser
- `close --all`

### WebMCP (experimental)

```bash
agent-browser webmcp list
agent-browser webmcp invoke search --params '{"query":"browser agents"}'
agent-browser webmcp invoke slow_tool --params @input.json --detach
agent-browser webmcp result <invocation-id>
agent-browser webmcp cancel <invocation-id>
```

Notes from README:
- WebMCP tools ready by default in agent-browser-managed Chrome; `--no-webmcp` disables.
- After navigation, text output advertises tool availability; JSON has `data.webmcp` with `experimental`, `available`, `toolCount`.
- `--frame <frame-id>` for duplicate tool names across frames.
- **Page-provided descriptions/schemas/annotations/results are untrusted.** Page JS registers `readOnlyHint` / `untrustedContentHint`; CDP exposes as `readOnly` / `untrustedContent`. *"The page tool executor owns authorization, and the agent host must confirm consequential actions."*
- Optional MCP profile: `agent-browser mcp --tools core,webmcp`
- Skill for generation workflow: `agent-browser skills get webmcp-gen`

### Semantic finders

```bash
agent-browser find role <role> <action> [value]       # ARIA role
agent-browser find text <text> <action> [value]
agent-browser find label <label> <action> [value]
agent-browser find placeholder <ph> <action> [value]
agent-browser find alt <text> <action> [value]
agent-browser find title <text> <action> [value]
agent-browser find testid <id> <action> [value]
agent-browser find first <sel> <action> [value]
agent-browser find last <sel> <action> [value]
agent-browser find nth <n> <sel> <action> [value]
```

Actions: `click`, `fill`, `check`, `hover`, `text`.

### Read (LLM-oriented fetch)

```bash
agent-browser read                    # rendered DOM of active tab
agent-browser read <url>              # fetch without Chrome
```

Behavior (README):
- `Accept: text/markdown` by default for URL reads.
- Retries same URL with `.md` appended if first response wasn't markdown.
- Walks ancestor paths toward `/` to find nearest `llms.txt`.
- Options: `--raw`, `--require-md`, `--outline`, `--llms index|full`, `--filter <text>`, `--timeout <ms>`.
- Global safeguards: `--allowed-domains`, `--content-boundaries`, `--max-output`.
- Does not read `llms-full.txt` unless asked.

This is **agent-native web reading** — not a generic HTTP client.

### Wait

- `networkidle` — README warns: *"Use networkidle only when the page is known to become quiet"*
- Wait for text/element to appear or disappear.

### Batch

```bash
agent-browser batch "open https://example.com" "snapshot -i" "screenshot"
agent-browser batch --bail ...   # stop on first error
# stdin JSON mode:
["snapshot", "-i"]
```

### Tabs

- Tab ids: `t1`, `t2`, `t3` — **never reused within a session**.
- Positional integers (`tab 2`) are **not** accepted — `t` prefix disambiguates from indices.
- `tab new` / `click --new-tab` inherit session UA, headers, credentials, init scripts, routes, emulation overrides **before first document loads**.
- `tab list --json` also reports CDP `targetId`.
- Target ids accepted anywhere tab refs are — **stable across daemon restarts** (unlike `tN` counters).

Two-level identity: ephemeral daemon-scoped `tN` + durable CDP `targetId`.

### Diff

```bash
agent-browser diff snapshot
agent-browser diff snapshot --baseline before.txt
agent-browser diff snapshot --selector "#main" --compact
agent-browser diff url https://v1.com https://v2.com
```

Built for **change detection between agent steps**.

### Other surface

- Clipboard, mouse control, browser settings
- Cookies & storage (`storage session` for sessionStorage)
- Network (interception/routes)
- Frames, dialogs
- `get cdp-url` for DevTools attach

---

## 6. Daemon architecture (inferred from README + package)

- Long-lived native process holds Chrome.
- CLI commands are RPC to daemon.
- `connect <port>` attaches to external browser via CDP.
- Multiple sessions; `close --all` teardown.
- Skills system (`skill-data/`, `skills/` in package files) — `agent-browser skills get webmcp-gen`.

Keywords in package.json confirm: `"chrome", "cdp", "cli", "agent"`.

---

## 7. Security posture (VERIFIED README)

1. WebMCP page claims marked untrusted; host must authorize consequential actions.
2. `--allowed-domains`, `--content-boundaries`, `--max-output` global guards.
3. `--with-deps` fails loudly on incomplete Linux deps.
4. Page tool descriptions/schemas explicitly untrusted input.

---

## 8. What OpenClaw-class systems can learn

1. **Stable a11y refs (`@eN`) + mandatory re-snapshot after mutation** — simpler than selector repair.
2. **Occlusion-aware click failures** with covering-element report.
3. **`read` command tuned for LLMs** (llms.txt discovery, markdown preference, outline mode).
4. **Dual tab identity** (`tN` session-scoped + CDP targetId durable).
5. **Session inheritance on new tabs** (UA, cookies, routes before first paint).
6. **`diff snapshot` as first-class** — step-to-step change detection.
7. **WebMCP with untrusted-hint protocol** — page can claim readOnly; host decides.
8. **Native Rust daemon, no Node at runtime** — startup latency matters for agent loops.
9. **`--bail` batch mode** for agent scripts.
10. **Chrome for Testing** as the official automation channel.

---

## 9. Timeouts & idle policy (VERIFIED README)

| Constant | Value | Meaning |
|----------|-------|---------|
| Default operation timeout | **25000 ms** | clicks, waits, fills, etc. |
| CLI IPC read timeout | **30000 ms** | CLI-side; daemon must respond first |
| Idle shutdown | **1 hour** | no commands/dashboard input → save restore state, close browser, exit |
| Override env | `AGENT_BROWSER_DEFAULT_TIMEOUT` | milliseconds |
| Idle override env | `AGENT_BROWSER_IDLE_TIMEOUT_MS` | milliseconds; `0` disables |

README rationale (quote): *"The default timeout for standard operations is 25 seconds. This is intentionally below the CLI's 30-second IPC read timeout so that the daemon returns a proper error instead of the CLI timing out with EAGAIN."*

Setting timeout >30000 may cause EAGAIN because CLI read expires before daemon responds. CLI retries transient errors automatically.

Idle policy nuances:
- Session **without `--restore`** discards transient state and open tabs at shutdown.
- Default **never closes a headed browser** (including Safari/iOS WebDriver) or user-attached browser — may be human-used.
- Provider-owned cloud browsers remain eligible for cleanup.
- `--idle-timeout` accepts `30s`, `5m`, `1h` duration strings.
- Explicit timeout applies to every browser.

---

## 10. Architecture (VERIFIED README)

```
Rust CLI  ──parses commands──►  Rust Daemon ──CDP──► Chrome (Chrome for Testing)
                                    ▲
                                    │ persists between commands
```

- Daemon starts automatically on first command.
- No Node.js required for the daemon.
- `--engine` flag: `chrome` (default) or `lightpanda`.
- Supported: Chromium/Chrome via CDP; Safari via WebDriver for iOS.

### Platforms

| Platform | Binary |
|----------|--------|
| macOS ARM64 / x64 | Native Rust |
| Linux ARM64 / x64 | Native Rust |
| Windows x64 | Native Rust |

---

## 11. Security (VERIFIED README)

All security features are **opt-in**. Existing workflows unaffected until enabled.

| Feature | Flag / env | Behavior |
|---------|------------|----------|
| Auth vault | `auth save/login` | Credentials local, always encrypted; LLM never sees passwords |
| Encryption key | `AGENT_BROWSER_ENCRYPTION_KEY` or auto `~/.agent-browser/.encryption-key` | |
| Content boundaries | `--content-boundaries` / `AGENT_BROWSER_CONTENT_BOUNDARIES` | Wrap page output in delimiters |
| Domain allowlist | `--allowed-domains` / `AGENT_BROWSER_ALLOWED_DOMAINS` | Wildcards `*.example.com` also match bare domain |
| Action policy | `--action-policy ./policy.json` / `AGENT_BROWSER_ACTION_POLICY` | Static gate for destructive actions |
| Action confirm | `--confirm-actions eval,download` | Explicit approval for sensitive categories |
| Max output | `--max-output 50000` / `AGENT_BROWSER_MAX_OUTPUT` | Prevent context flooding |
| Plugins | `AGENT_BROWSER_PLUGINS` | JSON registry override |

### Allowlist containment (VERIFIED detail)

When `--allowed-domains` is active:
- Sub-resource requests (scripts, images, fetch), WebSocket/EventSource, `sendBeacon` to non-allowed domains are **blocked**.
- **WebRTC peer connections disabled** in supported Chromium sessions — prevents STUN/TURN/DNS bypass of HTTP interception.
- Dedicated/shared workers guarded with bootstrap wrapper; if page CSP forbids the wrapper, worker **fails closed**.
- Rejected (cannot install containment before page scripts run): pre-existing CDP sessions, auto-connect, Chrome profiles, direct-page provider plugins, restore/state-file replay, raw Chrome profile args, iOS, Safari.

`auth login` is SPA-friendly: navigates with `load`, waits for login form selectors (timeout = default action timeout). `--no-navigate` preserves an already prepared page after origin check.

### Plugin system

- Out-of-process over `agent-browser.plugin.v1` **stdio JSON protocol**.
- Capabilities: `credential.read`, `browser.provider`, `launch.mutate`, `command.run`.
- Add via npm name, `@scope/name`, or GitHub `owner/repo`.
- Config in `./agent-browser.json` or `--global` → `~/.agent-browser/config.json`.

---

## 12. MCP server (VERIFIED README)

```bash
agent-browser mcp
agent-browser mcp --tools all
agent-browser mcp --tools core,network,react
```

- stdio MCP; newline-delimited JSON-RPC.
- Default protocol version **2025-11-25**; accepts older client protocol versions.
- Default tools profile: **`core`** (keeps MCP context small).

### Tool profiles

| Profile | Contents |
|---------|----------|
| `core` | Navigation, snapshots, interaction, waits, reads, screenshots, JS eval, close, tab basics, profile discovery |
| `network` | Routes, request inspection, HAR, headers, credentials, offline |
| `state` | Cookies, storage, auth, saved state, sessions, profiles, skills |
| `debug` | Console/errors, tracing, profiling, recording, a11y audit, clipboard, plugins, doctor, dashboard, install, upgrade, chat, diff, batch, confirm/deny |
| `tabs` | Back/forward/reload, tabs, windows, frames, dialogs |
| `react` | React tree/inspect/renders/suspense, vitals, pushstate |
| `mobile` | Viewport/device/geolocation/media, touch, swipe, mouse, keyboard |
| `all` | Every MCP tool including full typed CLI parity |

Common tools: `agent_browser_open`, `_snapshot`, `_click`, `_fill`, `_type`, `_press`, `_wait_for_selector`, `_screenshot`, `_get_url`, `_eval`, `_close`.

Each tool has typed fields (`url`, `selector`, `text`, `key`, `session`, `allowedDomains`) so MCP clients show meaningful approval prompts. `extraArgs` accepted for CLI parity. Tool discovery is **paginated** with read-only/open-world annotations.

---

## 13. Agent mode workflow (VERIFIED)

```bash
# Optimal loop
agent-browser open example.com
agent-browser snapshot -i --json   # AI parses tree + refs
agent-browser click @e2
agent-browser fill @e3 "input"
agent-browser snapshot -i --json   # re-snapshot after change
```

JSON envelope: `{"success":true,"data":{"snapshot":"...","refs":{"e1":{"role":"heading","name":"Title"},...}}}`

### Command chaining

Daemon persistence makes `&&` chaining safe:

```bash
agent-browser open example.com && agent-browser wait --load domcontentloaded && agent-browser snapshot -i
agent-browser fill @e1 "user@example.com" && agent-browser fill @e2 "pass" && agent-browser click @e3
```

README guidance: use `&&` when intermediate output isn't needed; run separately when parsing snapshot refs first.

---

## 14. Honest gaps

- Rust source (`cli/src/*.rs`) not fetched — `src/*.ts` paths returned 78-byte stubs.
- Daemon RPC protocol internals, snapshot serialization format, ref-stability algorithm not source-verified.
- Numeric max snapshot size / queue depth not extracted (beyond the 25s/30s/1h constants above).
- WebMCP security enforcement code not read (only README claims).
- jsDelivr may lag `main`.

---

## 10. Source citations (CDN URLs used)

- `https://cdn.jsdelivr.net/gh/vercel-labs/agent-browser@main/README.md` (95KB)
- `https://cdn.jsdelivr.net/gh/vercel-labs/agent-browser@main/package.json`
- `https://cdn.jsdelivr.net/gh/vercel-labs/agent-browser@main/bin/agent-browser.js`
- File tree: `https://data.jsdelivr.com/v1/packages/gh/vercel-labs/agent-browser@main?structure=flat` (110 files)

---

*Report depth: CLI surface, binary distribution, tab identity model, and WebMCP untrusted-hint protocol are source-verified from README + package. Rust internals marked as gap.*
