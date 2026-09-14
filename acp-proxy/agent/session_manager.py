"""
Agent并发会话管理器 — 借鉴Celery worker pool + Redis session管理
核心思想：管理多个并发会话的生命周期，防止资源竞争，支持会话隔离
"""

import logging
import time
import uuid
import asyncio
from dataclasses import dataclass, field
from typing import Optional, Any
from enum import Enum

logger = logging.getLogger("acp-proxy.session-manager")


class SessionState(str, Enum):
    CREATED = "created"
    ACTIVE = "active"
    IDLE = "idle"
    PAUSED = "paused"
    TERMINATED = "terminated"


@dataclass
class SessionInfo:
    session_id: str
    user_id: str = ""
    state: SessionState = SessionState.CREATED
    created_at: float = field(default_factory=time.time)
    last_activity_at: float = field(default_factory=time.time)
    message_count: int = 0
    token_usage: int = 0
    tool_calls: int = 0
    metadata: dict = field(default_factory=dict)
    lock: Optional[asyncio.Lock] = None

    @property
    def idle_seconds(self) -> float:
        return time.time() - self.last_activity_at

    @property
    def duration_seconds(self) -> float:
        return time.time() - self.created_at


class ConcurrentSessionManager:
    """并发会话管理器"""

    def __init__(
        self,
        max_concurrent: int = 10,
        idle_timeout: float = 1800.0,  # 30分钟
    ):
        self.max_concurrent = max_concurrent
        self.idle_timeout = idle_timeout
        self._sessions: dict[str, SessionInfo] = {}
        self._stats = {
            "total_created": 0,
            "total_terminated": 0,
            "peak_concurrent": 0,
        }

    def create_session(
        self,
        user_id: str = "",
        metadata: Optional[dict] = None,
    ) -> Optional[SessionInfo]:
        """创建新会话"""
        # 清理过期会话
        self.cleanup_idle()

        # 检查并发限制
        active = sum(
            1 for s in self._sessions.values()
            if s.state in (SessionState.ACTIVE, SessionState.IDLE)
        )
        if active >= self.max_concurrent:
            logger.warning(f"Max concurrent sessions reached ({self.max_concurrent})")
            return None

        session_id = f"sess_{uuid.uuid4().hex[:12]}"
        info = SessionInfo(
            session_id=session_id,
            user_id=user_id,
            state=SessionState.ACTIVE,
            metadata=metadata or {},
            lock=asyncio.Lock(),
        )

        self._sessions[session_id] = info
        self._stats["total_created"] += 1

        current = active + 1
        if current > self._stats["peak_concurrent"]:
            self._stats["peak_concurrent"] = current

        logger.info(f"Created session {session_id} (active: {current})")
        return info

    def get_session(self, session_id: str) -> Optional[SessionInfo]:
        return self._sessions.get(session_id)

    def touch_session(self, session_id: str):
        """更新会话活动时间"""
        info = self._sessions.get(session_id)
        if info:
            info.last_activity_at = time.time()
            if info.state == SessionState.IDLE:
                info.state = SessionState.ACTIVE

    def record_activity(
        self,
        session_id: str,
        messages: int = 0,
        tokens: int = 0,
        tool_calls: int = 0,
    ):
        """记录会话活动"""
        info = self._sessions.get(session_id)
        if info:
            info.message_count += messages
            info.token_usage += tokens
            info.tool_calls += tool_calls
            info.last_activity_at = time.time()

    def pause_session(self, session_id: str):
        info = self._sessions.get(session_id)
        if info:
            info.state = SessionState.PAUSED

    def resume_session(self, session_id: str):
        info = self._sessions.get(session_id)
        if info:
            info.state = SessionState.ACTIVE
            info.last_activity_at = time.time()

    def terminate_session(self, session_id: str):
        info = self._sessions.get(session_id)
        if info:
            info.state = SessionState.TERMINATED
            self._stats["total_terminated"] += 1
            # 保留信息但标记为终止
            logger.info(f"Terminated session {session_id}")

    def cleanup_idle(self) -> int:
        """清理空闲超时的会话"""
        to_remove = []
        for sid, info in self._sessions.items():
            if info.state in (SessionState.ACTIVE, SessionState.IDLE):
                if info.idle_seconds > self.idle_timeout:
                    info.state = SessionState.TERMINATED
                    to_remove.append(sid)

        for sid in to_remove:
            self._sessions[sid].state = SessionState.TERMINATED
            self._stats["total_terminated"] += 1

        if to_remove:
            logger.info(f"Cleaned up {len(to_remove)} idle sessions")

        return len(to_remove)

    def get_session_lock(self, session_id: str) -> Optional[asyncio.Lock]:
        """获取会话锁（用于防止并发写入）"""
        info = self._sessions.get(session_id)
        if info and info.lock is None:
            info.lock = asyncio.Lock()
        return info.lock if info else None

    def list_sessions(
        self,
        state: Optional[SessionState] = None,
        user_id: str = "",
    ) -> list[dict]:
        """列出会话"""
        sessions = []
        for info in self._sessions.values():
            if state and info.state != state:
                continue
            if user_id and info.user_id != user_id:
                continue

            sessions.append({
                "session_id": info.session_id,
                "user_id": info.user_id,
                "state": info.state.value,
                "duration_seconds": round(info.duration_seconds, 1),
                "idle_seconds": round(info.idle_seconds, 1),
                "message_count": info.message_count,
                "token_usage": info.token_usage,
                "tool_calls": info.tool_calls,
            })

        return sorted(sessions, key=lambda s: s["duration_seconds"], reverse=True)

    def get_stats(self) -> dict:
        active = sum(
            1 for s in self._sessions.values()
            if s.state in (SessionState.ACTIVE, SessionState.IDLE)
        )
        return {
            **self._stats,
            "current_active": active,
            "current_total": len(self._sessions),
            "max_concurrent": self.max_concurrent,
            "idle_timeout_seconds": self.idle_timeout,
        }
