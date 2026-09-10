"""
自编程进化技能模块

允许代理分析现有代码（特别是自身技能和插件），识别改进点，
并自动生成、测试与集成改进后的代码版本。
"""

import ast
import os
import re
import sys
import json
import tempfile
import subprocess
import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
from contextlib import contextmanager


# ============================================================
# 基础技能类定义（如不存在则在此定义）
# ============================================================

class BaseSkill(ABC):
    """技能基类"""
    
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.enabled = True
        self.metadata: Dict[str, Any] = {}
        
    @abstractmethod
    async def execute(self, **kwargs) -> Any:
        """执行技能"""
        pass
    
    def get_info(self) -> Dict[str, Any]:
        """获取技能信息"""
        return {
            "name": self.name,
            "description": self.description,
            "enabled": self.enabled,
            "metadata": self.metadata
        }


# ============================================================
# 数据类定义
# ============================================================

class ImprovementType(Enum):
    """改进类型枚举"""
    PERFORMANCE = "performance"
    READABILITY = "readability"
    MODULARITY = "modularity"
    SECURITY = "security"
    ERROR_HANDLING = "error_handling"
    COMPLEXITY_REDUCTION = "complexity_reduction"
    MISSING_FUNCTIONALITY = "missing_functionality"
    BEST_PRACTICE = "best_practice"


@dataclass
class AnalysisIssue:
    """分析发现的问题"""
    issue_type: str
    severity: str  # "low", "medium", "high", "critical"
    location: str  # 行号或代码块位置
    description: str
    suggestion: str
    code_snippet: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "issue_type": self.issue_type,
            "severity": self.severity,
            "location": self.location,
            "description": self.description,
            "suggestion": self.suggestion,
            "code_snippet": self.code_snippet
        }


@dataclass
class AnalysisReport:
    """分析报告"""
    timestamp: str
    target_file: str
    total_lines: int
    issues: List[AnalysisIssue] = field(default_factory=list)
    complexity_score: float = 0.0
    quality_score: float = 0.0
    modularity_suggestions: List[str] = field(default_factory=list)
    best_practice_violations: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "target_file": self.target_file,
            "total_lines": self.total_lines,
            "issues": [issue.to_dict() for issue in self.issues],
            "complexity_score": self.complexity_score,
            "quality_score": self.quality_score,
            "modularity_suggestions": self.modularity_suggestions,
            "best_practice_violations": self.best_practice_violations
        }


@dataclass
class ValidationResult:
    """验证结果"""
    passed: bool
    test_count: int
    passed_count: int
    failed_count: int
    error_count: int
    details: str
    execution_time: float = 0.0
    output: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "test_count": self.test_count,
            "passed_count": self.passed_count,
            "failed_count": self.failed_count,
            "error_count": self.error_count,
            "details": self.details,
            "execution_time": self.execution_time,
            "output": self.output
        }


@dataclass
class CodeImprovementResult:
    """代码改进结果"""
    original_code: str
    improved_code: str
    analysis_report: AnalysisReport
    validation_passed: bool
    validation_details: ValidationResult
    improvement_summary: str = ""
    applied_improvements: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "original_code": self.original_code,
            "improved_code": self.improved_code,
            "analysis_report": self.analysis_report.to_dict(),
            "validation_passed": self.validation_passed,
            "validation_details": self.validation_details.to_dict(),
            "improvement_summary": self.improvement_summary,
            "applied_improvements": self.applied_improvements
        }


# ============================================================
# 代码分析器
# ============================================================

class CodeAnalyzer:
    """代码静态分析器"""
    
    # 预设最佳实践模板
    BEST_PRACTICES = {
        "function_length": {
            "max_lines": 50,
            "message": "函数过长，建议拆分为更小的函数"
        },
        "parameter_count": {
            "max_params": 5,
            "message": "函数参数过多，建议使用数据类或字典封装"
        },
        "nesting_depth": {
            "max_depth": 4,
            "message": "嵌套层次过深，建议提取子函数或使用提前返回"
        },
        "line_length": {
            "max_chars": 100,
            "message": "行长度超过建议值"
        },
        "docstring_required": True,
        "type_hints_required": True,
        "magic_numbers": True,
        "global_variables": True
    }
    
    # 代码模板
    TEMPLATES = {
        "function_with_docstring": '''def {function_name}({parameters}) -> {return_type}:
    """
    {docstring}
    
    Args:
        {args_docstring}
        
    Returns:
        {return_docstring}
    """
    {body}
''',
        "class_with_docstring": '''class {class_name}:
    """
    {class_docstring}
    """
    
    def __init__(self{init_params}):
        """初始化{class_name}"""
        {init_body}
''',
        "error_handling": '''try:
    {original_code}
except {exception_type} as e:
    {error_handling_code}
''',
        "list_comprehension": '''[{expression} for {item} in {iterable}{condition}]
''',
        "context_manager": '''with {expression} as {variable}:
    {body}
'''
    }
    
    # 性能优化模式
    PERFORMANCE_PATTERNS = {
        "string_concatenation_loop": {
            "pattern": r"(\w+)\s*\+=\s*['\"]",
            "suggestion": "使用列表和join()替代字符串循环拼接",
            "template": "result = ''.join([{items}])"
        },
        "list_append_loop": {
            "pattern": r"for\s+.*:\s*\n\s*(\w+)\.append\(",
            "suggestion": "考虑使用列表推导式替代循环append",
            "template": "[{expression} for {item} in {iterable}]"
        },
        "repeated_len_call": {
            "pattern": r"for\s+\w+\s+in\s+range\(len\((\w+)\)\):",
            "suggestion": "直接迭代序列，使用enumerate()获取索引",
            "template": "for i, item in enumerate({collection}):"
        },
        "unnecessary_list_creation": {
            "pattern": r"for\s+(\w+)\s+in\s+\[.*\]:",
            "suggestion": "使用生成器表达式替代列表（如果只是迭代）",
            "template": "for {item} in ({expression}):"
        }
    }
    
    def __init__(self):
        self.issues: List[AnalysisIssue] = []
        self.complexity_score = 0.0
        self.quality_score = 100.0
        
    def analyze(self, code: str, file_path: str, goals: List[str]) -> AnalysisReport:
        """执行完整的代码分析"""
        self.issues = []
        self.complexity_score = 0.0
        self.quality_score = 100.0
        
        lines = code.split('\n')
        
        # 执行各种分析
        self._analyze_ast(code, file_path)