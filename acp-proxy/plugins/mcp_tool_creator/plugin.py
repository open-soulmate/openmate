# acp-proxy/plugins/mcp_tool_creator/plugin.py

import json
import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional

# Import BasePlugin from the core framework
from acp_proxy.core.plugin_system import BasePlugin, PluginManager
from acp_proxy.core.tool_manager import ToolManager

# Configure logger for this plugin
logger = logging.getLogger(__name__)


class MCPToolCreatorPlugin(BasePlugin):
    """
    MCP Tool Creator Plugin.
    Dynamically creates MCP protocol-compliant tool definitions when existing tools
    cannot cover required functionality. Monitors agent conversations and task executions.
    """

    def __init__(self, plugin_manager: PluginManager, tool_manager: ToolManager, config: Dict[str, Any]):
        """
        Initialize the MCP Tool Creator Plugin.
        
        Args:
            plugin_manager: Instance of the plugin manager.
            tool_manager: Instance of the tool manager for registering new tools.
            config: Plugin configuration dictionary.
        """
        super().__init__(plugin_manager, tool_manager, config)
        
        # Internal tool registry for tracking generated tools
        self.internal_tool_registry: Dict[str, Dict] = {}
        
        # Directory for storing generated tool definitions
        self.generated_tools_dir = Path(__file__).parent / "generated_tools"
        
        # Ensure the directory exists
        self.generated_tools_dir.mkdir(parents=True, exist_ok=True)
        
        # Load any previously generated tools
        self._load_existing_tools()
        
        logger.info("MCPToolCreatorPlugin initialized. Tools directory: %s", self.generated_tools_dir)

    def _load_existing_tools(self) -> None:
        """Load tool definitions from the generated_tools directory."""
        try:
            for tool_file in self.generated_tools_dir.glob("*.json"):
                with open(tool_file, 'r', encoding='utf-8') as f:
                    tool_definition = json.load(f)
                    tool_name = tool_definition.get('name')
                    if tool_name:
                        self.internal_tool_registry[tool_name] = tool_definition
                        logger.debug("Loaded existing tool definition: %s", tool_name)
        except Exception as e:
            logger.error("Failed to load existing tool definitions: %s", str(e))

    def on_task_failure(self, task_details: Dict[str, Any], error: str) -> None:
        """
        Event handler triggered when a task fails.
        Analyzes the failure to determine if it's due to missing tool functionality.
        
        Args:
            task_details: Dictionary containing task execution details.
            error: Error message from the failed task.
        """
        logger.info("Task failure detected. Analyzing for missing tool functionality...")
        
        # Analyze the error and task details to determine if a new tool is needed
        # This is a placeholder - actual implementation would depend on error patterns
        # and task context analysis
        tool_analysis = self._analyze_for_missing_tool(task_details, error)
        
        if tool_analysis:
            logger.info("Potential tool gap identified: %s", tool_analysis.get('suggested_tool_name'))
            # In a real implementation, you might queue this for review or auto-generate
            # For now, we log the suggestion
            self._suggest_tool_creation(tool_analysis)

    def _analyze_for_missing_tool(self, task_details: Dict, error: str) -> Optional[Dict]:
        """
        Analyze task failure to identify potential missing tool functionality.
        
        Args:
            task_details: Task execution details.
            error: Error message.
            
        Returns:
            Dictionary with tool suggestion or None if no tool gap identified.
        """
        # Placeholder implementation - in reality, this would use NLP/LLM to analyze
        # the conversation and error to determine what tool might be missing
        
        # Example pattern matching (simplified)
        error_patterns = {
            "I don't know how to": "knowledge_retrieval",
            "cannot access": "resource_access",
            "need to parse": "data_parser",
            "format conversion": "format_converter"
        }
        
        for pattern, tool_type in error_patterns.items():
            if pattern.lower() in error.lower():
                return {
                    "suggested_tool_name": f"auto_{tool_type}",
                    "tool_type": tool_type,
                    "context": error[:200],  # First 200 chars of error
                    "task_id": task_details.get("task_id", "unknown")
                }
        
        return None

    def _suggest_tool_creation(self, tool_analysis: Dict) -> None:
        """
        Log tool creation suggestion. Could be extended to trigger automated creation.
        
        Args:
            tool_analysis: Analysis results suggesting a new tool.
        """
        suggestion = {
            "timestamp": self._get_current_timestamp(),
            "suggested_tool": tool_analysis,
            "status": "suggestion_logged"
        }
        
        logger.info("Tool creation suggestion logged: %s", suggestion)
        
        # For now, just log the suggestion. In a production system, this might:
        # 1. Send to an approval queue
        # 2. Trigger automated tool generation
        # 3. Notify administrators

    def generate_tool_definition(self, tool_name: str, tool_description: str, 
                                 parameters_schema: Dict, response_schema: Dict) -> str:
        """
        Generate a complete MCP-compliant tool definition and save it to file.
        
        Args:
            tool_name: Unique name for the tool.
            tool_description: Description of what the tool does.
            parameters_schema: JSON Schema defining the tool's input parameters.
            response_schema: JSON Schema defining the tool's response format.
            
        Returns:
            Path to the generated JSON file.
            
        Raises:
            ValueError: If tool_name already exists in registry.
        """
        # Check if tool already exists
        if tool_name in self.internal_tool_registry:
            raise ValueError(f"Tool '{tool_name}' already exists in the registry.")
        
        # Create MCP-compliant tool definition
        tool_definition = {
            "name": tool_name,
            "description": tool_description,
            "parameters": parameters_schema,
            "returns": response_schema,
            "metadata": {
                "version": "1.0.0",
                "created_by": "MCPToolCreatorPlugin",
                "created_at": self._get_current_timestamp(),
                "protocol": "MCP-1.0"
            }
        }
        
        # Validate the JSON schemas (basic validation)
        self._validate_schema(parameters_schema, "parameters")
        self._validate_schema(response_schema, "returns")
        
        # Save to file
        file_path = self.generated_tools_dir / f"{tool_name}.json"
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(tool_definition, f, indent=2, ensure_ascii=False)
            logger.info("Generated tool definition saved to: %s", file_path)
        except Exception as e:
            logger.error("Failed to save tool definition: %s", str(e))
            raise
        
        # Add to internal registry
        self.internal_tool_registry[tool_name] = tool_definition
        
        # Register with the tool manager
        self._register_tool_with_manager(tool_definition)
        
        return str(file_path)

    def _validate_schema(self, schema: Dict, schema_type: str) -> None:
        """
        Basic validation of JSON Schema structure.
        
        Args:
            schema: JSON Schema to validate.
            schema_type: Type of schema (parameters/returns) for error messages.
        """
        # Basic validation - in production, use a JSON Schema validator
        if not isinstance(schema, dict):
            raise ValueError(f"{schema_type} schema must be a dictionary")
        
        if 'type' not in schema and 'properties' not in schema:
            logger.warning(f"{schema_type} schema might be incomplete: missing 'type' or 'properties'")
