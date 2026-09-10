"""
Self-Code Generator Skill for autonomous code generation and execution.
Implements controlled code generation with sandboxed execution environment.
"""

import sys
import io
import json
import math
import traceback
from typing import Dict, Any, Optional
from contextlib import redirect_stdout, redirect_stderr


class SelfCodeGenerator:
    """
    Skill for autonomous code generation and execution.
    Generates Python code from natural language requirements and executes it in a sandboxed environment.
    """
    
    # List of safe modules allowed in sandbox
    SAFE_MODULES = {
        'math': math,
        'json': json
    }
    
    # List of dangerous builtins to remove from sandbox
    DANGEROUS_BUILTINS = [
        'open', 'file', 'exec', 'eval', 'compile', 'execfile',
        'input', 'raw_input', 'reload', 'exit', 'quit',
        'help', 'dir', 'globals', 'locals', 'vars', 'vars'
    ]
    
    def __init__(self):
        """Initialize the SelfCodeGenerator skill."""
        self.name = "self_code_generator"
        self.description = "Generates and executes Python code based on natural language requirements"
        
        # Store reference to generate_text function if available in the system