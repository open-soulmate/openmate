"""P0-2接线测试 — ToolOutputHandler接进SoulMateAgent真实工具路径 + AIHawk双预算账本

解决"写了≠接线了"：tool_output_handler.py此前只接在engine.py（无运行时消费方的AgentEngine），
真实ACP路径(:8092→agent.start→SoulMateAgent._run_llm_with_tools)一直用naive truncate_tool_result，
且stub教的read_file_segment工具在真实路径根本不存在（模型无法读回落盘数据）。

验证三层：
1. handler账本/统计（AIHawk SHOWN/SENT双预算，跨实例可读=跨进程可读）
2. read_segment安全（防路径穿越）+分段读回提示
3. SoulMateAgent真实路径端到端：超阈值工具结果→stub入context+落盘；read_file_segment读回闭环
"""
import asyncio
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.tool_output_handler import ToolOutputHandler
from agent.soulmate_agent import SoulMateAgent
from tests.test_steering import FakeLLM, make_agent, run


def make_handler(**kwargs) -> ToolOutputHandler:
    tmpdir = tempfile.mkdtemp(prefix="wiring_spill_")
    kwargs.setdefault("spill_dir", tmpdir)
    kwargs.setdefault("char_threshold", 1000)
    kwargs.setdefault("line_threshold", 50)
    kwargs.setdefault("preview_chars", 200)
    return ToolOutputHandler(**kwargs)


class FakeGateAllow:
    def __init__(self):
        self.calls = []

    async def check(self, session_id, tool_name, tool_args, **kw):
        self.calls.append(tool_name)
        return MagicMock(allowed=True)


class TestLedgerDualBudget:
    """AIHawk SHOWN/SENT双预算账本：每次处理都记账，截断显式可见，跨实例可读"""

    def test_no_spill_recorded_sent_eq_shown(self):
        h = make_handler()
        h.process("terminal", "tc1", "small output")
        stats = h.get_stats()
        assert stats["total_calls"] == 1
        assert stats["truncated_calls"] == 0
        assert stats["sent_chars_total"] == len("small output")
        assert stats["shown_chars_total"] == len("small output")

    def test_spill_recorded_shown_lt_sent(self):
        h = make_handler(char_threshold=100)
        big = "X" * 5000
        h.process("read_file", "tc2", big)
        stats = h.get_stats()
        assert stats["total_calls"] == 1
        assert stats["truncated_calls"] == 1
        assert stats["sent_chars_total"] == 5000
        assert stats["shown_chars_total"] < 5000  # stub远小于原文
        assert stats["by_tool"]["read_file"]["truncated"] == 1

    def test_by_tool_aggregation(self):
        h = make_handler(char_threshold=100)
        h.process("read_file", "tc1", "A" * 300)
        h.process("terminal", "tc2", "small")
        h.process("terminal", "tc3", "B" * 400)
        stats = h.get_stats()
        assert stats["by_tool"]["read_file"]["calls"] == 1
        assert stats["by_tool"]["terminal"]["calls"] == 2
        assert stats["by_tool"]["terminal"]["truncated"] == 1

    def test_ledger_cross_instance_readable(self, ):
        """跨进程语义：新实例（=app.py API进程）读同一spill_dir账本"""
        tmpdir = tempfile.mkdtemp(prefix="wiring_shared_")
        writer = ToolOutputHandler(spill_dir=tmpdir, char_threshold=100)
        writer.process("terminal", "tc1", "C" * 2000)
        reader = ToolOutputHandler(spill_dir=tmpdir)  # 新实例，不同阈值也读得到账本
        stats = reader.get_stats()
        assert stats["total_calls"] == 1
        assert stats["truncated_calls"] == 1
        assert stats["ledger_path"].endswith("spill_ledger.jsonl")

    def test_recent_spills_capped_fields(self):
        h = make_handler(char_threshold=50)
        for i in range(3):
            h.process("terminal", f"tc{i}", "D" * 5000)
        stats = h.get_stats()
        assert len(stats["recent_spills"]) == 3
        rec = stats["recent_spills"][0]
        assert rec["tool_name"] == "terminal"
        assert rec["original_size"] == 5000
        assert rec["shown_size"] < 5000


