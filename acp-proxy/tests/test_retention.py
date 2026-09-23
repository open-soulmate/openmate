"""Retention统一清扫 + Truncate方向感知/能力分级提示 测试

调研来源：kilocode-source-supplement3.md
- #2 Truncate保留策略（7天retention+每小时cleanup扫mtime——编码ID回绕所以不看ID看mtime）
- #3 Truncate方向感知（head/tail截断+removed行数/字节数显式报告，双单位择一）
- #1尾款 按agent能力分级提示（有task工具→派explore agent；有search→先定位；否则分段读）
- 上轮遗留：provenance账本retention轮转（kilocode #2同款7天mtime）
"""
import inspect
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent import retention
from agent.tool_output_handler import ToolOutputHandler
from agent.permission_provenance import PermissionProvenanceRecorder

DAY = 86400.0


def make_handler(tmp_path, **kwargs) -> ToolOutputHandler:
    kwargs.setdefault("spill_dir", str(tmp_path / "spills"))
    kwargs.setdefault("char_threshold", 1000)
    kwargs.setdefault("line_threshold", 50)
    kwargs.setdefault("preview_chars", 200)
    return ToolOutputHandler(**kwargs)


# ══════════════ epoch_from_ts ══════════════

def test_epoch_from_ts_float_epoch():
    assert retention.epoch_from_ts(1700000000.5) == 1700000000.5
    assert retention.epoch_from_ts(1700000000) == 1700000000.0


def test_epoch_from_ts_numeric_string():
    assert retention.epoch_from_ts("1700000000.0") == 1700000000.0


def test_epoch_from_ts_iso_with_tz():
    # permission_provenance形态：strftime %Y-%m-%dT%H:%M:%S%z
    ts = retention.epoch_from_ts("2026-09-23T12:30:00+0800")
    assert ts is not None
    # 与等价UTC写法相差8小时以内（解析成功且量级正确）
    utc_ts = retention.epoch_from_ts("2026-09-23T04:30:00+0000")
    assert utc_ts is not None
    assert abs(ts - utc_ts) < 1


def test_epoch_from_ts_iso_naive():
    assert retention.epoch_from_ts("2026-09-23T12:30:00") is not None
    assert retention.epoch_from_ts("2026-09-23 12:30:00") is not None


def test_epoch_from_ts_unparseable_kept_as_none():
    # 解析不了→None（调用方必须保留该记录，保守retention）
    assert retention.epoch_from_ts(None) is None
    assert retention.epoch_from_ts("") is None
    assert retention.epoch_from_ts("  ") is None
    assert retention.epoch_from_ts("not-a-time") is None
    assert retention.epoch_from_ts(True) is None
    assert retention.epoch_from_ts([1]) is None


# ══════════════ sweep_mtime（kilocode #2：按mtime不按ID）══════════════

def test_sweep_mtime_removes_old_keeps_new(tmp_path):
    d = tmp_path / "spills"
    d.mkdir()
    old = d / "toolA_999999_abc.txt"
    new = d / "toolB_111111_def.txt"
    old.write_text("old content")
    new.write_text("new content")
    old_mtime = time.time() - 10 * DAY
    os.utime(old, (old_mtime, old_mtime))
    r = retention.sweep_mtime(d, max_age_days=7.0, patterns=("*.txt",))
    assert r["removed_files"] == 1
    assert r["kept"] == 1
    assert not old.exists()
    assert new.exists()
    assert r["removed_bytes"] == len("old content")


def test_sweep_mtime_mtimes_not_ids(tmp_path):
    """kilocode注释坑教材：文件名里的ID会回绕——ID大但mtime老的必须删，ID小但新的必须留。"""
    d = tmp_path / "spills"
    d.mkdir()
    wrapped_id_old = d / "tool_999999999999_zzz.txt"  # ID回绕到很大，但mtime老
    small_id_new = d / "tool_000000000001_aaa.txt"    # ID很小，但mtime新
    wrapped_id_old.write_text("x")
    small_id_new.write_text("y")
    t_old = time.time() - 30 * DAY
    os.utime(wrapped_id_old, (t_old, t_old))
    r = retention.sweep_mtime(d, max_age_days=7.0, patterns=("*.txt",))
    assert not wrapped_id_old.exists()   # 只看mtime：老的删
    assert small_id_new.exists()         # 只看mtime：新的留
    assert r["removed_files"] == 1


