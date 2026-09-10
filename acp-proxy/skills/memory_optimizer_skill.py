#!/usr/bin/env python3
"""
记忆优化器技能 - 自动维护agent记忆池的健康与容量
作为agent的"记忆管家"，定期优化低价值记忆，为高价值知识腾出空间
"""

import time
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass

# 尝试导入记忆管理模块
try:
    from acp_proxy.plugins.memory.memory_manager import (
        get_all_memories,
        update_memory,
        archive_memory,
        delete_memory,
        summarize_memory,
        get_memory_details
    )
    memory_manager_available = True
except ImportError:
    memory_manager_available = False
    logging.warning("Memory manager module not available. Using mock implementation.")

# 配置日志
logger = logging.getLogger(__name__)


@dataclass
class Memory:
    """记忆数据结构"""
    id: str
    content: str
    created_at: datetime
    last_accessed: datetime
    access_count: int
    importance: float
    tags: List[str]
    is_core: bool = False
    is_immutable: bool = False


@dataclass
class OptimizationResult:
    """优化结果"""
    memory_id: str
    action: str  # 'archive', 'compress', 'delete', 'keep'
    reason: str
    score_before: float
    score_after: Optional[float] = None


class MemoryOptimizerSkill:
    """
    记忆优化器技能
    自动优化agent的记忆池，确保记忆容量与质量的平衡
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        初始化记忆优化器
        
        Args:
            config: 配置参数，可包含:
                - memory_threshold: 触发优化的阈值百分比 (默认90%)
                - optimization_percentage: 每次优化的记忆百分比 (默认10%)
                - min_memories_to_optimize: 最少优化记忆数量 (默认5)
                - max_memory_age_days: 记忆最大年龄天数 (默认30)
                - low_score_threshold: 低分数阈值 (默认0.3)
                - target_keywords: 用户目标关键词列表
                - cycle_interval: 优化周期间隔 (对话周期数，默认10)
        """
        self.config = config or {}
        self.memory_threshold = self.config.get('memory_threshold', 0.9)  # 90%阈值
        self.optimization_percentage = self.config.get('optimization_percentage', 0.1)  # 10%
        self.min_memories_to_optimize = self.config.get('min_memories_to_optimize', 5)
        self.max_memory_age_days = self.config.get('max_memory_age_days', 30)
        self.low_score_threshold = self.config.get('low_score_threshold', 0.3)
        self.target_keywords = self.config.get('target_keywords', [
            '学习', '目标', '偏好', '重要', '计划', '习惯', '需求',
            '长期', '短期', '优先', '关键', '核心', '必须', '总是'
        ])
        self.cycle_interval = self.config.get('cycle_interval', 10)
        self.cycle_counter = 0
        
        # 初始化记忆池容量
        self.memory_pool_size = self.config.get('memory_pool_size', 50)
        
        logger.info("Memory Optimizer Skill initialized with config: %s", self.config)
    
    def calculate_memory_score(self, memory: Memory) -> float:
        """
        计算记忆的综合价值分数
        
        Args:
            memory: 记忆对象
            
        Returns:
            综合价值分数 (0-1，1为最高价值)
        """
        if memory.is_core or memory.is_immutable:
            return 1.0  # 核心或不可变记忆给予最高分数
        
        current_time = datetime.now()
        
        # 1. 时间维度分数 (越旧分数越低)
        age_days = (current_time - memory.created_at).days
        time_score = max(0.0, 1.0 - (age_days / self.max_memory_age_days) * 0.5)
        
        # 2. 访问频率分数 (越高分数越高)
        # 使用对数衰减函数，避免访问次数过多时分数爆炸
        access_score = min(1.0, memory.access_count / 10.0)  # 10次访问得满分
        
        # 3. 相关性分数 (基于关键词匹配)
        relevance_score = self._calculate_relevance_score(memory.content)
        
        # 4. 重要性权重 (基于memory.importance字段)
        importance_score = memory.importance if hasattr(memory, 'importance') else 0.5
        
        # 综合加权分数
        weights = {
            'time': 0.3,
            'access': 0.25,
            'relevance': 0.35,
            'importance': 0.1
        }
        
        final_score = (
            weights['time'] * time_score +
            weights['access'] * access_score +
            weights['relevance'] * relevance_score +
            weights['importance'] * importance_score
        )
        
        return final_score
    
    def _calculate_relevance_score(self, content: str) -> float:
        """
        计算记忆内容与用户目标的相关性分数
        
        Args:
            content: 记忆内容
            
        Returns:
            相关性分数 (0-1)
        """
        content_lower = content.lower()
        keyword_count = 0
        
        for keyword in self.target_keywords:
            if keyword.lower() in content_lower:
                keyword_count += 1
        
        # 关键词密度得分，但限制最大分数
        keyword_density = keyword_count / max(1, len(content.split()) / 5)  # 每5个单词匹配一个关键词
        relevance_score = min(1.0, keyword_density * 2.0)  # 放大效应，最大1.0
        
        return relevance_score
    
    def _determine_action(self, memory: Memory, score: float) -> Tuple[str, str]:
        """
        根据记忆分数决定优化操作
        
        Args:
            memory: 记忆对象
            score: 记忆分数
            
        Returns:
            (操作类型, 操作原因)
        """
        if memory.is_core or memory.is_immutable:
            return 'keep', '记忆被标记为核心或不可变'
        
        # 检查是否低于低分数阈值
        if score < self.low_score_threshold:
            # 根据记忆长度决定操作
            if len(memory.content) > 200:  # 长记忆尝试压缩
                return 'compress', f'低价值记忆({score:.2f})且内容过长({len(memory.content)}字符)'
            else:
                return 'archive', f'低价值记忆({score:.2f})且内容简短'
        
        # 检查记忆年龄
        age_days = (datetime.now() - memory.created_at).days
        if age_days > self.max_memory_age_days:
            # 检查最近访问情况
            days_since_access = (datetime.now() - memory.last_accessed).days
            if days_since_access > 7:  # 超过7天未访问
                return 'archive', f'过时记忆({age_days}天未更新，{days_since_access}天未访问)'
        