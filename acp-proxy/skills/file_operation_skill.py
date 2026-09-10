import json
import logging
from typing import Any, Dict, Optional, Union

# 配置日志
logger = logging.getLogger(__name__)

def parse_json_with_error_handling(data: Any, context_info: str = "") -> Union[Dict[str, Any], None]:
    """
    解析JSON字符串，带有稳健的错误处理机制
    
    Args:
        data: 要解析的数据，可能是字符串或其他类型
        context_info: 上下文信息，用于日志记录
    
    Returns:
        解析后的字典，解析失败时返回None
    """
    # 类型检查：如果不是字符串或None，先记录错误
    if data is None:
        logger.error(f"{context_info} - 数据为None，无法解析JSON")
        return None
    
    if not isinstance(data, str):
        logger.error(f"{context_info} - 期望字符串类型，实际得到: {type(data).__name__}")
        return None
    
    try:
        return json.loads(data)
    except json.JSONDecodeError as e:
        # 截断原始数据以避免日志过长（保留前200个字符）
        truncated_data = data[:200] + "..." if len(data) > 200 else data
        logger.error(
            f"{context_info} - JSON解析失败\n"
            f"原始数据（截断）: {truncated_data}\n"
            f"异常信息: {str(e)}\n"
            f"异常类型: {type(e).__name__}",
            exc_info=True
        )
        return None

def create_error_response(error_msg: str, error_code: int = -1) -> Dict[str, Any]:
    """
    创建标准化的错误响应
    
    Args:
        error_msg: 错误消息
        error_code: 错误码，默认为-1
    
    Returns:
        错误响应字典
    """
    return {
        "success": False,
        "error_code": error_code,
        "error_message": error_msg,
        "data": None
    }

def create_success_response(data: Any = None) -> Dict[str, Any]:
    """
    创建标准化的成功响应
    
    Args:
        data: 响应数据
    
    Returns:
        成功响应字典
    """
    return {
        "success": True,
        "error_code": 0,
        "error_message": "",
        "data": data
    }

# 示例：在技能方法中使用这些函数

class FileOperationSkill:
    """
    文件操作技能类，包含各种文件操作功能
    """
    
    def process_file_content(self, content: str) -> Dict[str, Any]:
        """
        处理文件内容，将其解析为JSON格式
        
        Args:
            content: 文件内容字符串
        
        Returns:
            标准化的响应结果
        """
        logger.info("开始处理文件内容")
        
        # 使用带错误处理的JSON解析
        parsed_data = parse_json_with_error_handling(content, "文件内容处理")
        
        if parsed_data is None:
            return create_error_response(
                error_msg="文件内容格式无效，无法解析为JSON",
                error_code=1001
            )
        
        # 这里可以继续处理解析后的数据
        logger.info(f"文件内容解析成功，数据类型: {type(parsed_data).__name__}")
        
        # 示例：进行一些业务处理
        result_data = self._process_parsed_data(parsed_data)
        
        return create_success_response(data=result_data)
    
    def load_config_from_string(self, config_str: str) -> Dict[str, Any]:
        """
        从字符串加载配置
        
        Args:
            config_str: 配置字符串
        
        Returns:
            标准化的响应结果
        """
        logger.info("开始加载配置")
        
        # 使用带错误处理的JSON解析
        config_data = parse_json_with_error_handling(config_str, "配置加载")
        
        if config_data is None:
            return create_error_response(
                error_msg="配置格式无效，无法解析为JSON",
                error_code=2001
            )
        
        logger.info("配置加载成功")
        return create_success_response(data=config_data)
    
    def parse_user_input(self, user_input: Any) -> Dict[str, Any]:
        """
        解析用户输入
        
        Args:
            user_input: 用户输入，可能是字符串或其他类型
        
        Returns:
            标准化的响应结果
        """
        logger.info(f"开始解析用户输入，输入类型: {type(user_input).__name__}")
        
        # 使用带错误处理的JSON解析，包含类型检查
        parsed_input = parse_json_with_error_handling(user_input, "用户输入解析")
        
        if parsed_input is None:
            # 根据不同情况返回不同的错误消息
            if user_input is None:
                error_msg = "用户输入为None"
            elif not isinstance(user_input, str):
                error_msg = f"用户输入类型无效，期望字符串，实际得到: {type(user_input).__name__}"
            else:
                error_msg = "用户输入格式无效，无法解析为JSON"
            
            return create_error_response(
                error_msg=error_msg,
                error_code=3001
            )
        
        logger.info("用户输入解析成功")
        return create_success_response(data=parsed_input)
    
    def _process_parsed_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        处理解析后的数据
        
        Args:
            data: 解析后的数据
        
        Returns:
            处理后的数据
        """
        # 这里可以添加实际的业务逻辑
        # 示例：简单返回原始数据
        return data

# 使用示例
if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    skill = FileOperationSkill()
    
    # 测试正常情况
    test_content = '{"key": "value", "number": 42}'
    result1 = skill.process_file_content(test_content)
    print("正常情况结果:", result1)
    
    # 测试异常情况：无效JSON