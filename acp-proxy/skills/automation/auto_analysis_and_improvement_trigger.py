import os
import json
import glob
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta

class AutoAnalysisAndImprovementTrigger:
    """
    自动分析与改进触发器技能。
    在进化周期的规划阶段自动触发，确保系统持续自我改进。
    解决三个关键问题：
    1. 及时处理未分析的观察记录
    2. 确保每个进化周期至少产生一项改进
    3. 提升Agent的自我执行能力，减少对partner的依赖
    """
    
    # 技能元数据
    SKILL_NAME = "auto_analysis_and_improvement_trigger"
    DESCRIPTION = "自动分析与改进触发器，确保系统持续自我改进"
    TRIGGER_PHASE = "planning"  # 触发阶段：规划阶段
    PRIORITY = 100  # 高优先级
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        初始化技能。
        
        Args:
            config: 配置字典，可包含：
                   - min_improvements_per_cycle: 每个周期最少改进数
                   - analysis_threshold: 未分析观察记录阈值
                   - improvement_generation_strategy: 改进生成策略
        """
        self.config = config or {}
        self.min_improvements = self.config.get("min_improvements_per_cycle", 1)
        self.analysis_threshold = self.config.get("analysis_threshold", 0)
        self.improvement_strategies = [
            "skill_optimization",
            "plugin_enhancement", 
            "new_capability",
            "error_recovery",
            "performance_tuning"
        ]
        
        # 项目根目录（假设从当前文件向上回溯到acp-proxy）
        self.project_root = self._find_project_root()
        
    def _find_project_root(self) -> str:
        """找到项目根目录（acp-proxy目录）"""
        current_dir = os.path.dirname(os.path.abspath(__file__))
        while current_dir != os.path.dirname(current_dir):  # 直到根目录
            if os.path.basename(current_dir) == "acp-proxy":
                return current_dir
            current_dir = os.path.dirname(current_dir)
        
        # 如果找不到，假设当前目录结构
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    
    def observe(self, cycle_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        观察方法，在规划阶段被调用。
        
        Args:
            cycle_context: 周期上下文，包含：
                          - cycle_count: 当前周期数
                          - self_reflection_data: 自我反思数据
                          - goals_progress: 目标进度
                          - observations_unanalyzed: 未分析观察记录数量
                          - last_cycle_improvements_planned: 上个周期计划的改进数
                          - improvements_to_plan: 当前周期待规划的改进列表（可修改）
        
        Returns:
            包含触发结果的字典
        """
        improvements = self.ensure_minimum_improvements(cycle_context)
        
        # 将改进注入到待规划列表中
        if improvements:
            existing_improvements = cycle_context.get("improvements_to_plan", [])
            existing_improvements.extend(improvements)
            cycle_context["improvements_to_plan"] = existing_improvements
        
        return {
            "triggered": True,
            "improvements_generated": len(improvements),
            "total_improvements_planned": len(cycle_context.get("improvements_to_plan", [])),
            "timestamp": datetime.now().isoformat()
        }
    
    def ensure_minimum_improvements(self, cycle_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        确保最少改进数的核心方法。
        
        Args:
            cycle_context: 周期上下文
        
        Returns:
            生成的改进对象列表
        """
        improvements = []
        
        # 1. 处理未分析的观察记录
        unanalyzed_improvements = self._process_unanalyzed_observations(cycle_context)
        improvements.extend(unanalyzed_improvements)
        
        # 2. 检查并确保最少改进数
        planned_count = cycle_context.get("last_cycle_improvements_planned", 0)
        
        if planned_count < self.min_improvements:
            # 需要生成额外的改进
            additional_improvements = self._generate_forced_improvements(
                cycle_context, 
                needed_count=self.min_improvements - planned_count
            )
            improvements.extend(additional_improvements)
        
        # 3. 基于目标进度生成战略性改进
        strategic_improvements = self._generate_strategic_improvements(cycle_context)
        
        # 合并去重
        all_improvements = self._merge_improvements(improvements, strategic_improvements)
        
        return all_improvements
    
    def _process_unanalyzed_observations(self, cycle_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """处理未分析的观察记录"""
        unanalyzed_count = cycle_context.get("observations_unanalyzed", 0)
        
        if unanalyzed_count <= self.analysis_threshold:
            return []
        
        # 模拟分析未观察记录并提取改进建议
        improvements = []
        reflection_data = cycle_context.get("self_reflection_data", {})
        recent_failures = reflection_data.get("failure_patterns", [])
        
        # 根据失败模式生成改进
        if recent_failures:
            failure_pattern = recent_failures[0] if recent_failures else {}