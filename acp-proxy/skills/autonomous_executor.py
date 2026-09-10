"""
自主执行技能模块 (Autonomous Executor Skill Module)

解决核心问题：agent当前完全依赖外部partner执行，无法将规划转化为行动。
这是实现自编程能力和工具创造能力的基础。

作者: MiMo-v2.5-pro
版本: 0.1.0
"""

import ast
import hashlib
import json
import logging
import os
import time
import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Optional,
    Set,
    Tuple,
    TypedDict,
    Union,
)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("autonomous_executor")


# =============================================================================
# 配置常量
# =============================================================================

class Config:
    """模块配置，支持环境变量覆盖"""
    
    # 路径配置
    SKILLS_DIR: str = os.getenv("ACP_SKILLS_DIR", "acp-proxy/skills")
    OBSERVATIONS_DIR: str = os.getenv("ACP_OBSERVATIONS_DIR", "acp-proxy/observations")
    WORKSPACE_DIR: str = os.getenv("ACP_WORKSPACE_DIR", "acp-proxy/workspace")
    ERROR_LOG_PATH: str = os.getenv("ACP_ERROR_LOG", "acp-proxy/logs/error.json")
    
    # 执行配置
    MAX_RETRY_COUNT: int = int(os.getenv("ACP_MAX_RETRY_COUNT", "3"))
    MAX_CONCURRENT_TASKS: int = int(os.getenv("ACP_MAX_CONCURRENT_TASKS", "5"))
    CYCLE_INTERVAL: int = int(os.getenv("ACP_CYCLE_INTERVAL", "60"))
    
    # 安全配置
    ENABLED_OPERATIONS: Set[str] = {
        "file_create",
        "file_modify",
        "skill_create",
        "plugin_create",
        "code_generate",
    }
    RESTRICTED_MODULES: Set[str] = {"subprocess", "os.system", "eval", "exec"}
    
    @classmethod
    def ensure_directories(cls) -> None:
        """确保所有必要的目录存在"""
        for dir_path in [cls.SKILLS_DIR, cls.OBSERVATIONS_DIR, cls.WORKSPACE_DIR]:
            Path(dir_path).mkdir(parents=True, exist_ok=True)


# =============================================================================
# 数据结构定义
# =============================================================================


class Priority(str, Enum):
    """任务优先级枚举"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskStatus(str, Enum):
    """任务状态枚举"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    ROLLED_BACK = "rolled_back"


class OperationType(str, Enum):
    """操作类型枚举"""
    FILE_CREATE = "file_create"
    FILE_MODIFY = "file_modify"
    FILE_DELETE = "file_delete"
    SKILL_CREATE = "skill_create"
    PLUGIN_CREATE = "plugin_create"
    CODE_GENERATE = "code_generate"
    UNKNOWN = "unknown"


@dataclass
class Observation:
    """观察数据结构"""
    id: str
    timestamp: str
    content: str
    source: str = "unknown"
    metadata: Dict[str, Any] = field(default_factory=dict)
    analyzed: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Observation":
        """从字典创建实例"""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class ActionItem:
    """可执行任务项"""
    id: str
    description: str
    operation_type: OperationType
    parameters: Dict[str, Any] = field(default_factory=dict)
    source_observation_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        result = asdict(self)
        result["operation_type"] = self.operation_type.value
        return result


@dataclass
class Task:
    """执行任务数据结构"""
    id: str
    name: str
    description: str
    priority: Priority = Priority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING
    operation_type: OperationType = OperationType.UNKNOWN
    parameters: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    retry_count: int = 0
    max_retries: int = 3
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    rollback_info: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        result = asdict(self)
        result["priority"] = self.priority.value
        result["status"] = self.status.value
        result["operation_type"] = self.operation_type.value
        return result
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Task":
        """从字典创建实例"""
        data = data.copy()
        if "priority" in data:
            data["priority"] = Priority(data["priority"])
        if "status" in data:
            data["status"] = TaskStatus(data["status"])
        if "operation_type" in data:
            data["operation_type"] = OperationType(data["operation_type"])
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class SkillConfig:
    """技能配置数据结构"""
    name: str
    description: str
    version: str = "0.1.0"
    author: str = "autonomous_executor"
    entry_point: str = "main"
    dependencies: List[str] = field(default_factory=list)
    parameters: Dict[str, Any] = field(default_factory=dict)
    status: str = "active"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)


@dataclass
class ExecutionReport:
    """执行状态报告"""
    cycle_id: str
    start_time: str
    end_time: Optional[str] = None
    observations_analyzed: int = 0
    tasks_extracted: int = 0
    tasks_executed: int = 0
    tasks_succeeded: int = 0
    tasks_failed: int = 0
    tasks_retried: int = 0
    errors: List[str] = field(default_factory=list)
    details: List[Dict[str, Any]] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return asdict(self)


# =============================================================================
# ObservationAnalyzer 类
# =============================================================================


class ObservationAnalyzer:
    """
    观察分析器
    
    负责读取、分析观察内容，提取可执行的任务项，
    并根据进化目标对任务进行优先级排序。
    """
    
    def __init__(self, observations_dir: Optional[str] = None) -> None:
        """
        初始化观察分析器
        
        Args:
            observations_dir: 观察数据目录路径
        """
        self.observations_dir = Path(observations_dir or Config.OBSERVATIONS_DIR)
        self.observations_dir.mkdir(parents=True, exist_ok=True)
        self._unanalyzed_file = self.observations_dir / "observations_unanalyzed.json"
        self._analyzed_file = self.observations_dir / "observations_analyzed.json"
        logger.info(f"ObservationAnalyzer 初始化完成，目录: {self.observations_dir}")
    
    def _load_observations(self, file_path: Path) -> List[Observation]:
        """
        从文件加载观察数据
        
        Args:
            file_path: 观察数据文件路径
            
        Returns:
            观察列表
        """