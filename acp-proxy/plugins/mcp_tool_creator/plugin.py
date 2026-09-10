import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Any
from ..base_plugin import BasePlugin

class MCPToolCreatorPlugin(BasePlugin):
    """动态创建MCP工具的插件，监听代理的对话与任务执行过程，自动生成功能缺失的工具定义"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config or {})
        self.tool_registry = {}
        self.generated_tools_dir = Path(__file__).parent / "generated_tools"
        self.generated_tools_dir.mkdir(exist_ok=True)
        self._load_existing_tools()
        
    def _load_existing_tools(self):
        """加载已存在的工具定义到注册表"""
        for tool_file in self.generated_tools_dir.glob("*.json"):
            try:
                with open(tool_file, 'r', encoding='utf-8') as f:
                    tool_def = json.load(f)
                    self.tool_registry[tool_def['name']] = tool_def
            except (json.JSONDecodeError, KeyError) as e:
                print(f"警告: 加载工具文件 {tool_file} 失败: {str(e)}")
                
    def on_task_failure(self, task_details: Dict, error: str):
        """当任务失败时调用，尝试根据错误信息生成缺失工具"""
        # 检查是否是工具缺失导致的失败
        if "tool" in error.lower() and ("not found" in error.lower() or "not available" in error.lower()):
            # 提取可能缺失的工具名称
            tool_name = self._extract_tool_name_from_error(error)
            if tool_name and tool_name not in self.tool_registry:
                # 生成基础工具定义
                tool_def = self.generate_tool_definition(
                    tool_name=tool_name,
                    tool_description=f"自动生成的工具: {tool_name} (用于处理 {task_details.get('task_type', '未知任务')})",
                    parameters_schema=self._generate_default_parameters_schema(),
                    response_schema=self._generate_default_response_schema()
                )
                # 注册工具
                self.register_tool(tool_name, tool_def)
                print(f"自动创建工具: {tool_name}")
                
    def _extract_tool_name_from_error(self, error: str) -> Optional[str]:
        """从错误信息中提取工具名称"""
        # 这里可以根据实际错误格式进行解析
        import re
        # 尝试匹配 "Tool 'xxx' not found" 或 "tool xxx is not available" 等格式
        patterns = [
            r"Tool\s+'([^']+)'",
            r"tool\s+([a-zA-Z0-9_]+)\s+is not",
            r"tool\s+([a-zA-Z0-9_]+)\s+not"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, error, re.IGNORECASE)
            if match:
                return match.group(1)
        return None
        
    def generate_tool_definition(self, 
                               tool_name: str, 
                               tool_description: str,
                               parameters_schema: Dict,
                               response_schema: Dict) -> Dict:
        """生成符合MCP规范的工具定义"""
        tool_definition = {
            "name": tool_name,
            "description": tool_description,
            "parameters": parameters_schema,
            "returns": response_schema
        }
        
        # 保存到文件
        file_path = self.generated_tools_dir / f"{tool_name}.json"
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(tool_definition, f, indent=2, ensure_ascii=False)
            
        # 更新内部注册表
        self.tool_registry[tool_name] = tool_definition
        
        return tool_definition
        
    def _generate_default_parameters_schema(self) -> Dict:
        """生成默认的参数Schema"""
        return {
            "type": "object",
            "properties": {
                "input_data": {
                    "type": "string",
                    "description": "输入数据"
                }
            },
            "required": ["input_data"]
        }
        
    def _generate_default_response_schema(self) -> Dict:
        """生成默认的响应Schema"""
        return {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "执行状态"
                },
                "result": {
                    "type": "object",
                    "description": "执行结果"
                }
            }
        }
        
    def register_tool(self, tool_name: str, tool_definition: Dict) -> bool:
        """将工具注册到主代理的可用工具列表"""
        # 添加到内部注册表
        self.tool_registry[tool_name] = tool_definition
        
        # 调用父类的注册方法（假设BasePlugin有register_tool方法）
        if hasattr(super(), 'register_tool'):
            return super().register_tool(tool_name, tool_definition)
        
        # 如果没有父类方法，可以尝试通过配置系统注册
        print(f"工具 {tool_name} 已注册到插件内部注册表")
        return True
        
    def get_tool_definition(self, tool_name: str) -> Optional[Dict]:
        """获取指定工具的定义"""
        return self.tool_registry.get(tool_name)
        
    def list_tools(self) -> List[str]:
        """列出所有注册的工具"""
        return list(self.tool_registry.keys())
        
    def on_plugin_load(self):
        """插件加载时调用"""
        print("MCP工具创建插件已加载")
        
    def on_plugin_unload(self):
        """插件卸载时调用"""
        print("MCP工具创建插件已卸载")