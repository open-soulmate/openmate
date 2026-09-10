import re
import ast
import subprocess
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from pathlib import Path
import importlib

# 假设的基类，需要根据实际项目调整
class BaseSkill:
    def __init__(self, skill_name: str):
        self.skill_name = skill_name
        self.logger = logging.getLogger(skill_name)
        
    def register(self, **kwargs):
        """注册技能到系统"""
        pass

@dataclass
class AutoFixResult:
    """自动修复结果数据类"""
    error_analysis: Dict[str, Any]  # 错误分析结果
    proposed_fix: str  # 建议的修复代码
    applied: bool  # 是否已应用
    application_result: str  # 应用结果，如成功、冲突、失败
    confidence: float = 0.0  # 修复置信度
    backup_created: Optional[str] = None  # 创建的备份文件路径

class ErrorDiagnosisAndFixSkill(BaseSkill):
    """错误自诊断与修复技能"""
    
    def __init__(self):
        super().__init__("ErrorDiagnosisAndFixSkill")
        self.error_patterns = self._load_error_patterns()
        self.fix_strategies = self._load_fix_strategies()
        
    def _load_error_patterns(self) -> Dict[str, Dict[str, Any]]:
        """加载错误模式库"""
        return {
            "ImportError": {
                "pattern": r"ImportError: (.*)",
                "keywords": ["import", "module", "No module named"],
                "extractor": self._extract_import_error_info
            },
            "AttributeError": {
                "pattern": r"AttributeError: (.*)",
                "keywords": ["attribute", "has no"],
                "extractor": self._extract_attribute_error_info
            },
            "ValueError": {
                "pattern": r"ValueError: (.*)",
                "keywords": ["invalid", "value", "type"],
                "extractor": self._extract_value_error_info
            },
            "TypeError": {
                "pattern": r"TypeError: (.*)",
                "keywords": ["type", "argument", "not supported"],
                "extractor": self._extract_type_error_info
            },
            "SyntaxError": {
                "pattern": r"SyntaxError: (.*)",
                "keywords": ["syntax", "invalid"],
                "extractor": self._extract_syntax_error_info
            }
        }
    
    def _load_fix_strategies(self) -> Dict[str, Callable]:
        """加载修复策略库"""
        return {
            "ImportError": self._fix_import_error,
            "AttributeError": self._fix_attribute_error,
            "ValueError": self._fix_value_error,
            "TypeError": self._fix_type_error,
            "SyntaxError": self._fix_syntax_error
        }
    
    def diagnose_and_fix(self, error_log: str, context_code_files: List[str]) -> AutoFixResult:
        """
        主要方法：诊断错误并尝试修复
        
        Args:
            error_log: 错误日志内容
            context_code_files: 相关代码文件路径列表
            
        Returns:
            AutoFixResult: 修复结果
        """
        # 1. 分析错误日志
        error_analysis = self._analyze_error(error_log)
        
        if not error_analysis["error_type"]:
            return AutoFixResult(
                error_analysis=error_analysis,
                proposed_fix="",
                applied=False,
                application_result="无法识别错误类型"
            )
        
        # 2. 生成修复方案
        proposed_fix = self._generate_fix(error_analysis)
        
        # 3. 应用修复（如果有修复方案）
        applied = False
        application_result = "无修复方案"
        backup_created = None
        
        if proposed_fix:
            applied, application_result, backup_created = self._apply_fix(
                proposed_fix, 
                context_code_files, 
                error_analysis
            )
        
        # 4. 记录到知识库
        self._log_to_knowledge_base(
            error_log, 
            error_analysis, 
            proposed_fix, 
            applied, 
            application_result
        )
        
        return AutoFixResult(
            error_analysis=error_analysis,
            proposed_fix=proposed_fix,
            applied=applied,
            application_result=application_result,
            confidence=error_analysis.get("confidence", 0.0),
            backup_created=backup_created
        )
    
    def _analyze_error(self, error_log: str) -> Dict[str, Any]:
        """分析错误日志"""
        result = {
            "error_type": None,
            "error_message": "",
            "stack_trace": [],
            "related_variables": {},
            "confidence": 0.0,
            "additional_info": {}
        }
        
        # 尝试匹配已知错误模式
        for error_type, pattern_info in self.error_patterns.items():
            match = re.search(pattern_info["pattern"], error_log, re.IGNORECASE)
            if match:
                result["error_type"] = error_type
                result["error_message"] = match.group(1)
                result["confidence"] = 0.8  # 基础置信度
                
                # 使用特定提取器提取更多信息
                extractor = pattern_info["extractor"]
                if extractor:
                    extracted_info = extractor(error_log)
                    result.update(extracted_info)
                break
        
        # 如果没有匹配到特定错误类型，进行通用分析
        if not result["error_type"]:
            result = self._generic_error_analysis(error_log)
        
        # 提取堆栈跟踪
        result["stack_trace"] = self._extract_stack_trace(error_log)
        
        return result
    
    def _extract_import_error_info(self, error_log: str) -> Dict[str, Any]:
        """提取ImportError的特定信息"""
        info = {}
        
        # 提取缺失的模块名
        match = re.search(r"No module named '(.*)'", error_log)
        if match:
            info["missing_module"] = match.group(1)
            
        # 提取尝试导入的语句
        match = re.search(r"from (.*) import", error_log)
        if match:
            info["import_statement"] = match.group(0)
            
        return {"additional_info": info}
    
    def _extract_attribute_error_info(self, error_log: str) -> Dict[str, Any]:
        """提取AttributeError的特定信息"""
        info = {}
        
        # 提取对象和缺失属性
        match = re.search(r"'(.*)' object has no attribute '(.*)'", error_log)
        if match:
            info["object_type"] = match.group(1)
            info["missing_attribute"] = match.group(2)
            
        return {"additional_info": info}
    
    def _extract_value_error_info(self, error_log: str) -> Dict[str, Any]:
        """提取ValueError的特定信息"""
        info = {}
        
        # 尝试提取具体的值错误描述
        match = re.search(r"ValueError: (.*)", error_log)
        if match:
            info["description"] = match.group(1)
            
        return {"additional_info": info}
    
    def _extract_type_error_info(self, error_log: str) -> Dict[str, Any]:
        """提取TypeError的特定信息"""
        info = {}
        
        # 提取类型错误描述
        match = re.search(r"TypeError: (.*)", error_log)
        if match:
            info["description"] = match.group(1)
            
        return {"additional_info": info}
    
    def _extract_syntax_error_info(self, error_log: str) -> Dict[str, Any]:
        """提取SyntaxError的特定信息"""
        info = {}
        
        # 提取语法错误位置
        match = re.search(r"line (\d+)", error_log)
        if match:
            info["error_line"] = int(match.group(1))
            
        return {"additional_info": info}
    
    def _generic_error_analysis(self, error_log: str) -> Dict[str, Any]:
        """通用错误分析"""
        result = {
            "error_type": "UnknownError",
            "error_message": "",
            "confidence": 0.3
        }
        
        # 提取错误消息
        lines = error_log.split("\n")
        for line in lines:
            if "Error:" in line or "Exception:" in line:
                result["error_message"] = line.strip()
                break
                
        return result
    
    def _extract_stack_trace(self, error_log: str) -> List[Dict[str, Any]]:
        """提取堆栈跟踪"""
        stack_trace = []
        