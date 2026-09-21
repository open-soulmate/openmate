# -*- coding: utf-8 -*-
"""pi切分支摘要LLM上下文注入接线测试 — acp-proxy soulmate_agent侧（P0-10遗留#1）

覆盖：
1. _load_messages_from_db：会话带agent_branch_summaries行时，pi语义
   BRANCH_SUMMARY_PREAMBLE上下文注记前置注入（messages[0]），原消息保序跟后
2. 无摘要/表不存在：零注入零影响（既有行为回归）
3. 注入只进内存上下文：不落agent_messages（不污染持久化契约）
4. _reload_session_from_db真实恢复路径：恢复出的session['messages']携带注入

无网络/live server依赖：隔离SQLite + __new__级别最小实例（test_message_tree_wiring同款）。
"""
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.soulmate_agent import SoulMateAgent  # noqa: E402

DDL = [
    """CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at REAL,
        last_activity_at REAL,
        message_count INTEGER DEFAULT 0,
        metadata TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS agent_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        role TEXT,
        content TEXT,
        timestamp REAL,
        parent_message_id INTEGER
    )""",
    """CREATE TABLE IF NOT EXISTS agent_branch_summaries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        source_session_id TEXT,
        from_message_id TEXT NOT NULL,
        target_message_id TEXT NOT NULL,
        common_ancestor_id TEXT,
        summary TEXT NOT NULL,
        read_files TEXT,
        modified_files TEXT,
        tool_ops TEXT,
        entries_count INTEGER DEFAULT 0,
        summarizer TEXT,
        source TEXT,
        created_at REAL
    )""",
]

PI_PREAMBLE = "The user explored a different conversation branch before returning here."


def _connect(db_path) -> sqlite3.Connection:
    db = sqlite3.connect(str(db_path))
    db.row_factory = sqlite3.Row
    return db


def _make_db(tmp_path, with_summary=None, with_summary_table=True) -> str:
    """with_summary=(session_id, summary_text)时写入一条branch summary。"""
    db_path = str(tmp_path / "acp_branch.db")
    conn = sqlite3.connect(db_path)
    for ddl in DDL:
        if "agent_branch_summaries" in ddl and not with_summary_table:
            continue
        conn.execute(ddl)
    conn.execute(
        "INSERT INTO agent_sessions (id, title, created_at, last_activity_at, message_count)"
        " VALUES ('sess_a', 'New Chat', 1000.0, 1000.0, 0)"
    )
    for i, (role, content) in enumerate([("user", "问题一"), ("assistant", "回答一")]):
        conn.execute(
            "INSERT INTO agent_messages (session_id, role, content, timestamp) "
            "VALUES ('sess_a', ?, ?, ?)",
            (role, content, float(i)),
        )
    if with_summary:
        sid, text = with_summary
        conn.execute(
            "INSERT INTO agent_branch_summaries "
            "(id, session_id, from_message_id, target_message_id, summary, created_at) "
            "VALUES (?, ?, '9', '4', ?, ?)",
            (f"branchsum:{sid}:9:4", sid, text, time.time()),
        )
    conn.commit()
    conn.close()
    return db_path


def _agent(db_path) -> SoulMateAgent:
    """__new__级别最小实例：只挂_db_path，调用生产方法体（wiring测试同款模式）"""
    obj = SoulMateAgent.__new__(SoulMateAgent)
    obj._db_path = Path(db_path)
    return obj


class TestBranchSummaryInjection:
    def test_pi_note_injected_first(self, tmp_path):
        db = _make_db(tmp_path, with_summary=("sess_a", "用户在另一分支测试了登录流程"))
        agent = _agent(db)
        messages = agent._load_messages_from_db("sess_a")
        assert len(messages) == 3  # 2真实消息 + 1注入注记
        first = messages[0]
        assert first["role"] == "user"
        assert first["content"].startswith("[会话分支上下文 — 系统注入，非用户发言]")
        assert PI_PREAMBLE in first["content"]  # pi原文preamble
        assert "用户在另一分支测试了登录流程" in first["content"]
        # 原消息保序跟随
        assert messages[1]["content"] == "问题一"
        assert messages[2]["content"] == "回答一"

    def test_no_summary_zero_injection(self, tmp_path):
        """既有行为回归：无摘要会话消息加载与改动前完全一致"""
        db = _make_db(tmp_path, with_summary=None)
        agent = _agent(db)
        messages = agent._load_messages_from_db("sess_a")
        assert messages == [
            {"role": "user", "content": "问题一"},
            {"role": "assistant", "content": "回答一"},
        ]

    def test_missing_table_zero_injection(self, tmp_path):
        """agent_branch_summaries表不存在（老部署）：零注入不报错"""
        db = _make_db(tmp_path, with_summary=None, with_summary_table=False)
        agent = _agent(db)
        messages = agent._load_messages_from_db("sess_a")
        assert len(messages) == 2
        assert messages[0]["content"] == "问题一"

    def test_other_session_summary_not_leaked(self, tmp_path):
        db = _make_db(tmp_path, with_summary=("other_session", "别的会话的摘要"))
        agent = _agent(db)
        messages = agent._load_messages_from_db("sess_a")
        assert len(messages) == 2  # 不跨会话泄漏摘要

    def test_injection_not_persisted_to_agent_messages(self, tmp_path):
        """注入只进内存上下文：agent_messages不新增行（持久化契约不受污染）"""
        db = _make_db(tmp_path, with_summary=("sess_a", "摘要内容"))
        agent = _agent(db)
        agent._load_messages_from_db("sess_a")
        conn = _connect(db)
        count = conn.execute(
            "SELECT COUNT(*) FROM agent_messages WHERE session_id='sess_a'"
        ).fetchone()[0]
        conn.close()
        assert count == 2  # 注入未落盘

    def test_multiple_summaries_joined(self, tmp_path):
        db = _make_db(tmp_path, with_summary=("sess_a", "分支摘要A"))
        conn = _connect(db)
        conn.execute(
            "INSERT INTO agent_branch_summaries "
            "(id, session_id, from_message_id, target_message_id, summary, created_at) "
            "VALUES ('branchsum:sess_a:8:3', 'sess_a', '8', '3', '分支摘要B', ?)",
            (time.time() + 1,),
        )
        conn.commit()
        conn.close()
        agent = _agent(db)
        messages = agent._load_messages_from_db("sess_a")
        note = messages[0]["content"]
        assert "分支摘要A" in note and "分支摘要B" in note
        assert "\n\n---\n\n" in note  # pi多摘要分隔
        assert len(messages) == 3  # 多摘要合并为单条注记

    def test_reload_session_path_carries_injection(self, tmp_path):
        """_reload_session_from_db（/ws/acp stale-session真实恢复路径）携带注入"""
        db = _make_db(tmp_path, with_summary=("sess_a", "被离开分支的上下文"))
        agent = _agent(db)
        agent._project_root = "/tmp"
        agent.sessions = {}
        agent._session_cwds = {}
        recovered = agent._reload_session_from_db("sess_a")
        assert recovered is not None
        messages = recovered["messages"]
        assert messages[0]["role"] == "user"
        assert PI_PREAMBLE in messages[0]["content"]
        assert len(messages) == 3
