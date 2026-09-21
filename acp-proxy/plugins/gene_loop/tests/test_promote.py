"""S3测试 — Promote工具：Gene写入+溯源+feedback闭环+故障降级

运行: /home/climbing/opensoul/.venv/bin/pytest acp-proxy/plugins/gene_loop/tests/ -v
"""
import json
import sqlite3
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import schema  # noqa: E402
from tools import promote as promote_mod  # noqa: E402
from tools import propose as propose_mod  # noqa: E402
from tools import review_queue  # noqa: E402

FEEDBACK = [
    {"round_id": "evo_fb001", "verdict": "rolled_back",
     "reason": "evo主循环import错误",
     "issues": ["evo主循环import错误：autonomous_executor未定义"],
     "reviewed_at": "2026-09-20T05:00:00"},
]


class FakeGeneClient:
    """记录调用payload，返回成功响应（测试可注入失败）。"""

    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []

    def __call__(self, payload, gene_base):
        if self.fail:
            raise ConnectionError("gene api refused")
        self.calls.append({"payload": payload, "base": gene_base})
        return {"template_id": payload["template_id"]}


@pytest.fixture
def env(tmp_path, monkeypatch):
    fb = tmp_path / "evo_feedback.json"
    fb.write_text(json.dumps(FEEDBACK, ensure_ascii=False), encoding="utf-8")
    audit = tmp_path / "audit_log.jsonl"
    audit.write_text("", encoding="utf-8")
    qpath = tmp_path / "queue.json"
    monkeypatch.setattr(propose_mod, "FEEDBACK_PATH", fb)
    monkeypatch.setattr(propose_mod, "AUDIT_PATH", audit)
    monkeypatch.setattr(promote_mod, "FEEDBACK_PATH", fb)
    monkeypatch.setattr(review_queue, "QUEUE_PATH", qpath)
    monkeypatch.setattr(review_queue, "LOCK_PATH", tmp_path / "queue.lock")
    db = tmp_path / "test.db"
    propose_mod.propose(limit=5, db_path=db, feedback_path=fb,
                        audit_path=audit, queue_path=qpath)
    return {"db": db, "feedback": fb, "queue": qpath}


def _get_row(db, pid):
    conn = schema.connect(db)
    row = conn.execute(
        "SELECT * FROM gene_proposals WHERE proposal_id=?", (pid,)).fetchone()
    conn.close()
    return dict(row) if row else None


def test_promote_hermes_channel_full_trace(env):
    fake = FakeGeneClient()
    result = promote_mod.promote("gp-evo_fb001", reviewer="hermes",
                                 db_path=env["db"], gene_client=fake,
                                 feedback_path=env["feedback"],
                                 queue_path=env["queue"])
    assert result["ok"] is True
    assert result["promoted_to"].startswith("gene:global:devnorm-gp-evo_fb001")
    assert result["feedback_extended"] is True
    # Gene payload核验：dev_norm类别+证据随行
    assert fake.calls[0]["payload"]["category"] == "dev_norm"
    assert fake.calls[0]["payload"]["config"]["evidence"]
    # DB溯源闭合
    row = _get_row(env["db"], "gp-evo_fb001")
    assert row["status"] == "promoted"
    assert row["review_reviewer"] == "hermes"
    assert row["promoted_at"] and row["promoted_to"]


def test_feedback_extension_parser_compat(env):
    """镜像evolution_pipeline._load_recent_feedback解析逻辑：promote扩展必须可读。"""
    promote_mod.promote("gp-evo_fb001", reviewer="hermes", db_path=env["db"],
                        gene_client=FakeGeneClient(), feedback_path=env["feedback"],
                        queue_path=env["queue"])
    data = json.loads(env["feedback"].read_text(encoding="utf-8"))
    recent = data[-5:]  # planner读法
    verdicts = []
    for fb in recent:
        verdict = fb.get("verdict")
        reason = fb.get("reason")
        assert verdict and reason is not None
        verdicts.append(verdict)
    assert "promoted:constraint" in verdicts
    promoted_entry = next(e for e in data if e.get("gene_loop"))
    assert promoted_entry["proposal_id"] == "gp-evo_fb001"
    assert promoted_entry["reason"].startswith("【Gene已收录】")


def test_inv4_friendly_gate_and_trigger_defense(env):
    # 友好前置：非hermes/user直接拒
    r1 = promote_mod.promote("gp-evo_fb001", reviewer="some_agent",
                             db_path=env["db"], gene_client=FakeGeneClient(),
                             feedback_path=env["feedback"], queue_path=env["queue"])
    assert r1["ok"] is False and r1["error"] == "reviewer_must_be_hermes_or_user"
    assert _get_row(env["db"], "gp-evo_fb001")["status"] == "proposed"
    # 触发器兜底：绕过工具层直接UPDATE promoted也拦
    conn = schema.connect(env["db"])
    with pytest.raises(sqlite3.IntegrityError, match="INV4"):
        conn.execute("""UPDATE gene_proposals SET status='promoted',
                        promoted_to='gene:global:x', promoted_at=?
                        WHERE proposal_id='gp-evo_fb001'""", (int(time.time()),))
    conn.close()


def test_gene_down_db_untouched(env):
    fake = FakeGeneClient(fail=True)
    fb_before = env["feedback"].read_text(encoding="utf-8")
    r = promote_mod.promote("gp-evo_fb001", reviewer="hermes", db_path=env["db"],
                            gene_client=fake, feedback_path=env["feedback"],
                            queue_path=env["queue"])
    assert r["ok"] is False and r["error"] == "gene_api_unavailable"
    assert _get_row(env["db"], "gp-evo_fb001")["status"] == "proposed"
    assert env["feedback"].read_text(encoding="utf-8") == fb_before  # feedback未被污染


def test_project_scope_target_encoding(env):
    conn = schema.connect(env["db"])
    conn.execute(schema.migrate_sql() if hasattr(schema, "migrate_sql") else
                 "SELECT 1")  # 确保表已建（幂等）
    ev = json.dumps([{"quote": "opensoul专属约定", "source": "test"}], ensure_ascii=False)
    now = int(time.time())
    conn.execute(propose_mod._INSERT_SQL, (
        "gp-proj1", "evo_proj1", "hermes", "lesson", "项目级规范样本",
        "context", "project:opensoul", 0.6, ev, "proposed",
        None, None, None, None, None, now))
    conn.commit()
    conn.close()
    r = promote_mod.promote("gp-proj1", reviewer="hermes", db_path=env["db"],
                            gene_client=FakeGeneClient(),
                            feedback_path=env["feedback"], queue_path=env["queue"])
    assert r["ok"] is True
    assert r["promoted_to"].startswith("gene:project:opensoul:devnorm-")  # INV3目标编码


def test_promote_idempotent_no_duplicate_feedback(env):
    fake = FakeGeneClient()
    r1 = promote_mod.promote("gp-evo_fb001", reviewer="hermes", db_path=env["db"],
                             gene_client=fake, feedback_path=env["feedback"],
                             queue_path=env["queue"])
    assert r1["ok"] is True
    r2 = promote_mod.promote("gp-evo_fb001", reviewer="hermes", db_path=env["db"],
                             gene_client=fake, feedback_path=env["feedback"],
                             queue_path=env["queue"])
    assert r2["ok"] is True and r2.get("already_promoted") is True
    data = json.loads(env["feedback"].read_text(encoding="utf-8"))
    assert sum(1 for e in data if e.get("proposal_id") == "gp-evo_fb001") == 1
    assert len(fake.calls) == 1  # Gene只被调一次
