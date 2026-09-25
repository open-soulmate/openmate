"""kilocode supplement3 #15 网络受限会话工具面收缩测试

调研来源：kilocode-source-supplement3.md #15「SandboxPolicy.networkRestricted(session)
→registry直接不暴露code-mode工具（受限会话工具面收缩，而非运行时拒绝）；
"按环境裁剪工具面优于给了再拦"」
源码对照：kilocode sandbox/policy.ts networkRestricted / tool/registry.ts
describeCodeMode `if (input.networkRestricted) return` / tool/code-mode.ts:222
`mcpTools = restricted ? {} : ...` 双保险 / session/prompt.ts MCP resource拒绝。

五层验证：
1. Store：set/clear/persist/env兜底/损坏fail-closed
2. 分类：静态网络名+MCP resource名+MCP动态名
3. filter_tools：受限裁剪/不受限恒等
4. deny_reason：运行时fail-safe兜底
5. 真实_run_llm_with_tools/_code_mode_tool_call路径E2E + inspect防死接线
"""

import inspect
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.mcp_resources import MCP_RESOURCE_TOOL_NAMES
from agent.sandbox_policy import (
    NETWORK_TOOL_NAMES,
    ENV_FLAG,
    SandboxPolicy,
)
from agent.soulmate_agent import SoulMateAgent
from tests.test_steering import FakeGate, FakeLLM, make_agent, run


def _tool_defs(*names):
    return [{"type": "function", "function": {"name": n}} for n in names]


def _names(tools):
    return [(t.get("function") or {}).get("name", "") for t in tools]


class CapturingLLM(FakeLLM):
    """记录每次chat收到的工具面（tools kwarg）——工具面收缩的直接观察点"""

    def __init__(self, scripts):
        super().__init__(scripts)
        self.seen_tools = []

    def chat_stream_with_tools(self, messages=None, tools=None, system_prompt=None, **kw):
        self.seen_tools.append(_names(list(tools or [])))
        return super().chat_stream_with_tools(
            messages=messages, tools=tools, system_prompt=system_prompt, **kw)


# ════════════════════════════════════════════════════════════════
# 1. Store — 设置/清除/持久化/env兜底/损坏fail-closed
# ════════════════════════════════════════════════════════════════

class TestStore:
    def test_missing_store_is_unrestricted(self, tmp_path):
        pol = SandboxPolicy(store_path=tmp_path / "none.json")
        assert pol.network_restricted("s1") is False

    def test_set_persists_across_instances(self, tmp_path):
        p = tmp_path / "pol.json"
        assert SandboxPolicy(store_path=p).set_restricted("s1", True) is True
        assert SandboxPolicy(store_path=p).network_restricted("s1") is True
        assert SandboxPolicy(store_path=p).network_restricted("other") is False

    def test_clear_returns_to_default(self, tmp_path):
        p = tmp_path / "pol.json"
        pol = SandboxPolicy(store_path=p)
        pol.set_restricted("s1", True)
        assert pol.clear_session("s1") is True
        assert SandboxPolicy(store_path=p).network_restricted("s1") is False

    def test_per_session_overrides_default(self, tmp_path):
        p = tmp_path / "pol.json"
        pol = SandboxPolicy(store_path=p)
        pol.set_default(True)
        pol.set_restricted("safe", False)
        assert pol.network_restricted("any") is True
        assert pol.network_restricted("safe") is False  # 显式白名单压过default

    def test_env_default_fallback(self, tmp_path, monkeypatch):
        monkeypatch.setenv(ENV_FLAG, "1")
        pol = SandboxPolicy(store_path=tmp_path / "none.json")
        assert pol.network_restricted("s1") is True
        # per-session显式仍压过env
        pol.set_restricted("s1", False)
        assert pol.network_restricted("s1") is False

    def test_corrupt_store_fail_closed(self, tmp_path):
        """store损坏 → 按受限处理（限制类配置fail-closed，绝不静默放开）"""
        p = tmp_path / "pol.json"
        p.write_text("{not json", encoding="utf-8")
        pol = SandboxPolicy(store_path=p)
        assert pol.network_restricted("s1") is True
        snap = pol.snapshot()
        assert snap["store_error"]  # 失败可见（mem0 §1.1）

    def test_non_object_store_fail_closed(self, tmp_path):
        p = tmp_path / "pol.json"
        p.write_text("[1,2,3]", encoding="utf-8")
        assert SandboxPolicy(store_path=p).network_restricted("s1") is True

    def test_snapshot_reports_state(self, tmp_path):
        p = tmp_path / "pol.json"
        pol = SandboxPolicy(store_path=p)
        pol.set_restricted("s9", True)
        snap = pol.snapshot()
        assert snap["sessions"] == {"s9": True}
        assert snap["store_path"] == str(p)
        assert snap["store_error"] == ""


