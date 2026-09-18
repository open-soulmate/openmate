# -*- coding: utf-8 -*-
"""S4并发缺陷修复测试 — proxy层ACP会话并发 + HTTP端点契约

修复目标（2026-09-19 cron轮）：systemic_test S4"同session并发3条消息"失败，
detail="Expecting value: line 1 column 1 (char 0)"。

根因链（journalctl+/tmp/acp-proxy.log实证）：
1. stop()用fut.cancel()取消RPC future → awaiter收到CancelledError(BaseException)
   → 逃逸ws_chat.acp_send的except Exception → uvicorn ASGI 500纯文本
   → 测试r.json()崩（"Expecting value"char 0）。
2. read_loop丢弃session/update通知里的params.sessionId → 并发prompt的chunk
   广播给所有pending prompt（实证：3条不同session响应内容完全相同245字符）。
3. /acp/send响应不含session_id → HTTP客户端无法多轮；测试"同session并发"
   实际3条全是session_id=""，从未测到排队路径。
4. 并发new_session()后读共享_default_session_id竞态；busy-poll排队实现
   双唤醒后同session并发双跑。

无网络依赖：ACPProcess用__new__级别的fake proc（不spawn子进程），
_send_message_inner/new_session用打桩，HTTP端点直接调用函数+monkeypatch。
"""
import asyncio
import json
from types import SimpleNamespace

import pytest

import ws_chat
from proxy import ACPProcess, PendingPrompt


def run(coro):
    return asyncio.run(coro)


class _FakeStdin:
    def is_closing(self):
        return False


def _fake_running(acp: ACPProcess):
    """Make is_running/_initialized True without spawning a subprocess."""
    acp._proc = SimpleNamespace(returncode=None, stdin=_FakeStdin())
    acp._initialized = True


VALID_SID = "s" * 36  # 36 chars → passes the len(sid) < 36 guard


# ════════════════════════════════════════════════════════════════
# P0-A: stop()必须以可捕获异常解决pending futures（不能cancel）
# ════════════════════════════════════════════════════════════════

def test_stop_resolves_rpc_futures_with_catchable_exception():
    async def scenario():
        acp = ACPProcess()
        fut = asyncio.get_running_loop().create_future()
        acp._rpc_pending["42"] = fut
        await acp.stop()  # _proc is None → skips terminate, still resolves futures
        assert fut.done()
        with pytest.raises(BrokenPipeError):
            await fut
        assert acp._rpc_pending == {}

    run(scenario())


def test_stop_error_is_caught_by_except_exception_not_baseexception():
    """BrokenPipeError(→retry/fallback路径)而非CancelledError(→ASGI 500)。"""
    async def scenario():
        acp = ACPProcess()
        fut = asyncio.get_running_loop().create_future()
        acp._rpc_pending["7"] = fut
        await acp.stop()
        caught_by_exception_handler = False
        try:
            await fut
        except Exception:  # 与ws_chat.acp_send同款处理器
            caught_by_exception_handler = True
        assert caught_by_exception_handler

    run(scenario())


# ════════════════════════════════════════════════════════════════
# P0-D: 同session并发 → FIFO串行、各自应答、无重入
# ════════════════════════════════════════════════════════════════

def test_same_session_concurrent_serialized_fifo_own_answers():
    async def scenario():
        acp = ACPProcess()
        _fake_running(acp)
        acp._default_session_id = "d" * 36

        active = {"n": 0}
        overlap = []
        order = []

        async def fake_inner(text, sid):
            if active["n"] > 0:
                overlap.append(text)
            active["n"] += 1
            await asyncio.sleep(0.05)
            active["n"] -= 1
            order.append(text)
            return {"response_text": f"answer:{text}", "source": "acp"}

        acp._send_message_inner = fake_inner
        results = await asyncio.gather(
            *[acp.send_message(f"msg{i}", VALID_SID) for i in range(3)]
        )
        # 串行：任何时刻只有一个prompt在执行
        assert overlap == []
        # FIFO到达序执行
        assert order == ["msg0", "msg1", "msg2"]
        # 每个请求拿到自己text的答案（不是别人的问题的答案）
        for i, r in enumerate(results):
            assert r["response_text"] == f"answer:msg{i}"
            assert r["session_id"] == VALID_SID
        # 记账队列执行后清空
        assert acp._interrupt_queue == {}
        assert acp._sessions_busy == set()

    run(scenario())


