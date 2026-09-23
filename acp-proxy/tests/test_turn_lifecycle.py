# -*- coding: utf-8 -*-
"""kilocode supplement3 #7 Turn生命周期事件 + #10 记忆事件总线 测试。

调研来源：kilocode-source-supplement3.md
- #7（turn.ts）："bus订阅TurnOpen/TurnClose事件驱动记忆采集；superseded→按interrupted
  处理（被排队消息顶掉的turn=被中断，不完整不digest）；订阅器失败永不破坏宿主会话流"
- #10（events.ts）："memory.status/updated/error三事件+best-effort sink"

覆盖：
1. 单元：memory_close_view（superseded→interrupted核心语义）/ should_digest门禁
2. TurnLifecycleBus：订阅隔离（抛异常不破坏宿主）/ cancel降级 / close幂等 / 观测
3. MemoryDigestCollector：完整turn才digest / interrupted·superseded·cached不digest /
   echo_guard显式 / 回声阻断可见 / 失败非致命
4. 记忆事件best-effort sink（无bus上下文丢弃不报错）
5. 接线断言：soulmate_agent真实消息路径 open_turn/aclose_turn/abort语义/cancel/error收尾
"""
import asyncio
import inspect
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agent.turn_lifecycle import (
    CLOSE_CANCELLED,
    CLOSE_COMPLETED,
    CLOSE_ERROR,
    CLOSE_INTERRUPTED,
    CLOSE_SUPERSEDED,
    EVENT_TURN_CLOSE,
    EVENT_TURN_OPEN,
    MemoryDigestCollector,
    TurnLifecycleBus,
    emit_memory_event,
    memory_close_view,
    should_digest,
)
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


LONG_USER = "这是一条足够长的用户消息" * 10   # >50字符
LONG_RESP = "这是一段足够长的助手回复内容" * 10  # >100字符


# ════════════════════════════════════════════════════════════════
# memory_close_view — superseded→按interrupted处理（kilocode核心语义）
# ════════════════════════════════════════════════════════════════

class TestMemoryCloseView:
    def test_completed_stays_completed(self):
        assert memory_close_view(CLOSE_COMPLETED) == CLOSE_COMPLETED

    def test_superseded_treated_as_interrupted(self):
        """kilocode原文："superseded→按interrupted处理（被排队消息顶掉的turn=被中断，
        不完整不digest）"——记忆视角必须归一为interrupted"""
        assert memory_close_view(CLOSE_SUPERSEDED) == CLOSE_INTERRUPTED

    def test_other_reasons_all_interrupted_view(self):
        for reason in (CLOSE_INTERRUPTED, CLOSE_CANCELLED, CLOSE_ERROR, "unknown"):
            assert memory_close_view(reason) == CLOSE_INTERRUPTED


# ════════════════════════════════════════════════════════════════
# should_digest — 记忆采集门禁
# ════════════════════════════════════════════════════════════════

class TestShouldDigest:
    def test_completed_long_content_digests(self):
        assert should_digest(CLOSE_COMPLETED, {"user_text": LONG_USER, "full_response": "x"}) is True
        assert should_digest(CLOSE_COMPLETED, {"user_text": "短", "full_response": LONG_RESP}) is True

    def test_short_content_skipped(self):
        """长度门槛沿用旧内联逻辑：user<=50 且 response<=100 不digest"""
        assert should_digest(CLOSE_COMPLETED, {"user_text": "短", "full_response": "也短"}) is False

    def test_incomplete_turns_never_digest(self):
        """superseded/interrupted/cancelled/error一律不digest（不完整不进记忆）"""
        for reason in (CLOSE_SUPERSEDED, CLOSE_INTERRUPTED, CLOSE_CANCELLED, CLOSE_ERROR):
            assert should_digest(reason, {"user_text": LONG_USER, "full_response": LONG_RESP}) is False

    def test_cache_hit_skipped(self):
        """缓存命中回合无新信息不digest（同防回声精神：没有新内容不进记忆）"""
        assert should_digest(
            CLOSE_COMPLETED,
            {"user_text": LONG_USER, "full_response": LONG_RESP, "cached": True},
        ) is False


# ════════════════════════════════════════════════════════════════
# TurnLifecycleBus — 生命周期总线（订阅隔离/取消降级/幂等/观测）
# ════════════════════════════════════════════════════════════════

