import json
import logging
from typing import Any, Dict, Optional

# 设置日志
logger = logging.getLogger(__name__)
logger.setLevel(logging.ERROR)

# 标准化错误响应格式
def error_response(code: int = -1, message: str = "") -> Dict[str, Any]:
    """返回标准化的错误响应字典"""
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message
        }
    }

def success_response(data: Any = None) -> Dict[str, Any]:
    """返回标准化的成功响应字典"""
    return {
        "success": True,
        "data": data
    }

def safe_json_loads(data: Any, context: str = "") -> tuple[Optional[dict], Optional[Dict[str, Any]]]:
    """
    安全的JSON解析函数，包含类型检查和错误处理
    
    Args:
        data: 要解析的数据
        context: 调用上下文，用于日志记录
        
    Returns:
        tuple: (解析结果, 错误响应) 成功时返回 (dict, None)，失败时返回 (None, error_dict)
    """
    # 类型检查：确保输入是字符串
    if data is None:
        error_msg = f"输入数据为空 (None)"
        logger.error(f"JSON解析失败 - {context}: {error_msg}")
        return None, error_response(code=-1, message=error_msg)
    
    if not isinstance(data, str):
        error_msg = f"输入数据类型无效，期望字符串，实际类型为 {type(data).__name__}"
        logger.error(f"JSON解析失败 - {context}: {error_msg}")
        return None, error_response(code=-1, message=error_msg)
    
    # 尝试解析JSON
    try:
        result = json.loads(data)
        return result, None
    except json.JSONDecodeError as e:
        # 截断原始数据用于日志记录，避免日志过大
        log_data = data[:1000] + "..." if len(data) > 1000 else data
        error_msg = f"输入数据格式无效，无法解析为JSON: {str(e)}"
        logger.error(f"JSON解析失败 - {context}: {error_msg}，原始数据: {log_data}", exc_info=True)
        return None, error_response(code=-1, message=error_msg)
    except Exception as e:
        # 捕获其他意外异常
        error_msg = f"JSON解析时发生未知错误: {str(e)}"
        logger.error(f"JSON解析失败 - {context}: {error_msg}", exc_info=True)
        return None, error_response(code=-2, message=error_msg)

class FileOperationSkill:
    """文件操作技能类，处理各种文件相关操作"""
    
    def __init__(self):
        self.logger = logging.getLogger(f"{__name__}.FileOperationSkill")
    
    def parse_user_config(self, config_str: str) -> Dict[str, Any]:
        """
        解析用户配置字符串
        
        Args:
            config_str: 用户提供的配置字符串
            
        Returns:
            标准化响应字典
        """
        # 使用安全的JSON解析
        config, error = safe_json_loads(config_str, context="parse_user_config")
        if error:
            return error
        
        # 验证配置结构
        if not isinstance(config, dict):
            return error_response(code=-1, message="配置应为JSON对象")
        
        # 处理配置...
        self.logger.info(f"成功解析用户配置，包含 {len(config)} 个字段")
        return success_response(config)
    
    def process_command(self, command_json: str) -> Dict[str, Any]:
        """
        处理来自前端的命令JSON
        
        Args:
            command_json: 命令JSON字符串
            
        Returns:
            标准化响应字典
        """
        # 使用安全的JSON解析
        command, error = safe_json_loads(command_json, context="process_command")
        if error:
            return error
        
        # 验证命令结构
        if "action" not in command:
            return error_response(code=-1, message="命令缺少action字段")
        
        # 处理命令...
        action = command["action"]
        self.logger.info(f"处理命令: {action}")
        return success_response({"action": action, "status": "processed"})
    
    def read_file_metadata(self, metadata_str: str) -> Dict[str, Any]:
        """
        读取文件元数据字符串
        
        Args:
            metadata_str: 元数据JSON字符串
            
        Returns:
            标准化响应字典
        """
        # 使用安全的JSON解析
        metadata, error = safe_json_loads(metadata_str, context="read_file_metadata")
        if error:
            return error
        
        # 验证元数据结构
        required_fields = ["filename", "size", "type"]
        for field in required_fields:
            if field not in metadata:
                return error_response(code=-1, message=f"元数据缺少必要字段: {field}")
        
        # 处理元数据...
        self.logger.info(f"成功解析文件元数据: {metadata.get('filename')}")
        return success_response(metadata)
    
    def parse_batch_operation(self, batch_data: str) -> Dict[str, Any]:
        """
        解析批量操作数据
        
        Args:
            batch_data: 批量操作JSON字符串
            
        Returns:
            标准化响应字典
        """
        # 使用安全的JSON解析
        batch_list, error = safe_json_loads(batch_data, context="parse_batch_operation")
        if error:
            return error
        
        # 验证批量数据结构
        if not isinstance(batch_list, list):
            return error_response(code=-1, message="批量数据应为JSON数组")
        
        if len(batch_list) == 0:
            return error_response(code=-1, message="批量数据不能为空")
        
        # 处理批量操作...
        self.logger.info(f"解析批量操作，包含 {len(batch_list)} 个操作")
        return success_response({"operations": batch_list, "count": len(batch_list)})
    
    def handle_file_content(self, content_str: Optional[str]) -> Dict[str, Any]:
        """
        处理文件内容（可能为None或非字符串）
        
        Args:
            content_str: 文件内容字符串，可能为None
            
        Returns:
            标准化响应字典
        """
        # 直接调用安全解析函数，处理None和类型检查
        content, error = safe_json_loads(content_str, context="handle_file_content")
        if error:
            return error
        
        # 处理内容...
        self.logger.info("成功解析文件内容")
        return success_response(content)
    
    def _legacy_parse(self, data: str) -> Any:
        """
        遗留方法：需要迁移的JSON解析代码
        """
        # 原始代码可能这样写：
        # return json.loads(data)
        
        # 现在使用安全解析
        result, error = safe_json_loads(data, context="_legacy_parse")
        if error:
            raise ValueError(error["error"]["message"])
        
        return result

# 模块级别的便捷函数
def parse_json_safely(data: Any, context: str = "") -> tuple[Optional[dict], Optional[Dict[str, Any]]]:
    """
    模块级安全JSON解析便捷函数
    
    Args:
        data: 要解析的数据
        context: 上下文信息
        
    Returns:
        tuple: (解析结果, 错误响应)
    """
    return safe_json_loads(data, context)

# 示例使用
if __name__ == "__main__":
    # 测试技能类
    skill = FileOperationSkill()
    
    # 测试有效JSON
    print("测试有效JSON:")
    print(skill.parse_user_config('{"key": "value"}'))
    
    # 测试无效JSON
    print("\n测试无效JSON:")