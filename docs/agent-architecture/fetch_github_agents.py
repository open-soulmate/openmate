#!/usr/bin/env python3
"""Fetch top GitHub AI Agent repos by stars and write ranked list."""
from __future__ import annotations

import csv
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent
UA = "Mozilla/5.0 (compatible; research-script/1.0)"

# Targeted queries to reduce noise vs bare "ai agent"
QUERIES = [
    "topic:ai-agent",
    "topic:ai-agents",
    "topic:agentic-ai",
    "topic:ai-agent-framework",
    "topic:autonomous-agent",
    "topic:agent-framework",
    'ai agent in:name,description stars:>5000',
    'agentic in:name,description stars:>5000',
    'ai agents in:name,description stars:>5000',
    'llm agent in:name,description stars:>5000',
    'autonomous agent in:name,description stars:>3000',
    'multi-agent in:name,description stars:>3000',
    'computer-use agent stars:>1000',
    'coding agent stars:>2000',
]

# Explicit well-known projects that ranking may miss due to naming
KNOWN = [
    "langchain-ai/langchain",
    "langchain-ai/langgraph",
    "microsoft/autogen",
    "crewAIInc/crewAI",
    "Significant-Gravitas/AutoGPT",
    "geekan/MetaGPT",
    "joaomdmoura/crewAI",
    "OpenBMB/ChatDev",
    "FoundationAgents/MetaGPT",
    "e2b-dev/e2b",
    "openai/openai-agents-python",
    "anthropics/claude-code",
    "openai/codex",
    "Aider-AI/aider",
    "All-Hands-AI/OpenHands",
    "cline/cline",
    "RooCodeInc/Roo-Code",
    "getcursor/cursor",
    "manus-ai/manus",
    "OpenInterpreter/open-interpreter",
    "modelcontextprotocol/python-sdk",
    "modelcontextprotocol/typescript-sdk",
    "jina-ai/reader",
    "langgenius/dify",
    "n8n-io/n8n",
    "comfyanonymous/ComfyUI",
    "lobehub/lobe-chat",
    "danny-avila/LibreChat",
    "FlowiseAI/Flowise",
    "reworkd/AgentGPT",
    "TransformerOptimus/SuperAGI",
    "kyegomez/swarms",
    "run-llama/llama_index",
    "run-llama/llama-agents",
    "deepset-ai/haystack",
    "microsoft/semantic-kernel",
    "microsoft/FLAML",
    "ag2ai/ag2",
    "microsoft/agent-framework",
    "google/adk-python",
    "google/adk-docs",
    "langchain-ai/open_deep_research",
    "assafelovic/gpt-researcher",
    "frdel/agent-zero",
    "samuelcolvin/cline",
    "Pythagora-io/gpt-pilot",
    "smol-ai/developer",
    "princeton-nlp/SWE-agent",
    "SWE-agent/SWE-agent",
    "OpenDevin/OpenDevin",
    "All-Hands-AI/OpenHands",
    "stitionai/devika",
    "AgentOps-AI/agentops",
    "langfuse/langfuse",
    "traceloop/openllmetry",
    "microsoft/PromptFlow",
    "langchain-ai/langsmith-sdk",
    "ComposioHQ/composio",
    "kreneskyp/ix",
    "camel-ai/camel",
    "OpenBMB/AgentVerse",
    "OpenBMB/ToolBench",
    "modelscope/agentscope",
    "modelscope/modelscope-agent",
    "OpenGVLab/InternGPT",
    "THUDM/AgentTuning",
    "AI4Finance-Foundation/FinGPT",
    "hpcaitech/ColossalAI",
    "InternLM/lagent",
    "InternLM/InternLM",
    "OpenLMLab/MOSS",
    "Salesforce/CodeGen",
    "imartinez/privateGPT",
    "h2oai/h2ogpt",
    "NVIDIA/NeMo-Guardrails",
    "NVIDIA/GenerativeAIExamples",
    "microsoft/JARVIS",
    "huggingface/smolagents",
    "huggingface/transformers-agents",
    "huggingface/text-generation-inference",
    "DeepAuto-AI/deepauto-agents",
    "joonspk-research/generative-agents",
    "Stanford-oval/storm",
    "run-llama/llama-hub",
    "photogamerun/awesome-ai-agents",
    "e2b-dev/awesome-ai-agents",
    "kyegomez/swarms",
    "Plurigrid/awesome-ai-agents",
    "f/awesome-chatgpt-prompts",
    "xtekky/gpt4free",
    "binary-husky/gpt_academic",
    "GaiZhenbiao/ChuanhuChatGPT",
    "open-webui/open-webui",
    "ollama/ollama",
    "vllm-project/vllm",
    "ollama/ollama-python",
    "langchain-ai/langchainjs",
    "Langroid/langroid",
    "OpenBMB/AgentBench",
    "OSU-NLP-Group/Mind2Web",
    "web-arena-x/webarena",
    "self-rl/visualwebarena",
    "facebookresearch/nougat",
    "reworkd/AgentGPT",
    "AI-boost/awesome-prompts",
    "friuns2/Leaked-GPTs",
    "x1xhlol/system-prompts-and-models-of-ai-tools",
    "obra/superpowers",
    "NousResearch/hermes-agent",
    "anysphere/cursor-cli",
    "sst/opencode",
    "getAsterisk/claudia",
    "getcursor/cursor",
    "block/goose",
    "AgentMaker/awesome-ai-agents",
]

