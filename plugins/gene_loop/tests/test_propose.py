"""S2测试 — Propose工具：feedback/audit→提案，去重，分类，INV1独立防线

运行: cd ~/openmate && /home/climbing/opensoul/.venv/bin/pytest plugins/gene_loop/tests/ -v
"""
import json
import sqlite3
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import schema  # noqa: E402
from tools import propose as propose_mod  # noqa: E402
from tools import review_queue  # noqa: E402

# 真实格式样本（结构来自acp-proxy/data/evo_feedback.json实文件）
FEEDBACK = [
    {"round_id": "evo_fb001", "verdict": "rolled_back",
     "reason": "evo主循环import错误",
     "issues": ["evo主循环import错误：autonomous_executor未定义"],
     "reviewed_at": "2026-09-20T05:00:00"},
    {"round_id": "evo_fb002", "verdict": "rejected",
     "reason": "方案视角单一",
     "issues": ["仅pytest视角，缺curl+audit日志双证据"],
     "reviewed_at": "2026-09-20T06:00:00"},
    {"round_id": "evo_fb003", "verdict": "passed",
     "reason": "通过", "issues": [],
     "reviewed_at": "2026-09-20T07:00:00"},
]
AUDIT = [
    {"ts": "2026-09-20T08:00:00", "round_id": "evo_au010",
     "event": "code_rejected",
     "reason": "CLAUDE.local.md被写入(truncated内核文件)"},
    {"ts": "2026-09-20T08:10:00", "round_id": "evo_au011",
     "event": "verdict", "reason": "通过"},
]


@pytest.fixture
def env(tmp_path, monkeypatch):
    fb = tmp_path / "evo_feedback.json"
    fb.write_text(json.dumps(FEEDBACK, ensure_ascii=False), encoding="utf-8")
    audit = tmp_path / "audit_log.jsonl"
    audit.write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in AUDIT),
                     encoding="utf-8")
    qpath = tmp_path / "queue.json"
    monkeypatch.setattr(propose_mod, "FEEDBACK_PATH", fb)
    monkeypatch.setattr(propose_mod, "AUDIT_PATH", audit)
    monkeypatch.setattr(review_queue, "QUEUE_PATH", qpath)
    monkeypatch.setattr(review_queue, "LOCK_PATH", tmp_path / "queue.lock")
    return {"db": tmp_path / "test.db", "queue": qpath, "feedback": fb}


def _rows(conn):
    return [dict(r) for r in conn.execute(
        "SELECT * FROM gene_proposals ORDER BY proposal_id")]


def test_generate_maps_import_lesson_to_constraint(env):
    result = propose_mod.propose(limit=5, db_path=env["db"])
    assert result["ok"] and result["inserted"] >= 2
    by_id = {p["proposal_id"]: p for p in result["proposals"]}
    p1 = by_id["gp-evo_fb001"]
    assert p1["governance"] == "constraint"      # import类→硬规范
    assert p1["type"] == "lesson"
    conn = schema.connect(env["db"])
    row = dict(conn.execute(
        "SELECT * FROM gene_proposals WHERE proposal_id='gp-evo_fb001'").fetchone())
    assert row["actor"] == "evo" and row["status"] == "proposed"
    ev = json.loads(row["evidence"])
    assert len(ev) >= 1 and all(e["quote"] and e["source"] for e in ev)
    assert ev[0]["source"] == "evo_feedback.json:evo_fb001"


def test_generate_skips_passed_and_guards_evidence(env):
    result = propose_mod.propose(limit=5, db_path=env["db"])
    ids = {p["proposal_id"] for p in result["proposals"]}
    assert "gp-evo_fb003" not in ids              # passed且无issue→不提案
    assert "gp-evo_au010" in ids                  # audit拒绝事件→提案
    assert "gp-evo_au011" not in ids              # audit非拒绝事件→不提案


def test_dedupe_on_second_run(env):
    first = propose_mod.propose(limit=5, db_path=env["db"])
    assert first["inserted"] >= 3
    second = propose_mod.propose(limit=5, db_path=env["db"])
    assert second["inserted"] == 0               # source_cycle去重


def test_queue_filled_for_review(env):
    propose_mod.propose(limit=5, db_path=env["db"])
    queue = review_queue.load_queue(env["queue"])
    assert len(queue) >= 3
    entry = next(e for e in queue if e["proposal_id"] == "gp-evo_fb001")
    assert entry["reviewed"] is None
    assert entry["governance"] == "constraint"
    assert entry["confidence"] >= 0.5


def test_inv1_invariant_defends_db_independently(env):
    """即使工具层被绕过，DB层INV1仍拦截无证据提案。"""
    propose_mod.propose(limit=5, db_path=env["db"])  # 建表
    conn = schema.connect(env["db"])
    now = int(time.time())
    with pytest.raises(sqlite3.IntegrityError, match="INV1"):
        conn.execute(propose_mod._INSERT_SQL, (
            "gp-bypass", "evo_bypass", "evo", "lesson", "绕过工具层",
            "context", "global", 0.5, "[]", "proposed",
            None, None, None, None, None, now,
        ))
