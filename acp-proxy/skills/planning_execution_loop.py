import time
import uuid
from typing import Any, Dict, List, Optional

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory.manager import MemoryManager

class PlanningExecutionLoop(BaseSkill):
    def __init__(self, memory_manager: MemoryManager):
        super().__init__()
        self.memory_manager = memory_manager
        self.current_cycle = 0
        self.pending_improvements: List[Dict[str, Any]] = []
        self.execution_history: List[Dict[str, Any]] = []
    
    def execute_cycle(self) -> List[Dict[str, Any]]:
        """Execute one evolution cycle, returning any improvements triggered."""
        self.current_cycle += 1
        triggered = self.check_triggers()
        if triggered:
            improvements = self.generate_improvements(triggered)
            self.pending_improvements.extend(improvements)
            for imp in improvements:
                self.track_execution(imp)
        return triggered
    
    def generate_improvements(self, trigger_conditions: List[str]) -> List[Dict[str, Any]]:
        """Generate executable improvement items based on reflection data and triggers."""
        improvements = []
        reflections = self.memory_manager.read_data("reflections") or {}
        
        # Force at least one improvement every 5 cycles
        if self.current_cycle % 5 == 0 and not improvements:
            imp = {
                "improvement_id": str(uuid.uuid4()),
                "description": "Forced improvement due to cycle count",
                "priority": "medium",
                "trigger_condition": "cycle_count_divisible_by_5",
                "execution_status": "pending"
            }
            improvements.append(imp)
        
        # Generate based on triggers and reflection data
        for condition in trigger_conditions:
            if condition == "high_error_rate":
                imp = {
                    "improvement_id": str(uuid.uuid4()),
                    "description": "Reduce error rate by optimizing core processes",
                    "priority": "high",
                    "trigger_condition": "error_rate > 10%",
                    "execution_status": "pending"
                }
                improvements.append(imp)
            elif condition == "goal_progress_stalled":
                imp = {
                    "improvement_id": str(uuid.uuid4()),
                    "description": "Reassess goals and adjust strategies for progress",
                    "priority": "high",
                    "trigger_condition": "goal_progress_stalled",
                    "execution_status": "pending"
                }
                improvements.append(imp)
        
        return improvements
    
    def check_triggers(self) -> List[str]:
        """Check trigger conditions and return list of triggered conditions."""
        triggers = []
        reflections = self.memory_manager.read_data("reflections") or {}
        
        # Check error rate > 10%
        error_rate = reflections.get("error_rate", 0.0)
        if error_rate > 0.1:
            triggers.append("high_error_rate")
        
        # Check cycle count divisible by 5
        if self.current_cycle % 5 == 0:
            triggers.append("cycle_count_divisible_by_5")
        
        # Check goal progress stalled
        goal_progress = reflections.get("goal_progress", {})
        if goal_progress.get("stalled", False):
            triggers.append("goal_progress_stalled")
        
        return triggers
    
    def track_execution(self, improvement: Dict[str, Any]) -> None:
        """Record execution details of an improvement item."""
        planning_time = time.time()
        execution_status = improvement.get("execution_status", "unknown")
        result_assessment = "pending_assessment"
        
        record = {
            "improvement_id": improvement["improvement_id"],
            "description": improvement["description"],
            "priority": improvement["priority"],
            "trigger_condition": improvement["trigger_condition"],
            "execution_status": execution_status,
            "planning_time": planning_time,
            "result_assessment": result_assessment,
            "cycle": self.current_cycle
        }
        self.execution_history.append(record)
        self.memory_manager.write_data("execution_history", self.execution_history)
    
    def get_pending_improvements(self) -> List[Dict[str, Any]]:
        """Return list of pending improvement items."""
        return self.pending_improvements
    
    def get_execution_history(self) -> List[Dict[str, Any]]:
        """Return full execution history for auditing."""
        return self.execution_history