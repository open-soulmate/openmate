"""
记忆检索引擎 — 借鉴Mem0/Zep/MemGPT的分层记忆系统
核心思想：短期记忆（对话上下文）→ 工作记忆（当前任务）→ 长期记忆（持久化知识）
针对OpenSoul的四层记忆体系设计
"""

import logging
import json
import time
import sqlite3
import hashlib
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime
from enum import Enum

logger = logging.getLogger("acp-proxy.memory-retrieval")


class MemoryType(str, Enum):
    EPISODIC = "episodic"      # 情景记忆：具体事件
    SEMANTIC = "semantic"      # 语义记忆：事实知识
    PROCEDURAL = "procedural"  # 程序记忆：操作步骤
    WORKING = "working"        # 工作记忆：当前任务上下文


class MemoryImportance(int, Enum):
    TRIVIAL = 1
    LOW = 2
    NORMAL = 3
    HIGH = 4
    CRITICAL = 5


@dataclass
class MemoryEntry:
    memory_id: str
    memory_type: MemoryType
    content: str
    importance: MemoryImportance = MemoryImportance.NORMAL
    session_id: str = ""
    tags: list[str] = field(default_factory=list)
    embedding_text: str = ""  # 用于检索的文本
    created_at: float = field(default_factory=time.time)
    last_accessed: float = field(default_factory=time.time)
    access_count: int = 0
    decay_rate: float = 0.01  # 遗忘速率
    metadata: dict = field(default_factory=dict)

    @property
    def relevance_score(self) -> float:
        """综合相关性分数（重要性 + 新近度 + 使用频率）"""
        age_hours = (time.time() - self.created_at) / 3600
        recency = 1.0 / (1.0 + self.decay_rate * age_hours)
        frequency = min(1.0, self.access_count / 10.0)
        importance = self.importance.value / 5.0

        return 0.4 * importance + 0.3 * recency + 0.3 * frequency


