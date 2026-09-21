"""
MCP Tool Creator Plugin
动态创建MCP协议标准工具定义的插件
"""

import json
import os
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from ..base_plugin import BasePlugin


class MCPToolCreatorPlugin(BasePlugin):
    """
    MCP工具动态创建插件
    
    监听代理的对话与任务执行过程，当遇到现有工具无法覆盖的功能需求时，
    自动生成符合MCP协议标准的工具定义文件（JSON Schema），
    并注册到可用工具列表中。
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        初始化MCP工具创建插件
        
        Args:
            config: 插件配置字典
        """
        super().__init__(name="mcp_tool_creator", version="1.0.0", config=config or {})
        
        # 工具生成目录
        self._generated_tools_dir = Path(
            config.get("generated_tools_dir", "acp-proxy/agent/experiments/mcp_tool_creator/generated_tools")
        )
        self._generated_tools_dir.mkdir(parents=True, exist_ok=True)
        
        # 内部工具注册表 {tool_name: tool_definition}
        self._tool_registry: Dict[str, Dict[str, Any]] = {}
        
        # 工具定义缓存文件路径
        self._registry_file = self._generated_tools_dir / "tool_registry.json"
        
        # 工具创建回调列表
        self._tool_created_callbacks: List[Callable] = []
        
        # 错误模式匹配关键词
        self._tool_missing_keywords = [
            "no suitable tool",
            "tool not found",
            "unsupported operation",
            "missing capability",
            "cannot perform",
            "tool required",
            "功能缺失",
            "工具不足",
            "无法执行",
            "需要工具"
        ]
        
        # 自动创建工具的开关
        self._auto_create_enabled = config.get("auto_create", True)
        
        # 已创建工具计数
        self._created_count = 0
        
        # 加载已有工具注册表
        self._load_registry()
        
        self.logger.info(f"MCPToolCreatorPlugin initialized. Loaded {len(self._tool_registry)} existing tools.")

    def _load_registry(self) -> None:
        """从文件加载工具注册表"""
        if self._registry_file.exists():
            try:
                with open(self._registry_file, "r", encoding="utf-8") as f:
                    self._tool_registry = json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                self.logger.warning(f"Failed to load tool registry: {e}")
                self._tool_registry = {}

    def _save_registry(self) -> None:
        """保存工具注册表到文件"""
        try:
            from utils.file_safety import atomic_write
            content = json.dumps(self._tool_registry, indent=2, ensure_ascii=False)
            ok, err = atomic_write(self._registry_file, content)
            if not ok:
                self.logger.error(f"Failed to save tool registry: {err}")
        except IOError as e:
            self.logger.error(f"Failed to save tool registry: {e}")

    def on_initialize(self) -> None:
        """插件初始化时调用"""
        self.logger.info("MCPToolCreatorPlugin on_initialize called")
        
        # 扫描已有的工具定义文件
        self._scan_existing_tools()

    def _scan_existing_tools(self) -> None:
        """扫描生成目录中已有的工具定义文件"""
        for json_file in self._generated_tools_dir.glob("*.json"):
            if json_file.name == "tool_registry.json":
                continue
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    tool_def = json.load(f)
                    tool_name = tool_def.get("name")
                    if tool_name and tool_name not in self._tool_registry:
                        self._tool_registry[tool_name] = tool_def
            except (json.JSONDecodeError, IOError) as e:
                self.logger.warning(f"Failed to load tool from {json_file}: {e}")

    def on_shutdown(self) -> None:
        """插件关闭时调用"""
        self._save_registry()
        self.logger.info("MCPToolCreatorPlugin shutdown. Registry saved.")

    def on_task_failure(self, task_details: Dict[str, Any], error: str) -> Optional[Dict[str, Any]]:
        """
        任务失败事件处理器
        
        捕获因缺少工具导致的失败，尝试自动生成所需的工具定义。
        
        Args:
            task_details: 任务详情字典
            error: 错误信息
            
        Returns:
            新创建的工具定义，如果没有创建则返回None
        """
        if not self._auto_create_enabled:
            return None
        
        # 检查错误是否与缺少工具相关
        if not self._is_tool_missing_error(error):
            return None
        
        self.logger.info(f"Detected tool-missing error: {error[:100]}...")
        
        # 分析任务需求，提取工具信息
        tool_info = self._extract_tool_requirements(task_details, error)
        
        if not tool_info:
            self.logger.warning("Could not extract tool requirements from task details")
            return None
        
        # 生成工具定义
        tool_definition = self.generate_tool_definition(
            tool_name=tool_info["name"],
            tool_description=tool_info["description"],
            parameters_schema=tool_info.get("parameters", {}),
            response_schema=tool_info.get("response", {})
        )
        
        self.logger.info(f"Auto-created tool: {tool_info['name']}")
        
        return json.loads(tool_definition) if isinstance(tool_definition, str) else tool_definition

    def _is_tool_missing_error(self, error: str) -> bool:
        """
        判断错误是否因缺少工具导致
        
        Args:
            error: 错误信息
            
        Returns:
            是否是工具缺失错误
        """
        error_lower = error.lower()
        return any(keyword in error_lower for keyword in self._tool_missing_keywords)

    def _extract_tool_requirements(self, task_details: Dict[str, Any], error: str) -> Optional[Dict[str, Any]]:
        """
        从任务详情中提取工具需求
        
        Args:
            task_details: 任务详情
            error: 错误信息
            
        Returns:
            工具需求信息字典
        """
        task_type = task_details.get("task_type", "")
        task_description = task_details.get("description", "")
        context = task_details.get("context", {})
        
        # 生成工具名称（基于任务类型和时间戳）
        timestamp = int(time.time())
        tool_name = f"auto_{task_type}_{timestamp}" if task_type else f"auto_tool_{timestamp}"
        
        # 清理工具名称，只保留合法字符
        tool_name = "".join(c if c.isalnum() or c == "_" else "_" for c in tool_name)
        tool_name = tool_name[:64]  # 限制长度
        
        # 构建工具描述
        description = f"Auto-generated tool for: {task_description}" if task_description else f"Auto-generated tool for task type: {task_type}"
        
        # 从上下文推断参数模式
        parameters = self._infer_parameters_schema(task_details, error)
        
        # 默认响应模式
        response = {
            "type": "object",
            "properties": {
                "success": {
                    "type": "boolean",
                    "description": "Whether the operation was successful"
                },
                "result": {
                    "type": "object",
                    "description": "The operation result"
                },
                "error": {
                    "type": "string",
                    "description": "Error message if failed"
                }
            }
        }
        
        return {
            "name": tool_name,
            "description": description,
            "parameters": parameters,
            "response": response
        }

    def _infer_parameters_schema(self, task_details: Dict[str, Any], error: str) -> Dict[str, Any]:
        """
        推断参数模式
        
        Args:
            task_details: 任务详情
            error: 错误信息
            
        Returns:
            JSON Schema格式的参数模式
        """
        context = task_details.get("context", {})
        parameters = task_details.get("parameters", {})
        
        properties = {}
        required = []
        
        # 从任务参数中推断
        for key, value in parameters.items():
            prop_schema = {"type": self._get_json_type(value)}
            prop_schema["description"] = f"Parameter: {key}"
            properties[key] = prop_schema
            required.append(key)
        
        # 如果没有参数，提供通用输入
        if not properties:
            properties["input"] = {
                "type": "string",
                "description": "Input data for the tool"
            }