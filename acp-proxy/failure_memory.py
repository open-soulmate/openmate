"""失败记忆系统 — 审计表 + 错误风暴熔断 + 失败链

借鉴：
- mem0: 审计表(old/new/event) + linked_memory_ids反幻觉ID映射
- agno: 错误风暴熔断（连续同错即停）
- letta: git版本化记忆（可diff可回滚）
- CAMEL: 工作流记忆（成功模式复用）
"""
import json
import logging
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("failure-memory")

DB_PATH = Path(__file__).parent / "data" / "failure_memory.db"

# 错误风暴熔断配置
STORM_WINDOW = 5          # 检测窗口大小
STORM_THRESHOLD = 3       # 连续同错次数达到此值即熔断


def _get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(DB_PATH))
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    return db


def init_db():
    """初始化数据库表"""
    db = _get_db()
    try:
        db.executescript("""
        -- 失败审计表（借鉴mem0 schema）
        CREATE TABLE IF NOT EXISTS failure_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id TEXT NOT NULL,
            stage TEXT NOT NULL,           -- locate/plan/implement/review/evaluate
            target_file TEXT,
            change_description TEXT,
            failure_reason TEXT NOT NULL,
            error_type TEXT,               -- syntax/import/runtime/protocol/logic
            old_content_hash TEXT,         -- 改动前内容hash
            new_content_hash TEXT,         -- 改动后内容hash
            -- 失败链：指向同源失败
            linked_failure_ids TEXT DEFAULT '[]',
            -- 结果
            outcome TEXT NOT NULL DEFAULT 'failed',  -- failed/rejected/rolled_back
            -- 时间
            created_at REAL NOT NULL,
            resolved_at REAL,
            resolved_by TEXT               -- manual/superseded/duplicate
        );

        -- 成功模式表（借鉴CAMEL工作流记忆）
        CREATE TABLE IF NOT EXISTS success_pattern (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id TEXT NOT NULL,
            target_file TEXT NOT NULL,
            change_description TEXT,
            pattern_type TEXT,             -- bugfix/feature/refactor/config
            verification_method TEXT,      -- how it was verified
            score REAL,
            created_at REAL NOT NULL
        );

        -- 错误风暴检测状态
        CREATE TABLE IF NOT EXISTS storm_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            recent_errors TEXT DEFAULT '[]',  -- 最近N个错误的hash
            storm_detected INTEGER DEFAULT 0,
            storm_count INTEGER DEFAULT 0,
            last_reset REAL
        );

        -- 索引
        CREATE INDEX IF NOT EXISTS idx_failure_file ON failure_log(target_file);
        CREATE INDEX IF NOT EXISTS idx_failure_type ON failure_log(error_type);
        CREATE INDEX IF NOT EXISTS idx_failure_round ON failure_log(round_id);
        CREATE INDEX IF NOT EXISTS idx_failure_time ON failure_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_success_file ON success_pattern(target_file);
        """)
        db.commit()
        logger.info("Failure memory DB initialized")
    finally:
        db.close()


