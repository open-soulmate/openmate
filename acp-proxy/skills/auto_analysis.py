import time
from datetime import datetime
from collections import defaultdict
from typing import List, Dict, Any, Optional


class AutoAnalysisSkill:
    """
    自动分析技能 - 将未分析的观察转化为结构化洞察
    """
    
    SKILL_NAME = "auto_analysis"
    UNANALYZED_THRESHOLD = 3  # 触发阈值，可配置
    SOURCE_IDENTIFIER = "auto_analysis"
    INSIGHT_TYPE = "insight"
    
    def __init__(self, context):
        """初始化技能，接收上下文对象"""
        self.context = context
        self.memories = context.memories
        self.logger = context.logger
    
    async def should_trigger(self, config: Optional[Dict] = None) -> bool:
        """检查是否满足触发条件"""
        threshold = config.get("UNANALYZED_THRESHOLD", self.UNANALYZED_THRESHOLD) if config else self.UNANALYZED_THRESHOLD
        
        try:
            unanalyzed_count = await self.memories.get_unanalyzed_count()
            return unanalyzed_count >= threshold
        except Exception as e:
            self.logger.warning(f"检查未分析观察数量时出错: {e}")
            return False
    
    async def execute(self, config: Optional[Dict] = None) -> str:
        """执行自动分析"""
        start_time = datetime.now()
        