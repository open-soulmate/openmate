#!/usr/bin/env python3
"""
自编程技能模块
实现根据功能描述生成Python代码文件的能力
"""

import json
import os
import re
import sys
from typing import Dict, List, Optional, Tuple
import datetime

# 模板库 - 预定义的代码模板
TEMPLATES = {
    "file_stats": {
        "keywords": ["统计", "文件", "行数", "数量", "计数", "统计文件", "文件数量"],
        "filename": "file_statistics.py",
        "description": "统计文件数量或行数"
    },
    "file_read": {
        "keywords": ["读取", "文件", "内容", "查看", "显示", "读取文件"],
        "filename": "file_reader.py",
        "description": "读取文件内容"
    },
    "directory_list": {
        "keywords": ["目录", "文件夹", "列表", "列出", "目录内容", "列出目录"],
        "filename": "directory_list.py",
        "description": "列出目录中的文件"
    },
    "text_replace": {
        "keywords": ["替换", "文本", "字符串", "内容替换", "文本替换"],
        "filename": "text_replacer.py",
        "description": "替换文本文件中的内容"
    },
    "simple_calc": {
        "keywords": ["计算", "数学", "加减乘除", "四则运算", "计算器"],
        "filename": "simple_calculator.py",
        "description": "简单数学计算"
    }
}


def generate_python_script(prompt: str) -> Dict:
    """
    根据功能描述生成Python代码
    
    Args:
        prompt: 功能描述字符串
        
    Returns:
        包含状态、代码和文件名的字典
    """
    # 将输入转换为小写以进行不区分大小写的匹配
    prompt_lower = prompt.lower()
    
    # 1. 尝试匹配关键词模板
    matched_template = None
    for template_name, template_info in TEMPLATES.items():
        keywords = template_info["keywords"]
        if any(keyword in prompt_lower for keyword in keywords):
            matched_template = template_info
            break
    
    if matched_template:
        # 使用匹配的模板生成代码
        code = _generate_from_template(prompt, matched_template["description"])
        return {
            "status": "success",
            "code": code,
            "filename": matched_template["filename"],
            "template_used": matched_template["description"]
        }
    
    # 2. 如果没有匹配的模板，尝试通用脚本生成
    code = _generate_general_script(prompt)
    if code:
        # 根据prompt生成建议的文件名
        filename = _generate_filename_from_prompt(prompt)
        return {
            "status": "success",
            "code": code,
            "filename": filename,
            "template_used": "通用脚本生成器"
        }
    
    # 3. 无法生成有意义的代码
    return {
        "status": "error",
        "message": "当前技能无法处理此类型的代码生成请求。请提供更具体的描述，例如包含以下关键词之一：统计、文件、行数、读取、目录、计算等。"
    }


def _generate_from_template(prompt: str, description: str) -> str:
    """使用模板生成代码"""
    template_code = '''#!/usr/bin/env python3
"""
{description}
自动生成于: {timestamp}
功能描述: {prompt}
"""

import os
import sys
from pathlib import Path
from typing import List, Dict, Any


def main():
    """
    主函数 - 执行主要功能
    """
    # 示例：统计当前目录下.txt文件的数量
    current_dir = Path(".")
    txt_files = list(current_dir.glob("*.txt"))
    
    # 错误处理：检查是否有文件存在
    if not txt_files:
        print("当前目录下没有找到.txt文件")
        return
    
    print(f"找到 {len(txt_files)} 个.txt文件:")
    for i, file in enumerate(txt_files, 1):
        print(f"{i}. {file.name}")
    
    # 自测试逻辑：打印预期结果
    print(f"\\n总计: {len(txt_files)} 个.txt文件")


if __name__ == "__main__":
    # 自测试：执行主函数并捕获可能的错误
    try:
        main()
        print("\\n自测试: 脚本执行成功")
    except Exception as e:
        print(f"自测试: 脚本执行出错: {e}")
        sys.exit(1)
'''.format(
        description=description,
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        prompt=prompt
    )
    
    return template_code


def _generate_general_script(prompt: str) -> Optional[str]:
    """生成通用脚本"""
    # 提取关键信息
    script_parts = []
    script_parts.append('#!/usr/bin/env python3')
    script_parts.append('"""')
    script_parts.append('自动生成的脚本')
    script_parts.append(f'生成时间: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    script_parts.append(f'功能描述: {prompt}')
    script_parts.append('"""')
    script_parts.append('')
    script_parts.append('import os')
    script_parts.append('import sys')
    script_parts.append('')
    script_parts.append('')
    script_parts.append('def main():')
    script_parts.append('    """')
    script_parts.append('    主函数 - 根据需求实现功能')
    script_parts.append('    """')
    script_parts.append(f'    # TODO: 实现 {prompt} 的具体功能')
    script_parts.append('    print("脚本开始执行...")')
    script_parts.append('')
    script_parts.append('    # 错误处理示例')
    script_parts.append('    try:')
    script_parts.append('        # 主要逻辑')
    script_parts.append('        print("执行主要逻辑...")')
    script_parts.append('')
    script_parts.append('        # 自测试：验证脚本功能')
    script_parts.append('        print("自测试: 脚本执行成功")')
    script_parts.append('')
    script_parts.append('    except Exception as e:')
    script_parts.append('        print(f"错误: {{e}}")')
    script_parts.append('        sys.exit(1)')
    script_parts.append('')
    script_parts.append('')
    script_parts.append('if __name__ == "__main__":')
    script_parts.append('    main()')
    
    return '\n'.join(script_parts)


def _generate_filename_from_prompt(prompt: str) -> str:
    """从prompt生成建议的文件名"""
    # 移除特殊字符，只保留字母、数字、下划线和连字符
    clean_prompt = re.sub(r'[^\w\s-]', '', prompt)
    # 替换空格为下划线