def record_failure(
    round_id: str,
    stage: str,
    target_file: str | None,
    change_description: str | None,
    failure_reason: str,
    error_type: str = "unknown",
    old_content_hash: str | None = None,
    new_content_hash: str | None = None,
    outcome: str = "failed",
) -> int:
    """记录一次失败，返回failure_id"""
    db = _get_db()
    try:
        # 查找同源失败（同文件+同错误类型）
        linked = []
        if target_file:
            rows = db.execute(
                "SELECT id FROM failure_log WHERE target_file = ? AND error_type = ? AND outcome = 'failed' ORDER BY created_at DESC LIMIT 5",
                (target_file, error_type)
            ).fetchall()
            linked = [str(r[0]) for r in rows]

        cursor = db.execute(
            """INSERT INTO failure_log 
               (round_id, stage, target_file, change_description, failure_reason, 
                error_type, old_content_hash, new_content_hash, linked_failure_ids, 
                outcome, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (round_id, stage, target_file, change_description, failure_reason,
             error_type, old_content_hash, new_content_hash, json.dumps(linked),
             outcome, time.time())
        )
        db.commit()
        failure_id = cursor.lastrowid
        logger.info(f"Recorded failure #{failure_id}: [{stage}] {target_file or 'N/A'} - {failure_reason[:80]}")
        return failure_id
    finally:
        db.close()


def record_success(
    round_id: str,
    target_file: str,
    change_description: str | None,
    pattern_type: str = "bugfix",
    verification_method: str = "pipeline",
    score: float = 1.0,
) -> int:
    """记录一次成功，返回pattern_id"""
    db = _get_db()
    try:
        cursor = db.execute(
            """INSERT INTO success_pattern 
               (round_id, target_file, change_description, pattern_type, verification_method, score, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (round_id, target_file, change_description, pattern_type, verification_method, score, time.time())
        )
        db.commit()
        return cursor.lastrowid
    finally:
        db.close()


def check_error_storm(error_signature: str) -> bool:
    """检查是否触发错误风暴熔断
    
    借鉴agno: 前N个attempt全部error且类型相同 → 停止
    返回True表示应该熔断（停止进化）
    """
    db = _get_db()
    try:
        row = db.execute("SELECT recent_errors, storm_detected FROM storm_state WHERE id = 1").fetchone()
        if not row:
            db.execute("INSERT INTO storm_state (id, recent_errors, storm_detected, last_reset) VALUES (1, '[]', 0, ?)", (time.time(),))
            db.commit()
            return False

        recent = json.loads(row[0] or "[]")
        already_storm = row[1]

        # 添加新错误
        recent.append({"signature": error_signature, "time": time.time()})
        # 只保留窗口内的
        if len(recent) > STORM_WINDOW:
            recent = recent[-STORM_WINDOW:]

        # 检测风暴：窗口内所有错误签名相同
        signatures = [e["signature"] for e in recent]
        is_storm = (
            len(signatures) >= STORM_THRESHOLD
            and len(set(signatures)) == 1
        )

        storm_count = 0
        if is_storm:
            row2 = db.execute("SELECT storm_count FROM storm_state WHERE id = 1").fetchone()
            storm_count = (row2[0] or 0) + 1

        db.execute(
            "UPDATE storm_state SET recent_errors = ?, storm_detected = ?, storm_count = ?, last_reset = ? WHERE id = 1",
            (json.dumps(recent), 1 if is_storm else 0, storm_count, time.time())
        )
        db.commit()

        if is_storm:
            logger.warning(f"⚠️ Error storm detected! signature={error_signature[:60]}, count={storm_count}")

        return is_storm
    finally:
        db.close()


def reset_storm():
    """重置错误风暴状态（进化成功后调用）"""
    db = _get_db()
    try:
        db.execute("UPDATE storm_state SET recent_errors = '[]', storm_detected = 0, storm_count = 0, last_reset = ? WHERE id = 1", (time.time(),))
        db.commit()
    finally:
        db.close()


def query_failures_for_file(target_file: str, limit: int = 5) -> list[dict]:
    """查询某文件的历史失败记录 — 用于进化规划时避免重复踩坑"""
    db = _get_db()
    try:
        rows = db.execute(
            """SELECT id, stage, failure_reason, error_type, change_description, 
                      linked_failure_ids, outcome, created_at
               FROM failure_log 
               WHERE target_file = ? AND outcome = 'failed'
               ORDER BY created_at DESC LIMIT ?""",
            (target_file, limit)
        ).fetchall()
        return [
            {
                "id": r[0], "stage": r[1], "reason": r[2], "error_type": r[3],
                "description": r[4], "linked_ids": json.loads(r[5] or "[]"),
                "outcome": r[6], "time": r[7],
            }
            for r in rows
        ]
    finally:
        db.close()


def get_failure_summary() -> dict:
    """获取失败统计摘要 — 用于进化决策"""
    db = _get_db()
    try:
        total = db.execute("SELECT COUNT(*) FROM failure_log").fetchone()[0]
        failed = db.execute("SELECT COUNT(*) FROM failure_log WHERE outcome = 'failed'").fetchone()[0]
        by_type = db.execute(
            "SELECT error_type, COUNT(*) FROM failure_log WHERE outcome = 'failed' GROUP BY error_type ORDER BY COUNT(*) DESC LIMIT 10"
        ).fetchall()
        by_file = db.execute(
            "SELECT target_file, COUNT(*) FROM failure_log WHERE outcome = 'failed' AND target_file IS NOT NULL GROUP BY target_file ORDER BY COUNT(*) DESC LIMIT 10"
        ).fetchall()
        successes = db.execute("SELECT COUNT(*) FROM success_pattern").fetchone()[0]

        return {
            "total_failures": total,
            "active_failures": failed,
            "successes": successes,
            "by_error_type": {r[0]: r[1] for r in by_type},
            "most_failed_files": {r[0]: r[1] for r in by_file},
        }
    finally:
        db.close()


def get_failure_context_for_planning(target_files: list[str]) -> str:
    """生成失败上下文，注入到进化规划的prompt中
    
    这是核心改进：让evo在规划时就知道"这个文件之前改过什么、为什么失败"
    """
    context_parts = []

    for f in target_files:
        failures = query_failures_for_file(f, limit=3)
        if failures:
            context_parts.append(f"\n⚠️ 文件 {f} 的历史失败记录：")
            for fail in failures:
                linked = ""
                if fail["linked_ids"]:
                    linked = f" (关联失败: {', '.join(fail['linked_ids'][:3])})"
                context_parts.append(
                    f"  - [{fail['error_type']}] {fail['reason'][:150]}{linked}"
                )
                if fail["description"]:
                    context_parts.append(f"    尝试的修改: {fail['description'][:100]}")

    # 全局统计
    summary = get_failure_summary()
    if summary["most_failed_files"]:
        worst = list(summary["most_failed_files"].items())[:3]
        context_parts.append(f"\n📊 全局失败统计：最常失败的文件 = {worst}")
        context_parts.append(f"   总失败 {summary['active_failures']} 次，成功 {summary['successes']} 次")

    return "\n".join(context_parts) if context_parts else ""


# 初始化
init_db()
