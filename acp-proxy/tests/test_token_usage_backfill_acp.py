# -*- coding: utf-8 -*-
"""P1 provider usage回填（acp-proxy侧） — token归因estimate→真实prompt_tokens校准

来源：10-claude-code-source.md #7 SDKContextUsage（provider权威token计数+逐项归因）；
opensoul/src/cortex/token_attribution.py backfill_actual（上轮b0ed5b50，本侧镜像语义）；
上轮dev-report遗留#1："acp-proxy镜像侧本轮未同步接provider usage回填——下轮候选"。

关键协议约束（本轮实现核心）：soulmate_agent在tool_calls chunk处理完后break出
async for（soulmate_agent.py:1512附近）——usage chunk必须由llm_engine在tool_calls
之前发射，否则会被丢弃。测试必须覆盖该顺序约束。

验证四层：
1. AttributionLedger.backfill_actual：gap计算/审计行/None语义/fail-safe
2. get_stats回填合并：时序配对/统计不受backfill行污染/summary新字段
3. LLMEngine真实chat_stream_with_tools解析路径（mock httpx）：usage捕获三种SSE形态
   + usage先于tool_calls的发射顺序 + trailing usage-only chunk排空
4. SoulMateAgent._run_llm_with_tools端到端：估算记录+usage回填按轮配对
"""
import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.llm_engine import LLMEngine
from agent.token_attribution import AttributionLedger
from agent.soulmate_agent import SoulMateAgent
from tests.test_steering import make_agent, run


def _usage(total=1000):
    return {
        "total_tokens": total, "raw_max_tokens": 32000,
        "percentage": round(total * 100 / 32000, 1),
        "over_limit": None, "mcp_tools": [], "memory_files": [], "skills": [],
        "agents": [], "builtin_tools": [], "evolution_tools": [], "tools": [],
        "sections": {"message": 100},
        "top_consumers": [{"kind": "skill", "name": "excel", "tokens": total, "source": "sm"}],
        "item_count": 3,
    }


def _read_ledger_rows(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


# ════════════════════════════════════════════════════════════════
# 1. AttributionLedger.backfill_actual
# ════════════════════════════════════════════════════════════════

class TestBackfillActual:
    def test_gap_computation_and_audit_row(self, tmp_path):
        """真实prompt_tokens - 估算total_tokens = estimate_gap；账本追加backfill审计行"""
        d = str(tmp_path / "bf1")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(900), session_id="sess-a", model="mimo")
        row = w.backfill_actual("sess-a", 3400)
        assert row is not None
        assert row["backfill"] is True
        assert row["actual_prompt_tokens"] == 3400
        assert row["estimate_gap"] == 3400 - 900  # 2500 = 我方估算未覆盖的隐藏开销
        assert row["matched_record_ts"] is not None
        rows = _read_ledger_rows(Path(d) / "attribution_ledger.jsonl")
        assert len(rows) == 2  # record + backfill（append-only审计）
        assert rows[1]["backfill"] is True
        assert rows[1]["session_id"] == "sess-a"

    def test_round_index_recorded(self, tmp_path):
        d = str(tmp_path / "bf2")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(500), session_id="s")
        row = w.backfill_actual("s", 700, round_index=3)
        assert row["round"] == 3
        rows = _read_ledger_rows(Path(d) / "attribution_ledger.jsonl")
        assert rows[-1]["round"] == 3

    def test_matches_most_recent_record_of_session(self, tmp_path):
        """多轮记录时匹配最近一条（round N的usage配round N的快照）"""
        d = str(tmp_path / "bf3")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(100), session_id="s")
        w.record(_usage(800), session_id="s")  # 最近一条
        row = w.backfill_actual("s", 1000)
        assert row["estimate_gap"] == 1000 - 800  # 配最近的，不是第一条

    def test_none_input_returns_none(self, tmp_path):
        d = str(tmp_path / "bf4")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(100), session_id="s")
        assert w.backfill_actual("s", None) is None
        rows = _read_ledger_rows(Path(d) / "attribution_ledger.jsonl")
        assert len(rows) == 1  # 无backfill行写入

    def test_unknown_session_returns_none_no_write(self, tmp_path):
        """找不到匹配session → None（fail-safe，不新建记录不抛）"""
        d = str(tmp_path / "bf5")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(100), session_id="other")
        assert w.backfill_actual("no-such-session", 5000) is None
        rows = _read_ledger_rows(Path(d) / "attribution_ledger.jsonl")
        assert len(rows) == 1  # 没有为未知session写任何行

    def test_backfill_rows_not_matched_as_records(self, tmp_path):
        """backfill行不当作归因记录匹配（防回填匹配到回填）"""
        d = str(tmp_path / "bf6")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(100), session_id="s")
        w.backfill_actual("s", 300)
        # 再次回填：仍应匹配usage记录（gap=400-100），而非第一条backfill行
        row2 = w.backfill_actual("s", 400)
        assert row2["estimate_gap"] == 400 - 100

    def test_corrupt_ledger_nonfatal(self, tmp_path):
        d = tmp_path / "bf7"
        d.mkdir()
        (d / "attribution_ledger.jsonl").write_text("NOT-JSON\n\n", encoding="utf-8")
        led = AttributionLedger(ledger_dir=str(d))
        assert led.backfill_actual("s", 100) is None  # 不抛


