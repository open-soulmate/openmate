"""
会话内文件索引与搜索 — 借鉴RAG-lite即时索引 + ripgrep混合搜索
核心思想：会话中创建/修改的文件自动索引，支持语义+关键词混合搜索
"""

import logging
import json
import time
import hashlib
import sqlite3
import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.file-index")


@dataclass
class IndexedFile:
    file_path: str
    content_hash: str
    size: int
    language: str
    indexed_at: float
    chunks: list[dict] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


@dataclass
class SearchResult:
    file_path: str
    chunk_index: int
    content: str
    score: float
    line_start: int
    line_end: int


class SessionFileIndex:
    """会话内文件索引 — SQLite FTS5全文搜索"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "file-index"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "index.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            # 主表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS indexed_files (
                    file_path TEXT PRIMARY KEY,
                    content_hash TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    language TEXT DEFAULT '',
                    indexed_at REAL NOT NULL,
                    chunk_count INTEGER DEFAULT 0,
                    metadata TEXT DEFAULT '{}'
                )
            """)
            # FTS5全文搜索表
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS file_chunks_fts
                USING fts5(
                    file_path,
                    chunk_index,
                    content,
                    tokenize='unicode61'
                )
            """)
            conn.commit()

    def index_file(self, file_path: str, content: str, language: str = "", metadata: Optional[dict] = None):
        """索引文件内容 — 自动分chunk"""
        content_hash = hashlib.sha256(content.encode()).hexdigest()

        # 检查是否已索引且未变化
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT content_hash FROM indexed_files WHERE file_path = ?",
                (file_path,),
            ).fetchone()
            if row and row[0] == content_hash:
                return  # 未变化，跳过

        # 自动检测语言
        if not language:
            language = self._detect_language(file_path)

        # 分chunk（按函数/段落边界）
        chunks = self._split_into_chunks(content)

        # 删除旧索引
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM file_chunks_fts WHERE file_path = ?", (file_path,))
            conn.execute("DELETE FROM indexed_files WHERE file_path = ?", (file_path,))

            # 写入新索引
            for i, chunk in enumerate(chunks):
                conn.execute(
                    "INSERT INTO file_chunks_fts (file_path, chunk_index, content) VALUES (?, ?, ?)",
                    (file_path, i, chunk["content"]),
                )

            conn.execute(
                """INSERT INTO indexed_files
                   (file_path, content_hash, size, language, indexed_at, chunk_count, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (file_path, content_hash, len(content), language,
                 time.time(), len(chunks), json.dumps(metadata or {})),
            )
            conn.commit()

        logger.debug(f"Indexed {file_path}: {len(chunks)} chunks, {len(content)} chars")

    def search(self, query: str, limit: int = 10, file_filter: str = "") -> list[SearchResult]:
        """全文搜索"""
        fts_query = self._to_fts_query(query)

        sql = """
            SELECT file_path, chunk_index, content, rank
            FROM file_chunks_fts
            WHERE file_chunks_fts MATCH ?
        """
        params: list = [fts_query]

        if file_filter:
            sql += " AND file_path LIKE ?"
            params.append(f"%{file_filter}%")

        sql += " ORDER BY rank LIMIT ?"
        params.append(limit)

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(sql, params).fetchall()
            except Exception as e:
                logger.warning(f"FTS query failed: {e}, falling back to LIKE")
                rows = conn.execute(
                    """SELECT file_path, chunk_index, content, 0 as rank
                       FROM file_chunks_fts WHERE content LIKE ? LIMIT ?""",
                    (f"%{query}%", limit),
                ).fetchall()

        results = []
        for row in rows:
            lines = row["content"].split("\n")
            results.append(SearchResult(
                file_path=row["file_path"],
                chunk_index=row["chunk_index"],
                content=row["content"][:500],
                score=abs(row["rank"]),
                line_start=0,
                line_end=len(lines),
            ))

        return results

    def get_file_summary(self, file_path: str) -> Optional[dict]:
        """获取已索引文件的摘要"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM indexed_files WHERE file_path = ?",
                (file_path,),
            ).fetchone()
        if not row:
            return None
        return {
            "file_path": row["file_path"],
            "size": row["size"],
            "language": row["language"],
            "chunk_count": row["chunk_count"],
            "indexed_at": row["indexed_at"],
            "metadata": json.loads(row["metadata"]),
        }

    def list_indexed_files(self) -> list[dict]:
        """列出所有已索引文件"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT file_path, size, language, chunk_count, indexed_at FROM indexed_files ORDER BY indexed_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def remove_file(self, file_path: str):
        """从索引中移除文件"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM file_chunks_fts WHERE file_path = ?", (file_path,))
            conn.execute("DELETE FROM indexed_files WHERE file_path = ?", (file_path,))
            conn.commit()

    def _split_into_chunks(self, content: str, max_chunk_size: int = 2000) -> list[dict]:
        """智能分chunk — 按函数/类/段落边界"""
        chunks = []
        lines = content.split("\n")
        current_chunk = []
        current_size = 0

        for line in lines:
            current_chunk.append(line)
            current_size += len(line) + 1

            # 在函数/类定义边界处分割
            is_boundary = (
                re.match(r"^(def |class |function |export |async def )", line.strip()) or
                re.match(r"^(# |// |/\*)", line.strip()) or
                line.strip() == "" and current_size > max_chunk_size * 0.5
            )

            if current_size >= max_chunk_size or (is_boundary and current_size > 200):
                chunks.append({
                    "content": "\n".join(current_chunk),
                    "line_start": len(chunks) * 100,  # approximate
                })
                current_chunk = []
                current_size = 0

        if current_chunk:
            chunks.append({
                "content": "\n".join(current_chunk),
                "line_start": len(chunks) * 100,
            })

        return chunks

    def _detect_language(self, file_path: str) -> str:
        ext = Path(file_path).suffix.lower()
        return {
            ".py": "python", ".ts": "typescript", ".tsx": "tsx",
            ".js": "javascript", ".jsx": "jsx", ".rs": "rust",
            ".go": "go", ".java": "java", ".cpp": "cpp", ".c": "c",
            ".md": "markdown", ".json": "json", ".yaml": "yaml",
            ".yml": "yaml", ".toml": "toml", ".sh": "bash",
        }.get(ext, "text")

    def _to_fts_query(self, query: str) -> str:
        """转换为FTS5查询语法"""
        # 移除特殊字符，分割为词
        words = re.findall(r"\w+", query)
        if not words:
            return query
        return " OR ".join(words)

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            files = conn.execute("SELECT COUNT(*) FROM indexed_files").fetchone()[0]
            chunks = conn.execute("SELECT COUNT(*) FROM file_chunks_fts").fetchone()[0]
            total_size = conn.execute("SELECT COALESCE(SUM(size), 0) FROM indexed_files").fetchone()[0]
        return {
            "indexed_files": files,
            "total_chunks": chunks,
            "total_size_bytes": total_size,
            "db_path": self.db_path,
        }
