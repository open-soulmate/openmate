import subprocess
import json
import logging
import time
import os
import sys
from typing import Dict, List, Any, Optional, Tuple
import re

logger = logging.getLogger(__name__)


class CodeSynthesizer:
    """
    代码合成器技能模块
    
    接收自然语言描述的简单编码任务，生成符合标准的Python代码。
    作为实现自编程能力和工具创造进化目标的关键探针。
    
    使用限制：
        - 仅限简单任务（函数定义、文件读写、简单API调用等）
        - 生成代码可能存在安全风险，需在安全环境中运行
        - 不支持复杂的算法或大型系统开发
    
    潜在风险：
        - 生成代码可能包含语法或逻辑错误
        - 执行环境可能受限导致功能不完整
        - 日志记录可能包含敏感信息
    """
    
    def __init__(
        self,
        template_path: Optional[str] = None,
        execution_timeout: int = 10,
        experience_log_path: str = "acp-proxy/data/code_synthesizer_experience.jsonl"
    ):
        """
        初始化代码合成器
        
        Args:
            template_path: 模板库文件路径（None时使用内置模板）
            execution_timeout: 代码执行超时时间（秒）
            experience_log_path: 经验日志文件路径
        """
        self.template_path = template_path
        self.execution_timeout = execution_timeout
        self.experience_log_path = experience_log_path
        self.success_log: List[Dict[str, Any]] = []
        
        # 确保日志目录存在
        log_dir = os.path.dirname(experience_log_path)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        
        logger.info("CodeSynthesizer 已初始化")
    
    def _load_templates(self) -> Dict[str, str]:
        """
        加载代码模板库
        
        Returns:
            包含模板名称和模板代码的字典
        """
        templates = {
            "python_function": '''def {function_name}({parameters}):
    """
    {docstring}
    """
    # 函数实现
    pass

# 函数调用示例
# result = {function_name}({example_args})
''',
            "file_operations": '''import os

def read_file(file_path):
    """读取文件内容"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return content
    except Exception as e:
        print(f"读取文件错误: {{e}}")
        return None

def write_file(file_path, content):
    """写入文件内容"""
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    except Exception as e:
        print(f"写入文件错误: {{e}}")
        return False

# 使用示例
# content = read_file("{file_path}")
# write_file("{output_path}", content)
''',
            "api_request": '''import requests
import json

def make_api_request(url, method="GET", data=None, headers=None):
    """发送API请求"""
    try:
        if headers is None:
            headers = {{"Content-Type": "application/json"}}
        
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=10)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=10)
        else:
            raise ValueError(f"不支持的HTTP方法: {{method}}")
        
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"API请求错误: {{e}}")
        return None

# 使用示例
# result = make_api_request("{api_url}")
# print(result)
'''
        }
        
        return templates
    
    def generate_from_template(self, description: str) -> str:
        """
        根据任务描述生成代码
        
        Args:
            description: 自然语言任务描述
        
        Returns:
            生成的Python代码
        """
        templates = self._load_templates()
        description_lower = description.lower()
        
        # 关键词匹配选择模板
        if "函数" in description_lower or "function" in description_lower:
            template_name = "python_function"
        elif "文件" in description_lower or "file" in description_lower or "读取" in description_lower or "写入" in description_lower:
            template_name = "file_operations"
        elif "api" in description_lower or "请求" in description_lower or "request" in description_lower or "url" in description_lower:
            template_name = "api_request"
        else:
            # 默认使用函数模板
            template_name = "python_function"
        
        template = templates[template_name]
        
        # 提取或设置默认参数
        if template_name == "python_function":
            # 尝试从描述中提取函数名
            func_name_match = re.search(r'函数\s*(\w+)', description, re.IGNORECASE)