# ════════════════════════════════════════════════════════════════
# 2. get_stats 回填合并
# ════════════════════════════════════════════════════════════════

class TestGetStatsBackfillMerge:
    def test_record_annotated_with_backfill(self, tmp_path):
        """跨进程读：API进程（新实例）读到record+actual/gap合并结果"""
        d = str(tmp_path / "gs1")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(900), session_id="s1", model="mimo")
        w.backfill_actual("s1", 3400)
        stats = AttributionLedger(ledger_dir=d).get_stats()  # 新实例=API进程视角
        rec = stats["recent"][0]
        assert rec["actual_prompt_tokens"] == 3400
        assert rec["estimate_gap"] == 2500
        latest = stats["summary"]["latest"]
        assert latest["actual_prompt_tokens"] == 3400
        assert latest["estimate_gap"] == 2500
        assert stats["summary"]["backfill_count"] == 1
        assert stats["summary"]["avg_estimate_gap"] == 2500

    def test_backfill_rows_excluded_from_totals(self, tmp_path):
        """backfill行不计入total_records/总量统计/latest选取"""
        d = str(tmp_path / "gs2")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(1000), session_id="a")
        w.backfill_actual("a", 2000)
        w.backfill_actual("a", 2500)  # 二次回填（如多轮工具循环）
        stats = AttributionLedger(ledger_dir=d).get_stats()
        assert stats["total_records"] == 1  # 2条backfill行不污染计数
        assert stats["summary"]["total_records"] == 1
        assert stats["summary"]["avg_total_tokens"] == 1000  # backfill行(无usage)不拉低均值
        assert stats["summary"]["backfill_count"] == 2
        # latest必须是归因记录而非backfill行
        assert stats["summary"]["latest"]["session_id"] == "a"
        assert stats["summary"]["latest"]["total_tokens"] == 1000

    def test_per_round_pairing(self, tmp_path):
        """两轮record×两轮backfill按ts时序配对（round0配round0、round1配round1）"""
        import time
        d = str(tmp_path / "gs3")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(100), session_id="s")
        w.backfill_actual("s", 300, round_index=0)   # gap=200
        time.sleep(0.01)
        w.record(_usage(900), session_id="s")        # 第二轮：上下文增长
        w.backfill_actual("s", 1200, round_index=1)  # gap=300
        stats = AttributionLedger(ledger_dir=d).get_stats()
        assert stats["total_records"] == 2
        recs = stats["recent"]  # 最新在前
        assert recs[0]["usage"]["total_tokens"] == 900
        assert recs[0]["actual_prompt_tokens"] == 1200
        assert recs[0]["estimate_gap"] == 300
        assert recs[0]["backfill_round"] == 1
        assert recs[1]["usage"]["total_tokens"] == 100
        assert recs[1]["actual_prompt_tokens"] == 300
        assert recs[1]["estimate_gap"] == 200
        assert recs[1]["backfill_round"] == 0
        assert stats["summary"]["avg_estimate_gap"] == 250

    def test_no_backfill_fields_none(self, tmp_path):
        """无回填时新字段为None（前端契约稳定：字段存在但值None）"""
        d = str(tmp_path / "gs4")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(500), session_id="s")
        stats = AttributionLedger(ledger_dir=d).get_stats()
        assert stats["recent"][0].get("actual_prompt_tokens") is None
        assert stats["summary"]["latest"]["actual_prompt_tokens"] is None
        assert stats["summary"]["latest"]["estimate_gap"] is None
        assert stats["summary"]["backfill_count"] == 0
        assert stats["summary"]["avg_estimate_gap"] is None

    def test_contract_fields_preserved(self, tmp_path):
        """回归：既有monitoring页消费契约字段不因回填合并丢失"""
        d = str(tmp_path / "gs5")
        w = AttributionLedger(ledger_dir=d)
        w.record(_usage(800), session_id="s")
        w.backfill_actual("s", 1000)
        stats = AttributionLedger(ledger_dir=d).get_stats()
        for key in ("total_records", "recent", "summary", "ledger_path"):
            assert key in stats
        s = stats["summary"]
        for key in ("over_limit_records", "avg_total_tokens", "max_total_tokens",
                    "latest", "top_consumers"):
            assert key in s
        for key in ("total_tokens", "percentage", "over_limit", "raw_max_tokens",
                    "session_id", "model", "item_count"):
            assert key in s["latest"]


