"""_process_tool_output兜底降级路径 — 上轮遗留#3销账的回归守护

旧降级（except→truncate_tool_result静默切尾）三宗罪：
1. 中段数据永久丢失（不留盘、不可读回）——违反kilocode spill"全文落盘可读回"
2. head/tail无方向标注、removed不报告——违反kilocode #3方向感知（"...347 lines truncated..."）
3. 账本无fallback记录——AIHawk SHOWN/SENT双预算在降级路径失真

新语义（agent.tool_output_handler.degraded_spill）：
全文落盘 + 方向标注 + removed字节报告（双单位择一）+ 能力分级读回指引 + fallback记账；
落盘失败显式声明"[数据未保存]"绝不假装有救（mem0 §1.1失败必须可见）。
"""
import inspect
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.tool_output_handler import DEGRADED_MAX_CHARS, ToolOutputHandler, degraded_spill

# 323字符 > 测试用max_chars=100，且中段哨兵字符串可断言"确实在被丢弃的中段"
SENTINEL = "MIDDLE-MARK-SENTINEL"
BIG = "H" * 150 + "\n" + SENTINEL + "\n" + "T" * 150
# 真实量级大文本（>默认预算DEGRADED_MAX_CHARS=6000）：stub开销只有在真实大输出下
# 才小于原文——双预算/行为级断言必须用这个（小文本截断后stub反而更长是正常算术）
HUGE = "H" * 4000 + "\n" + SENTINEL + "\n" + "T" * 4000


# ══════════════ degraded_spill本体语义 ══════════════

def test_degraded_spill_full_text_on_disk_and_marked_stub(tmp_path):
    """截断必须显式标记+全文落盘可读回（两条铁律在降级路径同时成立）。"""
    out = degraded_spill(BIG, tool_name="terminal", tool_call_id="tc1",
                         spill_dir=str(tmp_path), max_chars=100)
    # 全文落盘零丢失（哨兵在盘上）
    files = list(tmp_path.glob("degraded_terminal_*.txt"))
    assert len(files) == 1
    assert files[0].read_text(encoding="utf-8") == BIG
    assert SENTINEL in files[0].read_text(encoding="utf-8")
    # stub显式标记
    assert out.startswith("[TRUNCATED — 溢出处理失败，已降级截断]")
    # 方向标注（kilocode #3）
    assert "=== 预览（开头/head" in out
    assert "=== 预览（结尾/tail" in out
    # removed显式报告：字符预算触发→按字节报告（双单位择一）
    assert "字节已截断" in out and "行已截断" not in out
    # 中段哨兵不进stub（它就是被removed的部分）
    assert SENTINEL not in out
    # 落盘成功→读回指引在场
    assert "read_file_segment" in out
    assert str(files[0]) in out
    assert "[END PREVIEW" in out


def test_degraded_spill_under_budget_passthrough(tmp_path):
    """低于预算→不截断不打标记（标记只属于真实截断），但fallback事件照记。"""
    out = degraded_spill("small result", tool_name="terminal",
                         spill_dir=str(tmp_path), max_chars=100)
    assert out == "small result"
    assert "[TRUNCATED" not in out
    rec = json.loads((tmp_path / "spill_ledger.jsonl").read_text().splitlines()[-1])
    assert rec["fallback"] == 1 and rec["spilled"] == 0
    assert rec["sent_chars"] == len("small result") == rec["shown_chars"]


def test_degraded_spill_write_failure_is_explicit(tmp_path):
    """落盘失败→显式"[数据未保存]"，绝不假装有救（mem0 §1.1失败必须可见）。"""
    blocker = tmp_path / "blocker"
    blocker.write_text("i am a file, not a dir")  # mkdir必失败
    out = degraded_spill(BIG, tool_name="terminal", spill_dir=str(blocker), max_chars=100)
    assert "[数据未保存 — 降级spill落盘失败，全文不可恢复" in out
    assert "[END — 全文未保存]" in out
    assert "read_file_segment" not in out  # 无盘上文件→不给假读回指引
    assert out.startswith("[TRUNCATED")  # 标记仍在（截断真实发生）


