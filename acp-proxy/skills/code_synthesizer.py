import subprocess
import json
import logging
import time
import os
import sys
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class CodeSynthesizer:
    """
    CodeSynthesizer 技能模块。
    
    该技能接收自然语言描述的编码任务，生成符合标准的 Python 代码，并安全执行。
    它是一个目标导向的代码生成器，用于实现自编程能力和工具创造。
    
    使用示例：
        synthesizer = CodeSynthesizer()
        result = synthesizer.execute("定义一个计算两个数之和的函数 add")
        
    输入要求：
        - task_description: 自然语言字符串，描述编码任务。
          示例："创建函数 add，计算两个数的和"
          支持关键词：创建函数、定义函数、读取文件、写入文件、发送请求等。
          
    输出结构：
        返回字典包含：
            - 'success': bool, 是否成功
            - 'code': str, 生成的代码
            - 'execution_output': str, 执行输出（stdout）
            - 'error_log': str, 错误信息（stderr）
            - 'confidence': float, 置信度（0-1）
            - 'attempts': int, 尝试次数
            
    使用限制：
        - 仅支持简单任务，不能处理复杂逻辑或多步骤任务
        - 生成的代码将在受限沙箱中执行，有时间和资源限制
        - 模板匹配基于简单关键词，可能不准确
        
    潜在风险：
        - 生成的代码可能包含安全漏洞
        - 执行超时可能导致资源泄露
        - 错误匹配可能生成错误代码
    """
    
    def __init__(
        self,
        template_library_path: Optional[str] = None,
        sandbox_timeout: int = 10,
        experience_log_path: str = "acp-proxy/data/code_synthesizer_experience.jsonl"
    ):
        """
        初始化 CodeSynthesizer。
        
        Args:
            template_library_path: 模板库文件路径（可选，默认使用内置模板）
            sandbox_timeout: 沙箱执行超时时间（秒）
            experience_log_path: 经验日志文件路径
        """
        self.template_library_path = template_library_path
        self.sandbox_timeout = sandbox_timeout
        self.experience_log_path = experience_log_path
        self.success_log = []  # 内存中的经验缓存
        
        # 确保日志目录存在
        log_dir = os.path.dirname(experience_log_path)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        
        # 加载模板
        self.templates = self._load_templates()
        
    def _load_templates(self) -> Dict[str, str]:
        """加载代码模板库"""
        if self.template_library_path:
            try:
                with open(self.template_library_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"无法加载外部模板库: {e}，使用内置模板")
        
        # 内置基础模板库
        templates = {
            "python_function": '''def {function_name}({parameters}):
    """{docstring}"""
    {function_body}
    return {return_value}''',
            
            "file_read": '''def read_file(file_path):
    """读取文件内容"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        print(f"文件内容长度: {len(content)}")
        print(content[:500])  # 打印前500字符
        return content
    except FileNotFoundError:
        print(f"错误: 文件 {file_path} 不存在")
        return None
    except Exception as e:
        print(f"读取文件时发生错误: {e}")
        return None''',
            
            "file_write": '''def write_file(file_path, content):
    """写入文件内容"""
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"成功写入文件: {file_path}")
        return True
    except Exception as e:
        print(f"写入文件时发生错误: {e}")
        return False''',
            
            "api_request": '''import requests

def {function_name}(url, method="{method}", data=None):
    """发送HTTP请求"""
    try:
        if method.upper() == "GET":
            response = requests.get(url, timeout=10)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=10)
        else:
            print(f"不支持的方法: {method}")
            return None
            
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")
        return None''',
            
            "data_processing": '''def process_data(data):
    """处理数据"""
    # 示例: 统计字频
    if isinstance(data, str):
        words = data.split()
        word_count = {}
        for word in words:
            word_count[word] = word_count.get(word, 0) + 1
        
        # 按词频排序
        sorted_words = sorted(word_count.items(), key=lambda x: x[1], reverse=True)
        return sorted_words[:10]  # 返回前10个高频词
    elif isinstance(data, list):
        # 计算基本统计量
        if len(data) == 0:
            return {"平均值": 0, "总和": 0, "数量": 0}
        
        total = sum(data)
        avg = total / len(data)
        return {
            "平均值": round(avg, 2),
            "总和": total,
            "数量": len(data),
            "最大值": max(data),
            "最小值": min(data)
        }
    else:
        print("不支持的数据类型")
        return None'''
        }
        
        return templates
    
    def generate_from_template(self, description: str) -> str:
        """根据任务描述生成代码"""
        desc_lower = description.lower()
        
        # 匹配模板的关键词
        template_keywords = {
            "python_function": ["创建函数", "定义函数", "编写函数", "函数定义", "def "],
            "file_read": ["读取文件", "打开文件", "文件读取", "read_file"],
            "file_write": ["写入文件", "保存文件", "文件写入", "write_file"],
            "api_request": ["发送请求", "api调用", "http请求", "请求api", "requests"],
            "data_processing": ["处理数据", "数据分析", "数据处理", "统计", "计算"]
        }
        
        selected_template = None
        selected_pattern = None
        
        # 尝试匹配模板
        for template_name, keywords in template_keywords.items():
            for keyword in keywords:
                if keyword in desc_lower:
                    selected_template = template_name
                    selected_pattern = keyword
                    break
            if selected_template:
                break
        
        # 默认使用python_function模板
        if not selected_template:
            selected_template = "python_function"
        
        # 提取参数并填充模板
        template = self.templates[selected_template]
        
        # 简单的参数提取逻辑
        if selected_template == "python_function":
            # 提取函数名
            function_name = "unnamed_function"
            func_name_patterns = ["函数", "function", "def ", "名为", "叫做"]
            for pattern in func_name_patterns:
                if pattern in desc_lower:
                    # 尝试提取函数名
                    idx = desc_lower.find(pattern) + len(pattern)
                    remaining = description[idx:].strip()
                    # 找到第一个空格或特殊字符
                    for i, char in enumerate(remaining):
                        if char in " (，,。:：":
                            if i > 0:
                                function_name = remaining[:i]
                            break
                    else:
                        function_name = remaining[:15]  # 限制长度
                    break
            
            # 提取参数
            parameters = ""
            if "两个参数" in desc_lower or "两个数" in desc_lower or "两数" in desc_lower:
                parameters = "a, b"