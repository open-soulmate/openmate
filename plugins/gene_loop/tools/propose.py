"""gene-loop Propose工具 — evo_feedback.json / audit_log.jsonl → Gene规范提案

数据流（架构v2.1 §3.3 Propose阶段）:
    evo_feedback.json(Hermes审核结论) + audit_log.jsonl(管线事件)
      → gene_proposals(DB，4条数据层不变量强制)
      → gene_proposal_queue.json(Hermes审核队列)

规则:
- 每个source_cycle(round_id)只提案一次（去重，proposal_id=gp-{round_id}天然防重）
- 无证据不立案：evidence为空的条目直接跳过（INV1在DB层还有兜底）
- governance分类：import/命名/语法等硬规范问题→constraint；其余→context
- confidence：同因复发次数加成（0.5基线，复发+0.1/次，上限0.9）
- 文件锁与evo管线/Hermes cron互斥，安全并发
"""
from __future__ import annotations

import fcntl
import json
import os
import sqlite3
import sys
import time
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from schema import connect, migrate  # noqa: E402
try:
    from . import review_queue  # noqa: E402
except ImportError:
    import review_queue  # noqa: E402

ACPPROXY_ROOT = Path(__file__).resolve().parents[3] / "acp-proxy"  # parents[3]=项目根openmate/，数据在acp-proxy/data（2026-09-21目录统一）
DATA_DIR = ACPPROXY_ROOT / "data"
FEEDBACK_PATH = Path(os.environ.get("GENE_LOOP_FEEDBACK") or DATA_DIR / "evo_feedback.json")
AUDIT_PATH = Path(os.environ.get("GENE_LOOP_AUDIT") or DATA_DIR / "audit_log.jsonl")
LOCK_PATH = DATA_DIR / "gene_loop.lock"

CONSTRAINT_KEYWORDS = (
    "import", "语法", "命名", "规范", "结构", "越界", "immutable", "kernel",
    "truncat", "编码", "utf", "pycache", "模块", "路径", "文件名", "写入", "修改",
)
DEPRECATE_KEYWORDS = ("deprecate", "废弃", "删除规则", "废止")
REFINE_KEYWORDS = ("refine", "细化", "修订", "修改规范", "调整规范")
REJECT_VERDICTS = ("rejected", "rolled_back", "needs_work", "failed")

