# acp-proxy/skills/programming_self_evolution/skill.py

import ast
import os
import re
import tempfile
import unittest
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime

# 假设BaseSkill存在于项目中
try:
    from acp_proxy.skills.base import BaseSkill
except ImportError:
    # 提供一个简化的替代实现用于测试
    class BaseSkill:
        def __init__(self, name: str, description: str):
            self.name = name
            self.description = description
        
        def register(self):
            """注册技能的占位方法"""
            pass


@dataclass
class CodeImprovementResult:
    """代码改进结果数据类"""
    original_code: str
    improved_code: str
    analysis_report: Dict[str, Any]
    validation_passed: bool
    validation_details: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """将结果转换为字典"""
        return {
            'original_code': self.original_code,
            'improved_code': self.improved_code,
            'analysis_report': self.analysis_report,
            'validation_passed': self.validation_passed,
            'validation_details': self.validation_details,
            'timestamp': datetime.now().isoformat()
        }


class ProgrammingEvolutionSkill(BaseSkill):
    """
    自编程技能模块
    允许代理分析现有代码，识别改进点，并自动生成、测试与集成改进后的代码版本
    """
    
    def __init__(self):
        super().__init__(
            name="programming_self_evolution",
            description="自编程技能，用于分析、改进和优化代码"
        )
        
        # 内置最佳实践模板
        self.best_practice_templates = {
            'performance': self._performance_optimization_template,
            'readability': self._readability_improvement_template,
            'modularity': self._modularity_enhancement_template,
            'error_handling': self._error_handling_template
        }
        
        # 代码模式库
        self.code_patterns = {
            'for_loop': r'for\s+\w+\s+in\s+range\((\d+)\):',
            'if_else': r'if\s+.*:',
            'function_def': r'def\s+\w+\(.*\):',
            'class_def': r'class\s+\w+.*:',
            'try_except': r'try:',
            'list_comprehension': r'\[.*for.*in.*\]'
        }
    
    def analyze_and_improve(
        self, 
        target_code_path: str, 
        improvement_goals: List[str]
    ) -> CodeImprovementResult:
        """
        分析并改进目标代码
        
        Args:
            target_code_path: 目标代码文件路径
            improvement_goals: 改进目标列表，如 ['performance', 'readability', 'modularity']
            
        Returns:
            CodeImprovementResult: 代码改进结果
        """
        # 1. 读取原始代码
        original_code = self._read_code_file(target_code_path)
        if not original_code:
            return self._create_error_result(target_code_path, "无法读取目标文件")
        
        # 2. 静态代码分析
        analysis_report = self._analyze_code(original_code, improvement_goals)
        
        # 3. 生成改进后的代码
        improved_code = self._generate_improved_code(
            original_code, 
            improvement_goals, 
            analysis_report
        )
        
        # 4. 验证改进后的代码
        validation_result = self._validate_improvement(
            original_code, 
            improved_code, 
            target_code_path
        )
        
        # 5. 创建结果
        result = CodeImprovementResult(
            original_code=original_code,
            improved_code=improved_code,
            analysis_report=analysis_report,
            validation_passed=validation_result['passed'],
            validation_details=validation_result['details']
        )
        
        return result
    
    def _read_code_file(self, file_path: str) -> Optional[str]:
        """读取代码文件内容"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            return None
        except Exception as e:
            return None
    
    def _analyze_code(
        self, 
        code: str, 
        improvement_goals: List[str]
    ) -> Dict[str, Any]:
        """分析代码质量"""
        analysis = {
            'metrics': {},
            'issues': [],
            'suggestions': [],
            'modules_identified': []
        }
        
        try:
            # 1. 静态代码质量分析
            static_analysis = self._perform_static_analysis(code)
            analysis['metrics'] = static_analysis['metrics']
            analysis['issues'].extend(static_analysis['issues'])
            
            # 2. 与最佳实践模板比对
            template_analysis = self._compare_with_templates(code, improvement_goals)
            analysis['suggestions'].extend(template_analysis['suggestions'])
            
            # 3. 识别可模块化部分
            modularity_analysis = self._identify_modular_parts(code)
            analysis['modules_identified'] = modularity_analysis['modules']
            analysis['issues'].extend(modularity_analysis['issues'])
            
            # 4. 检查特定改进目标
            for goal in improvement_goals:
                if goal == 'performance':
                    perf_issues = self._analyze_performance(code)
                    analysis['issues'].extend(perf_issues)
                elif goal == 'readability':
                    read_issues = self._analyze_readability(code)
                    analysis['issues'].extend(read_issues)
        
        except SyntaxError as e:
            analysis['issues'].append({
                'type': 'syntax_error',
                'message': str(e),
                'severity': 'critical'
            })
        
        return analysis
    
    def _perform_static_analysis(self, code: str) -> Dict[str, Any]:
        """执行静态代码分析"""
        metrics = {
            'lines_of_code': len(code.split('\n')),
            'complexity': self._calculate_complexity(code),
            'functions_count': len(re.findall(r'def\s+\w+', code)),
            'classes_count': len(re.findall(r'class\s+\w+', code))
        }
        
        issues = []
        
        # 使用ast分析
        try:
            tree = ast.parse(code)
            
            # 检查潜在问题
            for node in ast.walk(tree):
                # 检查函数长度
                if isinstance(node, ast.FunctionDef):
                    func_lines = len([n for n in ast.walk(node)])
                    if func_lines > 50:
                        issues.append({
                            'type': 'long_function',
                            'message': f"函数 '{node.name}' 过长 ({func_lines} 行)",
                            'line': node.lineno,
                            'severity': 'medium'
                        })
                
                # 检查过深的嵌套
                if isinstance(node, (ast.For, ast.While, ast.If)):
                    depth = self._calculate_nesting_depth(node)
                    if depth > 4:
                        issues.append({
                            'type': 'deep_nesting',
                            'message': f"过深的嵌套层级 ({depth} 层)",
                            'line': node.lineno,
                            'severity': 'medium'
                        })
        
        except SyntaxError as e:
            issues.append({
                'type': 'syntax_error',
                'message': str(e),
                'severity': 'critical'
            })
        
        return {'metrics': metrics, 'issues': issues}
    
    def _calculate_complexity(self, code: str) -> int:
        """计算代码复杂度（简化版）"""
        complexity = 1
        
        # 计算控制结构
        complexity += len(re.findall(r'if\s+', code))
        complexity += len(re.findall(r'for\s+', code)) * 2
        complexity += len(re.findall(r'while\s+', code)) * 3