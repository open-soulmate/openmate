"""
Agent上下文注入器 — 借鉴LangChain ContextInjection + Claude Code system prompt assembly
核心思想：将各种上下文（环境/记忆/偏好/经验）智能注入到LLM prompt中
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.context-injector")


@dataclass
class ContextSource:
    source_id: str
    name: str
    content: str = ""
    priority: int = 50
    max_tokens: int = 500
    enabled: bool = True
    last_updated: float = 0.0


class ContextInjector:
    """上下文注入器"""

    def __init__(self, max_total_tokens: int = 3000):
        self.max_total_tokens = max_total_tokens
        self._sources: dict[str, ContextSource] = {}

    def register_source(
        self,
        source_id: str,
        name: str,
        priority: int = 50,
        max_tokens: int = 500,
    ):
        """注册上下文源"""
        self._sources[source_id] = ContextSource(
            source_id=source_id,
            name=name,
            priority=priority,
            max_tokens=max_tokens,
        )

    def update_source(self, source_id: str, content: str):
        """更新上下文源内容"""
        if source_id in self._sources:
            self._sources[source_id].content = content
            self._sources[source_id].last_updated = time.time()

    def build_context(
        self,
        base_prompt: str,
        additional_contexts: Optional[dict[str, str]] = None,
    ) -> str:
        """构建完整上下文"""
        # 收集所有启用的上下文源
        sources = []
        for source in self._sources.values():
            if not source.enabled or not source.content:
                continue
            sources.append(source)

        # 更新临时上下文
        if additional_contexts:
            for sid, content in additional_contexts.items():
                if sid in self._sources:
                    self._sources[sid].content = content
                else:
                    sources.append(ContextSource(
                        source_id=sid, name=sid, content=content,
                    ))

        # 按优先级排序
        sources.sort(key=lambda s: s.priority, reverse=True)

        # Token预算分配
        parts = [base_prompt]
        total_tokens = len(base_prompt) // 3

        for source in sources:
            source_tokens = min(
                len(source.content) // 3,
                source.max_tokens,
            )
            if total_tokens + source_tokens <= self.max_total_tokens:
                parts.append(source.content)
                total_tokens += source_tokens
            else:
                remaining = self.max_total_tokens - total_tokens
                if remaining > 50:
                    truncated = source.content[:remaining * 3]
                    parts.append(truncated)
                    total_tokens += remaining
                break

        return "\n\n".join(parts)

    def get_stats(self) -> dict:
        active = sum(1 for s in self._sources.values() if s.enabled and s.content)
        total_chars = sum(len(s.content) for s in self._sources.values() if s.enabled)
        return {
            "total_sources": len(self._sources),
            "active_sources": active,
            "total_chars": total_chars,
            "max_total_tokens": self.max_total_tokens,
        }
