"""Schema版本化 + doctor迁移

借鉴自：
- Dify 的schema版本化
- LangGraph 的checkpoint迁移
- Goose 的recipe迁移

核心思想：
1. 数据库schema必须有版本号
2. 每次变更都是增量迁移
3. doctor命令可以自动检测和修复
"""

import sqlite3
import logging
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("acp-agent.schema-doctor")


class SchemaDoctor:
    """Schema版本管理和迁移
    
    Usage:
        doctor = SchemaDoctor(db_path="/path/to/db.sqlite")
        
        # 检查并迁移
        result = doctor.migrate()
        
        # 或者只检查
        status = doctor.check()
    """
    
    # Schema版本历史
    SCHEMA_VERSIONS = [
        {
            "version": 1,
            "description": "初始schema",
            "tables": [
                """CREATE TABLE IF NOT EXISTS agent_sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    created_at REAL,
                    last_activity_at REAL,
                    message_count INTEGER DEFAULT 0,
                    metadata TEXT
                )""",
                """CREATE TABLE IF NOT EXISTS agent_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    role TEXT,
                    content TEXT,
                    timestamp REAL,
                    FOREIGN KEY (session_id) REFERENCES agent_sessions(id)
                )""",
            ],
        },
        {
            "version": 2,
            "description": "添加任务状态机表",
            "tables": [
                """CREATE TABLE IF NOT EXISTS task_states (
                    id TEXT PRIMARY KEY,
                    session_id TEXT,
                    goal TEXT,
                    entities TEXT,
                    status TEXT,
                    created_at REAL,
                    updated_at REAL,
                    FOREIGN KEY (session_id) REFERENCES agent_sessions(id)
                )""",
            ],
        },
        {
            "version": 3,
            "description": "添加可观测性表",
            "tables": [
                """CREATE TABLE IF NOT EXISTS observability_spans (
                    span_id TEXT PRIMARY KEY,
                    trace_id TEXT,
                    parent_id TEXT,
                    span_type TEXT,
                    name TEXT,
                    start_time REAL,
                    end_time REAL,
                    status TEXT,
                    attributes TEXT,
                    error TEXT
                )""",
                "CREATE INDEX IF NOT EXISTS idx_spans_trace ON observability_spans(trace_id)",
                "CREATE INDEX IF NOT EXISTS idx_spans_parent ON observability_spans(parent_id)",
            ],
        },
        {
            "version": 4,
            "description": "添加编辑安全快照表",
            "tables": [
                """CREATE TABLE IF NOT EXISTS edit_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT,
                    snapshot_path TEXT,
                    content_hash TEXT,
                    created_at REAL,
                    session_id TEXT
                )""",
            ],
        },
        {
            "version": 5,
            "description": "添加工具错误日志表",
            "tables": [
                """CREATE TABLE IF NOT EXISTS tool_error_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    tool_name TEXT,
                    error_message TEXT,
                    category TEXT,
                    action TEXT,
                    timestamp REAL
                )""",
                "CREATE INDEX IF NOT EXISTS idx_errors_session ON tool_error_logs(session_id)",
            ],
        },
        {
            "version": 6,
            "description": "消息树parentId（open-webui fork + pi追加树，P0-10）",
            "tables": [
                "ALTER TABLE agent_messages ADD COLUMN parent_message_id INTEGER",
                "CREATE INDEX IF NOT EXISTS idx_messages_parent ON agent_messages(parent_message_id)",
                # 历史行回填：会话内按id序parent=前一条（pi追加树线性主干），幂等
                """UPDATE agent_messages SET parent_message_id = (
                       SELECT m2.id FROM agent_messages m2
                       WHERE m2.session_id = agent_messages.session_id
                         AND m2.id < agent_messages.id
                       ORDER BY m2.id DESC LIMIT 1
                   ) WHERE parent_message_id IS NULL""",
            ],
        },
    ]
    
    CURRENT_VERSION = len(SCHEMA_VERSIONS)
    
    def __init__(self, db_path: str):
        self.db_path = db_path
    
    def _get_db(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.db_path)
        db.row_factory = sqlite3.Row
        return db
    
    def _get_current_version(self) -> int:
        """获取当前数据库的schema版本"""
        try:
            db = self._get_db()
            # 检查是否有schema_version表
            cursor = db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
            )
            if not cursor.fetchone():
                db.close()
                return 0
            
            row = db.execute("SELECT MAX(version) as v FROM schema_version").fetchone()
            db.close()
            return row["v"] if row and row["v"] else 0
        except Exception:
            return 0
    
    def _record_version(self, db: sqlite3.Connection, version: int, description: str):
        """记录schema版本"""
        db.execute(
            """CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                description TEXT,
                applied_at REAL
            )"""
        )
        db.execute(
            "INSERT OR REPLACE INTO schema_version (version, description, applied_at) VALUES (?, ?, ?)",
            (version, description, time.time()),
        )
    
    def check(self) -> dict:
        """检查schema状态"""
        current = self._get_current_version()
        target = self.CURRENT_VERSION
        
        db = self._get_db()
        
        # 检查各表是否存在
        tables = {}
        for v in self.SCHEMA_VERSIONS:
            for sql in v["tables"]:
                if "CREATE TABLE" in sql:
                    # 提取表名
                    import re
                    match = re.search(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)", sql)
                    if match:
                        table_name = match.group(1)
                        cursor = db.execute(
                            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                            (table_name,),
                        )
                        tables[table_name] = cursor.fetchone() is not None
        
        db.close()
        
        return {
            "current_version": current,
            "target_version": target,
            "needs_migration": current < target,
            "tables": tables,
            "missing_tables": [t for t, exists in tables.items() if not exists],
        }
    
    def migrate(self) -> dict:
        """执行迁移"""
        current = self._get_current_version()
        target = self.CURRENT_VERSION
        
        if current >= target:
            return {
                "status": "up_to_date",
                "current_version": current,
                "target_version": target,
                "migrations_applied": [],
            }
        
        db = self._get_db()
        migrations_applied = []
        
        try:
            for version_info in self.SCHEMA_VERSIONS:
                if version_info["version"] <= current:
                    continue
                
                logger.info(
                    f"[schema-doctor] Applying migration v{version_info['version']}: "
                    f"{version_info['description']}"
                )
                
                for sql in version_info["tables"]:
                    try:
                        db.execute(sql)
                    except sqlite3.OperationalError as sql_exc:
                        # 幂等迁移：ALTER重复列（运行时probe已迁移过）安全跳过，
                        # 其他SQL错误照常raise（失败可见，禁止静默吞）
                        if "duplicate column" in str(sql_exc).lower():
                            logger.info(
                                f"[schema-doctor] skip (already applied): {sql[:60]}..."
                            )
                            continue
                        raise
                
                self._record_version(
                    db,
                    version_info["version"],
                    version_info["description"],
                )
                
                migrations_applied.append({
                    "version": version_info["version"],
                    "description": version_info["description"],
                })
            
            db.commit()
            db.close()
            
            logger.info(
                f"[schema-doctor] Migration complete: "
                f"v{current} → v{target}, "
                f"{len(migrations_applied)} migrations applied"
            )
            
            return {
                "status": "migrated",
                "current_version": current,
                "target_version": target,
                "migrations_applied": migrations_applied,
            }
            
        except Exception as e:
            db.rollback()
            db.close()
            logger.error(f"[schema-doctor] Migration failed: {e}")
            return {
                "status": "failed",
                "current_version": current,
                "target_version": target,
                "error": str(e),
            }
    
    def repair(self) -> dict:
        """修复常见问题"""
        db = self._get_db()
        repairs = []
        
        try:
            # 1. 检查外键完整性
            cursor = db.execute("PRAGMA foreign_key_check")
            fk_errors = cursor.fetchall()
            if fk_errors:
                for err in fk_errors:
                    logger.warning(f"[schema-doctor] Foreign key error: {err}")
                repairs.append(f"Found {len(fk_errors)} foreign key errors")
            
            # 2. 检查索引
            cursor = db.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
            )
            indexes = [row[0] for row in cursor.fetchall()]
            expected_indexes = [
                "idx_spans_trace", "idx_spans_parent",
                "idx_errors_session",
            ]
            missing_indexes = [i for i in expected_indexes if i not in indexes]
            if missing_indexes:
                repairs.append(f"Missing indexes: {missing_indexes}")
            
            # 3. 清理孤儿数据
            cursor = db.execute(
                """DELETE FROM agent_messages 
                   WHERE session_id NOT IN (SELECT id FROM agent_sessions)"""
            )
            if cursor.rowcount > 0:
                repairs.append(f"Cleaned {cursor.rowcount} orphan messages")
            
            db.commit()
            db.close()
            
            return {
                "status": "repaired" if repairs else "clean",
                "repairs": repairs,
            }
            
        except Exception as e:
            db.rollback()
            db.close()
            return {
                "status": "failed",
                "error": str(e),
            }
