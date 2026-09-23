"""token归因账本retention接线 — 上轮遗留#4销账的回归守护

kilocode #2保留策略（7天ts轮转+每小时清扫）此前只覆盖tool_spills（溢出文件+spill_ledger）
与permission_provenance两处；attribution_ledger.jsonl（soulmate工具循环每轮record真实写入、
app.py跨进程读）无限增长无轮转。本轮接进AttributionLedger.record/backfill_actual写路径。
"""
import inspect
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent import retention
from agent.token_attribution import AttributionLedger

OLD_TS = 1700000000.0  # 远早于任何7天窗口


def _seed(ledger, lines):
    ledger.ledger_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_record_triggers_retention_sweep(tmp_path):
    """record写路径顺带清扫：可证明超龄的删、坏行/无ts的保守保留、新记录保留。"""
    ledger = AttributionLedger(ledger_dir=str(tmp_path), cleanup_interval=0.0)
    _seed(ledger, [
        json.dumps({"ts": OLD_TS, "session_id": "old", "usage": {"total_tokens": 1}}),
        "NOT-JSON-BAD-LINE",
        json.dumps({"ts": time.time(), "session_id": "fresh", "usage": {"total_tokens": 2}}),
    ])
    rec = ledger.record({"total_tokens": 3}, session_id="new")
    kept = ledger.ledger_path.read_text(encoding="utf-8").splitlines()
    texts = "\n".join(kept)
    assert '"old"' not in texts          # 可证明超龄→轮转删除
    assert "NOT-JSON-BAD-LINE" in texts  # 坏行保守保留（无法证明超龄就不删）
    assert '"fresh"' in texts and '"new"' in texts
    assert rec["session_id"] == "new"    # 记录本身不受清扫影响


def test_backfill_triggers_retention_sweep(tmp_path):
    """backfill_actual回填写路径与record对称触发清扫。"""
    ledger = AttributionLedger(ledger_dir=str(tmp_path), cleanup_interval=0.0)
    _seed(ledger, [
        json.dumps({"ts": OLD_TS, "session_id": "old", "usage": {"total_tokens": 1}}),
        json.dumps({"ts": time.time(), "session_id": "s1",
                    "usage": {"total_tokens": 100}}),
    ])
    row = ledger.backfill_actual("s1", 150)
    assert row is not None and row["backfill"] is True
    texts = ledger.ledger_path.read_text(encoding="utf-8")
    assert '"old"' not in texts          # 超龄记录被轮转
    assert "backfill" in texts           # 回填行在场


def test_cleanup_is_throttled(tmp_path, monkeypatch):
    """每小时最多清扫一次（retention.maybe_sweep节流）：同窗口内两次record只扫一次。"""
    calls = []

    def spy(path, **kw):
        calls.append(str(path))
        return {"removed_records": 0}

    monkeypatch.setattr(retention, "compact_jsonl", spy)
    ledger = AttributionLedger(ledger_dir=str(tmp_path), cleanup_interval=3600.0)
    ledger.record({"total_tokens": 1})
    ledger.record({"total_tokens": 2})
    assert len(calls) == 1, f"清扫应被节流为1次，实际{len(calls)}次"


def test_cleanup_failure_does_not_break_record(tmp_path, monkeypatch):
    """清扫失败绝不反噬归因记录路径（观测层/清理层不阻塞执行层）。"""
    def boom(path, **kw):
        raise RuntimeError("disk on fire")

    monkeypatch.setattr(retention, "compact_jsonl", boom)
    ledger = AttributionLedger(ledger_dir=str(tmp_path), cleanup_interval=0.0)
    rec = ledger.record({"total_tokens": 5}, session_id="survivor")
    assert rec["session_id"] == "survivor"
    assert ledger.ledger_path.exists()
    assert "survivor" in ledger.ledger_path.read_text(encoding="utf-8")


def test_record_without_ts_is_kept(tmp_path):
    """无ts记录一律保留（保守retention：无法证明超龄就不删）。"""
    ledger = AttributionLedger(ledger_dir=str(tmp_path), cleanup_interval=0.0)
    _seed(ledger, [json.dumps({"session_id": "no-ts", "usage": {}})])
    ledger.record({"total_tokens": 1})
    assert '"no-ts"' in ledger.ledger_path.read_text(encoding="utf-8")


def test_wiring_sources():
    """接线断言：maybe_cleanup在record/backfill写路径被调用，且soulmate真实工具循环写账本。"""
    assert "self.maybe_cleanup()" in inspect.getsource(AttributionLedger.record)
    assert "self.maybe_cleanup()" in inspect.getsource(AttributionLedger.backfill_actual)
    src_sm = (Path(__file__).parent.parent / "agent/soulmate_agent.py").read_text(encoding="utf-8")
    assert "self._token_attr_ledger.record(" in src_sm          # 真实LLM工具循环写路径
    assert "self._token_attr_ledger.backfill_actual(" in src_sm  # provider usage回填写路径
