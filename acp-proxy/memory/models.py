"""记忆条目数据模型 — 定义MemoryItem和相关枚举

纯Python dataclass实现，不依赖外部库。
MemoryItem是记忆系统的基本单元，包含内容、类型、标签、相关性分数等字段。
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
import uuid


class MemoryType(str, Enum):
    """记忆类型枚举

    - SHORT_TERM: 短期记忆，会话内上下文，容量有限，随会话销毁清除
    - LONG_TERM: 长期记忆，跨会话持久化，从短期记忆提炼后存入
    - WORKING: 工作记忆，当前任务临时状态，任务完成后清理
    """
    SHORT_TERM = "short_term"
    LONG_TERM = "long_term"
    WORKING = "working"


@dataclass
class MemoryItem:
    """记忆条目 — 记忆系统的基本存储单元

    每条记忆包含唯一ID、类型、内容文本、标签列表、
    创建时间、所属会话ID和相关性分数。

    Attributes:
        id: 唯一标识符（自动生成UUID）
        type: 记忆类型 (short_term / long_term / working)
        content: 记忆内容文本
        tags: 标签列表，用于分类和检索
        created_at: 创建时间（UTC）
        session_id: 所属会话ID
        relevance_score: 相关性分数（0.0~1.0），用于检索排序
    """
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    type: MemoryType = MemoryType.SHORT_TERM
    content: str = ""
    tags: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    session_id: Optional[str] = None
    relevance_score: float = 0.0

    def matches_keyword(self, keyword: str) -> float:
        """检查关键词是否匹配此记忆条目，返回匹配分数

        匹配策略：
        - content中出现关键词 → 基础分 1.0
        - tags中出现关键词 → 加权分 0.5（标签匹配更精确）
        - 多次出现加分（频次衰减）

        Args:
            keyword: 搜索关键词（不区分大小写）

        Returns:
            匹配分数，0.0表示不匹配
        """
        keyword_lower = keyword.lower()
        score = 0.0

        # 内容匹配
        content_lower = self.content.lower()
        count = content_lower.count(keyword_lower)
        if count > 0:
            # 频次衰减：首次匹配1.0，后续每次+0.2，但有上限
            score += min(1.0 + (count - 1) * 0.2, 2.0)

        # 标签精确匹配（权重更高）
        for tag in self.tags:
            if keyword_lower in tag.lower():
                score += 0.5

        return score

    def to_dict(self) -> dict:
        """序列化为字典，用于JSON导出等场景"""
        return {
            "id": self.id,
            "type": self.type.value,
            "content": self.content,
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
            "session_id": self.session_id,
            "relevance_score": self.relevance_score,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "MemoryItem":
        """从字典反序列化，用于JSON导入等场景"""
        return cls(
            id=data.get("id", uuid.uuid4().hex[:12]),
            type=MemoryType(data.get("type", "short_term")),
            content=data.get("content", ""),
            tags=data.get("tags", []),
            created_at=datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.now(timezone.utc),
            session_id=data.get("session_id"),
            relevance_score=data.get("relevance_score", 0.0),
        )