_INSERT_SQL = """
INSERT INTO gene_proposals
  (proposal_id, source_cycle, actor, type, content, governance, scope,
   confidence, evidence, status, review_reviewer, review_reason, review_at,
   promoted_to, promoted_at, created_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""


def _load_feedback(path: Path | None = None) -> list[dict]:
    path = path or FEEDBACK_PATH
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _load_audit_tail(path: Path | None = None, max_lines: int = 2000) -> list[dict]:
    path = path or AUDIT_PATH
    events: list[dict] = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in deque(f, maxlen=max_lines):
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except FileNotFoundError:
        pass
    return events


def _classify_governance(text: str) -> str:
    low = text.lower()
    return "constraint" if any(kw in low for kw in CONSTRAINT_KEYWORDS) else "context"


def _classify_type(text: str) -> str:
    low = text.lower()
    if any(kw in low for kw in DEPRECATE_KEYWORDS):
        return "deprecate_rule"
    if any(kw in low for kw in REFINE_KEYWORDS):
        return "refine_rule"
    return "lesson"


def _build_evidence(reason: str, issues: list, source: str) -> list[dict]:
    ev = []
    if reason:
        ev.append({"quote": str(reason)[:300], "source": source})
    for it in issues[:5]:
        q = str(it)[:300]
        if q and q not in {e["quote"] for e in ev}:
            ev.append({"quote": q, "source": source})
    return ev


def _build_content(reason: str, issues: list) -> str:
    parts = [f"[evo教训] {str(reason)[:200]}"]
    valid = [str(i) for i in issues if i]
    if valid:
        parts.append("规避：" + "；".join(valid[:3]))
    return " | ".join(parts)


def _recurrence(reason: str, feedback: list[dict]) -> int:
    if not reason or len(reason) < 6:
        return 1
    key = reason[:12]
    return sum(1 for f in feedback if key in str(f.get("reason") or ""))


def generate_proposals(feedback: list[dict], audit_events: list[dict],
                       existing_cycles: set, limit: int = 5) -> list[dict]:
    """从feedback+audit生成提案草稿（不落库）。existing_cycles=已提案过的round_id。"""
    proposals: list[dict] = []
    now = int(time.time())
    seen_cycles = set(existing_cycles)

    def _mk(cycle: str, actor: str, reason: str, issues: list, source: str) -> dict | None:
        evidence = _build_evidence(reason, issues, source)
        if not evidence:
            return None  # 无证据不立案
        text = f"{reason} {' '.join(str(i) for i in issues)}"
        conf = min(0.5 + 0.1 * (_recurrence(reason, feedback) - 1), 0.9)
        return {
            "proposal_id": f"gp-{cycle}",
            "source_cycle": cycle,
            "actor": actor,
            "type": _classify_type(text),
            "content": _build_content(reason, issues),
            "governance": _classify_governance(text),
            "scope": "global",
            "confidence": round(conf, 2),
            "evidence": json.dumps(evidence, ensure_ascii=False),
            "status": "proposed",
            "review_reviewer": None,
            "review_reason": None,
            "review_at": None,
            "promoted_to": None,
            "promoted_at": None,
            "created_at": now,
        }

    # 源1: evo_feedback.json — Hermes已审条目
    for fb in feedback:
        if len(proposals) >= limit:
            break
        reason = str(fb.get("reason") or "")
        issues = fb.get("issues") or []
        verdict = str(fb.get("verdict") or "").lower()
        if verdict not in REJECT_VERDICTS and not issues:
            continue  # 通过且无issue的不产生提案
        cycle = str(fb.get("round_id") or "").strip()
        if not cycle or cycle in seen_cycles:
            continue
        p = _mk(cycle, "evo", reason, issues, f"evo_feedback.json:{cycle}")
        if p:
            proposals.append(p)
            seen_cycles.add(cycle)

    # 源2: audit_log.jsonl — 被拒管线事件（feedback未覆盖的round）
    for ev in audit_events:
        if len(proposals) >= limit:
            break
        if ev.get("event") not in ("plan_rejected", "code_rejected", "rollback"):
            continue
        cycle = str(ev.get("round_id") or "").strip()
        if not cycle or cycle in seen_cycles:
            continue
        reason = str(ev.get("reason") or ev.get("message") or "")
        if not reason:
            continue
        p = _mk(cycle, "evo", reason, [], f"audit_log.jsonl:{cycle}")
        if p:
            proposals.append(p)
            seen_cycles.add(cycle)

    return proposals


def propose(limit: int = 5, db_path=None, feedback_path=None,
            audit_path=None, queue_path=None) -> dict:
    """生成并落库提案+入审核队列。返回摘要dict（供CLI/API/测试）。"""
    db_path = db_path or None
    lock_target = Path(db_path).with_suffix(".lock") if db_path else LOCK_PATH
    lock_target.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_target, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            conn = connect(db_path)
            migrate(conn)
            existing = {r["source_cycle"] for r in
                        conn.execute("SELECT source_cycle FROM gene_proposals")}
            candidates = generate_proposals(
                _load_feedback(feedback_path),
                _load_audit_tail(audit_path),
                existing, limit=limit,
            )
            inserted, errors = [], []
            for p in candidates:
                try:
                    conn.execute(_INSERT_SQL, (
                        p["proposal_id"], p["source_cycle"], p["actor"], p["type"],
                        p["content"], p["governance"], p["scope"], p["confidence"],
                        p["evidence"], p["status"], p["review_reviewer"],
                        p["review_reason"], p["review_at"], p["promoted_to"],
                        p["promoted_at"], p["created_at"],
                    ))
                    conn.commit()
                    inserted.append(p)
                except sqlite3.IntegrityError as e:
                    conn.rollback()
                    errors.append({"proposal_id": p["proposal_id"], "error": str(e)})
            if inserted:
                if queue_path:
                    review_queue.enqueue(inserted, path=Path(queue_path))
                else:
                    review_queue.enqueue(inserted)
            conn.close()
            return {
                "ok": True,
                "inserted": len(inserted),
                "queued": len(inserted),
                "errors": errors,
                "proposals": [
                    {k: p[k] for k in ("proposal_id", "type", "governance",
                                        "confidence", "content")}
                    for p in inserted
                ],
            }
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="gene-loop Propose")
    ap.add_argument("--limit", type=int, default=5)
    args = ap.parse_args()
    print(json.dumps(propose(limit=args.limit), ensure_ascii=False, indent=2))
