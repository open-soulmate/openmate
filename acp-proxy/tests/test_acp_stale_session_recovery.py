"""P0回归测试：/acp/send空响应修复 — 过期session恢复 + 空响应显式失败标记。

根因（2026-09-20 live实证）：adapter对不存在的session返回stopReason=refusal
+0 chunks（stderr "prompt: session xxx not found"）；旧代码_prompt_parts无条件
设response_text=""，_send_message_inner用`is not None`判断永真 → CLI fallback
死代码 → 客户端收到 {"ok":true,"content":""} 静默空响应。

修复契约：
1. _prompt_parts：空chunks → response_text=None + empty_response=True + stop_reason
2. _send_message_inner：ACP空响应 → 过期session恢复（new_session+重发，
   返回新sid+recovered_from_stale_session标记）→ CLI兜底（结果带session_id）
3. 管道异常（BrokenPipe/timeout）不触发恢复（那是restart路径的职责）
4. HTTP端点response_text None-safe + recovered标记透传
"""

import asyncio
import json
from types import SimpleNamespace

import pytest

from proxy import ACPProcess, PendingPrompt
from ws_chat import acp_send

SID_OLD = "aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000"
SID_NEW = "11111111-2222-3333-4444-555566667777"


def run(coro):
    # asyncio.run每次新建loop——get_event_loop()在全量套件中会因先前
    # 测试模块的loop策略状态抛RuntimeError（单独跑时不暴露）。
    return asyncio.run(coro)


class _FakeStdout:
    def __init__(self, lines):
        self._lines = [(json.dumps(l) + "\n").encode() for l in lines]
        self._i = 0

    async def readline(self):
        if self._i < len(self._lines):
            line = self._lines[self._i]
            self._i += 1
            return line
        await asyncio.sleep(10)


class _FakeStdin:
    def __init__(self):
        self.written = []

    def write(self, data):
        self.written.append(data)

    async def drain(self):
        return None

    def is_closing(self):
        return False


# ════════════════════════════════════════════════════════════════
# 1. _prompt_parts：空响应 → 显式失败契约（response_text=None）
# ════════════════════════════════════════════════════════════════

def test_prompt_parts_empty_chunks_marks_failed(monkeypatch):
    """refusal+0 chunks → response_text=None + empty_response + stop_reason。"""
    async def scenario():
        acp = ACPProcess()
        acp._msg_id = 5  # 下一个prompt将用id=6
        lines = [
            {"jsonrpc": "2.0", "id": "6", "result": {"stopReason": "refusal"}},
        ]
        acp._proc = SimpleNamespace(
            returncode=None, stdout=_FakeStdout(lines), stdin=_FakeStdin()
        )
        acp._initialized = True
        task = asyncio.create_task(acp._read_loop())
        result = await acp._prompt_parts([{"type": "text", "text": "hi"}], SID_OLD)
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
        assert result.get("response_text") is None, result
        assert result.get("empty_response") is True, result
        assert result.get("stop_reason") == "refusal", result

    run(scenario())


def test_prompt_parts_nonempty_chunks_unchanged(monkeypatch):
    """正常响应契约不变：response_text=拼接内容，无empty_response标记。"""
    async def scenario():
        acp = ACPProcess()
        acp._msg_id = 10  # 下一个prompt用id=11
        lines = [
            {
                "jsonrpc": "2.0", "method": "session/update",
                "params": {
                    "sessionId": SID_NEW,
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {"type": "text", "text": "hello-世界"},
                    },
                },
            },
            {"jsonrpc": "2.0", "id": "11", "result": {"stopReason": "end_turn"}},
        ]
        acp._proc = SimpleNamespace(
            returncode=None, stdout=_FakeStdout(lines), stdin=_FakeStdin()
        )
        acp._initialized = True
        task = asyncio.create_task(acp._read_loop())
        result = await acp._prompt_parts([{"type": "text", "text": "hi"}], SID_NEW)
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
        assert result.get("response_text") == "hello-世界", result
        assert "empty_response" not in result, result

    run(scenario())


# ════════════════════════════════════════════════════════════════
# 2. _send_message_inner：过期session恢复
# ════════════════════════════════════════════════════════════════

def _make_acp_for_recovery(prompt_results):
    """prompt_results: list，每次_prompt调用弹出一个（dict或Exception）。"""
    acp = ACPProcess()
    calls = {"prompt": [], "new_session": 0, "cli": []}

    async def fake_prompt(text, sid):
        calls["prompt"].append(sid)
        item = prompt_results.pop(0)
        if isinstance(item, Exception):
            raise item
        return dict(item)

    async def fake_new_session():
        calls["new_session"] += 1
        acp._default_session_id = SID_NEW
        return {"sessionId": SID_NEW}

    async def fake_cli(text):
        calls["cli"].append(text)
        return {"stopReason": "end_turn", "response_text": f"cli:{text}", "source": "hermes-cli"}

    acp._prompt = fake_prompt
    acp.new_session = fake_new_session
    acp._cli = fake_cli
    return acp, calls


