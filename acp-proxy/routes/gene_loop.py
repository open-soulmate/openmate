"""gene-loop API路由 — 提案流水/审核/promote/digest

挂载: app.py include_router（prefix定义在本文件router上=/api/gene-loop）
运行时: acp-proxy-a(:8092)/acp-proxy-b(:8095)双实例共用data/gene_loop.db（WAL+锁）
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

ACPPROXY_ROOT = Path(__file__).resolve().parents[1]
if str(ACPPROXY_ROOT) not in sys.path:
    sys.path.insert(0, str(ACPPROXY_ROOT))

from plugins.gene_loop.schema import connect, migrate  # noqa: E402
from plugins.gene_loop.tools import propose as propose_tool  # noqa: E402
from plugins.gene_loop.tools import review_queue  # noqa: E402
from plugins.gene_loop.tools.promote import promote  # noqa: E402
from plugins.gene_loop.tools.review import ESCALATION_PATH  # noqa: E402

router = APIRouter(prefix="/api/gene-loop", tags=["gene-loop"])


class ProposeBody(BaseModel):
    limit: int = Field(default=5, ge=1, le=20)


class ReviewBody(BaseModel):
    verdict: str  # approved | rejected
    reviewer: str = "user"
    reason: str = ""
    auto_promote: bool = False


class PromoteBody(BaseModel):
    reviewer: str = "user"
    reason: str = ""


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "plugin": "gene-loop", "version": "1.0.0"}


@router.get("/status")
def status() -> dict:
    conn = connect(None)
    migrate(conn)
    try:
        counts = {r["status"]: r["n"] for r in conn.execute(
            "SELECT status, COUNT(*) n FROM gene_proposals GROUP BY status")}
    finally:
        conn.close()
    queue = review_queue.load_queue()
    pending = [e["proposal_id"] for e in queue if e.get("reviewed") is None]
    try:
        esc = json.loads(ESCALATION_PATH.read_text(encoding="utf-8"))
        open_esc = [e["proposal_id"] for e in esc if not e.get("resolved")]
    except (FileNotFoundError, json.JSONDecodeError):
        open_esc = []
    gene_ok = False
    try:
        import httpx
        gene_ok = httpx.get("http://127.0.0.1:8090/api/gene/health",
                            timeout=3).status_code == 200
    except Exception:
        gene_ok = False
    return {"counts": counts, "pending_review": pending,
            "open_escalations": open_esc, "gene_api_ok": gene_ok}


@router.get("/proposals")
def list_proposals(status: str | None = None, limit: int = 20) -> dict:
    conn = connect(None)
    migrate(conn)
    try:
        if status:
            rows = conn.execute(
                "SELECT * FROM gene_proposals WHERE status=? "
                "ORDER BY created_at DESC, proposal_id DESC LIMIT ?",
                (status, limit)).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM gene_proposals "
                "ORDER BY created_at DESC, proposal_id DESC LIMIT ?",
                (limit,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["evidence"] = json.loads(d.get("evidence") or "[]")
            except json.JSONDecodeError:
                d["evidence"] = []
            out.append(d)
        return {"proposals": out, "total": len(out)}
    finally:
        conn.close()


@router.post("/propose")
def run_propose(body: ProposeBody) -> dict:
    return propose_tool.propose(limit=body.limit)


@router.post("/review/{proposal_id}")
def review_proposal(proposal_id: str, body: ReviewBody) -> dict:
    if body.verdict not in ("approved", "rejected"):
        raise HTTPException(status_code=400,
                            detail="verdict必须是approved或rejected")
    if body.reviewer not in ("user", "hermes"):
        raise HTTPException(status_code=400,
                            detail="reviewer必须是user或hermes")
    conn = connect(None)
    migrate(conn)
    try:
        row = conn.execute(
            "SELECT * FROM gene_proposals WHERE proposal_id=?",
            (proposal_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="提案不存在")
        if dict(row)["status"] == "promoted":
            raise HTTPException(status_code=409, detail="提案已promote，不可改判")
        conn.execute(
            "UPDATE gene_proposals SET status=?, review_reviewer=?, "
            "review_reason=?, review_at=? WHERE proposal_id=?",
            (body.verdict, body.reviewer, body.reason, int(time.time()),
             proposal_id))
        conn.commit()
    finally:
        conn.close()
    review_queue.mark_reviewed(proposal_id, body.verdict, body.reviewer,
                               body.reason)
    result = {"ok": True, "proposal_id": proposal_id, "status": body.verdict}
    if body.verdict == "approved" and body.auto_promote:
        result["promote"] = promote(
            proposal_id, reviewer=body.reviewer,
            reason=body.reason or "审核通过自动promote")
    return result


@router.post("/promote/{proposal_id}")
def promote_proposal(proposal_id: str, body: PromoteBody) -> dict:
    if body.reviewer not in ("user", "hermes"):
        raise HTTPException(status_code=400,
                            detail="reviewer必须是user或hermes")
    return promote(proposal_id, reviewer=body.reviewer, reason=body.reason)


@router.get("/queue")
def get_queue() -> dict:
    return {"queue": review_queue.load_queue()}


@router.get("/escalations")
def get_escalations() -> dict:
    try:
        data = json.loads(ESCALATION_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        data = []
    return {"escalations": data}


@router.get("/digest")
def get_digest() -> dict:
    from plugins.gene_loop.cron_review import digest
    return json.loads(digest())
