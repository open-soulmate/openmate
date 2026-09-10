import json
import time
import threading
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from collections import defaultdict
import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer

# 假设的知识库接口
class KnowledgeBase:
    def __init__(self):
        self.observations = []
        self.patterns = []
        self.reports = []
    
    def add_observation(self, observation: Dict[str, Any]):
        self.observations.append(observation)
    
    def add_pattern(self, pattern: Dict[str, Any]):
        self.patterns.append(pattern)
    
    def add_report(self, report: Dict[str, Any]):
        self.reports.append(report)
    
    def get_historical_observations(self) -> List[Dict[str, Any]]:
        return self.observations
    
    def get_patterns(self) -> List[Dict[str, Any]]:
        return self.patterns

@dataclass
class Observation:
    id: str
    description: str
    urgency: float  # 0-10
    impact_range: float  # 0-10
    difficulty: float  # 0-10
    resource_consumption: float  # 0-10
    timestamp: datetime
    status: str = "unanalyzed"
    
    def to_dict(self):
        return asdict(self)

class PriorityScorer:
    """优先级评分算法"""
    WEIGHTS = {
        'urgency': 0.4,
        'impact_range': 0.3,
        'difficulty': 0.2,
        'resource_consumption': 0.1
    }
    
    @classmethod
    def calculate_priority(cls, observation: Observation) -> float:
        """计算单个观察的优先级分数"""
        weighted_score = (
            observation.urgency * cls.WEIGHTS['urgency'] +
            observation.impact_range * cls.WEIGHTS['impact_range'] +
            observation.difficulty * cls.WEIGHTS['difficulty'] +
            observation.resource_consumption * cls.WEIGHTS['resource_consumption']
        )
        
        # 考虑时间衰减因子（较新的观察优先级稍高）
        time_decay = 1.0 / (1.0 + (datetime.now() - observation.timestamp).total_seconds() / 3600)
        
        return weighted_score * (1 + time_decay * 0.1)  # 时间权重占10%
    
    @classmethod
    def prioritize_observations(cls, observations: List[Observation]) -> List[Observation]:
        """对观察列表进行优先级排序"""
        return sorted(observations, 
                     key=lambda obs: cls.calculate_priority(obs),
                     reverse=True)

class PatternMatcher:
    """模式识别模块"""
    
    def __init__(self, knowledge_base: KnowledgeBase):
        self.kb = knowledge_base
        self.vectorizer = TfidfVectorizer(max_features=100)
        self.clusterer = None
        
    def extract_features(self, observations: List[Observation]) -> np.ndarray:
        """从观察中提取特征用于模式识别"""
        descriptions = [obs.description for obs in observations]
        if not descriptions:
            return np.array([])
        
        # 使用TF-IDF提取文本特征
        try:
            tfidf_matrix = self.vectorizer.fit_transform(descriptions)
            return tfidf_matrix.toarray()
        except:
            return np.array([])
    
    def identify_patterns(self, observations: List[Observation], num_clusters: int = 3) -> List[Dict[str, Any]]:
        """识别常见错误模式"""
        if len(observations) < num_clusters:
            return []
        
        features = self.extract_features(observations)
        if len(features) == 0:
            return []
        
        # 使用K-means进行聚类
        self.clusterer = KMeans(n_clusters=min(num_clusters, len(observations)), random_state=42)
        clusters = self.clusterer.fit_predict(features)
        
        # 为每个聚类生成模式
        patterns = []
        for cluster_id in range(num_clusters):
            cluster_observations = [obs for i, obs in enumerate(observations) if clusters[i] == cluster_id]
            
            if not cluster_observations:
                continue
            
            # 提取聚类特征
            common_words = self._extract_common_words(cluster_observations)
            avg_urgency = np.mean([obs.urgency for obs in cluster_observations])
            avg_impact = np.mean([obs.impact_range for obs in cluster_observations])
            
            pattern = {
                'pattern_id': f"pattern_{cluster_id}_{int(time.time())}",
                'cluster_id': cluster_id,
                'common_issues': common_words[:5],  # 前5个常见问题
                'average_urgency': float(avg_urgency),
                'average_impact': float(avg_impact),
                'observation_count': len(cluster_observations),
                'example_observations': [obs.id for obs in cluster_observations[:3]],
                'suggested_solutions': self._generate_solutions(cluster_observations),
                'timestamp': datetime.now().isoformat()
            }
            patterns.append(pattern)
        
        return patterns
    
    def _extract_common_words(self, observations: List[Observation]) -> List[str]:
        """提取观察中的常见词汇"""
        word_freq = defaultdict(int)
        for obs in observations:
            words = obs.description.lower().split()
            for word in words:
                if len(word) > 3:  # 忽略太短的词
                    word_freq[word] += 1
        
        return sorted(word_freq.keys(), key=lambda x: word_freq[x], reverse=True)
    
    def _generate_solutions(self, observations: List[Observation]) -> List[str]:
        """基于历史观察生成解决方案建议"""
        solutions = []
        
        # 检查知识库中是否有类似模式的解决方案
        historical_patterns = self.kb.get_patterns()
        
        # 简单匹配：如果有历史模式，提供类似建议
        if historical_patterns:
            solutions.append("参考历史模式中的解决方案")
            solutions.append("检查已知的错误模式库")
        
        # 基于常见问题的通用建议
        common_words = self._extract_common_words(observations)
        if "timeout" in common_words:
            solutions.append("增加超时时间设置")
            solutions.append("检查网络连接")