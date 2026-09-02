"""投标文档引擎 — SQLite 存储层

BiddingStore 单例，管理 projects / documents / outlines / check_results / knowledge 五张表。
线程安全，使用 threading.Lock 保护写操作。
"""

import json
import logging
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .models import (
    CheckResult, OutlineNode, ParseResult, Project, ProjectStatus,
)

logger = logging.getLogger("acp-proxy.bidding.store")

DB_PATH = Path(__file__).parent.parent / "data" / "bidding.db"


class BiddingStore:
    """投标项目存储 — 全局单例"""

    _instance: Optional["BiddingStore"] = None
    _lock_class = threading.Lock()

    def __new__(cls) -> "BiddingStore":
        if cls._instance is None:
            with cls._lock_class:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._lock = threading.Lock()
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._create_tables()
        logger.info(f"BiddingStore 初始化完成, db={DB_PATH}")

    def _create_tables(self):
        cur = self._conn.cursor()
        cur.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                parse_result TEXT DEFAULT '{}',
                outline TEXT DEFAULT '{}',
                check_results TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_type TEXT NOT NULL DEFAULT '',
                raw_text TEXT DEFAULT '',
                page_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE TABLE IF NOT EXISTS outlines (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                title TEXT DEFAULT '',
                content TEXT DEFAULT '',
                parent_id TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE TABLE IF NOT EXISTS check_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                rule_id TEXT NOT NULL,
                severity TEXT NOT NULL,
                description TEXT DEFAULT '',
                suggestion TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                category TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE TABLE IF NOT EXISTS knowledge (
                id TEXT PRIMARY KEY,
                category TEXT DEFAULT '',
                title TEXT DEFAULT '',
                content TEXT DEFAULT '',
                tags TEXT DEFAULT '[]',
                created_at TEXT NOT NULL
            );
        """)
        self._conn.commit()

    # ── Project CRUD ────────────────────────────────────────────

    def create_project(self, name: str = "", **kwargs) -> Project:
        pid = str(uuid.uuid4())[:8]
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            self._conn.execute(
                "INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?,?,?,?,?)",
                (pid, name, ProjectStatus.DRAFT.value, now, now),
            )
            self._conn.commit()
        return Project(id=pid, name=name, created_at=datetime.fromisoformat(now),
                        updated_at=datetime.fromisoformat(now))

    def get_project(self, project_id: str) -> Optional[Project]:
        row = self._conn.execute(
            "SELECT * FROM projects WHERE id=?", (project_id,)
        ).fetchone()
        if not row:
            return None
        return self._row_to_project(row)

    def update_project(self, project: Project) -> None:
        project.updated_at = datetime.now(timezone.utc)
        pr_json = project.parse_result.model_dump_json() if project.parse_result else "{}"
        ol_json = project.outline.model_dump_json() if project.outline else "{}"
        cr_json = json.dumps([c.model_dump() for c in project.check_results], ensure_ascii=False)
        with self._lock:
            self._conn.execute(
                "UPDATE projects SET name=?, status=?, parse_result=?, outline=?, "
                "check_results=?, updated_at=? WHERE id=?",
                (project.name, project.status.value, pr_json, ol_json,
                 cr_json, project.updated_at.isoformat(), project.id),
            )
            self._conn.commit()

    def list_projects(self, limit: int = 50) -> list[Project]:
        rows = self._conn.execute(
            "SELECT * FROM projects ORDER BY updated_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [self._row_to_project(r) for r in rows]

    def delete_project(self, project_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM projects WHERE id=?", (project_id,))
            self._conn.execute("DELETE FROM documents WHERE project_id=?", (project_id,))
            self._conn.execute("DELETE FROM outlines WHERE project_id=?", (project_id,))
            self._conn.execute("DELETE FROM check_results WHERE project_id=?", (project_id,))
            self._conn.commit()
            return cur.rowcount > 0

    # ── Document ────────────────────────────────────────────────

    def save_document(self, project_id: str, file_path: str, file_type: str,
                      raw_text: str, page_count: int = 0) -> str:
        doc_id = str(uuid.uuid4())[:8]
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            self._conn.execute(
                "INSERT INTO documents (id, project_id, file_path, file_type, "
                "raw_text, page_count, created_at) VALUES (?,?,?,?,?,?,?)",
                (doc_id, project_id, file_path, file_type, raw_text, page_count, now),
            )
            self._conn.commit()
        return doc_id

    # ── Outline ─────────────────────────────────────────────────

    def save_outline_nodes(self, project_id: str, nodes: list[OutlineNode],
                           parent_id: str = ""):
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            for i, node in enumerate(nodes):
                self._conn.execute(
                    "INSERT OR REPLACE INTO outlines "
                    "(id, project_id, node_id, title, content, parent_id, sort_order, created_at) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (f"{project_id}-{node.id}", project_id, node.id, node.title,
                     node.content, parent_id, i, now),
                )
                if node.children:
                    self._save_outline_children(project_id, node.children, node.id, now)
            self._conn.commit()

    def _save_outline_children(self, project_id: str, children: list[OutlineNode],
                                parent_id: str, now: str):
        for i, child in enumerate(children):
            self._conn.execute(
                "INSERT OR REPLACE INTO outlines "
                "(id, project_id, node_id, title, content, parent_id, sort_order, created_at) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (f"{project_id}-{child.id}", project_id, child.id, child.title,
                 child.content, parent_id, i, now),
            )
            if child.children:
                self._save_outline_children(project_id, child.children, child.id, now)

    # ── Knowledge ───────────────────────────────────────────────

    def add_knowledge(self, category: str, title: str, content: str,
                      tags: list[str] | None = None) -> str:
        kid = str(uuid.uuid4())[:8]
        now = datetime.now(timezone.utc).isoformat()
        tags_json = json.dumps(tags or [], ensure_ascii=False)
        with self._lock:
            self._conn.execute(
                "INSERT INTO knowledge (id, category, title, content, tags, created_at) "
                "VALUES (?,?,?,?,?,?)",
                (kid, category, title, content, tags_json, now),
            )
            self._conn.commit()
        return kid

    def search_knowledge(self, keyword: str, limit: int = 10) -> list[dict]:
        rows = self._conn.execute(
            "SELECT * FROM knowledge WHERE title LIKE ? OR content LIKE ? LIMIT ?",
            (f"%{keyword}%", f"%{keyword}%", limit),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── 内部转换 ────────────────────────────────────────────────

    def _row_to_project(self, row: sqlite3.Row) -> Project:
        pr = None
        if row["parse_result"] and row["parse_result"] != "{}":
            try:
                pr = ParseResult.model_validate_json(row["parse_result"])
            except Exception:
                pass
        ol = None
        if row["outline"] and row["outline"] != "{}":
            try:
                ol = OutlineNode.model_validate_json(row["outline"])
            except Exception:
                pass
        cr = []
        if row["check_results"] and row["check_results"] != "[]":
            try:
                cr_data = json.loads(row["check_results"])
                cr = [CheckResult(**c) for c in cr_data]
            except Exception:
                pass
        return Project(
            id=row["id"],
            name=row["name"],
            status=ProjectStatus(row["status"]),
            parse_result=pr,
            outline=ol,
            check_results=cr,
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )
