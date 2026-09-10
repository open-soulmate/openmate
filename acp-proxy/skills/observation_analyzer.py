import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from collections import defaultdict

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory.manager import MemoryManager

logger = logging.getLogger(__name__)


class ObservationAnalyzer(BaseSkill):
    """
    观察分析优化技能
    解决观察数据未被有效分析的问题
    """
    
    def __init__(self, memory_manager: MemoryManager, **kwargs):
        """
        初始化观察分析器
        
        Args:
            memory_manager: 记忆管理器实例
            **kwargs: 其他配置参数
        """
        super().__init__(**kwargs)
        self.memory_manager = memory_manager
        self.UNANALYZED_THRESHOLD = kwargs.get('UNANALYZED_THRESHOLD', 2)
        
        # 模式分类映射
        self.pattern_categories = {
            'error': ['error', 'failure', 'exception', 'crash', 'bug'],
            'success': ['success', 'achievement', 'completion', 'milestone'],
            'resource': ['memory', 'cpu', 'disk', 'network', 'database'],
            'performance': ['speed', 'latency', 'throughput', 'response_time']
        }
        
    async def monitor_unanalyzed(self) -> Dict[str, Any]:
        """
        阈值监控器：追踪未分析观察数量
        
        Returns:
            监控结果字典，包含未分析数量和是否需要处理
        """
        observations = await self.memory_manager.get('observations', [])
        unanalyzed = [obs for obs in observations if not obs.get('analyzed', False)]
        
        result = {
            'total_observations': len(observations),
            'unanalyzed_count': len(unanalyzed),
            'needs_processing': len(unanalyzed) > self.UNANALYZED_THRESHOLD,
            'unanalyzed_ids': [obs.get('id') for obs in unanalyzed]
        }
        
        if result['needs_processing']:
            logger.warning(f"检测到 {len(unanalyzed)} 条未分析观察，超过阈值 {self.UNANALYZED_THRESHOLD}")
        
        return result
    
    async def auto_analyze(self, observations: Optional[List[Dict]] = None) -> List[Dict]:
        """
        自动分析器：对未分析的观察进行分类
        
        Args:
            observations: 待分析观察列表，None则从memory获取
            
        Returns:
            分析结果列表
        """
        if observations is None:
            observations = await self.memory_manager.get('observations', [])
        
        unanalyzed = [obs for obs in observations if not obs.get('analyzed', False)]
        analysis_results = []
        
        for obs in unanalyzed:
            analysis = {
                'observation_id': obs.get('id'),
                'timestamp': obs.get('timestamp', datetime.now().isoformat()),
                'original_content': obs.get('content', ''),
                'analysis_timestamp': datetime.now().isoformat(),
                'category': self._classify_observation(obs),
                'keywords': self._extract_keywords(obs.get('content', '')),
                'sentiment': self._analyze_sentiment(obs.get('content', '')),
                'confidence': 0.8  # 分析置信度
            }
            
            # 标记为已分析
            obs['analyzed'] = True
            obs['analysis'] = analysis
            
            analysis_results.append(analysis)
        
        # 更新memory中的observations
        if unanalyzed:
            await self.memory_manager.update('observations', observations)
            logger.info(f"自动分析了 {len(unanalyzed)} 条观察记录")
        
        return analysis_results
    
    async def extract_patterns(self, analysis_results: Optional[List[Dict]] = None) -> List[Dict]:
        """
        模式提取器：从分析结果中识别可复用的模式
        
        Args:
            analysis_results: 分析结果列表，None则自动分析
            
        Returns:
            提取的模式列表
        """
        if analysis_results is None:
            analysis_results = await self.auto_analyze()
        
        patterns = []
        pattern_groups = defaultdict(list)
        
        # 按类别和关键词分组
        for result in analysis_results:
            category = result.get('category', 'unknown')
            keywords = result.get('keywords', [])
            
            # 基于关键词创建模式
            for keyword in keywords:
                pattern_key = f"{category}_{keyword}"
                pattern_groups[pattern_key].append(result)
        
        # 为每个模式组创建模式对象
        for pattern_key, group in pattern_groups.items():
            if len(group) >= 2:  # 至少出现两次才算模式
                category, keyword = pattern_key.split('_', 1)
                
                pattern = {
                    'pattern_type': category,
                    'description': f"观察到 {category} 模式，涉及 {keyword}",
                    'frequency': len(group),
                    'last_seen': max(r.get('timestamp', '') for r in group),
                    'first_seen': min(r.get('timestamp', '') for r in group),
                    'related_observations': [r.get('observation_id') for r in group],
                    'created_at': datetime.now().isoformat()
                }
                patterns.append(pattern)
        
        # 存储到memory的patterns字段
        existing_patterns = await self.memory_manager.get('patterns', [])
        all_patterns = existing_patterns + patterns
        await self.memory_manager.update('patterns', all_patterns)
        
        logger.info(f"提取了 {len(patterns)} 个新模式")
        return patterns
    
    async def link_to_knowledge(self, analysis_results: List[Dict], goal_id: Optional[str] = None) -> Dict:
        """
        知识关联器：将分析结果关联到知识积累目标
        
        Args:
            analysis_results: 分析结果列表
            goal_id: 目标ID，None则自动查找知识积累目标
            
        Returns:
            关联结果和进度更新
        """
        # 获取或创建知识积累目标
        if goal_id is None:
            goals = await self.memory_manager.get('goals', [])
            knowledge_goals = [g for g in goals if '知识' in g.get('name', '') or 'learning' in g.get('name', '').lower()]
            
            if knowledge_goals:
                goal_id = knowledge_goals[0].get('id')
            else:
                # 创建新的知识积累目标
                goal_id = f"knowledge_{datetime.now().strftime('%Y%m%d_%H%M%S')}"