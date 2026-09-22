# -*- coding: utf-8 -*-
"""P1 记忆回声阻断真实路径接线测试（kilocode recalledMemory）

调研来源：kilocode-source-supplement3.md #5——"本轮若跑过kilo_memory_recall且
count>0→跳过digest"（"答案来自记忆的回合不能再蒸馏回记忆"）。

问题：OpenSoul侧DreamDistiller.mark_recall/should_skip_digest+/ltm/dream/recall-mark
端点早已存在，但真实消息路径（soulmate_agent._prompt_inner）零调用=死代码，
且/ltm/add回合digest不查echo状态——记忆自我污染闭环从未被阻断。

本轮改动：
1. agent/memory_echo.py：召回id汇总+reset_turn/mark_recall薄封装+digest payload
2. soulmate_agent._prompt_inner真实路径接线：回合边界reset→双源召回collect→
   mark_recall→回合digest（/ltm/add）显式echo_guard=True+阻断可见日志
3. opensoul侧：/ltm/add回声闸（outcome=echo_blocked非静默）、/ltm/context返回
   memory_ids、memory_pipeline整合入口echo_check（另一测试文件覆盖）
"""
import asyncio
import inspect
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent import memory_echo
from agent.soulmate_agent import SoulMateAgent


def run(coro):
    return asyncio.run(coro)


class FakeResp:
    def __init__(self, status_code=200, data=None):
        self.status_code = status_code
        self._data = data if data is not None else {}

    def json(self):
        return self._data


class FakeClient:
    """记录POST调用（URL+json），可编程响应/异常"""

    def __init__(self, resp=None, raise_exc=False):
        self.calls = []
        self._resp = resp or FakeResp()
        self._raise_exc = raise_exc

    async def post(self, url, json=None, timeout=None):
        self.calls.append({"url": url, "json": json, "timeout": timeout})
        if self._raise_exc:
            raise ConnectionError("refused")
        return self._resp

    async def get(self, url, timeout=None):
        self.calls.append({"url": url, "json": None, "timeout": timeout})
        return self._resp


class FakeEntry:
    """MemoryRetrievalEngine.MemoryEntry替身（带memory_id属性）"""

    def __init__(self, mid, content="c"):
        self.memory_id = mid
        self.content = content


# ════════════════════════════════════════════════════════════════
# collect_recalled_ids — 双召回源汇总（本地引擎 + OpenSoul LTM）
# ════════════════════════════════════════════════════════════════

class TestCollectRecalledIds:
    def test_local_entries(self):
        ids = memory_echo.collect_recalled_ids(
            local_memories=[FakeEntry("mem_a"), FakeEntry("mem_b")]
        )
        assert ids == ["mem_a", "mem_b"]

    def test_local_string_ids(self):
        ids = memory_echo.collect_recalled_ids(local_memories=["x1", "x2"])
        assert ids == ["x1", "x2"]

    def test_ltm_data_ids(self):
        ids = memory_echo.collect_recalled_ids(
            ltm_data={"context": "## 相关记忆", "memory_ids": ["m1", "m2"]}
        )
        assert ids == ["m1", "m2"]

    def test_both_sources_dedup_order_preserved(self):
        ids = memory_echo.collect_recalled_ids(
            local_memories=[FakeEntry("m1"), FakeEntry("m2")],
            ltm_data={"memory_ids": ["m2", "m3"]},
        )
        assert ids == ["m1", "m2", "m3"]  # 去重保序

    def test_empty_sources(self):
        assert memory_echo.collect_recalled_ids() == []
        assert memory_echo.collect_recalled_ids(local_memories=[], ltm_data={}) == []
        assert memory_echo.collect_recalled_ids(ltm_data={"memory_ids": []}) == []

    def test_missing_ids_skipped(self):
        """无id属性的对象/空串id不入账（不污染mark计数）"""

        class NoId:
            content = "x"

        ids = memory_echo.collect_recalled_ids(local_memories=[NoId(), FakeEntry("")])
        assert ids == []


# ════════════════════════════════════════════════════════════════
# reset_turn / mark_recall — 客户端薄封装（URL/载荷/容错）
# ════════════════════════════════════════════════════════════════

