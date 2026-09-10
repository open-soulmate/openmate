import re
import json
from typing import Dict, List, Any, Optional
from .base_skill import Skill


class ErrorDiagnosisAndFixSkill(Skill):
    """错误诊断与修复技能，用于自动分析错误日志并生成修复建议"""
    
    def __init__(self, llm_client=None):
        super().__init__(
            name="error_diagnosis_and_fix",
            description="自动分析程序运行时错误，定位错误根源并生成修复代码建议",
            parameters={
                "error_log": {"type": "string", "description": "错误输出字符串"},
                "code_context": {"type": "string", "description": "引发错误的原始代码片段"},
                "task_description": {"type": "string", "description": "原始任务描述", "optional": True}
            }
        )
        self.llm_client = llm_client
    
    def diagnose_and_fix(self, error_log: str, code_context: str, task_description: str = '') -> Dict[str, Any]:
        """
        诊断错误并生成修复建议
        
        Args:
            error_log: 错误输出字符串
            code_context: 引发错误的原始代码片段
            task_description: 原始任务描述
        
        Returns:
            包含诊断信息的字典
        """
        try:
            # 1. 解析错误日志
            parsed_error = self._parse_error_log(error_log)
            
            # 2. 结合代码上下文进行错误定位分析
            error_analysis = self._analyze_error_with_context(parsed_error, code_context)
            
            # 3. 生成修复方案
            fix_suggestions = self._generate_fix_suggestions(
                parsed_error, code_context, error_analysis, task_description
            )
            
            # 4. 构建诊断结果
            diagnosis = self._create_diagnosis_description(parsed_error, error_analysis)
            possible_causes = self._identify_possible_causes(parsed_error, error_analysis)
            
            return {
                "diagnosis": diagnosis,
                "possible_causes": possible_causes,
                "fix_suggestions": fix_suggestions,
                "raw_analysis": {
                    "parsed_error": parsed_error,
                    "error_analysis": error_analysis
                }
            }
            
        except Exception as e:
            return {
                "diagnosis": f"错误诊断过程中发生异常: {str(e)}",
                "possible_causes": ["诊断工具内部错误"],
                "fix_suggestions": [],
                "error": str(e)
            }
    
    def _parse_error_log(self, error_log: str) -> Dict[str, Any]:
        """解析错误日志，提取关键信息"""
        parsed = {
            "exception_type": "",
            "error_message": "",
            "line_number": None,
            "file_path": "",
            "traceback": "",
            "suggestions": []
        }
        
        # 提取Python异常类型和消息
        exception_pattern = r"([A-Za-z_]\w*Error|[A-Za-z_]\w*Exception): (.+?)(?:\n|$)"
        exception_match = re.search(exception_pattern, error_log)
        if exception_match:
            parsed["exception_type"] = exception_match.group(1)
            parsed["error_message"] = exception_match.group(2).strip()
        
        # 提取行号
        line_pattern = r"(?:line|行)\s*(\d+)"
        line_match = re.search(line_pattern, error_log)
        if line_match:
            parsed["line_number"] = int(line_match.group(1))
        
        # 提取文件路径
        file_pattern = r"(?:File|文件)\s*\"([^\"]+)\""
        file_match = re.search(file_pattern, error_log)
        if file_match:
            parsed["file_path"] = file_match.group(1)
        
        # 提取完整traceback
        if "Traceback" in error_log:
            traceback_start = error_log.find("Traceback")
            parsed["traceback"] = error_log[traceback_start:]
        
        # 如果有LLM客户端，使用LLM进行更深入的解析
        if self.llm_client:
            parsed["suggestions"] = self._llm_parse_error(error_log, parsed)
        
        return parsed
    
    def _llm_parse_error(self, error_log: str, basic_parse: Dict) -> List[str]:
        """使用LLM进行错误日志的深度解析"""
        prompt = f"""
        分析以下错误日志，提取关键信息并给出初步诊断：
        
        错误日志：
        {error_log}
        
        已提取的基本信息：
        异常类型: {basic_parse.get('exception_type', '未知')}
        错误消息: {basic_parse.get('error_message', '未知')}
        行号: {basic_parse.get('line_number', '未知')}
        
        请分析：
        1. 这个错误的根本原因是什么？
        2. 可能的修复方向有哪些？
        3. 是否有相关的配置或环境问题？
        
        请用JSON格式返回，包含reasons和fix_directions字段。
        """
        
        try:
            response = self.llm_client.generate(prompt)
            suggestions = json.loads(response)
            return suggestions.get("reasons", []) + suggestions.get("fix_directions", [])
        except:
            return ["使用LLM解析错误时失败"]
    
    def _analyze_error_with_context(self, parsed_error: Dict, code_context: str) -> Dict[str, Any]:
        """结合代码上下文进行错误定位分析"""
        analysis = {
            "context_matches": [],
            "code_issues": [],
            "potential_fixes": []
        }
        
        # 如果指定了行号，尝试从代码上下文中提取相关行
        if parsed_error.get("line_number") and code_context:
            lines = code_context.split('\n')
            line_num = parsed_error["line_number"]
            
            # 获取错误行及其周围代码
            start = max(0, line_num - 3)
            end = min(len(lines), line_num + 2)
            relevant_code = '\n'.join(lines[start:end])
            
            analysis["relevant_code"] = relevant_code
            analysis["context_matches"].append(f"找到第{line_num}行附近的相关代码")
        
        # 如果有LLM客户端，进行深度分析
        if self.llm_client and code_context:
            analysis["llm_analysis"] = self._llm_analyze_error(
                parsed_error, code_context
            )
        
        return analysis
    
    def _llm_analyze_error(self, parsed_error: Dict, code_context: str) -> Dict[str, Any]:
        """使用LLM分析错误与代码的关系"""
        prompt = f"""
        结合代码上下文分析错误：
        
        错误信息：
        异常类型: {parsed_error.get('exception_type', '未知')}
        错误消息: {parsed_error.get('error_message', '未知')}
        相关行号: {parsed_error.get('line_number', '未知')}
        
        代码上下文：
        {code_context}
        
        请分析：
        1. 错误在代码中的具体位置
        2. 代码中可能导致错误的问题点
        3. 错误的根本原因分析
        
        请用JSON格式返回分析结果。
        """
        
        try:
            response = self.llm_client.generate(prompt)
            return json.loads(response)
        except:
            return {"error": "LLM分析失败"}
    
    def _generate_fix_suggestions(self, parsed_error: Dict, code_context: str, 
                                 error_analysis: Dict, task_description: str) -> List[Dict[str, Any]]:
        """生成修复建议"""
        suggestions = []
        
        # 基于规则的简单修复建议
        rule_based_suggestions = self._get_rule_based_suggestions(parsed_error, code_context)