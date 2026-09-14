"""
流式响应管理器 — 借鉴Vercel AI SDK的streamText + React Server Components streaming
核心思想：LLM流式输出 → 增量解析 → 实时推送到前端 → 支持中断/恢复
"""

import logging
import asyncio
import time
import json
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional, Callable, Any
from enum import Enum

logger = logging.getLogger("acp-proxy.stream-manager")


class StreamState(str, Enum):
    IDLE = "idle"
    STREAMING = "streaming"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"


@dataclass
class StreamChunk:
    chunk_id: str
    stream_id: str
    content: str
    is_final: bool = False
    timestamp: float = field(default_factory=time.time)
    metadata: dict = field(default_factory=dict)


@dataclass
class StreamSession:
    stream_id: str
    state: StreamState = StreamState.IDLE
    accumulated_content: str = ""
    chunk_count: int = 0
    started_at: float = 0.0
    completed_at: float = 0.0
    error: str = ""
    on_chunk: Optional[Callable] = None
    on_complete: Optional[Callable] = None
    on_error: Optional[Callable] = None


class StreamingResponseManager:
    """流式响应管理器"""

    def __init__(self):
        self._streams: dict[str, StreamSession] = {}
        self._cancel_events: dict[str, asyncio.Event] = {}
        self._stats = {
            "total_streams": 0,
            "completed_streams": 0,
            "cancelled_streams": 0,
            "error_streams": 0,
            "total_chunks": 0,
        }

    async def create_stream(
        self,
        on_chunk: Optional[Callable] = None,
        on_complete: Optional[Callable] = None,
        on_error: Optional[Callable] = None,
    ) -> str:
        """创建新的流式会话"""
        stream_id = f"stream_{uuid.uuid4().hex[:12]}"
        session = StreamSession(
            stream_id=stream_id,
            state=StreamState.IDLE,
            started_at=time.time(),
            on_chunk=on_chunk,
            on_complete=on_complete,
            on_error=on_error,
        )
        self._streams[stream_id] = session
        self._cancel_events[stream_id] = asyncio.Event()
        self._stats["total_streams"] += 1
        logger.debug(f"Created stream: {stream_id}")
        return stream_id

    async def process_stream(
        self,
        stream_id: str,
        source: AsyncIterator[str],
        buffer_size: int = 10,
    ) -> str:
        """处理流式数据源"""
        session = self._streams.get(stream_id)
        if not session:
            raise ValueError(f"Stream {stream_id} not found")

        session.state = StreamState.STREAMING
        cancel_event = self._cancel_events[stream_id]
        buffer: list[str] = []

        try:
            async for chunk in source:
                # 检查取消
                if cancel_event.is_set():
                    session.state = StreamState.CANCELLED
                    self._stats["cancelled_streams"] += 1
                    logger.info(f"Stream {stream_id} cancelled")
                    break

                session.accumulated_content += chunk
                session.chunk_count += 1
                self._stats["total_chunks"] += 1

                # 缓冲区满时触发回调
                buffer.append(chunk)
                if len(buffer) >= buffer_size:
                    merged = "".join(buffer)
                    buffer.clear()
                    if session.on_chunk:
                        try:
                            await session.on_chunk(merged)
                        except Exception as e:
                            logger.warning(f"on_chunk callback error: {e}")

            # 处理剩余缓冲
            if buffer:
                merged = "".join(buffer)
                if session.on_chunk:
                    try:
                        await session.on_chunk(merged)
                    except Exception as e:
                        logger.warning(f"on_chunk callback error: {e}")

            if session.state != StreamState.CANCELLED:
                session.state = StreamState.COMPLETED
                session.completed_at = time.time()
                self._stats["completed_streams"] += 1

                if session.on_complete:
                    try:
                        await session.on_complete(session.accumulated_content)
                    except Exception as e:
                        logger.warning(f"on_complete callback error: {e}")

        except Exception as e:
            session.state = StreamState.ERROR
            session.error = str(e)
            session.completed_at = time.time()
            self._stats["error_streams"] += 1
            logger.error(f"Stream {stream_id} error: {e}")

            if session.on_error:
                try:
                    await session.on_error(e)
                except Exception as callback_err:
                    logger.warning(f"on_error callback error: {callback_err}")

        return session.accumulated_content

    def cancel_stream(self, stream_id: str):
        """取消流式输出"""
        cancel_event = self._cancel_events.get(stream_id)
        if cancel_event:
            cancel_event.set()
            logger.info(f"Cancel requested for stream {stream_id}")

    def get_stream_state(self, stream_id: str) -> Optional[dict]:
        """获取流状态"""
        session = self._streams.get(stream_id)
        if not session:
            return None
        return {
            "stream_id": session.stream_id,
            "state": session.state.value,
            "chunk_count": session.chunk_count,
            "content_length": len(session.accumulated_content),
            "started_at": session.started_at,
            "completed_at": session.completed_at,
            "duration_seconds": (
                (session.completed_at or time.time()) - session.started_at
            ),
            "error": session.error,
        }

    def get_active_streams(self) -> list[dict]:
        """获取所有活跃流"""
        return [
            self.get_stream_state(sid)
            for sid, session in self._streams.items()
            if session.state == StreamState.STREAMING
        ]

    def cleanup_completed(self, max_age_seconds: float = 300):
        """清理已完成的旧流"""
        now = time.time()
        to_remove = []
        for sid, session in self._streams.items():
            if session.state in (StreamState.COMPLETED, StreamState.ERROR, StreamState.CANCELLED):
                if session.completed_at and now - session.completed_at > max_age_seconds:
                    to_remove.append(sid)
        for sid in to_remove:
            del self._streams[sid]
            self._cancel_events.pop(sid, None)

    def get_stats(self) -> dict:
        active = sum(1 for s in self._streams.values() if s.state == StreamState.STREAMING)
        return {
            **self._stats,
            "active_streams": active,
            "total_managed_streams": len(self._streams),
        }


class IncrementalJSONParser:
    """增量JSON解析器 — 处理流式JSON输出"""

    def __init__(self):
        self._buffer = ""
        self._depth = 0
        self._in_string = False
        self._escape_next = False

    def feed(self, chunk: str) -> list[dict]:
        """喂入数据，返回完成的JSON对象"""
        self._buffer += chunk
        completed: list[dict] = []

        while self._buffer:
            result = self._try_extract_json()
            if result is None:
                break
            completed.append(result)

        return completed

    def _try_extract_json(self) -> Optional[dict]:
        """尝试从buffer中提取一个完整的JSON对象"""
        start = self._buffer.find("{")
        if start == -1:
            self._buffer = ""
            return None

        depth = 0
        in_string = False
        escape = False

        for i in range(start, len(self._buffer)):
            c = self._buffer[i]

            if escape:
                escape = False
                continue
            if c == "\\":
                escape = True
                continue
            if c == '"' and not escape:
                in_string = not in_string
                continue
            if in_string:
                continue

            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    json_str = self._buffer[start:i + 1]
                    self._buffer = self._buffer[i + 1:]
                    try:
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        return None

        return None

    def reset(self):
        self._buffer = ""
