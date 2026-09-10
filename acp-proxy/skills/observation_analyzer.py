from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory.manager import MemoryManager


@dataclass
class Pattern:
    """观察模式数据结构"""
    pattern_type: str
    description: str
    frequency: int
    last_seen: str


class ObservationAnalyzer(BaseSkill):
    """观察分析优化技能，用于分析观察数据并提取可复用模式"""
    
    # 可配置的分析阈值
    UNANALYZED_THRESHOLD = 2
    
    def __init__(self, memory_manager: MemoryManager, config: Optional[Dict[str, Any]] = None):
        """初始化观察分析器
        
        Args:
            memory_manager: 记忆管理器实例
            config: 配置字典，可包含自定义阈值等配置
        """
        super().__init__()
        self.memory = memory_manager
        
        # 应用配置
        if config:
            self.UNANALYZED_THRESHOLD = config.get('unanalyzed_threshold', self.UNANALYZED_THRESHOLD)
        
        # 确保patterns字段存在
        if 'patterns' not in self.memory.get_all():
            self.memory.set('patterns', [])
        
        # 确保observations字段存在
        if 'observations' not in self.memory.get_all():
            self.memory.set('observations', [])
    
    def monitor_unanalyzed(self) -> Dict[str, Any]:
        """监控未分析观察数量
        
        Returns:
            监控结果，包含是否需要处理的状态
        """
        observations = self.memory.get('observations', [])
        unanalyzed_count = sum(1 for obs in observations if not obs.get('analyzed', False))
        
        needs_attention = unanalyzed_count > self.UNANALYZED_THRESHOLD
        
        return {
            'unanalyzed_count': unanalyzed_count,
            'threshold': self.UNANALYZED_THRESHOLD,
            'needs_attention': needs_attention,
            'timestamp': datetime.now().isoformat()
        }
    
    def auto_analyze(self) -> List[Dict[str, Any]]:
        """自动分析未分析的观察，进行分类
        
        Returns:
            分析结果列表，每个结果包含分析后的观察数据
        """
        observations = self.memory.get('observations', [])
        analysis_results = []
        
        for obs in observations:
            if not obs.get('analyzed', False):
                # 分析观察并分类
                analysis = self._analyze_observation(obs)
                obs.update(analysis)
                obs['analyzed'] = True
                obs['analysis_timestamp'] = datetime.now().isoformat()
                analysis_results.append(obs)
        
        # 更新记忆
        self.memory.set('observations', observations)
        
        return analysis_results
    
    def _analyze_observation(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        """分析单个观察并分类
        
        Args:
            observation: 待分析的观察数据
            
        Returns:
            分析结果，包含分类和分析详情
        """
        content = observation.get('content', '')
        category = observation.get('category', 'unknown')
        
        # 基于内容特征的简单分类逻辑（实际应用中可能需要更复杂的分析）
        if any(keyword in content.lower() for keyword in ['error', 'fail', 'exception', 'crash']):
            analysis_type = 'error_pattern'
        elif any(keyword in content.lower() for keyword in ['success', 'complete', 'achieve']):
            analysis_type = 'success_pattern'
        elif any(keyword in content.lower() for keyword in ['memory', 'cpu', 'resource', 'usage']):
            analysis_type = 'resource_usage'
        elif any(keyword in content.lower() for keyword in ['time', 'latency', 'performance', 'slow']):
            analysis_type = 'performance_metric'
        else:
            analysis_type = 'general'
        
        return {
            'analysis_type': analysis_type,
            'confidence': 0.8,  # 示例置信度
            'keywords': self._extract_keywords(content)
        }
    
    def _extract_keywords(self, text: str) -> List[str]:
        """从文本中提取关键词（简化实现）
        
        Args:
            text: 输入文本
            
        Returns:
            提取的关键词列表
        """
        # 简单实现：按空格分割并过滤短词
        words = text.lower().split()
        keywords = [word for word in words if len(word) > 3][:5]
        return keywords
    
    def extract_patterns(self) -> List[Dict[str, Any]]:
        """从分析结果中识别可复用的模式
        
        Returns:
            提取的模式列表
        """
        observations = self.memory.get('observations', [])
        patterns = self.memory.get('patterns', [])
        
        # 统计模式频率
        pattern_stats = {}
        current_time = datetime.now().isoformat()
        
        for obs in observations:
            if obs.get('analyzed', False):
                analysis_type = obs.get('analysis_type', 'unknown')
                
                if analysis_type not in pattern_stats:
                    pattern_stats[analysis_type] = {
                        'count': 0,
                        'descriptions': [],
                        'last_seen': current_time
                    }
                
                pattern_stats[analysis_type]['count'] += 1
                if obs.get('content'):
                    pattern_stats[analysis_type]['descriptions'].append(obs['content'][:100])
                pattern_stats[analysis_type]['last_seen'] = current_time
        
        # 创建或更新模式
        for pattern_type, stats in pattern_stats.items():
            existing_pattern = next(
                (p for p in patterns if p.get('pattern_type') == pattern_type), 
                None
            )
            
            if existing_pattern:
                existing_pattern['frequency'] += stats['count']
                existing_pattern['last_seen'] = current_time
                if stats['descriptions']:
                    existing_pattern['description'] = f"包含 {len(stats['descriptions'])} 个相关观察"
            else:
                new_pattern = Pattern(
                    pattern_type=pattern_type,
                    description=f"新发现的{pattern_type}模式，包含 {stats['count']} 个观察",
                    frequency=stats['count'],
                    last_seen=current_time
                )
                patterns.append(asdict(new_pattern))
        
        # 更新记忆
        self.memory.set('patterns', patterns)
        
        return patterns
    
    def link_to_knowledge(self) -> Dict[str, Any]:
        """将分析结果关联到知识积累目标
        
        Returns:
            关联结果，包含更新的目标进度
        """
        patterns = self.memory.get('patterns', [])
        goals = self.memory.get('goals', {})
        
        # 查找或创建知识积累目标
        if 'knowledge_accumulation' not in goals:
            goals['knowledge_accumulation'] = {
                'target': 100,  # 示例目标
                'progress': 0,
                'patterns_learned': [],
                'last_updated': datetime.now().isoformat()
            }
        
        goal = goals['knowledge_accumulation']
        
        # 更新目标进度：每个模式贡献10点进度
        new_patterns = [p for p in patterns if p['pattern_type'] not in goal['patterns_learned']]
        progress_increment = len(new_patterns) * 10
        