"""gene-loop Review工具 — Hermes审核通道（v2.1 §3.4权限引擎的机械化部分）

审批策略（对应权限引擎"常规放行，ASK核心"）:
- constraint类且confidence>=0.7 → 自动approve+promote（常规放行，reviewer='hermes'）
- lesson/context类且confidence>=0.8 → 自动approve+promote
- deprecate_rule / refine_rule（核心规范变更）→ ASK用户，绝不自动放行
- 低置信 → ASK用户
- promote失败（Gene不可达等）→ escalate，不假报成功

escalation落盘data/gene_loop_escalations.json，cron摘要推送微信端。
用户拍板: cron_review.py --approve gp-xxx --reviewer user / --reject gp-xxx --reason ...
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from schema import connect, migrate  # noqa: E402
try:
    from . import review_queue  # noqa: E402
    from .promote import promote  # noqa: E402
except ImportError:
    import review_queue  # noqa: E402
    from promote import promote  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[3] / "acp-proxy" / "data"  # parents[3]=项目根openmate/（2026-09-21目录统一）
ESCALATION_PATH = Path(os.environ.get("GENE_LOOP_ESCALATIONS")
                       or DATA_DIR / "gene_loop_escalations.json")
AUTO_PROMOTE_TYPES = ("lesson", "new_rule")


def _escalate(snapshot: dict, why: str, path: Path | None = None) -> None:
    path = path or ESCALATION_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        data = []
    if any(e.get("proposal_id") == snapshot["proposal_id"] for e in data):
        return
    keep = ("proposal_id", "actor", "type", "governance", "scope",
            "confidence", "content", "evidence", "source_cycle")
    data.append({
        **{k: snapshot[k] for k in keep if k in snapshot},
        "escalated_at": int(time.time()),
        "why": why,
        "resolved": False,
    })
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def process_queue(reviewer: str = "hermes", db_path=None, gene_client=None,
                  gene_base=None, feedback_path=None, queue_path=None,
                  escalation_path=None,
                  auto_min_constraint: float = 0.7,
                  auto_min_context: float = 0.8) -> dict:
    """处理gene_proposal_queue.json中未审条目。返回{promoted,escalated,skipped}。"""
    conn = connect(db_path)
    migrate(conn)
    try:
        queue = review_queue.load_queue(queue_path)
        promoted: list[dict] = []
        escalated: list[dict] = []
        skipped: list[dict] = []
        for entry in queue:
            if entry.get("reviewed") is not None:
                continue
            pid = entry["proposal_id"]
            row = conn.execute(
                "SELECT * FROM gene_proposals WHERE proposal_id=?",
                (pid,)).fetchone()
            if row is None:
                skipped.append({"proposal_id": pid, "why": "db_row_missing"})
                continue
            p = dict(row)
            if p["status"] not in ("proposed", "approved"):
                skipped.append({"proposal_id": pid, "why": f"status_{p['status']}"})
                continue

            # ASK路径：核心规范变更必须用户拍板（31规范deprecate需creator/reviewer一致）
            if p["type"] in ("deprecate_rule", "refine_rule"):
                _escalate(p, f"ASK:{p['type']}_needs_user_decision", escalation_path)
                review_queue.mark_reviewed(pid, "escalated", reviewer, "ASK用户",
                                           queue_path)
                escalated.append({"proposal_id": pid,
                                  "why": f"ASK:{p['type']}",
                                  "content": p["content"]})
                continue

            threshold = (auto_min_constraint if p["governance"] == "constraint"
                         else auto_min_context)
            if p["type"] in AUTO_PROMOTE_TYPES and p["confidence"] >= threshold:
                r = promote(pid, reviewer=reviewer,
                            reason=(f"auto-promote: {p['governance']} "
                                    f"conf={p['confidence']}"),
                            db_path=db_path, gene_client=gene_client,
                            gene_base=gene_base, feedback_path=feedback_path,
                            queue_path=queue_path)
                if r.get("ok"):
                    promoted.append({"proposal_id": pid,
                                     "promoted_to": r.get("promoted_to"),
                                     "content": p["content"]})
                else:
                    why = f"promote_failed:{r.get('error')}"
                    _escalate(p, why, escalation_path)
                    review_queue.mark_reviewed(pid, "escalated", reviewer,
                                               why, queue_path)
                    escalated.append({"proposal_id": pid, "why": why,
                                      "content": p["content"]})
            else:
                why = f"low_confidence:{p['confidence']}<{threshold}"
                _escalate(p, why, escalation_path)
                review_queue.mark_reviewed(pid, "escalated", reviewer,
                                           "低置信待用户拍板", queue_path)
                escalated.append({"proposal_id": pid, "why": why,
                                  "content": p["content"]})
        return {"ok": True, "promoted": promoted, "escalated": escalated,
                "skipped": skipped, "queue_len": len(queue)}
    finally:
        conn.close()
