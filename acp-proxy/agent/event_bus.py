"""
事件总线系统 — 借鉴Redis Pub/Sub + Node.js EventEmitter + RxJS Observable
核心思想：解耦组件通信，支持同步/异步事件、优先级队列、事件回放
"""

import logging
import asyncio
import time
import uuid
import json
from dataclasses import dataclass, field
from typing import Any, Optional, Callable, Awaitable
from enum import Enum
from collections import defaultdict

logger = logging.getLogger("acp-proxy.event-bus")


class EventPriority(int, Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


@dataclass
class Event:
    event_id: str
    event_type: str
    data: Any = None
    source: str = ""
    timestamp: float = field(default_factory=time.time)
    priority: EventPriority = EventPriority.NORMAL
    metadata: dict = field(default_factory=dict)
    reply_to: str = ""  # 用于request-response模式

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "data": self.data,
            "source": self.source,
            "timestamp": self.timestamp,
            "priority": self.priority.value,
            "metadata": self.metadata,
        }


class EventBus:
    """事件总线"""

    def __init__(self, max_history: int = 1000):
        self._subscribers: dict[str, list[Callable]] = defaultdict(list)
        self._wildcard_subscribers: list[Callable] = []
        self._event_history: list[Event] = []
        self._max_history = max_history
        self._stats = {
            "total_events": 0,
            "total_subscribers": 0,
            "events_by_type": defaultdict(int),
        }

    def subscribe(
        self,
        event_type: str,
        callback: Callable[[Event], Awaitable[None]],
    ) -> str:
        """订阅事件"""
        sub_id = f"sub_{uuid.uuid4().hex[:8]}"
        self._subscribers[event_type].append(callback)
        self._stats["total_subscribers"] += 1
        logger.debug(f"Subscribed to {event_type}: {sub_id}")
        return sub_id

    def subscribe_all(
        self,
        callback: Callable[[Event], Awaitable[None]],
    ):
        """订阅所有事件（通配符）"""
        self._wildcard_subscribers.append(callback)
        self._stats["total_subscribers"] += 1

    def unsubscribe(self, event_type: str, callback: Callable):
        """取消订阅"""
        if event_type in self._subscribers:
            try:
                self._subscribers[event_type].remove(callback)
                self._stats["total_subscribers"] -= 1
            except ValueError:
                pass

    async def publish(self, event: Event):
        """发布事件"""
        self._stats["total_events"] += 1
        self._stats["events_by_type"][event.event_type] += 1

        # 记录历史
        self._event_history.append(event)
        if len(self._event_history) > self._max_history:
            self._event_history = self._event_history[-self._max_history:]

        # 通知特定类型订阅者
        callbacks = self._subscribers.get(event.event_type, [])
        tasks = [cb(event) for cb in callbacks]

        # 通知通配符订阅者
        tasks.extend(cb(event) for cb in self._wildcard_subscribers)

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, Exception):
                    logger.error(f"Event handler error: {result}")

        logger.debug(
            f"Published event: {event.event_type} "
            f"(id={event.event_id[:12]}, handlers={len(tasks)})"
        )

    async def emit(
        self,
        event_type: str,
        data: Any = None,
        source: str = "",
        priority: EventPriority = EventPriority.NORMAL,
    ) -> Event:
        """快捷发布事件"""
        event = Event(
            event_id=f"evt_{uuid.uuid4().hex[:12]}",
            event_type=event_type,
            data=data,
            source=source,
            priority=priority,
        )
        await self.publish(event)
        return event

    async def request(
        self,
        event_type: str,
        data: Any = None,
        timeout: float = 5.0,
    ) -> Optional[Event]:
        """请求-响应模式"""
        reply_event_type = f"{event_type}.reply.{uuid.uuid4().hex[:8]}"
        future: asyncio.Future = asyncio.get_event_loop().create_future()

        async def on_reply(event: Event):
            if not future.done():
                future.set_result(event)

        self.subscribe(reply_event_type, on_reply)

        try:
            await self.emit(
                event_type,
                {**(data or {}), "_reply_to": reply_event_type},
            )
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(f"Request timeout: {event_type}")
            return None
        finally:
            self.unsubscribe(reply_event_type, on_reply)

    def get_history(
        self,
        event_type: str = "",
        limit: int = 50,
    ) -> list[dict]:
        """获取事件历史"""
        events = self._event_history
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        return [e.to_dict() for e in events[-limit:]]

    def get_stats(self) -> dict:
        return {
            "total_events": self._stats["total_events"],
            "total_subscribers": self._stats["total_subscribers"],
            "event_types": len(self._subscribers),
            "history_size": len(self._event_history),
            "top_event_types": dict(
                sorted(
                    self._stats["events_by_type"].items(),
                    key=lambda x: -x[1],
                )[:10]
            ),
        }


class EventSourcedState:
    """事件溯源状态管理 — 借鉴Event Sourcing模式"""

    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self._state: dict[str, Any] = {}
        self._event_log: list[Event] = []

    async def dispatch(self, event_type: str, data: Any) -> Any:
        """派发事件并更新状态"""
        event = await self.event_bus.emit(event_type, data)
        self._event_log.append(event)

        # 应用事件到状态
        self._apply_event(event)

        return self._state

    def _apply_event(self, event: Event):
        """应用事件到状态（saga模式）"""
        if event.event_type == "session.created":
            session_id = event.data.get("session_id", "")
            self._state[f"session_{session_id}"] = {
                "created_at": event.timestamp,
                "status": "active",
            }
        elif event.event_type == "session.closed":
            session_id = event.data.get("session_id", "")
            key = f"session_{session_id}"
            if key in self._state:
                self._state[key]["status"] = "closed"
                self._state[key]["closed_at"] = event.timestamp
        elif event.event_type == "tool.executed":
            tool_name = event.data.get("tool_name", "")
            count_key = f"tool_count_{tool_name}"
            self._state[count_key] = self._state.get(count_key, 0) + 1

    def get_state(self) -> dict:
        return dict(self._state)

    def replay_events(self, events: list[Event]):
        """重放事件恢复状态"""
        self._state.clear()
        for event in events:
            self._apply_event(event)
        logger.info(f"Replayed {len(events)} events, state restored")


# 全局事件总线实例
_global_event_bus: Optional[EventBus] = None


def get_event_bus() -> EventBus:
    """获取全局事件总线"""
    global _global_event_bus
    if _global_event_bus is None:
        _global_event_bus = EventBus()
    return _global_event_bus