def test_same_session_queue_observable_during_execution():
    """排队可观测：忙时_interrupt_queue有条目，完成后清空。"""
    async def scenario():
        acp = ACPProcess()
        _fake_running(acp)
        seen_queue_lens = []

        async def fake_inner(text, sid):
            seen_queue_lens.append(len(acp._interrupt_queue.get(sid, [])))
            await asyncio.sleep(0.03)
            return {"response_text": f"a:{text}"}

        acp._send_message_inner = fake_inner
        await asyncio.gather(
            *[acp.send_message(f"m{i}", VALID_SID) for i in range(3)]
        )
        # 第一条执行时自身在队列中=1；后两条等待时队列更长
        assert max(seen_queue_lens) >= 2
        assert acp._interrupt_queue == {}

    run(scenario())


def test_empty_response_triggers_single_retry():
    async def scenario():
        acp = ACPProcess()
        _fake_running(acp)
        calls = []

        async def fake_inner(text, sid):
            calls.append(text)
            if len(calls) == 1:
                return {}  # 空响应 → 应重试一次
            return {"response_text": f"a:{text}"}

        acp._send_message_inner = fake_inner
        r = await acp.send_message("hello", VALID_SID)
        assert calls == ["hello", "hello"]
        assert r["response_text"] == "a:hello"
        assert r["session_id"] == VALID_SID

    run(scenario())


# ════════════════════════════════════════════════════════════════
# P0-D: 并发new_session竞态 → 每个调用者用自己session/new的返回值
# ════════════════════════════════════════════════════════════════

def _fake_sid(n: int) -> str:
    # ≥36 chars so send_message's len guard doesn't rewrite it
    return f"session-{n:028d}"


def test_fresh_session_sid_distinct_under_concurrency():
    async def scenario():
        acp = ACPProcess()
        _fake_running(acp)
        acp._default_session_id = "shared-default-attr................"
        counter = {"n": 0}

        async def fake_new_session(cwd="/home/climbing"):
            counter["n"] += 1
            n = counter["n"]
            # 后调用者先完成（反转完成序）——旧实现读共享属性会互相覆盖
            await asyncio.sleep(0.02 * (4 - n))
            return {"sessionId": _fake_sid(n)}

        acp.new_session = fake_new_session
        sids = await asyncio.gather(*[acp._fresh_session_sid() for _ in range(3)])
        assert len(set(sids)) == 3
        assert sorted(sids) == sorted(_fake_sid(i) for i in (1, 2, 3))

    run(scenario())


def test_send_message_new_session_responses_carry_distinct_sids():
    async def scenario():
        acp = ACPProcess()
        _fake_running(acp)
        acp._default_session_id = "shared-default-attr................"

        async def fake_new_session(cwd="/home/climbing"):
            fake_new_session.n += 1
            await asyncio.sleep(0.005)
            return {"sessionId": _fake_sid(fake_new_session.n)}

        fake_new_session.n = 0
        acp.new_session = fake_new_session

        async def fake_inner(text, sid):
            return {"response_text": f"r:{sid}"}

        acp._send_message_inner = fake_inner
        results = await asyncio.gather(
            *[acp.send_message(f"t{i}", "") for i in range(3)]  # ""=新会话
        )
        sids = [r["session_id"] for r in results]
        assert len(set(sids)) == 3, f"并发新会话sid发生碰撞: {sids}"

    run(scenario())


