# acp-proxy/skills/code_synthesizer.py

import subprocess
import sys
import json
import logging
import time
import os
import re
from typing import Dict, List, Optional, Any

# 设置日志记录
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class CodeSynthesizer:
    """
    代码合成器技能模块
    
    该技能接收自然语言描述的简单编码任务，生成符合标准的Python代码。
    它是一个目标导向的生成器，用于实现系统的自编程能力和工具创造进化目标。
    
    输入要求：
        - task_description: 自然语言描述的任务，应包含明确的操作关键词和参数
          示例："创建一个函数add，接收两个参数a和b，返回它们的和"
        
    输出结构：
        返回字典包含：
        - success: bool，表示执行是否成功
        - code: str，生成的代码
        - stdout: str，标准输出内容
        - stderr: str，错误输出内容
        - error_type: str，错误类型（如果有）
        - confidence: float，置信度（0-1）
        - execution_time: float，执行时间（秒）
        
    使用限制：
        - 仅支持简单的编码任务
        - 代码在受限沙箱中执行，有超时和内存限制
        - 不能执行需要外部依赖或特殊环境的复杂任务
        
    潜在风险：
        - 生成的代码可能包含逻辑错误
        - 沙箱执行无法完全保证安全性
        - 复杂任务可能需要人工干预
    """
    
    def __init__(self, 
                 templates_path: Optional[str] = None,
                 timeout: int = 10,
                 log_file: str = "acp-proxy/data/code_synthesizer_experience.jsonl"):
        """
        初始化代码合成器
        
        Args:
            templates_path: 模板文件路径（如果为None则使用内置模板）
            timeout: 沙箱执行超时时间（秒）
            log_file: 经验日志文件路径
        """
        self.timeout = timeout
        self.log_file = log_file
        self.success_log = []  # 存储成功经验的内部列表
        self.templates = self._load_templates(templates_path)
        
        # 确保日志目录存在
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        
        logger.info(f"CodeSynthesizer initialized with timeout={timeout}s")
    
    def _load_templates(self, templates_path: Optional[str] = None) -> Dict[str, str]:
        """
        加载代码模板库
        
        Args:
            templates_path: 模板文件路径（如果为None则使用内置模板）
            
        Returns:
            模板字典，键为模式名，值为代码模板字符串
        """
        if templates_path and os.path.exists(templates_path):
            # 从文件加载模板（简化实现，实际应解析JSON/YAML等格式）
            try:
                with open(templates_path, 'r', encoding='utf-8') as f:
                    # 这里假设文件是JSON格式
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load templates from {templates_path}: {e}")
        
        # 使用内置模板库
        templates = {
            'python_function': '''def {function_name}({parameters}):
    """
    {docstring}
    """
    {function_body}
''',
            'file_read': '''def read_file(file_path):
    """
    读取指定文件的内容
    
    Args:
        file_path: 文件路径
        
    Returns:
        文件内容字符串
    """
    try:
        with open('{file_path}', 'r', encoding='utf-8') as f:
            content = f.read()
        return content
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found")
        return None
    except Exception as e:
        print(f"Error reading file: {e}")
        return None
''',
            'http_request': '''import requests

def make_http_request(url, method='GET', data=None, headers=None):
    """
    发送HTTP请求
    
    Args:
        url: 请求URL
        method: HTTP方法（GET/POST等）
        data: 请求数据（字典或JSON字符串）
        headers: 请求头（字典）
        
    Returns:
        响应对象
    """
    try:
        if method.upper() == 'GET':
            response = requests.get(url, headers=headers)
        elif method.upper() == 'POST':
            response = requests.post(url, json=data, headers=headers)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
        
        return response
    except Exception as e:
        print(f"HTTP request failed: {e}")
        return None
''',
            'data_processing': '''import json

def process_data(input_data, output_file=None):
    """
    处理输入数据并可选保存到文件
    
    Args:
        input_data: 输入数据（字典或列表）
        output_file: 输出文件路径（可选）
        
    Returns:
        处理后的数据
    """
    # 示例：简单数据处理
    processed_data = {
        "original": input_data,
        "processed_at": "{timestamp}",
        "type": type(input_data).__name__
    }
    
    if output_file:
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(processed_data, f, indent=2)
            print(f"Data saved to {output_file}")
        except Exception as e:
            print(f"Failed to save data: {e}")
    
    return processed_data
'''
        }
        return templates
    
    def generate_from_template(self, description: str) -> str:
        """
        根据任务描述生成代码
        
        Args:
            description: 自然语言任务描述
            
        Returns:
            生成的代码字符串
        """
        description_lower = description.lower()
        
        # 根据关键词匹配模板
        if any(keyword in description_lower for keyword in ['创建函数', '定义函数', '实现函数', '编写函数']):
            template_key = 'python_function'
        elif any(keyword in description_lower for keyword in ['读取文件', '读文件', '读取文本', '查看文件']):
            template_key = 'file_read'
        elif any(keyword in description_lower for keyword in ['发送请求', 'http请求', 'api调用', '调用接口']):
            template_key = 'http_request'
        elif any(keyword in description_lower for keyword in ['处理数据', '数据处理', '分析数据', '数据转换']):
            template_key = 'data_processing'
        else:
            # 默认使用函数模板
            template_key = 'python_function'
        
        template = self.templates.get(template_key, self.templates['python_function'])
        
        # 从描述中提取信息并填充模板
        if template_key == 'python_function':
            return self._fill_function_template(template, description)
        elif template_key == 'file_read':
            return self._fill_file_template(template, description)
        elif template_key == 'http_request':
            return self._fill_http_template(template, description)
        elif template_key == 'data_processing':
            return self._fill_data_template(template, description)
        
        return template
    
    def _fill_function_template(self, template: str, description: str) -> str:
        """填充函数模板"""
        # 提取函数名
        function_name = self._extract_parameter(description, 
                                                ['创建函数', '定义函数', '函数名为', '函数叫', '函数', '叫做', '名为'],
                                                default_value='generated_function')
        
        # 提取参数
        parameters = self._extract_parameter(description,
                                           ['接收参数', '参数是', '参数为', '接收', '参数', '有参数'],
                                           default_value='')
        
        # 生成文档字符串
        docstring = f"根据描述生成的函数: {description}"
        
        # 根据描述生成函数体
        if '返回' in description or '计算' in description:
            function_body = '    # TODO: 实现具体逻辑\n    return result'
        else:
            function_body = '    # TODO: 实现具体逻辑\n    pass'
        
        # 替换模板中的占位符
        code = template.format(
            function_name=function_name,
            parameters=parameters,
            docstring=docstring,
            function_body=function_body
        )
        
        return code
    
    def _fill_file_template(self, template: str, description: str) -> str:
        """填充文件读取模板"""
        # 提取文件路径
        file_path = self._extract_parameter(description,
                                          ['读取文件', '读文件', '文件路径', '文件名为', '文件', '文件叫', '读取', '文件是'],
                                          default_value='input.txt')
        
        # 如果路径没有扩展名，添加.txt