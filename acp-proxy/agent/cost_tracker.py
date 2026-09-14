"""
成本追踪与预算控制 — 借鉴OpenRouter/LiteLLM的成本管理
核心思想：追踪每次LLM调用的token成本，支持预算限制、成本告警、优化建议
"""

import logging
import json
import time
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime, timedelta

logger = logging.getLogger("acp-proxy.cost-tracker")


# 常见模型定价（USD per 1M tokens）
MODEL_PRICING = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "claude-3-5-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
    "deepseek-chat": {"input": 0.14, "output": 0.28},
    "deepseek-reasoner": {"input": 0.55, "output": 2.19},
    "mimo-x-pro": {"input": 0.00, "output": 0.00},  # 本地模型
    "local": {"input": 0.00, "output": 0.00},
}


@dataclass
class CostRecord:
    record_id: str
    timestamp: float
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    session_id: str = ""
    request_type: str = "chat"
    metadata: dict = field(default_factory=dict)


@dataclass
class BudgetConfig:
    daily_limit_usd: float = 10.0
    monthly_limit_usd: float = 100.0
    per_session_limit_usd: float = 5.0
    alert_threshold_percent: float = 80.0
    auto_disable_at_limit: bool = True


class CostTracker:
    """成本追踪器"""

    def __init__(self, db_path: str = "", budget: Optional[BudgetConfig] = None):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "costs"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "costs.db")
        self.db_path = db_path
        self.budget = budget or BudgetConfig()
        self._stats = {"total_records": 0, "total_cost_usd": 0.0}
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cost_records (
                    record_id TEXT PRIMARY KEY,
                    timestamp REAL NOT NULL,
                    model TEXT NOT NULL,
                    input_tokens INTEGER NOT NULL,
                    output_tokens INTEGER NOT NULL,
                    cost_usd REAL NOT NULL,
                    session_id TEXT DEFAULT '',
                    request_type TEXT DEFAULT 'chat',
                    metadata TEXT DEFAULT '{}',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_cost_time
                ON cost_records(timestamp)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_cost_session
                ON cost_records(session_id)
            """)
            conn.commit()

    def record_usage(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        session_id: str = "",
        request_type: str = "chat",
        custom_cost: Optional[float] = None,
    ) -> CostRecord:
        """记录一次LLM使用"""
        # 计算成本
        if custom_cost is not None:
            cost = custom_cost
        else:
            pricing = MODEL_PRICING.get(model, MODEL_PRICING["local"])
            cost = (
                input_tokens * pricing["input"] / 1_000_000 +
                output_tokens * pricing["output"] / 1_000_000
            )

        record = CostRecord(
            record_id=f"cost_{int(time.time() * 1000)}_{hash(model) % 10000}",
            timestamp=time.time(),
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            session_id=session_id,
            request_type=request_type,
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO cost_records
                   (record_id, timestamp, model, input_tokens, output_tokens,
                    cost_usd, session_id, request_type, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (record.record_id, record.timestamp, record.model,
                 record.input_tokens, record.output_tokens, record.cost_usd,
                 record.session_id, record.request_type, json.dumps({})),
            )
            conn.commit()

        self._stats["total_records"] += 1
        self._stats["total_cost_usd"] += cost

        # 检查预算
        self._check_budget()

        return record

    def _check_budget(self):
        """检查预算限制"""
        today = datetime.now().strftime("%Y-%m-%d")
        month = datetime.now().strftime("%Y-%m")

        daily_cost = self.get_daily_cost()
        monthly_cost = self.get_monthly_cost()

        # 日预算检查
        if daily_cost > self.budget.daily_limit_usd:
            logger.warning(
                f"⚠️ Daily budget exceeded: ${daily_cost:.4f} > ${self.budget.daily_limit_usd}"
            )
            if self.budget.auto_disable_at_limit:
                logger.error("🚫 Auto-disabling LLM calls due to daily budget limit")

        # 月预算检查
        if monthly_cost > self.budget.monthly_limit_usd:
            logger.warning(
                f"⚠️ Monthly budget exceeded: ${monthly_cost:.4f} > ${self.budget.monthly_limit_usd}"
            )

        # 告警阈值
        daily_percent = daily_cost / max(self.budget.daily_limit_usd, 0.001) * 100
        if daily_percent > self.budget.alert_threshold_percent:
            logger.warning(
                f"⚠️ Daily budget at {daily_percent:.1f}% "
                f"(${daily_cost:.4f} / ${self.budget.daily_limit_usd})"
            )

    def get_daily_cost(self, date: Optional[str] = None) -> float:
        """获取指定日期的成本"""
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
        start = datetime.strptime(date, "%Y-%m-%d").timestamp()
        end = start + 86400

        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(cost_usd), 0) FROM cost_records WHERE timestamp BETWEEN ? AND ?",
                (start, end),
            ).fetchone()
        return row[0]

    def get_monthly_cost(self, month: Optional[str] = None) -> float:
        """获取指定月份的成本"""
        if not month:
            month = datetime.now().strftime("%Y-%m")
        start = datetime.strptime(month + "-01", "%Y-%m-%d").timestamp()
        end = start + 30 * 86400

        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(cost_usd), 0) FROM cost_records WHERE timestamp BETWEEN ? AND ?",
                (start, end),
            ).fetchone()
        return row[0]

    def get_session_cost(self, session_id: str) -> float:
        """获取会话的成本"""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(cost_usd), 0) FROM cost_records WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        return row[0]

    def get_model_breakdown(self, days: int = 7) -> dict:
        """获取按模型的成本分解"""
        start = time.time() - days * 86400
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT model,
                          COUNT(*) as calls,
                          SUM(input_tokens) as total_input,
                          SUM(output_tokens) as total_output,
                          SUM(cost_usd) as total_cost
                   FROM cost_records WHERE timestamp > ?
                   GROUP BY model ORDER BY total_cost DESC""",
                (start,),
            ).fetchall()
        return {r["model"]: dict(r) for r in rows}

    def get_optimization_suggestions(self) -> list[str]:
        """获取成本优化建议"""
        suggestions = []
        breakdown = self.get_model_breakdown(days=7)

        for model, data in breakdown.items():
            if data["total_cost"] > 1.0:  # 超过$1
                # 检查是否有更便宜的替代
                if "gpt-4o" in model and "mini" not in model:
                    suggestions.append(
                        f"Consider using gpt-4o-mini instead of {model} "
                        f"for non-critical tasks (saves ~94%)"
                    )
                if data["total_output"] > data["total_input"] * 2:
                    suggestions.append(
                        f"{model}: Output tokens >> Input tokens. "
                        f"Consider reducing max_tokens or using streaming"
                    )

        daily = self.get_daily_cost()
        if daily > 0:
            suggestions.append(
                f"Daily cost: ${daily:.4f}. "
                f"Budget: ${self.budget.daily_limit_usd}"
            )

        return suggestions

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM cost_records").fetchone()[0]
            total_cost = conn.execute("SELECT COALESCE(SUM(cost_usd), 0) FROM cost_records").fetchone()[0]

        return {
            "total_records": total,
            "total_cost_usd": f"${total_cost:.4f}",
            "daily_cost": f"${self.get_daily_cost():.4f}",
            "monthly_cost": f"${self.get_monthly_cost():.4f}",
            "budget": {
                "daily_limit": f"${self.budget.daily_limit_usd}",
                "monthly_limit": f"${self.budget.monthly_limit_usd}",
                "daily_used_percent": f"{self.get_daily_cost() / max(self.budget.daily_limit_usd, 0.001) * 100:.1f}%",
            },
            "model_breakdown": self.get_model_breakdown(days=1),
        }
