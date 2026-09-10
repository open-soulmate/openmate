import datetime
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory.manager import MemoryManager


@dataclass
class ImprovementItem:
    """改进项数据类"""
    improvement_id: str
    description: str
    priority: int  # 1-5，5为最高
    trigger_condition: str
    execution_status: str  # pending, in_progress, completed, failed
    created_time: datetime.datetime
    planned_time: Optional[datetime.datetime] = None
    start_time: Optional[datetime.datetime] = None
    end_time: Optional[datetime.datetime] = None
    result_evaluation: Optional[str] = None
    error_message: Optional[str] = None


class PlanningExecutionLoop(BaseSkill):
    """规划-执行闭环技能类
    
    实现规划与执行的完整闭环，解决规划与执行脱节问题
    """
    
    def __init__(self, memory_manager: MemoryManager):
        super().__init__(
            name="planning_execution_loop",
            description="规划-执行闭环技能，实现规划与执行的完整闭环",
            version="1.0.0"
        )
        self.memory_manager = memory_manager
        self.cycle_count = 0
        self.pending_improvements: List[ImprovementItem] = []
        self.execution_history: List[ImprovementItem] = []
        
        # 从内存中恢复历史数据
        self._load_history()
    
    def _load_history(self):
        """从内存加载历史数据"""
        try:
            history_data = self.memory_manager.get("planning_execution_history")
            if history_data:
                self.execution_history = [ImprovementItem(**item) for item in history_data]
                
            pending_data = self.memory_manager.get("pending_improvements")
            if pending_data:
                self.pending_improvements = [ImprovementItem(**item) for item in pending_data]
                
            cycle_data = self.memory_manager.get("cycle_count")
            if cycle_data:
                self.cycle_count = cycle_data
                
        except Exception as e:
            print(f"加载历史数据失败: {e}")
    
    def _save_history(self):
        """保存数据到内存"""
        try:
            # 保存执行历史
            history_dicts = [asdict(item) for item in self.execution_history]
            self.memory_manager.store("planning_execution_history", history_dicts)
            
            # 保存待执行项
            pending_dicts = [asdict(item) for item in self.pending_improvements]
            self.memory_manager.store("pending_improvements", pending_dicts)
            
            # 保存周期计数
            self.memory_manager.store("cycle_count", self.cycle_count)
            
        except Exception as e:
            print(f"保存数据失败: {e}")
    
    def execute_cycle(self, current_state: Dict[str, Any]) -> Dict[str, Any]:
        """执行一个进化周期
        
        Args:
            current_state: 当前状态数据，包含错误率、目标进度等信息
            
        Returns:
            本次周期的执行结果
        """
        self.cycle_count += 1
        
        # 检查触发条件
        should_generate = self.check_triggers(current_state)
        
        # 如果触发，生成改进项
        if should_generate:
            improvements = self.generate_improvements(current_state)
            self.pending_improvements.extend(improvements)
        
        # 执行待处理的改进项
        execution_results = []
        if self.pending_improvements:
            execution_results = self._execute_pending_improvements(current_state)
        
        # 保存数据
        self._save_history()
        
        return {
            "cycle_count": self.cycle_count,
            "generated_improvements": len(improvements) if should_generate else 0,
            "executed_improvements": len(execution_results),
            "pending_improvements_count": len(self.pending_improvements),
            "execution_history_count": len(self.execution_history)
        }
    
    def check_triggers(self, current_state: Dict[str, Any]) -> bool:
        """检查是否应该触发改进项生成
        
        Args:
            current_state: 当前状态数据
            
        Returns:
            是否应该生成改进项
        """
        triggers = []
        
        # 检查错误率触发条件
        error_rate = current_state.get("error_rate", 0)
        if error_rate > 10.0:
            triggers.append("high_error_rate")
        
        # 检查周期数触发条件（每5个周期）
        if self.cycle_count % 5 == 0:
            triggers.append("periodic_cycle")
        
        # 检查目标进度停滞触发条件
        progress_stagnation = current_state.get("progress_stagnation", False)
        if progress_stagnation:
            triggers.append("progress_stagnation")
        
        # 如果有任何触发条件，或者当前没有待执行的改进项
        return len(triggers) > 0 or len(self.pending_improvements) == 0
    
    def generate_improvements(self, current_state: Dict[str, Any]) -> List[ImprovementItem]:
        """生成改进项
        
        Args:
            current_state: 当前状态数据
            
        Returns:
            生成的改进项列表
        """
        improvements = []
        
        # 基于当前状态分析需要改进的方面
        reflection_data = current_state.get("reflection_data", {})
        problems = reflection_data.get("identified_problems", [])
        opportunities = reflection_data.get("improvement_opportunities", [])
        
        # 为每个问题和机会创建改进项
        for i, problem in enumerate(problems):
            improvement = ImprovementItem(
                improvement_id=f"improvement_{self.cycle_count}_{i+1}",
                description=f"解决问题: {problem.get('description', '未知问题')}",
                priority=problem.get("priority", 3),
                trigger_condition="problem_identified",
                execution_status="pending",
                created_time=datetime.datetime.now()
            )
            improvements.append(improvement)
        
        for i, opportunity in enumerate(opportunities):
            improvement = ImprovementItem(
                improvement_id=f"improvement_{self.cycle_count}_{len(problems)+i+1}",
                description=f"实现机会: {opportunity.get('description', '未知机会')}",
                priority=opportunity.get("priority", 2),
                trigger_condition="opportunity_identified",
                execution_status="pending",
                created_time=datetime.datetime.now()
            )
            improvements.append(improvement)
        
        # 强制每5个周期生成至少一项改进项
        if len(improvements) == 0 and self.cycle_count % 5 == 0:
            improvement = ImprovementItem(
                improvement_id=f"improvement_{self.cycle_count}_forced",
                description="周期性改进: 优化当前流程或系统",
                priority=3,
                trigger_condition="periodic_cycle",
                execution_status="pending",
                created_time=datetime.datetime.now()
            )