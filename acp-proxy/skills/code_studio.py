"""
Code Studio Skill - Core sandbox and execution engine for self-programming and tool creation
"""
import os
import json
import re
import sys
import signal
import tempfile
import traceback
import hashlib
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
import threading
import time
import ast
import textwrap
import builtins

# Safe execution environment configuration
RESTRICTED_GLOBALS = {
    "__builtins__": {
        "print": print,
        "len": len,
        "range": range,
        "int": int,
        "str": str,
        "float": float,
        "bool": bool,
        "list": list,
        "dict": dict,
        "tuple": tuple,
        "set": set,
        "type": type,
        "isinstance": isinstance,
        "hasattr": hasattr,
        "getattr": getattr,
        "setattr": setattr,
        "repr": repr,
        "min": min,
        "max": max,
        "abs": abs,
        "sum": sum,
        "sorted": sorted,
        "enumerate": enumerate,
        "zip": zip,
        "map": map,
        "filter": filter,
        "any": any,
        "all": all,
        "chr": chr,
        "ord": ord,
        "hex": hex,
        "oct": oct,
        "bin": bin,
        "round": round,
        "pow": pow,
        "divmod": divmod,
        "id": id,
        "hash": hash,
        "callable": callable,
        "iter": iter,
        "next": next,
        "reversed": reversed,
        "bytearray": bytearray,
        "bytes": bytes,
        "complex": complex,
        "frozenset": frozenset,
        "memoryview": memoryview,
        "object": object,
        "property": property,
        "slice": slice,
        "staticmethod": staticmethod,
        "classmethod": classmethod,
        "super": super,
        "vars": vars,
        "dir": dir,
        "help": help,
        "breakpoint": lambda: None,  # Disable breakpoints
        "input": lambda *args: "",   # Disable input
    }
}

# Blocked modules for security
BLOCKED_MODULES = {
    "os", "subprocess", "sys", "shutil", "glob", "tempfile", 
    "socket", "http", "urllib", "requests", "httpx",
    "pickle", "shelve", "marshal",
    "ctypes", "mmap", "signal", "threading",
    "importlib", "pkg_resources", "site",
    "getpass", "crypt", "pwd", "grp",
}

class TimeoutError(Exception):
    """Custom timeout exception"""
    pass

class ExecutionTimeout:
    """Context manager for execution timeout"""
    def __init__(self, seconds: int = 10):
        self.seconds = seconds
        self.timer = None
        
    def __enter__(self):
        self.old_handler = signal.getsignal(signal.SIGALRM)
        signal.signal(signal.SIGALRM, self._timeout_handler)
        signal.alarm(self.seconds)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        signal.alarm(0)
        signal.signal(signal.SIGALRM, self.old_handler)
        return False
    
    def _timeout_handler(self, signum, frame):
        raise TimeoutError(f"Execution timed out after {self.seconds} seconds")

class CodeStudioSkill:
    """
    Core skill for self-programming and tool creation
    Implements code generation, sandboxed testing, and deployment
    """
    
    def __init__(self, workspace_dir: str = "workspace", timeout: int = 10):
        """
        Initialize CodeStudio skill
        
        Args:
            workspace_dir: Base directory for generated code
            timeout: Execution timeout in seconds
        """
        self.workspace_dir = Path(workspace_dir)
        self.generated_dir = self.workspace_dir / "generated"
        self.timeout = timeout
        self._ensure_directories()
        
    def _ensure_directories(self):
        """Create necessary directories if they don't exist"""
        self.generated_dir.mkdir(parents=True, exist_ok=True)
        
    def _generate_module_name(self, task_description: str) -> str:
        """Generate a unique module name based on task description"""
        # Extract meaningful words
        words = re.findall(r'\b\w+\b', task_description.lower())
        # Take first few meaningful words
        name_parts = [w for w in words if len(w) > 3][:3]
        if not name_parts:
            name_parts = ["module"]
        
        # Add hash for uniqueness
        hash_str = hashlib.md5(task_description.encode()).hexdigest()[:6]
        module_name = "_".join(name_parts) + "_" + hash_str
        
        # Clean up to valid Python identifier
        module_name = re.sub(r'[^a-zA-Z0-9_]', '_', module_name)
        if not module_name[0].isalpha():
            module_name = "mod_" + module_name
            
        return module_name
    
    def _generate_plan(self, task_description: str) -> Dict[str, Any]:
        """
        Generate implementation plan from task description
        
        Args:
            task_description: Description of coding task
            
        Returns:
            Dictionary with implementation plan
        """