"""
Agent记忆整合器 — 借鉴Mem0 memory consolidation + Generative Agents memory stream
核心思想：定期整合零散记忆，去重、合并、更新重要性分数
"""

import logging
import json
import time
import sqlite3
import hashlib
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.memory-consolidator")


@dataclass
class MemoryFragment:
    fragment_id: str
    content: str
    memory_type: str  # "episodic", "semantic", "procedural"
    importance: float = 0.5
    access_count: int = 0
    last_accessed_at: float = 0.0
    created_at: float = field(default_factory=time.time)
    consolidated: bool = False
    merged_into: str = ""  # 合并到哪个fragment
    tags: list[str] = field(default_factory=list)


class MemoryConsolidator:
    """记忆整合器"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "memory-consolidator"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "fragments.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS memory_fragments (
                    fragment_id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    memory_type TEXT DEFAULT 'episodic',
                    importance REAL DEFAULT 0.5,
                    access_count INTEGER DEFAULT 0,
                    last_accessed_at REAL DEFAULT 0,
                    created_at REAL NOT NULL,
                    consolidated INTEGER DEFAULT 0,
                    merged_into TEXT DEFAULT '',
                    tags TEXT DEFAULT '[]'
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_frag_type
                ON memory_fragments(memory_type, importance)
            """)
            conn.commit()

    def add_fragment(
        self,
        content: str,
        memory_type: str = "episodic",
        importance: float = 0.5,
        tags: Optional[list[str]] = None,
    ) -> str:
        """添加记忆片段"""
        fragment_id = f"frag_{hashlib.sha256(f'{content}:{time.time()}'.encode()).hexdigest()[:12]}"

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO memory_fragments
                   (fragment_id, content, memory_type, importance, created_at, tags)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (fragment_id, content, memory_type, importance, time.time(),
                 json.dumps(tags or [])),
            )
            conn.commit()

        return fragment_id

    def consolidate(self, similarity_threshold: float = 0.7) -> dict:
        """执行记忆整合

        1. 去重（相似内容合并）
        2. 重要性衰减（旧记忆降低重要性）
        3. 低重要性记忆归档
        """
        now = time.time()
        stats = {"merged": 0, "archived": 0, "updated": 0}

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # 获取所有活跃片段
            fragments = conn.execute(
                """SELECT * FROM memory_fragments
                   WHERE consolidated = 0 AND merged_into = ''
                   ORDER BY importance DESC"""
            ).fetchall()

            # 1. 去重合并
            seen_content: dict[str, str] = {}  # content_hash -> fragment_id
            for frag in fragments:
                content = frag["content"]
                content_hash = hashlib.sha256(content[:100].encode()).hexdigest()

                if content_hash in seen_content:
                    # 合并到已有片段
                    primary_id = seen_content[content_hash]
                    conn.execute(
                        """UPDATE memory_fragments SET
                           importance = MAX(importance, ?),
                           access_count = access_count + ?
                           WHERE fragment_id = ?""",
                        (frag["importance"], frag["access_count"], primary_id),
                    )
                    conn.execute(
                        """UPDATE memory_fragments SET
                           consolidated = 1, merged_into = ?
                           WHERE fragment_id = ?""",
                        (primary_id, frag["fragment_id"]),
                    )
                    stats["merged"] += 1
                else:
                    seen_content[content_hash] = frag["fragment_id"]

            # 2. 重要性衰减（超过7天未访问的降低重要性）
            cutoff = now - 7 * 86400
            cursor = conn.execute(
                """UPDATE memory_fragments SET
                   importance = importance * 0.9
                   WHERE last_accessed_at < ? AND last_accessed_at > 0""",
                (cutoff,),
            )
            stats["updated"] = cursor.rowcount or 0

            # 3. 归档低重要性片段
            cursor = conn.execute(
                """UPDATE memory_fragments SET consolidated = 1
                   WHERE importance < 0.1 AND access_count < 2""",
            )
            stats["archived"] = cursor.rowcount or 0

            conn.commit()

        logger.info(f"Memory consolidation: {stats}")
        return stats

    def recall(
        self,
        query: str,
        memory_type: str = "",
        limit: int = 10,
    ) -> list[dict]:
        """召回相关记忆"""
        sql = """
            SELECT * FROM memory_fragments
            WHERE consolidated = 0 AND merged_into = ''
        """
        params: list = []

        if memory_type:
            sql += " AND memory_type = ?"
            params.append(memory_type)

        sql += " ORDER BY importance DESC, access_count DESC LIMIT ?"
        params.append(limit * 3)

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(sql, params).fetchall()

        # 关键词匹配
        query_lower = query.lower()
        scored = []
        for row in rows:
            d = dict(row)
            content_lower = d["content"].lower()
            # 简单关键词匹配
            match_score = sum(
                1 for word in query_lower.split()
                if word in content_lower
            )
            if match_score > 0:
                d["relevance"] = match_score / len(query_lower.split())
                scored.append(d)

        scored.sort(key=lambda x: (x["relevance"], x["importance"]), reverse=True)

        # 更新访问计数
        result_ids = [s["fragment_id"] for s in scored[:limit]]
        if result_ids:
            with sqlite3.connect(self.db_path) as conn:
                placeholders = ",".join("?" * len(result_ids))
                conn.execute(
                    f"""UPDATE memory_fragments SET
                        access_count = access_count + 1,
                        last_accessed_at = ?
                        WHERE fragment_id IN ({placeholders})""",
                    [time.time()] + result_ids,
                )
                conn.commit()

        return scored[:limit]

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM memory_fragments").fetchone()[0]
            active = conn.execute(
                "SELECT COUNT(*) FROM memory_fragments WHERE consolidated = 0 AND merged_into = ''"
            ).fetchone()[0]
            by_type = conn.execute(
                """SELECT memory_type, COUNT(*) FROM memory_fragments
                   WHERE consolidated = 0 GROUP BY memory_type"""
            ).fetchall()
            avg_importance = conn.execute(
                """SELECT AVG(importance) FROM memory_fragments
                   WHERE consolidated = 0"""
            ).fetchone()[0]

        return {
            "total_fragments": total,
            "active_fragments": active,
            "by_type": {t[0]: t[1] for t in by_type},
            "avg_importance": round(avg_importance, 3) if avg_importance else 0,
        }
