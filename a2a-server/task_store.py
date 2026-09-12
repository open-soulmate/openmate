"""A2A Task持久化存储（SQLite + aiosqlite）。

提供基于SQLite的Task CRUD操作，原生异步访问。
数据结构遵循A2A v0.2.2 Task模型。
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Optional

import aiosqlite

from models import (
    Artifact,
    Message,
    Task,
    TaskState,
    TaskStatus,
    now_iso,
    validate_transition,
)


# 默认数据库路径
_DEFAULT_DB_DIR = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_DB_PATH = _DEFAULT_DB_DIR / "a2a_tasks.db"

# SQLite建表SQL
_CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    session_id  TEXT,
    state       TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    status_message  TEXT,          -- JSON序列化的Message
    status_timestamp TEXT NOT NULL,
    metadata    TEXT,              -- JSON dict
    task_data   TEXT,              -- JSON序列化的完整Task对象
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS task_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    parts       TEXT NOT NULL,     -- JSON序列化的Part列表
    metadata    TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_artifacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    artifact_id TEXT NOT NULL,
    name        TEXT,
    description TEXT,
    parts       TEXT NOT NULL,     -- JSON序列化的Part列表
    metadata    TEXT,
    created_at  TEXT NOT NULL,
    UNIQUE(task_id, artifact_id)
);
"""


class TaskStore:
    """A2A Task的SQLite持久化存储（aiosqlite原生异步）。"""

    def __init__(self, db_path: Optional[str | Path] = None) -> None:
        self._db_path = str(db_path or _DEFAULT_DB_PATH)
        Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db: Optional[aiosqlite.Connection] = None

    async def _get_db(self) -> aiosqlite.Connection:
        if self._db is None:
            self._db = await aiosqlite.connect(self._db_path)
            self._db.row_factory = aiosqlite.Row
            await self._db.execute("PRAGMA journal_mode=WAL")
            await self._db.execute("PRAGMA foreign_keys=ON")
            await self._db.executescript(_CREATE_TABLES_SQL)
            await self._db.commit()
        return self._db

    async def create_task(self, task_id: Optional[str] = None,
                          session_id: Optional[str] = None,
                          initial_message: Optional[Message] = None,
                          metadata: Optional[dict] = None) -> Task:
        db = await self._get_db()
        tid = task_id or str(uuid.uuid4())
        ts = now_iso()
        await db.execute(
            "INSERT INTO tasks (id, session_id, state, status_timestamp, metadata, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (tid, session_id, TaskState.SUBMITTED.value, ts,
             json.dumps(metadata) if metadata else None, ts, ts),
        )
        if initial_message:
            await db.execute(
                "INSERT INTO task_history (task_id, role, parts, metadata, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (tid, initial_message.role,
                 json.dumps([p.model_dump() for p in initial_message.parts]),
                 json.dumps(initial_message.metadata) if initial_message.metadata else None,
                 ts),
            )
        await db.commit()
        return Task(
            id=tid,
            sessionId=session_id,
            status=TaskStatus(state=TaskState.SUBMITTED, timestamp=ts),
            history=[initial_message] if initial_message else [],
            metadata=metadata,
        )

    async def get_task(self, task_id: str) -> Optional[Task]:
        db = await self._get_db()
        cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = await cursor.fetchone()
        if not row:
            return None

        # history
        cursor = await db.execute(
            "SELECT * FROM task_history WHERE task_id = ? ORDER BY id", (task_id,)
        )
        hist_rows = await cursor.fetchall()
        history = [
            Message(
                role=r["role"],
                parts=json.loads(r["parts"]),
                metadata=json.loads(r["metadata"]) if r["metadata"] else None,
            )
            for r in hist_rows
        ]

        # artifacts
        cursor = await db.execute(
            "SELECT * FROM task_artifacts WHERE task_id = ? ORDER BY id", (task_id,)
        )
        art_rows = await cursor.fetchall()
        artifacts = [
            Artifact(
                artifactId=r["artifact_id"],
                name=r["name"],
                description=r["description"],
                parts=json.loads(r["parts"]),
                metadata=json.loads(r["metadata"]) if r["metadata"] else None,
            )
            for r in art_rows
        ]

        status_msg = None
        if row["status_message"]:
            status_msg = Message(**json.loads(row["status_message"]))

        return Task(
            id=row["id"],
            sessionId=row["session_id"],
            status=TaskStatus(
                state=TaskState(row["state"]),
                message=status_msg,
                timestamp=row["status_timestamp"],
            ),
            history=history,
            artifacts=artifacts,
            metadata=json.loads(row["metadata"]) if row["metadata"] else None,
        )

    async def update_task_status(self, task_id: str, new_state: TaskState,
                                 status_message: Optional[Message] = None) -> Task:
        db = await self._get_db()
        cursor = await db.execute("SELECT state FROM tasks WHERE id = ?", (task_id,))
        row = await cursor.fetchone()
        if not row:
            raise ValueError(f"Task不存在: {task_id}")

        current = TaskState(row["state"])
        validate_transition(current, new_state)

        ts = now_iso()
        msg_json = json.dumps(status_message.model_dump()) if status_message else None

        await db.execute(
            "UPDATE tasks SET state = ?, status_message = ?, status_timestamp = ?, updated_at = ? WHERE id = ?",
            (new_state.value, msg_json, ts, ts, task_id),
        )
        if status_message:
            await db.execute(
                "INSERT INTO task_history (task_id, role, parts, metadata, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (task_id, status_message.role,
                 json.dumps([p.model_dump() for p in status_message.parts]),
                 json.dumps(status_message.metadata) if status_message.metadata else None,
                 ts),
            )
        await db.commit()
        return await self.get_task(task_id)  # type: ignore[return-value]

    async def add_message(self, task_id: str, message: Message) -> None:
        db = await self._get_db()
        ts = now_iso()
        await db.execute(
            "INSERT INTO task_history (task_id, role, parts, metadata, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (task_id, message.role,
             json.dumps([p.model_dump() for p in message.parts]),
             json.dumps(message.metadata) if message.metadata else None,
             ts),
        )
        await db.execute("UPDATE tasks SET updated_at = ? WHERE id = ?", (ts, task_id))
        await db.commit()

    async def add_artifact(self, task_id: str, artifact: Artifact) -> None:
        db = await self._get_db()
        ts = now_iso()
        await db.execute(
            "INSERT INTO task_artifacts (task_id, artifact_id, name, description, parts, metadata, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (task_id, artifact.artifactId, artifact.name, artifact.description,
             json.dumps([p.model_dump() for p in artifact.parts]),
             json.dumps(artifact.metadata) if artifact.metadata else None,
             ts),
        )
        await db.execute("UPDATE tasks SET updated_at = ? WHERE id = ?", (ts, task_id))
        await db.commit()

    async def list_tasks(self, session_id: Optional[str] = None,
                         state: Optional[TaskState] = None) -> list[str]:
        db = await self._get_db()
        sql = "SELECT id FROM tasks WHERE 1=1"
        params: list = []
        if session_id:
            sql += " AND session_id = ?"
            params.append(session_id)
        if state:
            sql += " AND state = ?"
            params.append(state.value)
        sql += " ORDER BY created_at DESC"
        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()
        return [r["id"] for r in rows]

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None
