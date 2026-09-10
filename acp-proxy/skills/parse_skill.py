import json
import re
import logging
from typing import Tuple, Any, Optional, Dict
from functools import lru_cache
import asyncio
from contextlib import contextmanager

# 尝试导入第三方宽容解析库
try:
    import json5
    HAS_JSON5 = True
except ImportError:
    HAS_JSON5 = False

try:
    import demjson3
    HAS_DEMJSON = True
except ImportError:
    HAS_DEMJSON = False

logger = logging.getLogger(__name__)


class JSONParseError(Exception):
    """自定义JSON解析异常，包含详细上下文信息"""
    
    def __init__(self, message: str, original_error: Exception = None, 
                 json_string: str = None, strategy: str = None):
        self.original_error = original_error
        self.json_string = json_string
        self.strategy = strategy
        super().__init__(message)


class JsonParseResult:
    """JSON解析结果包装器"""
    
    def __init__(self, data: Any = None, error: Exception = None, 
                 success: bool = True, strategy_used: str = None):
        self.data = data
        self.error = error
        self.success = success
        self.strategy_used = strategy_used
    
    def __bool__(self):
        return self.success
    
    def get(self, default=None):
        """获取解析数据，失败时返回默认值"""
        return self.data if self.success else default


def clean_json_string(json_string: str) -> str:
    """清理常见JSON格式问题"""
    if not isinstance(json_string, str):
        return json_string
    
    cleaned = json_string.strip()
    
    # 处理注释（单行和多行）
    cleaned = re.sub(r'//.*?\n|/\*.*?\*/', '', cleaned, flags=re.DOTALL)
    
    # 处理多余逗号（对象或数组末尾的逗号）
    cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)
    
    # 处理未转义的字符
    cleaned = cleaned.replace('\n', '\\n').replace('\t', '\\t').replace('\r', '\\r')
    
    # 处理单引号替换为双引号（谨慎使用，可能影响内容）
    # cleaned = cleaned.replace("'", '"')
    
    # 处理没有引号的键名
    cleaned = re.sub(r'([{,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', cleaned)
    
    return cleaned


@contextmanager
def parse_attempts_context(json_string: str, max_attempts: int = 3):
    """解析重试上下文管理器"""
    attempts = 0
    last_error = None
    
    while attempts < max_attempts:
        try:
            yield attempts
            break
        except Exception as e:
            attempts += 1
            last_error = e
            if attempts >= max_attempts:
                raise last_error


def safe_json_parse(json_string: str, context: str = None, 
                   max_attempts: int = 2, allow_none: bool = False) -> Tuple[Any, Optional[str]]:
    """
    安全JSON解析包装函数
    
    Args:
        json_string: 要解析的JSON字符串
        context: 上下文信息，用于错误报告
        max_attempts: 最大重试次数
        allow_none: 是否允许None输入
    
    Returns:
        Tuple[data, error]: 解析数据和错误信息，成功时error为None
    """
    if json_string is None and allow_none:
        return None, None
    
    if not isinstance(json_string, str):
        return None, f"输入类型错误: 期望str, 得到{type(json_string)}"
    
    strategies = [
        ('标准json.loads', lambda s: json.loads(s)),
        ('清理后解析', lambda s: json.loads(clean_json_string(s))),
    ]
    
    # 添加第三方解析器
    if HAS_JSON5:
        strategies.append(('json5解析', lambda s: json5.loads(s)))
    
    if HAS_DEMJSON:
        strategies.append(('demjson3解析', lambda s: demjson3.decode(s)))
    
    errors = []
    context_info = f"上下文: {context}" if context else ""
    
    for attempt in range(max_attempts):
        for strategy_name, parser in strategies:
            try:
                result = parser(json_string)
                return result, None
            except Exception as e:
                error_msg = f"尝试{strategy_name}失败 (第{attempt + 1}次): {str(e)}"
                errors.append(error_msg)
                logger.debug(f"{error_msg} {context_info}")
                continue
    
    # 所有策略都失败
    error_summary = "; ".join(errors)
    full_error = f"JSON解析失败 {context_info}. 错误详情: {error_summary}"
    logger.warning(full_error)
    return None, full_error


async def async_safe_json_parse(json_string: str, context: str = None,
                               max_attempts: int = 2) -> Tuple[Any, Optional[str]]:
    """异步版本的安全JSON解析"""
    # 在异步环境中运行同步解析函数
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, 
        lambda: safe_json_parse(json_string, context, max_attempts)
    )


def parse_json_response(response_data: Any, context: str = None) -> JsonParseResult:
    """
    解析API响应中的JSON数据
    
    Args:
        response_data: 响应数据（字符串或字典）
        context: 上下文信息
    
    Returns:
        JsonParseResult: 解析结果包装
    """
    if isinstance(response_data, dict):
        return JsonParseResult(data=response_data, success=True)
    
    if isinstance(response_data, str):
        data, error = safe_json_parse(response_data, context)
        if data is not None:
            return JsonParseResult(data=data, success=True)
        return JsonParseResult(error=JSONParseError(
            message=error,
            json_string=response_data,
            strategy="all_failed"
        ), success=False)
    
    return JsonParseResult(
        error=JSONParseError(
            message=f"不支持的响应类型: {type(response_data)}",
            json_string=str(response_data)
        ),
        success=False
    )


# 缓存常用解析结果