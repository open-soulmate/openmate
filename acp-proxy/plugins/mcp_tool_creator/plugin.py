import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from ...base_plugin import BasePlugin
from ...registry import ToolRegistry
from ...schemas import MCPToolDefinition, MCPToolSchema


class MCPToolCreatorPlugin(BasePlugin):
    """MCP工具动态创建插件"""
    
    def __init__(self, agent_instance: Any):
        super().__init__(agent_instance)
        self.generated_tools_dir = os.path.join(
            os.path.dirname(__file__), "generated_tools"
        )
        self._ensure_generated_tools_dir()
        self.tool_registry = ToolRegistry()
        self._load_existing_generated_tools()
        
    def _ensure_generated_tools_dir(self):
        """确保生成工具目录存在"""
        if not os.path.exists(self.generated_tools_dir):
            os.makedirs(self.generated_tools_dir)
            
    def _load_existing_generated_tools(self):
        """加载已存在的生成工具"""
        try:
            for filename in os.listdir(self.generated_tools_dir):
                if filename.endswith(".json"):
                    tool_path = os.path.join(self.generated_tools_dir, filename)
                    with open(tool_path, "r", encoding="utf-8") as f:
                        tool_definition = json.load(f)
                        self.tool_registry.register_tool(
                            tool_definition["name"], tool_definition
                        )
        except Exception as e:
            self.logger.warning(f"加载已生成工具时出错: {e}")
            
    def on_task_failure(self, task_details: dict, error: str) -> None:
        """处理任务失败事件，检测是否是工具缺失导致的失败"""
        if self._is_tool_missing_error(error, task_details):
            tool_suggestion = self._analyze_missing_tool(task_details, error)
            if tool_suggestion:
                self.logger.info(f"检测到工具缺失，建议创建工具: {tool_suggestion['name']}")
                self.generate_tool_definition(
                    tool_name=tool_suggestion["name"],
                    tool_description=tool_suggestion["description"],
                    parameters_schema=tool_suggestion["parameters_schema"],
                    response_schema=tool_suggestion["response_schema"]
                )
                
    def _is_tool_missing_error(self, error: str, task_details: dict) -> bool:
        """判断是否为工具缺失导致的错误"""
        missing_tool_patterns = [
            "tool not found", "工具未找到", "no tool available",
            "无法执行此操作", "operation not supported"
        ]
        
        error_lower = error.lower()
        return any(pattern.lower() in error_lower for pattern in missing_tool_patterns)
        
    def _analyze_missing_tool(self, task_details: dict, error: str) -> Optional[Dict]:
        """分析任务详情和错误，推断需要创建的工具"""
        try:
            tool_name = self._generate_tool_name(task_details)
            description = self._generate_tool_description(task_details, error)
            parameters_schema = self._generate_parameters_schema(task_details)
            response_schema = self._generate_response_schema(task_details)
            
            return {
                "name": tool_name,
                "description": description,
                "parameters_schema": parameters_schema,
                "response_schema": response_schema
            }
        except Exception as e:
            self.logger.error(f"分析缺失工具时出错: {e}")
            return None
            
    def _generate_tool_name(self, task_details: dict) -> str:
        """根据任务详情生成工具名称"""
        task_type = task_details.get("type", "custom")
        task_name = task_details.get("name", "tool")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{task_type}_{task_name}_{timestamp}"
        
    def _generate_tool_description(self, task_details: dict, error: str) -> str:
        """根据任务详情生成工具描述"""
        task_desc = task_details.get("description", "")
        return f"动态创建的工具，用于处理: {task_desc}. 错误详情: {error}"
        
    def _generate_parameters_schema(self, task_details: dict) -> Dict:
        """根据任务详情生成参数Schema"""
        base_schema = {
            "type": "object",
            "properties": {
                "input_data": {
                    "type": "object",
                    "description": "输入数据"
                }
            },
            "required": ["input_data"]
        }
        
        if "parameters" in task_details:
            base_schema["properties"].update(task_details["parameters"])
            
        return base_schema
        
    def _generate_response_schema(self, task_details: dict) -> Dict:
        """根据任务详情生成响应Schema"""
        base_schema = {
            "type": "object",
            "properties": {
                "success": {
                    "type": "boolean",
                    "description": "操作是否成功"
                },
                "data": {
                    "type": "object",
                    "description": "返回数据"
                },
                "error": {
                    "type": "string",
                    "description": "错误信息"
                }
            },
            "required": ["success"]
        }
        
        if "response" in task_details:
            base_schema["properties"]["data"] = task_details["response"]
            
        return base_schema
        
    def generate_tool_definition(
        self,
        tool_name: str,
        tool_description: str,
        parameters_schema: dict,
        response_schema: dict
    ) -> str:
        """生成符合MCP规范的工具定义文件"""
        tool_definition = {
            "name": tool_name,
            "description": tool_description,
            "parameters": parameters_schema,
            "returns": response_schema,
            "metadata": {
                "created_at": datetime.now().isoformat(),
                "created_by": "MCPToolCreatorPlugin",
                "version": "1.0.0"
            }
        }
        
        # 保存到文件
        file_path = os.path.join(self.generated_tools_dir, f"{tool_name}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(tool_definition, f, indent=2, ensure_ascii=False)
            
        # 注册到内部工具注册表
        self.tool_registry.register_tool(tool_name, tool_definition)
        
        # 动态添加到主代理的可用工具列表
        self._add_tool_to_agent(tool_name, tool_definition)
        
        self.logger.info(f"已生成工具定义文件: {file_path}")
        return file_path
        
    def _add_tool_to_agent(self, tool_name: str, tool_definition: dict):
        """将新工具动态添加到主代理的可用工具列表"""
        try:
            if hasattr(self.agent_instance, 'add_tool'):
                self.agent_instance.add_tool(tool_name, tool_definition)
            elif hasattr(self.agent_instance, 'tool_manager'):
                self.agent_instance.tool_manager.register_tool(tool_name, tool_definition)
        except Exception as e:
            self.logger.error(f"添加工具到主代理时出错: {e}")
            
    def get_registered_tools(self) -> List[str]:
        """获取所有已注册的生成工具列表"""
        return self.tool_registry.get_tool_names()
        
    def get_tool_definition(self, tool_name: str) -> Optional[Dict]:
        """获取特定工具的定义"""
        return self.tool_registry.get_tool(tool_name)