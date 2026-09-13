#!/usr/bin/env python3
"""Update coverage matrix with depth tier based on file size."""
import json
from pathlib import Path

base = Path(r"C:\Users\china\XiaomiMiMoProjects\.mimo-sessions\2026-09-13\# Hermes 正向列举模式：必须调用工具的7类场景-- 规则：命中下面--任")
lst = json.loads((base / "github_top100_ai_agents.json").read_text(encoding="utf-8"))
reports_dir = base / "agent-research/reports"
files = {p.stem.lower(): p for p in reports_dir.glob("*.md") if p.name != "COVERAGE-MATRIX.md"}
cards = {p.stem.lower() for p in (base / "agent-research/cards").glob("*.md") if p.name != "INDEX.md"}

alias = {
    "anthropics/claude-code": ["claude-code"], "anomalyco/opencode": ["opencode"],
    "openclaw/openclaw": ["openclaw"], "NousResearch/hermes-agent": ["hermes-agent"],
    "OpenHands/OpenHands": ["openhands"], "openai/codex": ["openai-codex"],
    "OpenInterpreter/open-interpreter": ["open-interpreter"], "e2b-dev/e2b": ["sandbox-e2b-daytona"],
    "daytonaio/daytona": ["sandbox-e2b-daytona"], "modelcontextprotocol/python-sdk": ["mcp"],
    "modelcontextprotocol/typescript-sdk": ["mcp"], "microsoft/autogen": ["autogen"],
    "ag2ai/ag2": ["autogen"], "langchain-ai/langgraph": ["langgraph"],
    "openai/openai-agents-python": ["openai-agents"], "google/adk-python": ["google-adk"],
    "bytedance/deer-flow": ["deer-flow"], "assafelovic/gpt-researcher": ["gpt-researcher"],
    "Stanford-oval/storm": ["storm"], "bytedance/UI-TARS-desktop": ["ui-tars"],
    "microsoft/agent-framework": ["microsoft-agent-framework"], "block/goose": ["goose"],
    "deepseek-ai/deepseek-harness": ["deepseek-harness"], "earendil-works/pi": ["pi"],
    "RooCodeInc/Roo-Code": ["roo-code"], "SWE-agent/SWE-agent": ["swe-agent", "swe-agent-l1"],
    "Significant-Gravitas/AutoGPT": ["autogpt", "autogpt-l1"], "continuedev/continue": ["continue"],
    "FoundationAgents/MetaGPT": ["metagpt"], "crewAIInc/crewAI": ["crewai"],
    "browser-use/browser-use": ["browser-use"], "langgenius/dify": ["dify"],
    "langflow-ai/langflow": ["langflow"], "FlowiseAI/Flowise": ["flowise"], "n8n-io/n8n": ["n8n"],
    "mem0ai/mem0": ["mem0"], "langfuse/langfuse": ["langfuse"], "ComposioHQ/composio": ["composio"],
    "firecrawl/firecrawl": ["firecrawl"], "agno-agi/agno": ["agno"],
    "huggingface/smolagents": ["smolagents"],
    "TauricResearch/TradingAgents": ["trading-agents", "trading-agents-l1"], "Aider-AI/aider": ["aider"],
    "openai/openai-agents-js": ["openai-agents-js", "openai-agents-js-l1"],
    "microsoft/agent-framework-dotnet": ["agent-framework-dotnet", "agent-framework-dotnet-l1"],
    "deepset-ai/haystack": ["haystack", "haystack-l1"],
    "microsoft/semantic-kernel": ["semantic-kernel", "semantic-kernel-l1"],
    "microsoft/PromptFlow": ["promptflow", "promptflow-l1"],
    "run-llama/llama_index": ["llama-index", "llama-index-l1"],
    "BerriAI/litellm": ["litellm", "litellm-l1"],
    "NVIDIA/NeMo-Guardrails": ["nemo-guardrails", "nemo-guardrails-l1"],
    "AgentOps-AI/agentops": ["agentops", "agentops-l1"],
    "traceloop/openllmetry": ["openllmetry", "openllmetry-l1"],
    "kyegomez/swarms": ["swarms", "swarms-l1"], "OpenBMB/ChatDev": ["chatdev", "chatdev-l1"],
    "OpenBMB/AgentVerse": ["agentverse", "agentverse-l1"], "OpenBMB/ToolBench": ["toolbench", "toolbench-l1"],
    "OpenBMB/AgentBench": ["agentbench", "agentbench-l1"], "InternLM/lagent": ["lagent", "lagent-l1"],
    "modelscope/agentscope": ["agentscope", "agentscope-l1"], "Langroid/langroid": ["langroid", "langroid-l1"],
    "camel-ai/camel": ["camel", "camel-l1"], "frdel/agent-zero": ["agent-zero", "agent-zero-l1"],
    "reworkd/AgentGPT": ["agentgpt", "agentgpt-l1"], "TransformerOptimus/SuperAGI": ["superagi", "superagi-l1"],
    "huginn/huginn": ["huginn", "huginn-l1"], "khoj-ai/khoj": ["khoj", "khoj-l1"],
    "Mintplex-Labs/anything-llm": ["anything-llm", "anything-llm-l1"],
    "danny-avila/LibreChat": ["librechat", "librechat-l1"],
    "lobehub/lobe-chat": ["lobe-chat", "lobe-chat-l1"],
    "open-webui/open-webui": ["open-webui", "open-webui-l1"],
    "labring/FastGPT": ["fastgpt", "fastgpt-l1"], "AstrBotDevs/AstrBot": ["astrbot", "astrbot-l1"],
    "chatchat-space/Langchain-Chatchat": ["langchain-chatchat", "langchain-chatchat-l1"],
    "HKUDS/nanobot": ["nanobot", "nanobot-l1"], "zhayujie/CowAgent": ["cowagent", "cowagent-l1"],
    "binary-husky/gpt_academic": ["gpt-academic", "gpt-academic-l1"],
    "imartinez/privateGPT": ["privategpt", "privategpt-l1"], "feder-cr/AIHawk": ["aihawk", "aihawk-l1"],
    "AntonOsika/gpt-engineer": ["gpt-engineer", "gpt-engineer-l1"],
    "Pythagora-io/gpt-pilot": ["gpt-pilot", "gpt-pilot-l1"], "stitionai/devika": ["devika", "devika-l1"],
    "smol-ai/developer": ["smol-developer", "smol-developer-l1"],
    "joonspk-research/generative-agents": ["generative-agents", "generative-agents-l1"],
    "langchain-ai/open_deep_research": ["open-deep-research", "open-deep-research-l1"],
    "langchain-ai/deepagents": ["deepagents", "deepagents-l1"],
    "OSU-NLP-Group/Mind2Web": ["mind2web", "mind2web-l1"],
    "web-arena-x/webarena": ["webarena", "webarena-l1"],
    "ChromeDevTools/chrome-devtools-mcp": ["chrome-devtools-mcp", "chrome-devtools-mcp-l1"],
    "getcursor/cursor": ["cursor", "cursor-l1"], "anysphere/cursor-cli": ["cursor-cli", "cursor-cli-l1"],
    "warpdotdev/warp": ["warp", "warp-l1"], "jina-ai/reader": ["jina-reader", "jina-reader-l1"],
    "666ghj/BettaFish": ["bettafish", "bettafish-l1"],
    "langchain-ai/langchain": ["langchain"], "vercel-labs/agent-browser": ["agent-browser"],
}

