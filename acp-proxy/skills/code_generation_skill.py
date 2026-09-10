import os
import re
import ast
import logging
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import textwrap

class CodeGenerationSkill:
    """
    代码生成技能，使Agent能根据自然语言描述生成Python代码片段并保存为文件。
    支持自编程能力，减少对外部系统的依赖。
    """
    
    def __init__(self, 
                 code_style: str = "PEP8",
                 template_dir: Optional[str] = None,
                 logger: Optional[logging.Logger] = None):
        """
        初始化代码生成技能。
        
        Args:
            code_style: 代码风格，默认为PEP8
            template_dir: 模板目录路径（可选）
            logger: 日志记录器（可选）
        """
        self.code_style = code_style
        self.template_dir = template_dir
        self.logger = logger or logging.getLogger(__name__)
        
        # 关键词映射，用于需求解析
        self.keyword_mapping = {
            "创建": "create",
            "实现": "implement",
            "编写": "write",
            "构建": "build",
            "开发": "develop",
            "函数": "function",
            "类": "class",
            "方法": "method",
            "模块": "module",
            "脚本": "script",
            "返回": "return",
            "计算": "calculate",
            "处理": "process",
            "验证": "validate",
            "连接": "connect",
            "发送": "send",
            "接收": "receive",
            "读取": "read",
            "写入": "write",
            "删除": "delete",
            "更新": "update"
        }
        
        # 代码模板库
        self.code_templates = {
            "function": '''def {function_name}({parameters}) -> {return_type}:
    """{docstring}
    
    Args:
{args_docstring}
    
    Returns:
        {return_docstring}
    """
{function_body}
    
    return {return_value}
''',
            "class": '''class {class_name}:
    """{class_docstring}"""
    
    def __init__(self{init_parameters}):
        """{init_docstring}"""
{init_body}
    
    {class_methods}
''',
            "script": '''#!/usr/bin/env python3
"""{module_docstring}"""

import sys
import logging
from typing import Any

{imports}

{module_body}

if __name__ == "__main__":
    # 主程序入口
    {main_body}
'''
        }
        
        self.logger.info("CodeGenerationSkill初始化完成")

    def parse_requirement(self, text: str) -> Dict[str, Any]:
        """
        解析自然语言描述，提取关键信息，生成结构化描述对象。
        
        Args:
            text: 自然语言需求描述
            
        Returns:
            结构化描述对象，包含以下字段：
            - type: 代码类型（function/class/script）
            - name: 代码名称
            - parameters: 参数列表（如果适用）
            - return_type: 返回类型（如果适用）
            - description: 功能描述
            - features: 特性列表
            - dependencies: 依赖项列表
        """
        self.logger.info(f"开始解析需求: {text[:50]}...")
        
        spec = {
            "type": "function",  # 默认类型
            "name": "",
            "parameters": [],
            "return_type": "Any",
            "description": text,
            "features": [],
            "dependencies": [],
            "raw_text": text
        }
        
        # 转换为小写便于分析
        text_lower = text.lower()
        
        # 1. 识别代码类型
        if any(word in text_lower for word in ["类", "class"]):
            spec["type"] = "class"
        elif any(word in text_lower for word in ["脚本", "script", "模块", "module"]):
            spec["type"] = "script"
        else:
            spec["type"] = "function"
        
        # 2. 提取函数/类名
        name_patterns = [
            r"创建(?:一个|一个名为)?(\w+?)(?:函数|类|脚本|模块)",
            r"实现(?:一个|一个名为)?(\w+?)(?:函数|类|脚本|模块)",
            r"编写(?:一个|一个名为)?(\w+?)(?:函数|类|脚本|模块)",
            r"构建(?:一个|一个名为)?(\w+?)(?:函数|类|脚本|模块)",
            r"开发(?:一个|一个名为)?(\w+?)(?:函数|类|脚本|模块)",
            r"(\w+?)(?:函数|类|脚本|模块)"
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                name = match.group(1)
                # 转换为下划线命名
                spec["name"] = self._to_snake_case(name)
                break
        
        # 如果未提取到名称，生成默认名称
        if not spec["name"]:
            spec["name"] = f"auto_generated_{spec['type']}"
        
        # 3. 提取参数信息
        param_patterns = [
            r"两个(?:参数|参数为)(\w+?)(?:和|与)(\w+?)",
            r"接受(?:参数|输入)(\w+?)(?:和|与|,)(\w+?)(?:和|与|,)?(\w+?)?",
            r"包含(\w+?)(?:、|,|和|与)(\w+?)(?:、|,|和|与)?(\w+?)?",
            r"需要(\w+?)(?:和|与|,)(\w+?)(?:和|与|,)?(\w+?)?"
        ]
        
        for pattern in param_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                params = [p for p in match.groups() if p]
                for param in params:
                    param_name = self._to_snake_case(param)
                    spec["parameters"].append({
                        "name": param_name,
                        "type": self._infer_type(param_name, text),
                        "description": f"参数{param_name}"
                    })
                break
        
        # 4. 推断返回类型
        return_patterns = [
            r"返回(?:一个)?(\w+?)(?:值|结果|类型)",
            r"得到(?:一个)?(\w+?)(?:值|结果|类型)",
            r"计算(?:一个)?(\w+?)(?:值|结果|类型)"
        ]
        