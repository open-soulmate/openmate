# acp-proxy/skills/auto_analysis.py

import datetime
from typing import List, Dict, Any, Optional
from collections import defaultdict
import hashlib
import json

# 假设存在以下基类和API（需根据实际项目调整）
# from .base_skill import BaseSkill
# from ..memory import MemorySystem

class AutoAnalysisSkill:
    """自动分析技能，用于处理过量的observations并转化为insights"""
    
    # 触发阈值配置
    UNANALYZED_THRESHOLD = 3
    
    def __init__(self, context: Any):
        """
        初始化技能
        
        Args:
            context: 包含记忆系统等上下文的对象
        """
        self.context = context
        self.memory_system = context.memories
        
    def execute(self) -> str:
        """
        执行自动分析技能
        
        Returns:
            str: 分析报告
        """
        try:
            # 检查未分析观察数量是否达到阈值
            unanalyzed_observations = self._get_unanalyzed_observations()
            
            if len(unanalyzed_observations) < self.UNANALYZED_THRESHOLD:
                return f"未达到分析阈值（当前：{len(unanalyzed_observations)}，阈值：{self.UNANALYZED_THRESHOLD}）"
            
            # 执行批量分析
            analysis_results = self._batch_analysis(unanalyzed_observations)
            
            # 生成insights并存储
            insights = self._generate_insights(analysis_results)
            stored_count = self._store_insights(insights)
            
            # 标记原始观察为已分析
            self._mark_observations_as_analyzed(unanalyzed_observations)
            
            # 生成报告
            report = self._generate_report(
                observation_count=len(unanalyzed_observations),
                insight_count=len(insights)
            )
            
            return report
            
        except Exception as e:
            return f"自动分析执行失败: {str(e)}"
    
    def _get_unanalyzed_observations(self) -> List[Dict[str, Any]]:
        """获取所有未分析的观察"""
        # 假设记忆系统有类似API
        if hasattr(self.memory_system, 'get_unanalyzed'):
            return self.memory_system.get_unanalyzed()
        
        # 备选方案：通过过滤获取
        all_memories = self.memory_system.get_all() if hasattr(self.memory_system, 'get_all') else []
        return [m for m in all_memories if not m.get('analyzed', False) and m.get('type') == 'observation']
    
    def _batch_analysis(self, observations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        批量分析观察
        
        Args:
            observations: 观察列表
            
        Returns:
            Dict: 分析结果
        """
        analysis_results = {
            'deduplicated': [],
            'clusters': defaultdict(list),
            'entities': set(),
            'actions': set()
        }
        
        # 1. 去重（基于内容哈希）
        seen_hashes = set()
        for obs in observations:
            content_hash = self._hash_content(obs.get('content', ''))
            if content_hash not in seen_hashes:
                seen_hashes.add(content_hash)
                analysis_results['deduplicated'].append(obs)
        
        # 2. 按类型/标签聚类
        for obs in analysis_results['deduplicated']:
            # 优先按标签聚类，其次按类型
            if 'tags' in obs and obs['tags']:
                cluster_key = ','.join(obs['tags'])
            else:
                cluster_key = obs.get('type', 'untagged')
            
            analysis_results['clusters'][cluster_key].append(obs)
        
        # 3. 提取关键实体和动作（简化版）
        for obs in analysis_results['deduplicated']:
            content = obs.get('content', '')
            entities, actions = self._extract_entities_and_actions(content)
            analysis_results['entities'].update(entities)
            analysis_results['actions'].update(actions)
        
        return analysis_results
    
    def _generate_insights(self, analysis_results: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        基于分析结果生成洞察
        
        Args:
            analysis_results: 分析结果
            
        Returns:
            List: 洞察列表
        """
        insights = []
        
        # 生成聚类洞察
        for cluster_key, cluster_obs in analysis_results['clusters'].items():
            if len(cluster_obs) > 1:  # 只处理有多个观察的聚类
                insight_content = f"发现{len(cluster_obs)}条相关观察（类别：{cluster_key}）"
                
                # 提取共同特征
                common_tags = set.intersection(*[set(obs.get('tags', [])) for obs in cluster_obs]) if cluster_obs else set()
                if common_tags:
                    insight_content += f"，共同标签：{', '.join(common_tags)}"
                
                # 添加到洞察
                insights.append({
                    'type': 'insight',
                    'source': 'auto_analysis',
                    'content': insight_content,
                    'timestamp': datetime.datetime.now().isoformat(),
                    'cluster_key': cluster_key,
                    'related_observations': [obs.get('id') for obs in cluster_obs if 'id' in obs]
                })
        
        # 生成实体和动作洞察
        if analysis_results['entities']:
            insights.append({
                'type': 'insight',
                'source': 'auto_analysis',
                'content': f"发现关键实体：{', '.join(list(analysis_results['entities'])[:10])}",
                'timestamp': datetime.datetime.now().isoformat(),
                'entity_count': len(analysis_results['entities'])
            })
        
        if analysis_results['actions']:
            insights.append({
                'type': 'insight',
                'source': 'auto_analysis',
                'content': f"发现关键动作：{', '.join(list(analysis_results['actions'])[:10])}",
                'timestamp': datetime.datetime.now().isoformat(),
                'action_count': len(analysis_results['actions'])
            })
        
        return insights
    
    def _store_insights(self, insights: List[Dict[str, Any]]) -> int:
        """
        存储洞察到记忆系统
        
        Args:
            insights: 洞察列表
            
        Returns:
            int: 成功存储的数量
        """
        stored_count = 0
        
        for insight in insights:
            if hasattr(self.memory_system, 'add'):
                self.memory_system.add(insight)
                stored_count += 1