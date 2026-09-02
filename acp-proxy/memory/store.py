"""MemoryStore 核心存储引擎 — 单例模式，纯内存实现

提供记忆的增删改查、关键词搜索、相关性排序，
以及短期→长期记忆的consolidate提炼功能。

不依赖外部数据库，所有数据存储在内存dict中。
后续可扩展为SQLite或向量数据库持久化。
"""

import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from .models import MemoryItem, MemoryType

logger = logging.getLogger("acp-proxy.memory.store")

# 各类型记忆的容量上限
MAX_SHORT_TERM = 100   # 短期记忆最多保留100条
MAX_LONG_TERM = 500    # 长期记忆最多500条
MAX_WORKING = 50       # 工作记忆最多50条

# consolidate时，相关性分数低于此阈值的短期记忆不提炼
CONSOLIDATE_THRESHOLD = 0.3


class MemoryStore:
    """记忆存储引擎 — 全局单例，管理所有类型的记忆

    核心功能：
    - add: 添加记忆条目
    - get: 按ID精确获取
    - search: 关键词搜索 + 相关性排序
    - delete: 按ID删除
    - consolidate: 短期记忆→长期记忆提炼
    - get_by_session: 获取某会话的所有记忆
    - clear_session: 会话结束时清理短期/工作记忆

    线程安全：使用锁保护内部状态。
    """

    _instance: Optional["MemoryStore"] = None
    _lock_class = threading.Lock()

    def __new__(cls) -> "MemoryStore":
        """单例模式：确保全局只有一个MemoryStore实例"""
        if cls._instance is None:
            with cls._lock_class:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        """初始化存储结构（仅首次调用生效）"""
        if self._initialized:
            return
        self._initialized = True
        self._lock = threading.Lock()
        # 主存储：id → MemoryItem
        self._items: dict[str, MemoryItem] = {}
        logger.info("MemoryStore 初始化完成")

    # ── CRUD 操作 ──────────────────────────────────────────────

    def add(self, item: MemoryItem) -> str:
        """添加记忆条目

        自动检查容量上限，超出时淘汰最旧的条目（FIFO）。

        Args:
            item: 要添加的记忆条目

        Returns:
            添加的记忆条目ID
        """
        with self._lock:
            # 检查容量上限
            max_map = {
                MemoryType.SHORT_TERM: MAX_SHORT_TERM,
                MemoryType.LONG_TERM: MAX_LONG_TERM,
                MemoryType.WORKING: MAX_WORKING,
            }
            limit = max_map.get(item.type, MAX_SHORT_TERM)
            current_count = sum(1 for m in self._items.values() if m.type == item.type)

            if current_count >= limit:
                # 淘汰同类型中最旧的一条
                self._evict_oldest(item.type)

            self._items[item.id] = item
            logger.debug(f"添加记忆 [{item.type.value}] {item.id}: {item.content[:50]}...")
            return item.id

    def get(self, item_id: str) -> Optional[MemoryItem]:
        """按ID精确获取记忆条目

        Args:
            item_id: 记忆条目ID

        Returns:
            MemoryItem或None
        """
        return self._items.get(item_id)

    def delete(self, item_id: str) -> bool:
        """删除记忆条目

        Args:
            item_id: 记忆条目ID

        Returns:
            是否成功删除（ID不存在返回False）
        """
        with self._lock:
            if item_id in self._items:
                del self._items[item_id]
                logger.debug(f"删除记忆 {item_id}")
                return True
            return False

    # ── 搜索与检索 ─────────────────────────────────────────────

    def search(
        self,
        keyword: str,
        memory_type: Optional[MemoryType] = None,
        session_id: Optional[str] = None,
        limit: int = 10,
    ) -> list[MemoryItem]:
        """关键词搜索记忆，按相关性降序排序

        匹配策略：在content和tags中查找关键词，
        根据匹配频次和位置计算相关性分数。

        Args:
            keyword: 搜索关键词
            memory_type: 可选，限定搜索的记忆类型
            session_id: 可选，限定搜索的会话ID
            limit: 返回结果上限（默认10）

        Returns:
            按相关性降序排列的MemoryItem列表
        """
        if not keyword.strip():
            return []

        results: list[MemoryItem] = []
        keyword_lower = keyword.lower()

        with self._lock:
            for item in self._items.values():
                # 类型过滤
                if memory_type and item.type != memory_type:
                    continue
                # 会话过滤
                if session_id and item.session_id != session_id:
                    continue

                # 计算匹配分数
                score = item.matches_keyword(keyword_lower)
                if score > 0:
                    # 创建副本并设置相关性分数（不修改原始条目）
                    scored_item = MemoryItem(
                        id=item.id,
                        type=item.type,
                        content=item.content,
                        tags=item.tags[:],
                        created_at=item.created_at,
                        session_id=item.session_id,
                        relevance_score=score,
                    )
                    results.append(scored_item)

        # 按相关性降序排序
        results.sort(key=lambda x: x.relevance_score, reverse=True)
        return results[:limit]

    def get_by_type(
        self,
        memory_type: MemoryType,
        session_id: Optional[str] = None,
    ) -> list[MemoryItem]:
        """获取指定类型的所有记忆

        Args:
            memory_type: 记忆类型
            session_id: 可选，限定会话ID

        Returns:
            MemoryItem列表（按创建时间升序）
        """
        with self._lock:
            items = [
                item for item in self._items.values()
                if item.type == memory_type
                and (session_id is None or item.session_id == session_id)
            ]
        items.sort(key=lambda x: x.created_at)
        return items

    def get_by_session(self, session_id: str) -> list[MemoryItem]:
        """获取某会话的所有记忆条目

        Args:
            session_id: 会话ID

        Returns:
            该会话的所有MemoryItem列表
        """
        with self._lock:
            items = [
                item for item in self._items.values()
                if item.session_id == session_id
            ]
        items.sort(key=lambda x: x.created_at)
        return items

    # ── 记忆提炼 (Consolidation) ───────────────────────────────

    def consolidate(self, session_id: str) -> list[str]:
        """将短期记忆提炼为长期记忆

        遍历指定会话的短期记忆，将内容较长、
        相关性分数足够高的条目复制到长期记忆中。
        原始短期记忆保留不变（由会话清理时统一删除）。

        提炼条件（满足任一即可）：
        - content长度 > 100 字符（有实质内容）
        - tags数量 >= 2（已被标记分类）

        Args:
            session_id: 要提炼的会话ID

        Returns:
            新创建的长期记忆ID列表
        """
        consolidated_ids: list[str] = []

        with self._lock:
            short_term_items = [
                item for item in self._items.values()
                if item.type == MemoryType.SHORT_TERM
                and item.session_id == session_id
            ]

            for item in short_term_items:
                # 判断是否值得提炼为长期记忆
                if len(item.content) > 100 or len(item.tags) >= 2:
                    long_term_item = MemoryItem(
                        type=MemoryType.LONG_TERM,
                        content=item.content,
                        tags=item.tags[:],
                        session_id=item.session_id,
                    )
                    # 长期记忆容量检查
                    long_term_count = sum(
                        1 for m in self._items.values()
                        if m.type == MemoryType.LONG_TERM
                    )
                    if long_term_count >= MAX_LONG_TERM:
                        self._evict_oldest(MemoryType.LONG_TERM)

                    self._items[long_term_item.id] = long_term_item
                    consolidated_ids.append(long_term_item.id)
                    logger.info(
                        f"提炼记忆 {item.id} → {long_term_item.id}: "
                        f"{item.content[:50]}..."
                    )

        if consolidated_ids:
            logger.info(
                f"会话 {session_id} 提炼完成：{len(consolidated_ids)} 条短期→长期"
            )
        return consolidated_ids

    # ── 会话生命周期 ───────────────────────────────────────────

    def clear_session(self, session_id: str) -> int:
        """清理指定会话的短期记忆和工作记忆

        会话结束时调用，删除该会话的所有短期和工作记忆。
        长期记忆不受影响（跨会话保留）。

        Args:
            session_id: 要清理的会话ID

        Returns:
            删除的记忆条目数
        """
        with self._lock:
            to_delete = [
                item_id for item_id, item in self._items.items()
                if item.session_id == session_id
                and item.type in (MemoryType.SHORT_TERM, MemoryType.WORKING)
            ]
            for item_id in to_delete:
                del self._items[item_id]

        if to_delete:
            logger.info(f"清理会话 {session_id}: 删除 {len(to_delete)} 条记忆")
        return len(to_delete)

    # ── 统计信息 ────────────────────────────────────────────────

    def stats(self) -> dict:
        """返回记忆存储统计信息

        Returns:
            包含各类型记忆数量的字典
        """
        with self._lock:
            counts = {}
            for mt in MemoryType:
                counts[mt.value] = sum(
                    1 for m in self._items.values() if m.type == mt
                )
            return {
                "total": len(self._items),
                **counts,
            }

    # ── 内部方法 ────────────────────────────────────────────────

    def _evict_oldest(self, memory_type: MemoryType) -> None:
        """淘汰指定类型中最旧的一条记忆（需在锁内调用）"""
        oldest = None
        for item in self._items.values():
            if item.type == memory_type:
                if oldest is None or item.created_at < oldest.created_at:
                    oldest = item
        if oldest:
            del self._items[oldest.id]
            logger.debug(f"淘汰记忆 {oldest.id} (类型={memory_type.value})")
