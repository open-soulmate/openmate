"""
GoalProgressTracker - 进化目标进度跟踪器
解决目标孤立和自我进化循环不闭合问题
"""

import json
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from acp_proxy.llm_interface import LLMInterface
from acp_proxy.skills.base_skill import BaseSkill
from acp_proxy.utils.config_loader import load_config

logger = logging.getLogger(__name__)


class GoalPriority(Enum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


class MilestoneStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"


@dataclass
class Milestone:
    """里程碑数据结构"""
    id: str
    description: str
    verification_criteria: str
    target_date: Optional[str] = None
    status: MilestoneStatus = MilestoneStatus.PENDING
    completion_percentage: float = 0.0
    dependencies: List[str] = field(default_factory=list)
    completion_evidence: List[str] = field(default_factory=list)
    last_updated: datetime = field(default_factory=datetime.now)


@dataclass
class Goal:
    """进化目标数据结构"""
    id: str
    name: str
    description: str
    priority: GoalPriority = GoalPriority.MEDIUM
    current_milestone: Optional[Milestone] = None
    milestones: Dict[str, Milestone] = field(default_factory=dict)
    progress_history: List[Tuple[datetime, float, str]] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)


class GoalProgressTracker(BaseSkill):
    """
    进化目标进度跟踪器
    功能：
    1. 维护目标进度字典和里程碑定义
    2. 评估进度并推荐下一步行动
    3. 实现目标导向的深度探索
    """
    
    def __init__(self, config: Optional[Dict] = None):
        """初始化目标进度跟踪器"""
        super().__init__(
            name="goal_progress_tracker",
            description="跟踪进化目标进度，推荐下一步行动，解决目标孤立和循环不闭合问题"
        )
        
        # 加载配置
        self.config = config or load_config("goal_tracker")
        
        # LLM接口用于分析进度
        self.llm = LLMInterface(
            model=self.config.get("llm_model", "default"),
            temperature=0.3
        )
        
        # 进化目标字典
        self.goals: Dict[str, Goal] = {}
        
        # 可用技能映射
        self.available_skills: Dict[str, BaseSkill] = {}
        
        # 行动推荐历史
        self.action_history: List[Dict[str, Any]] = []
        
        # 初始化默认进化目标
        self._initialize_default_goals()
        
        logger.info(f"GoalProgressTracker初始化完成，加载了{len(self.goals)}个目标")
    
    def _initialize_default_goals(self):
        """初始化默认进化目标"""
        default_goals = self.config.get("default_goals", [
            {
                "id": "self_programming",
                "name": "自编程能力",
                "description": "提升自主生成和执行代码的能力",
                "priority": "HIGH",
                "milestones": [
                    {
                        "id": "self_gen_code_exec",
                        "description": "成功执行一次自我生成的代码",
                        "verification_criteria": "生成代码运行无错误，输出符合预期"
                    },
                    {
                        "id": "auto_debug",
                        "description": "能够自动调试生成的代码",
                        "verification_criteria": "自动识别并修复至少一个代码错误"
                    }
                ]
            },
            {
                "id": "error_self_repair",
                "name": "错误自修复",
                "description": "实现错误的自主识别和修复能力",
                "priority": "CRITICAL",
                "milestones": [
                    {
                        "id": "error_pattern_recognition",
                        "description": "识别常见错误模式",
                        "verification_criteria": "准确分类80%的测试错误样本"
                    },
                    {
                        "id": "auto_retry_mechanism",
                        "description": "实现自动重试机制",
                        "verification_criteria": "成功处理至少3种可重试的错误类型"
                    }
                ]
            },
            {
                "id": "knowledge_integration",
                "name": "知识整合",
                "description": "整合分散的知识形成连贯体系",
                "priority": "MEDIUM",
                "milestones": [
                    {
                        "id": "knowledge_graph_construction",
                        "description": "构建基础知识图谱",
                        "verification_criteria": "包含至少50个节点和200条关系的知识图谱"
                    }
                ]
            }
        ])
        
        for goal_config in default_goals:
            goal = Goal(
                id=goal_config["id"],
                name=goal_config["name"],
                description=goal_config["description"],
                priority=GoalPriority[goal_config.get("priority", "MEDIUM")]
            )
            
            # 设置初始里程碑
            for milestone_config in goal_config.get("milestones", []):
                milestone = Milestone(
                    id=milestone_config["id"],
                    description=milestone_config["description"],
                    verification_criteria=milestone_config["verification_criteria"]
                )
                goal.milestones[milestone.id] = milestone
            
            # 设置第一个里程碑为当前里程碑
            if goal.milestones:
                first_milestone = list(goal.milestones.values())[0]
                goal.current_milestone = first_milestone
                first_milestone.status = MilestoneStatus.IN_PROGRESS
            
            self.goals[goal.id] = goal
    
    def register_skill(self, skill: BaseSkill):
        """注册可用技能"""
        self.available_skills[skill.name] = skill
        logger.info(f"注册技能: {skill.name}")
    
    def update_milestone(self, goal_id: str, new_milestone: str, 
                         completion_evidence: Optional[List[str]] = None) -> bool:
        """
        更新目标的当前里程碑
        
        Args:
            goal_id: 目标ID
            new_milestone: 新的里程碑描述
            completion_evidence: 完成证据
            
        Returns:
            更新是否成功
        """
        if goal_id not in self.goals:
            logger.error(f"目标{goal_id}不存在")
            return False
        
        goal = self.goals[goal_id]
        
        # 标记当前里程碑为已完成
        if goal.current_milestone:
            goal.current_milestone.status = MilestoneStatus.COMPLETED
            goal.current_milestone.completion_percentage = 100.0
            goal.current_milestone.last_updated = datetime.now()
            
            if completion_evidence:
                goal.current_milestone.completion_evidence.extend(completion_evidence)
            