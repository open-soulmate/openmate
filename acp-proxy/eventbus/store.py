"""事件持久化存储与回放查询。

提供两级存储：
- MemoryEventStore：纯内存存储，适合开发和轻量事件
- SQLiteEventStore：SQLite 持久化，适合核心事件和事件溯源

两者均支持按时间、traceId、topic 回放查询。
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .models import Event

logger = logging.getLogger("eventbus.store")


# ---------------------------------------------------------------------------
# 抽象基类
# ---------------------------------------------------------------------------

class BaseEventStore(ABC):
    """事件存储抽象接口。

    定义事件持久化和回放查询的标准接口，
    便于后续扩展为 PostgreSQL、Redis 等实现。
    """

    @abstractmethod
    def save(self, event: Event) -> None:
        """持久化一个事件。"""

    @abstractmethod
    def query_by_topic(self, topic: str, limit: int = 100) -> list[Event]:
        """按 topic 前缀查询事件。"""

    @abstractmethod
    def query_by_trace_id(self, trace_id: str) -> list[Event]:
        """按 traceId 查询关联的所有事件。"""

    @abstractmethod
    def query_by_time_range(
        self,
        start: datetime,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[Event]:
        """按时间范围查询事件。"""

    @abstractmethod
    def count(self) -> int:
        """返回存储中的事件总数。"""


# ---------------------------------------------------------------------------
# 内存存储实现
# ---------------------------------------------------------------------------

class MemoryEventStore(BaseEventStore):
    """纯内存事件存储。

    使用列表保存所有事件，线程安全。
    适合开发环境和轻量级事件（persist=False）。
    查询性能为 O(n)，数据不持久化到磁盘。
    """

    def __init__(self) -> None:
        self._events: list[Event] = []
        self._lock = threading.Lock()

    def save(self, event: Event) -> None:
        """将事件追加到内存列表。"""
        with self._lock:
            self._events.append(event)
            logger.debug("内存存储: 保存事件 %s (topic=%s)", event.event_id[:8], event.event_topic)

    def query_by_topic(self, topic: str, limit: int = 100) -> list[Event]:
        """按 topic 前缀匹配查询。"""
        with self._lock:
            results = [e for e in self._events if e.event_topic.startswith(topic)]
            return results[-limit:]

    def query_by_trace_id(self, trace_id: str) -> list[Event]:
        """按 traceId 精确匹配查询。"""
        with self._lock:
            return [e for e in self._events if e.trace_id == trace_id]

    def query_by_time_range(
        self,
        start: datetime,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[Event]:
        """按时间范围查询。end 为空则查到最新。"""
        with self._lock:
            results = [
                e for e in self._events
                if e.timestamp >= start and (end is None or e.timestamp <= end)
            ]
            return results[-limit:]

    def count(self) -> int:
        """返回内存中的事件总数。"""
        with self._lock:
            return len(self._events)


# ---------------------------------------------------------------------------
# SQLite 持久化存储
# ---------------------------------------------------------------------------

class SQLiteEventStore(BaseEventStore):
    """SQLite 持久化事件存储。

    将事件序列化为 JSON 存入 SQLite，支持按 topic、traceId、时间范围查询。
    使用 WAL 模式提高并发读写性能。适合核心事件（persist=True）。
    """

    _CREATE_TABLE = """
    CREATE TABLE IF NOT EXISTS events (
        event_id   TEXT PRIMARY KEY,
        topic      TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp  TEXT NOT NULL,
        trace_id   TEXT,
        namespace  TEXT,
        payload    TEXT NOT NULL,
        raw_json   TEXT NOT NULL
    );
    """

    _CREATE_INDEXES = [
        "CREATE INDEX IF NOT EXISTS idx_topic ON events(topic);",
        "CREATE INDEX IF NOT EXISTS idx_trace_id ON events(trace_id);",
        "CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp);",
        "CREATE INDEX IF NOT EXISTS idx_namespace ON events(namespace);",
    ]

    def __init__(self, db_path: str | Path = "eventbus.db") -> None:
        """初始化 SQLite 存储。

        Args:
            db_path: 数据库文件路径，默认为当前目录下的 eventbus.db
        """
        self._db_path = str(db_path)
        self._local = threading.local()
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        """获取当前线程的数据库连接（线程本地）。"""
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self._db_path)
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.row_factory = sqlite3.Row
            self._local.conn = conn
        return conn

    def _init_db(self) -> None:
        """初始化数据库表和索引。"""
        conn = self._get_conn()
        conn.execute(self._CREATE_TABLE)
        for idx_sql in self._CREATE_INDEXES:
            conn.execute(idx_sql)
        conn.commit()
        logger.info("SQLite存储已初始化: %s", self._db_path)

    def save(self, event: Event) -> None:
        """将事件持久化到 SQLite。"""
        conn = self._get_conn()
        raw_json = event.model_dump_json()
        conn.execute(
            "INSERT OR REPLACE INTO events (event_id, topic, event_type, timestamp, trace_id, namespace, payload, raw_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                event.event_id,
                event.event_topic,
                event.event_type.value,
                event.timestamp.isoformat(),
                event.trace_id,
                event.namespace,
                json.dumps(event.payload, ensure_ascii=False),
                raw_json,
            ),
        )
        conn.commit()
        logger.debug("SQLite存储: 保存事件 %s", event.event_id[:8])

    def _row_to_event(self, row: sqlite3.Row) -> Event:
        """将数据库行反序列化为 Event 对象。"""
        return Event.model_validate_json(row["raw_json"])

    def query_by_topic(self, topic: str, limit: int = 100) -> list[Event]:
        """按 topic 前缀查询事件。"""
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT raw_json FROM events WHERE topic LIKE ? ORDER BY timestamp DESC LIMIT ?",
            (f"{topic}%", limit),
        ).fetchall()
        return [self._row_to_event(r) for r in rows]

    def query_by_trace_id(self, trace_id: str) -> list[Event]:
        """按 traceId 查询所有关联事件。"""
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT raw_json FROM events WHERE trace_id = ? ORDER BY timestamp ASC",
            (trace_id,),
        ).fetchall()
        return [self._row_to_event(r) for r in rows]

    def query_by_time_range(
        self,
        start: datetime,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[Event]:
        """按时间范围查询事件。"""
        conn = self._get_conn()
        if end is not None:
            rows = conn.execute(
                "SELECT raw_json FROM events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ?",
                (start.isoformat(), end.isoformat(), limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT raw_json FROM events WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?",
                (start.isoformat(), limit),
            ).fetchall()
        return [self._row_to_event(r) for r in rows]

    def count(self) -> int:
        """返回存储中的事件总数。"""
        conn = self._get_conn()
        row = conn.execute("SELECT COUNT(*) as cnt FROM events").fetchone()
        return row["cnt"] if row else 0
