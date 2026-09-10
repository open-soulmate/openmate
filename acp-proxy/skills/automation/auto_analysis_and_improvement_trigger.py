"""
AutoAnalysisAndImprovementTrigger - 自动分析与改进触发技能

解决反思中的关键问题：
1. 及时处理未分析的观察记录
2. 确保每个进化周期至少产生一项改进
3. 提升Agent的自我执行能力

触发时机：进化周期规划阶段
"""

import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path


class AutoAnalysisAndImprovementTrigger:
    """
    自动分析与改进触发技能
    
    作为Agent的"自我监督和驱动"子系统，在每个进化周期的规划阶段自动运行，
    确保系统持续产生改进，推动自编程能力和错误自修复目标的进展。
    """
    
    # 技能元信息
    SKILL_ID = "auto_analysis_and_improvement_trigger"
    SKILL_NAME = "自动分析与改进触发器"
    SKILL_VERSION = "1.0.0"
    TRIGGER_PHASE = "pre_planning"  # 在规划阶段前触发
    PRIORITY = "high"
    
    # 配置常量
    MIN_IMPROVEMENTS_THRESHOLD = 1  # 每周期最少改进数量
    OBSERVATION_ANALYSIS_BATCH_SIZE = 5  # 批量分析观察记录的数量
    
    # 低优先级目标关键词（用于识别需要推进的目标）
    LOW_PROGRESS_KEYWORDS = [
        "自编程", "自动编程", "self_programming",
        "错误自修复", "自修复", "self_repair", "error_recovery",
        "性能优化", "performance_optimization",
        "自动化", "automation"
    ]
    
    def __init__(self, project_root: Optional[str] = None):
        """
        初始化技能
        
        Args:
            project_root: 项目根目录路径，默认为当前文件所在目录的上级
        """
        if project_root:
            self.project_root = Path(project_root)
        else:
            self.project_root = Path(__file__).parent.parent.parent
        
        self.skills_dir = self.project_root / "skills"
        self.plugins_dir = self.project_root / "plugins"
        
        # 内部状态缓存
        self._available_skills = None
        self._available_plugins = None
        
    def get_skill_info(self) -> Dict[str, Any]:
        """返回技能注册信息"""
        return {
            "skill_id": self.SKILL_ID,
            "name": self.SKILL_NAME,
            "version": self.SKILL_VERSION,
            "description": "确保每个进化周期至少产生一项改进，处理未分析的观察记录",
            "trigger_phase": self.TRIGGER_PHASE,
            "priority": self.PRIORITY,
            "capabilities": [
                "observation_analysis",
                "improvement_generation",
                "cycle_guarantee"
            ]
        }
    
    def ensure_minimum_improvements(
        self,
        cycle_context: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        核心方法：确保当前周期的改进计划满足最低要求
        
        Args:
            cycle_context: 周期上下文，包含:
                - cycle_count: 当前周期数
                - self_reflection_data: 自我反思数据
                - goals_progress: 目标进度
                - improvements_to_plan: 当前待规划的改进列表
                - last_cycle_improvements_planned: 上个周期计划的改进数
                - observations_unanalyzed: 未分析的观察记录数
                - failure_patterns: 失败模式记录
                
        Returns:
            新生成的改进方案列表
        """
        new_improvements = []
        
        # 阶段1: 分析未处理的观察记录
        observation_insights = self._analyze_pending_observations(cycle_context)
        
        # 阶段2: 检查改进保底机制
        current_planned = cycle_context.get("improvements_to_plan", [])
        last_cycle_count = cycle_context.get("last_cycle_improvements_planned", 0)
        
        needs_guarantee = (
            len(current_planned) < self.MIN_IMPROVEMENTS_THRESHOLD and
            last_cycle_count < self.MIN_IMPROVEMENTS_THRESHOLD
        )
        
        # 阶段3: 如果需要保底，生成强制改进
        if needs_guarantee:
            forced_improvement = self._generate_forced_improvement(
                cycle_context=cycle_context,
                observation_insights=observation_insights
            )
            if forced_improvement:
                new_improvements.append(forced_improvement)
        
        # 阶段4: 如果有高价值的观察洞察，也生成改进
        elif observation_insights.get("high_priority_insights"):
            insight_improvement = self._create_improvement_from_insight(
                observation_insights["high_priority_insights"][0],
                cycle_context
            )
            if insight_improvement:
                new_improvements.append(insight_improvement)
        
        return new_improvements
    
    def _analyze_pending_observations(
        self,
        cycle_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        分析待处理的观察记录
        
        检查未分析的观察记录，尝试提取可操作的改进建议和错误模式。
        """
        result = {
            "analyzed_count": 0,
            "insights": [],
            "high_priority_insights": [],
            "error_patterns": []
        }
        
        unanalyzed_count = cycle_context.get("observations_unanalyzed", 0)
        
        if unanalyzed_count <= 0:
            return result
        
        # 获取自我反思数据用于分析
        reflection_data = cycle_context.get("self_reflection_data", {})
        
        # 从反思数据中提取未处理的观察
        recent_observations = reflection_data.get("recent_observations", [])
        failure_patterns = cycle_context.get("failure_patterns", [])
        
        # 分析观察记录
        observations_to_analyze = recent_observations[-self.OBSERVATION_ANALYSIS_BATCH_SIZE:]
        
        for obs in observations_to_analyze:
            insight = self._extract_insight_from_observation(obs, failure_patterns)
            if insight:
                result["insights"].append(insight)
                result["analyzed_count"] += 1
                
                if insight.get("priority", "low") == "high":
                    result["high_priority_insights"].append(insight)
        
        # 提取错误模式
        result["error_patterns"] = self._identify_error_patterns(
            observations_to_analyze,
            failure_patterns
        )
        
        return result
    
    def _extract_insight_from_observation(
        self,
        observation: Dict[str, Any],
        failure_patterns: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        从单个观察记录中提取洞察
        
        Args:
            observation: 观察记录
            failure_patterns: 已知失败模式
            
        Returns:
            提取的洞察，或None
        """
        obs_type = observation.get("type", "")
        obs_content = observation.get("content", "")
        obs_metrics = observation.get("metrics", {})
        
        # 检测性能问题
        if obs_type in ["performance", "resource_usage"]:
            cpu_usage = obs_metrics.get("cpu_usage", 0)
            memory_usage = obs_metrics.get("memory_usage", 0)
            
            if cpu_usage > 80 or memory_usage > 80:
                return {
                    "type": "performance_bottleneck",
                    "source": observation,
                    "priority": "high" if cpu_usage > 90 or memory_usage > 90 else "medium",
                    "description": f"检测到资源使用过高: CPU={cpu_usage}%, Memory={memory_usage}%",
                    "suggested_action": "优化相关技能的资源使用效率"
                }
        
        # 检测错误
        if obs_type in ["error", "failure", "exception"]:
            return {
                "type": "error_pattern",
                "source": observation,
                "priority": "high",
                "description": f"检测到错误: {obs_content[:200]}",
                "suggested_action": "添加错误处理或自动恢复机制"
            }
        
        # 检测改进机会