def test_sweep_mtime_only_matching_patterns(tmp_path):
    d = tmp_path / "spills"
    d.mkdir()
    spill = d / "x.txt"
    ledger = d / "spill_ledger.jsonl"
    spill.write_text("s")
    ledger.write_text("{}\n")
    t_old = time.time() - 30 * DAY
    os.utime(spill, (t_old, t_old))
    os.utime(ledger, (t_old, t_old))
    r = retention.sweep_mtime(d, max_age_days=7.0, patterns=("*.txt",))
    assert not spill.exists()
    assert ledger.exists()  # 账本不归sweep_mtime管（compact_jsonl按ts轮转）
    assert r["removed_files"] == 1


def test_sweep_mtime_dry_run_and_missing_dir(tmp_path):
    d = tmp_path / "spills"
    d.mkdir()
    old = d / "o.txt"
    old.write_text("x")
    t_old = time.time() - 30 * DAY
    os.utime(old, (t_old, t_old))
    r = retention.sweep_mtime(d, max_age_days=7.0, patterns=("*.txt",), dry_run=True)
    assert r["removed_files"] == 1 and r["dry_run"]
    assert old.exists()  # dry_run不删
    # 不存在的目录→零结果不抛
    r2 = retention.sweep_mtime(tmp_path / "nope", max_age_days=7.0, patterns=("*.txt",))
    assert r2["removed_files"] == 0 and r2["errors"] == 0


# ══════════════ compact_jsonl（保守retention：只删可证超龄）══════════════

