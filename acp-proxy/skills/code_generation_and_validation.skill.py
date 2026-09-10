# acp-proxy/skills/code_generation_and_validation.skill.py
"""
代码生成与验证技能
核心技能：实现 Agent 的自编程能力
"""

import ast
import re
import traceback
import subprocess
import sys
import tempfile
import os
from typing import Dict, Any, Optional
from .skill import Skill


class CodeGenerationAndValidationSkill(Skill):
    """
    代码生成与验证技能
    用于根据任务描述生成高质量、经过验证的代码
    """
    
    def __init__(self, agent=None):
        """
        初始化技能
        
        Args:
            agent: 代理实例，用于调用 LLM 等功能
        """
        super().__init__(
            name="code_generation_and_validation",
            description="代码生成与验证技能，提升 Agent 的自编程能力"
        )
        self.agent = agent
        
        # 危险函数模式，用于静态分析
        self.dangerous_patterns = {
            'eval': r'\beval\b',
            'exec': r'\bexec\b',
            'os.system': r'\bos\.system\b',
            'subprocess.call': r'\bsubprocess\.call\b',
            'subprocess.run': r'\bsubprocess\.run\b',
            'os.popen': r'\bos\.popen\b'
        }
    
    def execute(self, task_description: str, context: dict = None) -> Dict[str, Any]:
        """
        执行代码生成与验证
        
        Args:
            task_description: 自然语言描述的代码功能需求
            context: 可选的上下文信息，如错误日志、函数签名等
            
        Returns:
            包含生成结果和验证报告的字典
        """
        # 初始化结果字典
        result = {
            'success': False,
            'generated_code': '',
            'validation_report': {
                'syntax_check': {'passed': False, 'error': None},
                'static_analysis': {'passed': False, 'warnings': [], 'dangerous_functions': []},
                'sandbox_test': {'passed': False, 'output': None, 'error': None}
            },
            'suggestions': ''
        }
        
        # 步骤1: 使用 LLM 生成代码
        try:
            generated_code = self._generate_code_with_llm(task_description, context)
            result['generated_code'] = generated_code
        except Exception as e:
            result['suggestions'] = f"代码生成失败: {str(e)}，请检查任务描述或上下文信息"
            return result
        
        # 步骤2: 验证生成的代码
        validation_passed = True
        
        # 2a. 语法检查
        syntax_check = self._check_syntax(generated_code)
        result['validation_report']['syntax_check'] = syntax_check
        if not syntax_check['passed']:
            validation_passed = False
            result['suggestions'] += f"语法错误: {syntax_check['error']}\n"
        
        # 2b. 静态分析
        static_analysis = self._perform_static_analysis(generated_code, task_description)
        result['validation_report']['static_analysis'] = static_analysis
        if not static_analysis['passed']:
            validation_passed = False
            if static_analysis['dangerous_functions']:
                result['suggestions'] += f"检测到危险函数: {', '.join(static_analysis['dangerous_functions'])}\n"
            if static_analysis['warnings']:
                result['suggestions'] += f"警告: {', '.join(static_analysis['warnings'])}\n"
        
        # 2c. 沙盒测试（如果静态分析通过且代码不太长）