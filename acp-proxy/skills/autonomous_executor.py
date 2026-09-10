"""
自主执行技能模块 - Autonomous Executor Skill

解决核心问题：agent当前完全依赖外部partner执行，无法将规划转化为行动，核心模块为空。
这是实现自编程能力（进度1%→目标）和工具创造能力（进度1%→目标）的基础。

主要功能：
1. 观察分析 - 分析未处理的观察数据，提取可执行任务
2. 任务执行 - 安全执行提取的任务，支持代码生成、文件创建、技能创建
3. 代码生成 - 生成技能和插件的代码骨架
4. 技能管理 - 管理技能的注册、列表和状态
5. 自主循环 - 运行完整的自主执行周期

数据结构：
- Task: 可执行任务的数据结构
- Observation: 观察数据的数据结构  
- SkillConfig: 技能配置的数据结构
- ExecutionResult: 执行结果的数据结构

错误处理：
- 所有外部调用包裹在try-except中
- 失败的任务进入retry_queue（最多重试3次）
- 严重错误触发error_report机制

接口约束：
- 导出main()函数作为插件入口
- 所有公开方法提供docstring
- 类型注解覆盖所有函数签名

依赖：Python 3.10+标准库
"""

import logging
import json
import pathlib
import ast
import hashlib
import time
import os
import sys
from typing import Dict, List, Optional, Any, Tuple, Union
from dataclasses import dataclass, field
from enum import Enum
import traceback

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TaskPriority(Enum):
    """任务优先级枚举"""
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4


class TaskType(Enum):
    """任务类型枚举"""
    CODE_GENERATION = "code_generation"
    FILE_CREATION = "file_creation"
    SKILL_CREATION = "skill_creation"
    PLUGIN_CREATION = "plugin_creation"
    CONFIGURATION = "configuration"
    ANALYSIS = "analysis"


@dataclass
class Observation:
    """观察数据结构"""
    id: str
    content: str
    source: str
    timestamp: float = field(default_factory=time.time)
    processed: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Task:
    """可执行任务的数据结构"""
    id: str
    type: TaskType
    priority: TaskPriority
    description: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    retry_count: int = 0
    max_retries: int = 3
    status: str = "pending"
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@dataclass
class SkillConfig:
    """技能配置的数据结构"""
    name: str
    description: str
    version: str = "1.0.0"
    author: str = "AutonomousExecutor"
    enabled: bool = True
    dependencies: List[str] = field(default_factory=list)
    parameters: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


@dataclass
class ExecutionResult:
    """执行结果的数据结构"""
    success: bool
    output: Any = None
    error: Optional[str] = None
    execution_time: float = 0.0
    warnings: List[str] = field(default_factory=list)


@dataclass
class ErrorReport:
    """错误报告的数据结构"""
    timestamp: float = field(default_factory=time.time)
    error_type: str
    error_message: str
    traceback: str
    context: Dict[str, Any] = field(default_factory=dict)


class ObservationAnalyzer:
    """观察分析器：分析观察数据并提取可执行任务"""
    
    def __init__(self, observations_dir: Optional[pathlib.Path] = None):
        """
        初始化观察分析器
        
        Args:
            observations_dir: 观察数据存储目录路径
        """
        self.observations_dir = observations_dir or pathlib.Path("./observations")
        self.observations: List[Observation] = []
        self.load_observations()
    
    def load_observations(self) -> None:
        """加载未分析的观察数据"""
        try:
            if not self.observations_dir.exists():
                self.observations_dir.mkdir(parents=True, exist_ok=True)
                logger.info(f"创建观察目录: {self.observations_dir}")
                return
            
            observations_file = self.observations_dir / "observations_unanalyzed.json"
            if observations_file.exists():
                with open(observations_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for obs_data in data:
                        obs = Observation(
                            id=obs_data['id'],
                            content=obs_data['content'],
                            source=obs_data['source'],
                            timestamp=obs_data.get('timestamp', time.time()),
                            processed=obs_data.get('processed', False),
                            metadata=obs_data.get('metadata', {})
                        )
                        self.observations.append(obs)
                logger.info(f"加载了 {len(self.observations)} 个观察数据")
        except Exception as e:
            logger.error(f"加载观察数据失败: {e}")
            self._create_error_report("observation_load_error", str(e))
    
    def save_observations(self) -> None:
        """保存观察数据到文件"""
        try:
            observations_file = self.observations_dir / "observations_unanalyzed.json"
            observations_data = []
            for obs in self.observations:
                observations_data.append({
                    'id': obs.id,
                    'content': obs.content,
                    'source': obs.source,
                    'timestamp': obs.timestamp,
                    'processed': obs.processed,
                    'metadata': obs.metadata
                })
            
            with open(observations_file, 'w', encoding='utf-8') as f:
                json.dump(observations_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"保存了 {len(observations_data)} 个观察数据")
        except Exception as e:
            logger.error(f"保存观察数据失败: {e}")
            self._create_error_report("observation_save_error", str(e))
    
    def analyze_pending(self) -> List[Observation]:
        """
        分析待处理的观察数据
        
        Returns:
            结构化后的观察数据列表
        """
        try:
            pending_observations = []
            for obs in self.observations:
                if not obs.processed:
                    # 对观察内容进行基础分析
                    analyzed_content = self._analyze_content(obs.content)
                    obs.metadata['analysis'] = analyzed_content
                    obs.processed = True
                    pending_observations.append(obs)
            
            # 保存更新后的观察数据
            self.save_observations()
            
            logger.info(f"分析了 {len(pending_observations)} 个待处理观察")
            return pending_observations
            
        except Exception as e:
            logger.error(f"分析观察数据失败: {e}")
            self._create_error_report("observation_analysis_error", str(e))
            return []
    
    def _analyze_content(self, content: str) -> Dict[str, Any]:
        """
        分析观察内容
        
        Args:
            content: 观察内容文本
            
        Returns:
            分析结果字典
        """
        analysis = {
            'length': len(content),
            'keywords': self._extract_keywords(content),
            'sentiment': self._analyze_sentiment(content),
            'potential_actions': self._identify_actions(content)
        }
        return analysis
    
    def _extract_keywords(self, text: str) -> List[str]:
        """从文本中提取关键词"""
        # 简单的关键词提取（实际应用中可以使用更复杂的NLP方法）
        keywords = []