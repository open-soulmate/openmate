import json
import logging
from typing import Any, Dict, Optional, Tuple, Union

# 设置日志记录器
logger = logging.getLogger(__name__)

class FileOperationSkill:
    """文件操作技能类，处理文件相关的操作请求。"""
    
    def __init__(self):
        """初始化文件操作技能。"""
        pass
    
    def _create_success_response(self, data: Any = None, message: str = "操作成功") -> Dict[str, Any]:
        """创建标准的成功响应。
        
        Args:
            data: 响应数据
            message: 成功消息
            
        Returns:
            标准化的成功响应字典
        """
        return {
            "success": True,
            "code": 0,
            "message": message,
            "data": data
        }
    
    def _create_error_response(self, code: int, message: str, data: Any = None) -> Dict[str, Any]:
        """创建标准的错误响应。
        
        Args:
            code: 错误码
            message: 错误消息
            data: 可选的附加数据
            
        Returns:
            标准化的错误响应字典
        """
        return {
            "success": False,
            "code": code,
            "message": message,
            "data": data
        }
    
    def _safe_json_loads(self, json_str: str, context: str = "") -> Tuple[bool, Union[Dict, list, str]]:
        """安全地解析JSON字符串，包含完整的错误处理。
        
        Args:
            json_str: 需要解析的JSON字符串
            context: 用于日志记录的上下文信息
            
        Returns:
            元组：(成功标志, 解析后的数据或错误信息)
        """
        # 类型检查：确保输入是字符串类型
        if json_str is None:
            error_msg = f"JSON解析失败：输入数据为None{context}"
            logger.error(error_msg)
            return False, error_msg
            
        if not isinstance(json_str, str):
            error_msg = f"JSON解析失败：输入数据类型为{type(json_str).__name__}，预期为字符串{context}"
            logger.error(error_msg)
            return False, error_msg
        
        # 尝试解析JSON
        try:
            result = json.loads(json_str)
            return True, result
        except json.JSONDecodeError as e:
            # 记录详细的异常信息
            error_msg = f"JSON解析失败：输入数据格式无效{context}"
            
            # 截断原始数据以避免日志过大，但保留足够的调试信息
            truncated_input = json_str[:100] + "..." if len(json_str) > 100 else json_str
            
            logger.error(
                f"{error_msg}\n"
                f"原始数据(截断): {repr(truncated_input)}\n"
                f"错误类型: {type(e).__name__}\n"
                f"错误详情: {str(e)}\n"
                f"错误位置: 第{e.lineno}行，第{e.colno}列"
            )
            
            # 返回标准化的错误信息
            return False, f"输入数据格式无效，无法解析为JSON: {str(e)}"
    
    def process_file_operation(self, request_data: Union[str, Dict]) -> Dict[str, Any]:
        """处理文件操作请求的主方法。
        
        Args:
            request_data: 请求数据，可能是JSON字符串或字典
            
        Returns:
            标准化的操作结果响应
        """
        # 如果传入的是字符串，需要先解析
        if isinstance(request_data, str):
            success, parsed_data = self._safe_json_loads(request_data, " (处理文件操作请求)")
            if not success:
                return self._create_error_response(
                    code=-1,
                    message=f"请求数据解析失败: {parsed_data}"
                )
            request_data = parsed_data
        
        # 如果传入的既不是字符串也不是字典，返回错误
        if not isinstance(request_data, dict):
            return self._create_error_response(
                code=-1,
                message=f"请求数据格式错误: 预期为字典或JSON字符串，实际为{type(request_data).__name__}"
            )
        
        # 示例：这里可以添加实际的文件操作逻辑
        # 为了演示，我们返回一个模拟的成功响应
        return self._create_success_response(
            data={"operation": "processed", "request_data": request_data},
            message="文件操作处理成功"
        )
    
    def parse_file_content(self, content: str, file_path: str = "") -> Dict[str, Any]:
        """解析文件内容（假设文件内容为JSON格式）。
        
        Args:
            content: 文件内容字符串
            file_path: 文件路径（用于日志）
            
        Returns:
            解析结果或错误响应
        """
        context = f" (解析文件内容: {file_path})" if file_path else " (解析文件内容)"
        success, parsed_content = self._safe_json_loads(content, context)
        
        if not success:
            return self._create_error_response(
                code=-2,
                message=f"文件内容解析失败: {parsed_content}",
                data={"file_path": file_path}
            )
        
        return self._create_success_response(
            data=parsed_content,
            message="文件内容解析成功"
        )
    
    def load_configuration(self, config_str: str, config_name: str = "") -> Dict[str, Any]:
        """加载配置信息（配置通常为JSON格式）。
        
        Args:
            config_str: 配置字符串
            config_name: 配置名称（用于日志）
            
        Returns:
            配置解析结果或错误响应
        """
        context = f" (加载配置: {config_name})" if config_name else " (加载配置)"
        success, config_data = self._safe_json_loads(config_str, context)
        
        if not success:
            return self._create_error_response(
                code=-3,
                message=f"配置加载失败: {config_data}",
                data={"config_name": config_name}
            )
        
        # 配置解析成功，可以进一步验证配置结构
        # 这里简单返回，实际应用中可能需要验证配置字段
        return self._create_success_response(
            data=config_data,
            message="配置加载成功"
        )