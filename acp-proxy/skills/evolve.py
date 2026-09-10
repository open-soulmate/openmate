import json
import re
from typing import Dict, Any, Optional


class EvolveSkill:
    """
    自编程能力技能：接收功能描述，生成可执行的Python代码。
    """
    
    def __init__(self):
        """初始化技能"""
        self.supported_keywords = {
            "统计": self._generate_stats_script,
            "文件": self._generate_file_script,
            "目录": self._generate_directory_script,
            "下载": self._generate_download_script,
            "创建": self._generate_create_script,
            "处理": self._generate_process_script,
            "列表": self._generate_list_script,
            "转换": self._generate_convert_script
        }
    
    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行技能，生成Python代码。
        
        Args:
            input_data: 包含prompt的输入数据
            
        Returns:
            包含生成代码或错误信息的字典
        """
        try:
            prompt = input_data.get("prompt", "")
            
            if not prompt or not isinstance(prompt, str):
                return {
                    "status": "error",
                    "message": "缺少有效的功能描述"
                }
            
            # 尝试生成代码
            code, filename = self._generate_code(prompt)
            
            return {
                "status": "success",
                "code": code,
                "filename": filename
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"代码生成失败: {str(e)}"
            }
    
    def _generate_code(self, prompt: str) -> tuple:
        """
        根据prompt生成代码。
        
        Args:
            prompt: 功能描述
            
        Returns:
            代码字符串和文件名
        """
        # 分析prompt中的关键词
        prompt_lower = prompt.lower()
        
        # 尝试匹配关键词
        for keyword, generator in self.supported_keywords.items():
            if keyword in prompt_lower:
                return generator(prompt)
        
        # 如果没有匹配到关键词，生成通用模板
        return self._generate_generic_script(prompt)
    
    def _generate_stats_script(self, prompt: str) -> tuple:
        """生成统计相关的脚本"""
        code = '''#!/usr/bin/env python3
"""
统计脚本
功能: {prompt}
"""

import os
import sys
from pathlib import Path
from collections import defaultdict


def main():
    """
    主函数：统计当前目录下的文件信息
    """
    try:
        current_dir = Path.cwd()
        print(f"当前工作目录: {current_dir}")
        
        # 统计不同文件类型的数量
        file_stats = defaultdict(int)
        total_files = 0
        
        # 遍历目录中的所有文件
        for file_path in current_dir.iterdir():
            if file_path.is_file():
                suffix = file_path.suffix.lower()
                file_stats[suffix] += 1
                total_files += 1
        
        # 输出统计结果
        print(f"\\n文件统计结果:")
        print(f"总计: {total_files} 个文件")
        print("\\n按文件类型统计:")
        
        for file_type, count in sorted(file_stats.items()):
            print(f"{file_type or '无扩展名'}: {count} 个")
            
    except PermissionError:
        print(f"错误: 没有权限访问目录 '{current_dir}'", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"发生错误: {str(e)}", file=sys.stderr)
        sys.exit(1)


def test():
    """
    自测试函数
    """
    print("自测试: 统计脚本功能验证")
    print("预期输出: 文件统计信息")
    print("实际输出:")
    main()


if __name__ == "__main__":
    # 检查是否需要进行自测试
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test()
    else:
        main()
'''.format(prompt=prompt)
        
        return code, "file_stats.py"
    
    def _generate_file_script(self, prompt: str) -> tuple:
        """生成文件操作相关的脚本"""
        code = '''#!/usr/bin/env python3
"""
文件处理脚本
功能: {prompt}
"""

import os
import sys
from pathlib import Path
from datetime import datetime


def process_files():
    """
    主函数：处理文件
    """
    try:
        current_dir = Path.cwd()
        print(f"当前目录: {current_dir}")
        
        # 获取所有文件
        files = list(current_dir.glob("*"))
        print(f"找到 {len(files)} 个文件/目录")
        
        # 创建输出目录
        output_dir = current_dir / "processed_files"
        output_dir.mkdir(exist_ok=True)
        
        # 处理文件
        processed_count = 0
        for file_path in files:
            if file_path.is_file():
                # 这里可以添加具体的文件处理逻辑
                print(f"处理文件: {file_path.name}")
                processed_count += 1
        
        print(f"\\n处理完成: 已处理 {processed_count} 个文件")
        print(f"输出目录: {output_dir}")
        
    except Exception as e:
        print(f"文件处理错误: {str(e)}", file=sys.stderr)
        sys.exit(1)


def test():
    """
    自测试函数
    """
    print("自测试: 文件处理脚本功能验证")
    print("预期输出: 文件处理信息")
    print("实际输出:")
    process_files()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test()
    else:
        process_files()
'''.format(prompt=prompt)
        
        return code, "file_processor.py"
    
    def _generate_directory_script(self, prompt: str) -> tuple:
        """生成目录操作相关的脚本"""
        code = '''#!/usr/bin/env python3
"""
目录操作脚本
功能: {prompt}
"""

import os
import sys
from pathlib import Path


def manage_directory():
    """
    主函数：目录管理操作
    """
    try:
        current_dir = Path.cwd()
        print(f"当前目录: {current_dir}")
        
        # 创建新目录
        new_dir_name = "new_directory"
        new_dir = current_dir / new_dir_name
        
        if not new_dir.exists():
            new_dir.mkdir()
            print(f"创建目录: {new_dir}")
        else:
            print(f"目录已存在: {new_dir}")
        
        # 列出目录内容
        print(f"\\n目录 '{new_dir}' 的内容:")
        for item in new_dir.iterdir():
            print(f"  {item.name}")
            
    except Exception as e:
        print(f"目录操作错误: {str(e)}", file=sys.stderr)
        sys.exit(1)


def test():
    """
    自测试函数
    """
    print("自测试: 目录管理脚本功能验证")
    print("预期输出: 目录创建和内容信息")
    print("实际输出:")
    manage_directory()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test()
    else:
        manage_directory()
'''.format(prompt=prompt)
        
        return code, "directory_manager.py"
    