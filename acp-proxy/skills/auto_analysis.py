import datetime
from typing import List, Dict, Any, Set

# 触发阈值配置
UNANALYZED_THRESHOLD = 3

class AutoAnalysisSkill:
    """自动分析技能，用于处理过量的观察并生成结构化洞察"""
    
    def __init__(self, context):
        """
        初始化技能
        :param context: 上下文对象，包含记忆系统等资源
        """
        self.context = context
    
    def can_run(self) -> bool:
        """
        检查是否应该触发分析（基于未分析观察的数量）
        :return: 如果未分析观察数量达到阈值，返回True
        """
        unanalyzed = self.context.memories.get_unanalyzed()
        return len(unanalyzed) >= UNANALYZED_THRESHOLD
    
    def run(self) -> str:
        """
        执行自动分析并返回报告
        :return: 分析报告字符串
        """
        unanalyzed = self.context.memories.get_unanalyzed()
        if not unanalyzed:
            return "没有未分析的观察需要处理。"
        
        # 执行批量分析