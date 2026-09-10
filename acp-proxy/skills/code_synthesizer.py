#!/usr/bin/env python3
"""
CodeSynthesizer - A skill module for generating Python code from natural language descriptions.
"""

import subprocess
import json
import logging
import time
import os
import sys
import tempfile
import re
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class CodeSynthesizer:
    """
    A code generation skill that converts natural language task descriptions into executable Python code.
    
    This skill is designed as a 'probe' for implementing self-programming capabilities and tool creation.
    It features basic code generation, error detection, and iterative optimization.
    
    Input Format:
        task_description (str): A natural language description of a simple coding task.
        Examples:
        - "Create a function named 'add' that takes two numbers and returns their sum"
        - "Read a file called 'input.txt' and print its contents"
        - "Define a class 'Person' with name and age attributes"
        
    Output Format:
        Dict containing:
        - 'success': bool indicating if code executed successfully
        - 'generated_code': The Python code that was generated
        - 'execution_output': stdout from execution (if successful)
        - 'error_log': stderr or error details (if failed)
        - 'confidence': float between 0-1 indicating confidence in the solution
        - 'refinement_applied': bool indicating if code was refined after initial failure
        
    Limitations:
        - Only handles simple, well-defined coding tasks
        - Template-based approach limits complexity of generated code
        - Sandbox execution has timeout and memory restrictions
        - Not suitable for complex algorithms or multi-file projects
        
    Potential Risks:
        - Generated code might contain security vulnerabilities
        - Sandbox escape could potentially harm the system
        - Over-reliance could inhibit development of more sophisticated solutions
    """
    
    def __init__(self, 
                 templates_path: Optional[str] = None,
                 sandbox_timeout: int = 10,
                 experience_log_path: str = "acp-proxy/data/code_synthesizer_experience.jsonl"):
        """
        Initialize the CodeSynthesizer skill.
        
        Args:
            templates_path: Path to external templates file (optional, uses built-in if None)
            sandbox_timeout: Timeout in seconds for code execution in sandbox
            experience_log_path: Path to store experience log for future learning
        """
        self.sandbox_timeout = sandbox_timeout
        self.experience_log_path = experience_log_path
        
        # Load templates
        if templates_path and os.path.exists(templates_path):
            self.templates = self._load_templates_from_file(templates_path)
        else:
            self.templates = self._load_templates()
        
        # Initialize experience log
        self.success_log: List[Dict] = []
        self._ensure_log_directory()
        
        logger.info(f"CodeSynthesizer initialized with {len(self.templates)} templates")
    
    def _ensure_log_directory(self) -> None:
        """Ensure the log directory exists."""
        log_dir = os.path.dirname(self.experience_log_path)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
    
    def _load_templates(self) -> Dict[str, str]:
        """
        Load built-in code templates.
        
        Returns:
            Dictionary mapping template names to code template strings.
        """
        return {
            'python_function': '''def {function_name}({parameters}):
    """{docstring}"""
    {function_body}
    return {return_value}''',
            
            'class_definition': '''class {class_name}:
    """{class_docstring}"""
    
    def __init__(self{init_params}):
        {init_body}
    
    {methods}''',
            
            'file_operations': '''def read_file(file_path):
    """Read and return contents of a file."""
    try:
        with open(file_path, 'r') as f:
            return f.read()
    except FileNotFoundError:
        print(f"Error: File '{{file_path}}' not found")
        return None
    except Exception as e:
        print(f"Error reading file: {{e}}")
        return None

def write_file(file_path, content):
    """Write content to a file."""
    try:
        with open(file_path, 'w') as f:
            f.write(content)
        return True
    except Exception as e:
        print(f"Error writing file: {{e}}")
        return False''',
            
            'simple_api_call': '''import requests

def call_api(url, method='GET', data=None):
    """Make a simple API call."""
    try:
        if method.upper() == 'GET':
            response = requests.get(url, timeout=10)
        elif method.upper() == 'POST':
            response = requests.post(url, json=data, timeout=10)
        else:
            raise ValueError(f"Unsupported HTTP method: {{method}}")
        
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"API call failed: {{e}}")
        return None''',
            
            'data_processing': '''def process_data(data, operation='sum'):
    """Process data with basic operations."""
    if not data:
        return None
    
    if operation == 'sum':
        return sum(data)
    elif operation == 'average':
        return sum(data) / len(data)
    elif operation == 'max':
        return max(data)
    elif operation == 'min':
        return min(data)
    elif operation == 'count':
        return len(data)
    else:
        raise ValueError(f"Unsupported operation: {{operation}}")'''
        }
    
    def _load_templates_from_file(self, file_path: str) -> Dict[str, str]:
        """
        Load templates from an external JSON file.
        
        Args:
            file_path: Path to JSON file containing templates
            
        Returns:
            Dictionary of templates
        """
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load templates from {file_path}: {e}")
            return self._load_templates()  # Fall back to built-in templates
    
    def generate_from_template(self, description: str) -> str:
        """
        Generate code from a task description using template matching.
        
        Args:
            description: Natural language task description
            
        Returns:
            Generated Python code as string
        """
        description_lower = description.lower()
        
        # Try to match keywords to templates
        template_matches = []
        
        if any(keyword in description_lower for keyword in ['function', 'def ', 'create function', 'define function']):
            template_matches.append(('python_function', 3))
        
        if any(keyword in description_lower for keyword in ['class', 'create class', 'define class']):
            template_matches.append(('class_definition', 3))
        
        if any(keyword in description_lower for keyword in ['read file', 'write file', 'file', 'txt', 'json']):
            template_matches.append(('file_operations', 2))
        
        if any(keyword in description_lower for keyword in ['api', 'request', 'http', 'url', 'fetch']):
            template_matches.append(('simple_api_call', 2))
        
        if any(keyword in description_lower for keyword in ['data', 'sum', 'average', 'process', 'list']):
            template_matches.append(('data_processing', 2))
        
        # Select best match or use function template as default
        if template_matches:
            # Sort by score (descending), pick first
            template_matches.sort(key=lambda x: x[1], reverse=True)
            template_name = template_matches[0][0]
        else:
            template_name = 'python_function'
        
        template = self.templates[template_name]
        
        # Fill template with extracted values
        if template_name == 'python_function':
            return self._fill_function_template(description, template)
        elif template_name == 'class_definition':
            return self._fill_class_template(description, template)
        else:
            # For other templates, use basic substitution
            return self._fill_generic_template(description, template, template_name)
    
    def _fill_function_template(self, description: str, template: str) -> str:
        """Fill function template with values extracted from description."""