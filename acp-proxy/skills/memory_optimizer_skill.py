import math
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from acp_proxy.plugins.memory import memory_manager
from acp_proxy.observation import log_to_observation
from acp_proxy.config import get_config

class MemoryOptimizerSkill:
    """自动化的记忆优化器技能，作为agent的记忆管家，解决知识容量停滞问题"""
    
    def __init__(self):
        self.memory_capacity = 50  # 记忆池上限
        self.optimization_threshold = 45  # 接近饱和的阈值（90%）
        self.low_value_percentage = 0.1  # 优化最低价值记忆的百分比（10%）
        self.user_goal_keywords = ["目标", "计划", "任务", "需求", "偏好"]  # 可配置的用户目标关键词
        self.core_memory_tags = ["核心", "不可变", "重要"]  # 核心记忆标签
        
        # 评分权重配置
        self.age_weight = 0.4  # 年龄权重
        self.reference_weight = 0.3  # 引用频率权重
        self.keyword_weight = 0.3  # 关键词匹配权重
        
        # 时间衰减系数
        self.time_decay_factor = 0.1  # 每天衰减10%的初始分数
        
    def run(self) -> Dict[str, Any]:
        """主运行方法，执行记忆优化流程"""
        try:
            # 1. 获取当前所有记忆
            memories = memory_manager.get_all_memories()
            current_count = len(memories)
            
            # 2. 检查是否需要优化（接近饱和）
            if current_count < self.optimization_threshold:
                log_to_observation(
                    f"记忆数量未达到优化阈值（{current_count}/{self.optimization_threshold}），跳过优化"
                )
                return {"status": "skipped", "reason": "below_threshold"}
            
            # 3. 计算每条记忆的价值分数
            scored_memories = []
            for memory in memories:
                score = self._calculate_memory_value(memory)
                if not self._is_core_memory(memory):  # 排除核心记忆
                    scored_memories.append((memory, score))
            
            # 4. 按分数排序，选出最低价值的X%
            scored_memories.sort(key=lambda x: x[1])  # 升序排序
            optimize_count = max(1, int(len(scored_memories) * self.low_value_percentage))
            memories_to_optimize = scored_memories[:optimize_count]
            
            # 5. 对低价值记忆执行优化操作
            optimized_memories = []
            for memory, score in memories_to_optimize:
                result = self._optimize_memory(memory, score)
                if result["action"] != "skipped":
                    optimized_memories.append(result)
            
            # 6. 记录优化日志
            self._log_optimization(memories, optimized_memories, current_count)
            
            return {
                "status": "success",
                "optimized_count": len(optimized_memories),
                "original_count": current_count,
                "new_count": len(memory_manager.get_all_memories()),
                "details": optimized_memories
            }
            
        except Exception as e:
            log_to_observation(f"记忆优化过程中出错: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    def _calculate_memory_value(self, memory: Dict[str, Any]) -> float:
        """计算记忆的价值分数"""
        try:
            score = 0.0
            
            # 1. 年龄分数（越旧分数越低）
            age_days = self._calculate_age_days(memory.get("created_at", datetime.now()))
            age_score = max(0, 1.0 - (age_days * self.time_decay_factor))
            score += age_score * self.age_weight
            
            # 2. 引用频率分数（越高分数越高）
            reference_count = memory.get("reference_count", 0)
            reference_score = min(1.0, math.log(1 + reference_count) / 10)  # 对数归一化
            score += reference_score * self.reference_weight
            
            # 3. 关键词匹配分数
            keyword_score = self._calculate_keyword_match(memory)
            score += keyword_score * self.keyword_weight
            
            return score
            
        except Exception:
            return 0.0  # 计算失败返回最低分
    
    def _calculate_age_days(self, created_at: Any) -> float:
        """计算记忆年龄（天数）"""
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except:
                created_at = datetime.now()
        
        if isinstance(created_at, datetime):
            now = datetime.now(created_at.tzinfo) if created_at.tzinfo else datetime.now()
            return (now - created_at).days
        return 0
    
    def _calculate_keyword_match(self, memory: Dict[str, Any]) -> float:
        """计算关键词匹配分数"""
        content = memory.get("content", "").lower()