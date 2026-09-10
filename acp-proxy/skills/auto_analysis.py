import datetime
from typing import List, Dict, Any

class Skill:
    UNANALYZED_THRESHOLD = 3
    SKILL_NAME = "auto_analysis"
    
    def __init__(self, context):
        self.context = context
    
    def execute(self, **kwargs) -> str:
        """
        主执行函数，检查未分析观察并处理
        """
        try:
            # 获取未分析的观察
            unanalyzed = self._get_unanalyzed_observations()
            
            # 检查是否达到阈值
            if len(unanalyzed) < self.UNANALYZED_THRESHOLD:
                return f"未分析观察数量({len(unanalyzed)})未达到阈值({self.UNANALYZED_THRESHOLD})，跳过处理"
            
            # 执行分析
            insights = self._analyze_observations(unanalyzed)
            
            # 存储洞察到记忆系统
            stored_count = self._store_insights(insights)
            
            # 标记原始观察为已分析
            self._mark_observations_as_analyzed(unanalyzed)
            
            # 生成分析报告
            return self._generate_report(len(unanalyzed), stored_count)
            
        except Exception as e:
            return f"自动分析技能执行失败: {str(e)}"
    
    def _get_unanalyzed_observations(self) -> List[Dict[str, Any]]:
        """获取所有未分析的观察"""
        try:
            # 尝试使用不同的记忆系统API
            if hasattr(self.context.memories, 'get_unanalyzed'):
                return self.context.memories.get_unanalyzed()
            elif hasattr(self.context.memories, 'query'):
                # 备用查询方法
                return self.context.memories.query(
                    status="unanalyzed",
                    memory_type="observation",
                    limit=1000  # 设置上限避免内存问题
                )
            else:
                # 最终回退：假设有一个通用获取方法
                return getattr(self.context.memories, 'observations', [])
        except Exception as e:
            raise RuntimeError(f"获取未分析观察失败: {str(e)}")
    
    def _analyze_observations(self, observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        批量分析观察并提取洞察
        1. 去重
        2. 按类型/标签聚类
        3. 提取关键实体和动作
        """
        # 1. 去重 - 基于内容相似性（简单哈希比较）
        unique_observations = self._deduplicate_observations(observations)
        
        # 2. 按类型/标签聚类
        clustered = self._cluster_observations(unique_observations)
        
        # 3. 从聚类中提取洞察
        insights = []
        for cluster_type, cluster_items in clustered.items():
            # 尝试提取关键实体和动作
            insight = self._extract_insight_from_cluster(cluster_type, cluster_items)
            if insight:
                insights.append(insight)
        
        return insights
    
    def _deduplicate_observations(self, observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """去重观察"""
        seen_hashes = set()
        unique = []
        
        for obs in observations:
            # 创建内容哈希（简化实现）
            content_str = str(obs.get('content', ''))
            content_hash = hash(content_str)
            
            if content_hash not in seen_hashes:
                seen_hashes.add(content_hash)
                unique.append(obs)
        
        return unique
    
    def _cluster_observations(self, observations: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """按类型或标签聚类观察"""
        clusters = {}
        
        for obs in observations:
            # 确定聚类键
            cluster_key = obs.get('type', 'unknown')
            
            # 如果类型未知，尝试使用第一个标签
            if cluster_key == 'unknown':
                tags = obs.get('tags', [])
                if tags:
                    cluster_key = tags[0]
            
            # 添加到聚类
            if cluster_key not in clusters:
                clusters[cluster_key] = []
            clusters[cluster_key].append(obs)
        
        return clusters
    
    def _extract_insight_from_cluster(self, cluster_type: str, observations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """从观察聚类中提取洞察"""
        # 简单提取逻辑：聚类中的共同模式
        common_entities = set()
        common_actions = set()
        
        # 简单的实体和动作提取（基于标签和内容关键词）
        for obs in observations:
            # 提取标签作为实体候选
            tags = obs.get('tags', [])
            common_entities.update(tags)
            
            # 简单的动作词提取（从内容中）
            content = obs.get('content', '')
            action_words = self._extract_action_words(content)
            common_actions.update(action_words)
        
        # 创建洞察内容
        insight_content = {
            'cluster_type': cluster_type,
            'observation_count': len(observations),
            'common_entities': list(common_entities)[:5],  # 限制数量
            'common_actions': list(common_actions)[:3],
            'time_range': self._get_time_range(observations),
            'summary': f"对{len(observations)}个{cluster_type}类型观察的聚类分析"
        }
        
        return {
            'type': 'insight',
            'content': insight_content,
            'source': 'auto_analysis',
            'timestamp': datetime.datetime.now().isoformat(),
            'metadata': {
                'analysis_method': 'batch_clustering',
                'confidence': 0.7,  # 置信度分数
                'related_observations': [obs.get('id') for obs in observations[:5]]  # 关联的前5个观察
            }
        }
    
    def _extract_action_words(self, text: str) -> set:
        """简单提取动作词（示例实现）"""
        action_keywords = {'创建', '删除', '修改', '更新', '获取', '发送', '接收', '分析', '处理', '执行'}
        found_actions = set()
        