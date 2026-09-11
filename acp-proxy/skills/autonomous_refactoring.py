import json
import os
import ast
import re
from typing import Dict, List, Any, Optional
from pathlib import Path
import difflib
from datetime import datetime

class AutonomousRefactoring:
    """自主重构器：分析代码库状态并生成安全的代码改进"""
    
    def __init__(self, state: Dict[str, Any]):
        """
        初始化自主重构器
        
        Args:
            state: 包含系统状态的字典
        """
        self.state = state
        self.cycle = state.get("cycle", 0)
        self.observations = state.get("observations", [])
        self.history = state.get("history", [])
        self.goals = state.get("goals", {})
        self.base_path = Path("acp-proxy")
        self.skills_path = self.base_path / "skills"
        self.plugins_path = self.base_path / "plugins"
        
    def _load_state(self) -> Dict[str, Any]:
        """从state.json文件重新加载状态"""
        try:
            state_file = self.base_path / "state.json"
            if state_file.exists():
                with open(state_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            print(f"重新加载状态失败: {e}")
        return self.state
    
    def _save_state(self, state: Dict[str, Any]) -> bool:
        """保存状态到state.json文件"""
        try:
            state_file = self.base_path / "state.json"
            with open(state_file, 'w', encoding='utf-8') as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"保存状态失败: {e}")
            return False
    
    def _should_run_refactoring(self) -> bool:
        """判断是否应该运行自主重构（每10个运行周期）"""
        return self.cycle % 10 == 0
    
    def _analyze_observations(self) -> Dict[str, Any]:
        """分析观察记录，识别失败/成功模式"""
        analysis = {
            "failure_patterns": [],
            "success_patterns": [],
            "delay_observations": [],
            "performance_issues": []
        }
        
        for obs in self.observations:
            if isinstance(obs, dict):
                # 分析延迟观察
                if "delay" in obs.get("type", "").lower():
                    analysis["delay_observations"].append(obs)
                # 分析失败模式
                if obs.get("status") == "failure":
                    analysis["failure_patterns"].append(obs)
                # 分析性能问题
                if "performance" in obs.get("description", "").lower():
                    analysis["performance_issues"].append(obs)
        
        return analysis
    
    def _analyze_goals_progress(self) -> Dict[str, Any]:
        """分析目标进度，识别需要优先改进的领域"""
        goal_analysis = {
            "low_progress_goals": [],
            "critical_goals": []
        }
        
        for goal_name, goal_info in self.goals.items():
            if isinstance(goal_info, dict):
                progress = goal_info.get("progress", 0)
                priority = goal_info.get("priority", "medium")
                
                if progress < 30:  # 进度低于30%的目标
                    goal_analysis["low_progress_goals"].append({
                        "name": goal_name,
                        "progress": progress,
                        "priority": priority,
                        "description": goal_info.get("description", "")
                    })
                
                # 优先关注自编程和错误自修复目标
                if priority == "high" or "自编程" in goal_name or "自修复" in goal_name:
                    goal_analysis["critical_goals"].append({
                        "name": goal_name,
                        "progress": progress,
                        "priority": priority,
                        "description": goal_info.get("description", "")
                    })
        
        return goal_analysis
    
    def _find_target_files(self) -> List[Path]:
        """查找skills/和plugins/目录下的可修改文件"""
        target_files = []
        
        # 查找skills目录下的Python文件
        if self.skills_path.exists():
            for file in self.skills_path.glob("*.py"):
                if file.name != "autonomous_refactoring.py":  # 排除自身
                    target_files.append(file)
        
        # 查找plugins目录下的Python文件
        if self.plugins_path.exists():
            for file in self.plugins_path.glob("*.py"):
                target_files.append(file)
        
        return target_files
    
    def _analyze_code_structure(self, file_path: Path) -> Dict[str, Any]:
        """分析代码文件的结构"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                code = f.read()
            
            tree = ast.parse(code)
            
            analysis = {
                "functions": [],
                "classes": [],
                "imports": [],
                "complexity": 0
            }
            
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    analysis["functions"].append({
                        "name": node.name,
                        "line": node.lineno,
                        "args": [arg.arg for arg in node.args.args]
                    })
                elif isinstance(node, ast.ClassDef):
                    analysis["classes"].append(node.name)
                elif isinstance(node, (ast.Import, ast.ImportFrom)):
                    analysis["imports"].append(ast.dump(node))
            
            # 简单复杂度估计（基于函数和类的数量）
            analysis["complexity"] = len(analysis["functions"]) + len(analysis["classes"]) * 2
            
            return analysis
        except Exception as e:
            print(f"分析文件 {file_path} 失败: {e}")
            return {"functions": [], "classes": [], "imports": [], "complexity": 0}
    