# ════════════════════════════════════════════════════════════════
# 2. 分类 — 什么算"网络类"
# ════════════════════════════════════════════════════════════════

class TestClassification:
    def test_static_network_names(self):
        for n in ("web_search", "web_extract", "batch_execute"):
            assert SandboxPolicy.is_network_tool(n) is True

    def test_mcp_resource_names(self):
        for n in MCP_RESOURCE_TOOL_NAMES:
            assert SandboxPolicy.is_network_tool(n) is True

    def test_mcp_dynamic_names_via_arg(self):
        assert SandboxPolicy.is_network_tool("srv__fetch", {"srv__fetch"}) is True
        assert SandboxPolicy.is_network_tool("srv__fetch", set()) is False

    def test_local_tools_not_network(self):
        """kilocode保真：terminal/execute_code/bash类不裁（网络限制由沙箱层执行）"""
        for n in ("read_file", "terminal", "execute_code", "search_files",
                  "write_file", "patch", "clarify", "todo"):
            assert SandboxPolicy.is_network_tool(n) is False

    def test_empty_name_not_network(self):
        assert SandboxPolicy.is_network_tool("") is False


# ════════════════════════════════════════════════════════════════
# 3. filter_tools — 工具面收缩（registry语义）
# ════════════════════════════════════════════════════════════════

class TestFilterTools:
    FACE = ("read_file", "web_search", "web_extract", "batch_execute",
            "read_mcp_resource", "srv__fetch", "terminal")

    def test_unrestricted_is_identity(self, tmp_path):
        pol = SandboxPolicy(store_path=tmp_path / "pol.json")
        face = _tool_defs(*self.FACE)
        kept, dropped = pol.filter_tools("s1", face, mcp_names={"srv__fetch"})
        assert _names(kept) == list(self.FACE)
        assert dropped == []

    def test_restricted_drops_network_tools(self, tmp_path):
        pol = SandboxPolicy(store_path=tmp_path / "pol.json")
        pol.set_restricted("s1", True)
        kept, dropped = pol.filter_tools("s1", _tool_defs(*self.FACE), mcp_names={"srv__fetch"})
        assert _names(kept) == ["read_file", "terminal"]
        assert sorted(dropped) == sorted(
            ["web_search", "web_extract", "batch_execute", "read_mcp_resource", "srv__fetch"])

    def test_other_sessions_unaffected_by_restriction(self, tmp_path):
        pol = SandboxPolicy(store_path=tmp_path / "pol.json")
        pol.set_restricted("s1", True)
        kept, dropped = pol.filter_tools("s2", _tool_defs(*self.FACE), mcp_names={"srv__fetch"})
        assert dropped == [] and len(kept) == len(self.FACE)

    def test_non_dict_entries_pass_through(self):
        pol = SandboxPolicy(store_path="")  # 默认store缺省=不受限
        kept, dropped = pol.filter_tools("s1", [None, "weird"])
        assert kept == [None, "weird"] and dropped == []


# ════════════════════════════════════════════════════════════════
# 4. deny_reason — 运行时fail-safe兜底
# ════════════════════════════════════════════════════════════════