class TestTurnLifecycleBus:
    def test_open_close_record(self):
        bus = TurnLifecycleBus()
        rec = bus.open_turn("s1", message_id="m1", user_text_len=42)
        assert bus.active("s1") is rec and rec.is_open
        closed = run(bus.aclose_turn("s1", CLOSE_COMPLETED, user_text="u", full_response="r", tool_calls=2))
        assert closed is rec and not rec.is_open
        assert closed.close_reason == CLOSE_COMPLETED
        assert closed.meta["user_text"] == "u" and closed.meta["tool_calls"] == 2
        assert bus.active("s1") is None

    def test_subscriber_isolation_sync(self):
        """kilocode："订阅器失败永不破坏宿主会话流"——单订阅器抛异常，后续订阅器照常执行"""
        bus = TurnLifecycleBus()
        seen = []

        def bad(_rec):
            raise RuntimeError("subscriber boom")

        def good(rec):
            seen.append(rec.turn_id)

        bus.subscribe(EVENT_TURN_OPEN, bad).subscribe(EVENT_TURN_OPEN, good)
        bus.subscribe(EVENT_TURN_CLOSE, bad).subscribe(EVENT_TURN_CLOSE, good)
        bus.open_turn("s1")                     # 不应抛
        run(bus.aclose_turn("s1"))              # 不应抛
        assert len(seen) == 2                    # open+close的good订阅器都跑到了

    def test_async_subscriber_awaited_on_close(self):
        bus = TurnLifecycleBus()
        seen = []

        async def collector(rec):
            seen.append(rec.close_reason)

        bus.subscribe(EVENT_TURN_CLOSE, collector)
        bus.open_turn("s1")
        run(bus.aclose_turn("s1", CLOSE_INTERRUPTED))
        assert seen == [CLOSE_INTERRUPTED]

    def test_async_subscriber_failure_swallowed(self):
        bus = TurnLifecycleBus()

        async def bad(_rec):
            raise RuntimeError("async boom")

        bus.subscribe(EVENT_TURN_CLOSE, bad)
        bus.open_turn("s1")
        assert run(bus.aclose_turn("s1")) is not None  # 不应抛

    def test_cancel_downgrades_completed(self):
        """cancel()收尾的turn即使跑完也按cancelled（不完整不digest）"""
        bus = TurnLifecycleBus()
        bus.open_turn("s1")
        assert bus.cancel_turn("s1") is True
        rec = run(bus.aclose_turn("s1", CLOSE_COMPLETED))
        assert rec.close_reason == CLOSE_CANCELLED

    def test_cancel_without_active_turn_noop(self):
        assert TurnLifecycleBus().cancel_turn("nope") is False

    def test_close_idempotent(self):
        """二次close幂等（错误路径+正常路径可能都收尾）——不炸不重复记账"""
        bus = TurnLifecycleBus()
        bus.open_turn("s1")
        assert run(bus.aclose_turn("s1")) is not None
        assert run(bus.aclose_turn("s1", CLOSE_ERROR)) is None

    def test_cancel_request_cleared_after_close(self):
        bus = TurnLifecycleBus()
        bus.open_turn("s1")
        bus.cancel_turn("s1")
        run(bus.aclose_turn("s1", CLOSE_COMPLETED))  # → cancelled
        bus.open_turn("s1")                          # 新turn不受旧cancel影响
        rec = run(bus.aclose_turn("s1", CLOSE_COMPLETED))
        assert rec.close_reason == CLOSE_COMPLETED

    def test_recent_observability(self):
        bus = TurnLifecycleBus()
        for i in range(3):
            bus.open_turn(f"s{i}")
            run(bus.aclose_turn(f"s{i}", CLOSE_COMPLETED))
        recent = bus.recent()
        assert len(recent) == 3
        assert recent[0]["close_reason"] == CLOSE_COMPLETED
        assert recent[0]["memory_view"] == CLOSE_COMPLETED

    def test_unknown_event_rejected(self):
        try:
            TurnLifecycleBus().subscribe("turn.bogus", lambda r: None)
            assert False, "should reject unknown event"
        except ValueError:
            pass


# ════════════════════════════════════════════════════════════════
# MemoryDigestCollector — 事件驱动记忆采集
# ════════════════════════════════════════════════════════════════

