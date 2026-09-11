import subprocess
import json
import logging
import time
import os
import sys
import tempfile
from typing import Dict, Any, Optional, List

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CodeSynthesizer:
    """
    CodeSynthesizer技能模块 - 实现目标导向的代码生成能力
    
    该技能接收自然语言描述的简单编码任务，生成符合标准的Python代码。
    作为自编程能力和工具创造能力的关键探针，为系统未来的自动功能实现奠定基础。
    
    使用限制：
    1. 仅适用于相对简单的编码任务（函数定义、类定义、文件操作等）
    2. 生成的代码复杂度有限，不适用于大规模或复杂业务逻辑
    3. 沙箱执行环境有限制，某些系统操作可能无法执行
    
    输入格式：
    - 任务描述应为清晰的自然语言描述，说明需要实现的功能
    
    返回结构：
    {
        'success': bool,           # 任务是否成功执行
        'code': str,               # 生成的代码
        'stdout': str,             # 标准输出
        'stderr': str,             # 标准错误
        'execution_time': float,   # 执行时间(秒)
        'confidence': float,       # 置信度(0.0-1.0)
        'error_type': str,         # 错误类型(如有)
        'log_path': str            # 经验日志路径(如有)
    }
    """
    
    def __init__(
        self,
        template_path: Optional[str] = None,
        timeout: int = 10,
        log_dir: str = "acp-proxy/data",
        max_memory_mb: int = 100
    ):
        """
        初始化CodeSynthesizer技能
        
        Args:
            template_path: 模板库文件路径(None则使用内置模板)
            timeout: 沙箱执行超时时间(秒)
            log_dir: 经验日志目录
            max_memory_mb: 最大内存限制(MB)
        """
        self.timeout = timeout
        self.max_memory_mb = max_memory_mb
        self.log_dir = log_dir
        self.template_path = template_path
        
        # 确保日志目录存在
        os.makedirs(self.log_dir, exist_ok=True)
        self.experience_file = os.path.join(self.log_dir, "code_synthesizer_experience.jsonl")
        
        # 加载模板
        self.templates = self._load_templates()
        
        # 内部状态
        self.success_log: List[Dict[str, Any]] = []
        
        logger.info(f"CodeSynthesizer initialized with timeout={timeout}s, log_dir={log_dir}")
    
    def _load_templates(self) -> Dict[str, str]:
        """
        加载代码模板库
        
        Returns:
            模板字典，键为模式名，值为代码模板字符串
        """
        # 内置基础模板库
        templates = {
            'python_function': '''def {function_name}({parameters}):
    """{function_docstring}"""
    {function_body}
    return {return_value}
''',
            'class_definition': '''class {class_name}:
    """{class_docstring}"""
    
    def __init__(self{init_params}):
        """Initialize the class"""
        {init_body}
    
    def {method_name}({self_params}):
        """{method_docstring}"""
        {method_body}
        return {method_return}
''',
            'file_read': '''try:
    with open("{file_path}", "r") as file:
        {var_name} = file.read()
        print(f"File content: {var_name}")
except FileNotFoundError:
    print(f"Error: File not found: {file_path}")
except Exception as e:
    print(f"Error reading file: {e}")
''',
            'api_request': '''import requests

try:
    response = requests.get("{url}", timeout=5)
    if response.status_code == 200:
        print(f"Success: {response.status_code}")
        print(f"Response: {response.text[:200]}")
    else:
        print(f"Failed with status: {response.status_code}")
except Exception as e:
    print(f"API request failed: {e}")
''',
            'data_processing': '''import json

# Sample data processing
data = {input_data}
processed_data = []

for item in data:
    # Simple processing logic
    if isinstance(item, (int, float)):
        processed_data.append(item * 2)
    elif isinstance(item, str):
        processed_data.append(item.upper())
    else:
        processed_data.append(item)

print(f"Original: {data}")
print(f"Processed: {processed_data}")
''',
            'simple_script': '''#!/usr/bin/env python3
"""Simple script: {script_description}"""

def main():
    {main_body}
    return {main_return}

if __name__ == "__main__":
    result = main()
    print(f"Script result: {result}")
'''
        }
        
        # 如果指定了外部模板文件，尝试加载
        if self.template_path and os.path.exists(self.template_path):
            try:
                with open(self.template_path, 'r', encoding='utf-8') as f:
                    external_templates = json.load(f)
                    templates.update(external_templates)
                logger.info(f"Loaded external templates from {self.template_path}")
            except Exception as e:
                logger.warning(f"Failed to load external templates: {e}")
        
        return templates
    
    def generate_from_template(self, description: str) -> str:
        """
        根据任务描述生成代码
        
        Args:
            description: 任务描述
            
        Returns:
            生成的代码字符串
        """
        description_lower = description.lower()
        template_name = None
        template_vars = {}
        
        # 基于关键词匹配模板
        if "函数" in description_lower or "function" in description_lower:
            template_name = "python_function"
            template_vars = self._extract_function_params(description)
        elif "类" in description_lower or "class" in description_lower:
            template_name = "class_definition"
            template_vars = self._extract_class_params(description)
        elif "读取" in description_lower or "文件" in description_lower or "file" in description_lower:
            template_name = "file_read"
            template_vars = self._extract_file_params(description)
        elif "请求" in description_lower or "api" in description_lower or "http" in description_lower:
            template_name = "api_request"
            template_vars = self._extract_api_params(description)
        elif "数据" in description_lower or "处理" in description_lower:
            template_name = "data_processing"
            template_vars = self._extract_data_params(description)
        else:
            template_name = "simple_script"
            template_vars = self._extract_script_params(description)
        
        # 获取模板
        template = self.templates.get(template_name, self.templates["simple_script"])
        