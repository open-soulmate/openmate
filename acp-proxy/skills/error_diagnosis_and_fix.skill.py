from typing import Dict, List, Optional
from skills.base import Skill

class ErrorDiagnosisAndFixSkill(Skill):
    """错误诊断与修复技能
    
    自动分析程序错误日志，定位错误根源并生成修复方案
    """
    
    def __init__(self, llm_client=None, **kwargs):
        """初始化错误诊断与修复技能
        
        Args:
            llm_client: LLM客户端实例，用于AI辅助分析
        """
        super().__init__(**kwargs)
        self.llm_client = llm_client
    
    def diagnose_and_fix(
        self, 
        error_log: str, 
        code_context: str, 
        task_description: str = ''
    ) -> Dict[str, any]:
        """诊断错误并生成修复方案
        
        Args:
            error_log: 错误输出字符串
            code_context: 引发错误的原始代码片段
            task_description: 原始任务描述，有助于理解意图
            
        Returns:
            包含诊断结果的字典:
            {
                "diagnosis": str,  # 人类可读的错误描述
                "possible_causes": List[str],  # 可能的错误原因
                "fix_suggestions": List[Dict]  # 修复方案列表
            }
        """
        # 步骤1: 解析错误日志，提取关键信息
        error_info = self._parse_error_log(error_log)
        
        # 步骤2: 结合代码上下文进行错误定位分析
        diagnosis_result = self._analyze_error_location(
            error_log=error_log,
            error_info=error_info,
            code_context=code_context,
            task_description=task_description
        )
        
        # 步骤3: 生成修复方案
        fix_suggestions = self._generate_fix_suggestions(
            error_info=error_info,
            diagnosis_result=diagnosis_result,
            code_context=code_context,
            task_description=task_description
        )
        
        # 构建返回结果
        result = {
            "diagnosis": diagnosis_result.get("description", "无法解析错误"),
            "possible_causes": diagnosis_result.get("possible_causes", []),
            "fix_suggestions": fix_suggestions
        }
        
        return result
    
    def _parse_error_log(self, error_log: str) -> Dict[str, any]:
        """解析错误日志，提取关键信息
        
        Args:
            error_log: 错误日志字符串
            
        Returns:
            提取的关键信息字典
        """
        # 使用LLM或规则引擎解析错误日志
        if self.llm_client:
            return self._parse_error_log_with_llm(error_log)
        else:
            return self._parse_error_log_with_rules(error_log)
    
    def _parse_error_log_with_llm(self, error_log: str) -> Dict[str, any]:
        """使用LLM解析错误日志
        
        Args:
            error_log: 错误日志字符串
            
        Returns:
            解析结果字典
        """
        prompt = f"""请分析以下错误日志，提取关键信息：
        
错误日志:
{error_log}

请提取以下信息（如果存在）：
1. 异常类型（Exception Type）
2. 错误消息（Error Message）
3. 错误发生的行号（Line Number）
4. 相关的文件路径（File Path）
5. 其他重要信息

请以JSON格式返回结果，格式如下：
{{
    "exception_type": "...",
    "error_message": "...",
    "line_number": ...,
    "file_path": "...",
    "additional_info": "..."
}}
"""
        
        response = self.llm_client.chat(prompt)
        
        try:
            # 尝试解析JSON响应
            import json
            result = json.loads(response)
            return result
        except:
            # 如果JSON解析失败，返回基本结构
            return {
                "exception_type": "Unknown",
                "error_message": error_log.split('\n')[-1] if error_log else "",
                "line_number": -1,
                "file_path": "",
                "additional_info": "无法解析错误日志"
            }
    
    def _parse_error_log_with_rules(self, error_log: str) -> Dict[str, any]:
        """使用规则引擎解析错误日志
        
        Args:
            error_log: 错误日志字符串
            
        Returns:
            解析结果字典
        """
        import re
        
        result = {
            "exception_type": "Unknown",
            "error_message": "",
            "line_number": -1,
            "file_path": "",
            "additional_info": ""
        }
        
        if not error_log:
            return result
        
        # 尝试提取常见的异常类型
        exception_patterns = [
            r'(\w+Error):',
            r'(\w+Exception):',
            r'(\w+Exception)\b'
        ]
        
        for pattern in exception_patterns:
            match = re.search(pattern, error_log)
            if match:
                result["exception_type"] = match.group(1)
                break
        
        # 尝试提取错误消息
        # 通常错误消息在异常类型之后
        if result["exception_type"] != "Unknown":
            pattern = f'{result["exception_type"]}:(.*?)(?=\n|$)'
            match = re.search(pattern, error_log, re.DOTALL)