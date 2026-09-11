import json
import os
import importlib
import ast
import traceback
from pathlib import Path
from typing import Dict, Any, List, Optional
import sys

# 确保技能模块可以正确导入
current_dir = Path(__file__).parent
project_root = current_dir.parent.parent
sys.path.insert(0, str(project_root))

class AutonomousRefactoring:
    """
    自主重构器技能
    能够定期分析代码库状态、观察记录和目标进度，生成并实施小的、安全的代码改进任务
    """
    
    def __init__(self, state: Dict[str, Any]):
        """
        初始化自主重构器
        
        Args:
            state: 状态字典，包含周期数、观察记录等信息
        """
        self.state = state
        self.state_file_path = Path("acp-proxy/state.json")
        self.improvement_history = []
        
    def analyze_and_plan(self) -> Optional[Dict[str, Any]]:
        """
        基于反思模式和目标优先级，分析当前状态并生成代码改进计划
        
        Returns:
            改进计划字典，包含目标文件、修改内容等信息
        """
        try:
            # 解析当前状态
            cycle_count = self.state.get("cycle_count", 0)
            observations = self.state.get("observations", [])
            goals = self.state.get("goals", {})
            history = self.state.get("history", [])
            
            # 分析反思模式
            patterns = self._analyze_patterns(observations)
            
            # 检查目标进度
            target_goals = self._prioritize_goals(goals)
            
            # 只有每10个周期执行一次
            if cycle_count % 10 != 0:
                return None
            
            # 基于分析结果生成改进计划
            plan = {
                "target_file": None,
                "target_function": None,
                "modification_logic": "",
                "verification_method": "",
                "priority": 0,
                "patterns_addressed": []
            }
            
            # 策略1：处理观察记录分析延迟
            if "analysis_delay" in patterns:
                plan["target_file"] = "acp-proxy/plugins/analysis_plugin.py"
                plan["target_function"] = "analyze_observation"
                plan["modification_logic"] = "添加异步处理和缓存机制，减少重复分析"
                plan["verification_method"] = "验证分析延迟是否降低50%"
                plan["priority"] = 3
                plan["patterns_addressed"].append("analysis_delay")
            
            # 策略2：改进自编程能力（优先级最高）
            elif goals.get("self_programming", {}).get("progress", 0) < 50:
                plan["target_file"] = "acp-proxy/skills/autonomous_refactoring.py"
                plan["target_function"] = "analyze_and_plan"
                plan["modification_logic"] = "增强模式识别能力，添加机器学习模型进行代码分析"
                plan["verification_method"] = "验证改进计划生成成功率提高20%"
                plan["priority"] = 5
                plan["patterns_addressed"].append("self_programming")
            
            # 策略3：处理错误修复模式
            elif "error_pattern" in patterns:
                plan["target_file"] = "acp-proxy/plugins/error_handler.py"
                plan["target_function"] = "handle_error"
                plan["modification_logic"] = "添加更详细的错误分类和修复建议"
                plan["verification_method"] = "验证错误修复成功率提高30%"
                plan["priority"] = 4
                plan["patterns_addressed"].append("error_pattern")
            
            # 默认策略：通用代码优化
            else:
                plan["target_file"] = "acp-proxy/skills/base_skill.py"
                plan["target_function"] = "execute"
                plan["modification_logic"] = "添加性能监控和日志记录，优化执行流程"
                plan["verification_method"] = "验证执行时间减少10%"
                plan["priority"] = 2
                plan["patterns_addressed"].append("general_optimization")
            
            return plan
            
        except Exception as e:
            print(f"分析计划生成失败: {e}")
            traceback.print_exc()
            return None
    
    def _analyze_patterns(self, observations: List[Dict]) -> Dict[str, Any]:
        """
        分析观察记录中的模式
        
        Args:
            observations: 观察记录列表
            
        Returns:
            检测到的模式字典
        """
        patterns = {}
        
        # 分析延迟模式