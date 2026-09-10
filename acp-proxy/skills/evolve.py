import json
import os
from typing import Dict, Any

def generate_python_script(prompt: str) -> Dict[str, Any]:
    """
    生成Python脚本的核心函数
    
    Args:
        prompt: 描述要生成Python代码的功能的字符串
        
    Returns:
        包含生成结果的字典
    """
    # 将prompt转换为小写以便关键词匹配
    prompt_lower = prompt.lower()
    
    # 尝试匹配不同的功能类型
    if any(keyword in prompt_lower for keyword in ['统计', '行数', '计数', 'count']) and \
       any(keyword in prompt_lower for keyword in ['文件', 'txt', 'file']):
        return _generate_file_line_counter()
    elif any(keyword in prompt_lower for keyword in ['遍历', '列出', 'list', '遍历']) and \
         any(keyword in prompt_lower for keyword in ['目录', '文件夹', 'folder', 'dir']):
        return _generate_directory_list()
    elif any(keyword in prompt_lower for keyword in ['计算', '求和', 'sum', 'addition']) and \
         any(keyword in prompt_lower for keyword in ['数字', '数值', 'number', 'list']):
        return _generate_sum_calculator()
    else:
        return {
            'status': 'error',
            'message': '当前技能无法处理此类型的代码生成请求'
        }

def _generate_file_line_counter() -> Dict[str, Any]:
    """生成统计.txt文件行数的脚本"""
    code = '''#!/usr/bin/env python3
"""
统计当前目录下所有.txt文件的总行数
自动生成的脚本 - 请根据实际需求修改
"""

import os
import sys
from pathlib import Path

def count_txt_lines():
    """
    统计当前目录下所有.txt文件的总行数
    
    Returns:
        int: 总行数
    """
    total_lines = 0
    txt_files = []
    
    try:
        # 获取当前目录
        current_dir = Path.cwd()
        print(f"正在扫描目录: {current_dir}")
        
        # 查找所有.txt文件
        for file_path in current_dir.glob("*.txt"):
            txt_files.append(file_path)
            
        if not txt_files:
            print("未找到任何.txt文件")
            return 0
            
        print(f"找到 {len(txt_files)} 个.txt文件:")
        
        # 统计每个文件的行数
        for file_path in txt_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    line_count = len(lines)
                    total_lines += line_count
                    print(f"  {file_path.name}: {line_count} 行")
            except UnicodeDecodeError:
                # 尝试其他编码
                try:
                    with open(file_path, 'r', encoding='gbk') as f:
                        lines = f.readlines()
                        line_count = len(lines)
                        total_lines += line_count
                        print(f"  {file_path.name}: {line_count} 行 (GBK编码)")
                except Exception as e:
                    print(f"  {file_path.name}: 无法读取文件 - {str(e)}")
            except Exception as e:
                print(f"  {file_path.name}: 读取错误 - {str(e)}")
                
        return total_lines
        
    except Exception as e:
        print(f"发生错误: {str(e)}")
        return -1

def self_test():
    """自测试函数，用于验证脚本的基本功能"""
    print("\\n" + "="*50)
    print("自测试开始...")
    
    # 创建测试文件
    test_files = {
        "test1.txt": ["第一行", "第二行", "第三行"],
        "test2.txt": ["只有这一行"],
        "test3.txt": []
    }
    
    total_expected = 0
    try:
        for filename, lines in test_files.items():
            with open(filename, 'w', encoding='utf-8') as f:
                f.write('\\n'.join(lines))
            total_expected += len(lines)
            
        print(f"已创建 {len(test_files)} 个测试文件")
        
        # 运行计数函数
        actual_count = count_txt_lines()
        
        if actual_count == total_expected:
            print(f"✓ 自测试通过! 预期行数: {total_expected}, 实际行数: {actual_count}")
        else:
            print(f"✗ 自测试失败! 预期行数: {total_expected}, 实际行数: {actual_count}")
            
    except Exception as e:
        print(f"自测试过程中发生错误: {str(e)}")
    finally:
        # 清理测试文件
        print("清理测试文件...")
        for filename in test_files.keys():
            if os.path.exists(filename):
                os.remove(filename)
                print(f"  已删除: {filename}")

if __name__ == "__main__":
    # 运行自测试
    self_test()
    
    print("\\n" + "="*50)
    print("实际执行统计:")
    total = count_txt_lines()
    
    if total >= 0:
        print(f"\\n总结: 当前目录下.txt文件的总行数为: {total}")
    else:
        print("\\n总结: 统计过程中发生错误")
'''
    
    return {
        'status': 'success',
        'code': code,
        'filename': 'count_txt_lines.py'
    }

def _generate_directory_list() -> Dict[str, Any]:
    """生成遍历目录的脚本"""