# ════════════════════════════════════════════════════════════════
# 3. LLMEngine.chat_stream_with_tools — usage捕获与发射顺序（mock httpx）
# ════════════════════════════════════════════════════════════════

class _FakeStreamResp:
    status_code = 200

    def __init__(self, payload_bytes: list[bytes]):
        self._payloads = list(payload_bytes)

    async def aiter_bytes(self):
        while self._payloads:
            yield self._payloads.pop(0)

    async def aclose(self):
        pass


def _fake_client_factory(responses: list[_FakeStreamResp]):
    """responses: 每次send()依次返回一个（模拟重试时的多次请求）"""
    state = {"calls": 0}

    class _FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        def build_request(self, *a, **kw):
            return object()

        async def send(self, req, stream=False):
            idx = min(state["calls"], len(responses) - 1)
            state["calls"] += 1
            return responses[idx]

    return _FakeClient


def _sse(data: dict | str) -> bytes:
    if isinstance(data, str):
        return f"data: {data}\n\n".encode()
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def _collect(engine, monkeypatch, responses):
    monkeypatch.setattr("agent.llm_engine.httpx.AsyncClient",
                        _fake_client_factory(responses))
    out = []

    async def _go():
        async for c in engine.chat_stream_with_tools(
            messages=[{"role": "user", "content": "hi"}], tools=None,
        ):
            out.append(c)

    run(_go())
    return out


