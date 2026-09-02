"""EventBus 核心引擎。

全局单例事件总线，提供：
- 发布/订阅模型：subscribe(topic_pattern, callback) / publish(event)
- Topic 路由匹配：支持 # 通配符（如 agent/task/# 匹配所有 agent 任务事件）
- 三级隔离：Global、Namespace、Service 事件过滤
- 可靠投递：核心事件持久化 + 重试 3 次 + 死信队列
- 事件溯源：通过 store 回放查询

使用方式：
    bus = get_eventbus()
    bus.subscribe("agent/task/#", my_callback)
    bus.publish(event)
"""

from __future__ import annotations

import asyncio
import fnmatch
import logging
import threading
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from .models import Event, EventCallback, EventMeta, EventType, Subscription
from .store import BaseEventStore, MemoryEventStore, SQLiteEventStore

logger = logging.getLogger("eventbus")


# ---------------------------------------------------------------------------
# Topic 路由匹配
# ---------------------------------------------------------------------------

def topic_match(pattern: str, topic: str) -> bool:
    """判断 topic 是否匹配 pattern。

    匹配规则：
    - 精确匹配：agent/task/created == agent/task/created
    - # 通配符：agent/task/# 匹配 agent/task/created、agent/task/failed 等
    - # 只能出现在末尾，匹配任意深度的后缀

    Args:
        pattern: 订阅模式，如 "agent/task/#" 或 "agent/task/created"
        topic: 实际事件主题，如 "agent/task/created"

    Returns:
        是否匹配
    """
    # 精确匹配
    if pattern == topic:
        return True

    # # 通配符匹配：pattern 以 # 结尾
    if pattern.endswith("#"):
        prefix = pattern[:-1]  # 保留末尾的 /
        return topic.startswith(prefix)

    # 使用 fnmatch 作为后备（支持 * 和 ? 通配符）
    return fnmatch.fnmatch(topic, pattern)


# ---------------------------------------------------------------------------
# EventBus 核心
# ---------------------------------------------------------------------------

