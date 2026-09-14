"""
对话摘要压缩器 — 借鉴LangChain ConversationSummaryMemory + MemGPT
核心思想：长对话自动摘要为简短记忆，保留关键信息丢弃冗余
"""

import logging
import json
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("acp-proxy.conversation-summarizer")


@dataclass
class ConversationSummary:
    summary_id: str
    original_count: int  # 原始消息数
    summarized_count: int  # 摘要后消息数
    summary_text: str
    key_decisions: list[str] = field(default_factory=list)
    key_entities: list[str] = field(default_factory=list)
    open_questions: list[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    token_reduction: float = 0.0  # token减少百分比


class ConversationSummarizer:
    """对话摘要压缩器"""

    def __init__(self, max_messages_before_summary: int = 30):
        self.max_messages = max_messages_before_summary
        self._summaries: list[ConversationSummary] = []

    def should_summarize(self, messages: list[dict]) -> bool:
        """判断是否需要摘要"""
        return len(messages) > self.max_messages

    def summarize(
        self,
        messages: list[dict],
        preserve_recent: int = 10,
    ) -> tuple[list[dict], ConversationSummary]:
        """摘要压缩消息列表

        返回：(压缩后的消息列表, 摘要对象)
        """
        if len(messages) <= self.max_messages:
            return messages, ConversationSummary(
                summary_id="none", original_count=len(messages),
                summarized_count=len(messages), summary_text="无需摘要",
            )

        # 分离：旧消息（需要摘要）+ 新消息（保留原样）
        old_messages = messages[:-preserve_recent]
        recent_messages = messages[-preserve_recent:]

        # 提取关键信息
        key_decisions = self._extract_decisions(old_messages)
        key_entities = self._extract_entities(old_messages)
        open_questions = self._extract_open_questions(old_messages)

        # 生成摘要文本
        summary_text = self._build_summary_text(
            old_messages, key_decisions, key_entities, open_questions
        )

        # 构建压缩后的消息列表
        summary_message = {
            "role": "system",
            "content": f"[对话摘要 - 压缩了{len(old_messages)}条消息]\n{summary_text}",
        }

        compressed = [summary_message] + recent_messages

        # 计算token减少
        original_tokens = sum(len(str(m.get("content", ""))) for m in messages)
        compressed_tokens = sum(len(str(m.get("content", ""))) for m in compressed)
        reduction = 1.0 - (compressed_tokens / original_tokens) if original_tokens else 0

        summary = ConversationSummary(
            summary_id=f"summary_{int(time.time())}",
            original_count=len(messages),
            summarized_count=len(compressed),
            summary_text=summary_text,
            key_decisions=key_decisions,
            key_entities=key_entities,
            open_questions=open_questions,
            token_reduction=reduction,
        )

        self._summaries.append(summary)
        logger.info(
            f"Summarized: {len(messages)} → {len(compressed)} messages "
            f"(-{reduction:.0%} tokens)"
        )

        return compressed, summary

    def _extract_decisions(self, messages: list[dict]) -> list[str]:
        """提取关键决策"""
        decisions = []
        for msg in messages:
            content = str(msg.get("content", ""))
            # 寻找决策关键词
            decision_indicators = [
                "决定", "确定", "选择", "采用", "使用", "decided", "chose",
                "will use", "going with", "commit", "已确认",
            ]
            for indicator in decision_indicators:
                if indicator in content.lower():
                    # 提取包含关键词的句子
                    sentences = content.split("。")
                    for sentence in sentences:
                        if indicator in sentence.lower() and len(sentence) > 5:
                            decisions.append(sentence.strip()[:100])
                    break

        return decisions[:10]

    def _extract_entities(self, messages: list[dict]) -> list[str]:
        """提取关键实体（文件名、URL、命令等）"""
        import re
        entities = set()

        for msg in messages:
            content = str(msg.get("content", ""))

            # 文件路径
            file_paths = re.findall(r'[/~][\w/.-]+\.\w+', content)
            entities.update(file_paths[:3])

            # URL
            urls = re.findall(r'https?://[^\s]+', content)
            entities.update(urls[:2])

            # 命令
            commands = re.findall(r'`([^`]+)`', content)
            entities.update(c[:50] for c in commands[:3])

        return list(entities)[:15]

    def _extract_open_questions(self, messages: list[dict]) -> list[str]:
        """提取未解决的问题"""
        questions = []
        for msg in messages:
            content = str(msg.get("content", ""))
            if "?" in content or "？" in content:
                sentences = content.replace("？", "?").split("?")
                for sentence in sentences[:-1]:  # 最后一个是空的
                    if len(sentence) > 5:
                        questions.append(sentence.strip()[-80:] + "?")

        return questions[:5]

    def _build_summary_text(
        self,
        messages: list[dict],
        decisions: list[str],
        entities: list[str],
        questions: list[str],
    ) -> str:
        """构建摘要文本"""
        lines = []

        # 对话主题
        user_messages = [
            str(m.get("content", ""))[:50]
            for m in messages
            if m.get("role") == "user"
        ]
        if user_messages:
            lines.append(f"主题: {user_messages[0]}")
            lines.append(f"用户请求: {len(user_messages)}次")

        # 关键决策
        if decisions:
            lines.append("\n关键决策:")
            for d in decisions[:5]:
                lines.append(f"  - {d}")

        # 关键实体
        if entities:
            lines.append(f"\n涉及: {', '.join(entities[:8])}")

        # 未解决问题
        if questions:
            lines.append("\n未解决:")
            for q in questions[:3]:
                lines.append(f"  ? {q}")

        return "\n".join(lines)

    def get_stats(self) -> dict:
        if not self._summaries:
            return {
                "total_summaries": 0,
                "avg_reduction": 0,
                "total_messages_compressed": 0,
            }

        return {
            "total_summaries": len(self._summaries),
            "avg_reduction": round(
                sum(s.token_reduction for s in self._summaries) / len(self._summaries), 3
            ),
            "total_messages_compressed": sum(
                s.original_count - s.summarized_count for s in self._summaries
            ),
        }
