import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import json

from acp_proxy.skills.base_skill import BaseSkill
from acp_proxy.core.observation_manager import ObservationManager
from acp_proxy.core.memory_manager import MemoryManager
from acp_proxy.core.goal_manager import GoalManager


@dataclass
class AnalysisInsight:
    """分析结果结构体"""
    pattern_type: str
    confidence: float
    impact_level: str  # high, medium, low
    suggested_action: str
    details: Dict[str, Any]
    timestamp: datetime
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "pattern_type": self.pattern_type,
            "confidence": self.confidence,
            "impact_level": self.impact_level,
            "suggested_action": self.suggested_action,
            "details": self.details,
            "timestamp": self.timestamp.isoformat()
        }


class ObservationAnalyzerSkill(BaseSkill):
    """
    观察数据自动分析技能
    解决"观察数据累积未分析"的问题，定期扫描未分析观察数据进行深度分析和知识提炼
    """
    
    def __init__(self, config: Optional[Dict] = None):
        super().__init__(config or {})
        self.logger = logging.getLogger("ObservationAnalyzerSkill")
        
        # 初始化依赖组件
        self.observation_manager = ObservationManager()
        self.memory_manager = MemoryManager()
        self.goal_manager = GoalManager()
        
        # 触发条件配置
        self.trigger_threshold = config.get("trigger_threshold", 3) if config else 3
        
        # 分析统计
        self.analysis_stats = {
            "total_analyzed": 0,
            "last_analysis_time": None,
            "insights_generated": 0
        }
        
        self.logger.info(f"ObservationAnalyzerSkill initialized with trigger threshold: {self.trigger_threshold}")
    
    @property
    def trigger_condition(self) -> bool:
        """触发条件：当未分析观察数据 >= 3 时自动触发"""
        unanalyzed_count = self.observation_manager.get_unanalyzed_count()
        self.logger.debug(f"Unanalyzed observations count: {unanalyzed_count}")
        return unanalyzed_count >= self.trigger_threshold
    
    async def analyze_pending_observations(self) -> List[AnalysisInsight]:
        """
        核心方法：扫描并分析所有未处理的观察数据
        Returns: 分析结果列表
        """
        self.logger.info("Starting analysis of pending observations...")
        
        # 获取未分析的观察数据
        unanalyzed_observations = self.observation_manager.get_unanalyzed_observations()
        
        if not unanalyzed_observations:
            self.logger.info("No unanalyzed observations found.")
            return []
        
        self.logger.info(f"Found {len(unanalyzed_observations)} unanalyzed observations.")
        
        # 提取洞察
        insights = self.extract_insights(unanalyzed_observations)
        
        if insights:
            # 更新知识库
            await self.update_knowledge_base(insights)
            
            # 生成行动建议
            recommendations = self.generate_action_recommendations(insights)
            
            # 标记观察数据为已分析
            self.observation_manager.mark_as_analyzed(unanalyzed_observations)
            
            # 更新统计
            self.analysis_stats["total_analyzed"] += len(unanalyzed_observations)
            self.analysis_stats["insights_generated"] += len(insights)
            self.analysis_stats["last_analysis_time"] = datetime.now()
            
            self.logger.info(f"Analysis completed. Generated {len(insights)} insights.")
            
            # 记录分析结果摘要
            self._log_analysis_summary(insights, recommendations)
            
            return insights
        
        self.logger.info("No insights extracted from observations.")
        return []
    
    def extract_insights(self, observations: List[Dict]) -> List[AnalysisInsight]:
        """
        从观察中提取关键洞察、模式识别、风险信号
        Args:
            observations: 观察数据列表
        Returns: 分析洞察列表
        """
        self.logger.info(f"Extracting insights from {len(observations)} observations...")
        
        insights = []
        
        # 模式识别逻辑
        patterns = self._identify_patterns(observations)
        
        for pattern in patterns:
            insight = AnalysisInsight(
                pattern_type=pattern["type"],
                confidence=pattern["confidence"],
                impact_level=self._calculate_impact_level(pattern),
                suggested_action=self._suggest_action(pattern),
                details=pattern["details"],
                timestamp=datetime.now()
            )
            insights.append(insight)
        
        # 风险信号检测
        risk_signals = self._detect_risk_signals(observations)