CATEGORY_KEYWORDS = [
    ("coding-agent", [
        "coding agent", "code agent", "code generation", "developer agent",
        "swe-agent", "software engineering agent", "coding assistant", "ai coding",
    ]),
    ("multi-agent-framework", [
        "multi-agent", "multi agent", "multiagent", "agent framework",
        "agentic framework", "agent orchestration", "crew", "swarm",
    ]),
    ("autonomous-agent", [
        "autonomous", "autogpt", "auto-gpt", "self-improving", "agi agent",
    ]),
    ("workflow-orchestration", [
        "workflow", "orchestration", "low-code", "no-code", "pipeline",
    ]),
    ("llm-app-platform", [
        "llm app", "chat with", "knowledge base", "rag", "chatbot ui",
    ]),
    ("research-agent", [
        "research agent", "deep research", "gpt-researcher", "web browsing agent",
    ]),
    ("browser-computer-use", [
        "browser agent", "computer use", "web agent", "playwright agent",
    ]),
    ("agent-infrastructure", [
        "observability", "tracing", "eval", "sandbox", "tool calling", "mcp",
        "a2a", "protocol",
    ]),
]


def gh_get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def search_repos(q: str, per_page: int = 100, pages: int = 1) -> list[dict]:
    items: list[dict] = []
    for page in range(1, pages + 1):
        qs = urllib.parse.urlencode({"q": q, "sort": "stars", "order": "desc", "per_page": per_page, "page": page})
        url = f"https://api.github.com/search/repositories?{qs}"
        try:
            data = gh_get(url)
        except Exception as e:
            print(f"  ! search fail page={page} q={q!r}: {e}")
            break
        batch = data.get("items") or []
        items.extend(batch)
        total = data.get("total_count", 0)
        print(f"  + {q!r} page={page}: got {len(batch)} (total_count={total})")
        if len(batch) < per_page:
            break
        time.sleep(1.2)  # rate-limit courtesy
    return items


def get_repo(full_name: str) -> dict | None:
    try:
        return gh_get(f"https://api.github.com/repos/{full_name}")
    except Exception as e:
        print(f"  ! repo fail {full_name}: {e}")
        return None


NOISE_NAME = re.compile(
    r"(JavaGuide|interview|awesome-|cheatsheet|roadmap|tutorial|course|handbook|"
    r"leetcode|system-design|backend-interview|springboot|spring-boot)",
    re.I,
)

AGENT_HINT = re.compile(
    r"(agent|agentic|multi-agent|autogpt|metagpt|autonomous|computer use|"
    r"coding agent|swe-agent|openhands|aider|cursor|windsurf|cline|goose|"
    r"crew|swarm|langgraph|langchain|dify|flowise|n8n|mcp|tool.?use|"
    r"function.?call|orchestrat)",
    re.I,
)


def is_agentish(item: dict) -> bool:
    name = item.get("name") or ""
    full = item.get("full_name") or ""
    desc = item.get("description") or ""
    topics = " ".join(item.get("topics") or [])
    blob = f"{name} {full} {desc} {topics}"
    if NOISE_NAME.search(full) or NOISE_NAME.search(desc or ""):
        return False
    return bool(AGENT_HINT.search(blob))


def categorize(item: dict) -> str:
    desc = ((item.get("description") or "") + " " + " ".join(item.get("topics") or [])).lower()
    for cat, keys in CATEGORY_KEYWORDS:
        if any(k in desc for k in keys):
            return cat
    return "general-agent"


