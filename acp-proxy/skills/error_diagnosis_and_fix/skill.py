# acp-proxy/skills/error_diagnosis_and_fix/skill.py
"""
错误自诊断与修复技能

负责捕获、分类和分析错误日志，基于历史错误模式和已知修复方案自动生成修复补丁。
"""

import re
import os
import json
import shutil
import subprocess
import importlib
from datetime import datetime
from enum import Enum
from typing import List, Dict, Any, Optional, Tuple, Set
from dataclasses import dataclass, field, asdict
from pathlib import Path
from abc import ABC, abstractmethod
import traceback
import ast
import difflib


# ==================== 基础类定义 ====================

class BaseSkill(ABC):
    """技能基类"""
    
    def __init__(self, name: str, description: str = ""):
        self.name = name
        self.description = description
        self.logger = None
        self._initialized = False
    
    @abstractmethod
    async def initialize(self) -> bool:
        """初始化技能"""
        pass
    
    @abstractmethod
    async def execute(self, **kwargs) -> Any:
        """执行技能"""
        pass
    
    async def cleanup(self) -> None:
        """清理资源"""
        pass
    
    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(name='{self.name}')>"


# ==================== 数据类定义 ====================

class ErrorCategory(Enum):
    """错误类别枚举"""
    IMPORT_ERROR = "ImportError"
    ATTRIBUTE_ERROR = "AttributeError"
    VALUE_ERROR = "ValueError"
    TYPE_ERROR = "TypeError"
    KEY_ERROR = "KeyError"
    INDEX_ERROR = "IndexError"
    NAME_ERROR = "NameError"
    SYNTAX_ERROR = "SyntaxError"
    RUNTIME_ERROR = "RuntimeError"
    FILE_NOT_FOUND = "FileNotFoundError"
    PERMISSION_ERROR = "PermissionError"
    CONNECTION_ERROR = "ConnectionError"
    TIMEOUT_ERROR = "TimeoutError"
    CUSTOM_EXCEPTION = "CustomException"
    UNKNOWN = "Unknown"


class FixStatus(Enum):
    """修复状态枚举"""
    SUCCESS = "success"
    PARTIAL = "partial"
    CONFLICT = "conflict"
    FAILED = "failed"
    SKIPPED = "skipped"
    NEEDS_MANUAL = "needs_manual"


class FixStrategy(Enum):
    """修复策略枚举"""
    AUTO_INSTALL = "auto_install"
    ADD_DEFAULT = "add_default"
    TYPE_CONVERSION = "type_conversion"
    IMPORT_FIX = "import_fix"
    ATTRIBUTE_INIT = "attribute_init"
    VALUE_VALIDATION = "value_validation"
    KEY_CHECK = "key_check"
    INDEX_CHECK = "index_check"
    SYNTAX_CORRECTION = "syntax_correction"
    RETRY_WITH_FALLBACK = "retry_with_fallback"
    CUSTOM_PATCH = "custom_patch"


@dataclass
class ErrorInfo:
    """错误信息数据类"""
    category: ErrorCategory
    error_type: str
    message: str
    traceback_lines: List[str]
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    function_name: Optional[str] = None
    variables: Dict[str, Any] = field(default_factory=dict)
    related_packages: List[str] = field(default_factory=list)
    severity: str = "medium"  # low, medium, high, critical
    raw_log: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "category": self.category.value,
            "error_type": self.error_type,
            "message": self.message,
            "traceback_lines": self.traceback_lines,
            "file_path": self.file_path,
            "line_number": self.line_number,
            "function_name": self.function_name,
            "variables": self.variables,
            "related_packages": self.related_packages,
            "severity": self.severity
        }


@dataclass
class FixPatch:
    """修复补丁数据类"""
    strategy: FixStrategy
    description: str
    file_path: str
    original_code: str
    fixed_code: str
    line_start: int
    line_end: int
    confidence: float  # 0.0 - 1.0
    dependencies: List[str] = field(default_factory=list)
    commands: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "strategy": self.strategy.value,
            "description": self.description,
            "file_path": self.file_path,
            "original_code": self.original_code,
            "fixed_code": self.fixed_code,
            "line_start": self.line_start,
            "line_end": self.line_end,
            "confidence": self.confidence,
            "dependencies": self.dependencies,
            "commands": self.commands
        }


@dataclass
class ApplicationResult:
    """应用结果数据类"""
    status: FixStatus
    message: str
    backup_path: Optional[str] = None
    diff: Optional[str] = None
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


@dataclass
class AutoFixResult:
    """自动修复结果数据类"""
    error_analysis: ErrorInfo
    proposed_fix: Optional[FixPatch]
    applied: bool
    application_result: Optional[ApplicationResult]
    alternative_fixes: List[FixPatch] = field(default_factory=list)
    knowledge_entry_id: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        result = {
            "error_analysis": self.error_analysis.to_dict(),
            "proposed_fix": self.proposed_fix.to_dict() if self.proposed_fix else None,
            "applied": self.applied,
            "application_result": {
                "status": self.application_result.status.value,
                "message": self.application_result.message,
                "backup_path": self.application_result.backup_path,
                "diff": self.application_result.diff,
                "errors": self.application_result.errors,
                "warnings": self.application_result.warnings
            } if self.application_result else None,
            "alternative_fixes": [f.to_dict() for f in self.alternative_fixes],
            "knowledge_entry_id": self.knowledge_entry_id,
            "timestamp": self.timestamp
        }
        return result


# ==================== 错误分析器 ====================

class ErrorLogParser:
    """错误日志解析器"""
    
    # 错误类型映射
    ERROR_PATTERNS: Dict[str, ErrorCategory] = {
        r"ImportError|ModuleNotFoundError": ErrorCategory.IMPORT_ERROR,
        r"AttributeError": ErrorCategory.ATTRIBUTE_ERROR,
        r"ValueError": ErrorCategory.VALUE_ERROR,
        r"TypeError": ErrorCategory.TYPE_ERROR,
        r"KeyError": ErrorCategory.KEY_ERROR,
        r"IndexError": ErrorCategory.INDEX_ERROR,
        r"NameError": ErrorCategory.NAME_ERROR,
        r"SyntaxError": ErrorCategory.SYNTAX_ERROR,
        r"RuntimeError": ErrorCategory.RUNTIME_ERROR,
        r"FileNotFoundError|IOError": ErrorCategory.FILE_NOT_FOUND,
        r"PermissionError": ErrorCategory.PERMISSION_ERROR,
        r"ConnectionError|URLError": ErrorCategory.CONNECTION_ERROR,
        r"TimeoutError|TimeoutException": ErrorCategory.TIMEOUT_ERROR,
    }
    
    # 堆栈跟踪模式
    TRACEBACK_PATTERN = re.compile(
        r'File "(.+?)", line (\d+), in (.+?)(?:\n|$)'
    )
    
    # 错误行模式
    ERROR_LINE_PATTERN = re.compile(
        r'^(\w+(?:\.\w+)*(?:Error|Exception|Warning)):\s*(.+)$',
        re.MULTILINE
    )
    
    # 变量值模式
    VARIABLE_PATTERN = re.compile(
        r'(?:variable|var|name)\s*[\'"]*(\w+)[\'"]*\s*=\s*(.+?)(?:\n|$)',
        re.IGNORECASE
    )
    
    @classmethod
    def parse(cls, error_log: str) -> ErrorInfo:
        """解析错误日志"""
        lines = error_log.strip().split('\n')
        
        # 提取错误类型和消息
        error_type, message = cls._extract_error_type_and_message(lines)