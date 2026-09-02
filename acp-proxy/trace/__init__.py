"""TraceId 全链路追踪模块 — 对齐 Log&Trace v1.0 规范。

提供：
- 全局唯一traceId生成
- 全链路Header透传（X-Trace-Id）
- 统一日志格式（traceId, spanId, timestamp, level）
- span生命周期管理
"""

from __future__ import annotations

import logging
import time
import uuid
from contextvars import ContextVar
from typing import Any

logger = logging.getLogger("trace")

# ---------------------------------------------------------------------------
# Context变量 — 每个请求独立
# ---------------------------------------------------------------------------

_current_trace_id: ContextVar[str] = ContextVar("trace_id", default="")
_current_span_id: ContextVar[str] = ContextVar("span_id", default="")
_current_parent_span_id: ContextVar[str] = ContextVar("parent_span_id", default="")

# ---------------------------------------------------------------------------
# ID生成
# ---------------------------------------------------------------------------

def generate_trace_id() -> str:
    """生成全局唯一traceId（16位hex）。"""
    return uuid.uuid4().hex[:16]


def generate_span_id() -> str:
    """生成spanId（8位hex）。"""
    return uuid.uuid4().hex[:8]


# ---------------------------------------------------------------------------
# Context操作
# ---------------------------------------------------------------------------

def set_trace_id(trace_id: str) -> None:
    """设置当前请求的traceId。"""
    _current_trace_id.set(trace_id)


def get_trace_id() -> str:
    """获取当前请求的traceId，未设置则自动生成。"""
    tid = _current_trace_id.get()
    if not tid:
        tid = generate_trace_id()
        _current_trace_id.set(tid)
    return tid


def set_span_id(span_id: str) -> None:
    """设置当前spanId。"""
    _current_span_id.set(span_id)


def get_span_id() -> str:
    """获取当前spanId。"""
    return _current_span_id.get() or generate_span_id()


# ---------------------------------------------------------------------------
# Span 上下文管理器
# ---------------------------------------------------------------------------

class Span:
    """追踪span — 记录一段操作的耗时和状态。

    用法：
        async with Span("llm_call") as span:
            result = await call_llm()
            span.set_attribute("model", "mimo-v2.5-pro")
    """

    def __init__(self, name: str, attributes: dict[str, Any] | None = None):
        self.name = name
        self.attributes = attributes or {}
        self.trace_id = get_trace_id()
        self.parent_span_id = get_span_id()
        self.span_id = generate_span_id()
        self.start_time = 0.0
        self.end_time = 0.0
        self.status = "ok"
        self._prev_span_token = None

    async def __aenter__(self) -> Span:
        self.start_time = time.time()
        self._prev_span_token = _current_span_id.set(self.span_id)
        _current_parent_span_id.set(self.parent_span_id)
        logger.info(f"[{self.trace_id}:{self.span_id}] → {self.name} start")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        self.end_time = time.time()
        elapsed_ms = int((self.end_time - self.start_time) * 1000)
        if exc_type:
            self.status = "error"
            self.attributes["error"] = str(exc_val)
        logger.info(f"[{self.trace_id}:{self.span_id}] ← {self.name} {self.status} {elapsed_ms}ms")
        if self._prev_span_token:
            _current_span_id.reset(self._prev_span_token)

    def set_attribute(self, key: str, value: Any) -> None:
        """设置span属性。"""
        self.attributes[key] = value

    def record_error(self, error: Exception) -> None:
        """记录错误。"""
        self.status = "error"
        self.attributes["error"] = str(error)
        self.attributes["error_type"] = type(error).__name__


# ---------------------------------------------------------------------------
# 统一日志格式
# ---------------------------------------------------------------------------

def log_with_trace(level: int, message: str, **extra) -> None:
    """带traceId的统一日志。"""
    trace_id = get_trace_id()
    span_id = get_span_id()
    timestamp = int(time.time() * 1000)
    logger.log(level, f"[{trace_id}:{span_id}] {message}", extra={"trace_id": trace_id, "span_id": span_id, "timestamp": timestamp, **extra})


# ---------------------------------------------------------------------------
# Header提取
# ---------------------------------------------------------------------------

def extract_trace_id_from_headers(headers: dict[str, str]) -> str:
    """从请求Header中提取traceId。"""
    return headers.get("x-trace-id", "") or headers.get("X-Trace-Id", "")