def main() -> None:
    seen: dict[str, dict] = {}

    # Seed with known high-star projects
    print("Fetching known repos...")
    for i, full in enumerate(KNOWN):
        if full in seen:
            continue
        item = get_repo(full)
        time.sleep(0.15)
        if item and not item.get("private"):
            seen[full] = item
        if (i + 1) % 20 == 0:
            print(f"  known {i+1}/{len(KNOWN)}")

    print("Searching queries...")
    for q in QUERIES:
        for item in search_repos(q, per_page=100, pages=2):
            full = item.get("full_name")
            if not full:
                continue
            # Prefer richer repo object if we already have it
            if full not in seen:
                seen[full] = item

    # Filter + score
    candidates = []
    for full, item in seen.items():
        stars = item.get("stargazers_count") or 0
        if stars < 500:
            continue
        if not is_agentish(item):
            # keep known seed even if weak heuristic
            if full not in KNOWN:
                continue
        candidates.append(item)

    candidates.sort(key=lambda x: x.get("stargazers_count") or 0, reverse=True)
    top = candidates[:100]

    # Write CSV
    csv_path = OUT_DIR / "github_top100_ai_agents.csv"
    md_path = OUT_DIR / "github_top100_ai_agents.md"
    json_path = OUT_DIR / "github_top100_ai_agents.json"

    fields = [
        "rank", "stars", "forks", "language", "category", "full_name",
        "description", "homepage", "html_url", "license", "created_at",
        "updated_at", "topics",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for i, item in enumerate(top, 1):
            lic = (item.get("license") or {}).get("spdx_id") or (item.get("license") or {}).get("name") or ""
            w.writerow({
                "rank": i,
                "stars": item.get("stargazers_count"),
                "forks": item.get("forks_count"),
                "language": item.get("language") or "",
                "category": categorize(item),
                "full_name": item.get("full_name"),
                "description": (item.get("description") or "").replace("\n", " ")[:300],
                "homepage": item.get("homepage") or "",
                "html_url": item.get("html_url"),
                "license": lic,
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
                "topics": ";".join(item.get("topics") or []),
            })

    slim = []
    for i, item in enumerate(top, 1):
        lic = (item.get("license") or {}).get("spdx_id") or (item.get("license") or {}).get("name") or ""
        slim.append({
            "rank": i,
            "full_name": item.get("full_name"),
            "html_url": item.get("html_url"),
            "stars": item.get("stargazers_count"),
            "forks": item.get("forks_count"),
            "language": item.get("language"),
            "category": categorize(item),
            "description": item.get("description"),
            "homepage": item.get("homepage"),
            "license": lic,
            "topics": item.get("topics"),
            "created_at": item.get("created_at"),
            "pushed_at": item.get("pushed_at"),
        })
    json_path.write_text(json.dumps(slim, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# GitHub 开源 AI Agent 项目 Top 100（按 Star 排序）",
        "",
        f"> 抓取时间：{time.strftime('%Y-%m-%d %H:%M:%S %z') or time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"> 数据来源：GitHub Search/Repos API",
        f"> 筛选：星数 ≥ 500，且命中 agent/agentic 相关启发式；已剔除面试指南等噪声",
        f"> 备注：广搜 `ai agent` 会混入非 Agent 仓库，本表用 topic + 关键词 + 已知项目种子交叉过滤",
        "",
        "| 排名 | Stars | 项目 | 语言 | 类别 | 简介 |",
        "|---:|---:|---|---|---|---|",
    ]
    for r in slim:
        desc = (r["description"] or "").replace("|", "\\|").replace("\n", " ")
        if len(desc) > 120:
            desc = desc[:117] + "..."
        lines.append(
            f"| {r['rank']} | {r['stars']:,} | [{r['full_name']}]({r['html_url']}) | "
            f"{r['language'] or '-'} | {r['category']} | {desc or '-'} |"
        )

    lines += [
        "",
        "## 类别分布",
        "",
    ]
    from collections import Counter
    cats = Counter(r["category"] for r in slim)
    for cat, n in cats.most_common():
        lines.append(f"- **{cat}**: {n}")

    lines += [
        "",
        "## 主要语言分布",
        "",
    ]
    langs = Counter((r["language"] or "Unknown") for r in slim)
    for lang, n in langs.most_common(10):
        lines.append(f"- **{lang}**: {n}")

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nWrote {csv_path}")
    print(f"Wrote {md_path}")
    print(f"Wrote {json_path}")
    print(f"Total ranked: {len(slim)}")
    print("Top 10:")
    for r in slim[:10]:
        print(f"  {r['rank']:2d}. {r['stars']:>7,}  {r['full_name']}")


if __name__ == "__main__":
    main()
