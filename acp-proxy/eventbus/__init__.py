"""EventBus v1.0 — 全局事件总线模块。

OpenMate ACP-Proxy 的事件驱动基础设施。提供：

- **Event / EventType / EventMeta / Subscription**：标准事件数据模型
- **EventBus**：全局单例事件总线（发布/订阅、Topic 路由、可靠投递、死信队列）
- **BaseEventStore / MemoryEventStore / SQLiteEventStore**：事件持久化与回放
- **get_eventbus()**：获取全局 EventBus 单例的便捷函数

快速开始::

    from eventbus import get_eventbus, Event, EventType

    bus = get_eventbus()

    # 订阅
    bus.subscribe("agent/task/#", lambda e: print(e.payload))

    # 发布
    event = Event(
        event_topic="agent/task/completed",
        event_type=EventType.NAMESPACE,
        namespace="tenant-001",
        payload={"task_id": "42"},
    )
    bus.publish(event)
"""

from .bus import EventBus, get_eventbus, topic_match
from .models import Event, EventCallback, EventMeta, EventType, Subscription
from .store import BaseEventStore, MemoryEventStore, SQLiteEventStore

__version__ = "1.0.0"

__all__ = [
    # 数据模型
    "Event",
    "EventCallback",
    "EventMeta",
    "EventType",
    "Subscription",
    # 核心引擎
    "EventBus",
    "get_eventbus",
    "topic_match",
    # 存储
    "BaseEventStore",
    "MemoryEventStore",
    "SQLiteEventStore",
]