class TestEchoClientCalls:
    def test_reset_turn_posts_reset_url(self):
        client = FakeClient(FakeResp(200, {"reset": True}))
        assert run(memory_echo.reset_turn(client)) is True
        assert client.calls[0]["url"] == memory_echo.TURN_RESET_URL
        assert client.calls[0]["timeout"] == memory_echo.TIMEOUT

    def test_mark_recall_posts_ids(self):
        client = FakeClient(FakeResp(200, {"marked": 2, "echo_stats": {"digest_blocked": True}}))
        result = run(memory_echo.mark_recall(client, ["a", "b"]))
        assert result is not None
        assert result["marked"] == 2
        call = client.calls[0]
        assert call["url"] == memory_echo.RECALL_MARK_URL
        assert call["json"] == {"memory_ids": ["a", "b"]}

    def test_mark_recall_empty_ids_no_call(self):
        client = FakeClient()
        assert run(memory_echo.mark_recall(client, [])) is None
        assert client.calls == []

    def test_mark_recall_exception_non_fatal(self):
        """回声标记失败不打断聊天主流程（返回None，调用方容错）"""
        client = FakeClient(raise_exc=True)
        assert run(memory_echo.mark_recall(client, ["a"])) is None
        assert run(memory_echo.reset_turn(client)) is False

    def test_mark_recall_http_error_returns_none(self):
        client = FakeClient(FakeResp(500, {}))
        assert run(memory_echo.mark_recall(client, ["a"])) is None


# ════════════════════════════════════════════════════════════════
# build_digest_payload / is_echo_blocked
# ════════════════════════════════════════════════════════════════

class TestDigestPayload:
    def test_echo_guard_explicitly_true(self):
        """回合digest必须显式带echo_guard=True（服务端二次闸）"""
        p = memory_echo.build_digest_payload(
            content="用户: q\n助手: a", memory_type="episodic",
            importance=0.5, session_id="s1",
        )
        assert p["echo_guard"] is True
        assert p["memory_type"] == "episodic"
        assert p["session_id"] == "s1"
        assert p["content"] == "用户: q\n助手: a"

    def test_explicit_write_can_opt_out(self):
        p = memory_echo.build_digest_payload(content="x", echo_guard=False)
        assert p["echo_guard"] is False

    def test_is_echo_blocked_outcome(self):
        assert memory_echo.is_echo_blocked({"outcome": "echo_blocked"}) is True

    def test_is_echo_blocked_flag(self):
        assert memory_echo.is_echo_blocked({"echo_blocked": True}) is True

    def test_is_echo_blocked_negative(self):
        assert memory_echo.is_echo_blocked({"outcome": "added"}) is False
        assert memory_echo.is_echo_blocked({}) is False
        assert memory_echo.is_echo_blocked(None) is False
        assert memory_echo.is_echo_blocked("oops") is False


# ════════════════════════════════════════════════════════════════
# 接线断言 — _prompt_inner真实消息路径必须调用memory_echo（写了≠接线了）
# ════════════════════════════════════════════════════════════════

class TestPromptInnerWiring:
    def _src(self) -> str:
        return inspect.getsource(SoulMateAgent._prompt_inner)

    def test_recall_sources_collected(self):
        src = self._src()
        assert "memory_echo.collect_recalled_ids(local_memories=local_memories)" in src
        assert "memory_echo.collect_recalled_ids(ltm_data=ltm_data)" in src

    def test_turn_reset_wired(self):
        assert "memory_echo.reset_turn(_client)" in self._src()

    def test_mark_recall_wired(self):
        assert "memory_echo.mark_recall(_client, recalled_ids)" in self._src()

    def test_digest_payload_wired(self):
        src = self._src()
        assert "memory_echo.build_digest_payload(" in src
        assert "memory_echo.is_echo_blocked(add_json)" in src

    def test_wiring_order_reset_before_mark(self):
        """reset（回合边界清零）必须先于mark（否则清掉本回合标记=阻断失效）"""
        src = self._src()
        assert src.index("memory_echo.reset_turn") < src.index("memory_echo.mark_recall")
        assert src.index("memory_echo.mark_recall") < src.index("memory_echo.build_digest_payload")
