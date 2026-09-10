"""
结果分析与错误识别技能模块
用于解决反思中“存在未分析的观察，信息处理不完整”和“错误自修复 (进度: 0%)”的问题
"""

import re
from typing import Dict, List, Any


def analyze_and_fix(last_cycle_log: dict, context: dict) -> dict:
    """
    分析上一个执行周期的结果并识别错误，生成修复建议
    
    Args:
        last_cycle_log: 包含上一个执行周期详细日志的字典
        context: 上下文字典，包含用户最后的对话、当前目标等
        
    Returns:
        包含分析结果、识别出的错误和修复建议的字典
    """
    # 初始化结果字典
    result = {
        'analysis': '',
        'identified_errors': [],
        'fix_suggestions': []
    }
    
    # 提取关键信息
    actions = last_cycle_log.get('actions', [])
    outputs = last_cycle_log.get('outputs', [])
    errors = last_cycle_log.get('errors', [])
    metadata = last_cycle_log.get('metadata', {})
    
    # 第一部分：分析显式错误
    if errors:
        result['analysis'] = "执行周期中存在明确的错误记录"
        
        for i, error in enumerate(errors):
            error_type = _identify_error_type(error)
            error_info = {
                'error_index': i,
                'error_type': error_type,
                'error_message': str(error)[:200],  # 限制错误信息长度
                'related_action': actions[i] if i < len(actions) else None
            }
            result['identified_errors'].append(error_info)
            
            # 尝试生成修复建议
            fix_suggestion = _generate_fix_suggestion(error_type, error, context)
            if fix_suggestion:
                result['fix_suggestions'].append({
                    'for_error_index': i,
                    'suggestion': fix_suggestion
                })
    
    # 第二部分：检查输出质量（如果没有显式错误）
    elif outputs:
        output_issues = []
        
        for i, output in enumerate(outputs):
            if not _validate_output(output, actions[i] if i < len(actions) else None):
                output_issues.append({
                    'output_index': i,
                    'issue': "输出不符合预期",
                    'expected_pattern': _get_expected_pattern(actions[i] if i < len(actions) else None)
                })
        
        if output_issues:
            result['analysis'] = f"未发现明确错误，但检测到{len(output_issues)}个输出质量问题"
            result['identified_errors'] = [
                {
                    'error_type': 'OUTPUT_VALIDATION',
                    'error_message': issue['issue'],
                    'output_index': issue['output_index']
                }
                for issue in output_issues
            ]
            
            # 为输出质量问题提供建议
            for issue in output_issues:
                suggestion = _generate_output_fix_suggestion(issue)
                result['fix_suggestions'].append({
                    'for_output_index': issue['output_index'],
                    'suggestion': suggestion
                })
        else:
            result['analysis'] = "执行周期完成，未发现明显错误或输出质量问题"
    else:
        result['analysis'] = "执行周期没有记录输出或错误，可能是空操作"
    
    # 添加元数据用于知识积累
    result['metadata'] = {
        'cycle_id': metadata.get('cycle_id'),
        'skill_name': metadata.get('skill_name'),
        'timestamp': metadata.get('timestamp'),
        'analysis_confidence': _calculate_analysis_confidence(result)
    }
    
    return result


def _identify_error_type(error: Any) -> str:
    """识别错误类型"""
    error_str = str(error).lower()
    
    # 常见Python错误模式
    error_patterns = {
        'ImportError': r'importerror|module not found|no module named',
        'FileNotFoundError': r'filenotfounderror|no such file|file not found',
        'SyntaxError': r'syntaxerror|invalid syntax|unexpected token',
        'TypeError': r'typeerror|unsupported operand|not callable',
        'AttributeError': r'attributeerror|no attribute',
        'PermissionError': r'permissionerror|permission denied',
        'ConnectionError': r'connectionerror|connection refused|timeout',
        'TimeoutError': r'timeouterror|timed out',
        'MemoryError': r'memoryerror|out of memory',
        'ValueError': r'valueerror|invalid literal',
        'KeyError': r'keyerror|key not found',
        'IndexError': r'indexerror|out of range|list index',
    }
    
    for error_type, pattern in error_patterns.items():
        if re.search(pattern, error_str, re.IGNORECASE):
            return error_type
    
    # 尝试从错误消息中提取类型
    if ':' in str(error):
        return str(error).split(':')[0].strip()
    
    return 'UNKNOWN_ERROR'


def _generate_fix_suggestion(error_type: str, error: Any, context: dict) -> str:
    """根据错误类型生成修复建议"""
    error_str = str(error).lower()
    suggestions = []
    
    if error_type == 'ImportError':
        # 尝试提取缺失的模块名
        module_match = re.search(r'no module named [\'"]?(\w+)', error_str)
        if module_match:
            module_name = module_match.group(1)
            suggestions.append(f"建议安装缺失的模块：pip install {module_name}")
        else:
            suggestions.append("检查是否安装了所需的依赖包")
            suggestions.append("尝试使用 pip install <package_name> 安装缺失的包")
    
    elif error_type == 'FileNotFoundError':
        # 尝试提取文件路径
        path_match = re.search(r'[\'"]([^\'"]+)[\'"]', error_str)
        if path_match:
            file_path = path_match.group(1)
            suggestions.append(f"检查文件路径是否正确：{file_path}")
            
            # 检查是否是目录问题
            if '/' in file_path or '\\' in file_path:
                dir_path = '/'.join(file_path.split('/')[:-1])
                suggestions.append(f"尝试创建目录：mkdir -p {dir_path}")
        else:
            suggestions.append("检查文件或目录是否存在")
            suggestions.append("如果是新建文件，确保父目录存在")
    
    elif error_type == 'SyntaxError':
        suggestions.append("检查代码语法，特别注意括号、引号、冒号的匹配")
        suggestions.append("使用代码编辑器的语法检查功能")
        suggestions.append("将代码分段执行，定位错误位置")
    