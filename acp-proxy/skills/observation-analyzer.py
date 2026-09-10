import json
import time
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from collections import defaultdict
import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer

class PriorityScorer:
    """基于加权评分算法的观察优先级评估器"""
    
    def __init__(self):
        # 权重配置：紧急度0.4，影响范围0.3，解决难度0.2，资源消耗0.1
        self.weights = {
            'urgency': 0.4,
            'impact': 0.3,
            'difficulty': 0.2,
            'resource': 0.1
        }
    
    def calculate_priority(self, observation: Dict[str, Any]) -> float:
        """计算单个观察的优先级分数"""
        score = 0.0
        
        # 计算各维度得分（标准化到0-1范围）
        urgency_score = min(observation.get('urgency', 0) / 10.0, 1.0)
        impact_score = min(observation.get('impact', 0) / 10.0, 1.0)
        difficulty_score = 1.0 - min(observation.get('difficulty', 0) / 10.0, 1.0)  # 难度越低分数越高
        resource_score = 1.0 - min(observation.get('resource_consumption', 0) / 10.0, 1.0)  # 资源消耗越低分数越高
        
        # 加权求和
        score = (
            self.weights['urgency'] * urgency_score +
            self.weights['impact'] * impact_score +
            self.weights['difficulty'] * difficulty_score +
            self.weights['resource'] * resource_score
        )
        
        return round(score, 3)
    
    def rank_observations(self, observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """对观察列表进行优先级排序"""
        # 计算每个观察的优先级分数
        scored_obs = []
        for obs in observations:
            obs_copy = obs.copy()
            obs_copy['priority_score'] = self.calculate_priority(obs)
            scored_obs.append(obs_copy)
        
        # 按分数降序排序
        ranked = sorted(scored_obs, key=lambda x: x['priority_score'], reverse=True)
        
        # 添加排名
        for i, obs in enumerate(ranked):
            obs['rank'] = i + 1
        
        return ranked


class PatternMatcher:
    """模式识别模块，基于历史观察数据进行聚类分析"""
    
    def __init__(self):
        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        self.kmeans = None
        self.pattern_labels = {}
        self.common_patterns = []
    
    def extract_features(self, observations: List[Dict[str, Any]]) -> np.ndarray:
        """从观察中提取特征用于聚类"""
        texts = []
        for obs in observations:
            # 组合多个字段作为文本特征
            text_parts = [
                obs.get('description', ''),
                obs.get('category', ''),
                obs.get('error_type', ''),
                str(obs.get('components', []))
            ]
            texts.append(' '.join(filter(None, text_parts)))
        
        # 转换为TF-IDF向量
        if texts:
            return self.vectorizer.fit_transform(texts).toarray()
        return np.array([])
    
    def identify_patterns(self, observations: List[Dict[str, Any]], n_clusters: int = 3) -> List[Dict[str, Any]]:
        """识别常见错误模式"""
        if len(observations) < n_clusters:
            return []
        
        features = self.extract_features(observations)
        
        if features.size == 0:
            return []
        
        # 执行K-means聚类
        self.kmeans = KMeans(n_clusters=min(n_clusters, len(observations)), random_state=42, n_init=10)
        clusters = self.kmeans.fit_predict(features)
        
        # 分析每个聚类
        patterns = []
        cluster_data = defaultdict(list)
        
        for idx, cluster_id in enumerate(clusters):
            cluster_data[cluster_id].append(observations[idx])
        
        for cluster_id, cluster_obs in cluster_data.items():
            if len(cluster_obs) >= 2:  # 至少2个观察才能构成模式
                pattern = self._analyze_cluster(cluster_obs, cluster_id)
                patterns.append(pattern)
                self.common_patterns.append(pattern)
        
        return patterns
    
    def _analyze_cluster(self, observations: List[Dict[str, Any]], cluster_id: int) -> Dict[str, Any]:
        """分析单个聚类，提取模式信息"""
        # 计算聚类中心
        texts = [obs.get('description', '') for obs in observations]
        if texts:
            cluster_vectors = self.vectorizer.transform(texts).toarray()
            cluster_center = np.mean(cluster_vectors, axis=0)
        
        # 提取共同特征
        common_categories = self._find_common_elements([obs.get('category', '') for obs in observations])
        common_errors = self._find_common_elements([obs.get('error_type', '') for obs in observations])
        
        # 计算平均特征
        avg_urgency = np.mean([obs.get('urgency', 0) for obs in observations])
        avg_impact = np.mean([obs.get('impact', 0) for obs in observations])
        
        # 生成解决方案模板
        solutions = self._generate_solutions_template(observations)
        
        return {
            'pattern_id': f'PATTERN_{cluster_id}_{int(time.time())}',
            'cluster_id': cluster_id,
            'frequency': len(observations),
            'common_categories': common_categories,
            'common_errors': common_errors,
            'average_urgency': round(float(avg_urgency), 2),
            'average_impact': round(float(avg_impact), 2),
            'solutions': solutions,
            'example_observations': [obs.get('id') for obs in observations[:3]],
            'timestamp': datetime.now().isoformat()
        }
    
    def _find_common_elements(self, items: List[str]) -> List[str]:
        """找出常见元素"""
        if not items:
            return []
        
        # 计算频率
        counter = defaultdict(int)
        for item in items:
            if item:
                counter[item] += 1
        
        # 返回出现次数超过一半的元素
        threshold = len(items) / 2
        return [item for item, count in counter.items() if count >= threshold]
    
    def _generate_solutions_template(self, observations: List[Dict[str, Any]]) -> List[str]:
        """基于历史观察生成解决方案模板"""
        solutions = set()
        
        for obs in observations:
            if 'resolution' in obs:
                solutions.add(obs['resolution'])
            if 'suggested_action' in obs:
                solutions.add(obs['suggested_action'])
        
        return list(solutions)[:5]  # 最多返回5个解决方案
    
    def get_pattern_suggestions(self, new_observation: Dict[str, Any]) -> List[str]:
        """基于新模式匹配提供建议"""
        suggestions = []
        
        # 检查是否匹配已知模式
        for pattern in self.common_patterns:
            if self._matches_pattern(new_observation, pattern):
                suggestions.extend(pattern.get('solutions', []))
        
        return list(set(suggestions))
    
    def _matches_pattern(self, observation: Dict[str, Any], pattern: Dict[str, Any]) -> bool:
        """检查观察是否匹配特定模式"""
        # 简单匹配逻辑：类别和错误类型匹配
        obs_category = observation.get('category', '')
        obs_error = observation.get('error_type', '')
        