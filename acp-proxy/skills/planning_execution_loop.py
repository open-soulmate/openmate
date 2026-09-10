import time
import uuid
from typing import Dict, List, Optional
from datetime import datetime

from acp_proxy.skills.base import BaseSkill
from acp_proxy.memory.manager import MemoryManager


class PlanningExecutionLoop(BaseSkill):
    """
    规划-执行闭环技能，解决规划与执行严重脱节问题
    """
    
    def __init__(self, memory_manager: MemoryManager):
        """
        初始化规划-执行闭环技能
        
        Args:
            memory_manager: 记忆管理器实例
        """
        super().__init__()
        self.memory_manager = memory_manager
        self.cycle_count = 0
        self.pending_improvements = []
        self.execution_history = []
        self.last_improvement_cycle = 0
        
    def execute_cycle(self) -> Dict:
        """
        执行一个进化周期，返回周期执行结果
        
        Returns:
            周期执行结果，包含状态和统计信息
        """
        self.cycle_count += 1
        
        # 检查触发条件
        should_trigger = self.check_triggers()
        
        # 生成改进项
        improvements = self.generate_improvements(force=should_trigger)
        
        # 执行待处理改进项
        executed_items = self._execute_pending_improvements()
        
        # 追踪执行结果
        for item in executed_items:
            self.track_execution(item)
        
        # 保存执行历史到记忆
        self._save_execution_history()
        
        return {
            "cycle": self.cycle_count,
            "triggered": should_trigger,
            "improvements_generated": len(improvements),
            "improvements_executed": len(executed_items),
            "pending_count": len(self.pending_improvements),
            "timestamp": datetime.now().isoformat()
        }
    
    def generate_improvements(self, force: bool = False) -> List[Dict]:
        """
        基于当前反思数据自动生成可执行的改进项
        
        Args:
            force: 是否强制生成改进项（当触发条件满足时）
            
        Returns:
            生成的改进项列表
        """
        improvements = []
        
        # 从记忆中获取反思数据
        reflections = self.memory_manager.get_reflections()
        
        # 检查是否应该强制生成改进项（每5个周期至少生成1项）
        cycles_since_last = self.cycle_count - self.last_improvement_cycle
        should_force_generate = force or cycles_since_last >= 5
        
        # 基于反思数据生成改进项
        if should_force_generate:
            # 生成改进项的逻辑（示例：基于反思数据分析）
            for i, reflection in enumerate(reflections[:3]):  # 限制生成数量
                improvement = self._generate_improvement_from_reflection(reflection)
                if improvement:
                    improvements.append(improvement)
            
            # 确保至少生成1项改进
            if not improvements and should_force_generate:
                improvements.append(self._create_default_improvement())
            
            self.last_improvement_cycle = self.cycle_count
        
        # 将生成的改进项添加到待处理列表
        self.pending_improvements.extend(improvements)
        
        return improvements
    
    def check_triggers(self) -> bool:
        """
        检查触发条件
        
        Returns:
            是否满足触发条件
        """
        triggers = []
        