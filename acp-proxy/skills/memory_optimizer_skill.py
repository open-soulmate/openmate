#!/usr/bin/env python3
"""
记忆优化器技能
自动优化agent的记忆存储，防止知识容量停滞
"""

import time
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import logging

# 导入记忆管理模块（假设路径）
try:
    from acp_proxy.plugins.memory.memory_manager import MemoryManager
except ImportError:
    # 备用导入方式
    from plugins.memory.memory_manager import MemoryManager

# 配置日志
logger = logging.getLogger(__name__)


class MemoryOptimizerSkill:
    """记忆优化器技能 - agent的记忆管家"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        初始化记忆优化器技能
        
        Args:
            config: 配置字典，包含：
                - memory_limit: 记忆池上限，默认50
                - optimization_threshold: 触发优化的阈值比例，默认0.9（90%）
                - low_value_percentage: 低价值记忆处理比例，默认0.1（10%）
                - age_weight: 年龄权重，默认0.3
                - reference_weight: 引用频率权重，默认0.4
                - relevance_weight: 相关性权重，默认0.3
                - target_keywords: 目标关键词列表
                - optimization_interval: 优化间隔（对话周期数），默认10
                - summarize_threshold: 摘要阈值长度，默认100
        """
        self.config = config or {}
        self.memory_manager = MemoryManager()
        
        # 默认配置
        self.memory_limit = self.config.get('memory_limit', 50)
        self.optimization_threshold = self.config.get('optimization_threshold', 0.9)
        self.low_value_percentage = self.config.get('low_value_percentage', 0.1)
        
        # 评分权重配置
        self.age_weight = self.config.get('age_weight', 0.3)
        self.reference_weight = self.config.get('reference_weight', 0.4)
        self.relevance_weight = self.config.get('relevance_weight', 0.3)
        
        # 关键词配置
        self.target_keywords = self.config.get('target_keywords', [
            '重要', '目标', '长期', '项目', '计划', '学习', '工作', '健康', '财务'
        ])
        
        # 其他配置
        self.optimization_interval = self.config.get('optimization_interval', 10)
        self.summarize_threshold = self.config.get('summarize_threshold', 100)
        
        # 优化计数器
        self.optimization_counter = 0
        
        logger.info("记忆优化器技能已初始化")
    
    def run(self, force_optimize: bool = False) -> Dict[str, Any]:
        """
        执行记忆优化
        
        Args:
            force_optimize: 强制执行优化，忽略阈值检查
            
        Returns:
            优化结果字典
        """
        start_time = time.time()
        result = {
            'timestamp': datetime.now().isoformat(),
            'optimized': False,
            'memories_before': 0,
            'memories_after': 0,
            'optimized_memories': [],
            'summary': ''
        }
        
        try:
            # 获取所有记忆
            all_memories = self.memory_manager.get_all_memories()
            current_count = len(all_memories)
            result['memories_before'] = current_count
            
            logger.info(f"当前记忆数量: {current_count}/{self.memory_limit}")
            
            # 检查是否需要优化
            should_optimize = force_optimize or self._should_optimize(current_count)
            
            if should_optimize:
                logger.info("开始执行记忆优化...")
                
                # 计算记忆价值
                memory_scores = self._calculate_memory_scores(all_memories)
                
                # 按分数排序
                sorted_memories = sorted(
                    memory_scores.items(),
                    key=lambda x: x[1]['score'],
                    reverse=False  # 分数低的在前
                )
                
                # 确定需要优化的记忆数量
                optimize_count = max(1, int(current_count * self.low_value_percentage))
                memories_to_optimize = sorted_memories[:optimize_count]
                
                # 执行优化操作
                optimized_ids = []
                for memory_id, memory_data in memories_to_optimize:
                    memory_info = memory_data['memory']
                    
                    # 跳过核心记忆和不可变记忆
                    if memory_info.get('is_core') or memory_info.get('immutable'):
                        logger.info(f"跳过核心/不可变记忆 {memory_id}")
                        continue
                    
                    # 决定优化策略
                    action = self._determine_action(memory_info, memory_data['score'])
                    
                    # 执行优化
                    success = self._perform_optimization(
                        memory_id, 
                        memory_info, 
                        action
                    )
                    
                    if success:
                        optimized_ids.append({
                            'id': memory_id,
                            'action': action,
                            'score': memory_data['score'],
                            'reason': memory_data['reason']
                        })
                
                # 记录优化结果
                result['optimized'] = len(optimized_ids) > 0
                result['optimized_memories'] = optimized_ids
                result['memories_after'] = len(self.memory_manager.get_all_memories())
                
                # 生成优化摘要
                result['summary'] = self._generate_optimization_summary(
                    result['memories_before'],
                    result['memories_after'],
                    optimized_ids
                )
                
                # 记录到观察流
                self._log_to_observation_stream(result)
                
            else:
                result['summary'] = f"当前记忆数量({current_count})未达到优化阈值"
                logger.info(result['summary'])
            
            # 更新优化计数器
            self.optimization_counter += 1
            
            # 记录执行时间
            result['execution_time'] = time.time() - start_time
            
            return result
            
        except Exception as e:
            logger.error(f"记忆优化执行失败: {str(e)}")
            result['error'] = str(e)
            result['summary'] = f"优化失败: {str(e)}"
            return result
    
    def _should_optimize(self, current_count: int) -> bool:
        """判断是否需要优化"""
        # 检查是否达到优化间隔