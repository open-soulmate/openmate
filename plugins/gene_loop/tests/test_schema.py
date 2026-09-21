"""S1测试 — gene_proposals 4条数据层不变量（正反用例）+ migrate幂等

运行: /home/climbing/opensoul/.venv/bin/pytest plugins/gene_loop/tests/test_schema.py -v
（实测2026-09-21：opensoul/.venv有pytest；hermes venv路径已失效）
"""
import json
import sqlite3
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import schema  # noqa: E402

EVIDENCE = json.dumps(
    [{"quote": "import P是半个词，直接导致进程import即死", "source": "evo_feedback.json"}],
    ensure_ascii=False,
)
NOW = int(time.time())


def make_conn(tmp_path: Path) -> sqlite3.Connection:
    conn = schema.connect(tmp_path / "gene_loop_test.db")
    schema.migrate(conn)
    return conn


def base_row(**overrides) -> dict:
    row = {
        "proposal_id": "gp-test-001",
        "source_cycle": "evo_test_round",
        "actor": "evo",
        "type": "lesson",
        "content": "import必须写完整模块路径并位于文件顶部",
        "governance": "constraint",
        "scope": "global",
        "confidence": 0.7,
        "evidence": EVIDENCE,
        "status": "proposed",
        "review_reviewer": None,
        "review_reason": None,
        "review_at": None,
        "promoted_to": None,
        "created_at": NOW,
        "promoted_at": None,
    }
    row.update(overrides)
    return row


def insert(conn: sqlite3.Connection, row: dict):
    cols = ",".join(row.keys())
    marks = ",".join("?" for _ in row)
    conn.execute(f"INSERT INTO gene_proposals ({cols}) VALUES ({marks})", list(row.values()))
    conn.commit()


def test_migrate_idempotent(tmp_path):
    conn = make_conn(tmp_path)
    schema.migrate(conn)  # 第二次执行不报错
    assert conn.execute("SELECT COUNT(*) FROM gene_proposals").fetchone()[0] == 0


# ── 不变量1：无证据不立案 ──
def test_inv1_empty_evidence_rejected(tmp_path):
    conn = make_conn(tmp_path)
    with pytest.raises(sqlite3.IntegrityError, match="INV1"):
        insert(conn, base_row(evidence="[]"))


def test_inv1_valid_evidence_accepted(tmp_path):
    conn = make_conn(tmp_path)
    insert(conn, base_row())
    assert conn.execute("SELECT COUNT(*) FROM gene_proposals").fetchone()[0] == 1


# ── 不变量2：promote溯源闭合 ──
def test_inv2_promoted_without_trace_rejected(tmp_path):
    conn = make_conn(tmp_path)
    with pytest.raises(sqlite3.IntegrityError, match="INV2"):
        insert(conn, base_row(status="promoted", actor="user", review_reviewer="user"))


def test_inv2_promoted_with_full_trace_accepted(tmp_path):
    conn = make_conn(tmp_path)
    insert(conn, base_row(
        status="promoted", actor="user", review_reviewer="user",
        promoted_to="gene:global:rule-001", promoted_at=NOW,
    ))
    assert conn.execute("SELECT status FROM gene_proposals").fetchone()[0] == "promoted"


# ── 不变量3：作用域不越级 ──
def test_inv3_project_promote_global_rejected(tmp_path):
    conn = make_conn(tmp_path)
    with pytest.raises(sqlite3.IntegrityError, match="INV3"):
        insert(conn, base_row(
            scope="project:openmate", status="promoted", actor="user",
            review_reviewer="user", promoted_to="gene:global:rule-002", promoted_at=NOW,
        ))


def test_inv3_project_promote_project_accepted(tmp_path):
    conn = make_conn(tmp_path)
    insert(conn, base_row(
        scope="project:openmate", status="promoted", actor="user",
        review_reviewer="user", promoted_to="gene:project:openmate:rule-002", promoted_at=NOW,
    ))


# ── 不变量4：evo/soulmate必须经review通道 ──
def test_inv4_evo_direct_promote_insert_rejected(tmp_path):
    conn = make_conn(tmp_path)
    with pytest.raises(sqlite3.IntegrityError, match="INV4"):
        insert(conn, base_row(
            status="promoted", actor="evo",
            promoted_to="gene:global:rule-003", promoted_at=NOW,
        ))


def test_inv4_evo_direct_promote_update_rejected(tmp_path):
    conn = make_conn(tmp_path)
    insert(conn, base_row())  # proposed落库
    with pytest.raises(sqlite3.IntegrityError, match="INV4"):
        conn.execute(
            "UPDATE gene_proposals SET status='promoted', promoted_to='gene:global:r', "
            "promoted_at=? WHERE proposal_id='gp-test-001'", (NOW,))
        conn.commit()


def test_inv4_evo_reviewed_promote_accepted(tmp_path):
    conn = make_conn(tmp_path)
    insert(conn, base_row())
    conn.execute(
        "UPDATE gene_proposals SET review_reviewer='hermes', review_reason='证据充分', "
        "review_at=?, status='promoted', promoted_to='gene:global:rule-003', promoted_at=? "
        "WHERE proposal_id='gp-test-001'", (NOW, NOW))
    conn.commit()
    row = conn.execute("SELECT status, review_reviewer FROM gene_proposals").fetchone()
    assert row["status"] == "promoted" and row["review_reviewer"] == "hermes"


# ── 生命周期补例：proposed→approved→rejected ──
def test_lifecycle_approve_then_reject(tmp_path):
    conn = make_conn(tmp_path)
    insert(conn, base_row())
    conn.execute("UPDATE gene_proposals SET status='approved', review_reviewer='hermes', "
                 "review_at=? WHERE proposal_id='gp-test-001'", (NOW,))
    conn.commit()
    conn.execute("UPDATE gene_proposals SET status='rejected', review_reason='与现有规范重复', "
                 "review_reviewer='user', review_at=? WHERE proposal_id='gp-test-001'", (NOW,))
    conn.commit()
    assert conn.execute("SELECT status FROM gene_proposals").fetchone()[0] == "rejected"
