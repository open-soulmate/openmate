"""
Agent技能学习器 — 借鉴Voyager skill library + CodeAct
核心思想：从成功执行中自动提取可复用技能，形成技能库供未来使用
"""

import logging
import json
import time
import sqlite3
import hashlib
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.skill-learner")


@dataclass
class Skill:
    skill_id: str
    name: str
    description: str
    category: str = "general"
    code_template: str = ""  # 可复用的代码/命令模板
    parameters: list[str] = field(default_factory=list)  # 需要填充的参数
    usage_count: int = 0
    success_count: int = 0
    avg_duration_ms: float = 0.0
    created_at: float = field(default_factory=time.time)
    last_used_at: float = 0.0
    tags: list[str] = field(default_factory=list)
    source_session: str = ""

    @property
    def success_rate(self) -> float:
        return self.success_count / self.usage_count if self.usage_count else 0.0


class SkillLearner:
    """技能学习器"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "skills-learned"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "skills.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS skills (
                    skill_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    category TEXT DEFAULT 'general',
                    code_template TEXT DEFAULT '',
                    parameters TEXT DEFAULT '[]',
                    usage_count INTEGER DEFAULT 0,
                    success_count INTEGER DEFAULT 0,
                    avg_duration_ms REAL DEFAULT 0,
                    created_at REAL NOT NULL,
                    last_used_at REAL DEFAULT 0,
                    tags TEXT DEFAULT '[]',
                    source_session TEXT DEFAULT ''
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_skills_category
                ON skills(category, success_count)
            """)
            conn.commit()

    def extract_skill_from_execution(
        self,
        session_id: str,
        task_description: str,
        tool_calls: list[dict],
        success: bool,
    ) -> Optional[Skill]:
        """从执行中提取技能"""
        if not success or not tool_calls:
            return None

        # 分析工具调用模式
        tools_used = [tc.get("function", {}).get("name", "") for tc in tool_calls]
        tool_sequence = " → ".join(t for t in tools_used if t)

        # 判断是否值得提取为技能
        # 条件1：使用了2个以上工具
        # 条件2：有明确的文件操作模式
        meaningful_patterns = [
            ("read_file", "write_file"),  # 读取后写入
            ("terminal", "read_file"),  # 命令后检查
            ("web_search", "read_file"),  # 搜索后阅读
            ("browser_exec", "terminal"),  # 浏览器+命令
        ]

        is_pattern = any(
            all(t in tools_used for t in pattern)
            for pattern in meaningful_patterns
        )

        if len(tools_used) < 2 and not is_pattern:
            return None

        # 生成技能
        import hashlib
        skill_id = f"skill_{hashlib.sha256(f'{task_description}:{tool_sequence}'.encode()).hexdigest()[:12]}"

        # 提取参数（从工具调用的arguments中找变量部分）
        parameters = self._extract_parameters(tool_calls)

        # 生成代码模板
        code_template = self._generate_template(tool_calls)

        skill = Skill(
            skill_id=skill_id,
            name=task_description[:50],
            description=f"从执行中学习的技能: {tool_sequence}",
            category=self._categorize(task_description, tools_used),
            code_template=code_template,
            parameters=parameters,
            tags=list(set(t for t in tools_used if t)),
            source_session=session_id,
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO skills
                   (skill_id, name, description, category, code_template,
                    parameters, usage_count, success_count, avg_duration_ms,
                    created_at, last_used_at, tags, source_session)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (skill.skill_id, skill.name, skill.description, skill.category,
                 skill.code_template, json.dumps(skill.parameters),
                 1, 1, 0, time.time(), time.time(),
                 json.dumps(skill.tags), session_id),
            )
            conn.commit()

        logger.info(f"Extracted skill: {skill.name} ({skill.category})")
        return skill

    def _extract_parameters(self, tool_calls: list[dict]) -> list[str]:
        """提取可参数化的部分"""
        params = set()
        for tc in tool_calls:
            args = tc.get("function", {}).get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    continue

            # 文件路径参数
            if "path" in args:
                params.add("file_path")
            if "command" in args:
                params.add("command")
            if "url" in args:
                params.add("url")
            if "query" in args:
                params.add("query")
            if "content" in args:
                params.add("content")

        return list(params)

    def _generate_template(self, tool_calls: list[dict]) -> str:
        """生成代码模板"""
        lines = []
        for tc in tool_calls[:5]:
            fn = tc.get("function", {})
            name = fn.get("name", "")
            args = fn.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}

            # 参数化：将具体值替换为占位符
            param_args = {}
            for k, v in args.items():
                if isinstance(v, str) and len(v) > 10:
                    param_args[k] = f"{{{{{k}}}}}"
                else:
                    param_args[k] = v

            lines.append(f"{name}({json.dumps(param_args, ensure_ascii=False)})")

        return "\n".join(lines)

    def _categorize(self, description: str, tools: list[str]) -> str:
        """自动分类"""
        desc_lower = description.lower()
        if any(t in desc_lower for t in ["file", "write", "read", "edit", "文件"]):
            return "file_operations"
        if any(t in desc_lower for t in ["web", "search", "browser", "网页", "搜索"]):
            return "web_operations"
        if any(t in desc_lower for t in ["terminal", "command", "shell", "命令"]):
            return "system_operations"
        if any(t in desc_lower for t in ["code", "debug", "test", "代码", "测试"]):
            return "coding"
        return "general"

    def find_relevant_skills(
        self,
        task_description: str,
        limit: int = 3,
    ) -> list[dict]:
        """查找相关技能"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT * FROM skills
                   WHERE usage_count > 0
                   ORDER BY success_count DESC, usage_count DESC
                   LIMIT ?""",
                (limit * 3,),
            ).fetchall()

        # 关键词匹配
        task_lower = task_description.lower()
        scored = []
        for row in rows:
            d = dict(row)
            score = d["success_count"] * 0.3 + d["usage_count"] * 0.1

            # 名称/描述匹配
            if any(kw in d["name"].lower() for kw in task_lower.split()):
                score += 0.5
            if any(kw in d["description"].lower() for kw in task_lower.split()):
                score += 0.3

            # 标签匹配
            if any(tag in task_lower for tag in d.get("tags", [])):
                score += 0.2

            d["relevance_score"] = score
            scored.append(d)

        scored.sort(key=lambda x: x["relevance_score"], reverse=True)
        return scored[:limit]

    def get_context_prompt(self, task_description: str) -> str:
        """生成技能上下文"""
        skills = self.find_relevant_skills(task_description, limit=2)
        if not skills:
            return ""

        lines = ["## 可复用技能（从历史执行中学习）\n"]
        for skill in skills:
            lines.append(f"### {skill['name']}")
            lines.append(f"描述: {skill['description']}")
            if skill['code_template']:
                lines.append(f"模板:\n```\n{skill['code_template']}\n```")
            lines.append(f"成功率: {skill['success_count']}/{skill['usage_count']}")
            lines.append("")

        return "\n".join(lines)

    def record_usage(self, skill_id: str, success: bool):
        """记录技能使用"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """UPDATE skills SET
                   usage_count = usage_count + 1,
                   success_count = success_count + ?,
                   last_used_at = ?
                   WHERE skill_id = ?""",
                (1 if success else 0, time.time(), skill_id),
            )
            conn.commit()

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM skills").fetchone()[0]
            by_category = conn.execute(
                "SELECT category, COUNT(*) FROM skills GROUP BY category"
            ).fetchall()
            top_skills = conn.execute(
                """SELECT name, usage_count, success_count
                   FROM skills ORDER BY usage_count DESC LIMIT 5"""
            ).fetchall()

        return {
            "total_skills": total,
            "by_category": {c[0]: c[1] for c in by_category},
            "top_skills": [
                {"name": s[0], "uses": s[1], "successes": s[2]}
                for s in top_skills
            ],
        }
