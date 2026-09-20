# -*- coding: utf-8 -*-
"""/ws/acp真实聊天路径 stale-session 自愈测试（遗留#1闭环）

基线缺陷（/tmp/ws_recovery_e2e.py 修复前live实证）：
- 新ws连接（=子进程重启等价场景）+ 旧sid session/prompt → stopReason=refusal + 0 chunk
  = OpenMate聊天页消息静默空白（用户无法区分"agent没说话"和"系统坏了"）
- 完全不存在的sid → 同样静默refusal，无可见原因

本轮改动：
1. soulmate_agent新增 _reload_session_from_db()/_session_has_messages()：
   内存miss时从SQLite恢复（d439f163 /acp/send HTTP路径同款恢复落地到agent侧）
   恢复条件=agent_sessions有行 OR agent_messages有消息（ws直建会话无sessions行）
2. prompt()/_prompt_inner：未知sid先自愈恢复；真不存在→_notify_client可见失败+refusal
3. load_session()/resume_session()：内存miss时同样从DB恢复（ACP标准恢复契约可用）
4. ws_acp.py：_extract_acp_session_id捕获session/new响应sid；子进程重启后
   重放initialize+session/load（proxy侧连续性恢复，失败不炸、prompt侧仍自愈）
"""
import asyncio
import sqlite3
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from acp.schema import LoadSessionResponse, PromptResponse, ResumeSessionResponse
from agent.soulmate_agent import SoulMateAgent
from tests.test_steering import make_agent
from ws_acp import _extract_acp_session_id


def run(coro):
    return asyncio.run(coro)


def _setup_db(tmp_path) -> Path:
    """隔离SQLite：与agent真实schema对齐（agent_sessions/agent_messages）"""
    db_path = Path(tmp_path) / "opensoul.db"
    db = sqlite3.connect(db_path)
    db.execute(
        "CREATE TABLE IF NOT EXISTS agent_sessions "
        "(id TEXT PRIMARY KEY, message_count INTEGER DEFAULT 0, last_activity_at REAL)"
    )
    db.execute(
        "CREATE TABLE IF NOT EXISTS agent_messages "
        "(id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, "
        "content TEXT, timestamp REAL, attachments TEXT)"
    )
    db.commit()
    db.close()
    return db_path


def _seed_session(db_path: Path, sid: str, with_session_row: bool = True):
    db = sqlite3.connect(db_path)
    if with_session_row:
        db.execute(
            "INSERT INTO agent_sessions (id, message_count, last_activity_at) VALUES (?, 2, 0)",
            (sid,),
        )
    db.execute(
        "INSERT INTO agent_messages (session_id, role, content, timestamp) VALUES (?, 'user', '请记住暗号是7491', 0)",
        (sid,),
    )
    db.execute(
        "INSERT INTO agent_messages (session_id, role, content, timestamp) VALUES (?, 'assistant', '已记住', 0)",
        (sid,),
    )
    db.commit()
    db.close()


def _fresh_process_agent(tmp_path) -> SoulMateAgent:
    """模拟子进程重启后的agent：内存sessions为空，_db_path指向隔离库"""
    agent = make_agent(tmp_path, acquired=True)
    agent.sessions = {}  # 重启后内存清空
    agent._db_path = _setup_db(tmp_path)
    agent._project_root = "/tmp"
    return agent


class TestReloadSessionFromDb:
    """_reload_session_from_db：SQLite→内存恢复核心"""

    def test_recovers_session_with_agent_sessions_row(self, tmp_path):
        agent = _fresh_process_agent(tmp_path)
        _seed_session(agent._db_path, "om-test00000001", with_session_row=True)
        sess = agent._reload_session_from_db("om-test00000001")
        assert sess is not None
        assert sess["session_id"] == "om-test00000001"
        assert len(sess["messages"]) == 2
        assert sess["messages"][0]["content"] == "请记住暗号是7491"
        assert agent._session_cwds["om-test00000001"] == "/tmp"

    def test_recovers_messages_only_session(self, tmp_path):
        """ws直建会话没有agent_sessions行，但消息已落盘——必须可恢复（基线实证场景）"""
        agent = _fresh_process_agent(tmp_path)
        _seed_session(agent._db_path, "om-msgonly0001", with_session_row=False)
        assert agent._session_exists_in_db("om-msgonly0001") is False
        assert agent._session_has_messages("om-msgonly0001") is True
        sess = agent._reload_session_from_db("om-msgonly0001")
        assert sess is not None
        assert len(sess["messages"]) == 2

    def test_unknown_session_returns_none(self, tmp_path):
        agent = _fresh_process_agent(tmp_path)
        assert agent._reload_session_from_db("om-nosuch00001") is None
        assert "om-nosuch00001" not in agent.sessions


