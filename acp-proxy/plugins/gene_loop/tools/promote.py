"""gene-loop Promote工具 — approved提案 → Gene规范模板 + evo_feedback闭环扩展

闭环（架构v2.1 §3.3 Promote阶段）:
    proposal(approved) → POST /api/gene/templates (category=dev_norm)
      → DB: promoted_to=gene:{scope}:{template_id}（INV2溯源闭合）
      → evo_feedback.json扩展: verdict=promoted:{governance}（planner下轮直接读到）

安全设计:
- Gene API不可达 → DB不动，不假报成功（跨系统顺序：Gene先应答，DB后落）
- reviewer强制hermes/user（INV4友好前置，DB触发器兜底）
- evo_feedback.json原子写+文件锁，与evo管线并发安全
- 幂等：同proposal重复promote返回already_promoted，feedback不重复追加
"""
from __future__ import annotations

import fcntl
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from schema import connect, migrate  # noqa: E402
try:
    from . import review_queue  # noqa: E402
except ImportError:
    import review_queue  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[3] / "data"  # parents[3]=acp-proxy/（2026-09-21修正）
FEEDBACK_PATH = Path(os.environ.get("GENE_LOOP_FEEDBACK") or DATA_DIR / "evo_feedback.json")
GENE_BASE = os.environ.get("GENE_API_BASE", "http://127.0.0.1:8090")


def _default_gene_client(payload: dict, gene_base: str) -> dict:
    import httpx
    resp = httpx.post(f"{gene_base.rstrip('/')}/api/gene/templates",
                      json=payload, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _append_feedback(entry: dict, path: Path | None = None) -> None:
    """evo_feedback.json兼容扩展（原子写+锁；parser只读verdict/reason，向后兼容）。"""
    path = path or FEEDBACK_PATH
    lock = path.with_suffix(".review_lock")
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (FileNotFoundError, json.JSONDecodeError):
                data = []
            if not isinstance(data, list):
                data = []
            if not any(isinstance(e, dict) and e.get("proposal_id") == entry.get("proposal_id")
                       for e in data):
                data.append(entry)
            tmp = path.with_suffix(".fbtmp")
            tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(path)
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)


def promote(proposal_id: str, reviewer: str, reason: str = "",
            db_path=None, gene_base: str | None = None,
            gene_client=None, feedback_path: Path | None = None,
            queue_path: Path | None = None) -> dict:
    """promote提案到Gene。返回摘要dict，失败时ok=False+error（不抛异常打断批次）。"""
    gene_client = gene_client or _default_gene_client
    gene_base = gene_base or GENE_BASE
    conn = connect(db_path)
    migrate(conn)
    try:
        row = conn.execute(
            "SELECT * FROM gene_proposals WHERE proposal_id=?",
            (proposal_id,)).fetchone()
        if row is None:
            return {"ok": False, "error": "proposal_not_found", "proposal_id": proposal_id}
        p = dict(row)
        if reviewer not in ("hermes", "user"):
            return {"ok": False, "error": "reviewer_must_be_hermes_or_user",
                    "proposal_id": proposal_id}
        if p["status"] == "promoted":
            return {"ok": True, "already_promoted": True,
                    "promoted_to": p["promoted_to"], "proposal_id": proposal_id}
        if p["status"] not in ("approved", "proposed"):
            return {"ok": False, "error": f"status_{p['status']}_not_promotable",
                    "proposal_id": proposal_id}

        # Gene模板payload
        template_id = f"devnorm-{proposal_id}"
        payload = {
            "template_id": template_id,
            "name": p["content"][:40],
            "category": "dev_norm",
            "description": p["content"],
            "author": "gene-loop",
            "tags": [p["governance"], "gene-loop", p["actor"], p["type"]],
            "config": {
                "rule": p["content"],
                "governance": p["governance"],
                "scope": p["scope"],
                "evidence": json.loads(p["evidence"] or "[]"),
                "source_cycle": p["source_cycle"],
                "proposal_id": proposal_id,
                "promoted_by": reviewer,
            },
        }
        # 跨系统顺序：Gene先应答，DB后落——Gene挂了DB不动
        try:
            resp = gene_client(payload, gene_base)
            tid = (resp or {}).get("template_id") or template_id
        except Exception as e:
            return {"ok": False, "error": "gene_api_unavailable",
                    "detail": str(e)[:200], "proposal_id": proposal_id}

        # 目标作用域编码（INV3）：global→gene:global:{tid}；project:{repo}→gene:{scope}:{tid}
        promoted_to = (f"gene:global:{tid}" if p["scope"] == "global"
                       else f"gene:{p['scope']}:{tid}")
        now = int(datetime.now().timestamp())
        now_iso = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
        try:
            conn.execute(
                """UPDATE gene_proposals
                   SET status='promoted', review_reviewer=?, review_reason=?,
                       review_at=?, promoted_to=?, promoted_at=?
                   WHERE proposal_id=?""",
                (reviewer, reason or f"promote via {reviewer} channel",
                 now, promoted_to, now, proposal_id))
            conn.commit()
        except Exception as e:  # INV触发器兜底拦截
            conn.rollback()
            return {"ok": False, "error": "db_update_rejected",
                    "detail": str(e)[:200], "proposal_id": proposal_id}

        # 闭环扩展：planner下轮_load_recent_feedback直接读到Gene已收录结论
        _append_feedback({
            "round_id": p["source_cycle"],
            "proposal_id": proposal_id,
            "verdict": f"promoted:{p['governance']}",
            "reason": f"【Gene已收录】{p['content'][:120]}",
            "issues": [],
            "reviewed_at": now_iso,
            "promoted_to": promoted_to,
            "reviewer": reviewer,
            "gene_loop": True,
        }, path=feedback_path)
        review_queue.mark_reviewed(proposal_id, "promoted", reviewer, reason,
                                   path=queue_path)
        return {"ok": True, "proposal_id": proposal_id, "promoted_to": promoted_to,
                "template_id": tid, "reviewer": reviewer, "feedback_extended": True}
    finally:
        conn.close()
