"""
OpenSoul — 用户记忆

记录用户偏好、操作习惯、风险容忍度。
"""

import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class UserMemory:
    """用户记忆：偏好、习惯、风险容忍度"""

    def __init__(self, storage_path: str = "data/user_memory.json"):
        self.storage_path = Path(storage_path)
        self.preferences: dict = {
            "edit_mode_preference": "patch",  # 用户偏好的编辑模式
            "risk_tolerance": "medium",       # low / medium / high
            "auto_confirm_low_risk": True,    # 低风险自动执行
            "always_backup_before_edit": True,
            "preferred_languages": [],        # 偏好的编程语言
            "notification_level": "normal",   # quiet / normal / verbose
        }
        self.feedback_history: list = []  # 用户对Agent行为的反馈记录
        self._load()

    def get(self, key: str, default=None):
        """获取偏好"""
        return self.preferences.get(key, default)

    def set(self, key: str, value):
        """设置偏好"""
        self.preferences[key] = value
        self._save()

    def record_feedback(self, action: str, feedback: str, rating: int):
        """记录用户对Agent行为的反馈

        Args:
            action: Agent执行的操作
            feedback: 用户反馈文本
            rating: 评分 (-1=差, 0=中, 1=好)
        """
        self.feedback_history.append({
            "action": action,
            "feedback": feedback,
            "rating": rating,
        })
        self._save()

    def should_auto_execute(self, risk_level: str) -> bool:
        """根据风险等级和用户偏好，判断是否自动执行"""
        tolerance = self.preferences.get("risk_tolerance", "medium")
        if risk_level == "low":
            return self.preferences.get("auto_confirm_low_risk", True)
        elif risk_level == "medium":
            return tolerance == "high"
        else:
            return False  # 高/临界风险永远不自动执行

    def _load(self):
        if not self.storage_path.exists():
            return
        try:
            with open(self.storage_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.preferences.update(data.get("preferences", {}))
            self.feedback_history = data.get("feedback_history", [])
            logger.info("加载用户记忆")
        except Exception as e:
            logger.warning("加载用户记忆失败: %s", e)

    def _save(self):
        try:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump({
                    "preferences": self.preferences,
                    "feedback_history": self.feedback_history[-200:],  # 保留最近200条
                }, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error("保存用户记忆失败: %s", e)
