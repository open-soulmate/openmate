from typing import Dict, List, Any, Optional
from datetime import datetime
import logging
from .base import BaseSkill
from ..memory.manager import MemoryManager

class ObservationAnalyzer(BaseSkill):
    """观察分析优化技能"""
    
    def __init__(self, memory_manager: MemoryManager, planning_loop=None):
        super().__init__(
            name="observation_analyzer",
            description="观察分析优化技能，解决观察数据未被有效分析的问题"
        )
        self.memory_manager = memory_manager
        self.planning_loop = planning_loop
        self.unanalyzed_threshold = 2  # 默认阈值，可通过configure()修改
        self.logger = logging.getLogger(__name__)
        
    def configure(self, **kwargs):
        """配置技能参数"""
        if 'unanalyzed_threshold' in kwargs:
            self.unanalyzed_threshold = kwargs['unanalyzed_threshold']
            
    def monitor_unanalyzed(self) -> Dict[str, Any]:
        """阈值监控器：追踪未分析观察数量"""
        observations = self.memory_manager.get_memory().get('observations', [])
        unanalyzed = [obs for obs in observations if not obs.get('analyzed', False)]
        count = len(unanalyzed)
        
        needs_processing = count > self.unanalyzed_threshold
        status = {
            'total_observations': len(observations),
            'unanalyzed_count': count,
            'threshold': self.unanalyzed_threshold,
            'needs_processing': needs_processing,
            'timestamp': datetime.now().isoformat()
        }
        
        self.logger.info(f"监控未分析观察: {count}条，阈值: {self.unanalyzed_threshold}, 需要处理: {needs_processing}")
        return status
        
    def auto_analyze(self) -> List[Dict[str, Any]]:
        """自动分析器：对未分析的观察进行分类"""
        observations = self.memory_manager.get_memory().get('observations', [])
        unanalyzed = [obs for obs in observations if not obs.get('analyzed', False)]
        
        analysis_results = []
        for obs in unanalyzed:
            category = self._categorize_observation(obs)
            analyzed_obs = {
                **obs,
                'analyzed': True,
                'analysis_category': category,
                'analyzed_at': datetime.now().isoformat()
            }
            analysis_results.append(analyzed_obs)
            
            # 更新memory中的观察
            self._update_observation_in_memory(obs, analyzed_obs)
            
        self.logger.info(f"自动分析了 {len(analysis_results)} 条观察")
        return analysis_results
        
    def _categorize_observation(self, observation: Dict[str, Any]) -> str:
        """根据观察内容进行分类"""
        content = observation.get('content', '').lower()
        metrics = observation.get('metrics', {})
        
        # 错误模式检测
        error_keywords = ['error', 'failure', 'crash', 'exception', 'failed', 'issue']
        if any(keyword in content for keyword in error_keywords):
            return 'error_pattern'
            
        # 成功模式检测
        success_keywords = ['success', 'completed', 'achieved', 'passed', 'good']
        if any(keyword in content for keyword in success_keywords):
            return 'success_pattern'
            
        # 资源使用检测
        if metrics.get('cpu_usage') or metrics.get('memory_usage') or metrics.get('disk_usage'):
            return 'resource_usage'
            
        # 性能指标检测
        if metrics.get('response_time') or metrics.get('throughput') or metrics.get('latency'):
            return 'performance_metrics'
            
        return 'unclassified'
        
    def extract_patterns(self) -> List[Dict[str, Any]]:
        """模式提取器：从分析结果中识别可复用的模式"""
        observations = self.memory_manager.get_memory().get('observations', [])
        analyzed = [obs for obs in observations if obs.get('analyzed', False)]
        
        patterns = []
        category_groups = {}
        
        # 按类别分组分析
        for obs in analyzed:
            category = obs.get('analysis_category', 'unclassified')
            if category not in category_groups:
                category_groups[category] = []
            category_groups[category].append(obs)
            