class TestStubAndReadSegment:
    """stub显式标记 + read_segment安全读回"""

    def test_stub_references_read_file_segment(self):
        h = make_handler(char_threshold=100)
        r = h.process("terminal", "tc1", "E" * 3000)
        assert r.spilled
        assert "[TRUNCATED" in r.processed_text
        assert "read_file_segment" in r.processed_text
        assert r.spill_path in r.processed_text

    def test_spill_file_contains_full_content(self):
        h = make_handler(char_threshold=100)
        payload = "line-content\n" * 100
        r = h.process("terminal", "tc1", payload)
        assert r.spilled
        saved = Path(r.spill_path).read_text(encoding="utf-8")
        assert saved == payload  # 落盘内容=原始内容，零丢失

    def test_read_segment_full_cycle(self):
        h = make_handler(char_threshold=100)
        payload = "\n".join(f"row{i}" for i in range(1, 101))
        r = h.process("terminal", "tc1", payload)
        seg = h.read_segment(r.spill_path, start_line=1, end_line=10)
        assert "[溢出文件分段读取" in seg
        assert "row1" in seg and "row10" in seg
        assert "row11" not in seg
        assert "还有 90 行未读取" in seg  # deepagents：教模型继续读

    def test_read_segment_rejects_path_traversal(self):
        h = make_handler()
        outside = Path(tempfile.mkdtemp()) / "secret.txt"
        outside.write_text("secret data")
        seg = h.read_segment(str(outside), 1, 10)
        assert "错误" in seg
        assert "secret data" not in seg

    def test_read_segment_nonexistent(self):
        h = make_handler()
        seg = h.read_segment(str(h.spill_dir / "nope.txt"), 1, 10)
        assert "错误" in seg


def _wire_agent(tmp_path, scripts, big_file: Path, handler: ToolOutputHandler):
    """复用test_steering的make_agent骨架，补齐工具执行路径所需属性"""
    agent = make_agent(tmp_path, scripts=scripts)
    agent._permission_gate = FakeGateAllow()
    agent._output_handler = handler
    agent._tool_cache = MagicMock()
    agent._tool_cache.get.return_value = None
    agent._tool_error_handler = MagicMock()
    agent._todo_list = []
    return agent


