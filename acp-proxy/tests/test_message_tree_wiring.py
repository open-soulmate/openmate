# -*- coding: utf-8 -*-
"""P0-10消息树parentId写路径接线测试 — acp-proxy侧

覆盖：
1. ws_chat._store_agent_message（/ws/chat agent_proxy路径持久化）：老schema自愈+
   parent=会话内上一条消息id线性链 + 会话间链独立 + 既有message_count行为不变
2. soulmate_agent._save_message（/ws/acp soulmate真实聊天路径持久化，:2201/:2793
   调用点共用方法）：同款parent链 + attachments列probe兼容
3. schema_doctor v6迁移：v1老库→v6（parent列+回填+索引）、v5 tool_error_logs
   回归保留、运行时probe先迁移后doctor幂等不崩、二次migrate up_to_date

无网络/无live server依赖：隔离SQLite + monkeypatch模块级DB路径。
"""
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ws_chat  # noqa: E402
from agent.schema_doctor import SchemaDoctor  # noqa: E402
from agent.soulmate_agent import SoulMateAgent  # noqa: E402

# schema_doctor v1精确老schema（无attachments/parent_message_id列）
OLD_DDL = [
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
        FOREIGN KEY (session_id) REFERENCES agent_sessions(id)
    )""",
]


def _connect(db_path) -> sqlite3.Connection:
    db = sqlite3.connect(str(db_path))
    db.row_factory = sqlite3.Row
    return db


def _make_old_db(tmp_path, sessions=("sess_a",)) -> str:
    db_path = str(tmp_path / "acp_tree.db")
    conn = sqlite3.connect(db_path)
    for ddl in OLD_DDL:
        conn.execute(ddl)
    for sid in sessions:
        conn.execute(
            "INSERT INTO agent_sessions (id, title, created_at, last_activity_at, message_count)"
            " VALUES (?, 'New Chat', 1000.0, 1000.0, 0)",
            (sid,),
        )
    conn.commit()
    conn.close()
    return db_path


def _parents(db_path, sid):
    conn = _connect(db_path)
    rows = conn.execute(
        "SELECT id, parent_message_id FROM agent_messages WHERE session_id = ? ORDER BY id",
        (sid,),
    ).fetchall()
    conn.close()
    return [(r["id"], r["parent_message_id"]) for r in rows]


class TestWsChatStoreMessage:
    def test_parent_chain_linear_on_old_schema(self, tmp_path, monkeypatch):
        db = _make_old_db(tmp_path)
        monkeypatch.setattr(ws_chat, "_OPENSOUL_DB", db)
        ws_chat._store_agent_message("sess_a", "user", "第一条")
        ws_chat._store_agent_message("sess_a", "assistant", "第二条")
        ws_chat._store_agent_message("sess_a", "user", "第三条")
        rows = _parents(db, "sess_a")
        assert len(rows) == 3
        ids = [r[0] for r in rows]
        assert [r[1] for r in rows] == [None, ids[0], ids[1]]  # 线性主干链

    def test_sessions_have_independent_chains(self, tmp_path, monkeypatch):
        db = _make_old_db(tmp_path, sessions=("sess_a", "sess_b"))
        monkeypatch.setattr(ws_chat, "_OPENSOUL_DB", db)
        ws_chat._store_agent_message("sess_a", "user", "a1")
        ws_chat._store_agent_message("sess_b", "user", "b1")
        ws_chat._store_agent_message("sess_a", "assistant", "a2")
        rows_a = _parents(db, "sess_a")
        rows_b = _parents(db, "sess_b")
        assert rows_a[0][1] is None  # 各会话链独立，b1不会接到a1后面
        assert rows_b[0][1] is None
        assert rows_a[1][1] == rows_a[0][0]

    def test_message_count_behavior_preserved(self, tmp_path, monkeypatch):
        """既有行为回归：message_count/last_activity_at更新不因parent改动丢失"""
        db = _make_old_db(tmp_path)
        monkeypatch.setattr(ws_chat, "_OPENSOUL_DB", db)
        for i in range(3):
            ws_chat._store_agent_message("sess_a", "user", f"m{i}")
        conn = _connect(db)
        row = conn.execute(
            "SELECT message_count FROM agent_sessions WHERE id='sess_a'"
        ).fetchone()
        conn.close()
        assert row["message_count"] == 3

    def test_probe_adds_parent_column_to_old_schema(self, tmp_path, monkeypatch):
        db = _make_old_db(tmp_path)
        monkeypatch.setattr(ws_chat, "_OPENSOUL_DB", db)
        ws_chat._store_agent_message("sess_a", "user", "x")
        conn = _connect(db)
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(agent_messages)")]
        conn.close()
        assert "parent_message_id" in cols


class TestSoulmateSaveMessage:
    def _agent(self, db_path) -> SoulMateAgent:
        """__new__级别最小实例：只挂_db_path，调用生产方法体_save_message"""
        obj = SoulMateAgent.__new__(SoulMateAgent)
        obj._db_path = Path(db_path)
        return obj

    def test_parent_chain_linear_on_old_schema(self, tmp_path):
        db = _make_old_db(tmp_path)
        agent = self._agent(db)
        agent._save_message("sess_a", "user", "你好")
        agent._save_message("sess_a", "assistant", "回复", attachments=None)
        agent._save_message("sess_a", "user", "继续")
        rows = _parents(db, "sess_a")
        ids = [r[0] for r in rows]
        assert [r[1] for r in rows] == [None, ids[0], ids[1]]

    def test_attachments_and_parent_columns_coexist(self, tmp_path):
        db = _make_old_db(tmp_path)
        agent = self._agent(db)
        agent._save_message("sess_a", "user", "带附件", attachments='[{"type":"file"}]')
        conn = _connect(db)
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(agent_messages)")]
        row = conn.execute(
            "SELECT attachments, parent_message_id FROM agent_messages WHERE session_id='sess_a'"
        ).fetchone()
        conn.close()
        assert "attachments" in cols and "parent_message_id" in cols
        assert row["attachments"] == '[{"type":"file"}]'
        assert row["parent_message_id"] is None


class TestSchemaDoctorV6:
    def test_migrate_v1_to_v6_adds_parent_and_backfills(self, tmp_path):
        db = _make_old_db(tmp_path)
        conn = sqlite3.connect(db)
        for i in range(3):
            conn.execute(
                "INSERT INTO agent_messages (session_id, role, content, timestamp)"
                " VALUES ('sess_a', 'user', ?, 1.0)",
                (f"m{i}",),
            )
        conn.commit()
        conn.close()
        doctor = SchemaDoctor(db_path=db)
        result = doctor.migrate()
        assert result["status"] == "migrated"
        # v7（kilocode #9记忆marker）起CURRENT_VERSION=7；本用例覆盖v1→全量迁移
        assert SchemaDoctor.CURRENT_VERSION == 7
        conn = _connect(db)
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(agent_messages)")]
        assert "parent_message_id" in cols
        assert "metadata" in cols  # v7记忆marker列
        rows = conn.execute(
            "SELECT id, parent_message_id FROM agent_messages ORDER BY id"
        ).fetchall()
        ids = [r["id"] for r in rows]
        assert [r["parent_message_id"] for r in rows] == [None, ids[0], ids[1]]
        # v5回归保留：tool_error_logs表仍被创建
        tables = [
            r["name"]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='tool_error_logs'"
            )
        ]
        assert "tool_error_logs" in tables
        # v6索引存在
        idx = [
            r["name"]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_messages_parent'"
            )
        ]
        assert "idx_messages_parent" in idx
        conn.close()

    def test_migrate_idempotent_after_runtime_probe(self, tmp_path):
        """运行时probe（ws_chat路径）先迁移了列 → doctor.migrate不因duplicate column崩"""
        db = _make_old_db(tmp_path)
        monkey_db = db
        # 模拟运行时写路径先行迁移
        conn = sqlite3.connect(monkey_db)
        conn.execute("ALTER TABLE agent_messages ADD COLUMN parent_message_id TEXT")
        conn.commit()
        conn.close()
        doctor = SchemaDoctor(db_path=db)
        result = doctor.migrate()
        assert result["status"] == "migrated"
        result2 = doctor.migrate()
        assert result2["status"] == "up_to_date"

    def test_check_reports_target_version(self, tmp_path):
        db = _make_old_db(tmp_path)
        doctor = SchemaDoctor(db_path=db)
        status = doctor.check()
        assert status["target_version"] == 7  # v7记忆marker
        assert status["needs_migration"] is True