def test_compact_jsonl_removes_old_float_ts(tmp_path):
    p = tmp_path / "ledger.jsonl"
    now = time.time()
    records = [
        {"ts": now - 30 * DAY, "tool_name": "old"},
        {"ts": now - 1 * DAY, "tool_name": "new"},
    ]
    p.write_text("\n".join(json.dumps(r) for r in records) + "\n")
    r = retention.compact_jsonl(p, max_age_days=7.0)
    assert r["removed_records"] == 1
    assert r["kept"] == 1
    assert r["compacted"] is True
    left = [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
    assert [x["tool_name"] for x in left] == ["new"]


def test_compact_jsonl_removes_old_iso_ts(tmp_path):
    p = tmp_path / "prov.jsonl"
    records = [
        {"ts": "2020-01-01T00:00:00+0000", "tool": "old"},
        {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "tool": "new"},
    ]
    p.write_text("\n".join(json.dumps(r) for r in records) + "\n")
    r = retention.compact_jsonl(p, max_age_days=7.0)
    assert r["removed_records"] == 1
    left = [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
    assert [x["tool"] for x in left] == ["new"]


def test_compact_jsonl_keeps_undatable_and_corrupt(tmp_path):
    """保守retention（mem0 §1.1不静默丢数据）：坏行/无ts/无法解析ts一律保留。"""
    p = tmp_path / "ledger.jsonl"
    now = time.time()
    lines = [
        json.dumps({"ts": now - 30 * DAY, "k": "old"}),
        "{corrupt json",                                   # 坏行→保留
        json.dumps({"k": "no-ts"}),                        # 无ts→保留
        json.dumps({"ts": "garbage", "k": "bad-ts"}),      # ts无法解析→保留
        json.dumps({"ts": now, "k": "new"}),
    ]
    p.write_text("\n".join(lines) + "\n")
    r = retention.compact_jsonl(p, max_age_days=7.0)
    assert r["removed_records"] == 1
    content = p.read_text()
    assert "{corrupt json" in content
    assert "no-ts" in content
    assert "bad-ts" in content
    assert "new" in content
    assert "old" not in content


def test_compact_jsonl_missing_file_and_dry_run(tmp_path):
    r = retention.compact_jsonl(tmp_path / "nope.jsonl", max_age_days=7.0)
    assert r["removed_records"] == 0 and r["errors"] == 0
    # dry_run：统计但不改文件
    p = tmp_path / "l.jsonl"
    p.write_text(json.dumps({"ts": time.time() - 30 * DAY}) + "\n")
    r2 = retention.compact_jsonl(p, max_age_days=7.0, dry_run=True)
    assert r2["removed_records"] == 1 and not r2["compacted"]
    assert p.exists()
    # 原子替换不留tmp
    p2 = tmp_path / "l2.jsonl"
    p2.write_text(json.dumps({"ts": time.time() - 30 * DAY}) + "\n")
    retention.compact_jsonl(p2, max_age_days=7.0)
    assert not list(tmp_path.glob("*.tmp"))


# ══════════════ maybe_sweep（每小时cleanup节流）══════════════

def test_maybe_sweep_throttles_within_interval():
    calls = []
    key = f"test-throttle-{time.time()}"
    now = time.time()
    assert retention.maybe_sweep(key, lambda: calls.append(1) or {"n": 1},
                                 interval_s=3600.0, now=now) == {"n": 1}
    # interval内→None（不执行）
    assert retention.maybe_sweep(key, lambda: calls.append(1) or {"n": 1},
                                 interval_s=3600.0, now=now + 100) is None
    assert len(calls) == 1
    # 超过interval→再执行（kilocode"每小时cleanup"）
    assert retention.maybe_sweep(key, lambda: calls.append(1) or {"n": 2},
                                 interval_s=3600.0, now=now + 4000) == {"n": 2}
    assert len(calls) == 2


def test_maybe_sweep_swallows_fn_errors():
    key = f"test-err-{time.time()}"
    def boom():
        raise RuntimeError("sweep exploded")
    # 清扫失败绝不反噬主流程
    assert retention.maybe_sweep(key, boom, interval_s=0, now=time.time()) is None


# ══════════════ ToolOutputHandler：#2保留策略接线 ══════════════

def test_handler_maybe_cleanup_sweeps_spills_and_ledger(tmp_path):
    h = make_handler(tmp_path)
    spill_dir = Path(h.spill_dir)
    old_spill = spill_dir / "tool_1_old.txt"
    new_spill = spill_dir / "tool_2_new.txt"
    old_spill.write_text("old spill")
    new_spill.write_text("new spill")
    t_old = time.time() - 30 * DAY
    os.utime(old_spill, (t_old, t_old))
    # 账本：1条超龄+1条新
    h.ledger_path.write_text(
        json.dumps({"ts": t_old, "tool_name": "old"}) + "\n"
        + json.dumps({"ts": time.time(), "tool_name": "new"}) + "\n")
    r = h.maybe_cleanup()
    assert r is not None and "spills" in r and "ledger" in r
    assert not old_spill.exists() and new_spill.exists()
    assert r["spills"]["removed_files"] == 1
    assert r["ledger"]["removed_records"] == 1
    left = [json.loads(x) for x in h.ledger_path.read_text().splitlines() if x.strip()]
    assert [x["tool_name"] for x in left] == ["new"]


def test_handler_process_triggers_cleanup(tmp_path):
    """process()写路径顺带触发清扫（每小时最多一次）——不是死方法。"""
    h = make_handler(tmp_path)
    old_spill = Path(h.spill_dir) / "tool_9_old.txt"
    old_spill.write_text("x")
    t_old = time.time() - 30 * DAY
    os.utime(old_spill, (t_old, t_old))
    h.process("terminal", "tc_cleanup", "small output")
    assert not old_spill.exists()  # 第一次process即触发清扫
    # 第二次process：interval内节流（不重复扫，但功能无碍）
    h.process("terminal", "tc_cleanup2", "small output 2")


def test_handler_stats_expose_retention(tmp_path):
    h = make_handler(tmp_path, retention_days=3.0, cleanup_interval=600.0)
    stats = h.get_stats()
    assert stats["retention_days"] == 3.0
    assert stats["cleanup_interval_s"] == 600.0


# ══════════════ #3方向感知：removed显式报告（双单位择一）══════════════

def test_direction_lines_trigger_reports_lines(tmp_path):
    h = make_handler(tmp_path, char_threshold=100000, line_threshold=20, preview_chars=40)
    text = "\n".join(f"line {i}" for i in range(200))
    r = h.process("read_file", "tc_lines", text)
    assert r.spilled
    assert "行已截断" in r.processed_text          # 双单位择一：行触发→按行报告
    assert "字节已截断" not in r.processed_text
    assert r.removed_lines > 0
    assert "开头/head" in r.processed_text         # 方向显式标注
    assert "结尾/tail" in r.processed_text
    # removed显式值与SpillResult一致
    assert f"[{r.removed_lines} 行已截断]" in r.processed_text


def test_direction_bytes_trigger_reports_bytes(tmp_path):
    h = make_handler(tmp_path, char_threshold=100, line_threshold=100000, preview_chars=40)
    text = "X" * 500
    r = h.process("terminal", "tc_bytes", text)
    assert r.spilled
    assert "字节已截断" in r.processed_text        # 双单位择一：字节触发→按字节报告
    assert "行已截断" not in r.processed_text
    assert r.removed_bytes > 0
    assert f"[{r.removed_bytes} 字节已截断]" in r.processed_text


def test_direction_removed_marker_static():
    m = ToolOutputHandler._removed_marker
    assert m(347, 999, "lines") == "... [347 行已截断] ..."   # kilocode"...347 lines truncated..."语义
    assert m(347, 51234, "bytes") == "... [51234 字节已截断] ..."


def test_direction_degraded_path_reports_removed(tmp_path, monkeypatch):
    """落盘失败降级路径同样显式报告removed（不静默）。"""
    h = make_handler(tmp_path, char_threshold=100, preview_chars=40)
    monkeypatch.setattr(h, "_spill_to_file", lambda tool_name, text: ("", ""))
    r = h.process("terminal", "tc_degraded", "Y" * 500)
    assert r.spilled
    assert "数据未保存" in r.processed_text
    assert "字节已截断" in r.processed_text
    assert r.removed_bytes > 0


# ══════════════ #1能力分级提示 ══════════════

def test_hint_delegate_tier(tmp_path):
    h = make_handler(tmp_path, char_threshold=100, preview_chars=40)
    r = h.process("read_file", "tc_del", "Z" * 500, tool_names={"task", "read_file"})
    assert "派子agent" in r.processed_text      # 有task工具→派explore agent处理，别自己读
    assert "read_file_segment" in r.processed_text


def test_hint_search_tier(tmp_path):
    h = make_handler(tmp_path, char_threshold=100, preview_chars=40)
    r = h.process("terminal", "tc_search", "Z" * 500, tool_names={"search_files", "terminal"})
    assert "search_files 定位关键片段" in r.processed_text  # 有search→先定位再分段
    assert "read_file_segment" in r.processed_text
    assert "派子agent" not in r.processed_text


def test_hint_default_tier_unchanged(tmp_path):
    """默认档=既有文案（向后兼容：read_file_segment+start_line指引必须保留）。"""
    h = make_handler(tmp_path, char_threshold=100, preview_chars=40)
    r = h.process("test", "tc_default", "Z" * 500)
    assert "如需查看完整内容" in r.processed_text
    assert "read_file_segment" in r.processed_text
    assert "start_line" in r.processed_text
    assert "派子agent" not in r.processed_text


# ══════════════ PermissionProvenanceRecorder：账本轮转接线 ══════════════

def test_provenance_record_triggers_compaction(tmp_path):
    p = tmp_path / "prov.jsonl"
    t_old = time.time() - 30 * DAY
    p.write_text(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(t_old)),
                             "tool": "old"}) + "\n")
    rec = PermissionProvenanceRecorder(ledger_path=str(p))
    assert rec.record({"tool": "new", "decision": "allow", "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    left = [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
    assert [x["tool"] for x in left] == ["new"]  # 超龄行被轮转掉，新行保留


def test_provenance_maybe_cleanup_method_exists():
    rec = PermissionProvenanceRecorder(ledger_path="/tmp/nonexistent_prov_test.jsonl")
    assert callable(getattr(rec, "maybe_cleanup", None))
    assert rec.retention_days == 7.0


# ══════════════ 接线断言（防死代码：写了≠接线了）══════════════

def _src(rel):
    return (Path(__file__).parent.parent / rel).read_text(encoding="utf-8")


def test_wiring_soulmate_passes_tool_names():
    text = _src("agent/soulmate_agent.py")
    assert 'tool_names=getattr(self, "_active_tool_names", None)' in text  # 消费点
    assert "self._active_tool_names = {t.get(\"function\", {}).get(\"name\", \"\")" in text  # 记录点


def test_wiring_handler_cleanup_on_write_path():
    src = inspect.getsource(ToolOutputHandler.process)
    assert "self.maybe_cleanup()" in src  # process写路径触发清扫


def test_wiring_provenance_cleanup_on_write_path():
    src = inspect.getsource(PermissionProvenanceRecorder.record)
    assert "self.maybe_cleanup()" in src  # record写路径触发轮转


def test_wiring_retention_no_id_based_dedupe():
    """kilocode注释坑守护：sweep必须按mtime，禁止按文件名ID判新旧。"""
    src = inspect.getsource(retention.sweep_mtime)
    assert "st_mtime" in src
