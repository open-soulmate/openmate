"""
Code Template Generator Skill for ACP-Proxy System
===================================================
A skill that generates code templates from natural language task descriptions,
enabling agents to initiate self-programming by producing boilerplate code for
common programming tasks.
"""

import re
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
import json


class CodeTemplateGenerator:
    """
    Generates code templates from natural language task descriptions.
    
    This skill enables self-programming capability by providing structured
    boilerplate code for common programming tasks like function definitions,
    class structures, and script generation.
    
    Attributes:
        language (str): Default programming language for templates
        templates (Dict): Loaded templates for different task types
        
    Example Usage:
        >>> generator = CodeTemplateGenerator()
        >>> template = generator.generate_code_template(
        ...     "create a Python function to calculate factorial",
        ...     language="python"
        ... )
        >>> print(template)
    """
    
    def __init__(self, default_language: str = "python"):
        """
        Initialize the CodeTemplateGenerator.
        
        Args:
            default_language: Default programming language for templates
        """
        self.default_language = default_language.lower()
        self.templates_dir = Path(__file__).parent / "templates"
        self.templates: Dict[str, Dict[str, str]] = {}
        
        # Load built-in templates
        self._load_builtin_templates()
        
        # Load external templates if directory exists
        if self.templates_dir.exists():
            self._load_external_templates()
    
    def _load_builtin_templates(self):
        """Load built-in code templates for common programming tasks."""
        self.templates = {
            "python": {
                "function": '''def {function_name}({parameters}) -> {return_type}:
    """
    {docstring}
    
    Args:
        {args_description}
    
    Returns:
        {return_description}
    """
    # TODO: Implement {function_name} functionality
    {function_body}
    
    return {return_value}
''',
                "class": '''class {class_name}:
    """
    {class_docstring}
    """
    
    def __init__(self{init_parameters}):
        """
        Initialize {class_name}.
        
        Args:
            {init_args_description}
        """
        # TODO: Initialize class attributes
        {init_body}
    
    {methods}
''',
                "script": '''#!/usr/bin/env python3
"""
{script_name} - {script_description}
"""

import sys
from typing import List, Optional


def main(args: List[str]) -> int:
    """
    Main function for {script_name}.
    
    Args:
        args: Command line arguments
    
    Returns:
        Exit code (0 for success)
    """
    # TODO: Implement script logic
    {main_body}
    
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
''',
                "api_endpoint": '''from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

app = FastAPI()


class {request_model}(BaseModel):
    """Request model for {endpoint_name}."""
    # TODO: Define request fields
    {request_fields}


class {response_model}(BaseModel):
    """Response model for {endpoint_name}."""
    # TODO: Define response fields
    {response_fields}


@app.{http_method}("{endpoint_path}")
async def {endpoint_name}(
    request: {request_model}
    # {dependencies}
) -> {response_model}:
    """
    {endpoint_description}
    
    Args:
        request: Request data
    
    Returns:
        Response data
        
    Raises:
        HTTPException: When request is invalid
    """
    try:
        # TODO: Implement endpoint logic
        {endpoint_body}
        
        return {response_model}(
            # {response_data}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
''',
                "test": '''import unittest
from unittest.mock import Mock, patch


class Test{test_subject}(unittest.TestCase):
    """Test cases for {test_subject}."""
    
    def setUp(self):
        """Set up test fixtures."""
        {setup_code}
    
    def tearDown(self):
        """Tear down test fixtures."""
        {teardown_code}
    
    def test_{test_case}(self):
        """
        Test {test_description}.
        """
        # Arrange
        {arrange_code}
        
        # Act
        {act_code}
        
        # Assert
        {assert_code}
    
    # TODO: Add more test cases


if __name__ == "__main__":
    unittest.main()
''',
                "generic": '''# {task_description}
# Language: {language}
# TODO: Implement according to requirements

{code_body}
'''
            },
            "javascript": {
                "function": '''/**
 * {function_description}
 * @param {parameters}
 * @returns {return_type}
 */
function {function_name}({parameters}) {{
    // TODO: Implement function
    {function_body}
    
    return {return_value};
}}

module.exports = {{ {function_name} }};
''',
                "class": '''/**
 * {class_description}
 */
class {class_name} {{
    /**
     * Create a new {class_name}
     * @param {constructor_params}
     */
    constructor({constructor_params}) {{
        // TODO: Initialize properties
        {constructor_body}
    }}
    
    {methods}
}}

module.exports = {class_name};
''',
                "generic": '''// {task_description}
// Language: {language}
// TODO: Implement according to requirements

{code_body}
'''
            }
        }
    
    def _load_external_templates(self):
        """Load external templates from templates directory."""
        for lang_dir in self.templates_dir.iterdir():
            if lang_dir.is_dir():
                language = lang_dir.name.lower()
                if language not in self.templates:
                    self.templates[language] = {}
                
                for template_file in lang_dir.glob("*.txt"):
                    task_type = template_file.stem
                    try:
                        with open(template_file, 'r', encoding='utf-8') as f:
                            self.templates[language][task_type] = f.read()
                    except Exception as e:
                        print(f"Warning: Failed to load template {template_file}: {e}")
    
    def _parse_task_description(self, description: str) -> Tuple[str, Dict[str, str]]:
        """
        Parse task description to extract task type and parameters.
        
        Args:
            description: Natural language task description
            
        Returns:
            Tuple of (task_type, parameters_dict)
        """
        description_lower = description.lower()
        parameters = {}
        
        # Define task type patterns with priority (order matters)
        task_patterns = [
            # Function patterns
            (r'function|def\s+\w+|method|procedure', 'function'),
            (r'create.*function|write.*function|implement.*function', 'function'),
            (r'calculate|compute|process|transform', 'function'),
            
            # Class patterns
            (r'class|object|instance|model|entity', 'class'),
            (r'create.*class|define.*class|implement.*class', 'class'),
            
            # Script patterns
            (r'script|program|application|cli|command.line', 'script'),
            (r'run.*script|execute.*script|main.*program', 'script'),
            
            # API patterns
            (r'api|endpoint|route|handler|restful|http', 'api_endpoint'),
            (r'web.*service|microservice|server', 'api_endpoint'),
            (r'get|post|put|delete|patch.*request', 'api_endpoint'),
            
            # Test patterns
            (r'test|unit.*test|testing|spec|specification', 'test'),
            (r'write.*test|create.*test|implement.*test', 'test'),
            
            # Database patterns
            (r'database|db|query|sql|table|migration', 'database'),
            (r'crud|create.*read.*update.*delete', 'database'),
        ]
        
        # Find matching task type
        task_type = 'generic'  # Default
        for pattern, ttype in task_patterns:
            if re.search(pattern, description_lower):
                task_type = ttype
                break
        
        # Extract common parameters from description
        # Function name extraction
        func_match = re.search(r'function\s+(\w+)|def\s+(\w+)|called\s+(\w+)', description, re.IGNORECASE)
        if func_match:
            func_name = func_match.group(1) or func_match.group(2) or func_match.group(3)
            parameters['function_name'] = func_name
        
        # Class name extraction