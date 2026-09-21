"""S4测试 — Review通道：自动放行/ASK升级/用户拍板/故障降级

运行: /home/climbing/opensoul/.venv/bin/pytest acp-proxy/plugins/gene_loop/tests/ -v
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import schema  # noqa: E402
from tools import promote as promote_mod  # noqa: E402
from tools import propose as propose_mod  # noqa: E402
from tools import review as review_mod  # noqa: E402
from tools import review_queue  # noqa: E402
from test_promote import FakeGeneClient  # noqa: E402

# fb001因3次同因复发→conf=0.7（触发constraint自动线）；fb002单发→conf=0.5（escalate）
FEEDBACK = [
    {"round_id": "evo_fb001", "verdict": "rolled_back",
     "reason": "evo主循环import错误",
     "issues": ["autonomous_executor未定义"], "reviewed_at": "t1"},
    {"round_id": "evo_fb004", "verdict": "rolled_back",
     "reason": "evo主循环import错误",
     "issues": ["skills模块路径错误"], "reviewed_at": "t2"},
    {"round_id": "evo_fb005", "verdict": "rejected",
     "reason": "evo主循环import错误",
     "issues": ["routes包缺失"], "reviewed_at": "t3"},
    {"round_id": "evo_fb002", "verdict": "rejected",
     "reason": "方案视角单一",
     "issues": ["仅pytest视角，缺curl证据"], "reviewed_at": "t4"},
]


@pytest.fixture
def env(tmp_path, monkeypatch):
    fb = tmp_path / "evo_feedback.json"
    fb.write_text(json.dumps(FEEDBACK, ensure_ascii=False), encoding="utf-8")
    audit = tmp_path / "audit_log.jsonl"
    audit.write_text("", encoding="utf-8")
    qpath = tmp_path / "queue.json"
    escpath = tmp_path / "escalations.json"
    monkeypatch.setattr(propose_mod, "FEEDBACK_PATH", fb)
    monkeypatch.setattr(propose_mod, "AUDIT_PATH", audit)
    monkeypatch.setattr(promote_mod, "FEEDBACK_PATH", fb)
    monkeypatch.setattr(review_mod, "ESCALATION_PATH", escpath)
    monkeypatch.setattr(review_queue, "QUEUE_PATH", qpath)
    monkeypatch.setattr(review_queue, "LOCK_PATH", tmp_path / "queue.lock")
    db = tmp_path / "test.db"
    propose_mod.propose(limit=5, db_path=db, feedback_path=fb,
                        audit_path=audit, queue_path=qpath)
    return {"db": db, "feedback": fb, "queue": qpath, "esc": escpath}


def _run(env, fake, **kw):
    return review_mod.process_queue(
        reviewer="hermes", db_path=env["db"], gene_client=fake,
        feedback_path=env["feedback"], queue_path=env["queue"],
        escalation_path=env["esc"], **kw)


def _row(db, pid):
    conn = schema.connect(db)
    row = conn.execute("SELECT * FROM gene_proposals WHERE proposal_id=?",
                       (pid,)).fetchone()
    conn.close()
    return dict(row) if row else None


def test_auto_promote_constraint_at_threshold(env):
    fake = FakeGeneClient()
    result = _run(env, fake)
    pids = {p["proposal_id"] for p in result["promoted"]}
    assert "gp-evo_fb001" in pids                      # conf=0.7+constraint→自动放行
    row = _row(env["db"], "gp-evo_fb001")
    assert row["status"] == "promoted"
    assert row["review_reviewer"] == "hermes"
    assert row["promoted_to"].startswith("gene:global:")
    # 闭环：feedback扩展可读
    data = json.loads(env["feedback"].read_text(encoding="utf-8"))
    assert any(e.get("proposal_id") == "gp-evo_fb001" and e.get("gene_loop")
               for e in data)


def test_context_low_confidence_escalates(env):
    fake = FakeGeneClient()
    result = _run(env, fake)
    esc_ids = {p["proposal_id"]: p["why"] for p in result["escalated"]}
    assert "gp-evo_fb002" in esc_ids                    # conf=0.5<context线0.8
    assert esc_ids["gp-evo_fb002"].startswith("low_confidence:")
    assert _row(env["db"], "gp-evo_fb002")["status"] == "proposed"  # DB不动
    esc_file = json.loads(env["esc"].read_text(encoding="utf-8"))
    assert any(e["proposal_id"] == "gp-evo_fb002" and e["resolved"] is False
               for e in esc_file)


def test_deprecate_always_asks_user(env):
    """deprecate_rule永远escalate给用户，自动通道不碰。"""
    conn = schema.connect(env["db"])
    import time as _t
    ev = json.dumps([{"quote": "旧规范冲突证据", "source": "test"}], ensure_ascii=False)
    conn.execute(propose_mod._INSERT_SQL, (
        "gp-dep1", "evo_dep1", "evo", "deprecate_rule",
        "废弃旧编码规范第X条", "constraint", "global", 0.95, ev,
        "proposed", None, None, None, None, None, int(_t.time())))
    conn.commit()
    conn.close()
    review_queue.enqueue([{
        "proposal_id": "gp-dep1", "actor": "evo", "type": "deprecate_rule",
        "governance": "constraint", "scope": "global", "confidence": 0.95,
        "content": "废弃旧编码规范第X条", "evidence": ev,
        "source_cycle": "evo_dep1", "enqueued_at": 0, "reviewed": None,
    }], path=env["queue"])
    fake = FakeGeneClient()
    result = _run(env, fake)
    esc_ids = {p["proposal_id"]: p["why"] for p in result["escalated"]}
    assert esc_ids.get("gp-dep1", "").startswith("ASK:")
    assert _row(env["db"], "gp-dep1")["status"] == "proposed"
    assert all(p["proposal_id"] != "gp-dep1" for p in result["promoted"])
    assert not any(c["payload"]["template_id"] == "devnorm-gp-dep1"
                   for c in fake.calls)                 # Gene未被调用


def test_user_approve_overrides_escalation(env):
    """用户拍板路径：低置信escalated提案，reviewer=user可直接promote。"""
    fake = FakeGeneClient()
    _run(env, fake)                                     # gp-evo_fb002已escalate
    r = promote_mod.promote("gp-evo_fb002", reviewer="user",
                            reason="用户拍板：实测有效", db_path=env["db"],
                            gene_client=fake, feedback_path=env["feedback"],
                            queue_path=env["queue"])
    assert r["ok"] is True
    row = _row(env["db"], "gp-evo_fb002")
    assert row["status"] == "promoted" and row["review_reviewer"] == "user"


def test_gene_down_escalates_not_fakes(env):
    fake = FakeGeneClient(fail=True)
    fb_before = env["feedback"].read_text(encoding="utf-8")
    result = _run(env, fake)
    esc_ids = {p["proposal_id"]: p["why"] for p in result["escalated"]}
    assert esc_ids.get("gp-evo_fb001", "").startswith("promote_failed:")
    assert _row(env["db"], "gp-evo_fb001")["status"] == "proposed"  # 不假报
    assert env["feedback"].read_text(encoding="utf-8") == fb_before
    # 队列条目被标记escalated（不重复处理）
    queue = review_queue.load_queue(env["queue"])
    entry = next(e for e in queue if e["proposal_id"] == "gp-evo_fb001")
    assert entry["reviewed"]["verdict"] == "escalated"
