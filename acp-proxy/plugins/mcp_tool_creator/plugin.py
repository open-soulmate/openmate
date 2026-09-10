import os
import json
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime
import logging

# 假设这些基础类存在于项目中
# 实际项目中需要根据具体结构调整导入路径
from acp_proxy.core.plugin_base import BasePlugin
from acp_proxy.core.tool_registry import ToolRegistry
from acp_proxy.core.exceptions import PluginInitializationError, ToolRegistrationError


class MCPToolCreatorPlugin(BasePlugin):
    """
    MCP工具动态创建插件
    
    监听代理对话与任务执行，当现有工具无法覆盖功能需求时，
    自动生成符合MCP协议标准的工具定义文件，并注册到可用工具列表中
    """
    
    def __init__(self, plugin_id: str, config: Dict[str, Any] = None):
        """
        初始化插件
        
        Args:
            plugin_id: 插件唯一标识符
            config: 插件配置字典
        """
        super().__init__(plugin_id, config or {})
        
        # 插件基础配置
        self.name = "MCPToolCreatorPlugin"
        self.version = "1.0.0"
        self.description = "MCP工具动态创建插件"
        
        # 工具注册表引用（需从主配置或上下文获取）
        self.tool_registry: Optional[ToolRegistry] = None
        
        # 已生成的工具跟踪
        self._generated_tools: Dict[str, Dict[str, Any]] = {}
        
        # 工具生成目录
        self._tools_output_dir = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "generated_tools"
        )
        
        # 确保目录存在
        os.makedirs(self._tools_output_dir, exist_ok=True)
        
        # 事件处理器配置
        self._event_handlers = {
            "task_failure": self.on_task_failure,
            "tool_not_found": self.on_tool_not_found,
            "conversation_analysis": self.on_conversation_analysis
        }
        
        # 工具创建触发条件配置
        self._creation_triggers = {
            "missing_tool_error": True,
            "explicit_creation_request": True,
            "capability_gap_detection": True
        }
        
        # 初始化日志
        self.logger = logging.getLogger(f"plugin.{self.plugin_id}")
        
    async def initialize(self, context: Dict[str, Any]) -> bool:
        """
        初始化插件，注入必要的上下文依赖
        
        Args:
            context: 包含插件运行所需上下文的字典
            
        Returns:
            初始化是否成功
        """
        try:
            # 获取工具注册表实例
            if "tool_registry" not in context:
                raise PluginInitializationError("缺少工具注册表上下文")
            
            self.tool_registry = context["tool_registry"]
            
            # 加载已有的生成工具
            await self._load_existing_generated_tools()
            
            self.logger.info(f"MCP工具创建插件初始化完成，已加载 {len(self._generated_tools)} 个现有工具")
            return True
            
        except Exception as e:
            self.logger.error(f"插件初始化失败: {str(e)}")
            raise PluginInitializationError(f"插件初始化失败: {str(e)}")
    
    async def shutdown(self) -> None:
        """
        关闭插件，清理资源
        """
        self.logger.info("MCP工具创建插件正在关闭...")
        # 清理资源逻辑
        pass
    
    def get_event_handlers(self) -> Dict[str, Any]:
        """
        获取插件的事件处理器映射
        
        Returns:
            事件名称到处理器函数的映射
        """
        return self._event_handlers
    
    async def on_task_failure(self, task_details: Dict[str, Any], error: str) -> Optional[Dict[str, Any]]:
        """
        处理任务失败事件，检测是否为缺少工具导致的失败
        
        Args:
            task_details: 任务详细信息
            error: 错误信息
            
        Returns:
            生成的工具信息（如果有），否则为None
        """
        self.logger.debug(f"处理任务失败事件: {error}")
        
        # 分析错误是否与工具缺失相关
        if self._is_tool_missing_error(error):
            # 提取所需工具信息
            tool_info = self._extract_tool_info_from_error(error, task_details)
            
            if tool_info:
                self.logger.info(f"检测到工具缺失，尝试创建工具: {tool_info.get('name')}")
                
                # 生成工具定义
                tool_definition = await self.generate_tool_definition(
                    tool_name=tool_info.get('name', 'unnamed_tool'),
                    tool_description=tool_info.get('description', '自动生成的工具'),
                    parameters_schema=tool_info.get('parameters', {}),
                    response_schema=tool_info.get('response', {})
                )
                
                if tool_definition:
                    # 注册到工具注册表
                    await self.register_tool_to_registry(tool_definition)
                    return tool_definition
        
        return None
    
    async def on_tool_not_found(self, tool_name: str, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        处理工具未找到事件
        
        Args:
            tool_name: 未找到的工具名称
            context: 调用上下文
            
        Returns:
            生成的工具信息（如果有），否则为None
        """
        self.logger.warning(f"工具未找到: {tool_name}")
        
        # 这里可以集成更智能的工具生成逻辑
        # 暂时返回None，实际实现中可结合AI分析生成工具