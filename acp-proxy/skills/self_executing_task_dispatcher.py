"""
SelfExecutingTaskDispatcher - 自执行任务调度技能
强制将50%以上的改进规划任务分配给self执行，重点锻炼编码和工具创建能力
"""

import json
import time
import math
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum


class TaskType(Enum):
    """可自执行的任务类型枚举"""
    MCP_TOOL_CREATION = "mcp_tool_creation"  # MCP工具创建
    CODE_GENERATION = "code_generation"  # 代码生成
    ERROR_PATTERN_ANALYSIS = "error_pattern_analysis"  # 错误模式分析
    API_INTEGRATION = "api_integration"  # API集成
    TEST_AUTOMATION = "test_automation"  # 测试自动化
    DOCUMENTATION = "documentation"  # 文档生成
    CONFIGURATION = "configuration"  # 配置管理
    OTHER = "other"  # 其他类型


@dataclass
class TaskPerformance:
    """任务性能记录"""
    task_type: TaskType
    total_attempts: int = 0
    successful_attempts: int = 0
    total_time: float = 0.0
    quality_score: float = 0.0  # 0-1之间的质量评分
    last_updated: str = ""


@dataclass
class TaskAssignment:
    """任务分配记录"""
    task_id: str
    task_type: TaskType
    assigned_to: str  # "self" 或 "partner"
    assignment_reason: str
    execution_plan: Dict[str, Any]
    priority: int  # 1-5，5为最高
    complexity: int  # 1-5，5为最复杂
    required_skills: List[str]
    timestamp: str


@dataclass
class ExecutionResult:
    """任务执行结果"""
    task_id: str
    assigned_to: str
    success: bool
    completion_time: float
    quality_score: float
    output_artifacts: List[str]
    error_messages: List[str]
    lessons_learned: List[str]


class SelfExecutingTaskDispatcher:
    """自执行任务调度器核心类"""
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        初始化自执行任务调度器
        
        Args:
            config: 配置字典，包含调度策略参数
        """
        self.config = config or {}
        
        # 默认配置
        self.default_config = {
            "min_self_execution_ratio": 0.55,  # 最低自执行比例（略高于50%）
            "adjustment_sensitivity": 0.1,  # 调整灵敏度
            "success_threshold": 0.7,  # 成功率阈值
            "complexity_weight": 0.3,  # 复杂度权重
            "skill_match_weight": 0.4,  # 技能匹配权重
            "priority_weight": 0.3,  # 优先级权重
            "max_concurrent_self_tasks": 3,  # 最大并发自执行任务数
            "performance_history_days": 30,  # 性能历史记录天数
        }
        
        # 合并配置
        for key, value in self.default_config.items():
            if key not in self.config:
                self.config[key] = value
        
        # 自执行能力评估表
        self.performance_table: Dict[str, TaskPerformance] = {}
        
        # 当前分配记录
        self.current_assignments: Dict[str, TaskAssignment] = {}
        
        # 执行结果历史
        self.execution_history: List[ExecutionResult] = []
        
        # 任务分配历史
        self.assignment_history: List[TaskAssignment] = []
        
        # 初始化性能表
        self._initialize_performance_table()
        
        # 载入历史数据（如果有）
        self._load_historical_data()
    
    def _initialize_performance_table(self):
        """初始化自执行能力评估表"""
        for task_type in TaskType:
            if task_type not in self.performance_table:
                self.performance_table[task_type.value] = TaskPerformance(
                    task_type=task_type,
                    last_updated=datetime.now().isoformat()
                )
    
    def _load_historical_data(self):
        """从配置路径或默认位置加载历史数据"""
        # 在实际实现中，这里会从文件或数据库加载历史数据
        # 暂时使用空实现
        pass
    
    def _save_historical_data(self):
        """保存历史数据到配置路径"""
        # 在实际实现中，这里会将历史数据保存到文件或数据库
        # 暂时使用空实现
        pass
    
    def analyze_task_history(self, task_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        分析历史任务分配记录，识别可自执行的任务类型
        
        Args:
            task_list: 任务列表，每个任务是字典格式
            
        Returns:
            分析结果，包含任务类型分布、自执行可行性评估等
        """
        analysis_result = {
            "total_tasks": len(task_list),
            "task_type_distribution": {},
            "self_executable_types": [],
            "complexity_analysis": {},
            "recommended_self_execution_ratio": self.config["min_self_execution_ratio"],
            "timestamp": datetime.now().isoformat()
        }
        
        # 统计任务类型分布
        for task in task_list:
            task_type = task.get("type", "other")
            analysis_result["task_type_distribution"][task_type] = \
                analysis_result["task_type_distribution"].get(task_type, 0) + 1
        
        # 分析可自执行的任务类型
        self_executable_types = self._identify_self_executable_types(task_list)
        analysis_result["self_executable_types"] = self_executable_types
        
        # 复杂度分析
        complexity_stats = self._analyze_complexity(task_list)
        analysis_result["complexity_analysis"] = complexity_stats
        
        # 根据历史成功率调整推荐比例
        success_rate = self._calculate_overall_success_rate()
        if success_rate > self.config["success_threshold"]:
            # 成功率高，可以增加自执行比例
            adjustment = self.config["adjustment_sensitivity"] * (success_rate - self.config["success_threshold"])
            analysis_result["recommended_self_execution_ratio"] = min(
                0.9,  # 最高90%
                self.config["min_self_execution_ratio"] + adjustment
            )
        
        return analysis_result
    
    def _identify_self_executable_types(self, task_list: List[Dict[str, Any]]) -> List[str]:
        """识别可自执行的任务类型"""
        self_executable = []
        
        for task in task_list:
            task_type = task.get("type", "other")