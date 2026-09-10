from typing import Dict, List, Any, Optional
from datetime import datetime
import json
import os

class SelfExecutingTaskDispatcher:
    """
    自执行任务调度技能
    强制将50%以上的改进规划任务分配给self执行，重点锻炼编码和工具创建能力
    """
    
    def __init__(self):
        self.task_history = []
        self.capability_assessment = {}
        self.execution_plans = []
        self.current_allocation_strategy = {
            'self_ratio': 0.5,  # 最低50%分配给self
            'task_type_weights': {
                'mcp_tool_creation': 0.8,
                'code_generation': 0.7,
                'error_pattern_analysis': 0.6,
                'system_optimization': 0.5,
                'documentation': 0.3
            }
        }
        self.success_metrics = {
            'self_execution_rate': 0.0,
            'success_rate': 0.0,
            'average_completion_time': 0.0,
            'quality_score': 0.0
        }
        
    def analyze_historical_tasks(self, task_history: List[Dict]) -> Dict[str, Any]:
        """
        分析历史任务分配记录，识别可自执行的任务类型
        
        Args:
            task_history: 历史任务分配记录列表
            
        Returns:
            分析结果字典，包含可自执行的任务类型和成功率
        """
        task_type_stats = {}
        
        for task in task_history:
            task_type = task.get('type', 'unknown')
            execution_mode = task.get('execution_mode', 'partner')
            success = task.get('success', False)
            
            if task_type not in task_type_stats:
                task_type_stats[task_type] = {
                    'total': 0,
                    'self_executed': 0,
                    'success_count': 0,
                    'avg_complexity': 0,
                    'self_success_rate': 0.0
                }
            
            stats = task_type_stats[task_type]
            stats['total'] += 1
            
            if execution_mode == 'self':
                stats['self_executed'] += 1
                if success:
                    stats['success_count'] += 1
            
            # 计算平均复杂度
            complexity = task.get('complexity', 1)
            stats['avg_complexity'] = (
                stats['avg_complexity'] * (stats['total'] - 1) + complexity
            ) / stats['total']
        
        # 计算每种任务类型的自执行成功率
        for task_type, stats in task_type_stats.items():
            if stats['self_executed'] > 0:
                stats['self_success_rate'] = stats['success_count'] / stats['self_executed']
        
        return {
            'task_type_stats': task_type_stats,
            'self_executable_types': [
                task_type for task_type, stats in task_type_stats.items()
                if stats['self_success_rate'] >= 0.6 and stats['self_executed'] >= 3
            ],
            'recommended_self_ratio': self._calculate_recommended_ratio(task_type_stats)
        }
    
    def _calculate_recommended_ratio(self, task_type_stats: Dict) -> float:
        """
        根据任务类型统计数据计算推荐的自执行比例
        
        Args:
            task_type_stats: 任务类型统计字典
            
        Returns:
            推荐的自执行比例
        """
        if not task_type_stats:
            return 0.5  # 默认50%
        
        weighted_success_rates = []
        weights = []
        
        for task_type, stats in task_type_stats.items():
            if stats['self_executed'] >= 3:  # 至少3次自执行才有统计意义
                weight = self.current_allocation_strategy['task_type_weights'].get(
                    task_type, 0.5
                )
                weighted_success_rates.append(stats['self_success_rate'] * weight)
                weights.append(weight)
        
        if not weights:
            return 0.5
        
        avg_success_rate = sum(weighted_success_rates) / sum(weights)
        
        # 根据平均成功率调整比例，确保至少50%