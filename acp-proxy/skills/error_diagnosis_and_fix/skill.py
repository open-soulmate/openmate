# acp-proxy/skills/error_diagnosis_and_fix/skill.py

import re
import ast
import os
import subprocess
import importlib
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# 假设的BaseSkill基类
class BaseSkill:
    """技能基类，所有技能都应该继承此类"""
    def __init__(self):
        self.name = "base_skill"
        self.version = "1.0.0"
        
    def execute(self, *args, **kwargs):
        """执行技能的主要方法"""
        raise NotImplementedError


@dataclass
class ErrorAnalysis:
    """错误分析结果数据类"""
    error_type: str
    message: str
    stack_trace: Optional[str] = None
    relevant_variables: Optional[Dict[str, Any]] = None
    line_number: Optional[int] = None
    file_path: Optional[str] = None


@dataclass
class ProposedFix:
    """建议的修复方案数据类"""
    fix_description: str
    fix_type: str
    code_patch: Optional[str] = None
    command: Optional[str] = None
    confidence_score: float = 0.0
    risk_assessment: str = "low"


@dataclass
class AutoFixResult:
    """自动修复结果数据类"""
    error_analysis: ErrorAnalysis
    proposed_fix: ProposedFix
    applied: bool
    application_result: str
    fix_timestamp: str
    backup_path: Optional[str] = None


class ErrorDiagnosisAndFixSkill(BaseSkill):
    """错误自诊断与修复技能"""
    
    def __init__(self):
        super().__init__()
        self.name = "error_diagnosis_and_fix"
        self.version = "1.0.0"
        self.repair_log_file = "repair_history.log"
        self.backup_dir = "backups/error_fixes"
        
        # 初始化修复策略库
        self.fix_strategies = self._initialize_fix_strategies()
        
        # 确保备份目录存在
        Path(self.backup_dir).mkdir(parents=True, exist_ok=True)
    
    def _initialize_fix_strategies(self) -> Dict[str, List[Dict]]:
        """初始化错误修复策略库"""
        return {
            "ImportError": [
                {
                    "pattern": r"ModuleNotFoundError: No module named '(\w+)'",
                    "fix_type": "install_package",
                    "description": "自动安装缺失的Python包",
                    "command": "pip install {package_name}",
                    "confidence": 0.9
                },
                {
                    "pattern": r"ImportError: cannot import name '(\w+)' from '(\w+)'",
                    "fix_type": "update_import",
                    "description": "更新导入语句",
                    "code_patch": "from {module} import {name}",
                    "confidence": 0.8
                }
            ],
            "AttributeError": [
                {
                    "pattern": r"'(\w+)' object has no attribute '(\w+)'",
                    "fix_type": "add_attribute",
                    "description": "为对象添加缺失的属性",
                    "code_patch": "{object_name}.{attr_name} = {default_value}",
                    "confidence": 0.7
                }
            ],
            "ValueError": [
                {
                    "pattern": r"could not convert string to float: '(\w+)'",
                    "fix_type": "type_conversion",
                    "description": "修正类型转换错误",
                    "code_patch": "float({value})",
                    "confidence": 0.8
                },
                {
                    "pattern": r"invalid literal for int\(\) with base 10: '(\w+)'",
                    "fix_type": "type_conversion",
                    "description": "修正整数转换错误",
                    "code_patch": "int({value})",
                    "confidence": 0.8
                }
            ],
            "SyntaxError": [
                {
                    "pattern": r"unexpected EOF while parsing",
                    "fix_type": "add_missing_bracket",
                    "description": "添加缺失的括号",
                    "code_patch": ")",
                    "confidence": 0.6
                }
            ],
            "KeyError": [
                {
                    "pattern": r"KeyError: '(\w+)'",
                    "fix_type": "check_key_exists",
                    "description": "检查键是否存在",
                    "code_patch": "if '{key}' in {dict_name}:",
                    "confidence": 0.7
                }
            ],
            "TypeError": [
                {
                    "pattern": r"unsupported operand type\(s\) for (\w+): '(\w+)' and '(\w+)'",
                    "fix_type": "type_checking",
                    "description": "添加类型检查",
                    "code_patch": "if not isinstance({operand}, {expected_type}):",
                    "confidence": 0.7
                }
            ]
        }
    
    def diagnose_and_fix(self, error_log: str, context_code_files: List[str]) -> AutoFixResult:
        """
        主要方法：诊断错误并尝试修复
        
        Args:
            error_log: 错误日志字符串
            context_code_files: 相关的代码文件路径列表
            
        Returns:
            AutoFixResult: 修复结果对象
        """
        try:
            # 1. 分析错误日志
            error_analysis = self._analyze_error_log(error_log)
            
            # 2. 查找匹配的修复策略
            proposed_fix = self._find_fix_strategy(error_analysis)
            
            # 3. 尝试应用修复
            applied, application_result, backup_path = self._apply_fix(
                proposed_fix, 
                context_code_files, 
                error_analysis
            )
            
            # 4. 记录修复到知识库
            self._log_repair_to_knowledge_base(error_analysis, proposed_fix, applied, application_result)
            
            # 5. 创建修复结果
            fix_result = AutoFixResult(
                error_analysis=error_analysis,
                proposed_fix=proposed_fix,
                applied=applied,
                application_result=application_result,
                fix_timestamp=datetime.now().isoformat(),
                backup_path=backup_path
            )
            
            return fix_result
            
        except Exception as e:
            # 创建失败的修复结果
            error_analysis = ErrorAnalysis(
                error_type="DiagnosisError",
                message=f"错误诊断过程失败: {str(e)}",
                stack_trace=None,
                relevant_variables=None
            )
            
            proposed_fix = ProposedFix(
                fix_description="无法自动诊断和修复",
                fix_type="manual_review",
                confidence_score=0.0,
                risk_assessment="high"
            )
            
            return AutoFixResult(
                error_analysis=error_analysis,
                proposed_fix=proposed_fix,
                applied=False,
                application_result="failed",
                fix_timestamp=datetime.now().isoformat()
            )
    
    def _analyze_error_log(self, error_log: str) -> ErrorAnalysis:
        """
        分析错误日志，提取关键信息
        """
        # 提取错误类型
        error_type_match = re.search(r"(\w+Error|Exception):", error_log)
        error_type = error_type_match.group(1) if error_type_match else "UnknownError"
        
        # 提取错误消息
        message_match = re.search(r"(?:Error|Exception):\s*(.+?)(?:\n|$)", error_log)