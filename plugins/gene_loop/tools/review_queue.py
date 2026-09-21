"""gene-loop 审核队列 — data/gene_proposal_queue.json

与data/hermes_review_queue.json分离（任务书S4）：
- hermes_review_queue.json = evo产出的review队列（既有，Phase A不动）
- gene_proposal_queue.json = Gene规范提案的review队列（本插件新建）

提案生命周期: propose(入队) → Hermes审核(approve/reject) → promote(写Gene+出队标记)
"""
from __future__ import annotations

import fcntl
import json
import time
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[3] / "acp-proxy" / "data"  # parents[3]=项目根openmate/（2026-09-21目录统一）
QUEUE_PATH = DATA_DIR / "gene_proposal_queue.json"
LOCK_PATH = DATA_DIR / "gene_proposal_queue.lock"


def load_queue(path: Path | None = None) -> list[dict]:
    path = path or QUEUE_PATH
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def enqueue(proposals: list[dict], path: Path | None = None) -> int:
    """提案入队（幂等：proposal_id去重）。文件锁保证与evo/Hermes cron并发安全。"""
    if not proposals:
        return 0
    path = path or QUEUE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK_PATH, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            queue = load_queue(path)
            ids = {e.get("proposal_id") for e in queue}
            added = 0
            for p in proposals:
                pid = p["proposal_id"]
                if pid in ids:
                    continue
                queue.append({
                    "proposal_id": pid,
                    "actor": p["actor"],
                    "type": p["type"],
                    "governance": p["governance"],
                    "scope": p["scope"],
                    "confidence": p["confidence"],
                    "content": p["content"],
                    "evidence": p["evidence"],
                    "source_cycle": p["source_cycle"],
                    "enqueued_at": int(time.time()),
                    "reviewed": None,
                })
                ids.add(pid)
                added += 1
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(queue, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(path)
            return added
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)


def mark_reviewed(proposal_id: str, verdict: str, reviewer: str,
                  reason: str = "", path: Path | None = None) -> bool:
    """队列条目标记已审（DB是提案真相源，queue仅是审核工作清单）。"""
    path = path or QUEUE_PATH
    with open(LOCK_PATH, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            queue = load_queue(path)
            hit = False
            for e in queue:
                if e.get("proposal_id") == proposal_id:
                    e["reviewed"] = {
                        "verdict": verdict,
                        "reviewer": reviewer,
                        "reason": reason,
                        "reviewed_at": int(time.time()),
                    }
                    hit = True
            if hit:
                tmp = path.with_suffix(".tmp")
                tmp.write_text(json.dumps(queue, ensure_ascii=False, indent=2), encoding="utf-8")
                tmp.replace(path)
            return hit
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)