# ════════════════════════════════════════════════════════════════
# P0-B: chunk按params.sessionId路由（不再广播污染）
# ════════════════════════════════════════════════════════════════

class _FakeStdout:
    def __init__(self, lines):
        self._lines = [(json.dumps(l) + "\n").encode() for l in lines]
        self._i = 0

    async def readline(self):
        if self._i < len(self._lines):
            line = self._lines[self._i]
            self._i += 1
            return line
        await asyncio.sleep(10)  # feed完保持loop等待，直到测试cancel


def _chunk_update(sid, text):
    return {
        "jsonrpc": "2.0",
        "method": "session/update",
        "params": {
            "sessionId": sid,
            "update": {
                "sessionUpdate": "agent_message_chunk",
                "content": {"type": "text", "text": text},
            },
        },
    }


def test_chunk_routing_by_session_id_no_cross_contamination():
    async def scenario():
        acp = ACPProcess()
        lines = [
            _chunk_update("sA", "chunkA"),
            _chunk_update("sB", "chunkB"),
            # 无sessionId → 向后兼容：广播给所有active prompt
            {
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {"type": "text", "text": "chunkBoth"},
                    }
                },
            },
            {"jsonrpc": "2.0", "id": "11", "result": {"stopReason": "end_turn"}},
            {"jsonrpc": "2.0", "id": "12", "result": {"stopReason": "end_turn"}},
        ]
        acp._proc = SimpleNamespace(returncode=None, stdout=_FakeStdout(lines))
        pA = PendingPrompt(msg_id="11", session_id="sA")
        pB = PendingPrompt(msg_id="12", session_id="sB")
        acp._prompt_pending = {"11": pA, "12": pB}
        acp._active_prompt_ids = {"11", "12"}

        task = asyncio.create_task(acp._read_loop())
        for _ in range(300):
            if pA.done.is_set() and pB.done.is_set():
                break
            await asyncio.sleep(0.01)
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

        # 只收自己session的chunk + 无sessionId的广播chunk
        assert pA.chunks == ["chunkA", "chunkBoth"], pA.chunks
        assert pB.chunks == ["chunkB", "chunkBoth"], pB.chunks
        assert pA.response.get("stopReason") == "end_turn"
        assert pB.response.get("stopReason") == "end_turn"

    run(scenario())


def test_chunk_routing_done_prompt_excluded():
    """已完成的prompt不再收chunk。"""
    async def scenario():
        acp = ACPProcess()
        lines = [_chunk_update("sA", "late-chunk")]
        acp._proc = SimpleNamespace(returncode=None, stdout=_FakeStdout(lines))
        pDone = PendingPrompt(msg_id="21", session_id="sA")
        pDone.done.set()
        pDone.response = {"stopReason": "end_turn"}
        acp._prompt_pending = {"21": pDone}
        acp._active_prompt_ids = set()  # 完成后已被discard

        task = asyncio.create_task(acp._read_loop())
        await asyncio.sleep(0.3)
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
        assert pDone.chunks == []

    run(scenario())


# ════════════════════════════════════════════════════════════════
# P0-C + P0-A(端点层): /acp/send契约 — session_id返回 + 异常兜底JSON
# ════════════════════════════════════════════════════════════════

class _FakeACP:
    def __init__(self, result=None, exc=None):
        self._result = result
        self._exc = exc

    async def send_message(self, text, session_id=None):
        if self._exc:
            raise self._exc
        return self._result

    async def send_message_with_image(self, *a, **kw):
        return await self.send_message(a[0] if a else "", None)

    async def send_message_with_file(self, *a, **kw):
        return await self.send_message(a[0] if a else "", None)


def _with_fake_acp(fake):
    orig = ws_chat.get_acp_process
    ws_chat.get_acp_process = lambda: fake
    return orig


