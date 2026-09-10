import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from enum import Enum

# 假设的模块导入（根据项目实际结构调整）
from acp_proxy.plugins.memory.memory_manager import MemoryManager
from acp_proxy.observation.observation_stream import ObservationStream

class OptimizationAction(Enum):
    ARCHIVE = "archive"
    COMPRESS = "compress"
    DELETE = "delete"
    KEEP = "keep"

class MemoryOptimizerSkill:
    """记忆优化器技能，作为agent的记忆管家，定期优化记忆池"""
    
    def __init__(self, 
                 memory_manager: Optional[MemoryManager] = None,
                 observation_stream: Optional[ObservationStream] = None,
                 config: Dict[str, Any] = None):
        """
        初始化记忆优化器技能
        
        Args:
            memory_manager: 记忆管理器实例
            observation_stream: 观察流实例（用于记录日志）
            config: 技能配置参数
        """
        self.memory_manager = memory_manager or MemoryManager()
        self.observation_stream = observation_stream or ObservationStream()
        
        # 默认配置
        default_config = {
            'memory_capacity_limit': 50,  # 记忆池容量上限
            'optimization_threshold': 0.9,  # 触发优化的记忆使用率阈值
            'low_value_percentage': 0.1,  # 优化低价值记忆的百分比
            'min_memory_age_days': 7,  # 最小记忆年龄（天）
            'reference_weight': 0.4,  # 引用频率权重
            'age_weight': 0.3,  # 年龄权重
            'relevance_weight': 0.3,  # 相关性权重
            'compression_threshold': 1000,  # 触发压缩的字符数阈值
            'core_memory_tags': ['core', 'permanent', 'immutable'],  # 核心记忆标签
            'relevant_keywords': [  # 与用户目标相关的关键词（可配置）
                '项目目标', '长期计划', '学习目标', '职业规划',
                '重要任务', '核心技能', '关键知识', '战略目标'
            ],
            'optimization_interval_cycles': 10,  # 优化间隔（对话周期数）
        }
        
        self.config = {**default_config, **(config or {})}
        
        # 状态跟踪
        self.conversation_cycles_since_last_optimization = 0
        self.optimization_history = []
        
        # 设置日志记录
        self.logger = logging.getLogger(__name__)
        logging.basicConfig(level=logging.INFO)
    
    def _calculate_memory_value_score(self, memory: Dict[str, Any]) -> float:
        """
        计算单条记忆的价值分数
        
        Args:
            memory: 记忆对象
            
        Returns:
            记忆价值分数 (0-1)
        """
        score_components = {}
        
        # 1. 年龄因子（越旧分数越低）
        created_at = memory.get('created_at', datetime.now())
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except:
                created_at = datetime.now()
        
        age_days = (datetime.now() - created_at).days
        max_age = 365  # 最大参考年龄（天）
        age_score = max(0, 1 - (age_days / max_age))
        score_components['age'] = age_score * self.config['age_weight']
        
        # 2. 引用频率因子（引用越多分数越高）
        reference_count = memory.get('reference_count', 0)