from datetime import datetime
from typing import Any, Dict, List, Optional, Callable
import logging
from .base import BaseSkill
from ..memory.manager import MemoryManager

logger = logging.getLogger(__name__)

class ObservationAnalyzer(BaseSkill):
    """观察分析优化技能"""
    
    UNANALYZED_THRESHOLD = 2  # 可配置的阈值
    
    def __init__(
        self,
        memory_manager: MemoryManager,
        on_error_pattern_detected: Optional[Callable] = None
    ):
        super().__init__(skill_name="observation_analyzer", memory_manager=memory_manager)
        self.on_error_pattern_detected = on_error_pattern_detected
        
    def execute(self, *args, **kwargs) -> Dict[str, Any]:
        """执行观察分析主流程"""
        # 1. 监控未分析观察数量
        needs_processing = self.monitor_unanalyzed()
        
        # 2. 自动分析未分析的观察
        analysis_results = self.auto_analyze()
        
        # 3. 提取可复用的模式
        patterns = self.extract_patterns(analysis_results)
        
        # 4. 关联到知识积累目标
        self.link_to_knowledge(analysis_results)
        
        # 5. 生成分析报告
        report = self.generate_report()
        
        return {
            "needs_processing": needs_processing,
            "patterns_found": len(patterns),
            "report": report
        }
    
    def monitor_unanalyzed(self) -> bool:
        """阈值监控器：追踪未分析观察数量"""
        observations = self.memory_manager.get("observations", [])
        unanalyzed_count = sum(1 for obs in observations if not obs.get("analyzed", False))
        
        logger.info(f"未分析观察数量: {unanalyzed_count}")
        
        if unanalyzed_count > self.UNANALYZED_THRESHOLD:
            logger.warning(f"未分析观察超过阈值({self.UNANALYZED_THRESHOLD})，标记为需要处理")
            # 标记为需要处理
            self.memory_manager.update("observation_analysis_needed", True)
            return True
        
        self.memory_manager.update("observation_analysis_needed", False)
        return False
    
    def auto_analyze(self) -> List[Dict[str, Any]]:
        """自动分析器：对未分析的观察进行分类"""
        observations = self.memory_manager.get("observations", [])
        analysis_results = []
        
        for obs in observations:
            if not obs.get("analyzed", False):
                # 分析观察数据
                analysis = self._analyze_observation(obs)
                analysis_results.append(analysis)
                
                # 标记观察为已分析