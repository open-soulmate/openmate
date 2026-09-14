"""
Agent能力评估器 — 借鉴AgentBench/HELM/AlpacaEval
核心思想：多维度评估Agent能力（准确性/效率/安全性/用户满意度），持续追踪改进
"""

import logging
import json
import time
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime, timedelta

logger = logging.getLogger("acp-proxy.capability-evaluator")


@dataclass
class EvaluationDimension:
    dimension_id: str
    name: str
    description: str
    weight: float = 1.0  # 权重
    score: float = 0.0  # 0.0 - 1.0
    sample_count: int = 0


@dataclass
class EvaluationResult:
    eval_id: str
    session_id: str
    task_type: str
    dimensions: dict[str, float]  # dimension_id -> score
    overall_score: float = 0.0
    timestamp: float = field(default_factory=time.time)
    notes: str = ""


DEFAULT_DIMENSIONS = [
    EvaluationDimension(
        dimension_id="accuracy",
        name="准确性",
        description="回答/执行结果是否正确",
        weight=0.3,
    ),
    EvaluationDimension(
        dimension_id="efficiency",
        name="效率",
        description="完成任务的速度和token消耗",
        weight=0.2,
    ),
    EvaluationDimension(
        dimension_id="completeness",
        name="完整性",
        description="是否完整解决了用户问题",
        weight=0.2,
    ),
    EvaluationDimension(
        dimension_id="safety",
        name="安全性",
        description="是否遵守安全规则，无危险操作",
        weight=0.15,
    ),
    EvaluationDimension(
        dimension_id="helpfulness",
        name="帮助性",
        description="对用户的实际帮助程度",
        weight=0.15,
    ),
]


class CapabilityEvaluator:
    """Agent能力评估器"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "evaluator"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "evaluations.db")
        self.db_path = db_path
        self.dimensions = {d.dimension_id: d for d in DEFAULT_DIMENSIONS}
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS evaluations (
                    eval_id TEXT PRIMARY KEY,
                    session_id TEXT DEFAULT '',
                    task_type TEXT DEFAULT 'general',
                    dimensions TEXT DEFAULT '{}',
                    overall_score REAL DEFAULT 0,
                    timestamp REAL NOT NULL,
                    notes TEXT DEFAULT ''
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_eval_time
                ON evaluations(timestamp)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_eval_task
                ON evaluations(task_type, timestamp)
            """)
            conn.commit()

    def record_evaluation(
        self,
        session_id: str,
        task_type: str,
        dimension_scores: dict[str, float],
        notes: str = "",
    ) -> EvaluationResult:
        """记录一次评估"""
        # 计算加权总分
        total_weight = sum(
            self.dimensions[d].weight
            for d in dimension_scores
            if d in self.dimensions
        )
        weighted_sum = sum(
            dimension_scores.get(d, 0) * self.dimensions[d].weight
            for d in dimension_scores
            if d in self.dimensions
        )
        overall = weighted_sum / total_weight if total_weight else 0

        eval_id = f"eval_{int(time.time() * 1000)}"
        result = EvaluationResult(
            eval_id=eval_id,
            session_id=session_id,
            task_type=task_type,
            dimensions=dimension_scores,
            overall_score=overall,
            notes=notes,
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO evaluations
                   (eval_id, session_id, task_type, dimensions, overall_score, timestamp, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (eval_id, session_id, task_type,
                 json.dumps(dimension_scores), overall, time.time(), notes),
            )
            conn.commit()

        logger.info(f"Recorded evaluation: {task_type} overall={overall:.2f}")
        return result

    def get_trend(
        self,
        days: int = 7,
        task_type: str = "",
    ) -> dict:
        """获取能力趋势"""
        cutoff = time.time() - days * 86400

        sql = "SELECT * FROM evaluations WHERE timestamp > ?"
        params: list = [cutoff]

        if task_type:
            sql += " AND task_type = ?"
            params.append(task_type)

        sql += " ORDER BY timestamp"

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(sql, params).fetchall()

        if not rows:
            return {"message": "No evaluations in this period"}

        # 按天分组
        by_day: dict[str, list[float]] = {}
        dimension_by_day: dict[str, dict[str, list[float]]] = {}

        for row in rows:
            day = datetime.fromtimestamp(row["timestamp"]).strftime("%m-%d")
            by_day.setdefault(day, []).append(row["overall_score"])

            dims = json.loads(row["dimensions"] or "{}")
            for d, score in dims.items():
                dimension_by_day.setdefault(day, {}).setdefault(d, []).append(score)

        # 计算趋势
        daily_avg = {
            day: round(sum(scores) / len(scores), 3)
            for day, scores in by_day.items()
        }

        dimension_avg: dict[str, dict[str, float]] = {}
        for day, dims in dimension_by_day.items():
            dimension_avg[day] = {
                d: round(sum(s) / len(s), 3)
                for d, s in dims.items()
            }

        # 计算变化趋势
        values = list(daily_avg.values())
        trend = "stable"
        if len(values) >= 2:
            recent = sum(values[-3:]) / min(3, len(values))
            earlier = sum(values[:3]) / min(3, len(values))
            if recent > earlier + 0.05:
                trend = "improving"
            elif recent < earlier - 0.05:
                trend = "declining"

        return {
            "daily_avg": daily_avg,
            "dimension_avg": dimension_avg,
            "overall_trend": trend,
            "total_evaluations": len(rows),
            "latest_score": values[-1] if values else 0,
        }

    def get_weak_dimensions(self, task_type: str = "", min_samples: int = 5) -> list[dict]:
        """识别薄弱维度"""
        sql = "SELECT dimensions FROM evaluations"
        params: list = []

        if task_type:
            sql += " WHERE task_type = ?"
            params.append(task_type)

        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(sql, params).fetchall()

        # 汇总各维度得分
        dim_scores: dict[str, list[float]] = {}
        for row in rows:
            dims = json.loads(row[0] or "{}")
            for d, score in dims.items():
                dim_scores.setdefault(d, []).append(score)

        # 找出得分最低的维度
        weak = []
        for d, scores in dim_scores.items():
            if len(scores) >= min_samples:
                avg = sum(scores) / len(scores)
                if avg < 0.7:  # 低于70%认为是弱项
                    weak.append({
                        "dimension": d,
                        "name": self.dimensions.get(d, EvaluationDimension(d, d, "")).name,
                        "avg_score": round(avg, 3),
                        "sample_count": len(scores),
                    })

        weak.sort(key=lambda x: x["avg_score"])
        return weak

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM evaluations").fetchone()[0]
            avg = conn.execute("SELECT AVG(overall_score) FROM evaluations").fetchone()[0]
            recent = conn.execute(
                """SELECT AVG(overall_score) FROM evaluations
                   WHERE timestamp > ?""",
                (time.time() - 7 * 86400,),
            ).fetchone()[0]

        return {
            "total_evaluations": total,
            "avg_score": round(avg, 3) if avg else 0,
            "recent_avg_score": round(recent, 3) if recent else 0,
            "dimensions": list(self.dimensions.keys()),
        }
