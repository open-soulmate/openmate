# -*- coding: utf-8 -*-
"""kilocode #9 记忆marker留痕测试（marker.ts + marker-meta.ts移植语义）。

调研来源：kilocode-source-supplement3.md #9——recall命中后在assistant消息插
空文本synthetic+ignored part携带metadata(kiloMemory:{type,bytes,tokens,count,
files})：不进LLM上下文（ignored），消息级可审计，UI可显示"本回复用了记忆"badge。
items受verbose门控（默认不外泄记忆内容片段）；LIMIT=5/CHARS=120按码点截断。
"""

import inspect
import json
import sqlite3
from pathlib import Path

from agent.memory_marker import (
    TYPE_RECALL,
    TYPE_STARTUP,
    from_recall,
    metadata,
    metadata_json,
)
from agent.soulmate_agent import SoulMateAgent
from agent.token_attribution import estimate_tokens

# 与test_message_tree_wiring.py同款：迁移前的老schema（无attachments/
# parent_message_id/metadata列）——验证probe+ALTER自愈
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


def _make_old_db(tmp_path) -> str:
    db_path = str(tmp_path / "marker_save.db")
    conn = sqlite3.connect(db_path)
    for ddl in OLD_DDL:
        conn.execute(ddl)
    conn.execute(
        "INSERT INTO agent_sessions (id, title, created_at, last_activity_at, message_count)"
        " VALUES ('sess_a', 'New Chat', 1000.0, 1000.0, 0)"
    )
    conn.commit()
    conn.close()
    return db_path


def _agent(db_path) -> SoulMateAgent:
    """__new__级别最小实例：只挂_db_path，调用生产方法体_save_message"""
    obj = SoulMateAgent.__new__(SoulMateAgent)
    obj._db_path = Path(db_path)
    return obj


def _row(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT metadata, attachments, role FROM agent_messages WHERE session_id='sess_a'"
    ).fetchone()
    conn.close()
    return row


class TestFromRecall:
    """kilocode MemoryMarkerMeta.fromRecall语义"""

    def test_no_sources_returns_none(self):
        # kilocode fromRecall：files空→return undefined（不打标记）
        assert from_recall(sources=[], texts=["一些内容"]) is None

    def test_none_inputs_safe(self):
        assert from_recall(None, None) is None

    def test_count_defaults_to_deduped_files(self):
        info = from_recall(sources=["a", "b", "a", "", None], texts=["t"])
        assert info["count"] == 2
        assert info["files"] == ["a", "b"]  # 去重保序

    def test_explicit_count_wins(self):
        info = from_recall(sources=["a"], texts=["t"], count=7)
        assert info["count"] == 7

    def test_tokens_estimated_cjk_aware(self):
        text = "你好世界" * 10
        info = from_recall(sources=["m1"], texts=[text])
        assert info["tokens"] == estimate_tokens(text)

    def test_explicit_tokens_wins(self):
        info = from_recall(sources=["m1"], texts=["t"], tokens=42)
        assert info["tokens"] == 42

    def test_bytes_utf8_length(self):
        info = from_recall(sources=["m1"], texts=["你好"])  # 2 CJK chars = 6 bytes
        assert info["bytes"] == 6

    def test_items_clip_120_and_limit_5(self):
        texts = ["x" * 200] * 7
        info = from_recall(sources=["m1"], texts=texts)
        assert len(info["items"]) == 5  # LIMIT=5
        assert all(len(i) == 120 for i in info["items"])  # CHARS=120

    def test_items_clip_by_codepoint(self):
        # kilocode Array.from().slice(0,CHARS)：按码点截断，emoji不切半
        info = from_recall(sources=["m1"], texts=["😀" * 200])
        assert len(info["items"][0]) == 120  # 120个完整emoji码点

    def test_items_drop_empty_texts(self):
        info = from_recall(sources=["m1"], texts=["", "有效", None])
        assert info["items"] == ["有效"]

    def test_type_is_recall(self):
        info = from_recall(sources=["m1"], texts=["t"])
        assert info["type"] == TYPE_RECALL


