"""
观察实时分析技能
解决未观察分析积压问题，提供实时数据输入和自修复触发
"""
import asyncio
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple
import json
import numpy as np
from abc import ABC, abstractmethod
import logging
from concurrent.futures import ThreadPoolExecutor
import threading

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ObservationType(Enum):
    """观察类型枚举"""
    SYSTEM_LOG = "system_log"
    USER_INTERACTION = "user_interaction"
    TASK_RESULT = "task_result"
    PERFORMANCE_METRIC = "performance_metric"
    ERROR_REPORT = "error_report"
    RESOURCE_USAGE = "resource_usage"
    UNDEFINED = "undefined"


@dataclass
class AnalysisTemplate:
    """观察数据分析模板"""
    extraction_fields: List[str] = field(default_factory=lambda: [
        "timestamp", "source", "type", "content", "severity",
        "error_code", "duration", "memory_usage", "cpu_usage",
        "user_id", "session_id", "task_id", "success", "pattern"
    ])
    
    categories: Dict[str, List[str]] = field(default_factory=lambda: {
        "error_pattern": ["error_code", "error_message", "stack_trace", "frequency"],
        "success_pattern": ["success_rate", "performance_metrics", "optimization_opportunities"],
        "user_preference": ["user_feedback", "interaction_pattern", "preference_score"],
        "system_health": ["resource_usage", "response_time", "availability"],
        "anomaly": ["deviation_score", "anomaly_type", "confidence"]
    })
    
    def extract_features(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        """根据模板提取观察数据的特征"""
        features = {}
        
        for field in self.extraction_fields:
            features[field] = observation.get(field, None)
        
        # 提取分类特征
        for category, fields in self.categories.items():
            category_features = {}
            for f in fields:
                if f in observation:
                    category_features[f] = observation[f]
            
            if category_features:
                features[f"_category_{category}"] = category_features
        
        return features


@dataclass
class ProcessingQueue:
    """处理队列管理器"""
    max_length: int = 1000
    timeout_seconds: int = 30
    queue: deque = field(default_factory=deque)
    last_process_time: float = field(default_factory=time.time)
    
    def enqueue(self, item: Dict[str, Any], priority: int = 0) -> bool:
        """将项目添加到队列，返回是否成功"""
        if len(self.queue) >= self.max_length:
            # 移除最低优先级的项（如果是先进先出，则移除队列头部）
            if self.queue and self.queue[0]['priority'] <= priority:
                self.queue.popleft()
                logger.warning("队列已满，移除最低优先级项")
            else:
                logger.warning("队列已满，无法添加新项")
                return False
        
        self.queue.append({
            'item': item,
            'priority': priority,
            'timestamp': time.time()
        })
        return True
    
    def dequeue_batch(self, batch_size: int = 100) -> List[Dict[str, Any]]:
        """批量出队"""
        batch = []
        count = 0
        
        while self.queue and count < batch_size:
            item = self.queue.popleft()
            
            # 检查是否超时
            if time.time() - item['timestamp'] > self.timeout_seconds:
                logger.warning("队列项超时，丢弃")
                continue
            
            batch.append(item)
            count += 1
        
        self.last_process_time = time.time()
        return batch
    
    @property
    def backlog_count(self) -> int:
        """返回队列积压数量"""
        return len(self.queue)
    
    @property
    def is_empty(self) -> bool:
        """检查队列是否为空"""
        return len(self.queue) == 0


class MemorySystemInterface(ABC):
    """记忆系统接口"""
    @abstractmethod
    def write_to_memory(self, category: str, key: str, data: Any, metadata: Dict[str, Any] = None) -> bool:
        """写入长期记忆"""
        pass
    
    @abstractmethod
    def read_from_memory(self, category: str, key: str) -> Optional[Any]:
        """从长期记忆读取"""
        pass
    
    @abstractmethod
    def search_memory(self, category: str, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        """搜索记忆"""
        pass


class StructuredMemoryStore:
    """结构化内存存储"""
    def __init__(self):
        self.storage = defaultdict(dict)
        self.indexes = defaultdict(dict)
        self.lock = threading.RLock()
    
    def store(self, category: str, data: Dict[str, Any], observation_id: str) -> bool:
        """存储结构化数据"""
        with self.lock:
            if category not in self.storage:
                self.storage[category] = {}
            
            self.storage[category][observation_id] = {
                'data': data,
                'timestamp': datetime.now().isoformat(),
                'metadata': {
                    'observation_id': observation_id,
                    'category': category
                }
            }
            
            # 创建索引
            self._update_indexes(category, observation_id, data)
            
            return True
    
    def _update_indexes(self, category: str, observation_id: str, data: Dict[str, Any]):
        """更新索引"""
        for key, value in data.items():
            if isinstance(value, (str, int, float, bool)):
                if key not in self.indexes[category]:
                    self.indexes[category][key] = {}
                
                if value not in self.indexes[category][key]:
                    self.indexes[category][key][value] = set()
                
                self.indexes[category][key][value].add(observation_id)
    
    def query(self, category: str, filters: Dict[str, Any] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """查询数据"""
        with self.lock:
            if category not in self.storage:
                return []
            
            results = []