class MemoryRetrievalEngine:
    """记忆检索引擎"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "memory"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "memory.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    memory_id TEXT PRIMARY KEY,
                    memory_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    importance INTEGER DEFAULT 3,
                    session_id TEXT DEFAULT '',
                    tags TEXT DEFAULT '[]',
                    embedding_text TEXT DEFAULT '',
                    created_at REAL NOT NULL,
                    last_accessed REAL NOT NULL,
                    access_count INTEGER DEFAULT 0,
                    decay_rate REAL DEFAULT 0.01,
                    metadata TEXT DEFAULT '{}'
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_type
                ON memories(memory_type, importance)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_session
                ON memories(session_id)
            """)
            # FTS全文搜索
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
                USING fts5(memory_id, content, embedding_text, tokenize='unicode61')
            """)
            conn.commit()

    def store(
        self,
        content: str,
        memory_type: MemoryType = MemoryType.EPISODIC,
        importance: MemoryImportance = MemoryImportance.NORMAL,
        session_id: str = "",
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ) -> MemoryEntry:
        """存储记忆"""
        memory_id = f"mem_{hashlib.sha256(f'{content}:{time.time()}'.encode()).hexdigest()[:12]}"

        entry = MemoryEntry(
            memory_id=memory_id,
            memory_type=memory_type,
            content=content,
            importance=importance,
            session_id=session_id,
            tags=tags or [],
            embedding_text=self._extract_keywords(content),
            metadata=metadata or {},
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO memories
                   (memory_id, memory_type, content, importance, session_id,
                    tags, embedding_text, created_at, last_accessed,
                    access_count, decay_rate, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (entry.memory_id, entry.memory_type.value, entry.content,
                 entry.importance.value, entry.session_id,
                 json.dumps(entry.tags), entry.embedding_text,
                 entry.created_at, entry.last_accessed,
                 entry.access_count, entry.decay_rate,
                 json.dumps(entry.metadata)),
            )
            # FTS索引
            conn.execute(
                "INSERT INTO memories_fts (memory_id, content, embedding_text) VALUES (?, ?, ?)",
                (entry.memory_id, entry.content, entry.embedding_text),
            )
            conn.commit()

        logger.debug(f"Stored memory: {memory_id} ({memory_type.value}, importance={importance.value})")
        return entry

    def retrieve(
        self,
        query: str,
        memory_type: Optional[MemoryType] = None,
        session_id: str = "",
        limit: int = 10,
        min_importance: MemoryImportance = MemoryImportance.TRIVIAL,
    ) -> list[MemoryEntry]:
        """检索记忆"""
        # 关键词搜索
        keywords = self._extract_keywords(query)
        fts_query = " OR ".join(keywords.split()) if keywords else query

        sql = """
            SELECT m.* FROM memories m
            JOIN memories_fts f ON m.memory_id = f.memory_id
            WHERE memories_fts MATCH ?
        """
        params: list = [fts_query]

        if memory_type:
            sql += " AND m.memory_type = ?"
            params.append(memory_type.value)

        if session_id:
            sql += " AND m.session_id = ?"
            params.append(session_id)

        sql += " AND m.importance >= ?"
        params.append(min_importance.value)

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(sql, params).fetchall()
            except Exception:
                # FTS查询失败，fallback到LIKE
                rows = conn.execute(
                    """SELECT * FROM memories WHERE content LIKE ? LIMIT ?""",
                    (f"%{query}%", limit * 2),
                ).fetchall()

        # 转换为MemoryEntry并排序
        entries = []
        for row in rows:
            entry = MemoryEntry(
                memory_id=row["memory_id"],
                memory_type=MemoryType(row["memory_type"]),
                content=row["content"],
                importance=MemoryImportance(row["importance"]),
                session_id=row["session_id"],
                tags=json.loads(row["tags"]),
                embedding_text=row["embedding_text"],
                created_at=row["created_at"],
                last_accessed=row["last_accessed"],
                access_count=row["access_count"],
                decay_rate=row["decay_rate"],
                metadata=json.loads(row["metadata"]),
            )
            entries.append(entry)

        # 按相关性排序
        entries.sort(key=lambda e: -e.relevance_score)

        # 更新访问计数
        for entry in entries[:limit]:
            self._update_access(entry.memory_id)

        return entries[:limit]

    def get_context_memories(
        self,
        session_id: str,
        query: str = "",
        max_tokens: int = 4000,
    ) -> str:
        """获取上下文记忆（用于注入到prompt）"""
        # 获取会话相关的记忆
        memories = self.retrieve(
            query=query or session_id,
            session_id=session_id,
            limit=20,
        )

        # 按token预算组装
        context_parts = []
        total_chars = 0

        for mem in memories:
            text = f"[{mem.memory_type.value}] {mem.content}"
            if total_chars + len(text) > max_tokens * 2:  # rough char-to-token
                break
            context_parts.append(text)
            total_chars += len(text)

        return "\n".join(context_parts)

    def consolidate(self, session_id: str):
        """整合会话记忆 — 去重、合并、降级旧记忆"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # 获取会话所有记忆
            rows = conn.execute(
                "SELECT * FROM memories WHERE session_id = ? ORDER BY importance DESC",
                (session_id,),
            ).fetchall()

            # 简单去重：内容相似度>0.8的只保留重要性高的
            seen_contents: dict[str, str] = {}
            to_delete: list[str] = []

            for row in rows:
                content_hash = hashlib.sha256(row["content"][:100].encode()).hexdigest()
                if content_hash in seen_contents:
                    to_delete.append(row["memory_id"])
                else:
                    seen_contents[content_hash] = row["memory_id"]

            # 删除重复
            for mem_id in to_delete:
                conn.execute("DELETE FROM memories WHERE memory_id = ?", (mem_id,))
                conn.execute("DELETE FROM memories_fts WHERE memory_id = ?", (mem_id,))

            conn.commit()

            if to_delete:
                logger.info(f"Consolidated {len(to_delete)} duplicate memories for session {session_id}")

    def forget(self, memory_id: str):
        """遗忘特定记忆"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM memories WHERE memory_id = ?", (memory_id,))
            conn.execute("DELETE FROM memories_fts WHERE memory_id = ?", (memory_id,))
            conn.commit()

    def _update_access(self, memory_id: str):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE memory_id = ?",
                (time.time(), memory_id),
            )
            conn.commit()

    def _extract_keywords(self, text: str) -> str:
        """提取关键词（简单实现）"""
        import re
        # 移除标点，保留中英文
        words = re.findall(r"[\w\u4e00-\u9fff]+", text)
        # 去除常见停用词
        stopwords = {"的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "a", "an", "the", "is", "are", "was", "were"}
        keywords = [w for w in words if w.lower() not in stopwords and len(w) > 1]
        return " ".join(keywords[:20])

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
            by_type = conn.execute(
                "SELECT memory_type, COUNT(*) as cnt FROM memories GROUP BY memory_type"
            ).fetchall()
            avg_importance = conn.execute(
                "SELECT AVG(importance) FROM memories"
            ).fetchone()[0] or 0

        return {
            "total_memories": total,
            "by_type": {r[0]: r[1] for r in by_type},
            "avg_importance": f"{avg_importance:.1f}",
            "db_path": self.db_path,
        }
