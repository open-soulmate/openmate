"""
Goal Progress Tracker - 解决目标孤立和自我进化循环不闭合问题的核心技能
"""

import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
import uuid

from acp_skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)


class GoalProgressTracker(BaseSkill):
    """
    目标进度追踪器：为进化目标定义量化里程碑，智能推荐下一步行动
    """
    
    def __init__(self, config: Optional[Dict] = None):
        super().__init__(skill_id="goal_progress_tracker")
        self.goal_definitions = self._initialize_goal_definitions()
        self.goal_progress = self._initialize_goal_progress()
        self.milestone_history = {}
        
        # 如果提供了配置，加载额外的目标定义
        if config and "goal_definitions" in config:
            self.goal_definitions.update(config["goal_definitions"])
        
        logger.info(f"GoalProgressTracker initialized with {len(self.goal_definitions)} goals")
    
    def _initialize_goal_definitions(self) -> Dict[str, Dict]:
        """初始化进化目标及其里程碑定义"""
        return {
            "self_programming_ability": {
                "description": "自编程能力：能够自主生成、测试和优化代码",
                "initial_milestone": "成功执行一次自我生成的代码",
                "success_criteria": "生成的代码在测试环境中运行无错误",
                "evaluation_metrics": ["代码执行成功率", "代码质量评分", "自我修复能力"],
                "related_skills": ["self_code_generator", "code_quality_evaluator"]
            },
            "error_self_recovery": {
                "description": "错误自修复能力：能够自动识别并修复自身错误",
                "initial_milestone": "成功识别并修复至少一个运行时错误",
                "success_criteria": "错误修复后系统功能恢复正常",
                "evaluation_metrics": ["错误识别准确率", "修复成功率", "恢复时间"],
                "related_skills": ["error_analyzer", "auto_fixer"]
            },
            "knowledge_integration": {
                "description": "知识整合能力：能够整合多源知识并形成连贯理解",
                "initial_milestone": "成功整合来自两个不同来源的知识并生成总结",
                "success_criteria": "生成的知识总结在逻辑上连贯且信息准确",
                "evaluation_metrics": ["知识来源多样性", "整合准确性", "总结质量"],
                "related_skills": ["knowledge_retriever", "text_summarizer"]
            },
            "goal_driven_exploration": {
                "description": "目标驱动探索：能够基于目标主动进行探索学习",
                "initial_milestone": "完成首次有目的的探索并产生有价值发现",
                "success_criteria": "探索发现能够推动至少一个目标的进展",
                "evaluation_metrics": ["探索相关性", "发现价值", "目标关联度"],
                "related_skills": ["exploration_engine", "value_assessor"]
            }
        }
    
    def _initialize_goal_progress(self) -> Dict[str, Dict]:
        """初始化目标进度字典"""
        progress = {}
        for goal_id, goal_def in self.goal_definitions.items():
            progress[goal_id] = {
                "goal_id": goal_id,
                "description": goal_def["description"],
                "current_milestone": goal_def["initial_milestone"],
                "milestone_history": [goal_def["initial_milestone"]],
                "progress_percentage": 0.0,
                "last_updated": datetime.now().isoformat(),
                "next_actions": [],
                "related_skills": goal_def.get("related_skills", []),
                "evaluation_metrics": goal_def.get("evaluation_metrics", [])
            }
        return progress
    
    def update_milestone(self, goal_id: str, new_milestone: str, 
                         progress_increment: float = 0.1,
                         achievement_notes: Optional[str] = None) -> bool:
        """
        更新目标的里程碑
        
        Args:
            goal_id: 目标ID
            new_milestone: 新的里程碑描述
            progress_increment: 进度增量（0-1之间）
            achievement_notes: 里程碑达成备注
            
        Returns:
            是否更新成功
        """
        if goal_id not in self.goal_progress:
            logger.warning(f"Goal {goal_id} not found in progress tracker")
            return False
        
        try:
            goal_data = self.goal_progress[goal_id]
            
            # 保存历史里程碑
            if goal_id not in self.milestone_history:
                self.milestone_history[goal_id] = []
            
            self.milestone_history[goal_id].append({
                "milestone": goal_data["current_milestone"],
                "completed_at": datetime.now().isoformat(),
                "achievement_notes": achievement_notes
            })
            
            # 更新到新里程碑
            goal_data["current_milestone"] = new_milestone
            goal_data["progress_percentage"] = min(1.0, goal_data["progress_percentage"] + progress_increment)
            goal_data["last_updated"] = datetime.now().isoformat()
            
            # 添加到里程碑历史
            goal_data["milestone_history"].append(new_milestone)
            
            logger.info(f"Updated goal {goal_id} to milestone: {new_milestone}")
            return True
            
        except Exception as e:
            logger.error(f"Error updating milestone for goal {goal_id}: {e}")
            return False
    
    def get_current_state(self) -> Dict[str, Any]:
        """获取当前完整的状态信息"""
        return {
            "goal_progress": self.goal_progress.copy(),
            "goal_definitions": self.goal_definitions.copy(),
            "milestone_history": self.milestone_history.copy(),
            "timestamp": datetime.now().isoformat()
        }
    
    def recommend_actions(self, current_state: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        推荐下一步行动
        
        Args:
            current_state: 当前状态，包含：
                - goal_progress: 目标进度字典
                - observations: 最近的观察结果
                - error_analysis: 错误分析结果
                - recent_actions: 最近的行动记录
                
        Returns:
            推荐行动列表，每个行动包含：
            - goal_id: 关联的目标ID
            - action: 行动描述
            - skill: 建议使用的技能
            - priority: 优先级（1-5）
            - rationale: 推荐理由
        """
        try:
            # 构建详细的prompt
            prompt = self._build_recommendation_prompt(current_state)
            
            # 调用LLM获取建议
            llm_response = self._call_llm(prompt)
            
            # 解析LLM响应
            actions = self._parse_llm_response(llm_response)
            
            # 为每个推荐的行动添加元数据
            for action in actions:
                action["timestamp"] = datetime.now().isoformat()
                action["source"] = "goal_progress_tracker"
                action["request_id"] = str(uuid.uuid4())
            
            return actions
            
        except Exception as e:
            logger.error(f"Error in recommend_actions: {e}")