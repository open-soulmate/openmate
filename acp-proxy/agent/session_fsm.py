"""
会话状态机 — 借鉴LangGraph StateGraph + XState有限状态机
核心思想：会话有明确定义的状态和转换规则，非法转换自动拒绝
"""

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional, Callable
from enum import Enum

logger = logging.getLogger("acp-proxy.session-fsm")


class SessionState(str, Enum):
    IDLE = "idle"                    # 空闲
    LISTENING = "listening"          # 等待用户输入
    PROCESSING = "processing"        # LLM处理中
    TOOL_EXECUTING = "tool_executing"  # 工具执行中
    STREAMING = "streaming"          # 流式输出中
    WAITING_CONFIRMATION = "waiting_confirmation"  # 等待用户确认
    ERROR = "error"                  # 错误状态
    PAUSED = "paused"               # 暂停
    ARCHIVED = "archived"           # 已归档


class SessionEvent(str, Enum):
    USER_MESSAGE = "user_message"
    LLM_START = "llm_start"
    LLM_COMPLETE = "llm_complete"
    TOOL_CALL = "tool_call"
    TOOL_COMPLETE = "tool_complete"
    STREAM_START = "stream_start"
    STREAM_END = "stream_end"
    ERROR = "error"
    PAUSE = "pause"
    RESUME = "resume"
    CONFIRM = "confirm"
    CANCEL = "cancel"
    ARCHIVE = "archive"
    RESET = "reset"


# 状态转换表：(当前状态, 事件) → 新状态
TRANSITIONS: dict[tuple[SessionState, SessionEvent], SessionState] = {
    # 从IDLE
    (SessionState.IDLE, SessionEvent.USER_MESSAGE): SessionState.PROCESSING,
    (SessionState.IDLE, SessionEvent.ARCHIVE): SessionState.ARCHIVED,

    # 从LISTENING
    (SessionState.LISTENING, SessionEvent.USER_MESSAGE): SessionState.PROCESSING,
    (SessionState.LISTENING, SessionEvent.ARCHIVE): SessionState.ARCHIVED,

    # 从PROCESSING
    (SessionState.PROCESSING, SessionEvent.LLM_COMPLETE): SessionState.LISTENING,
    (SessionState.PROCESSING, SessionEvent.TOOL_CALL): SessionState.TOOL_EXECUTING,
    (SessionState.PROCESSING, SessionEvent.STREAM_START): SessionState.STREAMING,
    (SessionState.PROCESSING, SessionEvent.ERROR): SessionState.ERROR,
    (SessionState.PROCESSING, SessionEvent.PAUSE): SessionState.PAUSED,

    # 从TOOL_EXECUTING
    (SessionState.TOOL_EXECUTING, SessionEvent.TOOL_COMPLETE): SessionState.PROCESSING,
    (SessionState.TOOL_EXECUTING, SessionEvent.ERROR): SessionState.ERROR,
    (SessionState.TOOL_EXECUTING, SessionEvent.USER_MESSAGE): SessionState.WAITING_CONFIRMATION,

    # 从STREAMING
    (SessionState.STREAMING, SessionEvent.STREAM_END): SessionState.LISTENING,
    (SessionState.STREAMING, SessionEvent.ERROR): SessionState.ERROR,
    (SessionState.STREAMING, SessionEvent.CANCEL): SessionState.LISTENING,

    # 从WAITING_CONFIRMATION
    (SessionState.WAITING_CONFIRMATION, SessionEvent.CONFIRM): SessionState.PROCESSING,
    (SessionState.WAITING_CONFIRMATION, SessionEvent.CANCEL): SessionState.LISTENING,

    # 从ERROR
    (SessionState.ERROR, SessionEvent.RESET): SessionState.IDLE,
    (SessionState.ERROR, SessionEvent.USER_MESSAGE): SessionState.PROCESSING,

    # 从PAUSED
    (SessionState.PAUSED, SessionEvent.RESUME): SessionState.PROCESSING,
    (SessionState.PAUSED, SessionEvent.CANCEL): SessionState.LISTENING,

    # 从ARCHIVED（不可转换）
}


@dataclass
class StateTransition:
    transition_id: str
    from_state: SessionState
    to_state: SessionState
    event: SessionEvent
    timestamp: float
    metadata: dict = field(default_factory=dict)


@dataclass
class SessionContext:
    session_id: str
    state: SessionState = SessionState.IDLE
    state_entered_at: float = field(default_factory=time.time)
    transition_history: list[StateTransition] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