def test_stale_session_recovers_with_fresh_session_and_marker():
    """旧session空响应 → 恢复：新session重发成功+标记+新sid。

    注意：inner循环对空响应attempt0即break（外层send_message另有重试），
    恢复块直接接管。"""
    async def scenario():
        acp, calls = _make_acp_for_recovery([
            {"response_text": None, "stop_reason": "refusal", "empty_response": True},
            {"response_text": "recovered-answer", "source": "acp"},  # fresh session重发
        ])
        result = await acp._send_message_inner("hello", SID_OLD)
        assert result["response_text"] == "recovered-answer", result
        assert result["session_id"] == SID_NEW, result
        assert result.get("recovered_from_stale_session") == SID_OLD, result
        # 1次旧sid空响应 + 1次新sid恢复重发
        assert calls["prompt"] == [SID_OLD, SID_NEW], calls["prompt"]
        assert calls["new_session"] == 1
        # 恢复成功 → 不应触发CLI兜底
        assert calls["cli"] == []

    run(scenario())


def test_stale_session_recovery_failure_falls_back_to_cli_with_sid():
    """恢复后fresh session仍空 → CLI兜底，结果携带session_id。"""
    async def scenario():
        acp, calls = _make_acp_for_recovery([
            {"response_text": None, "stop_reason": "refusal", "empty_response": True},
            {"response_text": None, "stop_reason": "refusal", "empty_response": True},
            {"response_text": None, "stop_reason": "refusal", "empty_response": True},
        ])
        result = await acp._send_message_inner("hello", SID_OLD)
        assert result["response_text"] == "cli:hello", result
        assert result["source"] == "hermes-cli", result
        assert result["session_id"] == SID_NEW, result  # fresh session sid，客户端续接
        assert calls["cli"] == ["hello"]

    run(scenario())


def test_pipe_error_path_does_not_trigger_stale_recovery():
    """BrokenPipe异常路径：restart路径负责session重建，stale恢复块不触发。

    区分依据：restart路径prompt调用=[OLD, NEW]共2次+new_session=1次
    （restart流程自带）；若stale恢复块错误触发，会有第3次prompt+第2次
    new_session。"""
    async def scenario():
        acp, calls = _make_acp_for_recovery([
            BrokenPipeError("pipe gone"),
            BrokenPipeError("pipe gone"),
        ])

        async def fake_restart():
            return None

        acp._restart = fake_restart
        result = await acp._send_message_inner("hello", SID_OLD)
        assert result["response_text"] == "cli:hello", result
        # restart路径：attempt0失败→restart+new_session+sid=NEW→attempt1失败→CLI
        assert calls["prompt"] == [SID_OLD, SID_NEW], calls["prompt"]
        assert calls["new_session"] == 1, calls["new_session"]
        assert result["session_id"] == SID_NEW  # restart路径已重建session

    run(scenario())

# ════════════════════════════════════════════════════════════════
# 2b. 恢复策略收紧（2026-09-20晚轮）：仅stale签名(refusal)触发恢复
# ════════════════════════════════════════════════════════════════

def test_empty_non_refusal_response_skips_stale_recovery():
    """收紧契约：空响应但stop_reason非stale签名（如end_turn空文本/仅tool-call
    回合）→ 不触发new_session（有效session上下文不被销毁），CLI兜底且结果
    显式携带acp_recovery_skipped+acp_stop_reason标记（AIHawk显式标记原则），
    session_id保持原值（客户端继续用原会话，不失上下文）。"""
    async def scenario():
        acp, calls = _make_acp_for_recovery([
            {"response_text": None, "stop_reason": "end_turn", "empty_response": True},
        ])
        result = await acp._send_message_inner("hello", SID_OLD)
        assert result["response_text"] == "cli:hello", result
        # 核心收紧语义：非stale签名不得销毁session重建
        assert calls["new_session"] == 0, f"非stale签名不应触发new_session: {calls}"
        assert calls["prompt"] == [SID_OLD], calls["prompt"]
        # 原session保留，客户端不失上下文
        assert result["session_id"] == SID_OLD, result
        # 失败/决策必须显式可见，禁止静默降级
        assert result.get("acp_empty_response") is True, result
        assert result.get("acp_recovery_skipped") is True, result
        assert result.get("acp_stop_reason") == "end_turn", result

    run(scenario())

