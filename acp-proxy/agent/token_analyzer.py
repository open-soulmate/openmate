"""
Agent token使用分析器 — 借鉴LiteLLM token tracking + OpenAI usage API
核心思想：按功能/会话/模型维度分析token使用，识别优化机会
"""

import logging
import json
import time
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime, timedelta

logger = logging.getLogger("acp-proxy.token-analyzer")


@dataclass
class TokenUsage:
    usage_id: str
    session_id: str
    model: str
    category: str  # "chat", "tool_call", "system", "summary"
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    timestamp: float = field(default_factory=time.time)
    metadata: dict = field(default_factory=dict)

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class TokenAnalyzer:
    """token使用分析器"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "token-analyzer"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "usage.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS token_usage (
                    usage_id TEXT PRIMARY KEY,
                    session_id TEXT DEFAULT '',
                    model TEXT DEFAULT '',
                    category TEXT DEFAULT 'chat',
                    input_tokens INTEGER DEFAULT 0,
                    output_tokens INTEGER DEFAULT 0,
                    cached_tokens INTEGER DEFAULT 0,
                    timestamp REAL NOT NULL,
                    metadata TEXT DEFAULT '{}'
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_usage_time
                ON token_usage(timestamp)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_usage_session
                ON token_usage(session_id, timestamp)
            """)
            conn.commit()

    def record(
        self,
        session_id: str,
        model: str,
        category: str,
        input_tokens: int,
        output_tokens: int,
        cached_tokens: int = 0,
        metadata: Optional[dict] = None,
    ):
        """记录token使用"""
        usage_id = f"usage_{int(time.time() * 1000)}"
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO token_usage
                   (usage_id, session_id, model, category,
                    input_tokens, output_tokens, cached_tokens, timestamp, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (usage_id, session_id, model, category,
                 input_tokens, output_tokens, cached_tokens, time.time(),
                 json.dumps(metadata or {})),
            )
            conn.commit()

    def get_breakdown(
        self,
        days: int = 7,
        group_by: str = "category",
    ) -> dict:
        """获取token使用分解"""
        cutoff = time.time() - days * 86400

        valid_groups = {"category", "model", "session_id", "date"}
        if group_by not in valid_groups:
            group_by = "category"

        if group_by == "date":
            sql = """SELECT
                       DATE(timestamp, 'unixepoch', 'localtime') as grp,
                       SUM(input_tokens), SUM(output_tokens), SUM(cached_tokens), COUNT(*)
                     FROM token_usage
                     WHERE timestamp > ?
                     GROUP BY grp ORDER BY grp"""
        else:
            sql = f"""SELECT
                        {group_by} as grp,
                        SUM(input_tokens), SUM(output_tokens), SUM(cached_tokens), COUNT(*)
                      FROM token_usage
                      WHERE timestamp > ?
                      GROUP BY {group_by} ORDER BY SUM(input_tokens + output_tokens) DESC"""

        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(sql, (cutoff,)).fetchall()

        breakdown = {}
        total_input = 0
        total_output = 0
        total_cached = 0

        for row in rows:
            grp, inp, out, cached, count = row
            breakdown[grp] = {
                "input_tokens": inp,
                "output_tokens": out,
                "cached_tokens": cached,
                "total_tokens": inp + out,
                "call_count": count,
                "avg_tokens_per_call": round((inp + out) / count) if count else 0,
            }
            total_input += inp
            total_output += out
            total_cached += cached

        return {
            "period_days": days,
            "group_by": group_by,
            "breakdown": breakdown,
            "totals": {
                "input_tokens": total_input,
                "output_tokens": total_output,
                "cached_tokens": total_cached,
                "total_tokens": total_input + total_output,
                "cache_hit_rate": round(total_cached / total_input * 100, 1) if total_input else 0,
            },
        }

    def get_session_usage(self, session_id: str) -> dict:
        """获取会话级token使用"""
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                """SELECT
                     SUM(input_tokens), SUM(output_tokens), SUM(cached_tokens),
                     COUNT(*), MIN(timestamp), MAX(timestamp)
                   FROM token_usage WHERE session_id = ?""",
                (session_id,),
            ).fetchone()

            by_category = conn.execute(
                """SELECT category, SUM(input_tokens + output_tokens)
                   FROM token_usage WHERE session_id = ?
                   GROUP BY category""",
                (session_id,),
            ).fetchall()

        if not row or not row[0]:
            return {"message": "No usage found"}

        inp, out, cached, count, first, last = row
        duration = last - first if last and first else 0

        return {
            "session_id": session_id,
            "input_tokens": inp,
            "output_tokens": out,
            "cached_tokens": cached,
            "total_tokens": inp + out,
            "call_count": count,
            "duration_seconds": round(duration, 1),
            "tokens_per_minute": round((inp + out) / (duration / 60)) if duration > 0 else 0,
            "by_category": {c[0]: c[1] for c in by_category},
        }

    def get_optimization_suggestions(self, days: int = 7) -> list[str]:
        """生成优化建议"""
        suggestions = []
        breakdown = self.get_breakdown(days=days, group_by="category")

        cat_data = breakdown["breakdown"]
        totals = breakdown["totals"]

        # 1. 缓存命中率低
        if totals["cache_hit_rate"] < 20 and totals["input_tokens"] > 10000:
            suggestions.append(
                f"💡 缓存命中率仅{totals['cache_hit_rate']}%，建议启用语义缓存"
            )

        # 2. system prompt过长
        system_data = cat_data.get("system", {})
        if system_data.get("total_tokens", 0) > totals["total_tokens"] * 0.3:
            suggestions.append(
                f"💡 system prompt占用{system_data['total_tokens']} tokens "
                f"({system_data['total_tokens']/totals['total_tokens']*100:.0f}%)，"
                "建议精简工具描述"
            )

        # 3. 消息历史过长
        chat_data = cat_data.get("chat", {})
        if chat_data.get("avg_tokens_per_call", 0) > 5000:
            suggestions.append(
                f"💡 平均每次对话{chat_data['avg_tokens_per_call']} tokens，"
                "建议启用对话摘要压缩"
            )

        # 4. 总量过大
        if totals["total_tokens"] > 1_000_000:
            suggestions.append(
                f"⚠️ {days}天内总消耗{totals['total_tokens']:,} tokens，"
                "建议检查是否有不必要的重复调用"
            )

        return suggestions

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM token_usage").fetchone()[0]
            all_time = conn.execute(
                "SELECT SUM(input_tokens + output_tokens) FROM token_usage"
            ).fetchone()[0]
            today = conn.execute(
                """SELECT SUM(input_tokens + output_tokens) FROM token_usage
                   WHERE timestamp > ?""",
                (time.time() - 86400,),
            ).fetchone()[0]

        return {
            "total_records": total,
            "all_time_tokens": all_time or 0,
            "today_tokens": today or 0,
        }