def tier(size: int) -> str:
    if size >= 15000:
        return "DEEP"
    if size >= 12000:
        return "OK"
    if size >= 8000:
        return "MID"
    return "SHALLOW"

lines = [
    "# 全量覆盖矩阵（98 · 含深度分层）",
    "",
    "> 深度分层：DEEP≥15KB · OK≥12KB · MID 8–12KB · SHALLOW<8KB",
    "> 达标线对标 openclaw.md（26KB）：源码路径 + 常量 + 失败路径",
    "",
    "| 排名 | 项目 | 文件 | 大小 | 深度 |",
    "|---:|---|---|---:|---|",
]
counts = {"DEEP": 0, "OK": 0, "MID": 0, "SHALLOW": 0, "MISSING": 0}
for it in lst:
    fn = it["full_name"]
    rank = it.get("rank") or ""
    cands = alias.get(fn) or [fn.split("/")[-1].lower().replace("_", "-")]
    hit = None
    size = 0
    t = "MISSING"
    for c in cands:
        if c in files:
            hit = c
            size = files[c].stat().st_size
            t = tier(size)
            break
    if not hit:
        for c in cands:
            if c in cards:
                hit = c
                size = 0
                t = "SHALLOW"
                break
    counts[t] = counts.get(t, 0) + 1
    kb = f"{size/1024:.1f}K" if size else "-"
    lines.append(f"| {rank} | {fn} | {hit or '-'} | {kb} | {t} |")

lines += [
    "",
    "## 深度汇总",
    f"- DEEP (≥15KB): **{counts['DEEP']}**",
    f"- OK (12–15KB): **{counts['OK']}**",
    f"- MID (8–12KB): **{counts['MID']}**",
    f"- SHALLOW (<8KB): **{counts['SHALLOW']}**",
    f"- MISSING: **{counts['MISSING']}**",
    f"- 深度达标 (DEEP+OK): **{counts['DEEP']+counts['OK']}/98**",
    "",
]
out = reports_dir / "COVERAGE-MATRIX.md"
out.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(counts)
print("wrote", out)
