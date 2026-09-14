#!/usr/bin/env python3
"""Expand list toward 100 agent projects, re-rank, rewrite deliverables."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent
UA = "Mozilla/5.0 (compatible; research-script/1.0)"
json_path = OUT_DIR / "github_top100_ai_agents.json"
md_path = OUT_DIR / "github_top100_ai_agents.md"
csv_path = OUT_DIR / "github_top100_ai_agents.csv"
import csv as csvmod

current = json.loads(json_path.read_text(encoding="utf-8"))
by_name = {r["full_name"]: r for r in current}


def gh_get(url: str) -> dict:
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": "application/vnd.github+json"}
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def search(q: str, per_page=50, pages=1) -> list[dict]:
    items = []
    for page in range(1, pages + 1):
        qs = urllib.parse.urlencode(
            {"q": q, "sort": "stars", "order": "desc", "per_page": per_page, "page": page}
        )
        try:
            data = gh_get(f"https://api.github.com/search/repositories?{qs}")
        except Exception as e:
            print(f"  ! {q!r} p{page}: {e}")
            time.sleep(8)
            continue
        batch = data.get("items") or []
        items.extend(batch)
        print(f"  + {q!r} p{page}: {len(batch)}")
        time.sleep(2.5)
    return items


# More targeted queries
MORE = [
    "topic:ai-agent stars:>5000",
    "topic:ai-agents stars:>8000",
    "topic:agentic stars:>3000",
    "topic:agent stars:>15000 language:Python",
    "topic:agent stars:>10000 language:TypeScript",
    '"ai agent" framework stars:>10000',
    '"multi-agent" framework stars:>5000',
    "langchain OR langgraph OR crewai OR autogen stars:>20000",
    "openhands OR aider OR cline OR roo-code stars:>10000",
    "browser-use OR computer-use agent stars:>3000",
    "mcp server agent stars:>3000",
    "deep research agent stars:>2000",
    "agent sdk stars:>5000",
]

CORE_ALLOW = {
    "Significant-Gravitas/AutoGPT", "FoundationAgents/MetaGPT", "microsoft/autogen",
    "crewAIInc/crewAI", "langchain-ai/langchain", "langchain-ai/langgraph",
    "langgenius/dify", "langflow-ai/langflow", "FlowiseAI/Flowise",
    "anthropics/claude-code", "openai/codex", "google-gemini/gemini-cli",
    "cline/cline", "RooCodeInc/Roo-Code", "All-Hands-AI/OpenHands",
    "Aider-AI/aider", "OpenInterpreter/open-interpreter", "browser-use/browser-use",
    "bytedance/deer-flow", "agno-agi/agno", "mem0ai/mem0",
    "AntonOsika/gpt-engineer", "huginn/huginn", "danny-avila/LibreChat",
    "infiniflow/ragflow", "Mintplex-Labs/anything-llm", "block/goose",
    "obra/superpowers", "NousResearch/hermes-agent", "sst/opencode",
    "HKUDS/nanobot", "zhayujie/CowAgent", "ag2ai/ag2",
    "microsoft/semantic-kernel", "camel-ai/camel", "e2b-dev/e2b",
    "daytonaio/daytona", "princeton-nlp/SWE-agent", "assafelovic/gpt-researcher",
    "frdel/agent-zero", "TransformerOptimus/SuperAGI", "reworkd/AgentGPT",
    "kyegomez/swarms", "huggingface/smolagents", "Langroid/langroid",
    "modelscope/agentscope", "InternLM/lagent", "run-llama/llama_index",
    "deepset-ai/haystack", "firecrawl/firecrawl",
    "ChromeDevTools/chrome-devtools-mcp", "microsoft/agent-framework",
    "google/adk-python", "ComposioHQ/composio", "langfuse/langfuse",
    "AgentOps-AI/agentops", "microsoft/PromptFlow", "n8n-io/n8n",
    "Pythagora-io/gpt-pilot", "stitionai/devika", "smol-ai/developer",
    "OpenBMB/ChatDev", "OpenBMB/AgentVerse", "joaomdmoura/crewAI",
    "NVIDIA/NeMo-Guardrails", "Stanford-oval/storm", "joonspk-research/generative-agents",
    "traceloop/openllmetry", "kreneskyp/ix", "AgentMaker/awesome-ai-agents",
    "photogamerun/awesome-ai-agents", "e2b-dev/awesome-ai-agents",
    "anysphere/cursor-cli", "getAsterisk/claudia", "getcursor/cursor",
    "manus-ai/manus", "modelcontextprotocol/python-sdk",
    "modelcontextprotocol/typescript-sdk", "langchain-ai/open_deep_research",
    "run-llama/llama-agents", "microsoft/JARVIS", "microsoft/FLAML",
    "InternLM/InternLM", "hpcaitech/ColossalAI", "imartinez/privateGPT",
    "h2oai/h2ogpt", "binary-husky/gpt_academic", "lobehub/lobe-chat",
    "comfyanonymous/ComfyUI", "ollama/ollama", "open-webui/open-webui",
    "vllm-project/vllm", "OpenDevin/OpenDevin", "SWE-agent/SWE-agent",
    "web-arena-x/webarena", "OSU-NLP-Group/Mind2Web", "Langroid/langroid",
    "google/adk-docs", "deepset-ai/haystack", "jina-ai/reader",
    "langchain-ai/langchainjs", "OpenGVLab/InternGPT", "THUDM/AgentTuning",
    "modelscope/modelscope-agent", "ComposioHQ/composio",
    "farion1231/cc-switch", "affaan-m/ECC", "deepseek-ai/deepseek-harness",
    "msitarzewski/agency-agents", "ultraworkers/claw-code",
    "anomalyco/opencode", "TauricResearch/TradingAgents",
    "earendil-works/pi", "openinterpreter/openinterpreter",
}

DENY_HARD = {
    "ansible/ansible", "pingcap/tidb", "PostHog/posthog", "tldraw/tldraw",
    "thedaviddias/Front-End-Checklist", "microsoft/qlib",
    "dair-ai/Prompt-Engineering-Guide", "OpenBB-finance/OpenBB",
    "novuhq/novu", "ToolJet/ToolJet", "opendatalab/MinerU",
    "siyuan-note/siyuan", "microsoft/ai-agents-for-beginners",
    "asgeirtj/system_prompts_leaks", "x1xhlol/system-prompts-and-models-of-ai-tools",
    "shanraisshan/claude-code-best-practice", "luongnv89/claude-howto",
    "bojieli/ai-agent-book", "rohitg00/ai-engineering-from-scratch",
    "coreyhaines31/marketingskills", "kepano/obsidian-skills",
    "ayghri/i-have-adhd", "blader/humanizer", "mvanhorn/last30days-skill",
    "DietrichGebert/ponytail", "heygen-com/hyperframes", "calesthio/OpenMontage",
    "hugohe3/ppt-master", "ZhuLinsen/daily_stock_analysis",
    "career-ops-hq/career-ops", "Graphify-Labs/graphify",
    "diegosouzapw/OmniRoute", "paperclipai/paperclip", "warpdotdev/warp",
    "CherryHQ/cherry-studio", "lobehub/lobehub", "karpathy/autoresearch",
    "Snailclimb/JavaGuide", "shareAI-lab/learn-claude-code",
    "addyosmani/agent-skills",
}

AGENT_HINT = re.compile(
    r"(agent|agentic|multi-agent|autogpt|metagpt|autonomous|computer use|"
    r"coding agent|swe-agent|openhands|aider|cursor|windsurf|cline|goose|"
    r"crew|swarm|langgraph|langchain|dify|flowise|orchestrat|"
    r"function.?call|tool.?use|mcp|harness)",
    re.I,
)


def item_to_record(raw: dict) -> dict:
    topics = raw.get("topics") or []
    desc = raw.get("description") or ""
    blob = f"{raw.get('name','')} {raw.get('full_name','')} {desc} {' '.join(topics)}"
    cat = "general-agent"
    low = blob.lower()
    if any(k in low for k in ("coding agent", "code agent", "swe-agent", "aider", "openhands", "developer agent")):
        cat = "coding-agent"
    elif any(k in low for k in ("multi-agent", "multiagent", "crew", "swarm", "langgraph")):
        cat = "multi-agent-framework"
    elif any(k in low for k in ("autonomous", "autogpt", "meta-gpt", "metagpt")):
        cat = "autonomous-agent"
    elif any(k in low for k in ("workflow", "orchestrat", "low-code", "no-code", "n8n")):
        cat = "workflow-orchestration"
    elif any(k in low for k in ("observability", "tracing", "eval", "sandbox", "mcp", "memory", "gateway")):
        cat = "agent-infrastructure"
    elif any(k in low for k in ("browser", "computer use", "web agent", "playwright")):
        cat = "browser-computer-use"
    elif any(k in low for k in ("research agent", "deep research", "gpt-researcher")):
        cat = "research-agent"
    lic = (raw.get("license") or {}).get("spdx_id") or (raw.get("license") or {}).get("name") or ""
    return {
        "full_name": raw.get("full_name"),
        "html_url": raw.get("html_url"),
        "stars": raw.get("stargazers_count") or 0,
        "forks": raw.get("forks_count") or 0,
        "language": raw.get("language"),
        "category": cat,
        "description": desc,
        "homepage": raw.get("homepage"),
        "license": lic,
        "topics": topics,
        "created_at": raw.get("created_at"),
        "pushed_at": raw.get("pushed_at"),
    }


def accept(rec: dict) -> bool:
    full = rec["full_name"]
    if full in DENY_HARD:
        return False
    if rec["stars"] < 800:
        return False
    if full in CORE_ALLOW:
        return True
    blob = f"{full} {rec.get('description') or ''} {' '.join(rec.get('topics') or [])}"
    if not AGENT_HINT.search(blob):
        return False
    # drop pure skill packs / courses
    desc = rec.get("description") or ""
    if re.search(r"course|lesson|textbook|interview|checklist for modern|roadmap", desc, re.I):
        return False
    if re.search(r"skills for |skill library|skills directory|agent skill that", desc, re.I):
        if not re.search(r"framework|harness|platform|orchestrat", desc, re.I):
            return False
    if re.search(r"system prompts|prompt leaks", desc, re.I) and full not in CORE_ALLOW:
        return False
    return True


print("Fetching additional searches...")
raw_new = []
for q in MORE:
    raw_new.extend(search(q, per_page=50, pages=1))

merged = dict(by_name)  # keep existing cleaned
for raw in raw_new:
    rec = item_to_record(raw)
    if accept(rec):
        full = rec["full_name"]
        if full not in merged or rec["stars"] > merged[full]["stars"]:
            merged[full] = rec

# Also re-accept previously dropped high-star core projects if present in new search
all_recs = list(merged.values())
all_recs.sort(key=lambda x: x["stars"], reverse=True)

# Dedup by name lower
final = []
seen = set()
for r in all_recs:
    key = r["full_name"].lower()
    if key in seen:
        continue
    seen.add(key)
    # renumber later
    r2 = dict(r)
    final.append(r2)

top = []
for i, r in enumerate(final, 1):
    if i > 100:
        break
    r["rank"] = i
    top.append(r)

fields = [
    "rank", "stars", "forks", "language", "category", "full_name",
    "description", "homepage", "html_url", "license", "created_at", "pushed_at", "topics",
]
with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
    w = csvmod.DictWriter(f, fieldnames=fields)
    w.writeheader()
    for item in top:
        w.writerow({
            "rank": item["rank"],
            "stars": item["stars"],
            "forks": item.get("forks") or "",
            "language": item.get("language") or "",
            "category": item.get("category") or "",
            "full_name": item["full_name"],
            "description": (item.get("description") or "").replace("\n", " ")[:300],
            "homepage": item.get("homepage") or "",
            "html_url": item["html_url"],
            "license": item.get("license") or "",
            "created_at": item.get("created_at") or "",
            "pushed_at": item.get("pushed_at") or "",
            "topics": ";".join(item.get("topics") or []),
        })

json_path.write_text(json.dumps(top, ensure_ascii=False, indent=2), encoding="utf-8")

lines = [
    "# GitHub 开源 AI Agent 项目 Top 100（按 Star 排序）",
    "",
    f"> 抓取时间：{time.strftime('%Y-%m-%d %H:%M:%S')}（本地）",
    "> 数据来源：GitHub Search API",
    "> 方法：topic（ai-agent / ai-agents / agentic / agent-framework 等）+ 关键词交叉检索，按 stargazers_count 降序；",
    "> 清洗：剔除数据库/分析平台/纯课程/纯提示词合集/仅描述提及 agents 的非 Agent 项目；保留框架、编码 Agent、Harness、编排平台与关键基础设施。",
    "> 注意：GitHub 星数实时变动；本表为调研入口，不是官方榜单。未认证 API 有速率限制，覆盖可能略偏近期高星仓库。",
    "",
    "| 排名 | Stars | 项目 | 语言 | 类别 | 简介 |",
    "|---:|---:|---|---|---|---|",
]
for r in top:
    desc = (r.get("description") or "").replace("|", "\\|").replace("\n", " ")
    if len(desc) > 110:
        desc = desc[:107] + "..."
    lines.append(
        f"| {r['rank']} | {r['stars']:,} | [{r['full_name']}]({r['html_url']}) | "
        f"{r.get('language') or '-'} | {r.get('category') or '-'} | {desc or '-'} |"
    )

lines += ["", "## 类别分布", ""]
for cat, n in Counter(r.get("category") or "general-agent" for r in top).most_common():
    lines.append(f"- **{cat}**: {n}")

lines += ["", "## 主要语言分布", ""]
for lang, n in Counter((r.get("language") or "Unknown") for r in top).most_common(12):
    lines.append(f"- **{lang}**: {n}")

lines += [
    "",
    "## 系统架构调研建议抽样",
    "",
    "| 调研方向 | 优先阅读 |",
    "|---|---|",
    "| 多智能体编排 | MetaGPT, AutoGen, CrewAI, LangGraph, deer-flow |",
    "| 编码 Agent / CLI Harness | Claude Code, OpenHands, Cline, Aider, Codex, Gemini CLI, OpenInterpreter |",
    "| 可视化 Workflow | Dify, Langflow, Flowise, n8n |",
    "| 记忆 / 工具 / 沙箱 | Mem0, Composio, e2b, Daytona, Firecrawl, browser-use |",
    "| 研究型 Agent | gpt-researcher, agent-zero, SuperAGI, Stanford STORM |",
    "| 协议与可观测 | MCP SDKs, Langfuse, AgentOps, OpenLLMetry |",
    "",
    "配套阅读：Anthropic《Building Effective Agents》；各仓库 architecture / docs / AGENTS.md / system prompt 章节。",
    "",
]
md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"\nFinal count: {len(top)}")
for r in top[:20]:
    print(f"  {r['rank']:3d}. {r['stars']:>7,}  {r['full_name']}")
print(f"\nWrote {md_path}")
print(f"Wrote {csv_path}")
print(f"Wrote {json_path}")
