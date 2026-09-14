"""
智能提示词模板管理器 — 借鉴DSPy/Dify的prompt模板系统
核心思想：提示词版本化、A/B测试、自动优化、效果追踪
"""

import logging
import json
import time
import sqlite3
import hashlib
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.prompt-manager")


@dataclass
class PromptTemplate:
    template_id: str
    name: str
    version: int
    content: str
    variables: list[str] = field(default_factory=list)
    description: str = ""
    created_at: float = field(default_factory=time.time)
    is_active: bool = True
    performance_score: float = 0.0
    usage_count: int = 0
    success_count: int = 0

    @property
    def success_rate(self) -> float:
        return self.success_count / max(self.usage_count, 1)

    def render(self, **kwargs) -> str:
        """渲染模板 — 替换{{variable}}占位符"""
        result = self.content
        for var in self.variables:
            value = kwargs.get(var, "")
            result = result.replace(f"{{{{{var}}}}}", str(value))
        return result


class PromptTemplateManager:
    """提示词模板管理器"""

    def __init__(self, db_path: str = ""):
        if not db_path:
            base = Path.home() / ".hermes" / "soulmate" / "prompts"
            base.mkdir(parents=True, exist_ok=True)
            db_path = str(base / "templates.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS prompt_templates (
                    template_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    variables TEXT DEFAULT '[]',
                    description TEXT DEFAULT '',
                    created_at REAL NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    performance_score REAL DEFAULT 0,
                    usage_count INTEGER DEFAULT 0,
                    success_count INTEGER DEFAULT 0,
                    PRIMARY KEY (template_id, version)
                )
            """)
            conn.commit()

    def create_template(
        self,
        name: str,
        content: str,
        variables: Optional[list[str]] = None,
        description: str = "",
    ) -> PromptTemplate:
        """创建新模板（或新版本）"""
        template_id = hashlib.sha256(name.encode()).hexdigest()[:12]

        # 获取当前最大版本号
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT MAX(version) FROM prompt_templates WHERE template_id = ?",
                (template_id,),
            ).fetchone()
            next_version = (row[0] or 0) + 1

        # 自动检测变量
        if variables is None:
            import re
            variables = list(set(re.findall(r"\{\{(\w+)\}\}", content)))

        template = PromptTemplate(
            template_id=template_id,
            name=name,
            version=next_version,
            content=content,
            variables=variables,
            description=description,
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO prompt_templates
                   (template_id, name, version, content, variables,
                    description, created_at, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 1)""",
                (template.template_id, template.name, template.version,
                 template.content, json.dumps(template.variables),
                 template.description, template.created_at),
            )
            conn.commit()

        logger.info(f"Created prompt template: {name} v{next_version}")
        return template

    def get_active(self, name: str) -> Optional[PromptTemplate]:
        """获取活跃版本的模板"""
        template_id = hashlib.sha256(name.encode()).hexdigest()[:12]
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """SELECT * FROM prompt_templates
                   WHERE template_id = ? AND is_active = 1
                   ORDER BY version DESC LIMIT 1""",
                (template_id,),
            ).fetchone()
        return self._row_to_template(row) if row else None

    def get_version(self, name: str, version: int) -> Optional[PromptTemplate]:
        """获取指定版本"""
        template_id = hashlib.sha256(name.encode()).hexdigest()[:12]
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM prompt_templates WHERE template_id = ? AND version = ?",
                (template_id, version),
            ).fetchone()
        return self._row_to_template(row) if row else None

    def list_versions(self, name: str) -> list[dict]:
        """列出所有版本"""
        template_id = hashlib.sha256(name.encode()).hexdigest()[:12]
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT version, description, performance_score,
                          usage_count, success_count, created_at, is_active
                   FROM prompt_templates WHERE template_id = ?
                   ORDER BY version DESC""",
                (template_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def record_usage(self, name: str, version: int, success: bool):
        """记录使用情况"""
        template_id = hashlib.sha256(name.encode()).hexdigest()[:12]
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """UPDATE prompt_templates
                   SET usage_count = usage_count + 1,
                       success_count = success_count + ?
                   WHERE template_id = ? AND version = ?""",
                (1 if success else 0, template_id, version),
            )
            conn.commit()

    def rollback(self, name: str, to_version: int):
        """回滚到指定版本"""
        template_id = hashlib.sha256(name.encode()).hexdigest()[:12]
        with sqlite3.connect(self.db_path) as conn:
            # 停用当前版本
            conn.execute(
                "UPDATE prompt_templates SET is_active = 0 WHERE template_id = ?",
                (template_id,),
            )
            # 激活目标版本
            conn.execute(
                "UPDATE prompt_templates SET is_active = 1 WHERE template_id = ? AND version = ?",
                (template_id, to_version),
            )
            conn.commit()
        logger.info(f"Rolled back {name} to v{to_version}")

    def get_best_performing(self, name: str) -> Optional[PromptTemplate]:
        """获取表现最好的版本"""
        template_id = hashlib.sha256(name.encode()).hexdigest()[:12]
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """SELECT * FROM prompt_templates
                   WHERE template_id = ? AND usage_count >= 5
                   ORDER BY (success_count * 1.0 / usage_count) DESC
                   LIMIT 1""",
                (template_id,),
            ).fetchone()
        return self._row_to_template(row) if row else None

    def _row_to_template(self, row) -> PromptTemplate:
        return PromptTemplate(
            template_id=row["template_id"],
            name=row["name"],
            version=row["version"],
            content=row["content"],
            variables=json.loads(row["variables"]),
            description=row["description"],
            created_at=row["created_at"],
            is_active=bool(row["is_active"]),
            performance_score=row["performance_score"],
            usage_count=row["usage_count"],
            success_count=row["success_count"],
        )

    def get_stats(self) -> dict:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM prompt_templates").fetchone()[0]
            names = conn.execute(
                "SELECT COUNT(DISTINCT template_id) FROM prompt_templates"
            ).fetchone()[0]
        return {
            "total_templates": total,
            "unique_names": names,
            "db_path": self.db_path,
        }
