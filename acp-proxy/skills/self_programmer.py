import os
import json
import ast
import subprocess
import re
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass, asdict
from abc import ABC, abstractmethod

@dataclass
class ProgramTask:
    task_id: str
    requirement: str
    task_type: str
    target_files: List[str]
    dependencies: List[str]
    priority: int
    status: str = "pending"

@dataclass
class CodeGenerationResult:
    success: bool
    code: Optional[str]
    files_created: List[str]
    error: Optional[str]
    execution_time: float

@dataclass
class ValidationReport:
    syntax_valid: bool
    tests_passed: bool
    security_check_passed: bool
    style_check_passed: bool
    coverage: float
    warnings: List[str]
    errors: List[str]

@dataclass
class DeploymentResult:
    success: bool
    target_path: str
    backup_created: bool
    git_commit_hash: Optional[str]
    deployment_time: datetime
    error: Optional[str]

@dataclass 
class ProgrammingMilestone:
    milestone_id: str
    description: str
    completion_criteria: str
    progress_increment: float
    is_completed: bool = False
    completion_time: Optional[datetime] = None

@dataclass
class ProgrammingLog:
    log_id: str
    timestamp: datetime
    requirement: str
    generated_code: str
    validation_result: Dict[str, Any]
    deployment_result: Optional[Dict[str, Any]]
    success: bool
    failure_reason: Optional[str]
    metadata: Dict[str, Any]

class BaseSkill(ABC):
    """Base class for all skills"""
    
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.config = {}
        self.logger = None
        
    @abstractmethod
    def execute(self, **kwargs) -> Any:
        """Execute the skill with given parameters"""
        pass
    
    def set_config(self, config: Dict[str, Any]) -> None:
        """Set configuration for the skill"""
        self.config.update(config)
    
    def get_config(self) -> Dict[str, Any]:
        """Get current configuration"""
        return self.config.copy()

class SelfProgrammerSkill(BaseSkill):
    """
    Self-programming skill that enables agents to automatically generate, test, 
    and deploy code based on requirements. Core component for achieving 
    the "self-programming capability" goal.
    """
    
    # Security patterns to block
    DANGEROUS_PATTERNS = [
        r'os\.system\(',
        r'subprocess\.call\(',
        r'subprocess\.run\(',
        r'os\.remove\(',
        r'os\.unlink\(',
        r'shutil\.rmtree\(',
        r'requests\.get\(',
        r'urllib\.request\.urlopen\(',
        r'socket\.connect\(',
        r'exec\(',
        r'eval\(',
        r'__import__\(',
    ]
    
    def __init__(self):
        super().__init__(
            name="self_programmer",
            description="Enables self-programming capability for code generation, testing, and deployment"
        )
        
        self.milestones: Dict[str, ProgrammingMilestone] = {}
        self.programming_logs: List[ProgrammingLog] = []
        self.sandbox_path: Optional[str] = None
        self.project_root: Optional[str] = None
        
        # Initialize default milestones
        self._initialize_milestones()
        
        # Configuration for code style
        self.code_style = {
            "indentation": 4,
            "max_line_length": 88,
            "docstring_style": "google",
            "type_hints_required": True,
        }
    
    def execute(self, **kwargs) -> Any:
        """Main execution method"""
        if 'requirement' in kwargs:
            return self.analyze_requirement(kwargs['requirement'])
        return {"error": "Invalid operation"}
    
    def analyze_requirement(self, requirement_text: str) -> Dict[str, Any]:
        """
        Analyze and break down a functional requirement into executable programming tasks.
        
        Args:
            requirement_text: Description of the requirement
            
        Returns:
            Dictionary containing analysis results and task breakdown
        """
        try:
            # Parse requirement into structured data
            parsed = self._parse_requirement(requirement_text)
            
            # Generate task specifications
            tasks = self._generate_task_specifications(parsed)
            
            # Update milestones based on requirements
            self._update_milestones(parsed)
            
            return {
                "success": True,
                "original_requirement": requirement_text,
                "parsed_components": parsed,
                "tasks": [asdict(task) for task in tasks],
                "estimated_complexity": self._estimate_complexity(parsed),
                "suggested_approach": self._suggest_approach(parsed),
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "requirement": requirement_text
            }
    
    def generate_code(self, task_spec: Dict[str, Any]) -> CodeGenerationResult:
        """
        Generate code implementation based on task specification.
        
        Args:
            task_spec: Task specification including requirements and constraints
            
        Returns:
            CodeGenerationResult with generated code and metadata
        """
        start_time = datetime.now()
        
        try:
            # Validate task specification
            if not self._validate_task_spec(task_spec):
                return CodeGenerationResult(
                    success=False,
                    code=None,
                    files_created=[],
                    error="Invalid task specification",
                    execution_time=0.0
                )
            
            # Generate code based on task type
            generated_files = {}
            task_type = task_spec.get('type', 'module')
            
            if task_type == 'module':
                generated_files = self._generate_module(task_spec)
            elif task_type == 'skill':
                generated_files = self._generate_skill(task_spec)
            elif task_type == 'plugin':
                generated_files = self._generate_plugin(task_spec)
            elif task_type == 'test':
                generated_files = self._generate_tests(task_spec)
            else:
                return CodeGenerationResult(
                    success=False,
                    code=None,
                    files_created=[],
                    error=f"Unknown task type: {task_type}",
                    execution_time=(datetime.now() - start_time).total_seconds()
                )
            
            # Apply code style and security checks
            for filename, content in generated_files.items():
                if not self._security_check(content):
                    return CodeGenerationResult(
                        success=False,
                        code=None,
                        files_created=[],
                        error=f"Security violation detected in {filename}",
                        execution_time=(datetime.now() - start_time).total_seconds()
                    )
                
                generated_files[filename] = self._apply_code_style(content)
            
            # Save to sandbox
            files_created = []
            if self.sandbox_path:
                files_created = self._save_to_sandbox(generated_files)
            
            # Log the generation
            self._log_programming(
                requirement=str(task_spec),
                code=str(generated_files),
                validation_result={"code_generated": True},
                success=True,
                metadata={"task_spec": task_spec}
            )
            
            return CodeGenerationResult(
                success=True,
                code=json.dumps(generated_files, indent=2),
                files_created=files_created,
                error=None,
                execution_time=(datetime.now() - start_time).total_seconds()
            )
            
        except Exception as e:
            return CodeGenerationResult(
                success=False,
                code=None,
                files_created=[],
                error=str(e),
                execution_time=(datetime.now() - start_time).total_seconds()
            )
    