class TestDenyReason:
    def test_restricted_network_tool_denied(self, tmp_path):
        pol = SandboxPolicy(store_path=tmp_path / "pol.json")
        pol.set_restricted("s1", True)
        reason = pol.deny_reason("s1", "web_search")
        assert reason and "[SANDBOX DENIED]" in reason and "web_search" in reason

    def test_unrestricted_returns_none(self, tmp_path):
        pol = SandboxPolicy(store_path=tmp_path / "pol.json")
        assert pol.deny_reason("s1", "web_search") is None

    def test_restricted_local_tool_returns_none(self, tmp_path):
        pol = SandboxPolicy(store_path=tmp_path / "pol.json")
        pol.set_restricted("s1", True)
        assert pol.deny_reason("s1", "read_file") is None

    def test_mcp_dynamic_denied_with_names(self, tmp_path):
        pol = SandboxPolicy(store_path=tmp_path / "pol.json")
        pol.set_restricted("s1", True)
        assert pol.deny_reason("s1", "srv__fetch", mcp_names={"srv__fetch"}) is not None

    def test_describe_lists_affected_tools(self, tmp_path):
        pol = SandboxPolicy(store_path=tmp_path / "pol.json")
        pol.set_restricted("s1", True)
        d = pol.describe("s1", tool_names=["web_search", "read_file"])
        assert d["network_restricted"] is True
        assert d["dropped_if_restricted"] == ["web_search"]


# ════════════════════════════════════════════════════════════════
# 5. 接线断言（inspect防死代码）+ 真实路径E2E
# ════════════════════════════════════════════════════════════════

class TestSoulmateWiring:
    """新代码必须出现在真实消息/执行路径的源码里（防脱敏破坏/死代码）"""

    def test_init_constructs_policy(self):
        src = inspect.getsource(SoulMateAgent.__init__)
        assert "self._sandbox_policy = SandboxPolicy()" in src

    def test_face_build_calls_filter_tools(self):
        src = inspect.getsource(SoulMateAgent._run_llm_with_tools)
        assert "self._sandbox_policy.filter_tools(" in src
        assert "_sandbox_dropped" in src

    def test_main_loop_has_deny_reason_failsafe(self):
        src = inspect.getsource(SoulMateAgent._run_llm_with_tools)
        assert "self._sandbox_policy.deny_reason(" in src
        assert '"permission": "sandbox-restricted"' in src

    def test_code_mode_inner_has_deny_reason(self):
        src = inspect.getsource(SoulMateAgent._code_mode_tool_call)
        assert "self._sandbox_policy.deny_reason(" in src

    def test_all_three_callsites_present(self):
        """三个调用点收敛断言：face收缩+主循环兜底+code-mode内层双保险"""
        hits = 0
        for fn in (SoulMateAgent._run_llm_with_tools, SoulMateAgent._code_mode_tool_call):
            hits += inspect.getsource(fn).count("self._sandbox_policy.deny_reason(")
        assert hits == 2  # 主循环 + code-mode内层


