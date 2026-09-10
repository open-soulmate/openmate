# acp-proxy/skills/error_diagnosis_and_fix/skill.py

import re
import ast
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

# 假设这些模块已存在
from acp_proxy.skills.base_skill import BaseSkill
from acp_proxy.knowledge.base import KnowledgeBase


class ApplicationResult(Enum):
    SUCCESS = "success"
    CONFLICT = "conflict"
    FAILED = "failed"


@dataclass
class ErrorAnalysis:
    error_type: str
    message: str
    stack_trace: str
    related_variables: Dict[str, Any]
    file_path: Optional[str] = None
    line_number: Optional[int] = None


@dataclass
class ProposedFix:
    description: str
    code_patch: str
    confidence: float
    dependencies: List[str] = None
    requires_confirmation: bool = False


@dataclass
class AutoFixResult:
    error_analysis: ErrorAnalysis
    proposed_fix: Optional[ProposedFix]
    applied: bool
    application_result: Optional[ApplicationResult] = None
    backup_path: Optional[str] = None
    notes: List[str] = None


class ErrorDiagnosisAndFixSkill(BaseSkill):
    """
    错误自诊断与修复技能
    负责捕获、分类和分析系统错误日志，基于历史模式自动生成修复补丁
    """
    
    def __init__(self):
        super().__init__(
            name="error_diagnosis_and_fix",
            version="1.0.0",
            description="错误自诊断与修复技能"
        )
        self.knowledge_base = KnowledgeBase()
        self._init_fix_patterns()
    
    def _init_fix_patterns(self):
        """初始化修复策略库"""
        self.fix_patterns = {
            "ImportError": [
                self._fix_missing_import,
                self._fix_circular_import,
            ],
            "AttributeError": [
                self._fix_missing_attribute,
                self._fix_typo_in_attribute,
            ],
            "ValueError": [
                self._fix_value_error,
                self._fix_type_conversion,
            ],
            "TypeError": [
                self._fix_type_error,
            ],
            "NameError": [
                self._fix_undefined_name,
            ],
            "SyntaxError": [
                self._fix_syntax_error,
            ],
            "IndexError": [
                self._fix_index_error,
            ],
            "KeyError": [
                self._fix_key_error,
            ],
            "PermissionError": [
                self._fix_permission_error,
            ],
            "custom": [
                self._fix_custom_exception,
            ]
        }
    
    def diagnose_and_fix(
        self,
        error_log: str,
        context_code_files: List[str]
    ) -> AutoFixResult:
        """
        主要方法：诊断错误并尝试修复
        
        Args:
            error_log: 错误日志内容
            context_code_files: 相关代码文件路径列表
            
        Returns:
            AutoFixResult: 诊断和修复结果
        """
        try:
            # 1. 解析错误日志
            error_analysis = self._analyze_error_log(error_log)
            
            # 2. 基于错误类型查找修复策略
            proposed_fix = self._find_fix_strategy(error_analysis, context_code_files)
            
            # 3. 如果找到修复策略，尝试应用
            applied = False
            application_result = None
            backup_path = None
            
            if proposed_fix:
                # 检查是否需要确认
                if proposed_fix.requires_confirmation:
                    return AutoFixResult(
                        error_analysis=error_analysis,
                        proposed_fix=proposed_fix,
                        applied=False,
                        notes=["需要人工确认后才能应用修复"]
                    )
                
                # 应用修复
                success, result, backup = self._apply_fix(
                    proposed_fix,
                    context_code_files,
                    error_analysis
                )
                
                applied = success
                application_result = result
                backup_path = backup
            
            # 4. 记录到知识库
            self._log_to_knowledge_base(
                error_analysis,
                proposed_fix,
                applied,
                application_result
            )
            
            # 5. 构建结果
            return AutoFixResult(
                error_analysis=error_analysis,
                proposed_fix=proposed_fix,
                applied=applied,
                application_result=application_result,
                backup_path=backup_path,
                notes=self._generate_notes(error_analysis, proposed_fix, applied)
            )
            
        except Exception as e:
            return AutoFixResult(
                error_analysis=ErrorAnalysis(
                    error_type="DiagnosisError",
                    message=f"诊断过程出错: {str(e)}",
                    stack_trace="",
                    related_variables={}
                ),
                proposed_fix=None,
                applied=False,
                application_result=ApplicationResult.FAILED,
                notes=[f"诊断失败: {str(e)}"]
            )
    
    def _analyze_error_log(self, error_log: str) -> ErrorAnalysis:
        """
        分析错误日志，提取关键信息
        """
        # 解析错误类型
        error_type = "unknown"
        message = ""
        stack_trace = ""
        related_variables = {}
        file_path = None
        line_number = None
        
        # 匹配Python标准错误格式
        error_pattern = r"(\w+Error|\w+Exception):\s*(.*?)(?:\n|$)"