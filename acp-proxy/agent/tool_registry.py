"""
工具发现与注册中心 — 借鉴MCP tool registry + Semantic Kernel plugin system
核心思想：工具自动注册、能力发现、语义搜索、版本管理
"""

import logging
import json
import time
import sqlite3
import hashlib
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Callable, Any

logger = logging.getLogger("acp-proxy.tool-registry")


@dataclass
class ToolDefinition:
    tool_id: str
    name: str
    description: str
    category: str = "general"
    version: str = "1.0.0"
    parameters_schema: dict = field(default_factory=dict)
    examples: list[dict] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    enabled: bool = True
    call_count: int = 0
    avg_duration_ms: float = 0.0
    success_rate: float = 1.0
    created_at: float = field(default_factory=time.time)
    metadata: dict = field(default_factory=dict)


class ToolRegistry:
    """工具注册中心"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "tool-registry"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "registry.db")
        self.db_path = db_path
        self._handlers: dict[str, Callable] = {}
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tools (
                    tool_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    category TEXT DEFAULT 'general',
                    version TEXT DEFAULT '1.0.0',
                    parameters_schema TEXT DEFAULT '{}',
                    examples TEXT DEFAULT '[]',
                    tags TEXT DEFAULT '[]',
                    enabled INTEGER DEFAULT 1,
                    call_count INTEGER DEFAULT 0,
                    avg_duration_ms REAL DEFAULT 0,
                    success_rate REAL DEFAULT 1.0,
                    created_at REAL NOT NULL,
                    metadata TEXT DEFAULT '{}'
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tools_name
                ON tools(name)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tools_category
                ON tools(category)
            """)
            # FTS搜索
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS tools_fts
                USING fts5(tool_id, name, description, tags, tokenize='unicode61')
            """)
            conn.commit()

    def register(
        self,
        name: str,
        description: str,
        handler: Optional[Callable] = None,
        category: str = "general",
        parameters_schema: Optional[dict] = None,
        examples: Optional[list[dict]] = None,
        tags: Optional[list[str]] = None,
        version: str = "1.0.0",
    ) -> ToolDefinition:
        """注册工具"""
        tool_id = f"tool_{hashlib.sha256(name.encode()).hexdigest()[:12]}"

        tool = ToolDefinition(
            tool_id=tool_id,
            name=name,
            description=description,
            category=category,
            version=version,
            parameters_schema=parameters_schema or {},
            examples=examples or [],
            tags=tags or [],
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO tools
                   (tool_id, name, description, category, version,
                    parameters_schema, examples, tags, enabled,
                    call_count, avg_duration_ms, success_rate, created_at, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (tool.tool_id, tool.name, tool.description, tool.category,
                 tool.version, json.dumps(tool.parameters_schema, ensure_ascii=False),
                 json.dumps(tool.examples, ensure_ascii=False),
                 json.dumps(tool.tags), 1,
                 0, 0, 1.0, tool.created_at, json.dumps({})),
            )
            # FTS索引
            conn.execute(
                "INSERT OR REPLACE INTO tools_fts (tool_id, name, description, tags) VALUES (?, ?, ?, ?)",
                (tool.tool_id, tool.name, tool.description, json.dumps(tool.tags)),
            )
            conn.commit()

        if handler:
            self._handlers[name] = handler

        logger.info(f"Registered tool: {name} ({category})")
        return tool

    def get(self, name: str) -> Optional[dict]:
        """获取工具定义"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM tools WHERE name = ? AND enabled = 1",
                (name,),
            ).fetchone()
        return dict(row) if row else None

    def search(
        self,
        query: str,
        category: str = "",
        limit: int = 10,
    ) -> list[dict]:
        """搜索工具"""
        sql = """
            SELECT t.* FROM tools t
            JOIN tools_fts f ON t.tool_id = f.tool_id
            WHERE tools_fts MATCH ? AND t.enabled = 1
        """
        params: list = [query]

        if category:
            sql += " AND t.category = ?"
            params.append(category)

        sql += " ORDER BY t.call_count DESC LIMIT ?"
        params.append(limit)

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(sql, params).fetchall()
            except Exception:
                rows = conn.execute(
                    """SELECT * FROM tools
                       WHERE (name LIKE ? OR description LIKE ?) AND enabled = 1
                       ORDER BY call_count DESC LIMIT ?""",
                    (f"%{query}%", f"%{query}%", limit),
                ).fetchall()

        return [dict(r) for r in rows]

    def list_by_category(self) -> dict[str, list[dict]]:
        """按分类列出所有工具"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM tools WHERE enabled = 1 ORDER BY category, name"
            ).fetchall()

        result: dict[str, list[dict]] = {}
        for row in rows:
            cat = row["category"]
            if cat not in result:
                result[cat] = []
            result[cat].append(dict(row))

        return result

    def record_call(
        self,
        name: str,
        success: bool,
        duration_ms: float,
    ):
        """记录工具调用统计"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """UPDATE tools SET
                   call_count = call_count + 1,
                   avg_duration_ms = (avg_duration_ms * call_count + ?) / (call_count + 1),
                   success_rate = (success_rate * call_count + ?) / (call_count + 1)
                   WHERE name = ?""",
                (duration_ms, 1.0 if success else 0.0, name),
            )
            conn.commit()

    def get_recommendations(self, context: str, limit: int = 5) -> list[dict]:
        """根据上下文推荐工具"""
        # 基于关键词匹配
        results = self.search(context, limit=limit)
        if results:
            return results

        # fallback：返回最常用的工具
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT * FROM tools WHERE enabled = 1
                   ORDER BY call_count DESC LIMIT ?""",
                (limit,),
            ).fetchall()

        return [dict(r) for r in rows]

    def get_handler(self, name: str) -> Optional[Callable]:
        return self._handlers.get(name)

    def disable(self, name: str):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE tools SET enabled = 0 WHERE name = ?", (name,))
            conn.commit()

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM tools WHERE enabled = 1").fetchone()[0]
            categories = conn.execute(
                "SELECT category, COUNT(*) FROM tools WHERE enabled = 1 GROUP BY category"
            ).fetchall()
            most_used = conn.execute(
                "SELECT name, call_count FROM tools ORDER BY call_count DESC LIMIT 5"
            ).fetchall()

        return {
            "total_tools": total,
            "categories": {c[0]: c[1] for c in categories},
            "most_used": [{"name": m[0], "calls": m[1]} for m in most_used],
            "registered_handlers": len(self._handlers),
        }
