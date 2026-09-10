#!/usr/bin/env python3
"""
Self Programming Bootstrapper - A minimal self-programming skill for agent bootstrapping.

This skill analyzes the current project structure and generates simple Python function
samples to demonstrate self-programming capabilities. It serves as a starting point for
agents to understand their own codebase and generate new basic functions.
"""

import os
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import ast
import datetime
import unittest

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SelfProgrammingBootstrapper:
    """
    A bootstrapper class for self-programming capabilities.
    
    This class provides methods to analyze project structure and generate
    simple Python function samples to help agents understand code generation.
    """
    
    def __init__(self, base_path: str = "."):
        """
        Initialize the SelfProgrammingBootstrapper.
        
        Args:
            base_path (str): Base directory path to analyze. Defaults to current directory.
        """
        self.base_path = Path(base_path).resolve()
        self.project_structure = {}
        self.generated_functions = []
        
        logger.info(f"Initialized SelfProgrammingBootstrapper with base path: {self.base_path}")
        
    def analyze_project_structure(self) -> Dict[str, Any]:
        """
        Scan the current directory and return a file tree structure.
        
        Only scans Python (.py) and TypeScript (.ts) files.
        
        Returns:
            Dict[str, Any]: Dictionary containing project structure information
            
        Raises:
            FileNotFoundError: If the base path does not exist
            PermissionError: If there are permission issues accessing files
            OSError: If there are other OS-related errors
        """
        logger.info("Starting project structure analysis...")
        
        try:
            if not self.base_path.exists():
                raise FileNotFoundError(f"Base path does not exist: {self.base_path}")
                
            if not self.base_path.is_dir():
                raise ValueError(f"Base path is not a directory: {self.base_path}")
                
            structure = {
                "base_path": str(self.base_path),
                "scan_time": datetime.datetime.now().isoformat(),
                "files": [],
                "directories": [],
                "statistics": {
                    "total_files": 0,
                    "python_files": 0,
                    "typescript_files": 0,
                    "total_size": 0
                }
            }
            
            # Walk through the directory tree
            for root, dirs, files in os.walk(self.base_path):
                root_path = Path(root)
                relative_root = root_path.relative_to(self.base_path)
                
                # Add directory to structure
                if str(relative_root) != '.':
                    structure["directories"].append(str(relative_root))
                
                # Process files
                for file in files:
                    file_path = root_path / file
                    relative_file = file_path.relative_to(self.base_path)
                    file_ext = file_path.suffix.lower()
                    
                    # Only include .py and .ts files
                    if file_ext in ['.py', '.ts']:
                        try:
                            file_stat = file_path.stat()
                            file_info = {
                                "path": str(relative_file),
                                "name": file,
                                "extension": file_ext,
                                "size": file_stat.st_size,
                                "modified": datetime.datetime.fromtimestamp(
                                    file_stat.st_mtime
                                ).isoformat()
                            }
                            
                            structure["files"].append(file_info)
                            structure["statistics"]["total_files"] += 1
                            structure["statistics"]["total_size"] += file_stat.st_size
                            
                            if file_ext == '.py':
                                structure["statistics"]["python_files"] += 1
                            elif file_ext == '.ts':
                                structure["statistics"]["typescript_files"] += 1
                                
                            logger.debug(f"Processed file: {relative_file}")
                            
                        except (PermissionError, OSError) as e:
                            logger.warning(f"Cannot access file {relative_file}: {e}")
                            continue
                            
            self.project_structure = structure
            logger.info(f"Analysis complete: Found {structure['statistics']['total_files']} "
                       f"files ({structure['statistics']['python_files']} Python, "
                       f"{structure['statistics']['typescript_files']} TypeScript)")
            
            return structure
            
        except Exception as e:
            logger.error(f"Error during project analysis: {e}")
            raise
            
    def generate_sample_function(self, project_context: Optional[Dict[str, Any]] = None) -> str:
        """
        Generate a simple Python function example based on project analysis.
        
        Args:
            project_context (Optional[Dict[str, Any]]): Project structure context for
                generating context-aware functions. If None, uses internal analysis.
                
        Returns:
            str: Python function code as string
        """
        logger.info("Generating sample function...")
        
        context = project_context or self.project_structure
        if not context:
            logger.warning("No project context available, using default function")
            context = {}
            
        # Get project name from base path
        project_name = "world"
        if "base_path" in context:
            project_name = Path(context["base_path"]).name or "world"
            
        # Analyze project type based on files
        has_python = context.get("statistics", {}).get("python_files", 0) > 0
        has_typescript = context.get("statistics", {}).get("typescript_files", 0) > 0
        
        # Generate function based on project context
        if has_python and has_typescript:
            greeting = f"Hello from a {project_name} project with Python and TypeScript!"
        elif has_python:
            greeting = f"Hello from {project_name} Python project!"
        elif has_typescript:
            greeting = f"Hello from {project_name} TypeScript project!"
        else:
            greeting = f"Hello from {project_name} project!"
            
        # Create sample function
        function_code = f'''def greet_{project_name.lower().replace(" ", "_")}(name: str = "User") -> str:
    """
    Generate a greeting message for {project_name} project.
    
    This function creates a personalized greeting based on the provided name
    and project context. It demonstrates basic self-programming capabilities.
    
    Args:
        name (str): The name to include in the greeting. Defaults to "User".
        
    Returns:
        str: A personalized greeting message
        
    Examples:
        >>> greet_{project_name.lower().replace(" ", "_")}("Alice")
        "{greeting} Welcome, Alice!"
        >>> greet_{project_name.lower().replace(" ", "_")}()
        "{greeting} Welcome, User!"
        
    Note:
        This is a sample function generated by SelfProgrammingBootstrapper.
    """
    try:
        # Validate input
        if not isinstance(name, str):
            raise TypeError(f"Name must be a string, got {{type(name).__name__}}")
            
        # Generate greeting
        personalized_greeting = f"{{greeting}} Welcome, {{name}}!"
        
        logger.debug(f"Generated greeting for {{name}}")
        return personalized_greeting
        
    except Exception as e:
        logger.error(f"Error in greet_{project_name.lower().replace(' ', '_')}: {{e}}")
        # Return a default greeting on error
        return f"Hello from {project_name}! Welcome, {{name if isinstance(name, str) else 'User'}}!"
'''
        
        self.generated_functions.append(function_code)
        logger.info(f"Sample function generated for {project_name} project")
        
        return function_code
        
    def run(self, output_filename: str = "generated_sample.py") -> str:
        """
        Main entry method: analyze project and generate sample function.
        
        Performs analysis of the current directory structure, generates a sample
        function based on the analysis, and saves it to a new Python file.
        
        Args:
            output_filename (str): Name of the output file. Defaults to "generated_sample.py".
            
        Returns:
            str: Path to the generated file
            
        Raises:
            ValueError: If output filename is invalid
            OSError: If there are issues writing the output file
        """