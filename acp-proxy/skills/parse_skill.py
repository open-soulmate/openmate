"""
JSON解析包装器模块
统一处理所有技能中的JSON解析逻辑，提供安全的解析功能
"""
import json
import re
import logging
from typing import Any, Dict, List, Optional, Tuple, Union
from functools import wraps

# 配置日志
logger = logging.getLogger(__name__)

# 尝试导入可选的JSON解析库
try:
    import json5
    JSON5_AVAILABLE = True
except ImportError:
    JSON5_AVAILABLE = False
    logger.debug("json5 库未安装，将跳过此解析器")

try:
    import demjson3
    DEMJSON3_AVAILABLE = True
except ImportError:
    DEMJSON3_AVAILABLE = False
    logger.debug("demjson3 库未安装，将跳过此解析器")


class JsonParseError(Exception):
    """JSON解析异常"""
    def __init__(self, message: str, original_error: Optional[Exception] = None, context: Optional[str] = None):
        self.message = message
        self.original_error = original_error
        self.context = context
        super().__init__(message)


def safe_json_parse(
    json_string: str,
    context: Optional[str] = None,
    max_retries: int = 2,
    attempt_json5: bool = True,
    attempt_demjson3: bool = True,
    clean_input: bool = True
) -> Tuple[Optional[Any], Optional[JsonParseError]]:
    """
    安全的JSON解析函数
    
    Args:
        json_string: 要解析的JSON字符串
        context: 上下文描述，用于错误信息
        max_retries: 最大重试次数
        attempt_json5: 是否尝试使用json5库
        attempt_demjson3: 是否尝试使用demjson3库
        clean_input: 是否清理输入字符串
        
    Returns:
        Tuple[Optional[Any], Optional[JsonParseError]]: (解析后的数据, 错误信息)
        如果解析成功，错误为None；如果失败，数据为None
    """
    if not json_string or not isinstance(json_string, str):
        error = JsonParseError(
            "输入为空或不是字符串",
            context=context
        )
        return None, error
    
    original_string = json_string
    errors = []
    
    # 策略1: 标准json解析
    try:
        data = json.loads(json_string)
        return data, None
    except json.JSONDecodeError as e:
        errors.append(("标准json解析", str(e)))
        logger.debug(f"标准json解析失败: {e}, 上下文: {context}")
    
    # 策略2: 清理后重试
    if clean_input:
        cleaned_string = _clean_json_string(json_string)
        try:
            data = json.loads(cleaned_string)
            logger.info(f"清理后解析成功, 上下文: {context}")
            return data, None
        except json.JSONDecodeError as e:
            errors.append(("清理后重试", str(e)))
            logger.debug(f"清理后重试失败: {e}, 上下文: {context}")
    
    # 策略3: 多次重试（逐步清理）
    for attempt in range(max_retries):
        try:
            # 尝试更激进的清理
            aggressive_string = _aggressive_clean_json_string(json_string, attempt)
            data = json.loads(aggressive_string)
            logger.info(f"激进清理第{attempt+1}次尝试解析成功, 上下文: {context}")
            return data, None
        except json.JSONDecodeError as e:
            errors.append((f"激进清理第{attempt+1}次", str(e)))
            logger.debug(f"激进清理第{attempt+1}次失败: {e}, 上下文: {context}")
    
    # 策略4: 尝试json5解析器
    if attempt_json5 and JSON5_AVAILABLE:
        try:
            data = json5.loads(json_string)
            logger.info(f"使用json5解析成功, 上下文: {context}")
            return data, None
        except Exception as e:
            errors.append(("json5解析", str(e)))
            logger.debug(f"json5解析失败: {e}, 上下文: {context}")
    
    # 策略5: 尝试demjson3解析器
    if attempt_demjson3 and DEMJSON3_AVAILABLE:
        try:
            data = demjson3.decode(json_string)
            logger.info(f"使用demjson3解析成功, 上下文: {context}")
            return data, None
        except Exception as e:
            errors.append(("demjson3解析", str(e)))
            logger.debug(f"demjson3解析失败: {e}, 上下文: {context}")
    
    # 所有策略都失败，构造详细错误信息
    error_details = "\n".join([f"  {method}: {error}" for method, error in errors])
    error_message = f"JSON解析失败，已尝试所有策略:\n{error_details}"
    if context:
        error_message = f"{error_message}\n上下文: {context}"
    
    final_error = JsonParseError(
        message=error_message,
        original_error=errors[-1][1] if errors else None,
        context=context
    )
    
    # 记录原始字符串用于调试（截取前100个字符）
    logger.error(f"JSON解析完全失败: {error_message}\n原始字符串前100字符: {original_string[:100]}")
    
    return None, final_error


def _clean_json_string(json_string: str) -> str:
    """
    清理JSON字符串中的常见格式问题
    """
    # 移除注释
    json_string = re.sub(r'//.*?$', '', json_string, flags=re.MULTILINE)
    json_string = re.sub(r'/\*.*?\*/', '', json_string, flags=re.DOTALL)
    
    # 处理单引号（替换为双引号）
    json_string = json_string.replace("'", '"')
    
    # 处理尾随逗号
    json_string = re.sub(r',\s*([}\]])', r'\1', json_string)
    
    # 处理多余的逗号（如连续逗号）