class TestPromptStaleSessionHeal:
    """prompt()真实消息路径：stale sid自愈 + 可见失败契约"""

    def _stub_inner(self, agent):
        captured = {}

        async def fake_inner(prompt, session_id, message_id=None, **kw):
            captured["session_id"] = session_id
            captured["session_state"] = agent.sessions.get(session_id)
            return PromptResponse(stop_reason="end_turn")

        agent._prompt_inner = fake_inner
        return captured

    def test_stale_sid_prompt_recovers_and_proceeds(self, tmp_path):
        """重启后stale sid → DB恢复 → 正常进入prompt处理（不再静默refusal）"""
        agent = _fresh_process_agent(tmp_path)
        _seed_session(agent._db_path, "om-stale000001", with_session_row=True)
        captured = self._stub_inner(agent)
        resp = run(agent.prompt([SimpleNamespace(text="暗号是多少")], "om-stale000001"))
        assert resp.stop_reason == "end_turn"  # 基线是refusal
        assert captured["session_state"] is not None
        assert len(captured["session_state"]["messages"]) == 2  # 历史已恢复

    def test_stale_sid_messages_only_recovery(self, tmp_path):
        agent = _fresh_process_agent(tmp_path)
        _seed_session(agent._db_path, "om-msgonly0002", with_session_row=False)
        captured = self._stub_inner(agent)
        resp = run(agent.prompt([SimpleNamespace(text="hi")], "om-msgonly0002"))
        assert resp.stop_reason == "end_turn"
        assert captured["session_state"] is not None

    def test_unknown_sid_visible_refusal(self, tmp_path):
        """DB也没有 → refusal + 用户可见失败通知（AIHawk：禁止静默）"""
        agent = _fresh_process_agent(tmp_path)
        notes = []

        async def fake_notify(session_id, text):
            notes.append((session_id, text))

        agent._notify_client = fake_notify
        resp = run(agent.prompt([SimpleNamespace(text="hi")], "om-deadbeef0000"))
        assert resp.stop_reason == "refusal"
        assert len(notes) == 1
        assert notes[0][0] == "om-deadbeef0000"
        assert "会话已失效" in notes[0][1]

    def test_normal_session_untouched(self, tmp_path):
        """回归：内存已有的session不触发DB查询路径"""
        agent = _fresh_process_agent(tmp_path)
        agent.sessions["s1"] = {"session_id": "s1", "messages": [], "workspace": "/tmp"}
        captured = self._stub_inner(agent)
        resp = run(agent.prompt([SimpleNamespace(text="hi")], "s1"))
        assert resp.stop_reason == "end_turn"
        assert captured["session_state"]["session_id"] == "s1"


class TestLoadResumeSessionRecovery:
    """ACP标准恢复契约：load_session/resume_session跨进程可用"""

    def test_load_session_recovers_from_db(self, tmp_path):
        agent = _fresh_process_agent(tmp_path)
        _seed_session(agent._db_path, "om-load0000001", with_session_row=True)
        resp = run(agent.load_session("/", "om-load0000001"))
        assert isinstance(resp, LoadSessionResponse)
        assert len(agent.sessions["om-load0000001"]["messages"]) == 2

    def test_load_session_unknown_returns_none(self, tmp_path):
        agent = _fresh_process_agent(tmp_path)
        assert run(agent.load_session("/", "om-nosuch00002")) is None

    def test_resume_session_recovers_from_db(self, tmp_path):
        agent = _fresh_process_agent(tmp_path)
        _seed_session(agent._db_path, "om-resume00001", with_session_row=False)
        resp = run(agent.resume_session("/", "om-resume00001"))
        assert isinstance(resp, ResumeSessionResponse)
        assert "om-resume00001" in agent.sessions

    def test_resume_session_unknown_returns_none(self, tmp_path):
        agent = _fresh_process_agent(tmp_path)
        assert run(agent.resume_session("/", "om-nosuch00003")) is None


class TestExtractAcpSessionId:
    """ws_acp._extract_acp_session_id：session/new响应sid捕获（重启重放前提）"""

    def test_extracts_camel_case_session_id(self):
        parsed = {"jsonrpc": "2.0", "id": 2, "result": {"sessionId": "om-abc123"}}
        assert _extract_acp_session_id(parsed, 2) == "om-abc123"

    def test_extracts_snake_case_session_id(self):
        parsed = {"id": 5, "result": {"session_id": "om-def456"}}
        assert _extract_acp_session_id(parsed, 5) == "om-def456"

    def test_wrong_id_returns_none(self):
        parsed = {"id": 3, "result": {"sessionId": "om-abc123"}}
        assert _extract_acp_session_id(parsed, 2) is None

    def test_none_session_new_id_returns_none(self):
        parsed = {"id": None, "result": {"sessionId": "om-abc123"}}
        assert _extract_acp_session_id(parsed, None) is None

    def test_error_response_returns_none(self):
        parsed = {"id": 2, "error": {"code": -32603, "message": "boom"}}
        assert _extract_acp_session_id(parsed, 2) is None

    def test_prompt_response_not_captured(self):
        """prompt响应（无sessionId字段）不会污染捕获"""
        parsed = {"id": 2, "result": {"stopReason": "end_turn"}}
        assert _extract_acp_session_id(parsed, 2) is None