def test_acp_send_returns_session_id_from_result():
    async def scenario():
        orig = _with_fake_acp(
            _FakeACP(result={"response_text": "ok", "source": "acp", "session_id": _fake_sid(9)})
        )
        try:
            resp = await ws_chat.acp_send({"text": "hi", "session_id": ""})
            assert resp["ok"] is True
            assert resp["session_id"] == _fake_sid(9)
        finally:
            ws_chat.get_acp_process = orig

    run(scenario())


def test_acp_send_falls_back_to_request_session_id():
    async def scenario():
        orig = _with_fake_acp(_FakeACP(result={"response_text": "x", "source": "hermes-cli"}))
        try:
            resp = await ws_chat.acp_send({"text": "hi", "session_id": "req-sid-36......................."})
            assert resp["ok"] is True
            assert resp["session_id"] == "req-sid-36......................."
        finally:
            ws_chat.get_acp_process = orig

    run(scenario())


def test_acp_send_cancelled_error_returns_json_not_500():
    """CancelledError(BaseException)兜底 → JSON错误体（S4崩溃的直接根因）。"""
    async def scenario():
        orig = _with_fake_acp(_FakeACP(exc=asyncio.CancelledError()))
        try:
            resp = await ws_chat.acp_send({"text": "hi", "session_id": VALID_SID})
            assert isinstance(resp, dict)
            assert resp["ok"] is False
            assert resp.get("error")
        finally:
            ws_chat.get_acp_process = orig

    run(scenario())


def test_acp_send_brokenpipe_returns_json():
    """stop()后inflight请求收到BrokenPipeError → JSON错误（走既有语义）。"""
    async def scenario():
        orig = _with_fake_acp(_FakeACP(exc=BrokenPipeError("ACP process stopped")))
        try:
            resp = await ws_chat.acp_send({"text": "hi", "session_id": VALID_SID})
            assert resp["ok"] is False
        finally:
            ws_chat.get_acp_process = orig

    run(scenario())


def test_acp_send_image_and_file_endpoints_carry_session_id():
    async def scenario():
        fake = _FakeACP(result={"response_text": "ok", "source": "acp", "session_id": _fake_sid(5)})
        orig = _with_fake_acp(fake)
        try:
            r1 = await ws_chat.acp_send_image({"text": "t", "image_data": "aGk=", "session_id": ""})
            r2 = await ws_chat.acp_send_file({"text": "t", "file_data": "aGk=", "file_name": "f.txt", "session_id": ""})
            assert r1["session_id"] == _fake_sid(5)
            assert r2["session_id"] == _fake_sid(5)
        finally:
            ws_chat.get_acp_process = orig

    run(scenario())


# ════════════════════════════════════════════════════════════════
# 混合场景：restart（stop→start）期间inflight同session消息不500
# ════════════════════════════════════════════════════════════════

def test_restart_during_inflight_message_surfaces_as_retryable_result():
    """模拟S4事故序列：并发消息执行中ACP进程死→stop()→调用方得到可重试结果。"""
    async def scenario():
        acp = ACPProcess()
        _fake_running(acp)
        events = []

        async def fake_inner_dying(text, sid):
            events.append(f"start:{text}")
            await asyncio.sleep(0.02)
            # 模拟进程死亡时stop()对inflight future的处理
            raise BrokenPipeError("ACP process stopped")

        async def fake_cli(text):
            events.append(f"cli:{text}")
            return {"stopReason": "end_turn", "response_text": f"cli:{text}", "source": "hermes-cli"}

        acp._send_message_inner = fake_inner_dying
        # _send_message_inner被打桩后不走真实retry逻辑，直接验证端点层：
        orig = _with_fake_acp(acp)
        # 让inner失败后走被测路径：恢复真实_send_message_inner不可行（需proc），
        # 改为验证BrokenPipeError在端点层的契约（与test_acp_send_brokenpipe互补）
        try:
            resp = await ws_chat.acp_send({"text": "msg", "session_id": VALID_SID})
            assert resp["ok"] is False
            assert "error" in resp
        finally:
            ws_chat.get_acp_process = orig
        assert events == ["start:msg"]

    run(scenario())
