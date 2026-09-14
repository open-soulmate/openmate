"""
OpenSoul — 经验记忆

存储成功模式、失败教训。
支持语义检索（关键词匹配）、经验老化衰减。
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from soul.data_models import Experience, Intent, TaskContext, Verification

logger = logging.getLogger(__name__)


class ExperienceMemory:
    """经验记忆：成功/失败模式，关键词检索、老化衰减"""

    def __init__(self, storage_path: str = "data/experience.json"):
        self.storage_path = Path(storage_path)
        self.experiences: List[Experience] = []
        self._load()

    def record(self, action: str, result: dict, verification: Verification, task_ctx: TaskContext):
        """记录一次行动结果"""
        exp = Experience(
            action=action,
            intent_summary=task_ctx.intent.goal if task_ctx.intent else "unknown",
            outcome="success" if verification.success else "failure",
            error=verification.error,
            fix=verification.fix,
        )
        self.experiences.append(exp)
        self._aging_prune()
        self._save()
        logger.debug("记录经验: %s (%s)", action[:50], exp.outcome)

    def get_relevant_experience(self, intent: Intent) -> List[Experience]:
        """获取和当前意图相关的历史经验"""
        relevant = []
        for exp in self.experiences:
            score = self._compute_relevance(exp, intent)
            if score > 0.2:
                exp.relevance_score = score
                relevant.append(exp)
        relevant.sort(key=lambda e: e.relevance_score, reverse=True)
        return relevant[:10]

    def get_similar_failures(self, intent: Intent) -> List[Experience]:
        """获取类似操作的失败经验"""
        return [e for e in self.get_relevant_experience(intent) if e.outcome == "failure"]

    def _compute_relevance(self, exp: Experience, intent: Intent) -> float:
        """计算经验与当前意图的相关度"""
        score = 0.0

        # 目标类型匹配
        if exp.intent_summary == intent.goal:
            score += 0.5

        # 关键词匹配（action文本中是否包含目标文件名）
        for f in intent.target_files:
            if f in exp.action:
                score += 0.3
                break

        # 时间衰减（越近的经验越相关）
        age_hours = (datetime.now() - exp.timestamp).total_seconds() / 3600
        time_decay = max(0.1, 1.0 - age_hours / (24 * 30))  # 30天衰减到0.1
        score *= time_decay

        # 失败经验权重更高（要吸取教训）
        if exp.outcome == "failure":
            score += 0.15

        return min(1.0, score)

    def _aging_prune(self):
        """老化淘汰：移除过期经验，控制内存"""
        now = datetime.now()
        # 移除90天前的经验
        self.experiences = [
            e for e in self.experiences
            if (now - e.timestamp).days < 90
        ]
        # 如果还是太多，保留最高权重的
        if len(self.experiences) > 1000:
            self.experiences.sort(key=lambda e: e.relevance_score, reverse=True)
            self.experiences = self.experiences[:1000]

    def _load(self):
        """从磁盘加载经验"""
        if not self.storage_path.exists():
            return
        try:
            with open(self.storage_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.experiences = [Experience.from_dict(d) for d in data]
            logger.info("加载%d条经验记录", len(self.experiences))
        except Exception as e:
            logger.warning("加载经验失败: %s", e)

    def _save(self):
        """持久化到磁盘"""
        try:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump([e.to_dict() for e in self.experiences], f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error("保存经验失败: %s", e)

    def get_stats(self) -> dict:
        """统计信息"""
        now = datetime.now()
        return {
            "total": len(self.experiences),
            "success_count": sum(1 for e in self.experiences if e.outcome == "success"),
            "failure_count": sum(1 for e in self.experiences if e.outcome == "failure"),
            "recent_24h": sum(1 for e in self.experiences if (now - e.timestamp).total_seconds() < 86400),
        }
