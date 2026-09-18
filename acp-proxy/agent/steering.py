# -*- coding: utf-8 -*-
"""P0-4/P1: 会话插话队列 + 活动可观测（"不知道它在干嘛"的直接解）

调研来源（四方互证）：
- Khoj interrupt_queue（38-khoj-source.md #2，research.py:516-535，~15行）：
  任务运行中用户发新指令 → 从队列取出 → 拼进对话历史、保留已完成迭代继续跑；
  abort_message（END_EVENT）→ cancellation_event.set() 立即取消。
- goose Steer（PROGRESS.md轮7，ops_steer.rs 78行）：
  运行中消息进队列，turn间隙（between-turns：ends_turn 或 last role == Tool）
  批量drain注入 + with_steer标记。
- nanobot 注入队列（37-nanobot-source.md #2）：
  _drain_injections + _MAX_INJECTIONS_PER_TURN上限——每轮注入数封顶，超限丢弃并记日志。
- goose peek三指标（SUMMARY.md P0-4，63-goose-source-supplement6.md #2）：
  durable turn数 + idle时长 + buffered通知数 = "不知道它在干嘛"的行业首个完整实现。
- claude-code noop自报+streak（SUMMARY.md P0-4）：
  agent醒来什么都没做必须自报noop，连续noop折叠统计（停滞可观测）。
"""
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import logging
logger = logging.getLogger("acp-agent.steering")

# Khoj abort_message=END_EVENT 语义：队列中出现该文本 → 取消当前任务
ABORT_MESSAGE = "/abort"
# nanobot _MAX_INJECTIONS_PER_TURN：每个turn间隙最多注入几条插话
MAX_INJECTIONS_PER_TURN = 3
# Khoj asyncio.Queue(maxsize=10)：每会话插话队列深度上限
MAX_QUEUE_DEPTH = 10


@dataclass
class SteeredMessage:
    """一条被排队的插话（goose with_steer 标记语义）"""
    session_id: str
    text: str
    queued_at: float = field(default_factory=time.time)
    seq: int = 0

    @property
    def is_abort(self) -> bool:
        return SteeringQueue.is_abort(self.text)


class SteeringQueue:
    """per-session插话队列 — Khoj interrupt_queue + nanobot上限 + goose turn间隙drain"""

    def __init__(self, max_depth: int = MAX_QUEUE_DEPTH):
        self._queues: dict[str, list[SteeredMessage]] = {}
        self._seq = 0
        self._max_depth = max_depth

    @staticmethod
    def is_abort(text: str) -> bool:
        """Khoj abort_message 判定"""
        return text.strip().lower() in {ABORT_MESSAGE, "/stop", "abort"}

    def enqueue(self, session_id: str, text: str) -> Optional[SteeredMessage]:
        """运行中消息入队。队列满时拒绝新消息并记日志（AIHawk：截断/丢弃必须显式标记）。"""
        q = self._queues.setdefault(session_id, [])
        if len(q) >= self._max_depth:
            logger.warning(
                f"[steer] queue full for {session_id} (depth={len(q)}), dropping: {text[:80]}"
            )
            return None
        self._seq += 1
        msg = SteeredMessage(session_id=session_id, text=text, seq=self._seq)
        q.append(msg)
        logger.info(f"[steer] queued #{msg.seq} for {session_id}: {text[:80]}")
        return msg

    def drain(self, session_id: str, max_n: int = MAX_INJECTIONS_PER_TURN) -> list[SteeredMessage]:
        """turn间隙批量取出插话（goose: drain all pending between turns；nanobot: 每轮封顶）"""
        q = self._queues.get(session_id)
        if not q:
            return []
        taken = q[:max_n]
        self._queues[session_id] = q[max_n:]
        if not self._queues[session_id]:
            self._queues.pop(session_id, None)
        return taken

    def pending(self, session_id: str) -> int:
        """buffered通知数（goose peek三指标之一）"""
        return len(self._queues.get(session_id, []))

    def clear(self, session_id: str):
        self._queues.pop(session_id, None)


