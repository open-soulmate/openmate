import ast
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# 假设BaseSkill已经定义，这里需要根据实际项目调整导入
from .base_skill import BaseSkill


@dataclass
class TaskSpec:
    """任务规格数据类"""
    task_id: str
    description: str
    language: str = "python"
    framework: Optional[str] = None
    input_data: Optional[Dict[str, Any]] = None
    expected_output: Optional[Dict[str, Any]] = None
    constraints: Optional[Dict[str, Any]] = None


@dataclass
class ValidationResult:
    """验证结果数据类"""
    is_valid: bool
    syntax_valid: bool
    test_results: Optional[Dict[str, Any]] = None
    security_issues: List[str] = field(default_factory=list)
    error_message: Optional[str] = None


@dataclass
class DeploymentResult:
    """部署结果数据类"""
    success: bool
    file_path: str
    timestamp: str
    backup_path: Optional[str] = None
    error_message: Optional[str] = None


@dataclass
class Milestone:
    """里程碑数据类"""
    id: str
    description: str
    progress: float = 0.0
    completed: bool = False
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    dependencies: List[str] = field(default_factory=list)


@dataclass
class ProgrammingRecord:
    """自编程记录数据类"""
    record_id: str
    timestamp: str
    requirement: str
    generated_code: Optional[str] = None
    validation_result: Optional[Dict[str, Any]] = None
    deployment_result: Optional[Dict[str, Any]] = None
    success: bool = False
    reason: Optional[str] = None
    duration: Optional[float] = None


class SelfProgrammerSkill(BaseSkill):
    """
    自编程能力技能实现
    支持agent根据需求自动生成、测试和部署代码
    """
    
    # 危险操作模式列表（用于静态分析）
    DANGEROUS_PATTERNS = [
        r"os\.remove\s*\(",
        r"shutil\.rmtree\s*\(",
        r"subprocess\.(?:run|call|Popen)\s*\(",
        r"requests\.post\s*\(",
        r"urllib\.request\.urlopen\s*\(",
        r"socket\.connect\s*\(",
        r"__import__\s*\(",
        r"exec\s*\(",
        r"eval\s*\(",
        r"compile\s*\(",
        r"open\s*\(.+['\"]w['\"]",
        r"open\s*\(.+['\"]a['\"]"
    ]
    
    def __init__(self, config: Dict[str, Any] = None):
        """初始化自编程技能"""
        super().__init__(name="self_programmer", description="自编程能力技能")
        self.logger = logging.getLogger(__name__)
        self.config = config or {}
        
        # 初始化路径配置
        self.project_root = Path(self.config.get("project_root", "."))
        self.sandbox_dir = Path(self.config.get("sandbox_dir", "/tmp/acp_sandbox"))
        self.backup_dir = Path(self.config.get("backup_dir", "/tmp/acp_backups"))
        self.log_dir = Path(self.config.get("log_dir", "/tmp/acp_logs"))
        
        # 创建必要目录
        self._create_directories()
        
        # 初始化里程碑追踪器
        self.milestones: Dict[str, Milestone] = {}
        self.current_milestone_id: Optional[str] = None
        
        # 初始化编程记录
        self.programming_records: List[ProgrammingRecord] = []
        
        # 加载代码模板和规范
        self._load_code_standards()
        
    def _create_directories(self):
        """创建必要的目录结构"""
        directories = [self.sandbox_dir, self.backup_dir, self.log_dir]
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
            
    def _load_code_standards(self):
        """加载项目代码规范和模板"""
        self.code_standards = {
            "python": {
                "max_line_length": 100,
                "indent_size": 4,
                "docstring_style": "google",
                "type_hints": True,
                "line_ending": "\n",
                "encoding": "utf-8"
            },
            "file_structure": {
                "skills": "acp-proxy/skills/",
                "plugins": "acp-proxy/plugins/",
                "tests": "tests/",
                "docs": "docs/"
            }
        }
        
    def analyze_requirement(self, requirement_text: str) -> Dict[str, Any]:
        """
        解析功能需求，拆解为可执行的编程任务
        
        Args:
            requirement_text: 功能需求描述文本
            
        Returns:
            分析结果字典，包含任务列表和优先级
        """
        self.logger.info(f"分析需求: {requirement_text[:100]}...")
        
        # 这里可以集成NLP或规则引擎来解析需求
        # 简化实现：通过关键词匹配拆解任务
        tasks = []
        
        # 解析关键词
        if "函数" in requirement_text or "function" in requirement_text:
            tasks.append({
                "type": "function",
                "description": requirement_text,
                "priority": "high",
                "estimated_complexity": self._estimate_complexity(requirement_text)
            })
            
        if "类" in requirement_text or "class" in requirement_text:
            tasks.append({
                "type": "class",
                "description": requirement_text,
                "priority": "high",
                "estimated_complexity": self._estimate_complexity(requirement_text)
            })
            
        if "测试" in requirement_text or "test" in requirement_text:
            tasks.append({
                "type": "test",
                "description": requirement_text,
                "priority": "medium",
                "estimated_complexity": self._estimate_complexity(requirement_text)
            })
            
        # 如果没有特定关键词，创建通用任务
        if not tasks:
            tasks.append({
                "type": "module",
                "description": requirement_text,
                "priority": "medium",
                "estimated_complexity": self._estimate_complexity(requirement_text)
            })
            
        analysis_result = {
            "original_requirement": requirement_text,
            "task_count": len(tasks),
            "tasks": tasks,
            "analysis_timestamp": datetime.now().isoformat(),
            "suggested_approach": self._suggest_approach(tasks)
        }
        
        self.logger.info(f"需求分析完成，生成 {len(tasks)} 个任务")
        return analysis_result
    
    def _estimate_complexity(self, requirement_text: str) -> str:
        """估算需求复杂度"""
        word_count = len(requirement_text.split())