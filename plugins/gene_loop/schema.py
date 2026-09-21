"""gene-loop 数据层 — gene_proposals schema 与不变量（架构v2.1 §3.3）

设计要点：
- 不变量由SQLite触发器在数据层强制（借鉴 ai-memory V22），任何写入方（agent/人/工具）都绕不过
- 数据库：acp-proxy/data/gene_loop.db（管道自有运营数据，与Gene模板库分离）
- 环境变量 GENE_LOOP_DB 可覆盖路径（测试用）
"""
import os
import sqlite3
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
# plugins/gene_loop/schema.py → parents[2] = 项目根openmate/，DB在acp-proxy/data/（2026-09-21目录统一）
DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "acp-proxy" / "data" / "gene_loop.db"


def get_db_path() -> Path:
    """数据库路径：环境变量 GENE_LOOP_DB > 默认 acp-proxy/data/gene_loop.db"""
    return Path(os.environ.get("GENE_LOOP_DB") or DEFAULT_DB_PATH)


def connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    """打开连接（WAL + busy_timeout，兼容evo cron与Hermes cron并发）"""
    path = Path(db_path) if db_path else get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


def migrate(conn: sqlite3.Connection) -> None:
    """按文件名顺序执行migrations（幂等：SQL内全部IF NOT EXISTS）"""
    for sql_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
        conn.executescript(sql_file.read_text(encoding="utf-8"))
    conn.commit()
