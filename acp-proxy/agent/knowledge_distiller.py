"""
Agent知识蒸馏器 — 借鉴AgentDistill/Reflexion经验回放
核心思想：从成功的执行轨迹中提取通用策略，形成可复用的经验库
"""

import logging
import json
import time
import sqlite3
import hashlib
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.knowledge-distiller")


@dataclass
class Experience:
    exp_id: str
    task_type: str  # 任务类型（coding/debugging/research/writing...）
    goal: str  # 原始目标
    strategy: str  # 使用的策略描述
    steps_summary: str  # 步骤摘要
    outcome: str  # "success" / "failure"
    quality_score: float = 0.0  # 0.0 - 1.0
    reusable_pattern: str = ""  # 提取的可复用模式
    tags: list[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    applied_count: int = 0  # 被应用次数
    application_success_rate: float = 0.0


class KnowledgeDistiller:
    """知识蒸馏器"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "distilled-knowledge"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "experiences.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS experiences (
                    exp_id TEXT PRIMARY KEY,
                    task_type TEXT NOT NULL,
                    goal TEXT NOT NULL,
                    strategy TEXT DEFAULT '',
                    steps_summary TEXT DEFAULT '',
                    outcome TEXT DEFAULT '',
                    quality_score REAL DEFAULT 0,
                    reusable_pattern TEXT DEFAULT '',
                    tags TEXT DEFAULT '[]',
                    created_at REAL NOT NULL,
                    applied_count INTEGER DEFAULT 0,
                    application_success_rate REAL DEFAULT 0
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_exp_task_type
                ON experiences(task_type, quality_score)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_exp_outcome
                ON experiences(outcome, quality_score)
            """)
            conn.commit()

    def distill_from_conversation(
        self,
        messages: list[dict],
        outcome: str = "success",
        task_type: str = "general",
    ) -> Optional[Experience]:
        """从对话中蒸馏经验"""
        if not messages:
            return None

        # 提取目标（第一条用户消息）
        goal = ""
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, str):
                    goal = content[:200]
                break

        # 提取策略（工具调用序列）
        tool_calls = []
        for msg in messages:
            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                for tc in msg["tool_calls"]:
                    fn = tc.get("function", {})
                    tool_calls.append(fn.get("name", ""))

        strategy = " → ".join(tool_calls[:5]) if tool_calls else "direct_response"

        # 提取步骤摘要
        assistant_messages = [
            msg.get("content", "")[:100]
            for msg in messages
            if msg.get("role") == "assistant" and msg.get("content")
        ]
        steps_summary = " | ".join(assistant_messages[:5])

        # 计算质量分数
        quality = 0.8 if outcome == "success" else 0.2
        if tool_calls:
            quality += 0.1  # 使用工具表明更复杂的任务
        if len(messages) > 10:
            quality += 0.05  # 长对话通常更复杂
        quality = min(1.0, quality)

        # 提取可复用模式
        pattern = self._extract_pattern(messages, tool_calls, outcome)

        # 标签
        tags = []
        if tool_calls:
            tags.extend(set(tool_calls[:3]))
        if task_type != "general":
            tags.append(task_type)

        exp_id = f"exp_{hashlib.sha256(goal.encode()).hexdigest()[:12]}"

        experience = Experience(
            exp_id=exp_id,
            task_type=task_type,
            goal=goal,
            strategy=strategy,
            steps_summary=steps_summary,
            outcome=outcome,
            quality_score=quality,
            reusable_pattern=pattern,
            tags=tags,
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO experiences
                   (exp_id, task_type, goal, strategy, steps_summary,
                    outcome, quality_score, reusable_pattern, tags, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (exp_id, task_type, goal, strategy, steps_summary,
                 outcome, quality, pattern, json.dumps(tags), time.time()),
            )
            conn.commit()

        logger.info(f"Distilled experience: {task_type} ({outcome}, quality={quality:.0%})")
        return experience

    def _extract_pattern(
        self,
        messages: list[dict],
        tool_calls: list[str],
        outcome: str,
    ) -> str:
        """提取可复用的策略模式"""
        patterns = []

        # 基于工具调用序列的模式
        if "terminal" in tool_calls:
            patterns.append("使用终端执行命令")
        if "browser_exec" in tool_calls:
            patterns.append("使用浏览器自动化")
        if "read_file" in tool_calls and "write_file" in tool_calls:
            patterns.append("读取后修改文件")
        if "web_search" in tool_calls:
            patterns.append("先搜索再回答")
        if "patch" in tool_calls:
            patterns.append("增量编辑文件")

        # 基于对话长度的模式
        if len(messages) > 20:
            patterns.append("复杂多轮任务")

        # 基于结果的模式
        if outcome == "success":
            patterns.append("成功策略")

        return "；".join(patterns) if patterns else "通用对话"

    def retrieve_relevant(
        self,
        query: str,
        task_type: str = "",
        outcome: str = "success",
        limit: int = 5,
    ) -> list[dict]:
        """检索相关经验"""
        sql = """
            SELECT * FROM experiences
            WHERE outcome = ?
        """
        params: list = [outcome]

        if task_type:
            sql += " AND task_type = ?"
            params.append(task_type)

        sql += " ORDER BY quality_score DESC, applied_count DESC LIMIT ?"
        params.append(limit)

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(sql, params).fetchall()

        # 简单关键词匹配
        query_lower = query.lower()
        scored = []
        for row in rows:
            d = dict(row)
            score = d["quality_score"]
            if any(kw in d["goal"].lower() for kw in query_lower.split()):
                score += 0.3
            if task_type and d["task_type"] == task_type:
                score += 0.2
            d["relevance_score"] = score
            scored.append(d)

        scored.sort(key=lambda x: x["relevance_score"], reverse=True)
        return scored[:limit]

    def get_context_prompt(self, query: str, task_type: str = "") -> str:
        """生成经验上下文（注入到system prompt）"""
        experiences = self.retrieve_relevant(query, task_type, limit=3)
        if not experiences:
            return ""

        lines = ["## 历史经验参考\n"]
        for exp in experiences:
            lines.append(f"### {exp['task_type']}任务 (质量: {exp['quality_score']:.0%})")
            lines.append(f"- 目标: {exp['goal'][:80]}")
            lines.append(f"- 策略: {exp['strategy']}")
            if exp['reusable_pattern']:
                lines.append(f"- 模式: {exp['reusable_pattern']}")
            lines.append("")

        return "\n".join(lines)

    def record_application(self, exp_id: str, success: bool):
        """记录经验应用结果"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT applied_count, application_success_rate FROM experiences WHERE exp_id = ?",
                (exp_id,),
            ).fetchone()

            if row:
                old_count = row["applied_count"]
                old_rate = row["application_success_rate"]
                new_count = old_count + 1
                new_rate = (old_rate * old_count + (1.0 if success else 0.0)) / new_count

                conn.execute(
                    """UPDATE experiences SET
                       applied_count = ?, application_success_rate = ?
                       WHERE exp_id = ?""",
                    (new_count, new_rate, exp_id),
                )
                conn.commit()

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM experiences").fetchone()[0]
            by_outcome = conn.execute(
                "SELECT outcome, COUNT(*) FROM experiences GROUP BY outcome"
            ).fetchall()
            by_type = conn.execute(
                "SELECT task_type, COUNT(*) FROM experiences GROUP BY task_type ORDER BY COUNT(*) DESC LIMIT 5"
            ).fetchall()
            avg_quality = conn.execute(
                "SELECT AVG(quality_score) FROM experiences WHERE outcome = 'success'"
            ).fetchone()[0]

        return {
            "total_experiences": total,
            "by_outcome": {o[0]: o[1] for o in by_outcome},
            "top_task_types": {t[0]: t[1] for t in by_type},
            "avg_quality": round(avg_quality, 3) if avg_quality else 0,
        }
