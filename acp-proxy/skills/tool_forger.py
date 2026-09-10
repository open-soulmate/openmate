"""
tool_forger.py - 工具创造技能

该技能用于动态创建符合MCP工具接口标准的工具。
接收自然语言描述，生成Python代码并注册到插件系统中。
"""

import os
import re
import json
import logging
import importlib.util
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime

logger = logging.getLogger(__name__)


class ToolForgerSkill:
    """工具创造技能 - 动态创建和注册MCP工具"""
    
    def __init__(self, name: str = "tool_forger", description: str = None):
        self.name = name
        self.description = description or "用于动态创建符合MCP接口标准的工具，实现能力的动态扩展"
        self.parameters = {
            "tool_description": {
                "type": "string",
                "description": "对要创建工具的自然语言描述，例如：'创建一个工具，用于查询今天的天气'"
            }
        }
        
        # 工具注册表 - 存储动态创建的工具
        self.tool_registry: Dict[str, Dict[str, Any]] = {}
        
        # 依赖的技能
        self._code_studio = None
        self._plugins_manager = None
        
        # 生成代码的输出目录
        self.output_dir = os.path.join(os.path.dirname(__file__), "..", "generated_tools")
        os.makedirs(self.output_dir, exist_ok=True)
    
    def set_dependencies(self, code_studio_skill=None, plugins_manager=None):
        """设置依赖的技能和管理器"""
        self._code_studio = code_studio_skill
        self._plugins_manager = plugins_manager
    
    def _build_task_description(self, tool_description: str) -> str:
        """
        将自然语言工具描述转换为结构化的任务描述
        
        Args:
            tool_description: 用户提供的工具描述
            
        Returns:
            结构化的任务描述，供code_studio使用
        """
        # 清理输入描述
        clean_desc = tool_description.strip()
        if clean_desc.startswith("创建一个工具") or clean_desc.startswith("创建一个"):
            # 提取核心功能描述
            if "，" in clean_desc:
                function_desc = clean_desc.split("，", 1)[1].strip()
            elif "，" in clean_desc:
                function_desc = clean_desc.split("，", 1)[1].strip()
            else:
                function_desc = clean_desc
        else:
            function_desc = clean_desc
        
        task_description = f"""
请创建一个符合MCP工具接口标准的Python函数，功能是：{function_desc}

要求：
1. 使用 `@mcp.tool()` 装饰器
2. 函数必须包含以下元数据：
   - name: 工具的唯一标识名称（英文小写下划线命名）
   - description: 工具功能的清晰描述
   - parameters: 工具接受的参数定义（JSON Schema格式）
3. 函数实现必须：
   - 正确处理输入参数
   - 包含适当的错误处理
   - 返回有意义的结果
4. 如果需要外部API或服务，请使用标准的requests库或模拟数据
5. 文件必须可独立执行，包含必要的导入语句

示例格式：
```python
from typing import Any, Dict, Optional

@mcp.tool(
    name="tool_name",
    description="工具功能描述",
    parameters={{
        "param1": {{
            "type": "string",
            "description": "参数描述",
            "required": True
        }}
    }}
)
async def tool_function(param1: str, param2: Optional[int] = None) -> Dict[str, Any]:
    # 实现逻辑
    return {{"result": "..."}}
```

请生成完整的、可直接使用的代码文件。
"""
        return task_description.strip()
    
    def _generate_fallback_code(self, tool_description: str) -> str:
        """
        生成备用代码（当code_studio不可用时）
        
        Args:
            tool_description: 工具描述
            
        Returns:
            生成的Python代码
        """
        # 从描述中提取工具名称
        name_match = re.search(r'(查询|获取|创建|计算|生成|检查)(.*?)(的|信息|数据|结果|$)', tool_description)
        if name_match:
            tool_name = f"{name_match.group(1)}_{name_match.group(2)}".replace(" ", "_")
        else:
            tool_name = f"custom_tool_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        tool_name = re.sub(r'[^a-zA-Z0-9_]', '_', tool_name).lower()
        tool_name = re.sub(r'_+', '_', tool_name).strip('_')
        
        code = f'''"""
自动生成的MCP工具: {tool_name}
创建时间: {datetime.now().isoformat()}
功能描述: {tool_description}
"""

from typing import Any, Dict, Optional, List
import json
from datetime import datetime


# MCP工具装饰器（兼容模式）
def mcp_tool(name: str, description: str, parameters: Dict = None):
    def decorator(func):
        func._mcp_tool = True
        func._mcp_name = name
        func._mcp_description = description
        func._mcp_parameters = parameters or {{}}
        return func
    return decorator


@mcp_tool(
    name="{tool_name}",
    description="{tool_description}",
    parameters={{
        "query": {{
            "type": "string",
            "description": "查询内容或输入参数",
            "required": True
        }},
        "options": {{
            "type": "object",
            "description": "可选配置项",
            "required": False
        }}
    }}
)
async def {tool_name}(query: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    {tool_description}
    
    Args:
        query: 查询内容或输入参数
        options: 可选配置项
        
    Returns:
        包含结果的字典
    """
    try:
        # 默认实现 - 返回模拟结果
        result = {{
            "status": "success",
            "tool": "{tool_name}",
            "query": query,
            "result": f"{{query}}的处理结果",
            "timestamp": datetime.now().isoformat(),
            "options": options or {{}}
        }}
        
        return result
        
    except Exception as e:
        return {{
            "status": "error",
            "tool": "{tool_name}",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }}


# 工具信息导出
TOOL_INFO = {{
    "name": "{tool_name}",
    "description": "{tool_description}",
    "parameters": {{
        "query": {{
            "type": "string",
            "description": "查询内容或输入参数",
            "required": True
        }},
        "options": {{
            "type": "object",
            "description": "可选配置项",
            "required": False
        }}
    }},
    "created_at": datetime.now().isoformat()
}}


if __name__ == "__main__":
    import asyncio
    
    async def test():
        result = await {tool_name}(query="测试查询")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    
    asyncio.run(test())
'''
        return code
    
    async def _execute_code_studio(self, task_description: str) -> Optional[str]:
        """
        调用code_studio技能生成代码
        
        Args:
            task_description: 结构化的任务描述
            
        Returns:
            生成的代码文件路径，失败返回None
        """
        if self._code_studio is None:
            logger.warning("code_studio技能未设置，将使用备用代码生成")
            return None
        
        try:
            # 调用code_studio技能
            result = await self._code_studio.execute(
                task_description=task_description,
                output_format="python",
                output_dir=self.output_dir
            )
            
            if result and isinstance(result, dict):
                return result.get("file_path")
            elif isinstance(result, str):
                return result
                
        except Exception as e:
            logger.error(f"调用code_studio失败: {e}")
        
        return None
    