class TestMetadataShape:
    """kilocode MemoryMarkerMeta.metadata语义：items受verbose门控"""

    def test_metadata_keys_exact(self):
        info = from_recall(sources=["m1"], texts=["t"])
        km = metadata(info)["kiloMemory"]
        assert set(km.keys()) == {"type", "bytes", "tokens", "count", "files"}

    def test_items_hidden_by_default(self):
        # 默认不外泄记忆内容片段（隐私：记忆内容不随消息元数据二次扩散）
        info = from_recall(sources=["m1"], texts=["秘密内容"])
        assert "items" not in metadata(info)["kiloMemory"]

    def test_verbose_recall_exposes_items(self):
        info = from_recall(sources=["m1"], texts=["片段"])
        km = metadata(info, verbose=True)["kiloMemory"]
        assert km["items"] == ["片段"]

    def test_verbose_startup_omits_items(self):
        # kilocode：items仅recall型输出
        marker = {"type": TYPE_STARTUP, "bytes": 1, "tokens": 1, "count": 1, "files": ["f"], "items": ["x"]}
        assert "items" not in metadata(marker, verbose=True)["kiloMemory"]

    def test_none_marker_empty(self):
        assert metadata(None) == {}
        assert metadata_json(None) is None

    def test_metadata_json_roundtrip(self):
        info = from_recall(sources=["m1", "m2"], texts=["召回内容"])
        raw = metadata_json(info)
        assert json.loads(raw) == metadata(info)

    def test_no_marker_no_json(self):
        assert metadata_json(from_recall(sources=[], texts=["t"])) is None


class TestSaveMessageMetadata:
    """_save_message metadata列落盘（probe+ALTER自愈老schema）"""

    def test_metadata_persists_and_migrates_column(self, tmp_path):
        db = _make_old_db(tmp_path)
        agent = _agent(db)
        marker_json = metadata_json(from_recall(sources=["ltm_1"], texts=["记得的事"]))
        agent._save_message("sess_a", "assistant", "回复", metadata=marker_json)
        conn = sqlite3.connect(db)
        cols = [r[1] for r in conn.execute("PRAGMA table_info(agent_messages)")]
        conn.close()
        assert "metadata" in cols  # 老schema自愈迁移
        row = _row(db)
        assert json.loads(row["metadata"]) == json.loads(marker_json)

    def test_metadata_defaults_null(self, tmp_path):
        db = _make_old_db(tmp_path)
        agent = _agent(db)
        agent._save_message("sess_a", "user", "你好")
        assert _row(db)["metadata"] is None

    def test_attachments_and_metadata_coexist(self, tmp_path):
        db = _make_old_db(tmp_path)
        agent = _agent(db)
        agent._save_message(
            "sess_a", "assistant", "带附件回复",
            attachments='[{"type":"file"}]',
            metadata=metadata_json(from_recall(sources=["m1"], texts=["t"])),
        )
        row = _row(db)
        assert row["attachments"] == '[{"type":"file"}]'
        assert row["metadata"] is not None

    def test_full_roundtrip_marker_to_row(self, tmp_path):
        """写侧全链路：from_recall→metadata_json→_save_message→行内JSON可解码"""
        db = _make_old_db(tmp_path)
        agent = _agent(db)
        info = from_recall(sources=["ltm_abc"], texts=["用户喜欢深色主题"], count=1)
        agent._save_message("sess_a", "assistant", "好的", metadata=metadata_json(info))
        decoded = json.loads(_row(db)["metadata"])["kiloMemory"]
        assert decoded["type"] == "recall"
        assert decoded["count"] == 1
        assert decoded["files"] == ["ltm_abc"]
        assert decoded["tokens"] == estimate_tokens("用户喜欢深色主题")
        assert "items" not in decoded  # 默认不外泄内容


class TestSoulmateWiring:
    """接线断言：marker写在_prompt_inner真实消息路径（ws /ws/acp聊天路径）"""

    def test_prompt_inner_builds_marker(self):
        src = inspect.getsource(SoulMateAgent._prompt_inner)
        assert "memory_marker.from_recall" in src
        assert "memory_marker.metadata_json" in src

    def test_prompt_inner_passes_metadata_to_save(self):
        src = inspect.getsource(SoulMateAgent._prompt_inner)
        assert "metadata=_marker_json" in src  # assistant消息落盘带marker

    def test_prompt_inner_collects_recalled_texts(self):
        src = inspect.getsource(SoulMateAgent._prompt_inner)
        assert "recalled_texts" in src
        assert "recalled_ids" in src  # 双源召回id→marker files

    def test_save_message_metadata_param_and_migration(self):
        src = inspect.getsource(SoulMateAgent._save_message)
        assert "metadata: str | None = None" in src
        assert "ADD COLUMN metadata" in src  # probe+ALTER自愈
