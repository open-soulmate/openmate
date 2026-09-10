"""
文件操作技能模块
为 ACP 代理提供文件读写、配置解析等功能
"""

import json
import logging
import os
from typing import Any, Dict, Optional, Union

# 配置日志记录器
logger = logging.getLogger(__name__)


class FileOperationSkill:
    """文件操作技能类"""
    
    # 标准化响应状态码
    SUCCESS_CODE = 0
    ERROR_CODE = -1
    JSON_PARSE_ERROR_CODE = -1001
    
    @staticmethod
    def _create_error_response(
        error_code: int,
        message: str,
        data: Any = None
    ) -> Dict[str, Any]:
        """
        创建标准化错误响应
        
        Args:
            error_code: 错误状态码
            message: 错误消息
            data: 附加数据
            
        Returns:
            标准化的错误响应字典
        """
        return {
            "code": error_code,
            "success": False,
            "message": message,
            "data": data
        }
    
    @staticmethod
    def _create_success_response(
        message: str = "操作成功",
        data: Any = None
    ) -> Dict[str, Any]:
        """
        创建标准化成功响应
        
        Args:
            message: 成功消息
            data: 响应数据
            
        Returns:
            标准化的成功响应字典
        """
        return {
            "code": FileOperationSkill.SUCCESS_CODE,
            "success": True,
            "message": message,
            "data": data
        }
    
    @staticmethod
    def _safe_json_loads(
        json_str: Optional[Union[str, bytes]],
        context: str = "未知数据"
    ) -> Dict[str, Any]:
        """
        安全地解析 JSON 字符串，包含类型检查和错误处理
        
        Args:
            json_str: 待解析的 JSON 字符串
            context: 上下文描述，用于日志记录
            
        Returns:
            包含解析结果或错误信息的标准化响应字典
        """
        # 类型检查：确保输入是字符串或字节类型
        if json_str is None:
            logger.error(
                f"JSON 解析失败 - 上下文: {context} | "
                f"原因: 输入数据为 None | "
                f"数据类型: NoneType"
            )
            return FileOperationSkill._create_error_response(
                error_code=FileOperationSkill.JSON_PARSE_ERROR_CODE,
                message="输入数据为空（None），无法解析为JSON"
            )
        
        if not isinstance(json_str, (str, bytes)):
            logger.error(
                f"JSON 解析失败 - 上下文: {context} | "
                f"原因: 输入数据类型不正确 | "
                f"期望类型: str 或 bytes | "
                f"实际类型: {type(json_str).__name__}"
            )
            return FileOperationSkill._create_error_response(
                error_code=FileOperationSkill.JSON_PARSE_ERROR_CODE,
                message=f"输入数据类型无效，期望字符串类型，实际为 {type(json_str).__name__}"
            )
        
        # 检查空字符串
        if isinstance(json_str, str) and not json_str.strip():
            logger.error(
                f"JSON 解析失败 - 上下文: {context} | "
                f"原因: 输入为空字符串"
            )
            return FileOperationSkill._create_error_response(
                error_code=FileOperationSkill.JSON_PARSE_ERROR_CODE,
                message="输入数据为空字符串，无法解析为JSON"
            )
        
        # 尝试解析 JSON
        try:
            parsed_data = json.loads(json_str)
            return FileOperationSkill._create_success_response(
                message="JSON 解析成功",
                data=parsed_data
            )
        except json.JSONDecodeError as e:
            # 截断原始数据用于日志记录（避免日志过长）
            truncated_data = str(json_str)[:200] + "..." if len(str(json_str)) > 200 else str(json_str)
            
            logger.error(
                f"JSON 解析失败 - 上下文: {context} | "
                f"原始数据(截断): {truncated_data} | "
                f"异常消息: {str(e)} | "
                f"错误位置: 第 {e.lineno} 行, 第 {e.colno} 列",
                exc_info=True  # 记录完整的堆栈信息
            )
            
            return FileOperationSkill._create_error_response(
                error_code=FileOperationSkill.JSON_PARSE_ERROR_CODE,
                message=f"输入数据格式无效，无法解析为JSON: {str(e)}",
                data={
                    "original_error": str(e),
                    "line": e.lineno,
                    "column": e.colno,
                    "position": e.pos
                }
            )
    
    def read_json_file(self, file_path: str) -> Dict[str, Any]:
        """
        读取并解析 JSON 文件
        
        Args:
            file_path: JSON 文件路径
            
        Returns:
            标准化响应字典，包含解析后的数据或错误信息
        """
        context = f"读取 JSON 文件: {file_path}"
        
        # 检查文件是否存在
        if not os.path.exists(file_path):
            logger.error(f"文件不存在: {file_path}")
            return self._create_error_response(
                error_code=self.ERROR_CODE,
                message=f"文件不存在: {file_path}"
            )
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                file_content = f.read()
        except Exception as e:
            logger.error(f"读取文件失败: {file_path} | 异常: {str(e)}", exc_info=True)
            return self._create_error_response(
                error_code=self.ERROR_CODE,
                message=f"读取文件失败: {str(e)}"
            )
        
        # 使用安全的 JSON 解析方法
        result = self._safe_json_loads(file_content, context)
        
        # 如果解析成功，更新消息
        if result["success"]:
            result["message"] = f"成功读取并解析文件: {file_path}"
        
        return result
    
    def parse_config_string(self, config_str: Optional[str]) -> Dict[str, Any]:
        """
        解析配置字符串为字典
        
        Args:
            config_str: JSON 格式的配置字符串
            
        Returns:
            标准化响应字典，包含解析后的配置或错误信息
        """
        context = "解析配置字符串"
        
        # 使用安全的 JSON 解析方法
        result = self._safe_json_loads(config_str, context)
        
        # 如果解析成功，更新消息
        if result["success"]:
            result["message"] = "配置解析成功"
        
        return result
    
    def parse_user_input(self, user_input: Optional[str]) -> Dict[str, Any]:
        """
        解析用户输入的 JSON 数据
        
        Args:
            user_input: 用户输入的 JSON 字符串
            
        Returns:
            标准化响应字典，包含解析后的数据或错误信息
        """
        context = "解析用户输入"
        
        # 使用安全的 JSON 解析方法
        result = self._safe_json_loads(user_input, context)
        
        # 如果解析成功，更新消息
        if result["success"]:
            result["message"] = "用户输入解析成功"
        
        return result
    
    def parse_api_response(self, response_data: Optional[Union[str, bytes]]) -> Dict[str, Any]:
        """
        解析 API 响应数据
        
        Args:
            response_data: API 返回的 JSON 数据
            
        Returns:
            标准化响应字典，包含解析后的数据或错误信息
        """
        context = "解析 API 响应"
        
        # 使用安全的 JSON 解析方法
        result = self._safe_json_loads(response_data, context)
        
        # 如果解析成功，更新消息
        if result["success"]:
            result["message"] = "API 响应解析成功"
        
        return result
    
    def merge_json_configs(self, *config_strings: Optional[str]) -> Dict[str, Any]:
        """
        合并多个 JSON 配置字符串
        
        Args:
            *config_strings: 多个 JSON 配置字符串
            
        Returns:
            标准化响应字典，包含合并后的配置或错误信息
        """
        merged_config = {}
        
        for index, config_str in enumerate(config_strings):
            context = f"合并 JSON 配置 (第 {index + 1} 个)"
            
            result = self._safe_json_loads(config_str, context)
            