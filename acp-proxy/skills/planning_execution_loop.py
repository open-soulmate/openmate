import time
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory.manager import MemoryManager


class PlanningExecutionLoop(BaseSkill):
    """规划-执行闭环技能，解决规划与执行脱节问题"""
    
    def __init__(self, memory_manager: MemoryManager, **kwargs):
        super().__init__(**kwargs)
        self.memory_manager = memory_manager
        self.current_cycle = 0
        self.pending_improvements = []
        self.execution_history = []
        
    def execute_cycle(self) -> Dict[str, Any]:
        """执行一个进化周期的规划-执行闭环"""
        self.current_cycle += 1
        
        # 检查是否需要生成改进项
        if self.check_triggers():
            new_improvements = self.generate_improvements()
            self.pending_improvements.extend(new_improvements)
        
        # 返回当前周期状态
        return {
            "cycle": self.current_cycle,
            "pending_improvements": len(self.pending_improvements),
            "execution_history_length": len(self.execution_history)
        }
    
    def generate_improvements(self) -> List[Dict[str, Any]]:
        """基于反思数据生成改进项"""
        # 读取历史反思数据
        reflection_data = self.memory_manager.get_reflections()
        
        improvements = []
        
        # 分析反思数据，识别问题模式
        if reflection_data:
            # 这里可以添加更复杂的分析逻辑
            # 示例：基于反思数据生成改进项
            for i, reflection in enumerate(reflection_data[:3]):  # 最多生成3个改进项
                improvement = {
                    "improvement_id": f"imp_{uuid.uuid4().hex[:8]}",
                    "description": f"基于反思数据的改进项 {i+1}: {reflection.get('content', '未指定')}",
                    "priority": self._calculate_priority(reflection),
                    "trigger_condition": "基于反思数据分析",
                    "execution_status": "pending",
                    "created_at": datetime.now().isoformat(),
                    "cycle_created": self.current_cycle
                }
                improvements.append(improvement)
        
        # 每5个周期强制生成至少1项改进项
        if self.current_cycle % 5 == 0 and not improvements:
            mandatory_improvement = {
                "improvement_id": f"imp_{uuid.uuid4().hex[:8]}",
                "description": f"周期性强制改进项 (周期 {self.current_cycle})",
                "priority": 3,  # 中等优先级
                "trigger_condition": "每5个周期强制触发",
                "execution_status": "pending",
                "created_at": datetime.now().isoformat(),
                "cycle_created": self.current_cycle
            }
            improvements.append(mandatory_improvement)
        
        return improvements
    
    def check_triggers(self) -> bool:
        """检查触发条件"""
        # 条件1: 错误率>10%