"""
Agent行为追踪与回放系统 — 借鉴LangSmith trace + OpenReplay会话回放
核心思想：记录每一步操作，支持回放调试、错误诊断、行为分析
"""

import logging
import json
import time
import sqlite3
import uuid
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Any
from datetime import datetime
from enum import Enum

logger = logging.getLogger("acp-proxy.agent-trace")


class TraceEventType(str, Enum):
    LLM_REQUEST = "llm_request"
    LLM_RESPONSE = "llm_response"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    ERROR = "error"
    USER_INPUT = "user_input"
    AGENT_OUTPUT = "agent_output"
    STATE_CHANGE = "state_change"
    CHECKPOINT = "checkpoint"
    COMPRESSION = "compression"
    PERMISSION_CHECK = "permission_check"
    TIMEOUT = "timeout"


@dataclass
class TraceEvent:
    event_id: str
    trace_id: str
    span_id: str
    parent_span_id: str
    event_type: TraceEventType
    timestamp: float
    duration_ms: float = 0.0
    data: dict = field(default_factory=dict)
    metadata: dict = field(default_factory=dict)
    error: str = ""

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "parent_span_id": self.parent_span_id,
            "event_type": self.event_type.value,
            "timestamp": self.timestamp,
            "duration_ms": self.duration_ms,
            "data": self.data,
            "metadata": self.metadata,
            "error": self.error,
        }


class AgentTracer:
    """Agent行为追踪器"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "traces"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "traces.db")
        self.db_path = db_path
        self._current_trace_id: str = ""
        self._span_stack: list[str] = []
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS trace_events (
                    event_id TEXT PRIMARY KEY,
                    trace_id TEXT NOT NULL,
                    span_id TEXT NOT NULL,
                    parent_span_id TEXT DEFAULT '',
                    event_type TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    duration_ms REAL DEFAULT 0,
                    data_json TEXT DEFAULT '{}',
                    metadata_json TEXT DEFAULT '{}',
                    error TEXT DEFAULT '',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_trace_events
                ON trace_events(trace_id, timestamp)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_trace_span
                ON trace_events(span_id)
            """)
            conn.commit()

    def start_trace(self, session_id: str = "") -> str:
        """开始新的追踪"""
        self._current_trace_id = f"trace_{uuid.uuid4().hex[:12]}"
        self._span_stack.clear()
        logger.debug(f"Started trace: {self._current_trace_id}")
        return self._current_trace_id

    def start_span(self, event_type: TraceEventType, data: Optional[dict] = None) -> str:
        """开始新的span"""
        span_id = f"span_{uuid.uuid4().hex[:12]}"
        parent_id = self._span_stack[-1] if self._span_stack else ""

        event = TraceEvent(
            event_id=f"evt_{uuid.uuid4().hex[:12]}",
            trace_id=self._current_trace_id,
            span_id=span_id,
            parent_span_id=parent_id,
            event_type=event_type,
            timestamp=time.time(),
            data=data or {},
        )

        self._write_event(event)
        self._span_stack.append(span_id)
        return span_id

    def end_span(self, span_id: str, result: Optional[dict] = None, error: str = ""):
        """结束span"""
        if self._span_stack and self._span_stack[-1] == span_id:
            self._span_stack.pop()

        # 更新duration
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT timestamp FROM trace_events WHERE span_id = ? ORDER BY timestamp ASC LIMIT 1",
                (span_id,),
            ).fetchone()
            if row:
                duration = (time.time() - row[0]) * 1000
                conn.execute(
                    """UPDATE trace_events
                       SET duration_ms = ?, data_json = ?, error = ?
                       WHERE span_id = ?""",
                    (duration, json.dumps(result or {}, ensure_ascii=False), error, span_id),
                )
                conn.commit()

    def log_event(
        self,
        event_type: TraceEventType,
        data: Optional[dict] = None,
        error: str = "",
        duration_ms: float = 0.0,
    ):
        """记录单个事件"""
        event = TraceEvent(
            event_id=f"evt_{uuid.uuid4().hex[:12]}",
            trace_id=self._current_trace_id,
            span_id=self._span_stack[-1] if self._span_stack else "",
            parent_span_id=self._span_stack[-2] if len(self._span_stack) > 1 else "",
            event_type=event_type,
            timestamp=time.time(),
            duration_ms=duration_ms,
            data=data or {},
            error=error,
        )
        self._write_event(event)

    def get_trace(self, trace_id: str) -> list[dict]:
        """获取完整trace"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM trace_events WHERE trace_id = ? ORDER BY timestamp ASC",
                (trace_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_recent_traces(self, limit: int = 20) -> list[dict]:
        """获取最近的trace列表"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT trace_id,
                          MIN(timestamp) as start_time,
                          MAX(timestamp) as end_time,
                          COUNT(*) as event_count,
                          SUM(CASE WHEN error != '' THEN 1 ELSE 0 END) as error_count
                   FROM trace_events
                   GROUP BY trace_id
                   ORDER BY start_time DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_error_traces(self, limit: int = 10) -> list[dict]:
        """获取有错误的trace"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT DISTINCT trace_id, error, timestamp
                   FROM trace_events
                   WHERE error != ''
                   ORDER BY timestamp DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def analyze_performance(self, trace_id: str) -> dict:
        """分析trace性能"""
        events = self.get_trace(trace_id)
        if not events:
            return {"error": "Trace not found"}

        total_time = events[-1]["timestamp"] - events[0]["timestamp"]
        llm_time = sum(e["duration_ms"] for e in events if e["event_type"] == "llm_request")
        tool_time = sum(e["duration_ms"] for e in events if e["event_type"] == "tool_call")
        errors = [e for e in events if e["error"]]

        return {
            "trace_id": trace_id,
            "total_events": len(events),
            "total_time_seconds": f"{total_time:.2f}",
            "llm_time_ms": f"{llm_time:.0f}",
            "tool_time_ms": f"{tool_time:.0f}",
            "error_count": len(errors),
            "event_type_distribution": {
                et: sum(1 for e in events if e["event_type"] == et)
                for et in set(e["event_type"] for e in events)
            },
        }

    def _write_event(self, event: TraceEvent):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO trace_events
                   (event_id, trace_id, span_id, parent_span_id,
                    event_type, timestamp, duration_ms,
                    data_json, metadata_json, error)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    event.event_id,
                    event.trace_id,
                    event.span_id,
                    event.parent_span_id,
                    event.event_type.value,
                    event.timestamp,
                    event.duration_ms,
                    json.dumps(event.data, ensure_ascii=False),
                    json.dumps(event.metadata, ensure_ascii=False),
                    event.error,
                ),
            )
            conn.commit()

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total_events = conn.execute("SELECT COUNT(*) FROM trace_events").fetchone()[0]
            total_traces = conn.execute("SELECT COUNT(DISTINCT trace_id) FROM trace_events").fetchone()[0]
            error_events = conn.execute("SELECT COUNT(*) FROM trace_events WHERE error != ''").fetchone()[0]
        return {
            "total_events": total_events,
            "total_traces": total_traces,
            "error_events": error_events,
            "error_rate": f"{error_events / max(total_events, 1) * 100:.1f}%",
            "current_trace": self._current_trace_id,
            "db_path": self.db_path,
        }
