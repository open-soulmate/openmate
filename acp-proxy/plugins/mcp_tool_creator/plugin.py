# acp-proxy/plugins/mcp_tool_creator/plugin.py
import json
import os
import logging
from typing import Dict, Any, Optional
from datetime import datetime

# Import BasePlugin from the base module
# Note: This import path may need to be adjusted based on your project structure
from ..base import BasePlugin


class MCPToolCreatorPlugin(BasePlugin):
    """
    MCP工具动态创建插件。监听代理对话与任务执行过程，当现有工具无法覆盖功能需求时，
    自动生成符合MCP协议标准的工具定义文件，并注册到可用工具列表中。
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config or {})
        self.logger = logging.getLogger(__name__)
        self._tool_registry = {}  # 内部工具注册表
        self._generated_tools_dir = os.path.join(
            os.path.dirname(__file__), 
            "generated_tools"
        )
        
        # 确保生成工具目录存在
        os.makedirs(self._generated_tools_dir, exist_ok=True)
        
        # 初始化事件监听
        self._setup_event_listeners()
        
        self.logger.info("MCPToolCreatorPlugin 初始化完成")

    def _setup_event_listeners(self):
        """设置事件监听器"""
        # 监听任务失败事件
        if hasattr(self, 'event_bus'):
            self.event_bus.on('task_failure', self.on_task_failure)
            self.event_bus.on('tool_not_found', self.on_tool_not_found)
            self.event_bus.on('capability_gap_detected', self.on_capability_gap_detected)

    def on_task_failure(self, task_details: dict, error: str):
        """
        处理任务失败事件
        检测是否因缺少工具导致失败，并自动生成相应工具
        """
        self.logger.warning(f"任务失败: {task_details.get('task_id', 'unknown')}, 错误: {error}")
        
        # 检查错误类型是否为工具缺失
        if self._is_tool_missing_error(error):
            self.logger.info("检测到工具缺失错误，开始工具生成流程")
            
            # 从任务详情中提取工具需求信息
            tool_info = self._extract_tool_info_from_failure(task_details, error)
            
            if tool_info:
                tool_name = tool_info.get('name')
                tool_desc = tool_info.get('description')
                params_schema = tool_info.get('parameters_schema')
                response_schema = tool_info.get('response_schema')
                
                # 生成工具定义
                tool_definition = self.generate_tool_definition(
                    tool_name=tool_name,
                    tool_description=tool_desc,
                    parameters_schema=params_schema,
                    response_schema=response_schema
                )
                
                # 保存并注册工具
                tool_path = self._save_tool_definition(tool_name, tool_definition)
                self._register_tool_to_agent(tool_name, tool_definition)
                
                self.logger.info(f"成功创建工具: {tool_name}, 保存至: {tool_path}")

    def on_tool_not_found(self, tool_name: str, task_context: dict):
        """处理工具未找到事件"""
        self.logger.info(f"工具未找到: {tool_name}, 尝试自动创建")
        
        # 基于任务上下文推测工具需求