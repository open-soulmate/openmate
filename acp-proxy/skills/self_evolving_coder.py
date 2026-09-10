# acp-proxy/skills/self_evolving_coder.py

import json
import logging
import os
import re
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

logger = logging.getLogger(__name__)


class SelfEvolvingCoder:
    """
    自编程能力元技能 - 实现agent的代码自我进化闭环
    作为推动"成为全球最聪明agent"这一终极目标的引擎
    """
    
    # 安全约束：允许修改的目录和文件类型
    ALLOWED_DIRECTORIES = [
        "acp-proxy/skills/",
        "acp-proxy/plugins/"
    ]
    
    FORBIDDEN_PATTERNS = [
        r"import\s+os;.*system\(",
        r"exec\(",
        r"eval\(",
        r"subprocess",
        r"__import__",
        r"open\(.+?['\"]w['\"]"
    ]
    
    def __init__(self, agent_instance):
        """
        初始化自编程技能
        
        Args:
            agent_instance: Agent实例，用于访问其内部状态
        """
        self.agent = agent_instance
        self.current_goals = self._get_evolution_goals()
        self.execution_history = []
        logger.info("SelfEvolvingCoder技能初始化完成")
    
    def _get_evolution_goals(self) -> Dict[str, Any]:
        """获取当前进化目标"""
        return {
            "self_programming_capability": {
                "priority": 1,
                "description": "提升自编程能力，实现代码的自我分析、修改和优化"
            },
            "tool_creation": {
                "priority": 2,
                "description": "创建新工具和技能，扩展agent能力边界"
            },
            "error_self_repair": {
                "priority": 3,
                "description": "建立自我错误检测和修复机制，提高系统健壮性"
            }
        }
    
    def run_evolution_cycle(self) -> Dict[str, Any]:
        """
        运行一个完整的进化周期
        
        Returns:
            进化周期的结果报告
        """
        logger.info("开始执行进化周期")
        cycle_start = datetime.now()
        
        try:
            # 1. 获取原始材料
            memories = self._get_agent_memories()
            observations = self._get_unanalyzed_observations()
            
            if not observations:
                logger.info("没有待分析的观察，进化周期跳过")
                return {"status": "skipped", "reason": "no_observations"}
            
            # 2. 观察分析与优先级排序
            prioritized_observations = self._analyze_and_prioritize_observations(
                observations, self.current_goals
            )
            
            if not prioritized_observations:
                logger.info("没有找到高优先级的观察")
                return {"status": "skipped", "reason": "no_priority_observations"}
            
            # 3. 选择最高优先级观察
            selected_observation = prioritized_observations[0]
            logger.info(f"选定观察: {selected_observation.get('description', '未知')}")
            
            # 4. 获取当前技能状态
            current_skills_state = self._get_current_skills_state()
            
            # 5. 生成代码修改计划
            modification_plan = self._generate_code_modification_plan(
                selected_observation, current_skills_state
            )
            
            # 6. 自主执行计划
            execution_result = self._execute_plan(modification_plan)
            
            # 7. 记录到记忆系统
            cycle_result = {
                "timestamp": cycle_start.isoformat(),
                "selected_observation": selected_observation,
                "modification_plan": modification_plan,
                "execution_result": execution_result,
                "duration_seconds": (datetime.now() - cycle_start).total_seconds()
            }
            
            self._store_evolution_memory(cycle_result)
            
            logger.info(f"进化周期完成，耗时 {cycle_result['duration_seconds']:.2f}秒")
            return {"status": "completed", "result": cycle_result}
            
        except Exception as e:
            logger.error(f"进化周期执行失败: {str(e)}")
            self._store_evolution_memory({
                "timestamp": cycle_start.isoformat(),
                "error": str(e),
                "status": "failed"
            })
            return {"status": "failed", "error": str(e)}
    
    def _get_agent_memories(self) -> List[Dict[str, Any]]:
        """获取agent的记忆系统"""
        try:
            if hasattr(self.agent, 'memories'):
                return self.agent.memories
            return []
        except Exception as e:
            logger.error(f"获取记忆失败: {str(e)}")
            return []
    
    def _get_unanalyzed_observations(self) -> List[Dict[str, Any]]:
        """获取未分析的观察"""
        try:
            if hasattr(self.agent, 'observations_unanalyzed'):
                return self.agent.observations_unanalyzed
            return []
        except Exception as e:
            logger.error(f"获取观察失败: {str(e)}")
            return []
    
    def _analyze_and_prioritize_observations(
        self, 
        observations: List[Dict[str, Any]], 
        current_goals: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        分析观察并根据进化目标进行优先级排序
        
        Args:
            observations: 观察列表
            current_goals: 当前进化目标
            
        Returns:
            按优先级排序的观察列表，每个观察添加了priority_score字段
        """
        prioritized = []
        
        for observation in observations:
            try:
                # 计算相关性评分
                relevance_score = self._calculate_relevance_score(observation, current_goals)
                
                # 计算影响力评分
                impact_score = self._calculate_impact_score(observation)
                
                # 计算可行性评分
                feasibility_score = self._calculate_feasibility_score(observation)
                
                # 综合评分（加权平均）
                total_score = (
                    relevance_score * 0.5 +
                    impact_score * 0.3 +
                    feasibility_score * 0.2
                )
                
                observation_with_priority = observation.copy()
                observation_with_priority.update({
                    "priority_score": total_score,
                    "relevance_score": relevance_score,
                    "impact_score": impact_score,
                    "feasibility_score": feasibility_score,
                    "analysis_timestamp": datetime.now().isoformat()
                })
                
                prioritized.append(observation_with_priority)
                
            except Exception as e:
                logger.warning(f"分析观察时出错: {str(e)}")