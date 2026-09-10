import json
import logging
from functools import wraps

# 配置日志记录
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))
logger.addHandler(handler)


def safe_json_loads(json_string: str, default=None):
    """
    安全解析JSON字符串，统一错误处理
    
    Args:
        json_string: 要解析的JSON字符串
        default: 解析失败时的默认返回值
        
    Returns:
        dict: 解析成功返回解析结果，失败返回错误信息字典
    """
    try:
        return json.loads(json_string)
    except json.JSONDecodeError as e:
        error_msg = f"JSON解析错误: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {
            'error': 'JSON解析失败',
            'detail': error_msg
        }
    except ValueError as e:
        error_msg = f"值错误: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {
            'error': '值解析失败',
            'detail': error_msg
        }
    except Exception as e:
        error_msg = f"未预期的错误: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {
            'error': 'JSON解析失败',
            'detail': error_msg
        }


def json_error_handler(func):
    """
    装饰器：为函数中所有json.loads调用添加统一错误处理
    
    用法：
        @json_error_handler
        def my_function():
            data = json.loads(some_string)
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except json.JSONDecodeError as e:
            error_msg = f"JSON解析错误: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return {
                'error': 'JSON解析失败',
                'detail': error_msg
            }
        except ValueError as e:
            error_msg = f"值错误: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return {
                'error': '值解析失败',
                'detail': error_msg
            }
        except Exception as e:
            error_msg = f"未预期的错误: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return {
                'error': '处理失败',
                'detail': error_msg
            }
    return wrapper


def validate_json_response(data, field_name: str = None):
    """
    验证JSON响应数据，确保是字典格式
    
    Args:
        data: 要验证的数据
        field_name: 字段名称，用于错误信息
        
    Returns:
        dict: 验证通过返回原数据，失败返回错误信息字典
    """
    if data is None:
        return {
            'error': '数据为空',
            'detail': f'{field_name or "数据"}为空'
        }
    
    if not isinstance(data, dict):
        return {
            'error': '无效的数据格式',
            'detail': f'{field_name or "数据"}不是字典格式'
        }
    