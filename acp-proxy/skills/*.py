import os
import re
import json
import logging
from typing import Any, Dict, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def safe_json_loads(json_string: str) -> Any:
    """
    安全地解析 JSON 字符串，包含统一的错误处理。

    Args:
        json_string: 需要解析的 JSON 字符串

    Returns:
        解析后的 Python 对象，或包含错误信息的字典
    """
    try:
        return json.loads(json_string)
    except json.JSONDecodeError as e:
        error_msg = "输入的 JSON 格式无效"
        detail_msg = f"JSON 解析错误: {e}"
        logger.warning(detail_msg)
        return {"error": error_msg, "detail": detail_msg}
    except ValueError as e:
        error_msg = "输入值无效"
        detail_msg = f"值错误: {e}"
        logger.warning(detail_msg)
        return {"error": error_msg, "detail": detail_msg}
    except Exception as e:
        error_msg = "解析输入时发生意外错误"
        detail_msg = f"意外错误: {type(e).__name__}: {e}"
        logger.error(detail_msg, exc_info=True)
        return {"error": error_msg, "detail": detail_msg}


def update_json_loads_in_file(file_path: str) -> bool:
    """
    更新指定文件中所有 json.loads() 调用，添加统一的错误处理。

    Args:
        file_path: 需要处理的 Python 文件路径

    Returns:
        bool: 文件是否被修改
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except (IOError, OSError) as e:
        logger.error(f"无法读取文件 {file_path}: {e}")
        return False

    # 正则表达式匹配 json.loads(...) 调用
    # 支持多行调用，捕获括号内的参数
    pattern = r'(json\.loads\s*\(\s*)(.*?)(\s*\))'
    
    def replacement(match):
        prefix = match.group(1)  # "json.loads("
        args = match.group(2)    # 参数部分
        suffix = match.group(3)  # ")"
        
        # 如果已经是 safe_json_loads 调用，则跳过
        if 'safe_json_loads' in args:
            return match.group(0)
        
        # 构建新的函数调用
        return f'safe_json_loads({args})'
    
    # 应用替换
    new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    
    # 如果内容有变化，写回文件
    if new_content != content:
        # 添加导入语句（如果尚未添加）
        import_pattern = r'^import\s+json\s*$'
        safe_json_import = 'import json\nfrom .error_handler import safe_json_loads\n'
        
        # 检查是否已有导入
        if re.search(import_pattern, new_content, re.MULTILINE):
            # 替换 json 导入
            new_content = re.sub(
                import_pattern, 
                safe_json_import, 
                new_content, 
                count=1, 
                flags=re.MULTILINE
            )
        elif 'from .error_handler import safe_json_loads' not in new_content:
            # 在文件开头添加导入
            new_content = safe_json_import + '\n' + new_content
        
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            logger.info(f"已更新文件: {file_path}")
            return True
        except (IOError, OSError) as e:
            logger.error(f"无法写入文件 {file_path}: {e}")
            return False
    
    logger.debug(f"文件无需修改: {file_path}")
    return False


def scan_and_update_skills_directory(skills_dir: str) -> None:
    """
    扫描技能目录并更新所有 Python 文件中的 json.loads() 调用。

    Args:
        skills_dir: 技能目录路径
    """
    if not os.path.exists(skills_dir):
        logger.error(f"目录不存在: {skills_dir}")
        return
    
    logger.info(f"开始扫描目录: {skills_dir}")
    modified_files = 0
    
    # 遍历目录中的所有 .py 文件
    for root, dirs, files in os.walk(skills_dir):
        for file in files:
            if file.endswith('.py'):
                file_path = os.path.join(root, file)
                logger.info(f"处理文件: {file_path}")
                
                if update_json_loads_in_file(file_path):
                    modified_files += 1
    
    logger.info(f"扫描完成。修改了 {modified_files} 个文件。")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        target_dir = sys.argv[1]
    else:
        # 默认目录：当前脚本所在目录的上一级下的 skills 目录
        script_dir = os.path.dirname(os.path.abspath(__file__))
        target_dir = os.path.join(script_dir, '..', 'acp-proxy', 'skills')
    
    # 转换为绝对路径
    target_dir = os.path.abspath(target_dir)
    
    # 创建错误处理模块文件
    error_handler_path = os.path.join(target_dir, 'error_handler.py')
    error_handler_content = '''
"""
错误处理模块，为 JSON 解析提供统一的错误处理机制。
"""

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def safe_json_loads(json_string: str) -> Any:
    """
    安全地解析 JSON 字符串，包含统一的错误处理。

    Args:
        json_string: 需要解析的 JSON 字符串

    Returns:
        解析后的 Python 对象，或包含错误信息的字典
    """
    try:
        return json.loads(json_string)
    except json.JSONDecodeError as e:
        error_msg = "输入的 JSON 格式无效"
        detail_msg = f"JSON 解析错误: {e}"
        logger.warning(detail_msg)
        return {"error": error_msg, "detail": detail_msg}
    except ValueError as e:
        error_msg = "输入值无效"
        detail_msg = f"值错误: {e}"
        logger.warning(detail_msg)
        return {"error": error_msg, "detail": detail_msg}
    except Exception as e:
        error_msg = "解析输入时发生意外错误"
        detail_msg = f"意外错误: {type(e).__name__}: {e}"
        logger.error(detail_msg, exc_info=True)
        return {"error": error_msg, "detail": detail_msg}
'''
    
    # 写入错误处理模块
    try:
        with open(error_handler_path, 'w', encoding='utf-8') as f:
            f.write(error_handler_content)
        logger.info(f"已创建错误处理模块: {error_handler_path}")
    except (IOError, OSError) as e:
        logger.error(f"无法创建错误处理模块 {error_handler_path}: {e}")
    
    # 扫描并更新文件
    scan_and_update_skills_directory(target_dir)