from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import json

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory.manager import MemoryManager

@dataclass
class ObservationPattern:
    """观察模式数据结构"""
    pattern_type: str  # 错误模式、成功模式、资源使用、性能指标
    description: str
    frequency: int
    last_seen: str
    details: Dict[str, Any] = None

class ObservationAnalyzer(BaseSkill):
    """观察分析优化技能"""
    
    def __init__(self, memory_manager: MemoryManager, **kwargs):
        super().__init__(**kwargs)
        self.memory_manager = memory_manager
        self.UNANALYZED_THRESHOLD = kwargs.get('unanalyzed_threshold', 2)
        self.patterns: List[ObservationPattern] = []
        self.analysis_results: Dict[str, Any] = {}
        self.errors_found: List[str] = []
    
    async def initialize(self) -> None:
        """初始化技能"""
        await super().initialize()
        self.logger.info("观察分析技能初始化完成")
    
    async def monitor_unanalyzed(self) -> bool:
        """阈值监控器：追踪未分析观察数量"""
        observations = self.memory_manager.get_memory().get('observations', [])
        unanalyzed_count = sum(
            1 for obs in observations 
            if not obs.get('analyzed', False)
        )
        
        needs_processing = unanalyzed_count > self.UNANALYZED_THRESHOLD
        
        if needs_processing:
            self.logger.warning(
                f"未分析观察数量 ({unanalyzed_count}) 超过阈值 ({self.UNANALYZED_THRESHOLD})，需要处理"
            )
            await self._notify_needs_processing(unanalyzed_count)
        
        return needs_processing
    
    async def _notify_needs_processing(self, count: int) -> None:
        """通知需要处理"""
        notification = {
            "type": "unanalyzed_observations",
            "count": count,
            "timestamp": datetime.now().isoformat(),
            "message": f"检测到 {count} 条未分析的观察记录"
        }
        # 可以集成通知系统
        self.logger.info(f"通知: {notification['message']}")
    
    async def auto_analyze(self) -> Dict[str, Any]:
        """自动分析器：对未分析的观察进行分类"""
        observations = self.memory_manager.get_memory().get('observations', [])
        unanalyzed = [obs for obs in observations if not obs.get('analyzed', False)]
        
        analysis_results = {
            "error_patterns": [],
            "success_patterns": [],
            "resource_usage": [],
            "performance_metrics": [],
            "analyzed_count": len(unanalyzed),
            "timestamp": datetime.now().isoformat()
        }
        
        for observation in unanalyzed:
            category = self._categorize_observation(observation)
            analysis_results[category].append({
                "observation_id": observation.get('id'),
                "content": observation.get('content'),
                "category": category,
                "analysis_time": datetime.now().isoformat()
            })
            
            # 标记为已分析
            observation['analyzed'] = True
            observation['analysis_result'] = {
                "category": category,
                "analyzed_at": datetime.now().isoformat()
            }
        
        self.analysis_results = analysis_results
        
        # 提取模式
        if unanalyzed:
            await self.extract_patterns()
        
        # 如果发现错误模式，触发改进项生成
        if analysis_results["error_patterns"]:
            await self._trigger_improvements()
        
        # 更新内存中的观察数据
        await self._update_observations_in_memory(observations)
        
        return analysis_results
    
    def _categorize_observation(self, observation: Dict[str, Any]) -> str:
        """对观察进行分类"""
        content = observation.get('content', '').lower()
        obs_type = observation.get('type', '').lower()
        
        # 简单分类逻辑
        error_indicators = ['error', 'fail', 'exception', 'problem', 'issue', 'bug']
        success_indicators = ['success', 'complete', 'achieve', 'goal', 'pass']
        resource_indicators = ['memory', 'cpu', 'disk', 'network', 'resource', 'usage']
        performance_indicators = ['performance', 'speed', 'latency', 'throughput', 'time', 'slow', 'fast']
        
        if any(indicator in content or indicator in obs_type for indicator in error_indicators):
            return "error_patterns"
        elif any(indicator in content or indicator in obs_type for indicator in success_indicators):
            return "success_patterns"
        elif any(indicator in content or indicator in obs_type for indicator in resource_indicators):
            return "resource_usage"
        elif any(indicator in content or indicator in obs_type for indicator in performance_indicators):
            return "performance_metrics"
        else:
            return "other"
    
    async def extract_patterns(self) -> List[ObservationPattern]:
        """模式提取器：从分析结果中识别可复用的模式"""
        if not self.analysis_results:
            return self.patterns
        
        # 分析各类别中的模式
        for category in ["error_patterns", "success_patterns", "resource_usage", "performance_metrics"]:
            observations = self.analysis_results.get(category, [])
            if not observations:
                continue
            
            # 简单的频率统计和模式识别
            pattern_description = self._generate_pattern_description(category, observations)
            
            pattern = ObservationPattern(
                pattern_type=category,
                description=pattern_description,
                frequency=len(observations),
                last_seen=datetime.now().isoformat(),
                details={
                    "observation_count": len(observations),
                    "sample_observations": [obs.get('observation_id') for obs in observations[:3]]
                }
            )
            
            # 检查是否已存在类似模式
            existing_pattern = self._find_existing_pattern(pattern)
            if existing_pattern:
                existing_pattern.frequency += pattern.frequency
                existing_pattern.last_seen = pattern.last_seen
            else:
                self.patterns.append(pattern)
        
        # 存入memory的patterns字段
        await self._save_patterns_to_memory()
        
        return self.patterns
    
    def _generate_pattern_description(self, category: str, observations: List[Dict[str, Any]]) -> str:
        """生成模式描述"""
        descriptions = {
            "error_patterns": f"在 {len(observations)} 个观察中发现错误模式",
            "success_patterns": f"在 {len(observations)} 个观察中发现成功模式",
            "resource_usage": f"在 {len(observations)} 个观察中发现资源使用模式",
            "performance_metrics": f"在 {len(observations)} 个观察中发现性能指标模式"
        }
        return descriptions.get(category, f"在 {len(observations)} 个观察中发现模式")
    
    def _find_existing_pattern(self, new_pattern: ObservationPattern) -> Optional[ObservationPattern]:
        """查找已存在的类似模式"""
        for pattern in self.patterns:
            if (pattern.pattern_type == new_pattern.pattern_type and 
                self._patterns_similar(pattern.description, new_pattern.description)):
                return pattern
        return None
    