def test_degraded_spill_ledger_sent_vs_shown(tmp_path):
    """AIHawk双预算：sent=全文、shown=stub，fallback事件带reason不失真（真实大输出量级）。"""
    out = degraded_spill(HUGE, tool_name="terminal", tool_call_id="tc2",
                         reason="handler exploded", spill_dir=str(tmp_path))
    rec = json.loads((tmp_path / "spill_ledger.jsonl").read_text().splitlines()[-1])
    assert rec["fallback"] == 1 and rec["spilled"] == 1
    assert rec["sent_chars"] == len(HUGE)          # SENT=真实全量
    assert rec["shown_chars"] == len(out)          # SHOWN=进context的stub
    assert rec["shown_chars"] < rec["sent_chars"]
    assert rec["tool_name"] == "terminal" and rec["tool_call_id"] == "tc2"
    assert rec["reason"] == "handler exploded"


def test_degraded_spill_reason_visible_in_stub(tmp_path):
    """降级原因必须进入stub（可观测：模型/审计能看到为什么降级）。"""
    out = degraded_spill(BIG, tool_name="search_files", reason="ZeroDivisionError: boom",
                         spill_dir=str(tmp_path), max_chars=100)
    assert "ZeroDivisionError: boom" in out
    assert "search_files 返回了" in out


def test_degraded_spill_capability_tiering(tmp_path):
    """降级不降智：读回指引复用kilocode #1能力分级（_readback_hint classmethod）。"""
    out_task = degraded_spill(BIG, tool_name="terminal", tool_names={"task", "read_file"},
                              spill_dir=str(tmp_path), max_chars=100)
    assert "派子agent" in out_task
    out_search = degraded_spill(BIG, tool_name="terminal", tool_names={"search_files"},
                                spill_dir=str(tmp_path), max_chars=100)
    assert "先用 search_files 定位" in out_search
    out_default = degraded_spill(BIG, tool_name="terminal", tool_names=None,
                                 spill_dir=str(tmp_path), max_chars=100)
    assert "read_file_segment" in out_default and "派子agent" not in out_default


def test_degraded_spill_never_raises():
    """兜底路径绝不抛出（连spill_dir都不可用时仍返回可入context的文本）。"""
    out = degraded_spill(BIG, tool_name="terminal", spill_dir="/proc/definitely/not/writable",
                         max_chars=100)
    assert isinstance(out, str) and out.startswith("[TRUNCATED")


# ══════════════ soulmate_agent真实接线 ══════════════

def test_soulmate_fallback_calls_degraded_spill():
    src = (Path(__file__).parent.parent / "agent/soulmate_agent.py").read_text(encoding="utf-8")
    assert "from agent.tool_output_handler import ToolOutputHandler, degraded_spill" in src
    assert "return degraded_spill(" in src
    # 最内层双保险降级也必须显式标记（禁静默）
    assert "[降级截断 — 溢出处理与降级spill均失败，数据未保存]" in src
    # inspect断言：degraded_spill在_process_tool_output方法体内被调用
    from agent.soulmate_agent import SoulMateAgent
    body = inspect.getsource(SoulMateAgent._process_tool_output)
    assert "degraded_spill(" in body


def test_soulmate_process_tool_output_fallback_behavior(tmp_path, monkeypatch):
    """行为级：真实_process_tool_output + handler.process抛异常→degraded_spill真实产出。"""
    monkeypatch.setenv("TOOL_SPILL_DIR", str(tmp_path))
    from agent.soulmate_agent import SoulMateAgent

    agent = SoulMateAgent.__new__(SoulMateAgent)

    class BoomHandler:
        def process(self, *a, **k):
            raise RuntimeError("simulated overflow-layer failure")

    agent._output_handler = BoomHandler()
    out = agent._process_tool_output("terminal", "tc-live", HUGE)
    assert out.startswith("[TRUNCATED — 溢出处理失败，已降级截断]")
    files = list(tmp_path.glob("degraded_terminal_*.txt"))
    assert len(files) == 1 and files[0].read_text(encoding="utf-8") == HUGE
    rec = json.loads((tmp_path / "spill_ledger.jsonl").read_text().splitlines()[-1])
    assert rec["fallback"] == 1 and rec["sent_chars"] == len(HUGE)


def test_readback_hint_usable_as_classmethod():
    """_readback_hint改classmethod后健康/降级两路径共用（既有的实例调用语义不破坏）。"""
    hint = ToolOutputHandler._readback_hint("/tmp/x.txt", None)
    assert any("read_file_segment" in h for h in hint)
    h = ToolOutputHandler.__dict__["_readback_hint"]
    assert isinstance(h, classmethod)
