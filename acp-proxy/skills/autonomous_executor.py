# acp-proxy/skills/autonomous_executor.py
"""
自主执行技能模块
解决核心问题：agent当前完全依赖外部partner执行，无法将规划转化为行动
这是实现自编程能力和工具创造能力的基础
"""

import ast
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class Task:
    """任务数据结构"""
    id: str
    name: str
    description: str
    priority: str  # critical, high, medium, low
    action_type: str  # code_generation, file_creation, skill_creation
    parameters: Dict[str, Any]
    status: str = "pending"  # pending, running, completed, failed
    created_at: float = None
    completed_at: Optional[float] = None
    error: Optional[str] = None
    retry_count: int = 0

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = time.time()


@dataclass
class Observation:
    """观察数据结构"""
    id: str
    content: str
    source: str
    timestamp: float
    analyzed: bool = False
    action_items: List[str] = None

    def __post_init__(self):
        if self.action_items is None:
            self.action_items = []


@dataclass
class SkillConfig:
    """技能配置数据结构"""
    name: str
    description: str
    version: str = "1.0.0"
    requirements: List[str] = None
    entry_point: str = "main"
    enabled: bool = True

    def __post_init__(self):
        if self.requirements is None:
            self.requirements = []


class ObservationAnalyzer:
    """观察分析器，负责分析观察内容并提取可执行任务"""

    def __init__(self, observations_dir: str = "observations"):
        """
        初始化观察分析器
        
        Args:
            observations_dir: 观察数据目录
        """
        self.observations_dir = Path(observations_dir)
        self.observations_dir.mkdir(exist_ok=True)
        self.unanalyzed_file = self.observations_dir / "observations_unanalyzed.json"
        self.analyzed_file = self.observations_dir / "observations_analyzed.json"

    def analyze_pending(self) -> List[Observation]:
        """
        读取并分析observations_unanalyzed，将观察内容结构化
        
        Returns:
            List[Observation]: 分析后的观察列表
        """
        observations = []
        
        try:
            if not self.unanalyzed_file.exists():
                logger.info("未找到待分析的观察文件")
                return observations
                
            with open(self.unanalyzed_file, 'r', encoding='utf-8') as f:
                raw_data = json.load(f)
                
            for obs_data in raw_data:
                obs = Observation(
                    id=obs_data.get('id', str(hashlib.md5(str(obs_data).encode()).hexdigest())),
                    content=obs_data.get('content', ''),
                    source=obs_data.get('source', 'unknown'),
                    timestamp=obs_data.get('timestamp', time.time())
                )
                observations.append(obs)
                
            logger.info(f"分析了 {len(observations)} 个待处理的观察")
            
        except Exception as e:
            logger.error(f"分析观察时出错: {e}")
            
        return observations

    def extract_action_items(self, observation: Observation) -> List[str]:
        """
        从观察中提取可执行的任务项
        
        Args:
            observation: 观察数据
            
        Returns:
            List[str]: 提取的任务项列表
        """
        action_items = []
        
        try:
            content = observation.content.lower()
            
            # 简单的关键字提取逻辑
            action_keywords = [
                "创建", "生成", "实现", "开发", "修复", "优化", "添加",
                "create", "generate", "implement", "develop", "fix", "optimize", "add"
            ]
            
            for keyword in action_keywords:
                if keyword in content:
                    action_items.append(f"action_keyword: {keyword}")
                    
            # 识别具体的任务类型
            if "技能" in content or "skill" in content:
                action_items.append("skill_creation")
            if "代码" in content or "code" in content:
                action_items.append("code_generation")
            if "文件" in content or "file" in content:
                action_items.append("file_creation")
                
            observation.action_items = action_items
            observation.analyzed = True
            
            logger.info(f"从观察 {observation.id} 提取了 {len(action_items)} 个任务项")
            
        except Exception as e:
            logger.error(f"提取任务项时出错: {e}")
            
        return action_items

    def prioritize_tasks(self, tasks: List[Task]) -> List[Task]:
        """
        根据进化目标优先级排序任务（critical > high > medium > low）
        
        Args:
            tasks: 任务列表
            
        Returns:
            List[Task]: 排序后的任务列表
        """