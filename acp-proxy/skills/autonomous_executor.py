import os
import json
import time
import subprocess
import tempfile
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from acp_proxy.skills.base import BaseSkill
from acp_proxy.utils.llm import generate_text  # 假设的LLM调用工具

logger = logging.getLogger(__name__)

class AutonomousExecutor(BaseSkill):
    """自执行技能，从被动规划者转变为主动执行者，推动自编程和工具创造目标。"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.timeout = 30  # 默认超时30秒
        self.output_dir = "acp-proxy/plugins/generated"
        os.makedirs(self.output_dir, exist_ok=True)
        
    def execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行自执行循环。
        
        参数:
            context: 包含以下键:
                - improvements: List[Dict] 反思得到的改进列表
                - goal_progress: Dict[str, float] 当前进化目标进度
                - 其他上下文信息
                
        返回:
            包含执行结果的字典
        """
        improvements = context.get("improvements", [])
        goal_progress = context.get("goal_progress", {})
        
        # 1. 任务选择与评估
        selected_tasks = self._select_tasks(improvements, goal_progress)
        if not selected_tasks:
            return {"status": "no_tasks", "message": "没有找到适合自主执行的任务"}
        
        # 选择第一个任务（简单策略）
        task = selected_tasks[0]
        observations = []
        
        # 2. 代码生成与执行
        try:
            code = self._generate_code(task)
            file_path = self._save_code(code, task.get("task_description", ""))
            result = self._execute_code(file_path)
            
            # 3. 结果验证与反馈
            observation = self._create_observation(task, code, result)
            observations.append(observation)
            
            # 更新目标进度估算
            goal_impact = observation.get("goal_impact", {})
            for goal, impact in goal_impact.items():
                if goal in goal_progress:
                    goal_progress[goal] = min(1.0, goal_progress[goal] + impact)
            
            return {
                "status": "completed",
                "observations": observations,
                "goal_progress": goal_progress,
                "files_created": [file_path] if result["status"] == "success" else []
            }
            
        except Exception as e:
            logger.error(f"自执行任务失败: {str(e)}")
            return {
                "status": "error",
                "message": str(e),
                "observations": observations
            }
    
    def _select_tasks(self, improvements: List[Dict], goal_progress: Dict[str, float]) -> List[Dict]:
        """根据标准筛选适合自主执行的任务。"""
        selected = []
        
        for task in improvements:
            # 检查低风险
            if self._is_low_risk(task):
                continue
                
            # 检查明确性
            if not self._is_well_defined(task):
                continue
                
            # 检查与进化目标强关联
            if not self._is_goal_aligned(task, goal_progress):
                continue
                
            selected.append(task)
        
        return selected
    
    def _is_low_risk(self, task: Dict) -> bool:
        """检查任务是否低风险。"""
        high_risk_keywords = ["核心架构", "删除", "修改系统", "数据库", "认证", "权限"]
        description = task.get("task_description", "").lower()
        
        for keyword in high_risk_keywords:
            if keyword in description:
                return False
        return True
    
    def _is_well_defined(self, task: Dict) -> bool:
        """检查任务是否明确。"""
        # 检查是否有明确的输出要求
        description = task.get("task_description", "")
        has_output = any(word in description.lower() for word in ["生成", "创建", "脚本", "配置文件", "函数"])
        has_verifiable = any(word in description.lower() for word in ["可验证", "测试", "检查", "运行"])
        
        return has_output or has_verifiable
    
    def _is_goal_aligned(self, task: Dict, goal_progress: Dict[str, float]) -> bool:
        """检查任务是否与进化目标强关联。"""
        target_goals = ["自编程能力", "工具创造"]
        task_goal = task.get("goal", "")
        
        # 检查任务是否明确标注了目标
        if task_goal in target_goals:
            return True
        
        # 或者从描述中推断
        description = task.get("task_description", "").lower()
        for goal in target_goals:
            if goal.lower() in description:
                return True
                
        return False
    
    def _generate_code(self, task: Dict) -> str:
        """使用LLM生成代码。"""