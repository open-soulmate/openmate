"""
工具调用链优化器 — 借鉴DSPy优化器 + OPRO (Optimization by PROmpting)
核心思想：分析历史成功/失败的工具调用链，自动优化未来的调用策略
"""

import logging
import json
import time
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.chain-optimizer")


@dataclass
class ToolChainPattern:
    pattern_id: str
    task_type: str
    tool_sequence: list[str]  # 工具调用序列
    success_count: int = 0
    failure_count: int = 0
    avg_duration_ms: float = 0.0
    avg_quality: float = 0.0  # 0.0 - 1.0
    created_at: float = field(default_factory=time.time)
    last_used_at: float = 0.0
    notes: str = ""

    @property
    def success_rate(self) -> float:
        total = self.success_count + self.failure_count
        return self.success_count / total if total else 0.0

    @property
    def score(self) -> float:
        """综合评分：成功率×质量÷耗时"""
        return (
            self.success_rate * 0.5 +
            self.avg_quality * 0.3 +
            (1.0 / (self.avg_duration_ms + 1)) * 0.2
        )


class ChainOptimizer:
    """工具调用链优化器"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "chain-optimizer"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "patterns.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS chain_patterns (
                    pattern_id TEXT PRIMARY KEY,
                    task_type TEXT NOT NULL,
                    tool_sequence TEXT NOT NULL,
                    success_count INTEGER DEFAULT 0,
                    failure_count INTEGER DEFAULT 0,
                    avg_duration_ms REAL DEFAULT 0,
                    avg_quality REAL DEFAULT 0,
                    created_at REAL NOT NULL,
                    last_used_at REAL DEFAULT 0,
                    notes TEXT DEFAULT ''
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_chain_task
                ON chain_patterns(task_type, avg_quality)
            """)
            conn.commit()

    def record_chain(
        self,
        task_type: str,
        tool_sequence: list[str],
        success: bool,
        duration_ms: float,
        quality: float = 0.0,
    ):
        """记录一次工具调用链"""
        import hashlib
        seq_str = "→".join(tool_sequence)
        pattern_id = f"chain_{hashlib.sha256(f'{task_type}:{seq_str}'.encode()).hexdigest()[:12]}"

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            existing = conn.execute(
                "SELECT * FROM chain_patterns WHERE pattern_id = ?",
                (pattern_id,),
            ).fetchone()

            if existing:
                old_total = existing["success_count"] + existing["failure_count"]
                new_success = existing["success_count"] + (1 if success else 0)
                new_failure = existing["failure_count"] + (0 if success else 1)
                new_total = old_total + 1
                new_avg_dur = (existing["avg_duration_ms"] * old_total + duration_ms) / new_total
                new_avg_qual = (existing["avg_quality"] * old_total + quality) / new_total

                conn.execute(
                    """UPDATE chain_patterns SET
                       success_count = ?, failure_count = ?,
                       avg_duration_ms = ?, avg_quality = ?,
                       last_used_at = ?
                       WHERE pattern_id = ?""",
                    (new_success, new_failure, new_avg_dur, new_avg_qual,
                     time.time(), pattern_id),
                )
            else:
                conn.execute(
                    """INSERT INTO chain_patterns
                       (pattern_id, task_type, tool_sequence,
                        success_count, failure_count, avg_duration_ms, avg_quality,
                        created_at, last_used_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (pattern_id, task_type, seq_str,
                     1 if success else 0, 0 if success else 1,
                     duration_ms, quality, time.time(), time.time()),
                )
            conn.commit()

    def recommend_chain(
        self,
        task_type: str,
        context: str = "",
        limit: int = 3,
    ) -> list[dict]:
        """推荐工具调用链"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT * FROM chain_patterns
                   WHERE task_type = ? AND success_count + failure_count >= 2
                   ORDER BY avg_quality DESC, success_count DESC
                   LIMIT ?""",
                (task_type, limit),
            ).fetchall()

        recommendations = []
        for row in rows:
            d = dict(row)
            d["success_rate"] = (
                d["success_count"] / (d["success_count"] + d["failure_count"])
                if d["success_count"] + d["failure_count"] else 0
            )
            recommendations.append(d)

        return recommendations

    def get_context_prompt(self, task_type: str) -> str:
        """生成调用链建议上下文"""
        recs = self.recommend_chain(task_type, limit=2)
        if not recs:
            return ""

        lines = ["## 推荐工具调用链（基于历史经验）\n"]
        for i, rec in enumerate(recs, 1):
            lines.append(
                f"{i}. {rec['tool_sequence']} "
                f"(成功率: {rec['success_rate']:.0%}, 质量: {rec['avg_quality']:.0%})"
            )

        return "\n".join(lines)

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM chain_patterns").fetchone()[0]
            by_type = conn.execute(
                """SELECT task_type, COUNT(*), AVG(avg_quality)
                   FROM chain_patterns GROUP BY task_type
                   ORDER BY COUNT(*) DESC LIMIT 5"""
            ).fetchall()

        return {
            "total_patterns": total,
            "by_task_type": {
                t[0]: {"count": t[1], "avg_quality": round(t[2], 3) if t[2] else 0}
                for t in by_type
            },
        }