class TestLLMEngineUsageCapture:
    def _engine(self):
        return LLMEngine(api_key="k", base_url="http://fake/v1", model="mimo-test")

    def test_usage_only_chunk_captured_before_done(self, monkeypatch):
        """OpenAI标准形态：finish后choices:[]+usage尾chunk，[DONE]路径发射usage"""
        resp = _FakeStreamResp([
            _sse({"choices": [{"delta": {"content": "你好"}, "index": 0}]}),
            _sse({"choices": [{"delta": {}, "finish_reason": "stop", "index": 0}]}),
            _sse({"choices": [], "usage": {"prompt_tokens": 4321, "completion_tokens": 8}}),
            _sse("[DONE]"),
        ])
        out = _collect(self._engine(), monkeypatch, [resp])
        # 文本delta + usage dict（usage-only chunk此前被continue丢弃——本轮修复点）
        assert out[0] == "你好"
        assert {"usage": {"prompt_tokens": 4321, "completion_tokens": 8}} in out
        # 顺序约束：usage必须出现在流末尾且无tool_calls场景不破坏文本路径

    def test_usage_emitted_before_tool_calls(self, monkeypatch):
        """顺序协议：usage chunk必须先于tool_calls发射（消费方见tool_calls即break）"""
        resp = _FakeStreamResp([
            _sse({"choices": [{"delta": {"tool_calls": [
                {"index": 0, "id": "tc1", "type": "function",
                 "function": {"name": "terminal", "arguments": "{\"command\": \"ls\"}"}}]},
                "finish_reason": "tool_calls", "index": 0}]}),
            _sse({"choices": [], "usage": {"prompt_tokens": 2048, "completion_tokens": 30}}),
            _sse("[DONE]"),
        ])
        out = _collect(self._engine(), monkeypatch, [resp])
        usage_idx = next(i for i, c in enumerate(out)
                         if isinstance(c, dict) and "usage" in c)
        tc_idx = next(i for i, c in enumerate(out)
                      if isinstance(c, dict) and "tool_calls" in c)
        assert usage_idx < tc_idx, f"usage(#{usage_idx})必须先于tool_calls(#{tc_idx})"
        tc = out[tc_idx]["tool_calls"][0]
        assert tc["function"]["name"] == "terminal"
        assert json.loads(tc["function"]["arguments"]) == {"command": "ls"}

    def test_trailing_usage_drained_after_finish_reason(self, monkeypatch):
        """finish_reason=tool_calls后立即排空尾流：trailing usage-only chunk不丢失
        （旧实现在finish_reason处直接return——provider标准usage位置的数据被丢弃）"""
        resp = _FakeStreamResp([
            _sse({"choices": [{"delta": {"tool_calls": [
                {"index": 0, "id": "tc1", "type": "function",
                 "function": {"name": "read_file", "arguments": "{}"}}]},
                "finish_reason": "tool_calls", "index": 0}]}),
            # finish_reason chunk之后到达的尾部数据（同一HTTP流的后续字节）
            _sse({"choices": [], "usage": {"prompt_tokens": 5555, "completion_tokens": 3}}),
            _sse("[DONE]"),
        ])
        out = _collect(self._engine(), monkeypatch, [resp])
        usage_chunks = [c for c in out if isinstance(c, dict) and "usage" in c]
        assert usage_chunks, "finish_reason后的trailing usage chunk必须被排空捕获"
        assert usage_chunks[0]["usage"]["prompt_tokens"] == 5555

    def test_usage_in_finish_chunk_captured(self, monkeypatch):
        """部分provider（token-plan live实测形态）：usage与finish_reason同chunk"""
        resp = _FakeStreamResp([
            _sse({"choices": [{"delta": {"content": "回答"}, "index": 0}]}),
            _sse({"choices": [{"delta": {}, "finish_reason": "stop", "index": 0}],
                  "usage": {"prompt_tokens": 253, "completion_tokens": 12}}),
            _sse({"choices": [], "usage": {"prompt_tokens": 253, "completion_tokens": 12}}),
            _sse("[DONE]"),
        ])
        engine = self._engine()
        out = _collect(engine, monkeypatch, [resp])
        usage_chunks = [c for c in out if isinstance(c, dict) and "usage" in c]
        assert usage_chunks[0]["usage"]["prompt_tokens"] == 253
        assert engine.last_usage == {"prompt_tokens": 253, "completion_tokens": 12}

    def test_no_usage_provider_path_unchanged(self, monkeypatch):
        """无usage的provider（如本地ollama）：不发射usage dict，文本路径不受影响"""
        resp = _FakeStreamResp([
            _sse({"choices": [{"delta": {"content": "纯"}, "index": 0}]}),
            _sse({"choices": [{"delta": {"content": "文本"}, "index": 0}]}),
            _sse({"choices": [{"delta": {}, "finish_reason": "stop", "index": 0}]}),
            _sse("[DONE]"),
        ])
        engine = self._engine()
        out = _collect(engine, monkeypatch, [resp])
        assert out == ["纯", "文本"]
        assert engine.last_usage is None

    def test_truncated_marker_preserved(self, monkeypatch):
        """finish_reason=length截断：_truncated标记保持，usage仍先行"""
        resp = _FakeStreamResp([
            _sse({"choices": [{"delta": {"tool_calls": [
                {"index": 0, "id": "tc1", "type": "function",
                 "function": {"name": "write_file", "arguments": ""}}]},
                "finish_reason": "length", "index": 0}]}),
            _sse({"choices": [], "usage": {"prompt_tokens": 900}}),
            _sse("[DONE]"),
        ])
        out = _collect(self._engine(), monkeypatch, [resp])
        usage_idx = next(i for i, c in enumerate(out)
                         if isinstance(c, dict) and "usage" in c)
        tc_idx = next(i for i, c in enumerate(out)
                      if isinstance(c, dict) and "tool_calls" in c)
        assert usage_idx < tc_idx
        assert out[tc_idx].get("_truncated") is True


