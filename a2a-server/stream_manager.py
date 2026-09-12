"""A2A SSE 流式连接管理器。

管理 tasks/sendSubscribe 的SSE连接生命周期。
使用 asyncio.Queue 实现事件推送与消费的解耦。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sse_events import SSEEvent

logger = logging.getLogger("a2a.stream_manager")


class StreamManager:
    """SSE连接管理器，按 task_id 管理订阅队列。"""

    def __init__(self) -> None:
        # task_id → list[asyncio.Queue]
        self._subscriptions: dict[str, list[asyncio.Queue[SSEEvent | None]]] = {}

    def subscribe(self, task_id: str) -> asyncio.Queue[SSEEvent | None]:
        """为指定 task_id 创建订阅队列。

        Returns:
            新创建的 asyncio.Queue，消费者从此队列读取事件。
            收到 None 表示流结束。
        """
        queue: asyncio.Queue[SSEEvent | None] = asyncio.Queue()
        self._subscriptions.setdefault(task_id, []).append(queue)
        logger.debug(f"subscribe: task_id={task_id}, total={len(self._subscriptions[task_id])}")
        return queue

    def unsubscribe(self, task_id: str, queue: asyncio.Queue[SSEEvent | None]) -> None:
        """移除订阅队列。"""
        subs = self._subscriptions.get(task_id, [])
        if queue in subs:
            subs.remove(queue)
            logger.debug(f"unsubscribe: task_id={task_id}, remaining={len(subs)}")
        if not subs:
            self._subscriptions.pop(task_id, None)

    async def broadcast(self, task_id: str, event: SSEEvent) -> None:
        """向指定 task_id 的所有订阅者广播事件。"""
        subs = self._subscriptions.get(task_id, [])
        for queue in subs:
            await queue.put(event)
        logger.debug(f"broadcast: task_id={task_id}, event_type={event.type}, subscribers={len(subs)}")

    async def broadcast_event(self, event_type: str, data: dict[str, Any]) -> None:
        """向所有订阅者广播事件（不限 task_id）。

        用于全局事件如 artifact.update、agent.status 等。
        """
        # 构造SSE数据，不直接实例化Union类型
        event_data = {"type": event_type, **data}
        count = 0
        for task_id, subs in self._subscriptions.items():
            for queue in subs:
                # 用字典直接推送，SSEEvent是Union不能直接实例化
                await queue.put(event_data)  # type: ignore[arg-type]
                count += 1
        logger.debug(f"broadcast_event: event_type={event_type}, total_subscribers={count}")

    async def close(self, task_id: str) -> None:
        """关闭指定 task_id 的所有订阅（发送 None 哨兵）。"""
        subs = self._subscriptions.pop(task_id, [])
        for queue in subs:
            await queue.put(None)
        logger.debug(f"close: task_id={task_id}, closed={len(subs)}")


# 全局单例
_stream_manager: StreamManager | None = None


def get_stream_manager() -> StreamManager:
    """获取全局 StreamManager 单例。"""
    global _stream_manager
    if _stream_manager is None:
        _stream_manager = StreamManager()
    return _stream_manager
