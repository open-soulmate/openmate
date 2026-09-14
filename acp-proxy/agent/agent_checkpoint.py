"""
Agent状态快照与恢复 — 借鉴LangGraph checkpoint机制
支持：中断恢复、时间旅行、状态回滚
核心思想：每步操作前快照，失败可恢复到任意checkpoint
"""

import logging
import json
import time
import sqlite3
import hashlib
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Optional
from datetime import datetime

logger = logging.getLogger("acp-proxy.agent-checkpoint")


@dataclass
class Checkpoint:
    checkpoint_id: str
    session_id: str
    step_number: int
    timestamp: float
    state_snapshot: dict
    metadata: dict = field(default_factory=dict)
    parent_id: str = ""  # 支持分支

    def to_dict(self) -> dict:
        return {
            "checkpoint_id": self.checkpoint_id,
            "session_id": self.session_id,
            "step_number": self.step_number,
            "timestamp": self.timestamp,
            "state_snapshot": self.state_snapshot,
            "metadata": self.metadata,
            "parent_id": self.parent_id,
        }


class AgentCheckpointManager:
    """Agent checkpoint管理器 — 类似LangGraph的Checkpointer"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "agent-state"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "checkpoints.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS checkpoints (
                    checkpoint_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    step_number INTEGER NOT NULL,
                    timestamp REAL NOT NULL,
                    state_json TEXT NOT NULL,
                    metadata_json TEXT DEFAULT '{}',
                    parent_id TEXT DEFAULT '',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_checkpoints_session
                ON checkpoints(session_id, step_number)
            """)
            conn.commit()

    def create_checkpoint(
        self,
        session_id: str,
        state: dict,
        step_number: int = 0,
        metadata: Optional[dict] = None,
        parent_id: str = ""
    ) -> Checkpoint:
        """创建checkpoint — 在关键操作前调用"""
        checkpoint_id = self._generate_id(session_id, step_number, state)

        cp = Checkpoint(
            checkpoint_id=checkpoint_id,
            session_id=session_id,
            step_number=step_number,
            timestamp=time.time(),
            state_snapshot=state,
            metadata=metadata or {},
            parent_id=parent_id,
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO checkpoints
                   (checkpoint_id, session_id, step_number, timestamp,
                    state_json, metadata_json, parent_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    cp.checkpoint_id,
                    cp.session_id,
                    cp.step_number,
                    cp.timestamp,
                    json.dumps(cp.state_snapshot, ensure_ascii=False),
                    json.dumps(cp.metadata, ensure_ascii=False),
                    cp.parent_id,
                ),
            )
            conn.commit()

        logger.debug(f"Created checkpoint {checkpoint_id[:12]} for session {session_id}")
        return cp

    def restore_checkpoint(self, checkpoint_id: str) -> Optional[Checkpoint]:
        """恢复到指定checkpoint"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM checkpoints WHERE checkpoint_id = ?",
                (checkpoint_id,),
            ).fetchone()

        if not row:
            logger.warning(f"Checkpoint {checkpoint_id} not found")
            return None

        return Checkpoint(
            checkpoint_id=row["checkpoint_id"],
            session_id=row["session_id"],
            step_number=row["step_number"],
            timestamp=row["timestamp"],
            state_snapshot=json.loads(row["state_json"]),
            metadata=json.loads(row["metadata_json"]),
            parent_id=row["parent_id"],
        )

    def get_latest(self, session_id: str) -> Optional[Checkpoint]:
        """获取会话最新的checkpoint"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """SELECT * FROM checkpoints
                   WHERE session_id = ?
                   ORDER BY step_number DESC LIMIT 1""",
                (session_id,),
            ).fetchone()

        if not row:
            return None

        return Checkpoint(
            checkpoint_id=row["checkpoint_id"],
            session_id=row["session_id"],
            step_number=row["step_number"],
            timestamp=row["timestamp"],
            state_snapshot=json.loads(row["state_json"]),
            metadata=json.loads(row["metadata_json"]),
            parent_id=row["parent_id"],
        )

    def get_history(self, session_id: str, limit: int = 20) -> list[Checkpoint]:
        """获取checkpoint历史 — 支持时间旅行"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT * FROM checkpoints
                   WHERE session_id = ?
                   ORDER BY step_number DESC LIMIT ?""",
                (session_id, limit),
            ).fetchall()

        return [
            Checkpoint(
                checkpoint_id=r["checkpoint_id"],
                session_id=r["session_id"],
                step_number=r["step_number"],
                timestamp=r["timestamp"],
                state_snapshot=json.loads(r["state_json"]),
                metadata=json.loads(r["metadata_json"]),
                parent_id=r["parent_id"],
            )
            for r in rows
        ]

    def diff_checkpoints(self, id_a: str, id_b: str) -> dict:
        """对比两个checkpoint的差异"""
        cp_a = self.restore_checkpoint(id_a)
        cp_b = self.restore_checkpoint(id_b)

        if not cp_a or not cp_b:
            return {"error": "One or both checkpoints not found"}

        diff = {
            "step_diff": cp_b.step_number - cp_a.step_number,
            "time_diff": cp_b.timestamp - cp_a.timestamp,
            "changed_keys": [],
            "added_keys": [],
            "removed_keys": [],
        }

        keys_a = set(cp_a.state_snapshot.keys())
        keys_b = set(cp_b.state_snapshot.keys())

        diff["added_keys"] = list(keys_b - keys_a)
        diff["removed_keys"] = list(keys_a - keys_b)
        diff["changed_keys"] = [
            k for k in keys_a & keys_b
            if cp_a.state_snapshot[k] != cp_b.state_snapshot[k]
        ]

        return diff

    def cleanup_old(self, session_id: str, keep_last: int = 50):
        """清理旧checkpoint，只保留最近N个"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """DELETE FROM checkpoints
                   WHERE session_id = ?
                   AND step_number < (
                       SELECT MIN(step_number) FROM (
                           SELECT step_number FROM checkpoints
                           WHERE session_id = ?
                           ORDER BY step_number DESC LIMIT ?
                       )
                   )""",
                (session_id, session_id, keep_last),
            )
            conn.commit()

    def _generate_id(self, session_id: str, step: int, state: dict) -> str:
        content = f"{session_id}:{step}:{json.dumps(state, sort_keys=True)}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM checkpoints").fetchone()[0]
            sessions = conn.execute(
                "SELECT COUNT(DISTINCT session_id) FROM checkpoints"
            ).fetchone()[0]
        return {
            "total_checkpoints": total,
            "tracked_sessions": sessions,
            "db_path": self.db_path,
        }
