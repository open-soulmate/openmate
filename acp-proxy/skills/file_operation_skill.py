import json
import logging
from typing import Dict, Any, Optional, Union

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FileOperationSkill:
    """文件操作技能类"""
    
    def __init__(self):
        self.success_response = {"status": 0, "message": "操作成功", "data": None}
        self.error_response_template = {"status": -1, "message": "", "data": None}
    
    def _create_error_response(self, message: str) -> Dict[str, Any]:
        """创建标准化的错误响应"""
        response = self.error_response_template.copy()
        response["message"] = message
        return response
    
    def _safe_json_loads(self, data: Union[str, bytes, bytearray, None]) -> Optional[Dict[str, Any]]:
        """安全的JSON解析方法"""
        # 类型检查（可选增强）
        if data is None:
            logger.error("输入数据为None，无法解析JSON")
            return None
        
        if not isinstance(data, (str, bytes, bytearray)):
            logger.error(f"输入数据类型错误，期望字符串，实际为: {type(data)}")
            return None
        
        # 尝试解析JSON
        try:
            return json.loads(data)
        except json.JSONDecodeError as e:
            # 记录详细错误信息
            data_preview = str(data)[:100] if len(str(data)) > 100 else str(data)
            logger.error(
                f"JSON解析失败: {str(e)}, "
                f"原始数据（截断）: {data_preview}, "
                f"堆栈信息: {str(e.__traceback__)}",
                exc_info=True
            )
            return None
    
    def parse_config(self, config_str: str) -> Dict[str, Any]:
        """解析配置JSON字符串"""
        result = self._safe_json_loads(config_str)
        
        if result is None:
            return self._create_error_response(
                "输入数据格式无效，无法解析为JSON"
            )
        
        # 原有成功逻辑
        try:
            # 假设这里有配置解析的逻辑
            processed_config = {
                "name": result.get("name", ""),
                "version": result.get("version", "1.0"),
                "settings": result.get("settings", {})
            }
            
            response = self.success_response.copy()
            response["data"] = processed_config
            return response
            
        except Exception as e:
            logger.error(f"配置处理失败: {str(e)}", exc_info=True)
            return self._create_error_response(f"配置处理失败: {str(e)}")
    
    def process_file_metadata(self, metadata_str: str) -> Dict[str, Any]:
        """处理文件元数据"""
        result = self._safe_json_loads(metadata_str)
        
        if result is None:
            return self._create_error_response(
                "文件元数据格式无效，无法解析为JSON"
            )
        
        # 原有成功逻辑
        try:
            # 假设这里有元数据处理的逻辑
            processed_metadata = {
                "filename": result.get("filename", ""),
                "size": result.get("size", 0),
                "created_at": result.get("created_at", "")
            }
            
            response = self.success_response.copy()
            response["data"] = processed_metadata
            return response
            
        except Exception as e:
            logger.error(f"文件元数据处理失败: {str(e)}", exc_info=True)
            return self._create_error_response(f"文件元数据处理失败: {str(e)}")
    
    def validate_user_input(self, user_input: str) -> Dict[str, Any]:
        """验证用户输入的JSON格式"""
        result = self._safe_json_loads(user_input)
        
        if result is None:
            return self._create_error_response(
                "用户输入格式无效，无法解析为JSON"
            )
        
        # 原有成功逻辑
        try:
            # 假设这里有用户输入验证的逻辑
            is_valid = (
                "action" in result and 
                "target" in result and 
                isinstance(result.get("target"), str)
            )
            
            response = self.success_response.copy()
            response["data"] = {
                "is_valid": is_valid,
                "parsed_input": result if is_valid else None
            }
            return response
            
        except Exception as e:
            logger.error(f"用户输入验证失败: {str(e)}", exc_info=True)
            return self._create_error_response(f"用户输入验证失败: {str(e)}")