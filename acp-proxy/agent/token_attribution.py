"""P0-4/P1: 上下文逐项token归因（agent运行时侧） — claude-code SDKContextUsage移植

调研来源：feature-matrix/10-claude-code-source.md #7（SDKContextUsage：total_tokens/
raw_max_tokens/percentage/over_limit{tokens_over, kind: hard_limit|compaction_window} +
四类明细 mcp_tools[]/memory_files[]/agents[]/skills[]，每项多少token一目了然）；
SUMMARY.md P0-4"用户极度重视可观测性→此P0含金量最高"+P1"token逐项归因（per-tool/per-agent）"。

镜像关系：opensoul/src/cortex/token_attribution.py 是本模块在OpenSoul侧的规范实现；
acp-proxy是独立venv/独立进程，无法import opensoul，故此为同启发式镜像实现。
两侧estimate_tokens公式必须一致（两侧测试套件各自断言同一公式）。

账本模式（与tool_output spill账本同构，见agent/tool_output_handler.py）：
soulmate agent以stdio子进程运行，归因记录写JSONL账本；app.py API进程跨进程读取。
账本是共享文件系统真源——"agent写、API进程读"。

失败纪律（mem0 §1.1 + 本项目fail-safe惯例）：归因是观测性旁路，任何异常不得阻断
agent执行路径（soulmate_agent调用点全部try/except，失败仅debug日志）。
"""
from __future__ import annotations

import json
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("acp-proxy.token-attribution")

# ── item kinds（SDKContextUsage四类明细 + OpenSoul/agent侧扩展类别）──
KIND_MCP_TOOL = "mcp_tool"
KIND_BUILTIN_TOOL = "builtin_tool"
KIND_EVOLUTION_TOOL = "evolution_tool"
KIND_TOOL = "tool"
KIND_MEMORY = "memory_file"
KIND_AGENT = "agent"
KIND_SKILL = "skill"
KIND_SYSTEM_PROMPT = "system_prompt"
KIND_MESSAGE = "message"
KIND_TOOL_RESULT = "tool_result"
KIND_PREFERENCE = "preference"
KIND_IMPROVEMENT = "improvement"
KIND_OTHER = "other"

_LIST_KEYS = {
    KIND_MCP_TOOL: "mcp_tools",
    KIND_BUILTIN_TOOL: "builtin_tools",
    KIND_EVOLUTION_TOOL: "evolution_tools",
    KIND_TOOL: "tools",
    KIND_MEMORY: "memory_files",
    KIND_AGENT: "agents",
    KIND_SKILL: "skills",
}

# 模型上下文窗口粗表（子串匹配）。agent侧默认窗口与llm_engine._truncate_context
# 默认max_tokens=32000对齐，可用AGENT_CONTEXT_WINDOW env覆盖（实际窗口受本地
# ollama num_ctx / 远端模型规格影响，粗表仅用于percentage与超限性质判定）。
MODEL_CONTEXT_LIMITS: dict[str, int] = {
    "deepseek": 65536,
    "mimo": 65536,
    "qwen": 32768,
    "glm": 128000,
    "gpt-4o": 128000,
    "gpt-4": 128000,
    "claude": 200000,
    "kimi": 128000,
}
DEFAULT_CONTEXT_WINDOW = 32000
DEFAULT_COMPACTION_RATIO = 0.75  # agent.context_budget.TokenBudget.compression_threshold同值


def resolve_context_window(model: str | None, default: int = DEFAULT_CONTEXT_WINDOW) -> int:
    if not model:
        return default
    m = model.lower()
    for key, window in MODEL_CONTEXT_LIMITS.items():
        if key in m:
            return window
    return default


def estimate_tokens(text: str) -> int:
    """token估算（CJK≈1token/字符，其余chars//4）。与opensoul侧公式一致。"""
    if not text:
        return 0
    cjk = 0
    for ch in text:
        o = ord(ch)
        if 0x4E00 <= o <= 0x9FFF or 0x3000 <= o <= 0x303F or 0xFF00 <= o <= 0xFFEF:
            cjk += 1
    return cjk + (len(text) - cjk) // 4


@dataclass
class ContextItem:
    kind: str
    name: str
    source: str = ""
    tokens: int = 0
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = {"name": self.name, "source": self.source, "tokens": self.tokens}
        if self.extra:
            d.update(self.extra)
        return d


def items_from_openai_tools(
    tools: list[dict] | None, source: str, kind: str | None = None
) -> list[ContextItem]:
    """OpenAI function-calling工具定义 → 逐工具ContextItem（per-tool归因：
    "262个工具定义里哪个最吃上下文"的直接答案）。"""
    if not tools:
        return []
    if kind is None:
        kind = {
            "mcp": KIND_MCP_TOOL,
            "builtin": KIND_BUILTIN_TOOL,
            "evolution": KIND_EVOLUTION_TOOL,
        }.get(source, KIND_TOOL)
    items: list[ContextItem] = []
    for t in tools:
        try:
            fn = (t or {}).get("function", {}) or {}
            name = str(fn.get("name") or "unnamed_tool")
            tokens = estimate_tokens(json.dumps(t, ensure_ascii=False))
            items.append(ContextItem(kind=kind, name=name, source=source, tokens=tokens))
        except Exception:
            continue
    return items


