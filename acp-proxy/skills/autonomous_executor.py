import json
import subprocess
import sys
import tempfile
import os
import time
import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path
import logging

# 设置日志记录
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AutonomousExecutor:
    """
    自主执行器技能 - 将Agent从被动规划者转变为主动执行者
    核心目标：解决过度依赖外部执行和进化目标进展停滞问题
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """初始化自主执行器"""
        self.config = config or {}
        
        # 配置参数
        self.execution_timeout = self.config.get('execution_timeout', 30)  # 执行超时时间（秒）
        self.max_tasks_per_cycle = self.config.get('max_tasks_per_cycle', 3)  # 每个周期最大任务数
        self.sandbox_enabled = self.config.get('sandbox_enabled', True)
        
        # 进化目标关联
        self.goal_mapping = {
            '自编程能力': 'self_programming',
            '工具创造': 'tool_creation'
        }
        
        # 初始化输出目录
        self.output_dir = Path("acp-proxy/plugins/generated")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # 任务筛选标准
        self.risk_threshold = self.config.get('risk_threshold', 'low')
        self.clarity_threshold = self.config.get('clarity_threshold', 'high')
        
        logger.info("AutonomousExecutor 已初始化")
    
    def execute(self, 
                improvements: List[Dict[str, Any]], 
                goal_progress: Dict[str, float],
                memories: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        主执行方法
        
        参数:
            improvements: 改进任务列表
            goal_progress: 进化目标进度字典
            memories: 记忆流（可选）
            
        返回:
            执行结果字典，包含观察记录和执行统计
        """
        if memories is None:
            memories = []
        
        # 1. 选择适合自主执行的任务
        selected_tasks = self._select_tasks(improvements, goal_progress)
        
        if not selected_tasks:
            logger.info("未找到适合自主执行的任务")
            return {
                'tasks_selected': 0,
                'observations': [],
                'success': True,
                'message': "无适合自主执行的任务"
            }
        
        logger.info(f"选择了 {len(selected_tasks)} 个任务进行自主执行")
        
        # 2. 执行每个任务
        observations = []
        total_execution_time = 0
        
        for task in selected_tasks:
            try:
                observation = self._execute_task(task)
                observations.append(observation)
                
                # 更新执行时间
                if 'execution_time' in observation:
                    total_execution_time += observation['execution_time']
                    
            except Exception as e:
                logger.error(f"执行任务时出错: {str(e)}")
                observations.append({
                    'task_type': 'execution_error',
                    'task_description': task.get('description', ''),
                    'generated_code_preview': '',
                    'execution_status': 'error',
                    'output_summary': f"执行错误: {str(e)}",
                    'goal_impact': {},
                    'timestamp': datetime.datetime.now().isoformat()
                })
        
        # 3. 生成总体报告
        result = {
            'tasks_selected': len(selected_tasks),
            'tasks_executed': len(observations),
            'success_count': sum(1 for obs in observations if obs.get('execution_status') == 'success'),
            'error_count': sum(1 for obs in observations if obs.get('execution_status') == 'error'),
            'total_execution_time': total_execution_time,
            'observations': observations,
            'success': True,
            'timestamp': datetime.datetime.now().isoformat()
        }
        
        # 4. 计算对进化目标的影响
        goal_impacts = self._calculate_goal_impacts(observations)
        result['goal_impacts'] = goal_impacts
        
        # 5. 注入观察记录到记忆流
        self._inject_observations_to_memories(observations, memories)
        
        logger.info(f"自主执行完成: {result['success_count']} 成功, {result['error_count']} 失败")
        
        return result
    
    def _select_tasks(self, 
                      improvements: List[Dict[str, Any]], 
                      goal_progress: Dict[str, float]) -> List[Dict[str, Any]]:
        """
        选择适合自主执行的任务
        
        筛选标准:
        1. 低风险: 不涉及核心架构变更
        2. 明确性: 任务需求清晰，输出结果可验证
        3. 与进化目标强关联: 必须明确标注服务的进化目标
        """
        selected_tasks = []
        
        for task in improvements:
            # 检查任务是否已被标记为不适合自主执行
            if task.get('autonomous_execution_blocked', False):
                continue
            
            # 检查风险等级
            risk_level = task.get('risk_level', 'unknown')
            if risk_level not in ['low', 'minimal']:
                continue
            
            # 检查任务明确性
            clarity_score = task.get('clarity_score', 0)