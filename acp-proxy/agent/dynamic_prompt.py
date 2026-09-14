"""
动态系统提示词生成器 — 借鉴Claude Code system-reminder + Dynamic Prompts
核心思想：根据上下文动态组装系统提示词，而非使用固定模板
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.dynamic-prompt")


@dataclass
class PromptSection:
    section_id: str
    content: str
    priority: int = 50  # 0-100, 越高越重要
    category: str = "general"  # "role", "constraints", "context", "tools", "memory"
    token_estimate: int = 0
    enabled: bool = True
    metadata: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.token_estimate:
            self.token_estimate = len(self.content) // 3  # 粗略估算


class DynamicPromptBuilder:
    """动态系统提示词生成器"""

    def __init__(self, max_tokens: int = 4000):
        self.max_tokens = max_tokens
        self._sections: dict[str, PromptSection] = {}

    def add_section(self, section: PromptSection):
        """添加提示词片段"""
        self._sections[section.section_id] = section

    def remove_section(self, section_id: str):
        self._sections.pop(section_id, None)

    def update_section(self, section_id: str, content: str):
        """更新片段内容"""
        if section_id in self._sections:
            self._sections[section_id].content = content
            self._sections[section_id].token_estimate = len(content) // 3

    def build(self, context: Optional[dict] = None) -> str:
        """构建系统提示词

        Args:
            context: 运行时上下文，用于条件性包含片段
        """
        # 按优先级排序
        sorted_sections = sorted(
            [s for s in self._sections.values() if s.enabled],
            key=lambda s: s.priority,
            reverse=True,
        )

        # Token预算分配
        total_tokens = 0
        selected: list[PromptSection] = []

        for section in sorted_sections:
            if total_tokens + section.token_estimate <= self.max_tokens:
                selected.append(section)
                total_tokens += section.token_estimate
            else:
                # 尝试截断低优先级片段
                remaining = self.max_tokens - total_tokens
                if remaining > 50:
                    truncated = PromptSection(
                        section_id=section.section_id,
                        content=section.content[:remaining * 3] + "...",
                        priority=section.priority,
                        category=section.category,
                        token_estimate=remaining,
                    )
                    selected.append(truncated)
                    total_tokens += remaining
                break

        # 按类别组织输出
        by_category: dict[str, list[PromptSection]] = {}
        for s in selected:
            by_category.setdefault(s.category, []).append(s)

        # 构建最终提示词
        parts = []
        category_order = ["role", "constraints", "context", "memory", "tools", "general"]

        for cat in category_order:
            if cat in by_category:
                sections = by_category[cat]
                if len(sections) == 1:
                    parts.append(sections[0].content)
                else:
                    parts.append(f"## {cat.title()}")
                    for s in sections:
                        parts.append(s.content)

        return "\n\n".join(parts)

    def inject_context(
        self,
        base_prompt: str,
        user_preferences: str = "",
        memories: str = "",
        experiences: str = "",
        current_task: str = "",
        environment_info: str = "",
    ) -> str:
        """注入运行时上下文到基础提示词"""
        parts = [base_prompt]

        if environment_info:
            parts.append(f"\n<environment>\n{environment_info}\n</environment>")

        if user_preferences:
            parts.append(f"\n<user_preferences>\n{user_preferences}\n</user_preferences>")

        if memories:
            parts.append(f"\n<relevant_memories>\n{memories}\n</relevant_memories>")

        if experiences:
            parts.append(f"\n<past_experiences>\n{experiences}\n</past_experiences>")

        if current_task:
            parts.append(f"\n<current_task>\n{current_task}\n</current_task>")

        return "\n".join(parts)

    def get_stats(self) -> dict:
        total_tokens = sum(s.token_estimate for s in self._sections.values() if s.enabled)
        by_category: dict[str, int] = {}
        for s in self._sections.values():
            if s.enabled:
                by_category[s.category] = by_category.get(s.category, 0) + 1

        return {
            "total_sections": len(self._sections),
            "enabled_sections": sum(1 for s in self._sections.values() if s.enabled),
            "total_tokens": total_tokens,
            "max_tokens": self.max_tokens,
            "usage_percent": round(total_tokens / self.max_tokens * 100, 1) if self.max_tokens else 0,
            "by_category": by_category,
        }