class TestRunLlmFaceShrink:
    """真实_run_llm_with_tools路径E2E（CapturingLLM观察真实tools kwarg）"""

    def _agent(self, tmp_path, scripts, restricted=False):
        agent = make_agent(tmp_path, acquired=True, scripts=scripts)
        agent.llm_engine = CapturingLLM(scripts)
        gate = FakeGate(allow=False)
        agent._permission_gate = gate
        if restricted:
            agent._sandbox_policy.set_restricted("s1", True)
        return agent, gate

    def test_restricted_face_excludes_network_tools(self, tmp_path):
        agent, _ = self._agent(tmp_path, [["回答完成"]], restricted=True)
        resp, _ = run(agent._run_llm_with_tools(
            messages=[{"role": "user", "content": "hi"}], session_id="s1"))
        assert "回答完成" in resp
        face = agent.llm_engine.seen_tools[0]
        assert "web_search" not in face and "batch_execute" not in face
        assert "read_file" in face and "terminal" in face  # 本地工具保留

    def test_unrestricted_face_keeps_network_tools(self, tmp_path):
        """对照：不受限会话工具面含web_search（零行为变化）"""
        agent, _ = self._agent(tmp_path, [["回答完成"]], restricted=False)
        run(agent._run_llm_with_tools(
            messages=[{"role": "user", "content": "hi"}], session_id="s1"))
        face = agent.llm_engine.seen_tools[0]
        assert "web_search" in face and "batch_execute" in face

    def test_hallucinated_network_call_refused_not_executed(self, tmp_path):
        """兜底：模型幻觉出被裁工具名 → [SANDBOX DENIED]合成结果，gate/执行都不触达"""
        tc = {"tool_calls": [{
            "id": "h1",
            "function": {"name": "web_search", "arguments": json.dumps({"query": "x"})},
        }]}
        agent, gate = self._agent(tmp_path, [[tc], ["完成"]], restricted=True)
        resp, all_tool_calls = run(agent._run_llm_with_tools(
            messages=[{"role": "user", "content": "搜一下"}], session_id="s1"))
        assert resp == "完成"  # loop不断（open-webui三态）
        denied = [t for t in all_tool_calls if t.get("permission") == "sandbox-restricted"]
        assert len(denied) == 1 and denied[0]["name"] == "web_search"
        tool_msgs = [m for m in agent.llm_engine.seen_messages[1] if m.get("role") == "tool"]
        assert any("[SANDBOX DENIED]" in m.get("content", "") for m in tool_msgs)
        assert gate.calls == []  # 拒绝发生在gate之前=真实拦截不是gate伪装

    def test_unrestricted_call_reaches_gate(self, tmp_path):
        """对照：不受限时同一幻觉调用照常进gate（未被sandbox层拦截）"""
        tc = {"tool_calls": [{
            "id": "h2",
            "function": {"name": "web_search", "arguments": json.dumps({"query": "x"})},
        }]}
        agent, gate = self._agent(tmp_path, [[tc], ["完成"]], restricted=False)
        resp, _ = run(agent._run_llm_with_tools(
            messages=[{"role": "user", "content": "搜一下"}], session_id="s1"))
        assert resp == "完成"
        assert [c[0] for c in gate.calls] == ["web_search"]

    def test_corrupt_store_shrinks_face_fail_closed(self, tmp_path):
        """负控制：store损坏 → fail-closed工具面收缩（不显式设置也受限）"""
        bad = tmp_path / "pol.json"
        bad.write_text("{{{", encoding="utf-8")
        agent, _ = self._agent(tmp_path, [["回答完成"]], restricted=False)
        agent._sandbox_policy = SandboxPolicy(store_path=bad)
        run(agent._run_llm_with_tools(
            messages=[{"role": "user", "content": "hi"}], session_id="s1"))
        face = agent.llm_engine.seen_tools[0]
        assert "web_search" not in face


class TestCodeModeInnerFailsafe:
    """kilocode code-mode.ts:222双保险：批内网络类调用显式拒绝"""

    def test_restricted_inner_network_call_denied(self, tmp_path):
        agent = make_agent(tmp_path, acquired=True, scripts=[])
        agent._sandbox_policy.set_restricted("s1", True)
        gate = FakeGate(allow=True)
        agent._permission_gate = gate
        out = run(agent._code_mode_tool_call(
            "s1", "web_search", {"query": "x"}, "/tmp"))
        assert "[SANDBOX DENIED]" in out and "web_search" in out
        assert gate.calls == []  # 拒绝在gate之前

    def test_restricted_inner_local_call_passes_gate(self, tmp_path):
        agent = make_agent(tmp_path, acquired=True, scripts=[])
        agent._sandbox_policy.set_restricted("s1", True)
        gate = FakeGate(allow=False)  # gate deny→[被拦截:deny]，证明过了sandbox层
        agent._permission_gate = gate
        out = run(agent._code_mode_tool_call(
            "s1", "terminal", {"command": "echo never"}, "/tmp"))
        assert "[被拦截:deny]" in out
        assert [c[0] for c in gate.calls] == ["terminal"]

    def test_unrestricted_inner_network_call_reaches_gate(self, tmp_path):
        agent = make_agent(tmp_path, acquired=True, scripts=[])
        gate = FakeGate(allow=False)
        agent._permission_gate = gate
        out = run(agent._code_mode_tool_call(
            "s1", "web_search", {"query": "x"}, "/tmp"))
        assert "[SANDBOX DENIED]" not in out
        assert [c[0] for c in gate.calls] == ["web_search"]
