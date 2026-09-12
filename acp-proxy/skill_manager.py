"""SoulMate 技能管理器 — 存储、CRUD、搜索、自动学习

技能以 JSON 文件形式存储在 skills/ 目录下。
支持按 triggers 和 description 模糊搜索，自动记录使用次数。
"""

import json
import os
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("acp-proxy.skill_manager")

SKILLS_DIR = os.path.join(os.path.dirname(__file__), "skills")


class SkillManager:
    """文件系统级技能管理器"""

    def __init__(self, skills_dir: str = SKILLS_DIR):
        self.skills_dir = skills_dir
        os.makedirs(self.skills_dir, exist_ok=True)

    # ── CRUD ──────────────────────────────────────────────────

    def list_skills(self) -> list[dict]:
        """列出所有技能，按 use_count 降序"""
        skills = []
        for f in os.listdir(self.skills_dir):
            if f.endswith(".json"):
                try:
                    with open(os.path.join(self.skills_dir, f), encoding="utf-8") as fp:
                        skills.append(json.load(fp))
                except Exception as e:
                    logger.warning("Failed to load skill %s: %s", f, e)
        skills.sort(key=lambda s: s.get("use_count", 0), reverse=True)
        return skills

    def create_skill(
        self,
        name: str,
        description: str,
        triggers: list[str],
        content: str,
        code_template: str = "",
        tags: list[str] | None = None,
    ) -> dict:
        """创建新技能并持久化到 JSON 文件"""
        now = datetime.now(timezone.utc).isoformat()
        skill = {
            "id": str(uuid.uuid4()),
            "name": name,
            "description": description,
            "triggers": triggers,
            "content": content,
            "code_template": code_template,
            "tags": tags or [],
            "created_at": now,
            "last_used": None,
            "use_count": 0,
        }
        self._save(skill)
        logger.info("Created skill: %s (%s)", name, skill["id"])
        return skill

    def get_skill(self, skill_id: str) -> Optional[dict]:
        """按 ID 获取技能"""
        filepath = os.path.join(self.skills_dir, f"{skill_id}.json")
        if os.path.exists(filepath):
            with open(filepath, encoding="utf-8") as fp:
                return json.load(fp)
        return None

    def update_skill(self, skill_id: str, **kwargs) -> Optional[dict]:
        """更新技能字段（传入的 kwargs 会覆盖原值）"""
        skill = self.get_skill(skill_id)
        if not skill:
            return None
        # 只允许更新已知字段
        allowed = {"name", "description", "triggers", "content", "code_template", "tags", "last_used", "use_count"}
        for k, v in kwargs.items():
            if k in allowed:
                skill[k] = v
        self._save(skill)
        return skill

    def delete_skill(self, skill_id: str) -> bool:
        """删除技能"""
        filepath = os.path.join(self.skills_dir, f"{skill_id}.json")
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info("Deleted skill: %s", skill_id)
            return True
        return False

    # ── 搜索 ─────────────────────────────────────────────────

    def search_skills(self, query: str, limit: int = 5) -> list[dict]:
        """搜索技能 — 按 triggers 和 description 匹配，返回最相关的技能

        匹配策略：
        1. 精确 trigger 匹配（query 包含 trigger 或 trigger 包含 query）
        2. description 关键词匹配
        3. tags 匹配
        """
        if not query.strip():
            return []

        query_lower = query.lower()
        query_tokens = set(re.findall(r"[\w\u4e00-\u9fff]+", query_lower))
        scored: list[tuple[float, dict]] = []

        for skill in self.list_skills():
            score = 0.0

            # trigger 匹配（权重最高）
            for trigger in skill.get("triggers", []):
                t_lower = trigger.lower()
                if t_lower == query_lower:
                    score += 15.0
                elif len(t_lower) > 4 and (t_lower in query_lower or query_lower in t_lower):
                    score += 10.0
                elif len(t_lower) > 4 and t_lower in query_tokens:
                    score += 5.0

            # tags 匹配
            for tag in skill.get("tags", []):
                if tag.lower() in query_tokens:
                    score += 3.0

            # description 匹配
            desc_lower = skill.get("description", "").lower()
            for token in query_tokens:
                if len(token) > 2 and token in desc_lower:
                    score += 1.0

            if score > 0:
                scored.append((score, skill))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [s for _, s in scored[:limit]]

    # ── 使用记录 ─────────────────────────────────────────────

    def record_usage(self, skill_id: str):
        """记录技能使用 — 更新 last_used 和 use_count"""
        skill = self.get_skill(skill_id)
        if not skill:
            return
        skill["last_used"] = datetime.now(timezone.utc).isoformat()
        skill["use_count"] = skill.get("use_count", 0) + 1
        self._save(skill)

    # ── 自动学习 ─────────────────────────────────────────────

    async def try_learn_skill(
        self,
        user_text: str,
        assistant_response: str,
        tool_calls: list[dict] | None = None,
    ) -> Optional[dict]:
        """尝试从交互中学习新技能

        学习条件：
        1. 使用了 2 个以上工具调用
        2. 不是已有技能的重复
        3. 任务模式可复用

        Args:
            user_text: 用户输入
            assistant_response: 助手完整回复
            tool_calls: 工具调用记录

        Returns:
            新创建的技能或 None
        """
        tool_calls = tool_calls or []

        # 条件：至少 2 个工具调用才算复杂任务
        if len(tool_calls) < 2:
            return None

        # 提取工具名列表
        tool_names = []
        for tc in tool_calls:
            if isinstance(tc, dict):
                func = tc.get("function", {})
                tool_names.append(func.get("name", ""))

        # 检查是否已有类似技能（避免重复学习）
        existing = self.search_skills(user_text, limit=3)
        for skill in existing:
            if skill.get("use_count", 0) >= 3:
                # 已有高使用率的匹配技能，不重复创建
                return None

        # 从交互中提取模式
        skill_name = self._extract_skill_name(user_text)
        triggers = self._extract_triggers(user_text)
        content = self._extract_workflow(assistant_response, tool_names)
        code_template = self._extract_code(assistant_response)

        if not skill_name or len(triggers) < 1:
            return None

        # 创建新技能
        new_skill = self.create_skill(
            name=skill_name,
            description=f"从交互中自动学习: {user_text[:80]}",
            triggers=triggers,
            content=content,
            code_template=code_template,
            tags=["auto-learned"],
        )
        logger.info("Auto-learned skill: %s from interaction", skill_name)
        return new_skill

    # ── 学习辅助方法 ─────────────────────────────────────────

    @staticmethod
    def _extract_skill_name(text: str) -> str:
        """从用户输入中提取简洁的技能名称"""
        # 取前 30 个字符作为名称
        clean = text.strip().replace("\n", " ")
        if len(clean) > 30:
            clean = clean[:30].rsplit(" ", 1)[0] + "…"
        return clean

    @staticmethod
    def _extract_triggers(text: str) -> list[str]:
        """从用户输入中提取触发关键词"""
        # 中文分词（简单版）：提取连续中文片段和英文单词
        tokens = re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}", text)
        # 去重、取前 5 个
        seen = set()
        triggers = []
        for t in tokens:
            t_lower = t.lower()
            if t_lower not in seen:
                seen.add(t_lower)
                triggers.append(t)
            if len(triggers) >= 5:
                break
        return triggers

    @staticmethod
    def _extract_workflow(response: str, tool_names: list[str]) -> str:
        """从助手回复中提取工作流步骤"""
        lines = []
        if tool_names:
            lines.append("## 使用的工具")
            for tn in tool_names:
                lines.append(f"- {tn}")
            lines.append("")

        # 提取回复中的编号步骤
        steps = re.findall(r"(?:^|\n)\s*(?:\d+[.、)]\s*)(.+?)(?=\n\d+[.、)]|\n\n|\Z)", response, re.DOTALL)
        if steps:
            lines.append("## 步骤")
            for i, step in enumerate(steps[:8], 1):
                lines.append(f"{i}. {step.strip()[:100]}")

        return "\n".join(lines) if lines else f"## 工作流\n参考工具: {', '.join(tool_names)}"

    @staticmethod
    def _extract_code(response: str) -> str:
        """从助手回复中提取代码块"""
        code_blocks = re.findall(r"```(?:\w+)?\n(.*?)```", response, re.DOTALL)
        if code_blocks:
            # 取最长的代码块
            return max(code_blocks, key=len).strip()[:2000]
        return ""

    # ── 内部方法 ─────────────────────────────────────────────

    def _save(self, skill: dict):
        """保存技能到 JSON 文件"""
        filepath = os.path.join(self.skills_dir, f"{skill['id']}.json")
        with open(filepath, "w", encoding="utf-8") as fp:
            json.dump(skill, fp, ensure_ascii=False, indent=2)
