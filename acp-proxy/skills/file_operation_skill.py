import json
import logging

# 原有代码保持不变...

def parse_json_data(data):
    """
    解析JSON数据的安全包装函数
    """
    try:
        # 检查输入类型，避免TypeError
        if data is None:
            logging.warning("JSON解析输入数据为None")
            return {"status": -1, "message": "输入数据不能为None"}
        
        if not isinstance(data, str):
            logging.warning(f"JSON解析输入数据类型错误，期望字符串，实际类型: {type(data)}")
            # 尝试转换为字符串
            data = str(data)
        
        result = json.loads(data)
        return {"status": 0, "data": result}
        
    except json.JSONDecodeError as e:
        # 截取前100个字符用于日志，避免敏感信息泄露
        data_preview = str(data)[:100] if data is not None else "None"
        logging.error(
            f"JSON解析失败，原始数据（前100字符）：{data_preview}，"
            f"错误信息：{str(e)}",
            exc_info=True
        )
        return {"status": -1, "message": f"输入数据格式无效，无法解析为JSON: {str(e)}"}
    
    except Exception as e:
        logging.error(f"JSON解析过程中发生未知错误: {str(e)}", exc_info=True)
        return {"status": -1, "message": f"JSON解析失败: {str(e)}"}

# 原有代码保持不变，需要修改的地方示例：
# 原代码: data = json.loads(some_string)
# 改为: data_result = parse_json_data(some_string)
#        if data_result["status"] == 0:
#            data = data_result["data"]
#        else:
#            return data_result  # 或者处理错误

# 其他所有json.loads调用都需要按照类似模式修改