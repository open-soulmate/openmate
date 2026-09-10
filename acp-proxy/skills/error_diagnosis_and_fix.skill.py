#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
错误诊断与修复技能
用于自动分析错误日志、定位错误根源并生成修复建议
"""

import json
import re
import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from abc import ABC, abstractmethod

# 假设基类Skill存在
try:
    from acp_proxy.skills.base_skill import Skill
except ImportError:
    # 模拟基类，用于开发测试
    class Skill(ABC):
        def __init__(self, name: str, description: str):
            self.name = name
            self.description = description
        
        @abstractmethod
        async def execute(self, *args, **kwargs) -> Any:
            pass


@dataclass
class ErrorDiagnosis:
    """错误诊断结果"""
    error_type: str = ""
    error_message: str = ""
    location: str = ""
    line_number: Optional[int] = None
    stack_trace: List[str] = None
    
    def __post_init__(self):
        if self.stack_trace is None:
            self.stack_trace = []


@dataclass
class FixSuggestion:
    """修复建议"""
    explanation: str = ""
    fixed_code_snippet: str = ""
    confidence: float = 0.0  # 置信度 0-1
    fix_type: str = ""  # "patch", "replace", "add_check", "refactor"
    risk_level: str = "low"  # "low", "medium", "high"


class ErrorDiagnosisAndFixSkill(Skill):
    """
    错误诊断与修复技能
    
    核心功能：
    1. 解析错误日志，提取关键信息
    2. 定位错误根源
    3. 生成修复建议
    
    适用于：程序运行时错误、测试失败、编译错误等
    """
    
    def __init__(self):
        super().__init__(
            name="error_diagnosis_and_fix",
            description="自动分析错误日志、定位错误根源并生成修复建议"
        )
        self.logger = logging.getLogger(self.__class__.__name__)
        
        # 初始化错误模式库（实际应用中可以加载外部配置）
        self._error_patterns = self._init_error_patterns()
    
    def _init_error_patterns(self) -> Dict[str, Dict[str, Any]]:
        """初始化错误模式库"""
        return {
            "syntax_error": {
                "pattern": r"SyntaxError|Syntax Warning",
                "priority": 1,
                "description": "语法错误"
            },
            "runtime_error": {
                "pattern": r"RuntimeError|RuntimeWarning|Exception",
                "priority": 2,
                "description": "运行时错误"
            },
            "import_error": {
                "pattern": r"ImportError|ModuleNotFoundError",
                "priority": 3,
                "description": "导入错误"
            },
            "type_error": {
                "pattern": r"TypeError",
                "priority": 4,
                "description": "类型错误"
            },
            "value_error": {
                "pattern": r"ValueError",
                "priority": 5,
                "description": "值错误"
            },
            "index_error": {
                "pattern": r"IndexError",
                "priority": 6,
                "description": "索引错误"
            },
            "key_error": {
                "pattern": r"KeyError",
                "priority": 7,
                "description": "键错误"
            },
            "attribute_error": {
                "pattern": r"AttributeError",
                "priority": 8,
                "description": "属性错误"
            },
            "zero_division": {
                "pattern": r"ZeroDivisionError",
                "priority": 9,
                "description": "零除错误"
            },
            "timeout_error": {
                "pattern": r"TimeoutError|Timeout",
                "priority": 10,
                "description": "超时错误"
            }
        }
    
    async def execute(self, *args, **kwargs) -> Dict[str, Any]:
        """技能执行入口"""
        return await self.diagnose_and_fix(**kwargs)
    