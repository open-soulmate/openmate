"""A2A Task持久化存储（SQLite）。

提供基于SQLite的Task CRUD操作，支持异步访问。
数据结构遵循A2A v0.2.2 Task模型。
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path
from typing import Optional

import asyncio

from a2a.models import (
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
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
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


def _ensure_db_dir(path: Path) -> None:
    """确保数据库所在目录存在。"""
    path.parent.mkdir(parents=True, exist_ok=True)


def _dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    """将sqlite3查询结果转换为字典。"""
    return {col[0]: row[i] for i, col in enumerate(cursor.description)}


class TaskStore:
    """A2A Task的SQLite持久化存储。

    支持Task的完整CRUD操作和状态机校验。
    使用asyncio.to_thread包装同步sqlite3调用实现异步访问。
    """

    def __init__(self, db_path: Optional[str | Path] = None) -> None:
        """初始化TaskStore。

        Args:
            db_path: SQLite数据库文件路径，默认为 data/a2a_tasks.db
        """
        self._db_path = Path(db_path) if db_path else _DEFAULT_DB_PATH
        _ensure_db_dir(self._db_path)
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        """获取一个SQLite连接（每调用一次新建连接，线程安全）。"""
        conn = sqlite3.connect(str(self._db_path), timeout=10)
        conn.row_factory = _dict_factory
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        """初始化数据库表结构。"""
        conn = self._get_conn()
        try:
            conn.executescript(_CREATE_TABLES_SQL)
            conn.commit()
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # 同步内部方法（供 asyncio.to_thread 调用）
    # ------------------------------------------------------------------

    def _create_task(self, task_id: Optional[str], session_id: Optional[str],
                     initial_message: Optional[Message], metadata: Optional[dict]) -> Task:
        """同步创建新Task。"""
        tid = task_id or str(uuid.uuid4())
        ts = now_iso()
        conn = self._get_conn()
        try:
            conn.execute(
                "INSERT INTO tasks (id, session_id, state, status_timestamp, metadata, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (tid, session_id, TaskState.SUBMITTED.value, ts,
                 json.dumps(metadata) if metadata else None, ts, ts),
            )
            # 如果有初始消息，写入history
            if initial_message:
                conn.execute(
                    "INSERT INTO task_history (task_id, role, parts, metadata, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (tid, initial_message.role,
                     json.dumps([p.model_dump() for p in initial_message.parts]),
                     json.dumps(initial_message.metadata) if initial_message.metadata else None,
                     ts),
                )
            conn.commit()
        finally:
            conn.close()

        return Task(
            id=tid,
            sessionId=session_id,
            status=TaskStatus(state=TaskState.SUBMITTED, timestamp=ts),
            history=[initial_message] if initial_message else [],
            metadata=metadata,
        )

    def _get_task(self, task_id: str) -> Optional[Task]:
        """同步获取Task（含history和artifacts）。"""
        conn = self._get_conn()
        try:
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if not row:
                return None

            # 加载history
            hist_rows = conn.execute(
                "SELECT * FROM task_history WHERE task_id = ? ORDER BY id", (task_id,)
            ).fetchall()
            history = [
                Message(
                    role=r["role"],
                    parts=[p for p in json.loads(r["parts"])],
                    metadata=json.loads(r["metadata"]) if r["metadata"] else None,
                )
                for r in hist_rows
            ]

            # 加载artifacts
            art_rows = conn.execute(
                "SELECT * FROM task_artifacts WHERE task_id = ? ORDER BY id", (task_id,)
            ).fetchall()
            artifacts = [
                Artifact(
                    artifactId=r["artifact_id"],
                    name=r["name"],
                    description=r["description"],
                    parts=[p for p in json.loads(r["parts"])],
                    metadata=json.loads(r["metadata"]) if r["metadata"] else None,
                )
                for r in art_rows
            ]

            status_msg = None
            if row["status_message"]:
                sm = json.loads(row["status_message"])
                status_msg = Message(**sm)

            metadata = json.loads(row["metadata"]) if row["metadata"] else None

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
                metadata=metadata,
            )
        finally:
            conn.close()

    def _update_task_status(self, task_id: str, new_state: TaskState,
                            status_message: Optional[Message]) -> Task:
        """同步更新Task状态（含状态机校验）。"""
        conn = self._get_conn()
        try:
            row = conn.execute("SELECT state FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if not row:
                raise ValueError(f"Task不存在: {task_id}")

            current = TaskState(row["state"])
            validate_transition(current, new_state)

            ts = now_iso()
            msg_json = None
            if status_message:
                msg_json = json.dumps(status_message.model_dump())

            conn.execute(
                "UPDATE tasks SET state = ?, status_message = ?, status_timestamp = ?, updated_at = ? WHERE id = ?",
                (new_state.value, msg_json, ts, ts, task_id),
            )

            # 如果有附加消息，也写入history
            if status_message:
                conn.execute(
                    "INSERT INTO task_history (task_id, role, parts, metadata, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (task_id, status_message.role,
                     json.dumps([p.model_dump() for p in status_message.parts]),
                     json.dumps(status_message.metadata) if status_message.metadata else None,
                     ts),
                )

            conn.commit()
        finally:
            conn.close()

        return self._get_task(task_id)  # type: ignore[return-value]

    def _add_message(self, task_id: str, message: Message) -> None:
        """同步向Task追加一条history消息。"""
        ts = now_iso()
        conn = self._get_conn()
        try:
            conn.execute(
                "INSERT INTO task_history (task_id, role, parts, metadata, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (task_id, message.role,
                 json.dumps([p.model_dump() for p in message.parts]),
                 json.dumps(message.metadata) if message.metadata else None,
                 ts),
            )
            conn.execute("UPDATE tasks SET updated_at = ? WHERE id = ?", (ts, task_id))
            conn.commit()
        finally:
            conn.close()

    def _add_artifact(self, task_id: str, artifact: Artifact) -> None:
        """同步向Task追加工件。"""
        ts = now_iso()
        conn = self._get_conn()
        try:
            conn.execute(
                "INSERT INTO task_artifacts (task_id, artifact_id, name, description, parts, metadata, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (task_id, artifact.artifactId, artifact.name, artifact.description,
                 json.dumps([p.model_dump() for p in artifact.parts]),
                 json.dumps(artifact.metadata) if artifact.metadata else None,
                 ts),
            )
            conn.execute("UPDATE tasks SET updated_at = ? WHERE id = ?", (ts, task_id))
            conn.commit()
        finally:
            conn.close()

    def _list_tasks(self, session_id: Optional[str] = None,
                    state: Optional[TaskState] = None) -> list[Task]:
        """同步列出Task（可按session或state过滤）。"""
        conn = self._get_conn()
        try:
            sql = "SELECT id FROM tasks WHERE 1=1"
            params: list = []
            if session_id:
                sql += " AND session_id = ?"
                params.append(session_id)
            if state:
                sql += " AND state = ?"
                params.append(state.value)
            sql += " ORDER BY created_at DESC"

            rows = conn.execute(sql, params).fetchall()
            return [r["id"] for r in rows]
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # 异步公共API
    # ------------------------------------------------------------------

    async def create_task(self, task_id: Optional[str] = None,
                          session_id: Optional[str] = None,
                          initial_message: Optional[Message] = None,
                          metadata: Optional[dict] = None) -> Task:
        """异步创建新Task。

        Args:
            task_id: 可选的Task ID，不提供则自动生成UUID
            session_id: 可选的会话ID
            initial_message: 可选的初始消息
            metadata: 可选的元数据

        Returns:
            创建的Task对象
        """
        return await asyncio.to_thread(
            self._create_task, task_id, session_id, initial_message, metadata
        )

    async def get_task(self, task_id: str) -> Optional[Task]:
        """异步获取Task。

        Args:
            task_id: Task唯一标识

        Returns:
            Task对象，不存在则返回None
        """
        return await asyncio.to_thread(self._get_task, task_id)

    async def update_task_status(self, task_id: str, new_state: TaskState,
                                 status_message: Optional[Message] = None) -> Task:
        """异步更新Task状态。

        Args:
            task_id: Task唯一标识
            new_state: 目标状态
            status_message: 状态变更时的附加消息

        Returns:
            更新后的Task对象

        Raises:
            ValueError: Task不存在或状态跳转非法
        """
        return await asyncio.to_thread(
            self._update_task_status, task_id, new_state, status_message
        )

    async def add_message(self, task_id: str, message: Message) -> None:
        """异步向Task追加消息到history。

        Args:
            task_id: Task唯一标识
            message: 要追加的消息
        """
        await asyncio.to_thread(self._add_message, task_id, message)

    async def add_artifact(self, task_id: str, artifact: Artifact) -> None:
        """异步向Task追加工件。

        Args:
            task_id: Task唯一标识
            artifact: 要追加的工件
        """
        await asyncio.to_thread(self._add_artifact, task_id, artifact)

    async def list_tasks(self, session_id: Optional[str] = None,
                         state: Optional[TaskState] = None) -> list[str]:
        """异步列出Task ID列表。

        Args:
            session_id: 可选的会话ID过滤
            state: 可选的状态过滤

        Returns:
            Task ID列表
        """
        return await asyncio.to_thread(self._list_tasks, session_id, state)