# ════════════════════════════════════════════════════════════════
# 4. SoulMateAgent._run_llm_with_tools 端到端 — record+backfill按轮配对
# ════════════════════════════════════════════════════════════════

class _GateAllow:
    def __init__(self):
        self.calls = []

    async def check(self, session_id, tool_name, tool_args, **kw):
        self.calls.append(tool_name)
        return MagicMock(allowed=True)


def _backfill_agent(tmp_path, scripts):
    agent = make_agent(tmp_path, scripts=scripts)
    agent._permission_gate = _GateAllow()
    agent._token_attr_ledger = AttributionLedger(ledger_dir=str(tmp_path / "ta_bf"))
    return agent


class TestSoulMateBackfillWiring:
    def test_e2e_single_round_backfill(self, tmp_path):
        """端到端：估算record写入→provider usage chunk→backfill行+gap合并进stats"""
        agent = _backfill_agent(tmp_path, [[
            "处理完成",
            {"usage": {"prompt_tokens": 5000, "completion_tokens": 9}},
        ]])
        resp, _ = run(agent._run_llm_with_tools(
            [{"role": "user", "content": "帮我处理一下门禁表格任务，需要详细分析"}], "s1",
        ))
        assert resp == "处理完成"  # usage dict不得泄漏进回复文本
        stats = agent._token_attr_ledger.get_stats()
        assert stats["total_records"] == 1
        rec = stats["recent"][0]
        est_total = rec["usage"]["total_tokens"]
        assert est_total > 0
        assert rec["actual_prompt_tokens"] == 5000
        assert rec["estimate_gap"] == 5000 - est_total
        assert stats["summary"]["backfill_count"] == 1
        # 审计行round_index=0
        rows = _read_ledger_rows(Path(agent._token_attr_ledger.ledger_path))
        bf_rows = [r for r in rows if r.get("backfill")]
        assert len(bf_rows) == 1 and bf_rows[0]["round"] == 0

    def test_e2e_two_rounds_per_round_pairing(self, tmp_path):
        """两轮工具循环：每轮record+backfill，gap按轮配对（上下文随工具结果增长）"""
        scripts = [
            [  # round 0：usage先行（引擎协议），再tool_calls（输出足够长→
                # round1上下文估算可见增长）
                {"usage": {"prompt_tokens": 300, "completion_tokens": 5}},
                {"tool_calls": [{"id": "t1", "type": "function", "function": {
                    "name": "terminal", "arguments": json.dumps(
                        {"command": "python3 -c \"print('门禁测试数据'*80)\""})}}]},
            ],
            [  # round 1：最终回答+usage
                "任务完成",
                {"usage": {"prompt_tokens": 900, "completion_tokens": 4}},
            ],
        ]
        agent = _backfill_agent(tmp_path, scripts)
        resp, tool_calls = run(agent._run_llm_with_tools(
            [{"role": "user", "content": "执行一个简单命令然后总结结果"}], "s2",
        ))
        assert "任务完成" in resp
        assert any(tc["name"] == "terminal" for tc in tool_calls)
        stats = agent._token_attr_ledger.get_stats()
        assert stats["total_records"] == 2  # 每轮LLM请求一条归因记录
        recs = stats["recent"]  # 最新在前
        r1, r0 = recs[0], recs[1]
        # round 1：上下文含工具结果（估算总量应比round 0大）
        assert r1["usage"]["total_tokens"] > r0["usage"]["total_tokens"]
        assert r0["actual_prompt_tokens"] == 300
        assert r0["estimate_gap"] == 300 - r0["usage"]["total_tokens"]
        assert r0["backfill_round"] == 0
        assert r1["actual_prompt_tokens"] == 900
        assert r1["estimate_gap"] == 900 - r1["usage"]["total_tokens"]
        assert r1["backfill_round"] == 1
        assert stats["summary"]["backfill_count"] == 2

    def test_e2e_missing_ledger_backfill_nonfatal(self, tmp_path):
        """harness无_token_attr_ledger属性→usage chunk处理fail-safe，主路径不受影响"""
        agent = make_agent(tmp_path, scripts=[[
            "正常回复",
            {"usage": {"prompt_tokens": 100}},
        ]])
        agent._permission_gate = _GateAllow()
        assert "_token_attr_ledger" not in agent.__dict__
        resp, _ = run(agent._run_llm_with_tools([{"role": "user", "content": "hi"}], "s3"))
        assert "正常回复" in resp

    def test_e2e_usage_chunk_not_leaked_to_provider_history(self, tmp_path):
        """usage dict不得进入messages历史（下一轮LLM请求看不到内部观测数据）"""
        scripts = [
            [
                {"usage": {"prompt_tokens": 200}},
                {"tool_calls": [{"id": "t1", "type": "function", "function": {
                    "name": "todo", "arguments": json.dumps({"action": "list"})}}]},
            ],
            ["好的", {"usage": {"prompt_tokens": 260}}],
        ]
        agent = _backfill_agent(tmp_path, scripts)
        run(agent._run_llm_with_tools([{"role": "user", "content": "看看任务列表"}], "s4"))
        for msg in agent.llm_engine.seen_messages[1]:  # 第二轮LLM请求收到的messages
            assert "usage" not in json.dumps(msg, ensure_ascii=False) or \
                   msg.get("role") != "assistant" or not isinstance(msg.get("content"), dict)

    def test_frontend_contract_new_fields(self, tmp_path):
        """/api/agent/token-attribution消费契约：回填新字段随get_stats透传"""
        agent = _backfill_agent(tmp_path, [[
            "ok", {"usage": {"prompt_tokens": 1500}},
        ]])
        run(agent._run_llm_with_tools([{"role": "user", "content": "契约验证消息内容"}], "s5"))
        stats = agent._token_attr_ledger.get_stats()
        # app.py直接return get_stats()——新字段自动可达前端
        assert "backfill_count" in stats["summary"]
        assert "avg_estimate_gap" in stats["summary"]
        assert "actual_prompt_tokens" in stats["summary"]["latest"]
        assert "estimate_gap" in stats["summary"]["latest"]
        assert stats["summary"]["latest"]["actual_prompt_tokens"] == 1500