class SessionStateMachine:
    """会话状态机"""

    def __init__(self):
        self._contexts: dict[str, SessionContext] = {}
        self._on_state_change: list[Callable] = []
        self._stats = {
            "total_transitions": 0,
            "rejected_transitions": 0,
            "transitions_by_type": {},
        }

    def create_session(self, session_id: str) -> SessionContext:
        """创建会话上下文"""
        ctx = SessionContext(session_id=session_id)
        self._contexts[session_id] = ctx
        logger.debug(f"Created session FSM: {session_id}")
        return ctx

    def get_state(self, session_id: str) -> Optional[SessionState]:
        """获取会话当前状态"""
        ctx = self._contexts.get(session_id)
        return ctx.state if ctx else None

    def can_transition(self, session_id: str, event: SessionEvent) -> bool:
        """检查是否可以转换"""
        ctx = self._contexts.get(session_id)
        if not ctx:
            return False
        return (ctx.state, event) in TRANSITIONS

    def transition(
        self,
        session_id: str,
        event: SessionEvent,
        metadata: Optional[dict] = None,
    ) -> Optional[SessionState]:
        """执行状态转换"""
        ctx = self._contexts.get(session_id)
        if not ctx:
            logger.warning(f"Session {session_id} not found")
            return None

        key = (ctx.state, event)
        if key not in TRANSITIONS:
            self._stats["rejected_transitions"] += 1
            logger.warning(
                f"Invalid transition: {ctx.state.value} + {event.value} "
                f"(session: {session_id})"
            )
            return None

        old_state = ctx.state
        new_state = TRANSITIONS[key]

        # 记录转换
        transition = StateTransition(
            transition_id=f"tr_{uuid.uuid4().hex[:8]}",
            from_state=old_state,
            to_state=new_state,
            event=event,
            timestamp=time.time(),
            metadata=metadata or {},
        )
        ctx.transition_history.append(transition)

        # 更新状态
        ctx.state = new_state
        ctx.state_entered_at = time.time()

        # 统计
        self._stats["total_transitions"] += 1
        trans_key = f"{old_state.value}->{new_state.value}"
        self._stats["transitions_by_type"][trans_key] = \
            self._stats["transitions_by_type"].get(trans_key, 0) + 1

        # 通知监听器
        for cb in self._on_state_change:
            try:
                cb(session_id, old_state, new_state, event)
            except Exception as e:
                logger.warning(f"State change callback error: {e}")

        logger.debug(
            f"Session {session_id}: {old_state.value} -> {new_state.value} "
            f"(event: {event.value})"
        )

        return new_state

    def on_state_change(self, callback: Callable):
        """注册状态变化监听器"""
        self._on_state_change.append(callback)

    def get_session_duration(self, session_id: str, state: SessionState) -> float:
        """获取会话在某状态的累计时长"""
        ctx = self._contexts.get(session_id)
        if not ctx:
            return 0.0

        total = 0.0
        for i, tr in enumerate(ctx.transition_history):
            if tr.to_state == state:
                # 找到下一个转换作为结束时间
                if i + 1 < len(ctx.transition_history):
                    end_time = ctx.transition_history[i + 1].timestamp
                else:
                    end_time = time.time()
                total += end_time - tr.timestamp

        return total

    def force_state(self, session_id: str, state: SessionState, reason: str = ""):
        """强制设置状态（用于错误恢复）"""
        ctx = self._contexts.get(session_id)
        if not ctx:
            return

        old_state = ctx.state
        ctx.state = state
        ctx.state_entered_at = time.time()

        logger.warning(
            f"Force state change: {old_state.value} -> {state.value} "
            f"(reason: {reason})"
        )

    def get_stats(self) -> dict:
        return {
            **self._stats,
            "active_sessions": len(self._contexts),
            "sessions_by_state": {
                state.value: sum(
                    1 for ctx in self._contexts.values() if ctx.state == state
                )
                for state in SessionState
            },
        }

    def cleanup_inactive(self, max_age_seconds: float = 3600):
        """清理不活跃的会话"""
        now = time.time()
        to_remove = []
        for sid, ctx in self._contexts.items():
            if ctx.state in (SessionState.IDLE, SessionState.ARCHIVED):
                if now - ctx.state_entered_at > max_age_seconds:
                    to_remove.append(sid)
        for sid in to_remove:
            del self._contexts[sid]
        if to_remove:
            logger.info(f"Cleaned up {len(to_remove)} inactive sessions")
