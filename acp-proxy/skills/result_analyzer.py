import re
from typing import Dict, Any, List, Optional


def _extract_error_info(error_str: str) -> Dict[str, Optional[str]]:
    """从错误字符串中提取结构化信息"""
    error_info = {
        "type": None,
        "message": error_str,
        "module": None,
        "file": None
    }
    
    # 尝试匹配常见的错误模式
    patterns = [
        # ImportError: No module named 'xxx'
        (r"ImportError: No module named '(\w+)'", lambda m: {"type": "ImportError", "module": m.group(1)}),
        # ModuleNotFoundError: No module named 'xxx'
        (r"ModuleNotFoundError: No module named '(\w+)'", lambda m: {"type": "ModuleNotFoundError", "module": m.group(1)}),
        # FileNotFoundError: [Errno 2] No such file or directory: 'xxx'
        (r"FileNotFoundError:.*No such file or directory: '(.+)'", lambda m: {"type": "FileNotFoundError", "file": m.group(1)}),
        # PermissionError: [Errno 13] Permission denied: 'xxx'
        (r"PermissionError:.*Permission denied: '(.+)'", lambda m: {"type": "PermissionError", "file": m.group(1)}),
        # TypeError: xxx
        (r"TypeError: (.+)", lambda m: {"type": "TypeError", "message": m.group(1)}),
        # SyntaxError: xxx
        (r"SyntaxError: (.+)", lambda m: {"type": "SyntaxError", "message": m.group(1)}),
        # ValueError: xxx
        (r"ValueError: (.+)", lambda m: {"type": "ValueError", "message": m.group(1)}),
        # KeyError: xxx
        (r"KeyError: '(\w+)'", lambda m: {"type": "KeyError", "message": m.group(1)}),
    ]
    
    for pattern, extractor in patterns:
        match = re.search(pattern, error_str, re.IGNORECASE)
        if match:
            extracted = extractor(match)
            error_info.update(extracted)
            break
    
    return error_info


def _generate_fix_suggestions(error_info: Dict[str, Any], context: Dict[str, Any]) -> List[str]:
    """根据错误信息生成修复建议"""
    suggestions = []
    error_type = error_info.get("type")
    
    if error_type == "ImportError" or error_type == "ModuleNotFoundError":
        module = error_info.get("module")
        if module:
            suggestions.append(f"建议安装缺失的模块: `pip install {module}`")
            suggestions.append(f"如果模块名不同，尝试: `pip install {module.replace('-', '_')}`")
            suggestions.append(f"检查是否拼写正确，可用 `pip search {module}` 查找")
    
    elif error_type == "FileNotFoundError":
        file_path = error_info.get("file")
        if file_path:
            suggestions.append(f"检查文件路径是否正确: '{file_path}'")
            # 尝试建议创建目录
            if '/' in file_path or '\\' in file_path:
                parent_dir = '/'.join(file_path.split('/')[:-1]) if '/' in file_path else '\\'.join(file_path.split('\\')[:-1])
                suggestions.append(f"如目录不存在，尝试创建: `mkdir -p {parent_dir}`")
    
    elif error_type == "PermissionError":
        file_path = error_info.get("file")
        if file_path:
            suggestions.append(f"检查文件权限: `ls -l {file_path}`")
            suggestions.append(f"尝试修改权限: `chmod +w {file_path}` 或使用sudo")
    
    elif error_type == "SyntaxError":
        suggestions.append("检查代码语法，特别注意括号、引号和缩进")
        suggestions.append("使用Python的 `-tt` 参数检查混合制表符和空格")
    
    elif error_type == "KeyError":
        key = error_info.get("message")
        suggestions.append(f"检查字典中是否存在键 '{key}'")
        suggestions.append("可以使用 `.get(key, default)` 方法避免KeyError")
        suggestions.append("使用 `key in dictionary` 进行键存在性检查")
    
    # 通用建议
    if not suggestions:
        suggestions.append("请检查错误信息详情，确认问题所在")
        suggestions.append("尝试在开发环境中重现问题进行调试")
        suggestions.append("查看相关模块的官方文档或社区支持")
    
    return suggestions


def analyze_and_fix(last_cycle_log: dict, context: dict) -> dict:
    """
    结果分析与错误识别技能
    
    分析上一个执行周期的日志，识别错误模式，并生成修复建议。
    用于解决反思中的"存在未分析的观察"和"错误自修复进度为0%"问题。
    
    参数:
        last_cycle_log: 包含上一个执行周期详细日志的字典
        context: 上下文字典，包含用户最后的对话、当前目标等
    
    返回:
        包含分析结果、识别错误和修复建议的字典
    """
    
    # 初始化输出结构
    result = {
        "analysis": "",
        "identified_errors": [],
        "fix_suggestions": []
    }
    
    # 从日志中提取关键信息
    actions = last_cycle_log.get("actions", [])
    outputs = last_cycle_log.get("outputs", [])
    errors = last_cycle_log.get("errors", [])
    
    # 1. 分析是否有显式错误
    if errors:
        # 处理每个错误
        for error in errors:
            error_str = str(error)
            error_info = _extract_error_info(error_str)
            
            result["identified_errors"].append({
                "original_error": error_str,
                "parsed_info": error_info,
                "context": context
            })
            
            # 生成修复建议
            suggestions = _generate_fix_suggestions(error_info, context)
            result["fix_suggestions"].extend(suggestions)
        
        result["analysis"] = f"执行周期发现 {len(errors)} 个显式错误。"
    
    # 2. 检查输出是否符合预期（无显式错误时）
    elif outputs:
        result["analysis"] = "执行完成，正在分析输出结果..."
        
        # 检查每个输出是否合理
        problematic_outputs = []
        for i, output in enumerate(outputs):
            output_type = type(output).__name__
            
            # 检查输出是否为空
            if output is None:
                problematic_outputs.append({
                    "index": i,
                    "issue": "输出为None",
                    "suggestion": "检查该步骤的逻辑，确保返回有效结果"
                })
            
            # 检查字符串输出是否为空或只包含空白
            elif isinstance(output, str) and not output.strip():
                problematic_outputs.append({
                    "index": i,
                    "issue": "输出为空字符串",
                    "suggestion": "检查生成逻辑，确保产生有意义的输出"
                })
            
            # 检查列表/字典是否为空
            elif isinstance(output, (list, dict)) and len(output) == 0:
                problematic_outputs.append({
                    "index": i,
                    "issue": f"输出{output_type}为空",
                    "suggestion": "检查数据来源和处理逻辑"
                })
        
        if problematic_outputs:
            result["identified_errors"].extend(problematic_outputs)
            