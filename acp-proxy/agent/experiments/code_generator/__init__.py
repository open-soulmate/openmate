import os
import pathlib
import ast
from typing import Dict, Any, Optional, Callable
from acp_proxy.plugins.base import BasePlugin

class CodeGeneratorPlugin(BasePlugin):
    def __init__(self):
        super().__init__()
        self.templates: Dict[str, Dict[str, Any]] = {}
        self._register_builtin_templates()

    def _register_builtin_templates(self):
        """Register built-in templates for Python and TypeScript."""
        # Python skill template
        def skill_template_py(params: Dict[str, Any]) -> str:
            name = params.get('name', 'MySkill')
            description = params.get('description', 'A skill implementation')
            imports = "from acp_proxy.skills.base import BaseSkill"
            return f'''{imports}

class {name}(BaseSkill):
    """
    {description}
    """
    def __init__(self):
        super().__init__(name="{name}")

    def execute(self, **kwargs) -> Any:
        # Skill implementation here
        return {{"status": "success", "message": f"{name} executed"}}
'''

        # Python plugin template
        def plugin_template_py(params: Dict[str, Any]) -> str:
            name = params.get('name', 'MyPlugin')
            description = params.get('description', 'A plugin implementation')
            imports = "from acp_proxy.plugins.base import BasePlugin"
            return f'''{imports}

class {name}(BasePlugin):
    """
    {description}
    """
    def __init__(self):
        super().__init__()
        self.name = "{name}"

    def on_startup(self):
        # Plugin startup logic
        pass

    def on_shutdown(self):
        # Plugin shutdown logic
        pass
'''

        # Python utility template
        def utility_template_py(params: Dict[str, Any]) -> str:
            name = params.get('name', 'utility_module')
            description = params.get('description', 'A utility module')
            imports = "import os\nimport sys"
            return f'''{imports}

"""
{description}
"""

class {name}Utils:
    """Utility class for {name}."""

    @staticmethod
    def helper_function():
        # Utility function implementation
        pass
'''

        # TypeScript skill template
        def skill_template_ts(params: Dict[str, Any]) -> str:
            name = params.get('name', 'MySkill')
            description = params.get('description', 'A skill implementation')
            return f'''import {{ BaseSkill }} from 'acp-proxy/skills/base';

/**
 * {description}
 */
export class {name} extends BaseSkill {{
    constructor() {{
        super("{name}");
    }}

    execute(kwargs: Record<string, any>): any {{
        // Skill implementation here
        return {{ status: "success", message: `{name} executed` }};
    }}
}}
'''

        # TypeScript plugin template
        def plugin_template_ts(params: Dict[str, Any]) -> str:
            name = params.get('name', 'MyPlugin')
            description = params.get('description', 'A plugin implementation')
            return f'''import {{ BasePlugin }} from 'acp-proxy/agent/experiments/base';

/**
 * {description}
 */
export class {name} extends BasePlugin {{
    name: string = "{name}";

    on_startup(): void {{
        // Plugin startup logic
    }}

    on_shutdown(): void {{
        // Plugin shutdown logic
    }}
}}
'''

        # TypeScript utility template
        def utility_template_ts(params: Dict[str, Any]) -> str:
            name = params.get('name', 'utilityModule')
            description = params.get('description', 'A utility module')
            return f'''/**
 * {description}
 */

export class {name}Utils {{
    /**
     * Utility function for {name}
     */
    static helperFunction(): void {{
        // Utility function implementation
    }}
}}
'''

        # Register all templates
        self.register_template("skill_template.py", "python", skill_template_py)