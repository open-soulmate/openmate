# acp-proxy/skills/evolution_planner.py
import json
from datetime import datetime
from typing import Dict, List, Any, Optional

from .base import Skill


class EvolutionPlannerSkill(Skill):
    """
    Evolution Planner Skill - 自动生成结构化改进计划的技能
    用于解决反思中发现的改进计划执行不一致、数量波动问题
    """

    def __init__(self):
        super().__init__(
            name="evolution_planner",
            description="自动生成结构化改进计划，解决执行不一致问题",
            version="1.0.0"
        )

    def generate_plan(self, system_state: Dict[str, Any], reflection_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        生成改进计划
        
        Args:
            system_state: 系统状态，包含 memory_stats, goal_progress, improvement_history 等
            reflection_data: 反思数据，包含 failure_patterns, success_patterns 等
            
        Returns:
            包含状态和建议的字典
        """
        try:
            suggestions = []
            
            # 1. 目标分析
            goal_suggestion = self._analyze_goals(system_state.get('goal_progress', {}))
            if goal_suggestion:
                suggestions.append(goal_suggestion)
            
            # 2. 模式分析
            pattern_suggestion = self._analyze_patterns(reflection_data, system_state)
            if pattern_suggestion and len(suggestions) < 2:
                suggestions.append(pattern_suggestion)
            
            # 3. 备用建议（如果分析结果不足）
            if len(suggestions) == 0:
                suggestions.append(self._generate_fallback_suggestion())
            
            # 4. 数量控制
            suggestions = suggestions[:2]
            
            # 5. 添加执行方标注
            suggestions = self._add_execution_labels(suggestions, system_state, reflection_data)
            
            return {
                "status": "success",
                "data": {
                    "suggestions": suggestions,
                    "generated_at": datetime.now().isoformat(),
                    "analysis_summary": {
                        "goals_analyzed": len(system_state.get('goal_progress', {})),
                        "patterns_found": len(reflection_data.get('failure_patterns', []))
                    }
                }
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"计划生成失败: {str(e)}",
                "data": {
                    "suggestions": ["[exec:self] 检查系统状态和反思数据的完整性，确保输入格式正确"],
                    "generated_at": datetime.now().isoformat()
                }
            }

    def _analyze_goals(self, goal_progress: Dict[str, Any]) -> Optional[str]:
        """
        分析目标进度，找出需要优先改进的目标
        """
        if not goal_progress:
            return None
        
        # 找出进度最低的高优先级目标
        priority_order = {'critical': 4, 'high': 3, 'medium': 2, 'low': 1}
        target_goals = []
        
        for goal_id, goal_info in goal_progress.items():
            priority = goal_info.get('priority', 'low').lower()
            progress = goal_info.get('progress', 0)
            
            # 只关注 critical 和 high 优先级的目标
            if priority in ['critical', 'high']:
                target_goals.append({
                    'id': goal_id,
                    'priority': priority,
                    'progress': progress,
                    'name': goal_info.get('name', goal_id)
                })
        
        if not target_goals:
            return None
        
        # 按优先级和进度排序
        target_goals.sort(key=lambda x: (priority_order.get(x['priority'], 0), x['progress']))
        
        # 选择最需要改进的目标
        worst_goal = target_goals[0]
        progress_gap = 100 - worst_goal['progress']
        
        if progress_gap > 20:  # 如果进度差距大于20%
            if worst_goal['progress'] < 30:
                return f"在接下来24小时内，为'{worst_goal['name']}'目标创建包含3个具体步骤的执行计划，每步都可验证完成状态"
            else:
                return f"在接下来48小时内，针对'{worst_goal['name']}'目标的剩余{progress_gap}%，设计一个分阶段实现方案，确保每个阶段有明确的验收标准"
        
        return None

    def _analyze_patterns(self, reflection_data: Dict[str, Any], system_state: Dict[str, Any]) -> Optional[str]:
        """
        分析成功/失败模式，生成改进建议
        """
        failure_patterns = reflection_data.get('failure_patterns', [])
        success_patterns = reflection_data.get('success_patterns', [])
        improvements = reflection_data.get('improvements', [])
        
        # 分析失败模式
        if failure_patterns:
            # 寻找最常见的失败模式
            pattern_counts = {}
            for pattern in failure_patterns:
                pattern_type = pattern.get('type', 'unknown')
                pattern_counts[pattern_type] = pattern_counts.get(pattern_type, 0) + 1
            
            if pattern_counts:
                most_common = max(pattern_counts.items(), key=lambda x: x[1])
                pattern_type, count = most_common
                
                # 根据模式类型生成建议
                if 'memory' in pattern_type.lower() and count >= 2:
                    memory_stats = system_state.get('memory_stats', {})
                    if memory_stats.get('consolidation_rate', 0) < 0.7:
                        return "在接下来12小时内，实现一个记忆整理脚本，将关键对话片段自动归类并设置优先级标记"
                
                elif 'consistency' in pattern_type.lower() or 'execute' in pattern_type.lower():
                    improvement_history = system_state.get('improvement_history', [])
                    if len(improvement_history) > 5:
                        return "创建一个改进计划执行检查表，在每次执行前验证所有前提条件，确保执行一致性"
        
        # 分析改进历史
        if improvements:
            recent_improvements = improvements[-3:]  # 最近3条改进
            successful_count = sum(1 for imp in recent_improvements if imp.get('status') == 'completed')
            
            if successful_count < len(recent_improvements) / 2:
                return "为每个改进计划添加详细的实施步骤和检查点，确保计划可执行且结果可验证"
        
        return None

    def _generate_fallback_suggestion(self) -> str:
        """
        生成备用建议（当其他分析结果不足时）
        """
        return "在接下来6小时内，完成一次系统状态全面检查，识别当前最紧迫的改进需求并制定具体行动计划"

    def _add_execution_labels(self, suggestions: List[str], system_state: Dict[str, Any], 
                            reflection_data: Dict[str, Any]) -> List[str]:
        """
        为建议添加执行方标注
        """
        labeled_suggestions = []
        
        for suggestion in suggestions:
            # 根据建议复杂度和历史成功率决定执行方
            complexity = self._estimate_complexity(suggestion)
            historical_success = self._get_historical_success_rate(suggestion, reflection_data)
            
            if complexity == 'low' or historical_success > 0.7:
                labeled_suggestions.append(f"{suggestion} [exec:self]")
            else:
                labeled_suggestions.append(f"{suggestion} [exec:partner]")
        
        return labeled_suggestions
