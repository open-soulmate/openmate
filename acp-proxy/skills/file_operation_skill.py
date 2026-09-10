import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime


class FileOperationSkill:
    """文件操作技能"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    def parse_config(self, config_str: str) -> Dict[str, Any]:
        """
        解析配置字符串
        
        Args:
            config_str: JSON格式的配置字符串
            
        Returns:
            解析后的配置字典或错误信息
        """
        if not isinstance(config_str, str):
            self.logger.error(f"输入数据类型错误，期望字符串类型，实际收到: {type(config_str)}")
            return {
                "status": -1,
                "message": "输入数据类型错误，期望字符串类型",
                "timestamp": datetime.now().isoformat(),
                "data": None
            }
        
        try:
            config_data = json.loads(config_str)
            return {
                "status": 0,
                "message": "配置解析成功",
                "timestamp": datetime.now().isoformat(),
                "data": config_data
            }
        except json.JSONDecodeError as e:
            # 记录详细的异常信息
            truncated_config = config_str[:500] + "..." if len(config_str) > 500 else config_str
            self.logger.error(
                f"JSON解析错误，原始数据(截断): {truncated_config}\n"
                f"异常消息: {str(e)}\n"
                f"异常位置: 第{e.lineno}行，第{e.colno}列\n"
                f"异常详情: {e.doc}",
                exc_info=True
            )
            
            return {
                "status": -1,
                "message": f"输入数据格式无效，无法解析为JSON: {str(e)}",
                "timestamp": datetime.now().isoformat(),
                "data": None,
                "error_detail": {
                    "line": e.lineno,
                    "column": e.colno,
                    "position": e.pos
                }
            }
    
    def parse_user_input(self, input_data: Any) -> Dict[str, Any]:
        """
        解析用户输入数据
        
        Args:
            input_data: 用户输入的数据，可能是字符串或其他类型
            
        Returns:
            解析后的数据字典或错误信息
        """
        # 类型检查和预处理
        if input_data is None:
            return {
                "status": -1,
                "message": "输入数据不能为None",
                "timestamp": datetime.now().isoformat(),
                "data": None
            }
        
        if isinstance(input_data, dict):
            # 如果已经是字典，直接返回成功
            return {
                "status": 0,
                "message": "输入数据已是字典格式",
                "timestamp": datetime.now().isoformat(),
                "data": input_data
            }
        
        if isinstance(input_data, str):
            try:
                parsed_data = json.loads(input_data)
                return {
                    "status": 0,
                    "message": "输入数据解析成功",
                    "timestamp": datetime.now().isoformat(),
                    "data": parsed_data
                }
            except json.JSONDecodeError as e:
                # 记录异常信息（截断敏感数据）
                truncated_input = input_data[:100] + "..." if len(input_data) > 100 else input_data
                self.logger.error(
                    f"用户输入JSON解析失败\n"
                    f"输入数据(截断): {truncated_input}\n"
                    f"异常消息: {str(e)}\n"
                    f"异常类型: {type(e).__name__}",
                    exc_info=True
                )
                
                return {
                    "status": -1,
                    "message": f"输入数据格式无效，无法解析为JSON: {str(e)}",
                    "timestamp": datetime.now().isoformat(),
                    "data": None,
                    "input_type": "string",
                    "input_length": len(input_data) if isinstance(input_data, str) else None
                }