class TestMemoryDigestCollector:
    def _close(self, reason, client, **meta):
        bus = TurnLifecycleBus()
        collector = MemoryDigestCollector(client_factory=lambda: client)
        bus.subscribe(EVENT_TURN_CLOSE, collector)
        bus.open_turn("s1")
        meta.setdefault("user_text", LONG_USER)
        meta.setdefault("full_response", LONG_RESP)
        rec = run(bus.aclose_turn("s1", reason, **meta))
        return rec, client

    def test_completed_turn_digests_with_echo_guard(self):
        """完整turn → /ltm/add digest，载荷显式echo_guard=True（服务端回声二次闸）"""
        client = FakeClient(FakeResp(200, {"memory_id": "mem_1", "outcome": "added"}))
        _, client = self._close(CLOSE_COMPLETED, client)
        assert len(client.calls) == 1
        call = client.calls[0]
        assert call["url"].endswith("/api/hippo/ltm/add")
        assert call["json"]["echo_guard"] is True
        assert "用户:" in call["json"]["content"] and "助手:" in call["json"]["content"]

    def test_interrupted_turn_never_digests(self):
        """被中断turn不完整不digest（kilocode #7核心）"""
        for reason in (CLOSE_INTERRUPTED, CLOSE_SUPERSEDED, CLOSE_CANCELLED, CLOSE_ERROR):
            client = FakeClient()
            _, client = self._close(reason, client)
            assert client.calls == [], f"{reason} must not digest"

    def test_cache_hit_never_digests(self):
        client = FakeClient()
        _, client = self._close(CLOSE_COMPLETED, client, cached=True)
        assert client.calls == []

    def test_echo_blocked_visible_not_silent(self):
        """mem0：跳过必须可见——回声阻断返回结果但不写入"""
        client = FakeClient(FakeResp(200, {"outcome": "echo_blocked"}))
        rec, _ = self._close(CLOSE_COMPLETED, client)
        assert len(client.calls) == 1  # 发出了请求，服务端拦下

    def test_http_error_non_fatal(self):
        client = FakeClient(FakeResp(500, {}))
        rec, _ = self._close(CLOSE_COMPLETED, client)
        assert rec is not None  # turn本身正常收尾

    def test_connection_error_non_fatal(self):
        """digest失败绝不破坏宿主会话流（订阅器隔离兜底之外的自身容错）"""
        client = FakeClient(raise_exc=True)
        rec, _ = self._close(CLOSE_COMPLETED, client)
        assert rec is not None and rec.close_reason == CLOSE_COMPLETED

    def test_no_factory_uses_httpx_path(self):
        """真实路径（无factory）走httpx分支：OpenSoul不可达时返回None不抛"""
        bus = TurnLifecycleBus()
        collector = MemoryDigestCollector()
        bus.subscribe(EVENT_TURN_CLOSE, collector)
        bus.open_turn("s1")
        rec = run(bus.aclose_turn(
            "s1", CLOSE_COMPLETED, user_text=LONG_USER, full_response=LONG_RESP
        ))
        assert rec is not None  # 宿主会话流完好


# ════════════════════════════════════════════════════════════════
# 记忆事件总线（kilocode #10）— memory.status/updated/error + best-effort sink
# ════════════════════════════════════════════════════════════════

class TestMemoryEvents:
    def test_unknown_kind_dropped(self):
        assert emit_memory_event("bogus", x=1) is False

    def test_best_effort_sink_drops_on_bus_failure(self):
        """kilocode events.ts：best-effort sink（无实例上下文就丢弃不报错）——drop不抛"""
        import eventbus

        orig = eventbus.get_eventbus
        eventbus.get_eventbus = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no bus"))
        try:
            assert emit_memory_event("status", session_id="s1") is False  # 不抛
        finally:
            eventbus.get_eventbus = orig

    def test_publish_success(self):
        assert emit_memory_event("status", session_id="s1", state="collecting") is True
        assert emit_memory_event("updated", session_id="s1", memory_id="m1") is True
        assert emit_memory_event("error", session_id="s1", error="boom") is True


# ════════════════════════════════════════════════════════════════
# 接线断言 — soulmate_agent真实消息路径（写了≠接线了）
# ════════════════════════════════════════════════════════════════

class TestSoulmateWiring:
    def _src(self, fn) -> str:
        return inspect.getsource(fn)

    def test_prompt_inner_opens_and_closes_turn(self):
        src = self._src(SoulMateAgent._prompt_inner)
        assert "self._turn_lifecycle.open_turn(" in src
        assert "self._turn_lifecycle.aclose_turn(" in src
        # close必须带完整turn内容（订阅器digest的输入）
        assert "user_text=user_text" in src and "full_response=full_response" in src

    def test_cache_hit_closes_with_cached_flag(self):
        src = self._src(SoulMateAgent._prompt_inner)
        assert "session_id, turn_lifecycle.CLOSE_COMPLETED, cached=True" in src

    def test_abort_marks_superseded_or_interrupted(self):
        """steer中断路径必须落close_reason（被排队消息顶掉=superseded）"""
        src = self._src(SoulMateAgent._run_llm_with_tools)
        assert "turn_lifecycle.CLOSE_SUPERSEDED" in src
        assert "turn_lifecycle.CLOSE_INTERRUPTED" in src
        assert "self._steering.pending(session_id)" in src

    def test_prompt_error_path_closes_turn(self):
        """异常路径turn必须收尾（close_reason=error），不残留active turn"""
        src = self._src(SoulMateAgent.prompt)
        assert "turn_lifecycle.CLOSE_ERROR" in src
        assert src.count("self._turn_lifecycle.aclose_turn(") >= 1

    def test_cancel_has_real_semantics(self):
        """cancel()此前是纯no-op——必须接入turn生命周期（cancelled不digest）"""
        src = self._src(SoulMateAgent.cancel)
        assert "self._turn_lifecycle.cancel_turn(session_id)" in src

    def test_digest_collector_registered_on_init(self):
        """订阅器必须注册到bus（否则close无记忆采集=死代码）"""
        src = self._src(SoulMateAgent.__init__)
        assert "MemoryDigestCollector()" in src
        assert "turn_lifecycle.EVENT_TURN_CLOSE" in src

    def test_agent_init_builds_lifecycle_bus(self):
        src = self._src(SoulMateAgent.__init__)
        assert "turn_lifecycle.TurnLifecycleBus()" in src
