"""A2A 全链路日志模块。

提供结构化的请求/响应日志，支持：
- 请求入口日志（method, request_id, client_ip）
- 响应出口日志（status, elapsed_ms）
- Agent任务执行日志（task_id, state transitions）
- 错误日志（异常堆栈 + 上下文）
"""

from __future__ import annotations

import logging
import time
import uuid
from contextvars import ContextVar
from typing import Any, Optional

logger = logging.getLogger("a2a.tracing")

# 请求级别的trace_id，通过ContextVar在异步调用链中传递
_trace_id_var: ContextVar[str] = ContextVar("a2a_trace_id", default="")


def get_trace_id() -> str:
    """获取当前请求的trace_id。"""
    return _trace_id_var.get()


def set_trace_id(trace_id: str) -> None:
    """设置当前请求的trace_id。"""
    _trace_id_var.set(trace_id)


def generate_trace_id() -> str:
    """生成新的trace_id（短UUID格式）。"""
    return uuid.uuid4().hex[:12]


class RequestTimer:
    """请求计时器，用于记录请求耗时。

    用法:
        timer = RequestTimer()
        # ... 处理请求 ...
        elapsed = timer.elapsed_ms()
    """

    def __init__(self) -> None:
        self._start = time.monotonic()

    def elapsed_ms(self) -> float:
        """返回从创建到现在的毫秒数。"""
        return (time.monotonic() - self._start) * 1000


def log_request(method: str, request_id: Any, client_ip: str = "") -> RequestTimer:
    """记录请求入口日志并返回计时器。

    Args:
        method: JSON-RPC 方法名
        request_id: JSON-RPC 请求ID
        client_ip: 客户端IP

    Returns:
        RequestTimer 实例，用于后续计算耗时
    """
    trace_id = generate_trace_id()
    set_trace_id(trace_id)
    timer = RequestTimer()

    logger.info(
        f"[A2A→] method={method} id={request_id} "
        f"trace={trace_id} client={client_ip}"
    )
    return timer


def log_response(
    method: str,
    request_id: Any,
    timer: RequestTimer,
    status: str = "ok",
    error_code: Optional[int] = None,
) -> None:
    """记录响应出口日志。

    Args:
        method: JSON-RPC 方法名
        request_id: JSON-RPC 请求ID
        timer: 请求计时器
        status: 响应状态（ok / error）
        error_code: 错误码（仅错误时有值）
    """
    elapsed = timer.elapsed_ms()
    trace_id = get_trace_id()

    if status == "ok":
        logger.info(
            f"[A2A←] method={method} id={request_id} "
            f"trace={trace_id} status={status} elapsed={elapsed:.1f}ms"
        )
    else:
        logger.warning(
            f"[A2A←] method={method} id={request_id} "
            f"trace={trace_id} status={status} error_code={error_code} elapsed={elapsed:.1f}ms"
        )


def log_task_event(task_id: str, event: str, detail: str = "") -> None:
    """记录任务生命周期事件。

    Args:
        task_id: Task ID
        event: 事件类型（created, status_changed, completed, failed 等）
        detail: 附加描述
    """
    trace_id = get_trace_id()
    msg = f"[A2A:task] task={task_id} event={event} trace={trace_id}"
    if detail:
        msg += f" detail={detail}"
    logger.info(msg)


def log_error(context: str, error: Exception, task_id: Optional[str] = None) -> None:
    """记录错误日志，附带上下文信息。

    Args:
        context: 错误发生的上下文描述
        error: 异常对象
        task_id: 关联的Task ID（可选）
    """
    trace_id = get_trace_id()
    msg = f"[A2A:error] context={context} trace={trace_id}"
    if task_id:
        msg += f" task={task_id}"
    logger.error(msg, exc_info=error)
