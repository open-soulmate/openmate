"""
语义缓存 — 借鉴GPTCache/SemanticCache
核心思想：相似问题（非完全相同）也命中缓存，大幅减少LLM调用
"""

import logging
import json
import time
import sqlite3
import hashlib
import math
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.semantic-cache")


@dataclass
class CacheEntry:
    entry_id: str
    query: str
    response: str
    query_hash: str
    tokens_used: int = 0
    hit_count: int = 0
    created_at: float = field(default_factory=time.time)
    last_hit_at: float = 0.0
    ttl_seconds: float = 86400.0
    metadata: dict = field(default_factory=dict)


class SemanticCache:
    """语义缓存"""

    def __init__(self, db_path: str = "", similarity_threshold: float = 0.85):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "semantic-cache"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "cache.db")
        self.db_path = db_path
        self.similarity_threshold = similarity_threshold
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cache_entries (
                    entry_id TEXT PRIMARY KEY,
                    query TEXT NOT NULL,
                    response TEXT NOT NULL,
                    query_hash TEXT NOT NULL,
                    query_tokens TEXT DEFAULT '[]',
                    tokens_used INTEGER DEFAULT 0,
                    hit_count INTEGER DEFAULT 0,
                    created_at REAL NOT NULL,
                    last_hit_at REAL DEFAULT 0,
                    ttl_seconds REAL DEFAULT 86400,
                    metadata TEXT DEFAULT '{}'
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_cache_hash
                ON cache_entries(query_hash)
            """)
            conn.commit()

    def _tokenize(self, text: str) -> set[str]:
        """简单分词（用于相似度计算）"""
        import re
        tokens = re.findall(r'[\w\u4e00-\u9fff]+', text.lower())
        return set(tokens)

    def _jaccard_similarity(self, tokens_a: set[str], tokens_b: set[str]) -> float:
        """Jaccard相似度"""
        if not tokens_a or not tokens_b:
            return 0.0
        intersection = tokens_a & tokens_b
        union = tokens_a | tokens_b
        return len(intersection) / len(union)

    def get(self, query: str) -> Optional[str]:
        """查找缓存（精确匹配+语义相似匹配）"""
        now = time.time()

        # 1. 精确匹配
        query_hash = hashlib.sha256(query.encode()).hexdigest()
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """SELECT * FROM cache_entries
                   WHERE query_hash = ? AND created_at + ttl_seconds > ?""",
                (query_hash, now),
            ).fetchone()

            if row:
                # 更新命中计数
                conn.execute(
                    "UPDATE cache_entries SET hit_count = hit_count + 1, last_hit_at = ? WHERE entry_id = ?",
                    (now, row["entry_id"]),
                )
                conn.commit()
                logger.info(f"Cache EXACT hit for: {query[:50]}")
                return row["response"]

            # 2. 语义相似匹配
            query_tokens = self._tokenize(query)
            rows = conn.execute(
                """SELECT * FROM cache_entries
                   WHERE created_at + ttl_seconds > ?
                   ORDER BY hit_count DESC LIMIT 50""",
                (now,),
            ).fetchall()

        best_match = None
        best_similarity = 0.0

        for row in rows:
            cached_tokens = set(json.loads(row["query_tokens"] or "[]"))
            similarity = self._jaccard_similarity(query_tokens, cached_tokens)

            if similarity > best_similarity and similarity >= self.similarity_threshold:
                best_similarity = similarity
                best_match = row

        if best_match:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    "UPDATE cache_entries SET hit_count = hit_count + 1, last_hit_at = ? WHERE entry_id = ?",
                    (now, best_match["entry_id"]),
                )
                conn.commit()
            logger.info(f"Cache SEMANTIC hit (similarity={best_similarity:.0%}) for: {query[:50]}")
            return best_match["response"]

        return None

    def put(
        self,
        query: str,
        response: str,
        tokens_used: int = 0,
        ttl_seconds: float = 86400.0,
        metadata: Optional[dict] = None,
    ) -> str:
        """存入缓存"""
        query_hash = hashlib.sha256(query.encode()).hexdigest()
        entry_id = f"cache_{hashlib.sha256(f'{query}:{time.time()}'.encode()).hexdigest()[:12]}"
        query_tokens = list(self._tokenize(query))

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO cache_entries
                   (entry_id, query, response, query_hash, query_tokens,
                    tokens_used, hit_count, created_at, last_hit_at, ttl_seconds, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (entry_id, query, response, query_hash, json.dumps(query_tokens),
                 tokens_used, 0, time.time(), 0, ttl_seconds,
                 json.dumps(metadata or {})),
            )
            conn.commit()

        logger.info(f"Cached response for: {query[:50]} ({tokens_used} tokens)")
        return entry_id

    def invalidate(self, query: str):
        """失效特定查询的缓存"""
        query_hash = hashlib.sha256(query.encode()).hexdigest()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM cache_entries WHERE query_hash = ?", (query_hash,))
            conn.commit()

    def clear_expired(self):
        """清理过期缓存"""
        now = time.time()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "DELETE FROM cache_entries WHERE created_at + ttl_seconds < ?",
                (now,),
            )
            conn.commit()
            return cursor.rowcount

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM cache_entries").fetchone()[0]
            total_hits = conn.execute("SELECT SUM(hit_count) FROM cache_entries").fetchone()[0] or 0
            tokens_saved = conn.execute(
                "SELECT SUM(tokens_used * hit_count) FROM cache_entries"
            ).fetchone()[0] or 0
            now = time.time()
            active = conn.execute(
                "SELECT COUNT(*) FROM cache_entries WHERE created_at + ttl_seconds > ?",
                (now,),
            ).fetchone()[0]

        return {
            "total_entries": total,
            "active_entries": active,
            "total_hits": total_hits,
            "tokens_saved": tokens_saved,
            "similarity_threshold": self.similarity_threshold,
        }
