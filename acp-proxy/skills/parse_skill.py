# acp-proxy/skills/parse_skill.py
"""
JSON解析包装器模块
提供统一的JSON解析逻辑，支持多种解析策略和错误处理
"""

import json
import re
import logging
from typing import Any, Tuple, Optional, Union, Dict

logger = logging.getLogger(__name__)

# 尝试导入可选的第三方JSON解析库
_json5_available = False
_demjson3_available = False

try:
    import json5
    _json5_available = True
except ImportError:
    pass

try:
    import demjson3
    _demjson3_available = True
except ImportError:
    pass


class JSONParseResult:
    """JSON解析结果封装类"""
    
    def __init__(self, data: Any = None, error: Optional[str] = None, 
                 success: bool = True, strategy_used: Optional[str] = None):
        self.data = data
        self.error = error
        self.success = success
        self.strategy_used = strategy_used
    
    def __bool__(self) -> bool:
        return self.success
    
    def __repr__(self) -> str:
        if self.success:
            return f"JSONParseResult(success={self.success}, data={repr(self.data)[:50]}...)"
        else:
            return f"JSONParseResult(success={self.success}, error='{self.error}')"


def safe_json_parse(
    json_string: str, 
    context: Optional[str] = None,
    max_retries: int = 1,
    allow_nan: bool = False,
    strict: bool = True,
    use_fallback_libs: bool = True
) -> Union[JSONParseResult, Tuple[Optional[Any], Optional[str]]]:
    """
    安全的JSON解析包装函数
    
    Args:
        json_string: 要解析的JSON字符串
        context: 上下文信息，用于错误报告
        max_retries: 最大重试次数
        allow_nan: 是否允许NaN值
        strict: 是否使用严格模式
        use_fallback_libs: 是否使用第三方库作为后备解析器
    
    Returns:
        返回JSONParseResult对象或元组(data, error)
    """
    
    if not isinstance(json_string, str):
        error_msg = f"输入必须是字符串，实际类型: {type(json_string).__name__}"
        if context:
            error_msg = f"{context}: {error_msg}"
        return JSONParseResult(error=error_msg, success=False)
    
    # 清理输入字符串
    json_string = json_string.strip()
    if not json_string:
        error_msg = "输入字符串为空"
        if context:
            error_msg = f"{context}: {error_msg}"
        return JSONParseResult(error=error_msg, success=False)
    
    strategies = [
        ("standard", _parse_standard_json),
        ("cleaned", _parse_cleaned_json),
    ]
    
    if use_fallback_libs:
        if _json5_available:
            strategies.append(("json5", _parse_with_json5))
        if _demjson3_available:
            strategies.append(("demjson3", _parse_with_demjson3))
    
    last_error = None
    
    for attempt in range(max_retries + 1):
        for strategy_name, strategy_func in strategies:
            try:
                result = strategy_func(
                    json_string, 
                    allow_nan=allow_nan, 
                    strict=strict
                )
                
                if result is not None:
                    return JSONParseResult(
                        data=result, 
                        success=True, 
                        strategy_used=strategy_name
                    )
                    
            except Exception as e:
                last_error = f"{strategy_name}策略失败: {str(e)}"
                logger.debug(f"解析尝试 {attempt+1}/{max_retries+1}, 策略 {strategy_name}: {last_error}")
                
                if strategy_name == "standard":
                    # 标准解析失败后尝试清理
                    continue
                elif strategy_name == "cleaned":
                    # 清理后仍然失败，记录并尝试其他策略
                    continue
                else:
                    # 其他策略失败
                    continue
    
    # 所有策略都失败
    error_msg = f"JSON解析失败，已尝试所有可用策略"
    if context:
        error_msg = f"{context}: {error_msg}"
    if last_error:
        error_msg += f"。最后错误: {last_error}"
    
    return JSONParseResult(error=error_msg, success=False)


def _parse_standard_json(
    json_string: str, 
    allow_nan: bool = False, 
    strict: bool = True
) -> Any:
    """标准JSON解析"""
    return json.loads(
        json_string, 
        allow_nan=allow_nan, 
        strict=strict
    )


def _parse_cleaned_json(
    json_string: str, 
    allow_nan: bool = False, 
    strict: bool = True
) -> Any:
    """尝试清理常见格式问题后解析"""
    
    cleaned_string = json_string
    
    # 1. 移除行首行尾的空白字符，但保留字符串内的空白
    lines = cleaned_string.split('\n')
    cleaned_lines = [line.strip() for line in lines]
    cleaned_string = '\n'.join(cleaned_lines)
    
    # 2. 处理多余逗号
    # 移除对象或数组末尾的多余逗号
    cleaned_string = re.sub(r',\s*([}\]])', r'\1', cleaned_string)
    
    # 3. 处理单引号替换为双引号（简单情况）
    # 注意：这不是完美的解决方案，但对于简单情况有效
    if "'" in cleaned_string and '"' not in cleaned_string:
        cleaned_string = cleaned_string.replace("'", '"')
    
    # 4. 处理未转义的特殊字符
    # 修复常见问题：未转义的换行符、制表符等
    cleaned_string = cleaned_string.replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
    
    # 5. 处理注释（简单移除行注释）
    # 移除 // 注释（不在字符串内的）
    def remove_line_comments(match):
        # 检查是否在字符串内
        if match.group(1):
            return match.group(0)  # 在字符串内，保留
        return ''
    
    cleaned_string = re.sub(r'(".*?"|\'?.*?\'?)|(//[^\n]*)', remove_line_comments, cleaned_string)
    
    # 6. 处理未引用的键（简单情况）
    # 将 {key: value} 转换为 {"key": value}
    def fix_unquoted_keys(match):
        prefix = match.group(1)
        key = match.group(2)
        if key and not (key.startswith('"') or key.startswith("'")):
            return f'{prefix}"{key}":'
        return match.group(0)
    
    cleaned_string = re.sub(r'([{\s,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', fix_unquoted_keys, cleaned_string)
    
    # 7. 处理尾部逗号和缺失的逗号
    # 这是一个简化处理，可能不适用于所有情况
    
    try:
        return json.loads(
            cleaned_string, 
            allow_nan=allow_nan, 
            strict=strict
        )
    except:
        # 如果清理后仍然失败，抛出原始异常
        raise


def _parse_with_json5(
    json_string: str, 
    allow_nan: bool = False, 
    strict: bool = True
) -> Any:
    """使用json5库解析"""
    if not _json5_available:
        raise ImportError("json5库未安装")
    
    # json5默认允许注释、单引号、尾随逗号等
    return json5.loads(json_string)


def _parse_with_demjson3(
    json_string: str, 
    allow_nan: bool = False, 
    strict: bool = True
) -> Any:
    """使用demjson3库解析"""
    if not _demjson3_available:
        raise ImportError("demjson3库未安装")
    
    # demjson3是一个宽容的JSON解析器
    return demjson3.decode(json_string)

