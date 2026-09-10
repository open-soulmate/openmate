# acp-proxy/skills/auto_analysis.py
from datetime import datetime
from typing import Dict, List, Any, Optional
import re
from collections import Counter

class AutoAnalysis:
    """自动分析技能，处理未分析的观察并生成洞察"""
    
    UNANALYZED_THRESHOLD = 3  # 未分析观察触发阈值
    
    def __init__(self, context: Any):
        self.context = context
        self.name = "auto_analysis"
        self.description = "批量分析未处理的观察并生成洞察"
    
    async def execute(self) -> str:
        """执行自动分析技能"""
        try:
            # 获取未分析的观察
            unanalyzed_observations = await self._get_unanalyzed_observations()
            
            if len(unanalyzed_observations) < self.UNANALYZED_THRESHOLD:
                return f"未分析的观察数量({len(unanalyzed_observations)})未达到阈值({self.UNANALYZED_THRESHOLD})，跳过分析"
            
            # 分析观察并生成洞察
            insights = await self._analyze_observations(unanalyzed_observations)
            
            # 存储洞察并标记原始观察为已分析
            await self._store_insights(insights)
            await self._mark_observations_analyzed(unanalyzed_observations)
            
            # 生成分析报告
            report = self._generate_report(
                observations_processed=len(unanalyzed_observations),
                insights_generated=len(insights)
            )
            
            return report
            
        except Exception as e:
            return f"自动分析执行失败: {str(e)}"
    
    async def _get_unanalyzed_observations(self) -> List[Dict]:
        """获取所有未分析的观察"""
        try:
            # 尝试通过记忆系统API获取未分析观察
            if hasattr(self.context, 'memories') and hasattr(self.context.memories, 'get_unanalyzed'):
                return await self.context.memories.get_unanalyzed()
            
            # 备选方案：直接查询记忆库
            all_memories = await self.context.memories.get_all()
            return [
                memory for memory in all_memories
                if memory.get('type') == 'observation' and not memory.get('analyzed', False)
            ]
            
        except Exception:
            return []
    
    async def _analyze_observations(self, observations: List[Dict]) -> List[Dict]:
        """分析观察列表并生成洞察"""
        # 1. 去重（基于内容哈希）
        unique_observations = self._deduplicate_observations(observations)
        
        # 2. 按类型/标签聚类
        clusters = self._cluster_observations(unique_observations)
        
        # 3. 提取关键实体和动作
        insights = []
        for cluster_type, cluster_observations in clusters.items():
            # 提取关键实体
            entities = self._extract_entities(cluster_observations)
            
            # 提取关键动作
            actions = self._extract_actions(cluster_observations)
            
            # 生成该聚类的洞察
            if entities or actions:
                insight = {
                    'type': 'insight',
                    'source': 'auto_analysis',
                    'timestamp': datetime.now().isoformat(),
                    'cluster_type': cluster_type,
                    'observation_count': len(cluster_observations),
                    'key_entities': entities,
                    'key_actions': actions,
                    'summary': self._generate_cluster_summary(cluster_type, entities, actions)
                }
                insights.append(insight)
        
        return insights
    
    def _deduplicate_observations(self, observations: List[Dict]) -> List[Dict]:
        """去重观察（基于内容）"""
        seen_contents = set()
        unique_observations = []
        
        for obs in observations:
            content = obs.get('content', '')
            # 简单的内容哈希（实际应用中可使用更复杂的哈希算法）
            content_hash = hash(content.strip().lower())
            
            if content_hash not in seen_contents:
                seen_contents.add(content_hash)
                unique_observations.append(obs)
        
        return unique_observations
    
    def _cluster_observations(self, observations: List[Dict]) -> Dict[str, List[Dict]]:
        """按类型/标签聚类观察"""
        clusters = {}
        
        for obs in observations:
            # 尝试从观察中提取类型
            obs_type = self._extract_observation_type(obs)
            
            if obs_type not in clusters:
                clusters[obs_type] = []
            
            clusters[obs_type].append(obs)
        
        return clusters
    
    def _extract_observation_type(self, observation: Dict) -> str:
        """从观察中提取类型"""
        # 优先使用显式类型
        if 'type' in observation and observation['type'] != 'observation':
            return observation['type']
        
        # 尝试从内容中推断类型
        content = observation.get('content', '').lower()
        
        type_keywords = {
            'event': ['事件', '发生', '事件', '事件'],
            'entity': ['实体', '对象', '人员', '地点'],
            'action': ['动作', '行为', '操作', '执行'],
            'status': ['状态', '情况', '条件', '状态'],
            'thought': ['想法', '思考', '认为', '觉得']
        }
        
        for obs_type, keywords in type_keywords.items():
            for keyword in keywords:
                if keyword in content:
                    return obs_type
        
        # 默认返回通用类型
        return 'general'
    
    def _extract_entities(self, observations: List[Dict]) -> List[str]:
        """从观察列表中提取关键实体"""
        all_entities = []
        
        for obs in observations:
            content = obs.get('content', '')
            entities = self._extract_entities_from_text(content)
            all_entities.extend(entities)
        
        # 统计并返回最常见的实体
        entity_counter = Counter(all_entities)
        most_common = entity_counter.most_common(5)  # 返回前5个最常见实体
        
        return [entity for entity, count in most_common]
    
    def _extract_entities_from_text(self, text: str) -> List[str]:
        """从文本中提取实体（简单实现）"""
        # 这里使用简单的正则表达式提取可能实体