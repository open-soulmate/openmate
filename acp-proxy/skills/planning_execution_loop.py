# acp-proxy/skills/planning_execution_loop.py

import uuid
import time
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from .base import BaseSkill
from ..memory.manager import MemoryManager


class PlanningExecutionLoop(BaseSkill):
    """
    规划-执行闭环技能，解决规划与执行严重脱节问题
    """
    
    def __init__(self, memory_manager: MemoryManager):
        super().__init__()
        self.memory_manager = memory_manager
        self.cycle_count = 0
        self.pending_improvements: List[Dict[str, Any]] = []
        self.execution_history: List[Dict[str, Any]] = []
        self.error_rate_threshold = 0.10
        self.force_generate_interval = 5
        
    async def execute_cycle(self, current_reflection_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        每个进化周期调用的方法
        """
        self.cycle_count += 1
        
        # 检查是否触发改进生成
        should_generate = await self.check_triggers(current_reflection_data)
        
        # 生成改进项
        if should_generate:
            improvements = await self.generate_improvements(current_reflection_data)
            self.pending_improvements.extend(improvements)
        
        # 执行待处理的改进项
        executed_improvements = await self._execute_pending_improvements()
        
        # 追踪执行结果
        await self.track_execution(executed_improvements)
        
        # 与MemoryManager集成，保存执行结果
        await self._save_to_memory(executed_improvements)
        
        return {
            "cycle_count": self.cycle_count,
            "generated_improvements": len(improvements) if should_generate else 0,
            "executed_improvements": len(executed_improvements),
            "pending_improvements": len(self.pending_improvements),
            "timestamp": datetime.now().isoformat()
        }
    
    async def generate_improvements(self, reflection_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        基于当前反思数据自动生成可执行的改进项
        每5个周期强制生成至少1项
        """
        improvements = []
        
        # 每5个周期强制生成至少1项
        if self.cycle_count % self.force_generate_interval == 0:
            improvements.append({
                "improvement_id": f"imp_{uuid.uuid4().hex[:8]}",
                "description": f"周期{self.cycle_count}强制生成的系统优化项",
                "priority": 1,
                "trigger_condition": "cyclic_force_generation",
                "execution_status": "pending",
                "generated_at": datetime.now().isoformat()
            })
        
        # 基于反思数据生成改进项
        if reflection_data.get("error_count", 0) > 0:
            error_rate = reflection_data.get("error_count", 0) / reflection_data.get("total_tasks", 1)
            if error_rate > self.error_rate_threshold:
                improvements.append({
                    "improvement_id": f"imp_{uuid.uuid4().hex[:8]}",
                    "description": f"针对错误率过高({error_rate:.1%})的改进方案",
                    "priority": 1,
                    "trigger_condition": "high_error_rate",
                    "execution_status": "pending",
                    "generated_at": datetime.now().isoformat()
                })
        
        # 检查目标进度停滞
        if reflection_data.get("progress_stagnant", False):
            improvements.append({
                "improvement_id": f"imp_{uuid.uuid4().hex[:8]}",
                "description": "目标进度停滞，需要调整策略",
                "priority": 2,
                "trigger_condition": "progress_stagnation",
                "execution_status": "pending",
                "generated_at": datetime.now().isoformat()
            })
        
        return improvements
    
    async def check_triggers(self, reflection_data: Dict[str, Any]) -> bool:
        """
        触发条件检查器
        当错误率>10%、循环次数能被5整除、或目标进度停滞时自动触发
        """
        error_rate = reflection_data.get("error_count", 0) / reflection_data.get("total_tasks", 1)
        is_cycle_multiple = self.cycle_count % self.force_generate_interval == 0
        is_progress_stagnant = reflection_data.get("progress_stagnant", False)
        
        # 错误率超过阈值
        if error_rate > self.error_rate_threshold:
            return True
        
        # 每5个周期强制触发
        if is_cycle_multiple:
            return True
        
        # 目标进度停滞
        if is_progress_stagnant:
            return True
        
        return False
    
    async def track_execution(self, executed_improvements: List[Dict[str, Any]]) -> None:
        """
        执行追踪器，记录每项改进的规划时间、执行状态、结果评估
        """
        for improvement in executed_improvements:
            execution_record = {
                "improvement_id": improvement["improvement_id"],
                "description": improvement["description"],
                "priority": improvement["priority"],
                "trigger_condition": improvement["trigger_condition"],
                "planning_time": improvement.get("generated_at"),
                "execution_time": datetime.now().isoformat(),
                "execution_status": improvement.get("execution_status", "unknown"),
                "result_evaluation": improvement.get("result_evaluation", "pending"),
                "execution_duration_seconds": improvement.get("execution_duration", 0),
                "cycle_count": self.cycle_count
            }
            self.execution_history.append(execution_record)
    
    async def get_pending_improvements(self) -> List[Dict[str, Any]]:
        """
        供外部查询待执行项
        """
        return self.pending_improvements.copy()
    
    async def get_execution_history(self) -> List[Dict[str, Any]]:
        """
        供审计的执行历史记录
        """
        return self.execution_history.copy()
    
    async def _execute_pending_improvements(self) -> List[Dict[str, Any]]:
        """
        执行待处理的改进项
        """
        executed = []
        
        for improvement in self.pending_improvements.copy():
            if improvement["execution_status"] == "pending":
                # 模拟执行过程
                start_time = time.time()
                
                # 这里可以添加实际的改进执行逻辑
                # 目前仅模拟执行状态更新
                improvement["execution_status"] = "completed"
                improvement["execution_duration"] = time.time() - start_time
                improvement["result_evaluation"] = "successful"
                
                executed.append(improvement)
                self.pending_improvements.remove(improvement)
        
        return executed
    