class TestSoulMateWiring:
    """真实运行路径（:8092 ACP → SoulMateAgent._run_llm_with_tools）的P0-2接线"""

    def test_handler_initialized_in_init(self):
        """__init__必须初始化_output_handler（不是只有测试harness才有）"""
        src = Path(__file__).parent.parent / "agent" / "soulmate_agent.py"
        text = src.read_text(encoding="utf-8")
        assert "self._output_handler = ToolOutputHandler(" in text

    def test_runtime_call_sites_use_handler(self):
        """三处工具结果入context的位置全部走_process_tool_output，不再直接truncate"""
        src = Path(__file__).parent.parent / "agent" / "soulmate_agent.py"
        text = src.read_text(encoding="utf-8")
        assert text.count("self._process_tool_output(") >= 3  # 3个运行时调用点（定义行不含self.）
        # 运行时结果路径不再直接调用truncate_tool_result（仅helper降级fallback保留1处+import）
        import re
        runtime_calls = re.findall(r'"content": truncate_tool_result', text)
        assert runtime_calls == []

    def test_read_file_segment_tool_registered(self):
        """stub教的工具必须真实存在于工具定义+system prompt"""
        src = Path(__file__).parent.parent / "agent" / "soulmate_agent.py"
        text = src.read_text(encoding="utf-8")
        assert '"name": "read_file_segment"' in text
        assert "- read_file_segment:" in text  # system prompt工具文档

    def test_permission_gate_whitelists_read_file_segment(self):
        """读回工具必须在权限引擎只读白名单（否则explore模式下读回落盘被拦）"""
        src = Path(__file__).parent.parent / "agent" / "permission_gate.py"
        text = src.read_text(encoding="utf-8")
        assert '"read_file_segment"' in text

    def test_spill_stub_enters_context_real_loop(self, tmp_path):
        """端到端：read_file读大文件→工具结果超阈值→stub（非原文）进入messages→落盘"""
        big_file = tmp_path / "big.txt"
        big_file.write_text("\n".join(f"content-line-{i}" for i in range(2000)))
        handler = ToolOutputHandler(
            spill_dir=tempfile.mkdtemp(prefix="wiring_e2e_"),
            char_threshold=2000, line_threshold=100, preview_chars=200,
        )
        tool_call = {"tool_calls": [{
            "id": "tc1",
            "function": {"name": "read_file", "arguments": json.dumps({"path": str(big_file), "limit": 2000})},
        }]}
        agent = _wire_agent(tmp_path, scripts=[[tool_call], []], big_file=big_file, handler=handler)
        resp, tools = run(agent._run_llm_with_tools([{"role": "user", "content": "read it"}], "s1"))
        # 第2次LLM调用收到的messages里，工具结果必须是stub而非原文
        seen = agent.llm_engine.seen_messages[1]
        tool_msgs = [m for m in seen if m.get("role") == "tool"]
        assert len(tool_msgs) == 1
        content = tool_msgs[0]["content"]
        assert "[TRUNCATED" in content
        assert "read_file_segment" in content
        assert "content-line-1500" not in content  # 中段原文不进context（head+tail预览之外）
        # 完整结果已落盘
        spills = list(Path(handler.spill_dir).glob("*.txt"))
        assert len(spills) == 1
        assert "content-line-1999" in spills[0].read_text(encoding="utf-8")

    def test_read_file_segment_readback_real_loop(self, tmp_path):
        """端到端闭环：模型收到stub→调用read_file_segment→拿到分段内容+继续读提示"""
        big_file = tmp_path / "big.txt"
        big_file.write_text("\n".join(f"content-line-{i}" for i in range(2000)))
        handler = ToolOutputHandler(
            spill_dir=tempfile.mkdtemp(prefix="wiring_e2e2_"),
            char_threshold=2000, line_threshold=100, preview_chars=200,
        )
        step1 = {"tool_calls": [{
            "id": "tc1",
            "function": {"name": "read_file", "arguments": json.dumps({"path": str(big_file)})},
        }]}
        spill_path = ""
        # 先跑第一轮拿到spill路径
        agent1 = _wire_agent(tmp_path, scripts=[[step1], []], big_file=big_file, handler=handler)
        run(agent1._run_llm_with_tools([{"role": "user", "content": "read it"}], "s1"))
        spill_path = next(Path(handler.spill_dir).glob("*.txt"))
        # 第二轮：模型按stub调用read_file_segment
        step2 = {"tool_calls": [{
            "id": "tc2",
            "function": {"name": "read_file_segment",
                         "arguments": json.dumps({"path": str(spill_path), "start_line": 1, "end_line": 20})},
        }]}
        agent2 = _wire_agent(tmp_path, scripts=[[step2], []], big_file=big_file, handler=handler)
        resp, tools = run(agent2._run_llm_with_tools([{"role": "user", "content": "read more"}], "s1"))
        seen = agent2.llm_engine.seen_messages[1]
        tool_msgs = [m for m in seen if m.get("role") == "tool"]
        assert len(tool_msgs) == 1
        content = tool_msgs[0]["content"]
        assert "[溢出文件分段读取" in content
        assert "content-line-0" in content
        assert "read_file_segment(path=" in content  # 继续读提示（deepagents）

    def test_stats_visible_after_real_loop(self, tmp_path):
        """可观测性：真实循环跑完后，账本能回答'截断了多少/SHOWN vs SENT'"""
        big_file = tmp_path / "big.txt"
        big_file.write_text("Z" * 10000)
        handler = ToolOutputHandler(
            spill_dir=tempfile.mkdtemp(prefix="wiring_stats_"),
            char_threshold=2000, line_threshold=500, preview_chars=200,
        )
        step1 = {"tool_calls": [{
            "id": "tc1",
            "function": {"name": "read_file", "arguments": json.dumps({"path": str(big_file)})},
        }]}
        agent = _wire_agent(tmp_path, scripts=[[step1], []], big_file=big_file, handler=handler)
        run(agent._run_llm_with_tools([{"role": "user", "content": "read it"}], "s1"))
        stats = handler.get_stats()
        assert stats["truncated_calls"] >= 1
        assert stats["sent_chars_total"] >= 10000
        assert stats["shown_chars_total"] < stats["sent_chars_total"]
        assert stats["by_tool"]["read_file"]["truncated"] >= 1
        assert stats["total_spills"] >= 1

    def test_helper_fail_safe_fallback(self, tmp_path, monkeypatch):
        """handler处理失败→降级degraded_spill（上轮遗留#3销账后的新契约）：
        全文落盘可读回+显式[TRUNCATED]标记，绝不让工具循环崩溃。
        （测试演进：旧契约此处断言"[内容过长，已截断"静默切尾——该行为已被
        本轮有意替换为不丢数据的degraded_spill，详见test_degraded_spill.py）"""
        monkeypatch.setenv("TOOL_SPILL_DIR", str(tmp_path))
        agent = SoulMateAgent.__new__(SoulMateAgent)

        class Boom:
            def process(self, *a, **k):
                raise RuntimeError("boom")

        agent._output_handler = Boom()
        big = "X" * 20000
        out = agent._process_tool_output("terminal", "tc1", big)
        assert out.startswith("[TRUNCATED — 溢出处理失败，已降级截断]")
        files = list(tmp_path.glob("degraded_terminal_*.txt"))
        assert len(files) == 1 and files[0].read_text(encoding="utf-8") == big
