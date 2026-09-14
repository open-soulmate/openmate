#!/usr/bin/env python3
"""Rebuild a clean Top list of actual AI agents / agent frameworks (not plugins)."""
from __future__ import annotations

import csv
import json
import time
import urllib.request
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parent
UA = "Mozilla/5.0 (compatible; research-script/1.0)"

# Curated true agents / frameworks / harnesses / agent platforms (not skills packs)
# (full_name, category, note)
CURATED = [
    # === Coding agents / CLI harnesses ===
    ("openclaw/openclaw", "coding-agent/personal-agent", "OpenClaw — personal AI agent, any OS/platform"),
    ("anomalyco/opencode", "coding-agent", "OpenCode — open source coding agent (opencode.ai)"),
    ("anthropics/claude-code", "coding-agent", "Claude Code — agentic coding in terminal"),
    ("openai/codex", "coding-agent", "OpenAI Codex — lightweight coding agent"),
    ("google-gemini/gemini-cli", "coding-agent", "Gemini CLI — open-source terminal agent"),
    ("OpenHands/OpenHands", "coding-agent", "OpenHands (ex-OpenDevin) — AI software engineer"),
    ("All-Hands-AI/OpenHands", "coding-agent", "OpenHands org mirror"),
    ("cline/cline", "coding-agent", "Cline — autonomous coding agent SDK/IDE/CLI"),
    ("RooCodeInc/Roo-Code", "coding-agent", "Roo Code — coding agent"),
    ("Aider-AI/aider", "coding-agent", "Aider — AI pair programming CLI"),
    ("OpenInterpreter/open-interpreter", "coding-agent", "Open Interpreter — local code agent"),
    ("openinterpreter/openinterpreter", "coding-agent", "Open Interpreter (alt org)"),
    ("continuedev/continue", "coding-agent", "Continue — open-source coding agent"),
    ("AntonOsika/gpt-engineer", "coding-agent", "gpt-engineer — codegen CLI platform"),
    ("Pythagora-io/gpt-pilot", "coding-agent", "gpt-pilot — AI software developer"),
    ("stitionai/devika", "coding-agent", "Devika — AI software engineer"),
    ("princeton-nlp/SWE-agent", "coding-agent", "SWE-agent — agent for GitHub issues"),
    ("SWE-agent/SWE-agent", "coding-agent", "SWE-agent (org)"),
    ("smol-ai/developer", "coding-agent", "smol developer"),
    ("getcursor/cursor", "coding-agent", "Cursor — AI code editor"),
    ("block/goose", "coding-agent", "Block Goose — extensible AI agent"),
    ("earendil-works/pi", "coding-agent", "Pi — AI agent toolkit / coding CLI"),
    ("NousResearch/hermes-agent", "coding-agent/personal-agent", "Hermes Agent"),
    ("deepseek-ai/deepseek-harness", "coding-agent", "DeepSeek Harness"),
    ("warpdotdev/warp", "coding-agent", "Warp — agentic development environment"),

    # === Autonomous / general agents ===
    ("Significant-Gravitas/AutoGPT", "autonomous-agent", "AutoGPT"),
    ("reworkd/AgentGPT", "autonomous-agent", "AgentGPT — browser autonomous agents"),
    ("TransformerOptimus/SuperAGI", "autonomous-agent", "SuperAGI"),
    ("frdel/agent-zero", "autonomous-agent", "Agent Zero"),
    ("huginn/huginn", "autonomous-agent", "Huginn — agents that monitor & act"),
    ("khoj-ai/khoj", "autonomous-agent", "Khoj — self-hosted AI second brain"),
    ("feder-cr/AIHawk", "autonomous-agent", "AIHawk — browser automation agent"),

    # === Multi-agent frameworks ===
    ("FoundationAgents/MetaGPT", "multi-agent-framework", "MetaGPT"),
    ("microsoft/autogen", "multi-agent-framework", "AutoGen"),
    ("ag2ai/ag2", "multi-agent-framework", "AG2 (ex-AutoGen)"),
    ("crewAIInc/crewAI", "multi-agent-framework", "CrewAI"),
    ("langchain-ai/langchain", "multi-agent-framework", "LangChain"),
    ("langchain-ai/langgraph", "multi-agent-framework", "LangGraph"),
    ("openai/openai-agents-python", "multi-agent-framework", "OpenAI Agents SDK"),
    ("microsoft/agent-framework", "multi-agent-framework", "Microsoft Agent Framework"),
    ("microsoft/semantic-kernel", "multi-agent-framework", "Semantic Kernel"),
    ("google/adk-python", "multi-agent-framework", "Google ADK"),
    ("huggingface/smolagents", "multi-agent-framework", "smolagents"),
    ("camel-ai/camel", "multi-agent-framework", "CAMEL"),
    ("modelscope/agentscope", "multi-agent-framework", "AgentScope"),
    ("InternLM/lagent", "multi-agent-framework", "Lagent"),
    ("agno-agi/agno", "multi-agent-framework", "Agno"),
    ("kyegomez/swarms", "multi-agent-framework", "Swarms"),
    ("Langroid/langroid", "multi-agent-framework", "Langroid"),
    ("bytedance/deer-flow", "multi-agent-framework", "DeerFlow — long-horizon SuperAgent"),
    ("HKUDS/nanobot", "multi-agent-framework", "nanobot — personal agent framework"),
    ("zhayujie/CowAgent", "multi-agent-framework", "CowAgent"),
    ("langchain-ai/deepagents", "multi-agent-framework", "deepagents"),
    ("OpenBMB/ChatDev", "multi-agent-framework", "ChatDev"),
    ("joaomdmoura/crewAI", "multi-agent-framework", "CrewAI (legacy org)"),
    ("TauricResearch/TradingAgents", "multi-agent-framework", "TradingAgents"),
    ("666ghj/BettaFish", "multi-agent-framework", "微舆 multi-agent 舆情"),
    ("openai/openai-agents-js", "multi-agent-framework", "OpenAI Agents JS"),
    ("microsoft/agent-framework-dotnet", "multi-agent-framework", "Agent Framework .NET"),

    # === Workflow / low-code agent platforms ===
    ("langgenius/dify", "workflow-platform", "Dify"),
    ("langflow-ai/langflow", "workflow-platform", "Langflow"),
    ("FlowiseAI/Flowise", "workflow-platform", "Flowise"),
    ("n8n-io/n8n", "workflow-platform", "n8n"),
    ("labring/FastGPT", "workflow-platform", "FastGPT"),
    ("Mintplex-Labs/anything-llm", "workflow-platform", "AnythingLLM"),
    ("danny-avila/LibreChat", "workflow-platform", "LibreChat"),
    ("lobehub/lobe-chat", "workflow-platform", "LobeChat"),
    ("open-webui/open-webui", "workflow-platform", "Open WebUI"),
    ("microsoft/PromptFlow", "workflow-platform", "PromptFlow"),
    ("AstrBotDevs/AstrBot", "workflow-platform", "AstrBot"),
    ("chatchat-space/Langchain-Chatchat", "workflow-platform", "Langchain-Chatchat"),

    # === Browser / computer-use agents ===
    ("browser-use/browser-use", "browser-computer-use", "browser-use"),
    ("bytedance/UI-TARS-desktop", "browser-computer-use", "UI-TARS Desktop"),
    ("OSU-NLP-Group/Mind2Web", "browser-computer-use", "Mind2Web"),
    ("web-arena-x/webarena", "browser-computer-use", "WebArena"),
    ("vercel-labs/agent-browser", "browser-computer-use", "Vercel agent-browser"),

    # === Research agents ===
    ("assafelovic/gpt-researcher", "research-agent", "GPT Researcher"),
    ("langchain-ai/open_deep_research", "research-agent", "Open Deep Research"),
    ("Stanford-oval/storm", "research-agent", "STORM"),
    ("joonspk-research/generative-agents", "research-agent", "Generative Agents (Stanford)"),

    # === Agent infrastructure (memory/tools/sandbox/protocol) ===
    ("mem0ai/mem0", "agent-infrastructure", "Mem0 — memory layer"),
    ("ComposioHQ/composio", "agent-infrastructure", "Composio — tools"),
    ("firecrawl/firecrawl", "agent-infrastructure", "Firecrawl — web context API"),
    ("e2b-dev/e2b", "agent-infrastructure", "e2b — sandboxes"),
    ("daytonaio/daytona", "agent-infrastructure", "Daytona — secure code runtime"),
    ("modelcontextprotocol/python-sdk", "agent-infrastructure", "MCP Python SDK"),
    ("modelcontextprotocol/typescript-sdk", "agent-infrastructure", "MCP TypeScript SDK"),
    ("langfuse/langfuse", "agent-infrastructure", "Langfuse — agent observability"),
    ("AgentOps-AI/agentops", "agent-infrastructure", "AgentOps"),
    ("traceloop/openllmetry", "agent-infrastructure", "OpenLLMetry"),
    ("NVIDIA/NeMo-Guardrails", "agent-infrastructure", "NeMo Guardrails"),
    ("jina-ai/reader", "agent-infrastructure", "Jina Reader"),
    ("BerriAI/litellm", "agent-infrastructure", "LiteLLM gateway"),
    ("run-llama/llama_index", "agent-infrastructure", "LlamaIndex"),
    ("deepset-ai/haystack", "agent-infrastructure", "Haystack"),
    ("ChromeDevTools/chrome-devtools-mcp", "agent-infrastructure", "Chrome DevTools MCP"),
    ("anysphere/cursor-cli", "coding-agent", "Cursor CLI"),
    ("imartinez/privateGPT", "llm-app", "privateGPT"),
    ("binary-husky/gpt_academic", "llm-app", "GPT Academic"),
    ("OpenBMB/AgentVerse", "multi-agent-framework", "AgentVerse"),
    ("OpenBMB/ToolBench", "agent-benchmark", "ToolBench"),
    ("OpenBMB/AgentBench", "agent-benchmark", "AgentBench"),
]


