from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory.manager import MemoryManager

class PlanningExecutionLoop(BaseSkill):
    """规划-执行闭环技能，解决规划与执行严重脱节问题"""
    
    def __init__(self, memory_manager: MemoryManager):
        super().__init__()
        self.memory_manager = memory_manager
        self.cycle_count = 0
        self.pending_improvements: List[Dict[str, Any]] = []
        self.execution_history: List[Dict[str, Any]] = []
    
    def execute_cycle(self) -> Dict[str, Any]:
        """执行一个进化周期"""
        self.cycle_count += 1
        
        # 检查是否需要触发改进
        should_generate = self.check_triggers()
        
        # 生成改进项
        new_improvements = []
        if should_generate:
            new_improvements = self.generate_improvements()
        
        # 追踪改进项执行情况
        for improvement in new_improvements:
            self.track_execution(improvement)
        
        return {
            "cycle_number": self.cycle_count,
            "improvements_generated": len(new_improvements),
            "pending_improvements": len(self.pending_improvements),
            "timestamp": datetime.now().isoformat()
        }
    
    def generate_improvements(self) -> List[Dict[str, Any]]:
        """基于当前反思数据自动生成可执行的改进项"""
        reflections = self.memory_manager.get_recent_reflections(limit=10)
        
        # 强制每5个周期生成至少1项
        if self.cycle_count % 5 == 0 and not reflections:
            improvements = [self._create_generic_improvement()]
        else:
            improvements = []
            for reflection in reflections:
                if reflection.get("issues") or reflection.get("problems"):
                    improvement = self._create_improvement_from_reflection(reflection)
                    improvements.append(improvement)
        
        self.pending_improvements.extend(improvements)
        return improvements
    
    def check_triggers(self) -> bool:
        """检查触发条件"""
        reflections = self.memory_manager.get_recent_reflections(limit=5)
        
        # 检查错误率
        error_rate = self._calculate_error_rate(reflections)
        if error_rate > 0.1:  # 错误率 > 10%
            return True
        
        # 检查循环次数能被5整除
        if self.cycle_count % 5 == 0:
            return True
        
        # 检查目标进度停滞
        if self._is_progress_stagnant(reflections):
            return True
        
        return False
    
    def track_execution(self, improvement: Dict[str, Any]) -> None:
        """记录每项改进的规划时间、执行状态、结果评估"""
        execution_record = {
            "improvement_id": improvement["improvement_id"],
            "description": improvement["description"],
            "priority": improvement["priority"],
            "trigger_condition": improvement["trigger_condition"],
            "planning_time": datetime.now().isoformat(),
            "execution_status": "pending",
            "result_evaluation": None
        }
        
        self.execution_history.append(execution_record)
        
        # 更新待执行项状态
        for i, pending in enumerate(self.pending_improvements):
            if pending["improvement_id"] == improvement["improvement_id"]:
                self.pending_improvements[i]["execution_status"] = "planned"
                break
        
        # 保存到内存
        self.memory_manager.store_execution_record(execution_record)
    
    def get_pending_improvements(self) -> List[Dict[str, Any]]:
        """获取待执行的改进项"""
        return [imp for imp in self.pending_improvements if imp.get("execution_status") != "completed"]
    
    def get_execution_history(self) -> List[Dict[str, Any]]:
        """获取执行历史记录"""
        return self.execution_history
    
    def _create_improvement_from_reflection(self, reflection: Dict[str, Any]) -> Dict[str, Any]:
        """从反思数据创建改进项"""