def test_empty_missing_stop_reason_skips_stale_recovery():
    """收紧契约：空响应且stop_reason缺失（""→None）→ 同样跳过恢复。
    依据：live实证stale签名恒为refusal（stderr "session not found"），
    缺失签名按非stale处理但标记可见。"""
    async def scenario():
        acp, calls = _make_acp_for_recovery([
            {"response_text": None, "stop_reason": "", "empty_response": True},
        ])
        result = await acp._send_message_inner("hello", SID_OLD)
        assert result["response_text"] == "cli:hello", result
        assert calls["new_session"] == 0, calls
        assert result["session_id"] == SID_OLD, result
        assert result.get("acp_recovery_skipped") is True, result
        assert result.get("acp_stop_reason") is None, result  # ""归一为None

    run(scenario())

def test_refusal_recovery_failure_cli_result_has_visibility_markers():
    """收紧后回归：refusal签名仍触发恢复（new_session=1次）；恢复失败走
    CLI兜底时结果携带acp_empty_response+acp_stop_reason=refusal，但
    acp_recovery_skipped不置位（恢复被尝试过，不是被跳过）。"""
    async def scenario():
        acp, calls = _make_acp_for_recovery([
            {"response_text": None, "stop_reason": "refusal", "empty_response": True},
            {"response_text": None, "stop_reason": "refusal", "empty_response": True},
        ])
        result = await acp._send_message_inner("hello", SID_OLD)
        assert result["response_text"] == "cli:hello", result
        # refusal签名：恢复必须被尝试（旧session→new_session→重发）
        assert calls["new_session"] == 1, calls
        assert calls["prompt"] == [SID_OLD, SID_NEW], calls["prompt"]
        # fresh session sid，客户端续接（既有契约不变）
        assert result["session_id"] == SID_NEW, result
        # 可见性标记：ACP空响应已发生+stop_reason=refusal；非"跳过"
        assert result.get("acp_empty_response") is True, result
        assert result.get("acp_stop_reason") == "refusal", result
        assert not result.get("acp_recovery_skipped"), result

    run(scenario())

def test_acp_send_endpoint_passthrough_of_tightening_markers(monkeypatch):
    """HTTP端点透传收紧标记：acp_empty_response/acp_recovery_skipped/
    acp_stop_reason三字段到达客户端响应。"""
    class _FakeACP:
        async def send_message(self, text, session_id=None):
            return {
                "response_text": "cli:fallback",
                "source": "hermes-cli",
                "session_id": SID_OLD,
                "acp_empty_response": True,
                "acp_recovery_skipped": True,
                "acp_stop_reason": "end_turn",
            }

    monkeypatch.setattr("ws_chat.get_acp_process", lambda: _FakeACP())
    resp = run(acp_send({"text": "hi", "session_id": SID_OLD}))
    assert resp["ok"] is True
    assert resp["acp_empty_response"] is True, resp
    assert resp["acp_recovery_skipped"] is True, resp
    assert resp["acp_stop_reason"] == "end_turn", resp
    # 原session保留（收紧语义：非stale签名不换session）
    assert resp["session_id"] == SID_OLD, resp


# ════════════════════════════════════════════════════════════════
# 3. HTTP端点：None-safe content + recovered标记透传
# ════════════════════════════════════════════════════════════════

def test_acp_send_endpoint_none_safe_and_marker_passthrough(monkeypatch):
    class _FakeACP:
        async def send_message(self, text, session_id=None):
            return {
                "response_text": "real answer",
                "source": "acp",
                "session_id": SID_NEW,
                "recovered_from_stale_session": SID_OLD,
            }

    monkeypatch.setattr("ws_chat.get_acp_process", lambda: _FakeACP())
    resp = run(acp_send({"text": "hi", "session_id": SID_OLD}))
    assert resp["ok"] is True
    assert resp["content"] == "real answer"
    # 过期session恢复：响应携带NEW session_id（客户端重新绑定依据）
    assert resp["session_id"] == SID_NEW
    assert resp["recovered_from_stale_session"] == SID_OLD


def test_acp_send_endpoint_none_content_coalesces_to_empty_string(monkeypatch):
    """response_text=None（恢复/CLI全失败的极端情况）→ JSON content=""，绝不为null。"""
    class _FakeACP:
        async def send_message(self, text, session_id=None):
            return {"response_text": None, "source": "acp", "session_id": SID_OLD}

    monkeypatch.setattr("ws_chat.get_acp_process", lambda: _FakeACP())
    resp = run(acp_send({"text": "hi", "session_id": SID_OLD}))
    assert resp["content"] == "", resp
    assert resp["recovered_from_stale_session"] is None
