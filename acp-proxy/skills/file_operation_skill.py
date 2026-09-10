import json
import logging
from typing import Dict, Any, Union

logger = logging.getLogger(__name__)

# 其他原有代码（请保留原文件中的其他内容）...

# 在文件中找到所有调用json.loads()的地方，并按如下方式修改：

# 示例1：假设原代码中有这样的调用
# old_code: data = json.loads(some_string)

# 修改为：
def parse_json_safely(json_str: str) -> Union[Dict[str, Any], None]:
    """安全解析JSON字符串的辅助函数"""
    try:
        # 检查输入类型，避免对非字符串调用json.loads引发TypeError
        if not isinstance(json_str, str):
            error_msg = f"预期字符串类型输入，但收到 {type(json_str).__name__} 类型"
            logger.error(error_msg)
            return {
                "status": -1,
                "message": f"输入数据类型错误: {error_msg}"
            }
        
        return json.loads(json_str)
    
    except json.JSONDecodeError as e:
        # 记录错误日志（截断过长的数据以避免日志过大）
        log_data = json_str[:500] + "..." if len(json_str) > 500 else json_str
        error_msg = f"JSON解析失败，原始数据: {log_data!r}, 错误: {e}"
        logger.error(error_msg, exc_info=True)  # exc_info=True 会记录堆栈信息
        
        # 返回标准化的错误响应
        return {
            "status": -1,
            "message": f"输入数据格式无效，无法解析为JSON: {str(e)}"
        }
    except Exception as e:
        # 捕获其他可能的异常（如内存错误等）
        logger.error(f"JSON解析过程中发生未知错误: {str(e)}", exc_info=True)
        return {
            "status": -1,
            "message": f"JSON解析过程中发生错误: {str(e)}"
        }

# 使用示例（请替换文件中所有直接调用json.loads的地方）
# 原调用方式：
# result = json.loads(some_data)
# 
# 替换为：
# result = parse_json_safely(some_data)
# if result is None or (isinstance(result, dict) and result.get("status") == -1):
#     return result  # 或者进行其他错误处理

# 如果原代码中json.loads调用已经在一个try-except块中，可以替换为上述辅助函数调用
# 并确保错误处理逻辑一致

# 示例2：如果原代码中有多处json.loads调用，都使用辅助函数
# 假设原函数：
def original_function(input_data):
    # 原代码可能直接使用: data = json.loads(input_data)
    data = parse_json_safely(input_data)
    
    # 检查是否解析失败
    if isinstance(data, dict) and data.get("status") == -1:
        return data
    
    # 原有正常逻辑继续执行...
    processed_data = data.get("content", {})  # 假设data是字典
    return {"status": 0, "data": processed_data}

# 其他原有代码（请保留原文件中的其他内容）...