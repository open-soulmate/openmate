"""
工具结果缓存系统 — 借鉴Hermes tool result caching
核心思想：相同工具+相同参数在TTL内直接返回缓存，避免重复执行
支持：TTL过期、手动失效、缓存命中率统计
"""

import logging
import json
import time
import hashlib
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Any

logger = logging.getLogger("acp-proxy.tool-cache")


@dataclass
class CacheEntry:
    cache_key: str
    tool_name: str
    arguments_hash: str
    result: str
    created_at: float
    ttl_seconds: float
    hit_count: int = 0
    last_hit: float = 0.0

    @property
    def expired(self) -> bool:
        return time.time() > self.created_at + self.ttl_seconds

    @property
    def age_seconds(self) -> float:
        return time.time() - self.created_at


class ToolResultCache:
    """工具结果缓存 — SQLite持久化 + 内存L1"""

    def __init__(self, db_path: str = "", default_ttl: float = 300.0):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "tool-cache"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "cache.db")
        self.db_path = db_path
        self.default_ttl = default_ttl
        self._memory_cache: dict[str, CacheEntry] = {}
        self._stats = {"hits": 0, "misses": 0, "evictions": 0, "writes": 0}
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tool_cache (
                    cache_key TEXT PRIMARY KEY,
                    tool_name TEXT NOT NULL,
                    arguments_hash TEXT NOT NULL,
                    result TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    ttl_seconds REAL NOT NULL,
                    hit_count INTEGER DEFAULT 0,
                    last_hit REAL DEFAULT 0
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_cache_tool
                ON tool_cache(tool_name, created_at)
            """)
            conn.commit()

    def get(self, tool_name: str, arguments: dict) -> Optional[str]:
        """查询缓存 — 命中返回结果，未命中返回None"""
        cache_key = self._make_key(tool_name, arguments)

        # L1: 内存缓存
        entry = self._memory_cache.get(cache_key)
        if entry and not entry.expired:
            entry.hit_count += 1
            entry.last_hit = time.time()
            self._stats["hits"] += 1
            logger.debug(f"Cache HIT (memory): {tool_name}")
            return entry.result

        # L2: SQLite缓存
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM tool_cache WHERE cache_key = ?", (cache_key,)
            ).fetchone()

        if row:
            entry = CacheEntry(
                cache_key=row["cache_key"],
                tool_name=row["tool_name"],
                arguments_hash=row["arguments_hash"],
                result=row["result"],
                created_at=row["created_at"],
                ttl_seconds=row["ttl_seconds"],
                hit_count=row["hit_count"],
                last_hit=row["last_hit"],
            )
            if not entry.expired:
                entry.hit_count += 1
                entry.last_hit = time.time()
                self._memory_cache[cache_key] = entry
                self._stats["hits"] += 1
                # 更新DB命中计数
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute(
                        "UPDATE tool_cache SET hit_count = hit_count + 1, last_hit = ? WHERE cache_key = ?",
                        (time.time(), cache_key),
                    )
                    conn.commit()
                logger.debug(f"Cache HIT (sqlite): {tool_name}")
                return entry.result
            else:
                # 过期，删除
                self.invalidate(tool_name, arguments)

        self._stats["misses"] += 1
        logger.debug(f"Cache MISS: {tool_name}")
        return None

    def put(
        self,
        tool_name: str,
        arguments: dict,
        result: str,
        ttl: Optional[float] = None,
    ):
        """写入缓存"""
        cache_key = self._make_key(tool_name, arguments)
        ttl = ttl or self.default_ttl
        args_hash = self._hash_args(arguments)

        entry = CacheEntry(
            cache_key=cache_key,
            tool_name=tool_name,
            arguments_hash=args_hash,
            result=result,
            created_at=time.time(),
            ttl_seconds=ttl,
        )

        # 写入内存
        self._memory_cache[cache_key] = entry

        # 写入SQLite
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO tool_cache
                   (cache_key, tool_name, arguments_hash, result,
                    created_at, ttl_seconds, hit_count, last_hit)
                   VALUES (?, ?, ?, ?, ?, ?, 0, 0)""",
                (cache_key, tool_name, args_hash, result,
                 entry.created_at, ttl),
            )
            conn.commit()

        self._stats["writes"] += 1
        logger.debug(f"Cache WRITE: {tool_name} (ttl={ttl}s)")

    def invalidate(self, tool_name: str, arguments: dict):
        """手动失效特定缓存"""
        cache_key = self._make_key(tool_name, arguments)
        self._memory_cache.pop(cache_key, None)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM tool_cache WHERE cache_key = ?", (cache_key,))
            conn.commit()

    def invalidate_tool(self, tool_name: str):
        """失效某工具的所有缓存"""
        to_remove = [
            k for k, v in self._memory_cache.items()
            if v.tool_name == tool_name
        ]
        for k in to_remove:
            del self._memory_cache[k]
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM tool_cache WHERE tool_name = ?", (tool_name,))
            conn.commit()
        self._stats["evictions"] += len(to_remove)

    def cleanup_expired(self):
        """清理过期缓存"""
        now = time.time()
        expired_keys = [
            k for k, v in self._memory_cache.items()
            if v.expired
        ]
        for k in expired_keys:
            del self._memory_cache[k]

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "DELETE FROM tool_cache WHERE created_at + ttl_seconds < ?",
                (now,),
            )
            deleted = cursor.rowcount
            conn.commit()

        if deleted or expired_keys:
            logger.info(f"Cleaned up {deleted} expired cache entries")

    def get_stats(self) -> dict:
        total = self._stats["hits"] + self._stats["misses"]
        with sqlite3.connect(self.db_path) as conn:
            db_count = conn.execute("SELECT COUNT(*) FROM tool_cache").fetchone()[0]
        return {
            "hit_rate": f"{self._stats['hits'] / max(total, 1) * 100:.1f}%",
            "total_hits": self._stats["hits"],
            "total_misses": self._stats["misses"],
            "total_writes": self._stats["writes"],
            "memory_entries": len(self._memory_cache),
            "db_entries": db_count,
            "default_ttl": self.default_ttl,
        }

    def _make_key(self, tool_name: str, arguments: dict) -> str:
        content = f"{tool_name}:{json.dumps(arguments, sort_keys=True, ensure_ascii=False)}"
        return hashlib.sha256(content.encode()).hexdigest()[:24]

    def _hash_args(self, arguments: dict) -> str:
        return hashlib.sha256(
            json.dumps(arguments, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()[:16]
