"""
AutoAnalysisAndImprovementTrigger - 自动分析与改进触发技能

核心目的：
1. 及时处理未分析的观察记录
2. 确保每个进化周期至少产生一项改进，避免零改进周期
3. 提升Agent的自我执行能力，减少对partner的依赖
4. 直接推动'自编程能力'和'错误自修复'目标的进展

触发方式：在 evolution_planner 的规划阶段自动触发
"""

import os
import json
import time
import logging
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass, field, asdict
from collections import defaultdict

logger = logging.getLogger(__name__)


@dataclass
class ImprovementProposal:
    """改进提案数据结构"""
    id: str = ""
    type: str = ""  # 'skill_creation', 'skill_enhancement', 'plugin_creation', 'plugin_enhancement', 'system_optimization'
    category: str = ""  # 'self_programming', 'error_recovery', 'performance', 'capability_expansion'
    target_file: str = ""
    target_name: str = ""
    description: str = ""
    requirements: List[str] = field(default_factory=list)
    expected_impact: str = ""
    priority: int = 5  # 1-10, higher = more important
    estimated_effort: str = "medium"  # 'small', 'medium', 'large'
    source: str = "auto_analysis_trigger"  # 来源标记
    related_goals: List[str] = field(default_factory=list)
    related_observations: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AnalysisResult:
    """分析结果数据结构"""
    observation_count: int = 0
    patterns_found: List[Dict[str, Any]] = field(default_factory=list)
    actionable_suggestions: List[str] = field(default_factory=list)
    error_patterns: List[Dict[str, Any]] = field(default_factory=list)
    improvement_proposals: List[ImprovementProposal] = field(default_factory=list)


class AutoAnalysisAndImprovementTrigger:
    """
    自动分析与改进触发器技能
    
    此技能相当于为Agent植入一个'自我监督和驱动'的子系统。
    它在每个进化周期的规划阶段被触发，确保：
    - 未分析的观察记录得到及时处理
    - 每个周期至少产生一项改进
    - 改进与当前目标和问题紧密相关
    """
    
    # 配置常量
    MIN_IMPROVEMENTS_PER_CYCLE = 1
    MAX_IMPROVEMENTS_PER_CYCLE = 3
    OBSERVATION_ANALYSIS_BATCH_SIZE = 10
    LOW_PROGRESS_THRESHOLD = 0.3  # 进度低于30%认为是低进度
    
    # 改进类型优先级映射
    IMPROVEMENT_TYPE_PRIORITY = {
        'error_recovery': 9,
        'self_programming': 8,
        'system_optimization': 7,
        'capability_expansion': 6,
        'performance': 5,
        'documentation': 3,
        'refactoring': 4,
    }
    
    # 目标到改进类型的映射
    GOAL_TO_IMPROVEMENT_TYPE = {
        '自编程': ['self_programming', 'capability_expansion'],
        '错误自修复': ['error_recovery', 'system_optimization'],
        '性能优化': ['performance', 'system_optimization'],
        '能力扩展': ['capability_expansion', 'skill_creation'],
    }
    
    # 已知的技能/插件模式
    KNOWN_PATTERNS = {
        'error_recovery': {
            'keywords': ['error', 'exception', 'failure', 'crash', 'bug', 'retry', 'fallback'],
            'suggested_modules': ['auto_diagnosis', 'log_pattern_analyzer', 'recovery_strategies'],
            'file_template': 'acp-proxy/plugins/{name}/__init__.py'
        },
        'self_programming': {
            'keywords': ['code', 'generate', 'template', 'scaffold', 'refactor', 'optimize'],
            'suggested_modules': ['code_generator', 'template_engine', 'code_optimizer'],
            'file_template': 'acp-proxy/skills/{name}.py'
        },
        'performance': {
            'keywords': ['slow', 'timeout', 'memory', 'cpu', 'cache', 'optimize', 'benchmark'],
            'suggested_modules': ['profiler', 'cache_manager', 'resource_monitor'],
            'file_template': 'acp-proxy/skills/{name}.py'
        },
        'memory': {
            'keywords': ['memory', 'recall', 'forget', 'consolidate', 'context', 'history'],
            'suggested_modules': ['consolidation_optimizer', 'relevance_scorer', 'memory_pruner'],
            'file_template': 'acp-proxy/skills/{name}.py'
        }
    }
    
    def __init__(self, base_path: str = None, config: Dict[str, Any] = None):
        """
        初始化自动分析与改进触发器
        
        Args:
            base_path: 项目基础路径，默认为当前工作目录
            config: 可选配置覆盖
        """
        self.base_path = Path(base_path) if base_path else Path.cwd()
        self.skills_path = self.base_path / "acp-proxy" / "skills"
        self.plugins_path = self.base_path / "acp-proxy" / "plugins"
        self.state_path = self.base_path / "acp-proxy" / "state"
        
        # 配置参数
        self.config = config or {}
        self.min_improvements = self.config.get('min_improvements', self.MIN_IMPROVEMENTS_PER_CYCLE)
        self.max_improvements = self.config.get('max_improvements', self.MAX_IMPROVEMENTS_PER_CYCLE)
        self.analysis_batch_size = self.config.get('analysis_batch_size', self.OBSERVATION_ANALYSIS_BATCH_SIZE)
        self.low_progress_threshold = self.config.get('low_progress_threshold', self.LOW_PROGRESS_THRESHOLD)
        
        # 内部状态
        self._existing_skills: List[str] = []
        self._existing_plugins: List[str] = []
        self._recent_proposals: List[str] = []  # 最近提案的ID，用于避免重复
        self._cycle_cache: Dict[str, Any] = {}
        
        # 初始化扫描
        self._scan_existing_capabilities()
        
        logger.info(f"AutoAnalysisAndImprovementTrigger initialized at {self.base_path}")
    
    def _scan_existing_capabilities(self) -> None:
        """扫描现有的技能和插件"""
        self._existing_skills = self._scan_directory(self.skills_path, pattern="*.py")
        self._existing_plugins = self._scan_directory(self.plugins_path, pattern="__init__.py", return_parent=True)
        
        logger.debug(f"Scanned capabilities: {len(self._existing_skills)} skills, {len(self._existing_plugins)} plugins")
    
    def _scan_directory(self, path: Path, pattern: str = "*.py", return_parent: bool = False) -> List[str]:
        """
        扫描目录获取文件列表
        
        Args:
            path: 目录路径
            pattern: 文件匹配模式
            return_parent: 是否返回父目录名（用于插件）
        
        Returns:
            文件/目录名列表
        """
        results = []
        if path.exists():
            for item in path.rglob(pattern):
                if return_parent:
                    results.append(item.parent.name)
                else:
                    # 转换为相对于skills_path的路径
                    try:
                        rel_path = item.relative_to(path)
                        results.append(str(rel_path).replace(os.sep, '/'))
                    except ValueError:
                        results.append(item.name)
        # 去重
        return list(set(results))
    