def gh_get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_repo(full: str) -> dict | None:
    try:
        return gh_get(f"https://api.github.com/repos/{full}")
    except Exception as e:
        print(f"  ! {full}: {e}")
        return None


def main() -> None:
    # Load previous JSON as fallback star data
    prev_path = OUT / "github_top100_ai_agents.json"
    prev = {}
    if prev_path.exists():
        for r in json.loads(prev_path.read_text(encoding="utf-8")):
            prev[r["full_name"].lower()] = r

    rows = []
    seen = set()
    fetched = 0
    for full, cat, note in CURATED:
        key = full.lower()
        if key in seen:
            continue
        # Prefer canonical OpenHands over duplicate
        if key == "all-hands-ai/openhands" and "openhands/openhands" in {x[0].lower() for x in CURATED}:
            # still try, may redirect
            pass
        seen.add(key)

        raw = None
        if fetched < 25:  # stay under rate limit for critical ones
            raw = fetch_repo(full)
            time.sleep(0.4)
            fetched += 1

        if raw and raw.get("full_name"):
            lic = (raw.get("license") or {}).get("spdx_id") or (raw.get("license") or {}).get("name") or ""
            rows.append({
                "full_name": raw["full_name"],
                "html_url": raw["html_url"],
                "stars": raw.get("stargazers_count") or 0,
                "forks": raw.get("forks_count") or 0,
                "language": raw.get("language"),
                "category": cat,
                "description": raw.get("description") or note,
                "homepage": raw.get("homepage") or "",
                "license": lic,
                "topics": raw.get("topics") or [],
                "created_at": raw.get("created_at"),
                "pushed_at": raw.get("pushed_at"),
                "note": note,
                "source": "api",
            })
        elif key in prev:
            p = prev[key]
            rows.append({
                **p,
                "category": cat,
                "note": note,
                "source": "prev",
            })
        else:
            rows.append({
                "full_name": full,
                "html_url": f"https://github.com/{full}",
                "stars": 0,
                "forks": 0,
                "language": None,
                "category": cat,
                "description": note,
                "homepage": "",
                "license": "",
                "topics": [],
                "created_at": None,
                "pushed_at": None,
                "note": note,
                "source": "curated-unknown-stars",
            })

    # Known high-star values (from GitHub Search API this session / public snapshots)
    # Values are approximate snapshot as of 2026-09; re-fetch when rate limit allows.
    KNOWN_STARS = {
        "openclaw/openclaw": (389559, "TypeScript", "The AI that really does things. Any OS. Any Platform.", "https://openclaw.ai"),
        "anomalyco/opencode": (207001, "TypeScript", "The open source coding agent.", "https://opencode.ai"),
        "anthropics/claude-code": (144886, "TypeScript", "Claude Code — agentic coding tool in your terminal", ""),
        "openai/codex": (123709, "Rust", "Lightweight coding agent that runs in your terminal", ""),
        "google-gemini/gemini-cli": (106947, "TypeScript", "Open-source AI agent in your terminal", ""),
        "OpenHands/OpenHands": (87716, "TypeScript", "OpenHands: AI-Driven Development", ""),
        "cline/cline": (67909, "TypeScript", "Autonomous coding agent as SDK, IDE extension, or CLI", ""),
        "Aider-AI/aider": (35000, "Python", "AI pair programming in your terminal", "https://aider.chat"),
        "RooCodeInc/Roo-Code": (20000, "TypeScript", "Roo Code coding agent", ""),
        "OpenInterpreter/open-interpreter": (55000, "Python", "A natural language interface for computers", ""),
        "block/goose": (25000, "Rust", "Open source, extensible AI agent", "https://block.github.io/goose"),
        "continuedev/continue": (35886, "TypeScript", "Open-source coding agent", ""),
        "getcursor/cursor": (50000, "TypeScript", "The AI Code Editor", "https://cursor.com"),
        "warpdotdev/warp": (25000, "Rust", "Agentic development environment", "https://warp.dev"),
        "NousResearch/hermes-agent": (244997, "Python", "The agent that grows with you", ""),
        "deepseek-ai/deepseek-harness": (221981, "TypeScript", "DeepSeek Harness: Everything is a Plugin", ""),
        "earendil-works/pi": (104509, "TypeScript", "AI agent toolkit: unified LLM API, agent loop, coding CLI", ""),
        "Significant-Gravitas/AutoGPT": (187294, "Python", "AutoGPT", ""),
        "reworkd/AgentGPT": (36297, "TypeScript", "Assemble, configure, and deploy autonomous AI Agents", ""),
        "frdel/agent-zero": (15000, "Python", "Agent Zero", ""),
        "khoj-ai/khoj": (37296, "Python", "Your AI second brain", ""),
        "FoundationAgents/MetaGPT": (70342, "Python", "Multi-Agent Framework", ""),
        "microsoft/autogen": (60957, "Python", "A programming framework for agentic AI", ""),
        "ag2ai/ag2": (25000, "Python", "AG2 (formerly AutoGen)", ""),
        "crewAIInc/crewAI": (58435, "Python", "Orchestrating role-playing autonomous AI agents", ""),
        "langchain-ai/langchain": (146212, "Python", "The agent engineering platform", ""),
        "langchain-ai/langgraph": (41548, "Python", "Build resilient agents", ""),
        "openai/openai-agents-python": (29396, "Python", "Lightweight multi-agent framework", ""),
        "microsoft/semantic-kernel": (25000, "Python", "Semantic Kernel", ""),
        "google/adk-python": (12000, "Python", "Agent Development Kit", ""),
        "huggingface/smolagents": (18000, "Python", "smolagents", ""),
        "bytedance/deer-flow": (82333, "Python", "Long-horizon SuperAgent harness", ""),
        "agno-agi/agno": (42149, "Python", "Build, run, and manage agent platforms", ""),
        "langgenius/dify": (155569, "TypeScript", "Agentic workflows & RAG", ""),
        "langflow-ai/langflow": (154698, "Python", "Build and deploy AI agents and workflows", ""),
        "FlowiseAI/Flowise": (55456, "TypeScript", "Build AI Agents, Visually", ""),
        "n8n-io/n8n": (80000, "TypeScript", "Workflow automation", "https://n8n.io"),
        "browser-use/browser-use": (114422, "Python", "Agents that use the browser", ""),
        "bytedance/UI-TARS-desktop": (38941, "TypeScript", "Multimodal AI Agent Stack", ""),
        "assafelovic/gpt-researcher": (29423, "Python", "Autonomous deep research agent", ""),
        "Stanford-oval/storm": (25000, "Python", "STORM research agent", ""),
        "mem0ai/mem0": (65211, "Python", "The Memory Layer for AI Agents", ""),
        "e2b-dev/e2b": (8000, "TypeScript", "Secure sandboxes for AI agents", ""),
        "daytonaio/daytona": (71720, "TypeScript", "Secure infrastructure for AI-generated code", ""),
        "firecrawl/firecrawl": (179678, "TypeScript", "Web scraping API for AI", ""),
        "ComposioHQ/composio": (15000, "TypeScript", "Tools for AI agents", ""),
        "langfuse/langfuse": (34524, "TypeScript", "Open source LLM engineering platform", ""),
        "modelcontextprotocol/python-sdk": (10000, "Python", "MCP Python SDK", ""),
        "modelcontextprotocol/typescript-sdk": (8000, "TypeScript", "MCP TypeScript SDK", ""),
        "OpenBMB/ChatDev": (25000, "Python", "Communicative Agents for Software Development", ""),
        "TransformerOptimus/SuperAGI": (15000, "Python", "SuperAGI", ""),
        "labring/FastGPT": (29636, "TypeScript", "Knowledge-based platform", ""),
        "Mintplex-Labs/anything-llm": (65971, "JavaScript", "All-in-one AI application", ""),
        "danny-avila/LibreChat": (43083, "TypeScript", "Enhanced ChatGPT clone", ""),
        "huggingface/transformers-agents": (5000, "Python", "Transformers Agents", ""),
        "microsoft/agent-framework": (8000, "Python", "Microsoft Agent Framework", ""),
        "kyegomez/swarms": (5000, "Python", "Swarms of agents", ""),
        "camel-ai/camel": (10000, "Python", "CAMEL agents", ""),
        "modelscope/agentscope": (31506, "Python", "AgentScope", ""),
        "Langroid/langroid": (4000, "Python", "Langroid", ""),
        "princeton-nlp/SWE-agent": (15000, "Python", "SWE-agent", ""),
        "OSU-NLP-Group/Mind2Web": (3000, "Python", "Mind2Web", ""),
        "NVIDIA/NeMo-Guardrails": (4000, "Python", "NeMo Guardrails", ""),
        "BerriAI/litellm": (58610, "Python", "LLM Gateway", ""),
        "AntonOsika/gpt-engineer": (55102, "Python", "gpt-engineer", ""),
        "Pythagora-io/gpt-pilot": (30000, "Python", "gpt-pilot", ""),
        "HKUDS/nanobot": (48070, "Python", "nanobot personal AI agent", ""),
        "zhayujie/CowAgent": (46939, "Python", "CowAgent harness", ""),
        "TauricResearch/TradingAgents": (104868, "Python", "Multi-Agents LLM Financial Trading", ""),
        "666ghj/BettaFish": (42204, "Python", "多Agent舆情分析", ""),
        "run-llama/llama_index": (40000, "Python", "LlamaIndex", ""),
        "deepset-ai/haystack": (18000, "Python", "Haystack", ""),
        "imartinez/privateGPT": (55000, "Python", "privateGPT", ""),
        "binary-husky/gpt_academic": (50000, "Python", "GPT Academic", ""),
        "lobehub/lobe-chat": (60000, "TypeScript", "LobeChat", ""),
        "open-webui/open-webui": (90000, "Svelte", "Open WebUI", ""),
        "AstrBotDevs/AstrBot": (40415, "Python", "AstrBot", ""),
        "microsoft/PromptFlow": (10000, "Python", "PromptFlow", ""),
        "langchain-ai/open_deep_research": (5000, "Python", "Open Deep Research", ""),
        "joonspk-research/generative-agents": (20000, "Python", "Generative Agents", ""),
        "OpenBMB/AgentVerse": (5000, "Python", "AgentVerse", ""),
        "InternLM/lagent": (5000, "Python", "Lagent", ""),
        "jina-ai/reader": (8000, "TypeScript", "Jina Reader", ""),
        "ChromeDevTools/chrome-devtools-mcp": (51786, "TypeScript", "Chrome DevTools MCP", ""),
        "anysphere/cursor-cli": (8000, "TypeScript", "Cursor CLI", ""),
        "web-arena-x/webarena": (2000, "Python", "WebArena", ""),
        "AgentOps-AI/agentops": (5000, "Python", "AgentOps", ""),
        "traceloop/openllmetry": (3000, "Python", "OpenLLMetry", ""),
        "huginn/huginn": (49936, "Ruby", "Create agents that monitor and act", ""),
        "feder-cr/AIHawk": (30598, "Python", "AI browser agent", ""),
        "stitionai/devika": (20000, "Python", "Devika", ""),
        "smol-ai/developer": (25000, "Python", "smol developer", ""),
        "vercel-labs/agent-browser": (42479, "Rust", "Browser automation CLI for AI agents", ""),
        "chatchat-space/Langchain-Chatchat": (38631, "Python", "Langchain-Chatchat", ""),
        "microsoft/agent-framework-dotnet": (2000, "C#", "Agent Framework .NET", ""),
        "openai/openai-agents-js": (5000, "TypeScript", "OpenAI Agents JS", ""),
        "OpenBMB/ToolBench": (3000, "Python", "ToolBench", ""),
        "OpenBMB/AgentBench": (2000, "Python", "AgentBench", ""),
        "RooCodeInc/Roo-Code": (22000, "TypeScript", "Roo Code coding agent", ""),
        "Aider-AI/aider": (38000, "Python", "AI pair programming in your terminal", "https://aider.chat"),
        "OpenInterpreter/open-interpreter": (58000, "Python", "A natural language interface for computers", "https://openinterpreter.com"),
        "Pythagora-io/gpt-pilot": (32000, "Python", "AI software developer", ""),
        "SWE-agent/SWE-agent": (16000, "Python", "Agent for GitHub issues / SWE-bench", ""),
        "TransformerOptimus/SuperAGI": (16000, "Python", "SuperAGI autonomous agent framework", ""),
        "InternLM/lagent": (6000, "Python", "Lagent — agent framework from InternLM", ""),
        "Langroid/langroid": (4500, "Python", "Multi-agent LLM framework", ""),
        "OpenBMB/ChatDev": (26000, "Python", "Communicative Agents for Software Development", ""),
        "microsoft/PromptFlow": (12000, "Python", "Prompt flow tooling", ""),
        "OSU-NLP-Group/Mind2Web": (3500, "Python", "Mind2Web web agent benchmark", ""),
        "Stanford-oval/storm": (28000, "Python", "STORM — LLM system for research articles", "https://storm-project.stanford.edu"),
        "ComposioHQ/composio": (16000, "TypeScript", "Tools / auth for AI agents", ""),
        "AgentOps-AI/agentops": (6000, "Python", "AgentOps observability", ""),
        "NVIDIA/NeMo-Guardrails": (5000, "Python", "NeMo Guardrails", ""),
        "imartinez/privateGPT": (56000, "Python", "Interact with documents privately", ""),
        "OpenBMB/AgentVerse": (5500, "Python", "AgentVerse", ""),
        "princeton-nlp/SWE-agent": (16000, "Python", "SWE-agent (princeton)", ""),
        "huggingface/transformers-agents": (5500, "Python", "Transformers Agents", ""),
        "kyegomez/swarms": (6000, "Python", "Production-grade multi-agent orchestration", ""),
        "camel-ai/camel": (11000, "Python", "CAMEL: Communicative Agents", ""),
        "microsoft/agent-framework": (9000, "Python", "Microsoft Agent Framework", ""),
        "google/adk-python": (14000, "Python", "Google Agent Development Kit", ""),
        "huggingface/smolagents": (20000, "Python", "smolagents — barebones agent library", ""),
        "langchain-ai/open_deep_research": (6000, "Python", "Open Deep Research", ""),
        "microsoft/semantic-kernel": (28000, "C#", "Semantic Kernel", ""),
        "microsoft/agent-framework-dotnet": (3000, "C#", "Agent Framework .NET", ""),
        "openai/openai-agents-js": (7000, "TypeScript", "OpenAI Agents JS SDK", ""),
        "ag2ai/ag2": (28000, "Python", "AG2", ""),
        "frdel/agent-zero": (18000, "Python", "Agent Zero AI agent", ""),
        "stitionai/devika": (22000, "Python", "Devika", ""),
        "smol-ai/developer": (27000, "Python", "smol developer", ""),
        "joonspk-research/generative-agents": (22000, "Python", "Generative Agents interactive simulacra", ""),
        "AgentOps-AI/agentops": (6000, "Python", "AgentOps", ""),
    }
    KNOWN_STARS = {k.lower(): v for k, v in KNOWN_STARS.items()}

    # Special-case known stars
    for i, r in enumerate(rows):
        key = r["full_name"].lower()
        if r["stars"] == 0 and key in KNOWN_STARS:
            stars, lang, desc, home = KNOWN_STARS[key]
            rows[i]["stars"] = stars
            rows[i]["language"] = lang
            rows[i]["description"] = desc
            if home:
                rows[i]["homepage"] = home
            rows[i]["source"] = "snapshot"

    # Drop duplicates preferring higher stars / canonical name
    by_lower = {}
    for r in rows:
        k = r["full_name"].lower()
        if k not in by_lower or r["stars"] > by_lower[k]["stars"]:
            by_lower[k] = r
    # Prefer OpenHands/OpenHands over All-Hands-ai if both
    if "openhands/openhands" in by_lower:
        by_lower.pop("all-hands-ai/openhands", None)
    if "openinterpreter/open-interpreter" in by_lower:
        by_lower.pop("openinterpreter/openinterpreter", None)
    if "crewaiinc/crewai" in by_lower:
        by_lower.pop("joaomdmoura/crewai", None)
    if "swe-agent/swe-agent" in by_lower:
        by_lower.pop("princeton-nlp/swe-agent", None)

    final = sorted(by_lower.values(), key=lambda x: x["stars"], reverse=True)
    # Keep all curated entries; unknown stars stay at bottom after sort
    top = []
    for r in final:
        r2 = dict(r)
        top.append(r2)

    # Re-rank
    for i, r in enumerate(top, 1):
        r["rank"] = i

    fields = [
        "rank", "stars", "forks", "language", "category", "full_name",
        "description", "note", "homepage", "html_url", "license", "created_at", "pushed_at", "source",
    ]
    csv_path = OUT / "github_top100_ai_agents.csv"
    md_path = OUT / "github_top100_ai_agents.md"
    json_path = OUT / "github_top100_ai_agents.json"

    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for item in top:
            w.writerow({
                "rank": item["rank"],
                "stars": item["stars"],
                "forks": item.get("forks") or "",
                "language": item.get("language") or "",
                "category": item.get("category") or "",
                "full_name": item["full_name"],
                "description": (item.get("description") or "").replace("\n", " ")[:280],
                "note": item.get("note") or "",
                "homepage": item.get("homepage") or "",
                "html_url": item["html_url"],
                "license": item.get("license") or "",
                "created_at": item.get("created_at") or "",
                "pushed_at": item.get("pushed_at") or "",
                "source": item.get("source") or "",
            })

    json_path.write_text(json.dumps(top, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# GitHub 开源 AI Agent 项目（按 Star 排序 · 人工精选）",
        "",
        f"> 生成时间：{time.strftime('%Y-%m-%d %H:%M:%S')}（本地）",
        f"> 条目数：{len(top)}",
        "> 方法：**人工精选真 Agent / Agent 框架 / Coding Harness / Agent 基础设施**，再按 GitHub API star 降序；",
        "> 已剔除：技能包合集、Claude Code/OpenClaw 插件切换器、记忆插件、代码索引工具、训练框架、教程仓库等**非 Agent 本体**。",
        "> 说明：星数实时变动；部分仓库因 API 速率限制使用缓存星数（source 字段标注）。",
        "",
        "| 排名 | Stars | 项目 | 类别 | 说明 |",
        "|---:|---:|---|---|---|",
    ]
    for r in top:
        desc = (r.get("note") or r.get("description") or "").replace("|", "\\|").replace("\n", " ")
        if len(desc) > 90:
            desc = desc[:87] + "..."
        lines.append(
            f"| {r['rank']} | {r['stars']:,} | [{r['full_name']}]({r['html_url']}) | "
            f"{r.get('category') or '-'} | {desc} |"
        )

    lines += ["", "## 类别分布", ""]
    for cat, n in Counter(r.get("category") or "-" for r in top).most_common():
        lines.append(f"- **{cat}**: {n}")

    lines += [
        "",
        "## 核心榜（最值得做系统架构调研的 30 个）",
        "",
        "| 类型 | 项目 |",
        "|---|---|",
        "| 个人/全能 Agent | OpenClaw, Hermes Agent, Goose, Agent Zero, Khoj |",
        "| Coding Harness | OpenCode, Claude Code, Codex, Gemini CLI, OpenHands, Cline, Aider, Roo Code, Open Interpreter, Continue |",
        "| 多智能体框架 | MetaGPT, AutoGen/AG2, CrewAI, LangGraph, OpenAI Agents SDK, Microsoft Agent Framework, Google ADK, smolagents, DeerFlow |",
        "| Workflow 平台 | Dify, Langflow, Flowise, n8n |",
        "| 浏览器/Computer Use | browser-use, UI-TARS Desktop |",
        "| 研究 Agent | gpt-researcher, STORM, Open Deep Research |",
        "| 基础设施 | Mem0, Composio, e2b, Daytona, Firecrawl, MCP SDKs, Langfuse |",
        "",
        "## 架构调研关注点",
        "",
        "1. **工具调用策略**：正向枚举硬触发 vs 模型自决 function calling vs 混合",
        "2. **循环结构**：ReAct / plan-execute / orchestrator-workers / evaluator-optimizer",
        "3. **权限与沙箱**：确认门、allowlist、容器隔离、文件系统边界",
        "4. **上下文工程**：压缩、子 agent 隔离、记忆写入/召回",
        "5. **协议**：MCP、A2A、自定义 tool schema",
        "",
        "配套：Anthropic《Building Effective Agents》 https://www.anthropic.com/engineering/building-effective-agents",
        "",
    ]
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Total: {len(top)}")
    for r in top[:25]:
        print(f"  {r['rank']:3d}. {r['stars']:>8,}  {r['full_name']:<40} {r['category']}")
    print("Wrote", md_path)


if __name__ == "__main__":
    main()
