"""
tool_forger.py
A skill for dynamically creating new tools based on natural language descriptions.
It leverages the code_studio skill to generate MCP-compatible tool implementations
and registers them with the plugin system for runtime availability.
"""

import asyncio
import importlib
import json
import os
import sys
import tempfile
from typing import Any, Dict, Optional, Tuple

# Ensure project root is in Python path for proper module resolution
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from acp_proxy_plugins import PluginManager

# Import code_studio skill for code generation
from . import code_studio


class ToolForger:
    """
    Implements the 'tool_forger' skill for creating new MCP tools dynamically.
    
    This skill:
    1. Converts natural language tool descriptions into structured coding tasks
    2. Delegates code generation to the code_studio skill
    3. Loads and registers the generated tool with the plugin system
    4. Returns registration status and usage examples
    """
    
    def __init__(self, plugin_manager: Optional[PluginManager] = None):
        """
        Initialize the tool_forger skill.
        
        Args:
            plugin_manager: Optional plugin manager instance. If None, creates a new one.
        """
        self.plugin_manager = plugin_manager or PluginManager()
        self.temp_dir = tempfile.mkdtemp(prefix="tool_forger_")
        
    async def create_tool(self, tool_description: str) -> Dict[str, Any]:
        """
        Main entry point for creating a new tool from a natural language description.
        
        Args:
            tool_description: Natural language description of the tool to create
                Example: "Create a tool that queries today's weather"
                
        Returns:
            Dictionary containing:
                - status: "success" or "error"
                - tool_name: Name of the created tool
                - tool_description: Generated tool description
                - usage_example: Example of how to call the tool
                - file_path: Path to the generated code file
                - error: Error message if status is "error"
        """
        try:
            # Step 1: Create structured task description for code_studio
            task_description = self._create_task_description(tool_description)
            
            # Step 2: Delegate to code_studio for code generation
            code_studio_result = await self._generate_code_with_code_studio(task_description)
            
            if code_studio_result.get("status") != "success":
                return {
                    "status": "error",
                    "error": f"Code generation failed: {code_studio_result.get('error', 'Unknown error')}"
                }
            
            # Step 3: Load and register the generated tool
            tool_path = code_studio_result.get("file_path")
            if not tool_path:
                return {
                    "status": "error",
                    "error": "Code generation succeeded but no file path returned"
                }
                
            registration_result = await self._register_generated_tool(tool_path)
            
            if registration_result.get("status") != "success":
                return {
                    "status": "error",
                    "error": f"Tool registration failed: {registration_result.get('error', 'Unknown error')}"
                }
            
            # Step 4: Return success result
            return {
                "status": "success",
                "tool_name": registration_result.get("tool_name"),
                "tool_description": registration_result.get("tool_description"),
                "usage_example": registration_result.get("usage_example"),
                "file_path": tool_path
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": f"Unexpected error in tool creation: {str(e)}"
            }
    
    def _create_task_description(self, tool_description: str) -> str:
        """
        Convert natural language tool description into a structured task description
        for the code_studio skill.
        
        Args:
            tool_description: Natural language description from user
            
        Returns:
            Structured task description for code_studio
        """
        # Extract potential tool name from description
        tool_name = self._extract_tool_name(tool_description)
        
        return f"""
Create a new MCP tool based on the following description:

TOOL DESCRIPTION:
{tool_description}

REQUIREMENTS:
1. Tool Name: {tool_name}
2. Implementation must be a Python function decorated with @mcp.tool()
3. The function must have these attributes:
   - name: '{tool_name}'
   - description: Clear description of what the tool does
   - parameters: JSON schema defining input parameters
4. The function should:
   - Accept input parameters matching the schema
   - Process the inputs appropriately
   - Return a meaningful result
   - Handle errors gracefully with appropriate error messages

EXAMPLE STRUCTURE:
```python
from mcp import mcp

@mcp.tool(
    name="{tool_name}",
    description="Description of what this tool does",
    parameters={{
        "type": "object",
        "properties": {{
            "param1": {{"type": "string", "description": "Description of param1"}},
            "param2": {{"type": "integer", "description": "Description of param2"}}
        }},
        "required": ["param1"]
    }}
)
async def {tool_name}(param1: str, param2: int = 0) -> str:
    \"\"\"
    Implementation of the tool functionality.
    
    Args:
        param1: Description of param1
        param2: Description of param2 (default: 0)
    
    Returns:
        Result string from the tool execution
    \"\"\"
    try:
        # Implementation logic here
        result = f"Processed: {{param1}} with value {{param2}}"
        return result
    except Exception as e:
        return f"Error executing {tool_name}: {{str(e)}}"
```

Save the implementation to a Python file that can be dynamically loaded.
"""
    
    def _extract_tool_name(self, tool_description: str) -> str:
        """
        Extract a reasonable tool name from the natural language description.
        
        Args:
            tool_description: Natural language description
            
        Returns:
            Extracted tool name (snake_case)
        """
        # Simple extraction: take first few words, convert to snake_case
        words = tool_description.lower().split()
        
        # Remove common prefix words