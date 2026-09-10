# acp-proxy/skills/self_programmer.py

from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from pathlib import Path
import ast
import re
import json
import hashlib
from enum import Enum
from dataclasses import dataclass, field
from abc import ABC, abstractmethod

from .base_skill import BaseSkill
from ..utils.sandbox import CodeSandbox
from ..utils.file_system import FileSystem
from ..utils.code_analyzer import CodeAnalyzer, SecurityLevel
from ..utils.logger import get_logger


class TaskStatus(Enum):
    PENDING = "pending"
    ANALYZING = "analyzing"
    GENERATING = "generating"
    VALIDATING = "validating"
    DEPLOYING = "deploying"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TaskSpec:
    task_id: str
    description: str
    requirements: List[str]
    constraints: List[str] = field(default_factory=list)
    test_specs: List[str] = field(default_factory=list)
    priority: int = 1
    estimated_complexity: int = 1  # 1-10 scale


@dataclass
class CodeArtifact:
    code: str
    file_path: str
    language: str
    checksum: str
    created_at: datetime = field(default_factory=datetime.now)
    test_results: Dict[str, Any] = field(default_factory=dict)
    security_analysis: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ProgrammingSession:
    session_id: str
    requirement_text: str
    task_specs: List[TaskSpec]
    generated_artifacts: List[CodeArtifact]
    status: TaskStatus
    start_time: datetime
    end_time: Optional[datetime] = None
    success_rate: float = 0.0
    errors: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)


class SelfProgrammerSkill(BaseSkill):
    """
    自编程能力技能，支持agent根据需求自动生成、测试和部署代码。
    """
    
    # 危险操作模式列表
    DANGEROUS_PATTERNS = [
        r'\b(os\.system|subprocess\.call|subprocess\.Popen)\b',  # 命令执行
        r'\b(os\.remove|os\.unlink|shutil\.rmtree)\b',  # 文件删除
        r'\b(requests\.get|urllib\.urlopen|http\.client)\b',  # 网络外联
        r'\b(open\(.*w.*\).*\.write)\b',  # 写入文件
        r'\b(eval|exec|compile)\b',  # 代码执行
        r'\b(import\s+socket|socket\.socket)\b',  # 套接字操作
        r'\b(os\.environ|env\s*=\s*os\.environ)\b',  # 环境变量访问
        r'\b(sys\.modules|__import__)\b',  # 动态导入
    ]
    
    # 里程碑定义
    MILESTONES = {
        "basic_loop": {
            "description": "实现一个简单功能闭环",
            "progress_increment": 1.0,
            "validation": lambda session: len(session.task_specs) >= 1 and session.success_rate >= 0.5
        },
        "self_test": {
            "description": "生成的代码能够自我测试",
            "progress_increment": 2.0,
            "validation": lambda session: any(artifact.test_results.get("success", False) for artifact in session.generated_artifacts)
        },
        "deploy_integration": {
            "description": "代码能够部署到系统并集成",
            "progress_increment": 3.0,
            "validation": lambda session: any(artifact.file_path.endswith('.py') for artifact in session.generated_artifacts)
        },
        "error_recovery": {
            "description": "能够处理生成代码中的错误",
            "progress_increment": 4.0,
            "validation": lambda session: len(session.errors) > 0 and session.success_rate >= 0.3
        },
        "complex_function": {
            "description": "实现一个复杂功能",
            "progress_increment": 5.0,
            "validation": lambda session: any(task.estimated_complexity >= 5 for task in session.task_specs)
        }
    }
    
    def __init__(self, sandbox: CodeSandbox, file_system: FileSystem, code_analyzer: CodeAnalyzer, 
                 workspace_path: str, max_retries: int = 3, timeout: int = 30):
        """
        初始化自编程技能
        
        Args:
            sandbox: 代码执行沙箱环境
            file_system: 文件系统访问接口
            code_analyzer: 代码静态分析器
            workspace_path: 工作空间路径
            max_retries: 最大重试次数
            timeout: 执行超时时间（秒）
        """
        super().__init__(name="self_programmer", description="自编程能力技能")
        
        self.sandbox = sandbox
        self.file_system = file_system
        self.code_analyzer = code_analyzer
        self.workspace_path = Path(workspace_path)
        self.max_retries = max_retries
        self.timeout = timeout
        self.logger = get_logger(__name__)
        
        # 确保必要的目录存在
        self.skills_path = self.workspace_path / "skills"
        self.plugins_path = self.workspace_path / "plugins"
        self.skills_path.mkdir(parents=True, exist_ok=True)
        self.plugins_path.mkdir(parents=True, exist_ok=True)
        
        # 会话记录
        self.sessions: List[ProgrammingSession] = []
        self.current_milestones: Dict[str, float] = {key: 0.0 for key in self.MILESTONES}
        
    def analyze_requirement(self, requirement_text: str) -> List[TaskSpec]:
        """
        解析功能需求，拆解为可执行的编程任务
        
        Args:
            requirement_text: 功能需求描述文本
            
        Returns:
            List[TaskSpec]: 拆解后的任务规格列表
        """
        self.logger.info(f"分析需求: {requirement_text[:100]}...")
        
        # 简单的自然语言解析（实际应用中可能需要更复杂的NLP）
        tasks = []
        
        # 按句拆分需求
        sentences = re.split(r'[.!?。！？]', requirement_text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        for i, sentence in enumerate(sentences):
            # 生成任务ID
            task_id = hashlib.md5(f"{requirement_text}_{i}".encode()).hexdigest()[:8]
            
            # 估算复杂度