class EventBus:
    """全局事件总线。

    单例模式，通过 get_eventbus() 获取实例。
    支持发布/订阅、Topic 路由、可靠投递、死信队列和事件溯源。
    """

    _instance: Optional[EventBus] = None
    _lock = threading.Lock()

    def __init__(
        self,
        store: Optional[BaseEventStore] = None,
        enable_persistence: bool = False,
        db_path: str = "eventbus.db",
    ) -> None:
        """初始化 EventBus。

        Args:
            store: 自定义事件存储实现
            enable_persistence: 是否启用 SQLite 持久化
            db_path: SQLite 数据库路径（仅 enable_persistence=True 时生效）
        """
        # 订阅表：topic_pattern → [Subscription, ...]
        self._subscriptions: dict[str, list[Subscription]] = defaultdict(list)
        self._sub_lock = threading.Lock()

        # 死信队列
        self._dead_letter_queue: list[Event] = []
        self._dlq_lock = threading.Lock()

        # 事件存储
        if store is not None:
            self._store = store
        elif enable_persistence:
            self._store = SQLiteEventStore(db_path)
        else:
            self._store = MemoryEventStore()

        logger.info("EventBus 已初始化 (store=%s)", type(self._store).__name__)

    # --- 单例管理 ---

    @classmethod
    def get_instance(
        cls,
        store: Optional[BaseEventStore] = None,
        enable_persistence: bool = False,
        db_path: str = "eventbus.db",
    ) -> EventBus:
        """获取全局单例 EventBus。

        线程安全的懒加载单例。首次调用时创建实例，后续调用忽略参数。

        Returns:
            全局 EventBus 实例
        """
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls(
                        store=store,
                        enable_persistence=enable_persistence,
                        db_path=db_path,
                    )
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """重置单例（仅用于测试）。"""
        with cls._lock:
            cls._instance = None

    # --- 订阅 ---

    def subscribe(
        self,
        topic_pattern: str,
        callback: EventCallback,
        namespace_filter: Optional[str] = None,
        event_type_filter: Optional[EventType] = None,
    ) -> Subscription:
        """订阅事件。

        注册一个 topic pattern 的回调函数。当事件 topic 匹配 pattern 时触发回调。

        Args:
            topic_pattern: 主题模式，支持 # 通配符（如 "agent/task/#"）
            callback: 回调函数，接受 Event 参数
            namespace_filter: 可选，仅接收指定命名空间的事件
            event_type_filter: 可选，仅接收指定隔离级别的事件

        Returns:
            Subscription 对象，可用于取消订阅
        """
        sub = Subscription(
            topic_pattern=topic_pattern,
            callback=callback,
            namespace_filter=namespace_filter,
            event_type_filter=event_type_filter,
        )

        with self._sub_lock:
            self._subscriptions[topic_pattern].append(sub)

        logger.info("新增订阅: pattern=%s, sub_id=%s", topic_pattern, sub.sub_id[:8])
        return sub

    def unsubscribe(self, subscription: Subscription) -> bool:
        """取消订阅。

        Args:
            subscription: 要取消的 Subscription 对象

        Returns:
            是否成功取消
        """
        pattern = subscription.topic_pattern
        with self._sub_lock:
            subs = self._subscriptions.get(pattern, [])
            before = len(subs)
            self._subscriptions[pattern] = [s for s in subs if s.sub_id != subscription.sub_id]
            after = len(self._subscriptions[pattern])

        removed = before > after
        if removed:
            logger.info("已取消订阅: pattern=%s, sub_id=%s", pattern, subscription.sub_id[:8])
        return removed

    def get_subscriptions(self, topic_pattern: Optional[str] = None) -> list[Subscription]:
        """获取所有订阅（或指定 pattern 的订阅）。"""
        with self._sub_lock:
            if topic_pattern:
                return list(self._subscriptions.get(topic_pattern, []))
            return [s for subs in self._subscriptions.values() for s in subs]

    # --- 发布 ---

    def publish(self, event: Event) -> int:
        """发布事件到总线。

        流程：
        1. 持久化（如果 event.meta.persist 为 True）
        2. 路由匹配所有订阅者
        3. 按隔离级别过滤
        4. 同步调用回调（失败则重试，超过 max_retry 进入死信队列）

        Args:
            event: 要发布的 Event 对象

        Returns:
            成功投递的订阅者数量
        """
        logger.info(
            "发布事件: id=%s, topic=%s, type=%s",
            event.event_id[:8], event.event_topic, event.event_type.value,
        )

        # 1. 持久化
        if event.meta.persist:
            try:
                self._store.save(event)
            except Exception as e:
                logger.error("事件持久化失败: %s — %s", event.event_id[:8], e)

        # 2. 路由匹配
        matched_subs = self._match_subscriptions(event)

        # 3. 投递
        delivered = 0
        for sub in matched_subs:
            success = self._deliver(event, sub)
            if success:
                delivered += 1

        return delivered

    def _match_subscriptions(self, event: Event) -> list[Subscription]:
        """匹配所有与事件 topic 匹配的订阅，并按隔离级别过滤。"""
        matched = []
        with self._sub_lock:
            for pattern, subs in self._subscriptions.items():
                if not topic_match(pattern, event.event_topic):
                    continue
                for sub in subs:
                    # 命名空间过滤
                    if sub.namespace_filter is not None and sub.namespace_filter != event.namespace:
                        continue
                    # 事件类型过滤
                    if sub.event_type_filter is not None and sub.event_type_filter != event.event_type:
                        continue
                    matched.append(sub)
        return matched

    def _deliver(self, event: Event, sub: Subscription) -> bool:
        """投递事件到单个订阅者。

        失败时根据 event.meta 决定是否重试。
        """
        if sub.callback is None:
            return False

        max_retry = event.meta.max_retry

        for attempt in range(max_retry + 1):
            try:
                sub.callback(event)
                if attempt > 0:
                    logger.info("事件 %s 投递成功（第 %d 次重试）", event.event_id[:8], attempt)
                return True
            except Exception as e:
                logger.warning(
                    "事件 %s 投递失败 (attempt %d/%d): %s",
                    event.event_id[:8], attempt + 1, max_retry + 1, e,
                )
                if attempt < max_retry:
                    event.meta.retry_times = attempt + 1

        # 所有重试均失败，进入死信队列
        event.meta.dead_letter = True
        self._send_to_dlq(event, sub)
        return False

    def _send_to_dlq(self, event: Event, failed_sub: Subscription) -> None:
        """将投递失败的事件送入死信队列。"""
        with self._dlq_lock:
            self._dead_letter_queue.append(event)
        logger.error(
            "事件 %s 进入死信队列 (topic=%s, pattern=%s)",
            event.event_id[:8], event.event_topic, failed_sub.topic_pattern,
        )

    # --- 死信队列 ---

    def get_dead_letters(self, limit: int = 100) -> list[Event]:
        """获取死信队列中的事件。"""
        with self._dlq_lock:
            return list(self._dead_letter_queue[-limit:])

    def replay_dead_letter(self, event: Event) -> int:
        """重放死信队列中的事件。

        重新发布事件（重置重试计数），尝试再次投递。

        Args:
            event: 要重放的事件

        Returns:
            成功投递的订阅者数量
        """
        event.meta.retry_times = 0
        event.meta.dead_letter = False
        # 从 DLQ 移除
        with self._dlq_lock:
            self._dead_letter_queue = [e for e in self._dead_letter_queue if e.event_id != event.event_id]
        return self.publish(event)

    def clear_dead_letters(self) -> int:
        """清空死信队列，返回清除数量。"""
        with self._dlq_lock:
            count = len(self._dead_letter_queue)
            self._dead_letter_queue.clear()
        return count

    # --- 事件溯源 ---

    def replay_by_topic(self, topic: str, limit: int = 100) -> list[Event]:
        """按 topic 回放历史事件。"""
        return self._store.query_by_topic(topic, limit)

    def replay_by_trace_id(self, trace_id: str) -> list[Event]:
        """按 traceId 回放关联事件。"""
        return self._store.query_by_trace_id(trace_id)

    def replay_by_time_range(
        self,
        start: datetime,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[Event]:
        """按时间范围回放事件。"""
        return self._store.query_by_time_range(start, end, limit)

    # --- 统计 ---

    def stats(self) -> dict:
        """返回 EventBus 统计信息。"""
        with self._sub_lock:
            total_subs = sum(len(subs) for subs in self._subscriptions.values())
            patterns = list(self._subscriptions.keys())
        with self._dlq_lock:
            dlq_size = len(self._dead_letter_queue)
        return {
            "subscriptions": total_subs,
            "patterns": patterns,
            "dead_letter_queue_size": dlq_size,
            "store_type": type(self._store).__name__,
            "store_count": self._store.count(),
        }


# ---------------------------------------------------------------------------
# 便捷函数
# ---------------------------------------------------------------------------

def get_eventbus(
    store: Optional[BaseEventStore] = None,
    enable_persistence: bool = False,
    db_path: str = "eventbus.db",
) -> EventBus:
    """获取全局 EventBus 单例的便捷函数。

    用法：
        from eventbus import get_eventbus
        bus = get_eventbus()
        bus.subscribe("agent/task/#", my_handler)
        bus.publish(event)

    Returns:
        全局 EventBus 实例
    """
    return EventBus.get_instance(
        store=store,
        enable_persistence=enable_persistence,
        db_path=db_path,
    )