def build_context_usage(
    items: list[ContextItem],
    max_tokens: int | None = None,
    compaction_tokens: int | None = None,
    model: str | None = None,
) -> dict:
    """构建SDKContextUsage形态归因结果（与opensoul侧同构）。"""
    if max_tokens is None:
        max_tokens = resolve_context_window(model)
    max_tokens = max(1, int(max_tokens))
    if compaction_tokens is None:
        compaction_tokens = int(max_tokens * DEFAULT_COMPACTION_RATIO)

    total = sum(i.tokens for i in items)
    percentage = round(total * 100.0 / max_tokens, 1)

    over_limit: dict | None = None
    if total > max_tokens:
        over_limit = {"tokens_over": total - max_tokens, "kind": "hard_limit"}
    elif total > compaction_tokens:
        over_limit = {"tokens_over": total - compaction_tokens, "kind": "compaction_window"}

    lists: dict[str, list] = {k: [] for k in _LIST_KEYS.values()}
    sections: dict[str, int] = {}
    for it in items:
        key = _LIST_KEYS.get(it.kind)
        if key:
            lists[key].append(it.to_dict())
        else:
            sections[it.kind] = sections.get(it.kind, 0) + it.tokens

    ranked = sorted(items, key=lambda i: i.tokens, reverse=True)
    top = [
        {
            "name": i.name,
            "kind": i.kind,
            "source": i.source,
            "tokens": i.tokens,
            "percentage": round(i.tokens * 100.0 / max_tokens, 1),
        }
        for i in ranked[:10]
    ]

    return {
        "total_tokens": total,
        "raw_max_tokens": max_tokens,
        "compaction_tokens": compaction_tokens,
        "percentage": percentage,
        "over_limit": over_limit,
        **lists,
        "sections": sections,
        "top_consumers": top,
        "item_count": len(items),
    }


