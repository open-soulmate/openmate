# acp-proxy/skills/evolution_planner.py
from datetime import datetime
import json
from typing import Dict, List, Any
from .base import Skill

class EvolutionPlannerSkill(Skill):
    """
    进化规划技能：自动生成结构化改进计划，推动系统持续进化。
    """
    
    def __init__(self):
        super().__init__(
            name="evolution_planner",
            description="自动生成结构化改进计划，推动系统持续进化"
        )
        # 预定义的建议模板库
        self.suggestion_templates = {
            "自编程能力": {
                "low_complexity": "为下一个对话轮次生成一个只修改单个配置项的简单代码片段",
                "high_complexity": "设计一个能够自我验证并修复小错误的简单脚本",
            },
            "错误自修复": {
                "low_complexity": "为最近3次失败的工具调用创建一个检查清单",
                "high_complexity": "实现一个简单的错误日志分析器，自动识别常见失败模式",
            },
            "记忆优化": {
                "low_complexity": "整理并合并最近7天内的重复记忆条目",
                "high_complexity": "为重要记忆添加时间戳和关联上下文的元数据",
            }
        }
        # 建议执行方决策规则
        self.execution_rules = {
            "self": {
                "complexity": "low",
                "success_rate_threshold": 0.7
            },
            "partner": {
                "complexity": "high",
                "success_rate_threshold": 0.5
            }
        }
    
    def generate_plan(self, system_state: Dict[str, Any], reflection_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        生成改进计划的核心方法
        
        参数:
            system_state: 系统状态字典，包含memory_stats, goal_progress, improvement_history等
            reflection_data: 反思数据字典，包含failure_patterns, success_patterns等
            
        返回:
            包含状态和建议的字典
        """
        try:
            # 1. 目标分析：找出进度最低的高优先级目标
            critical_goals = self._analyze_goal_progress(system_state.get("goal_progress", {}))
            
            # 2. 模式分析：提取关键瓶颈
            failure_patterns = reflection_data.get("failure_patterns", {})
            improvement_history = system_state.get("improvement_history", [])
            key_bottlenecks = self._analyze_failure_patterns(failure_patterns, improvement_history)
            
            # 3. 生成建议（严格控制1-2条）
            suggestions = self._generate_suggestions(critical_goals, key_bottlenecks, system_state)
            
            # 4. 记录生成时间
            timestamp = datetime.now().isoformat()
            
            return {
                "status": "success",
                "data": {
                    "suggestions": suggestions,
                    "generated_at": timestamp,
                    "based_on": {
                        "critical_goals": critical_goals,
                        "key_bottlenecks": key_bottlenecks
                    }
                }
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    def _analyze_goal_progress(self, goal_progress: Dict[str, Any]) -> List[Dict[str, Any]]:
        """分析目标进度，找出进度最低的高优先级目标"""
        critical_goals = []
        
        for goal_name, goal_info in goal_progress.items():
            priority = goal_info.get("priority", "").lower()
            progress = goal_info.get("progress", 0)
            
            # 筛选优先级为critical或high且进度较低的目标
            if priority in ["critical", "high"] and progress < 0.6:
                critical_goals.append({
                    "name": goal_name,
                    "priority": priority,
                    "progress": progress,
                    "target": goal_info.get("target", "")
                })
        
        # 按进度排序，取前3个最需要改进的目标
        critical_goals.sort(key=lambda x: x["progress"])
        return critical_goals[:3]
    
    def _analyze_failure_patterns(self, failure_patterns: Dict[str, Any], 
                                 improvement_history: List[Dict[str, Any]]) -> List[str]:
        """分析失败模式，提取关键瓶颈"""
        bottlenecks = []
        
        # 分析失败模式
        for pattern_name, pattern_info in failure_patterns.items():
            frequency = pattern_info.get("frequency", 0)
            severity = pattern_info.get("severity", "").lower()
            
            if frequency >= 2 or severity in ["high", "critical"]:
                bottlenecks.append(pattern_name)
        
        # 分析历史改进记录，找出未解决的问题
        for improvement in improvement_history[-5:]:  # 最近5条记录
            if improvement.get("status") == "incomplete":
                related_issue = improvement.get("related_issue", "")
                if related_issue and related_issue not in bottlenecks:
                    bottlenecks.append(related_issue)
        
        return list(set(bottlenecks))  # 去重
    
    def _generate_suggestions(self, critical_goals: List[Dict[str, Any]], 
                            bottlenecks: List[str], 
                            system_state: Dict[str, Any]) -> List[str]:
        """基于分析结果生成1-2条具体建议"""
        suggestions = []
        
        # 为每个关键目标生成建议
        for goal in critical_goals:
            goal_name = goal["name"]
            
            # 根据目标名称和瓶颈选择合适的建议模板
            if goal_name in self.suggestion_templates:
                template_key = "low_complexity" if goal["progress"] < 0.3 else "high_complexity"
                base_suggestion = self.suggestion_templates[goal_name][template_key]
                
                # 添加具体细节使其满足SMART原则
                detailed_suggestion = self._make_suggestion_smart(
                    base_suggestion, 
                    goal["progress"], 
                    bottlenecks,
                    system_state
                )
                
                # 决定执行方标签
                execution_tag = self._determine_execution_tag(
                    goal["progress"], 
                    system_state.get("improvement_history", []),
                    template_key
                )
                
                suggestions.append(f"{detailed_suggestion} {execution_tag}")
            
            # 严格限制为1-2条建议
            if len(suggestions) >= 2:
                break
        
        # 如果没有生成足够的建议，使用通用建议填充
        if len(suggestions) < 1:
            suggestions.append(self._generate_fallback_suggestion(bottlenecks))
        
        return suggestions[:2]  # 确保最多2条
    
    def _make_suggestion_smart(self, base_suggestion: str, current_progress: float, 
                             bottlenecks: List[str], system_state: Dict[str, Any]) -> str:
        """使建议满足SMART原则"""
        # 添加具体性
        if "记忆" in base_suggestion:
            memory_stats = system_state.get("memory_stats", {})
            total_memories = memory_stats.get("total", 0)
            specific_suggestion = f"{base_suggestion}（当前记忆条目数: {total_memories}）"
        elif "代码" in base_suggestion:
            specific_suggestion = f"{base_suggestion}（目标复杂度: 简单，预计时间: 30分钟内）"
        else:
            specific_suggestion = f"{base_suggestion}（当前进度: {current_progress:.0%}）"
        
        # 添加可衡量性
        if "检查清单" in base_suggestion:
            measurable_suggestion = f"{specific_suggestion}，完成后记录通过率"
        elif "分析器" in base_suggestion:
            measurable_suggestion = f"{specific_suggestion}，目标识别准确率≥80%"
        else:
            measurable_suggestion = specific_suggestion
        
        # 添加时限
        timed_suggestion = f"{measurable_suggestion}，在下次对话轮次前完成"
        
        return timed_suggestion
    
    def _determine_execution_tag(self, current_progress: float, 
                               improvement_history: List[Dict[str, Any]], 
                               complexity: str) -> str:
        """决定建议的执行方标签"""
        # 计算近期成功率
        recent_improvements = improvement_history[-5:] if improvement_history else []
        success_count = sum(1 for imp in recent_improvements if imp.get("status") == "completed")
        success_rate = success_count / max(len(recent_improvements), 1)
        
        # 根据规则决定执行方
        if complexity == "low" and success_rate >= self.execution_rules["self"]["success_rate_threshold"]:
            return "[exec:self]"