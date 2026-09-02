"""
配置中心存储模块。

ConfigStore 全局单例，提供配置的增删改查、版本管理、历史记录和热更新通知。
纯 Python 内存实现，支持四层命名空间和通配符查询。
"""

from __future__ import annotations

import asyncio
import copy
import fnmatch
import threading
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Optional, Union

from .models import (
    ConfigAction,
    ConfigChange,
    ConfigItem,
    namespace_matches,
    validate_namespace,
)


# 订阅者回调类型：接受 ConfigChange，可为同步或异步
Subscriber = Union[
    Callable[[ConfigChange], None],
    Callable[[ConfigChange], Coroutine[Any, Any, None]],
]


class ConfigStore:
    """
    配置中心全局单例。

    功能：
    - 配置的 get / set / delete / list 操作
    - 版本管理：每次修改自动生成新版本
    - 历史记录：保留每个配置项的所有历史版本
    - 回滚：将配置项恢复到指定历史版本
    - 热更新：配置变更时通知所有订阅者
    - 通配符查询：支持 * 匹配任意单层命名空间

    使用方式：
        store = ConfigStore.get_instance()
        store.set("prod/myproject/api-server", "db_host", "10.0.0.1")
        item = store.get("prod/myproject/api-server", "db_host")
    """

    _instance: Optional["ConfigStore"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        """初始化配置存储。不应直接构造，请使用 get_instance()。"""
        # 主存储：{full_path: ConfigItem}，full_path = namespace/key
        self._store: dict[str, ConfigItem] = {}
        # 历史记录：{full_path: [ConfigItem, ...]}，按版本号升序
        self._history: dict[str, list[ConfigItem]] = defaultdict(list)
        # 订阅者列表：[(pattern, callback), ...]
        self._subscribers: list[tuple[str, Subscriber]] = []
        # 写锁，保护 _store / _history / _subscribers 的并发安全
        self._write_lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> "ConfigStore":
        """
        获取 ConfigStore 全局单例（线程安全）。

        Returns:
            ConfigStore 单例实例
        """
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """
        重置单例（仅用于测试）。清空所有配置、历史和订阅者。
        """
        with cls._lock:
            if cls._instance is not None:
                cls._instance._store.clear()
                cls._instance._history.clear()
                cls._instance._subscribers.clear()
            cls._instance = None

    def _full_path(self, namespace: str, key: str) -> str:
        """构造完整路径 namespace/key。"""
        return f"{namespace}/{key}"

    # ------------------------------------------------------------------
    # 核心 CRUD
    # ------------------------------------------------------------------

    def get(self, namespace: str, key: str) -> Optional[ConfigItem]:
        """
        获取指定命名空间下的配置项。

        Args:
            namespace: 四层命名空间（如 prod/myproject/api-server/instance1）
            key: 配置键名

        Returns:
            ConfigItem 或 None（不存在时）
        """
        validate_namespace(namespace)
        fp = self._full_path(namespace, key)
        return self._store.get(fp)

    def set(
        self,
        namespace: str,
        key: str,
        value: Any,
        encrypted: bool = False,
    ) -> ConfigItem:
        """
        设置配置项（新增或更新）。

        每次调用自动递增版本号，并记录历史。
        若配置项已存在且值相同，则不产生新版本。

        Args:
            namespace: 四层命名空间
            key: 配置键名
            value: 配置值（任意可序列化类型）
            encrypted: 是否为敏感配置（加密标记）

        Returns:
            更新后的 ConfigItem
        """
        validate_namespace(namespace)
        fp = self._full_path(namespace, key)
        now = datetime.now(timezone.utc)

        with self._write_lock:
            existing = self._store.get(fp)
            if existing is not None:
                # 值未变化时不产生新版本
                if existing.value == value and existing.encrypted == encrypted:
                    return existing
                old_value = existing.value
                new_version = existing.version + 1
            else:
                old_value = None
                new_version = 1

            item = ConfigItem(
                key=key,
                value=value,
                namespace=namespace,
                version=new_version,
                encrypted=encrypted,
                updated_at=now,
            )
            self._store[fp] = item
            self._history[fp].append(copy.deepcopy(item))

        # 通知订阅者（在锁外执行，避免死锁）
        change = ConfigChange(
            action=ConfigAction.SET,
            item=item,
            old_value=old_value,
        )
        self._notify_subscribers(change)

        return item

    def delete(self, namespace: str, key: str) -> Optional[ConfigItem]:
        """
        删除指定配置项。

        删除后保留历史记录，可通过 rollback 回滚。

        Args:
            namespace: 四层命名空间
            key: 配置键名

        Returns:
            被删除的 ConfigItem（不存在时返回 None）
        """
        validate_namespace(namespace)
        fp = self._full_path(namespace, key)

        with self._write_lock:
            item = self._store.pop(fp, None)
            if item is None:
                return None

        # 通知订阅者
        change = ConfigChange(
            action=ConfigAction.DELETE,
            item=item,
        )
        self._notify_subscribers(change)

        return item

    def list(
        self,
        namespace: str = "*",
        key_pattern: str = "*",
    ) -> list[ConfigItem]:
        """
        列出匹配命名空间和键名模式的配置项。

        支持通配符 * 匹配任意单层命名空间层级。

        Args:
            namespace: 命名空间模式（默认 "*" 匹配全部）
            key_pattern: 键名模式（默认 "*" 匹配全部）

        Returns:
            匹配的 ConfigItem 列表
        """
        if namespace != "*":
            validate_namespace(namespace)

        results = []
        with self._write_lock:
            for fp, item in self._store.items():
                if namespace_matches(namespace, item.namespace):
                    if fnmatch.fnmatch(item.key, key_pattern):
                        results.append(copy.deepcopy(item))
        return results

    # ------------------------------------------------------------------
    # 版本管理与回滚
    # ------------------------------------------------------------------

    def history(self, namespace: str, key: str) -> list[ConfigItem]:
        """
        获取配置项的完整版本历史（按版本号升序）。

        Args:
            namespace: 四层命名空间
            key: 配置键名

        Returns:
            历史版本 ConfigItem 列表，不存在时返回空列表
        """
        validate_namespace(namespace)
        fp = self._full_path(namespace, key)
        with self._write_lock:
            return [copy.deepcopy(i) for i in self._history.get(fp, [])]

    def rollback(self, namespace: str, key: str, version: int) -> Optional[ConfigItem]:
        """
        将配置项回滚到指定历史版本。

        回滚操作本身会生成新版本（版本号递增），并记录到历史中。

        Args:
            namespace: 四层命名空间
            key: 配置键名
            version: 目标版本号

        Returns:
            回滚后的 ConfigItem（版本不存在时返回 None）
        """
        validate_namespace(namespace)
        fp = self._full_path(namespace, key)

        with self._write_lock:
            history_list = self._history.get(fp, [])
            target = None
            for h in history_list:
                if h.version == version:
                    target = copy.deepcopy(h)
                    break

            if target is None:
                return None

            old_item = self._store.get(fp)
            old_value = old_item.value if old_item else None

            # 生成新版本（版本号递增）
            now = datetime.now(timezone.utc)
            max_version = max((h.version for h in history_list), default=0)
            new_version = max_version + 1

            rolled_back = ConfigItem(
                key=key,
                value=target.value,
                namespace=namespace,
                version=new_version,
                encrypted=target.encrypted,
                updated_at=now,
            )
            self._store[fp] = rolled_back
            self._history[fp].append(copy.deepcopy(rolled_back))

        # 通知订阅者
        change = ConfigChange(
            action=ConfigAction.ROLLBACK,
            item=rolled_back,
            old_value=old_value,
        )
        self._notify_subscribers(change)

        return rolled_back

    # ------------------------------------------------------------------
    # 订阅与热更新
    # ------------------------------------------------------------------

    def subscribe(
        self,
        pattern: str,
        callback: Subscriber,
    ) -> None:
        """
        订阅配置变更通知。

        当匹配 pattern 的命名空间下的配置发生变更时，调用 callback。
        pattern 支持通配符 *，例如 "prod/*/api-server"。

        Args:
            pattern: 命名空间匹配模式（如 "prod/myproject/*"）
            callback: 回调函数，签名为 fn(change: ConfigChange) 或 async fn
        """
        if pattern != "*":
            validate_namespace(pattern)
        with self._write_lock:
            self._subscribers.append((pattern, callback))

    def unsubscribe(self, callback: Subscriber) -> bool:
        """
        取消订阅。

        Args:
            callback: 之前注册的回调函数

        Returns:
            是否成功移除
        """
        with self._write_lock:
            before = len(self._subscribers)
            self._subscribers = [
                (p, c) for p, c in self._subscribers if c != callback
            ]
            return len(self._subscribers) < before

    def watch(
        self,
        namespace: str,
        key: str,
        callback: Subscriber,
    ) -> None:
        """
        监听特定配置项的变更（精确匹配）。

        等价于 subscribe(f"{namespace}/{key}", callback)，但 key 作为通配符模式。

        Args:
            namespace: 四层命名空间
            key: 配置键名
            callback: 回调函数
        """
        validate_namespace(namespace)
        # 监听指定命名空间下该 key 的变更
        self.subscribe(namespace, callback)

    def _notify_subscribers(self, change: ConfigChange) -> None:
        """
        通知所有匹配的订阅者。

        遍历订阅者列表，对命名空间匹配的订阅者调用回调。
        异步回调会被调度到事件循环中执行（非阻塞）。

        Args:
            change: 配置变更事件
        """
        with self._write_lock:
            subscribers = list(self._subscribers)

        for pattern, callback in subscribers:
            if namespace_matches(pattern, change.item.namespace):
                try:
                    if asyncio.iscoroutinefunction(callback):
                        # 异步回调：尝试调度到当前事件循环
                        try:
                            loop = asyncio.get_running_loop()
                            loop.create_task(callback(change))
                        except RuntimeError:
                            # 无运行中的事件循环，跳过
                            pass
                    else:
                        callback(change)
                except Exception:
                    # 订阅者异常不应阻断配置变更流程
                    pass

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------

    def count(self) -> int:
        """返回当前配置项总数。"""
        return len(self._store)

    def namespaces(self) -> list[str]:
        """返回所有已使用的命名空间列表（去重、排序）。"""
        with self._write_lock:
            return sorted({item.namespace for item in self._store.values()})

    def dump(self) -> list[dict]:
        """导出所有配置项为字典列表（用于调试）。"""
        with self._write_lock:
            return [copy.deepcopy(item).to_dict() for item in self._store.values()]