@dataclass
class SessionActivity:
    """会话活动观测 — goose peek三指标 + claude-code noop自报streak"""
    session_id: str
    status: str = "idle"                # idle / running / aborted
    durable_turns: int = 0              # goose: durable turn数（产出工具调用或流式文本的轮次）
    last_progress_at: float = 0.0       # goose: idle时长 = now - last_progress_at
    noop_streak: int = 0                # claude-code: 连续noop计数
    total_noops: int = 0
    max_noop_streak: int = 0
    tool_calls_total: int = 0
    steer_queued: int = 0               # 累计排队插话数
    steer_injected: int = 0             # 累计注入插话数
    aborted: int = 0
    started_at: float = 0.0
    updated_at: float = 0.0
    buffered: int = 0                   # 当前队列中的插话数（跨进程可观测）

    def mark_running(self):
        self.status = "running"
        self.started_at = self.started_at or time.time()
        self._touch()

    def mark_progress(self, tool: bool = False, tool_count: int = 0):
        """一轮真实进展：durable_turn+1，noop streak清零"""
        self.durable_turns += 1
        self.last_progress_at = time.time()
        self.noop_streak = 0
        if tool:
            self.tool_calls_total += tool_count
        self._touch()

    def report_noop(self):
        """claude-code: noop必须自报。连续noop折叠统计——'它卡住了'可观测。"""
        self.noop_streak += 1
        self.total_noops += 1
        if self.noop_streak > self.max_noop_streak:
            self.max_noop_streak = self.noop_streak
        self._touch()

    def mark_idle(self):
        self.status = "idle"
        self._touch()

    def mark_aborted(self):
        self.status = "aborted"
        self.aborted += 1
        self._touch()

    def _touch(self):
        self.updated_at = time.time()

    def idle_seconds(self, now: float | None = None) -> float:
        if not self.last_progress_at:
            return 0.0
        return round((now or time.time()) - self.last_progress_at, 1)

    def peek(self, now: float | None = None) -> dict:
        """goose peek三指标 + noop统计 + 插话统计"""
        return {
            "session_id": self.session_id,
            "status": self.status,
            # ── goose peek 三指标 ──
            "durable_turns": self.durable_turns,
            "idle_seconds": self.idle_seconds(now),
            "buffered": self.buffered,
            # ── claude-code noop自报 ──
            "noop_streak": self.noop_streak,
            "total_noops": self.total_noops,
            "max_noop_streak": self.max_noop_streak,
            # ── 插话队列 ──
            "steer_queued": self.steer_queued,
            "steer_injected": self.steer_injected,
            "tool_calls_total": self.tool_calls_total,
            "aborted": self.aborted,
            "started_at": self.started_at,
            "last_progress_at": self.last_progress_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "SessionActivity":
        return cls(**{k: row[k] for k in row.keys()})


class ActivityStore:
    """活动观测SQLite持久化 — agent子进程写，FastAPI(app.py)跨进程读

    soulmate agent以stdio子进程运行（每WS连接一个），HTTP peek端点在主进程——
    内存态不可共享，故每个状态变化UPSERT到SQLite。
    """

    def __init__(self, db_path: str = ""):
        self._db_path = db_path or str(
            Path(__file__).resolve().parent.parent / "data" / "agent_activity.db"
        )
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS agent_activity (
                    session_id TEXT PRIMARY KEY,
                    status TEXT DEFAULT 'idle',
                    durable_turns INTEGER DEFAULT 0,
                    last_progress_at REAL DEFAULT 0,
                    noop_streak INTEGER DEFAULT 0,
                    total_noops INTEGER DEFAULT 0,
                    max_noop_streak INTEGER DEFAULT 0,
                    tool_calls_total INTEGER DEFAULT 0,
                    steer_queued INTEGER DEFAULT 0,
                    steer_injected INTEGER DEFAULT 0,
                    aborted INTEGER DEFAULT 0,
                    started_at REAL DEFAULT 0,
                    updated_at REAL DEFAULT 0,
                    buffered INTEGER DEFAULT 0
                )
            """)

    def upsert(self, activity: SessionActivity):
        try:
            with self._conn() as conn:
                conn.execute("""
                    INSERT INTO agent_activity
                    (session_id, status, durable_turns, last_progress_at, noop_streak,
                     total_noops, max_noop_streak, tool_calls_total, steer_queued,
                     steer_injected, aborted, started_at, updated_at, buffered)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(session_id) DO UPDATE SET
                        status=excluded.status,
                        durable_turns=excluded.durable_turns,
                        last_progress_at=excluded.last_progress_at,
                        noop_streak=excluded.noop_streak,
                        total_noops=excluded.total_noops,
                        max_noop_streak=excluded.max_noop_streak,
                        tool_calls_total=excluded.tool_calls_total,
                        steer_queued=excluded.steer_queued,
                        steer_injected=excluded.steer_injected,
                        aborted=excluded.aborted,
                        started_at=excluded.started_at,
                        updated_at=excluded.updated_at,
                        buffered=excluded.buffered
                """, (
                    activity.session_id, activity.status, activity.durable_turns,
                    activity.last_progress_at, activity.noop_streak, activity.total_noops,
                    activity.max_noop_streak, activity.tool_calls_total, activity.steer_queued,
                    activity.steer_injected, activity.aborted, activity.started_at,
                    activity.updated_at, activity.buffered,
                ))
        except Exception as e:
            logger.error(f"Failed to upsert activity {activity.session_id}: {e}")

    def peek(self, session_id: str) -> Optional[dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM agent_activity WHERE session_id = ?", (session_id,)
            ).fetchone()
        if not row:
            return None
        return SessionActivity.from_row(row).peek()

    def peek_all(self) -> dict:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM agent_activity ORDER BY updated_at DESC"
            ).fetchall()
        now = time.time()
        sessions = [SessionActivity.from_row(r).peek(now) for r in rows]
        by_status: dict[str, int] = {}
        for s in sessions:
            by_status[s["status"]] = by_status.get(s["status"], 0) + 1
        return {
            "sessions": sessions,
            "summary": {
                "total_sessions": len(sessions),
                "by_status": by_status,
                "durable_turns_total": sum(s["durable_turns"] for s in sessions),
                "total_noops": sum(s["total_noops"] for s in sessions),
                "buffered_total": sum(s["buffered"] for s in sessions),
                "steer_injected_total": sum(s["steer_injected"] for s in sessions),
            },
        }
