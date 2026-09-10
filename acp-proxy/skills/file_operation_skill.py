import json
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class FileOperationSkill:
    """文件操作技能类"""
    
    def _create_error_response(self, message: str, error_code: int = -1) -> Dict[str, Any]:
        """创建标准化错误响应"""
        return {
            "success": False,
            "code": error_code,
            "message": message,
            "data": None
        }
    
    def parse_file_config(self, config_str: Optional[str]) -> Dict[str, Any]:
        """解析文件配置"""
        try:
            # 类型检查：确保输入是字符串
            if not isinstance(config_str, str):
                return self._create_error_response("配置数据必须是字符串类型")
            
            # 空字符串检查
            if not config_str.strip():
                return self._create_error_response("配置字符串不能为空")
            
            try:
                config_data = json.loads(config_str)
                return {
                    "success": True,
                    "code": 0,
                    "message": "配置解析成功",
                    "data": config_data
                }
            except json.JSONDecodeError as e:
                logger.error(f"JSON解析失败 - 原始数据: {config_str[:100]}{'...' if len(config_str) > 100 else ''}, "
                           f"异常信息: {str(e)}, 堆栈信息: ", exc_info=True)
                return self._create_error_response(f"输入数据格式无效，无法解析为JSON: {str(e)}")
                
        except Exception as e:
            logger.error(f"配置解析过程中发生未知错误: {str(e)}", exc_info=True)
            return self._create_error_response(f"配置解析失败: {str(e)}")
    
    def parse_operation_params(self, params_json: Optional[str]) -> Dict[str, Any]:
        """解析操作参数"""
        try:
            # 类型检查：确保输入是字符串
            if not isinstance(params_json, str):
                return self._create_error_response("操作参数必须是字符串类型")
            
            # 空字符串检查
            if not params_json.strip():
                return self._create_error_response("操作参数字符串不能为空")
            
            try:
                params_data = json.loads(params_json)
                return {
                    "success": True,
                    "code": 0,
                    "message": "参数解析成功",
                    "data": params_data
                }
            except json.JSONDecodeError as e:
                logger.error(f"操作参数JSON解析失败 - 原始数据: {params_json[:100]}{'...' if len(params_json) > 100 else ''}, "
                           f"异常信息: {str(e)}, 堆栈信息: ", exc_info=True)
                return self._create_error_response(f"操作参数格式无效，无法解析为JSON: {str(e)}")
                
        except Exception as e:
            logger.error(f"操作参数解析过程中发生未知错误: {str(e)}", exc_info=True)
            return self._create_error_response(f"操作参数解析失败: {str(e)}")
    
    def load_user_input(self, user_input: Any) -> Dict[str, Any]:
        """加载用户输入数据"""
        try:
            # 类型检查：确保输入是字符串
            if not isinstance(user_input, str):
                return self._create_error_response("用户输入必须是字符串类型")
            
            # 空字符串检查
            if not user_input.strip():
                return self._create_error_response("用户输入字符串不能为空")
            
            try:
                input_data = json.loads(user_input)
                return {
                    "success": True,
                    "code": 0,
                    "message": "用户输入解析成功",
                    "data": input_data
                }
            except json.JSONDecodeError as e:
                logger.error(f"用户输入JSON解析失败 - 原始数据: {user_input[:100]}{'...' if len(user_input) > 100 else ''}, "
                           f"异常信息: {str(e)}, 堆栈信息: ", exc_info=True)
                return self._create_error_response(f"用户输入格式无效，无法解析为JSON: {str(e)}")
                
        except Exception as e:
            logger.error(f"用户输入加载过程中发生未知错误: {str(e)}", exc_info=True)
            return self._create_error_response(f"用户输入加载失败: {str(e)}")