class AttributionLedger:
    """JSONL归因账本 — agent子进程写 / app.py API进程跨进程读。

    与ToolOutputHandler spill账本同构：账本文件是共享文件系统真源，
    写入方和读取方可以是不同进程/不同实例。
    """

    def __init__(self, ledger_dir: str = "", max_recent: int = 20):
        if not ledger_dir:
            ledger_dir = str(Path.home() / ".hermes" / "soulmate" / "token_attribution")
        self.ledger_dir = Path(ledger_dir)
        self.max_recent = max_recent
        self.ledger_path = self.ledger_dir / "attribution_ledger.jsonl"
        try:
            self.ledger_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass

    def record(
        self,
        usage: dict,
        session_id: str = "",
        model: str = "",
        extra: dict | None = None,
    ) -> dict:
        rec = {
            "ts": time.time(),
            "session_id": session_id,
            "model": model,
            "usage": usage,
        }
        if extra:
            rec["extra"] = extra
        try:
            with open(self.ledger_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        except Exception as exc:
            logger.debug("token attribution ledger write failed (non-fatal): %s", exc)
        return rec

    def backfill_actual(
        self,
        session_id: str,
        actual_prompt_tokens: int | None,
        round_index: int | None = None,
    ) -> dict | None:
        """P1 provider usage回填（opensoul ContextAttributor.backfill_actual镜像语义）：
        LLM请求的provider响应里拿到权威prompt_tokens后，匹配最近一条同session归因
        记录，计算estimate_gap = actual - usage.total_tokens——gap即"隐藏开销"（provider
        侧chat模板/系统提示等我方估算未覆盖的部分），也是估算器自我校准信号源。

        账本模式差异（vs opensoul进程内deque）：本侧记录与回填都是JSONL追加行
        （append-only审计，mem0 §1.2），backfill行带backfill:true标记与归因记录区分；
        round_index标注该usage来自工具循环第几轮（上下文逐轮增长，gap按轮配对读取）。

        找不到匹配session记录/actual为None → 返回None（fail-safe，不新建不抛）。
        """
        if actual_prompt_tokens is None:
            return None
        try:
            recs = self._read_tail()
            matched = None
            for r in reversed(recs):
                if r.get("backfill"):
                    continue
                if r.get("session_id") == session_id and r.get("usage"):
                    matched = r
                    break
            if matched is None:
                return None
            gap = int(actual_prompt_tokens) - int(
                matched.get("usage", {}).get("total_tokens", 0)
            )
            row = {
                "backfill": True,
                "ts": time.time(),
                "session_id": session_id,
                "actual_prompt_tokens": int(actual_prompt_tokens),
                "estimate_gap": gap,
                "matched_record_ts": matched.get("ts"),
            }
            if round_index is not None:
                row["round"] = round_index
            try:
                with open(self.ledger_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
            except Exception as exc:
                logger.debug(
                    "token attribution backfill ledger write failed (non-fatal): %s",
                    exc,
                )
            return row
        except Exception as exc:
            logger.debug("token attribution backfill unavailable (non-fatal): %s", exc)
            return None

    def _read_tail(self, max_lines: int = 5000) -> list[dict]:
        """读取账本尾部（读取侧限行数防OOM——与tool_output get_stats同策略）。"""
        if not self.ledger_path.exists():
            return []
        recs: list[dict] = []
        try:
            with open(self.ledger_path, encoding="utf-8") as f:
                lines = f.readlines()
            for line in lines[-max_lines:]:
                line = line.strip()
                if not line:
                    continue
                try:
                    recs.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        except Exception as exc:
            logger.debug("token attribution ledger read failed: %s", exc)
        return recs

    def get_stats(self, limit: int | None = None) -> dict:
        """跨进程统计：最近记录 + 聚合摘要 + provider usage回填合并。

        P1回填合并语义：归因记录在LLM请求发出前写入、backfill行在该请求的provider
        响应后写入——时序即配对，每条归因记录匹配"其ts之后第一条同session的backfill行"。
        backfill行本身不计入total_records/总量统计（它不是一次上下文快照）。
        合并输出：记录行/summary.latest带actual_prompt_tokens + estimate_gap，
        summary带backfill_count + avg_estimate_gap。
        """
        limit = limit or self.max_recent
        all_recs = self._read_tail()
        backfills = [r for r in all_recs if r.get("backfill")]
        recs = [r for r in all_recs if not r.get("backfill")]
        if not recs:
            return {
                "total_records": 0,
                "recent": [],
                "summary": {"total_records": 0},
                "ledger_path": str(self.ledger_path),
            }

        def _match_backfill(rec: dict) -> dict | None:
            """rec写入之后的第一条同session backfill行（时序配对）"""
            for bf in all_recs:
                if not bf.get("backfill"):
                    continue
                if (bf.get("session_id") == rec.get("session_id")
                        and bf.get("ts", 0) >= rec.get("ts", 0)):
                    return bf
            return None

        gaps: list[int] = []
        for r in recs:
            bf = _match_backfill(r)
            if bf is not None:
                r["actual_prompt_tokens"] = bf.get("actual_prompt_tokens")
                r["estimate_gap"] = bf.get("estimate_gap")
                if bf.get("round") is not None:
                    r["backfill_round"] = bf.get("round")
                if bf.get("estimate_gap") is not None:
                    gaps.append(int(bf["estimate_gap"]))

        totals = [r.get("usage", {}).get("total_tokens", 0) for r in recs]
        over = sum(1 for r in recs if r.get("usage", {}).get("over_limit"))
        agg: dict[tuple, dict] = {}
        for r in recs:
            for c in r.get("usage", {}).get("top_consumers", []):
                key = (c.get("kind"), c.get("name"))
                slot = agg.setdefault(
                    key,
                    {"kind": c.get("kind"), "name": c.get("name"), "source": c.get("source"),
                     "tokens_total": 0, "times_seen": 0},
                )
                slot["tokens_total"] += c.get("tokens", 0)
                slot["times_seen"] += 1
        top = sorted(agg.values(), key=lambda s: s["tokens_total"], reverse=True)[:10]
        for s in top:
            s["avg_tokens"] = s["tokens_total"] // max(1, s["times_seen"])

        latest = recs[-1]  # 最新归因记录（backfill行不参与latest选取）
        latest_usage = latest.get("usage", {})
        return {
            "total_records": len(recs),
            "recent": recs[-limit:][::-1],  # 最新在前
            "summary": {
                "total_records": len(recs),
                "over_limit_records": over,
                "avg_total_tokens": sum(totals) // len(totals),
                "max_total_tokens": max(totals),
                "latest": {
                    "ts": latest.get("ts"),
                    "session_id": latest.get("session_id", ""),
                    "model": latest.get("model", ""),
                    "total_tokens": latest_usage.get("total_tokens", 0),
                    "percentage": latest_usage.get("percentage", 0),
                    "over_limit": latest_usage.get("over_limit"),
                    "raw_max_tokens": latest_usage.get("raw_max_tokens", 0),
                    "item_count": latest_usage.get("item_count", 0),
                    # P1 provider usage回填：估算 vs provider权威prompt_tokens
                    "actual_prompt_tokens": latest.get("actual_prompt_tokens"),
                    "estimate_gap": latest.get("estimate_gap"),
                },
                "top_consumers": top,
                "backfill_count": len(backfills),
                "avg_estimate_gap": (sum(gaps) // len(gaps)) if gaps else None,
            },
            "ledger_path": str(self.ledger_path),
        }
