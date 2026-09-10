"""
autonomous_executor.py - 自主执行技能模块
解决agent完全依赖外部partner执行的问题，实现自编程和工具创造能力
"""

import ast
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class Observation:
    """观察数据结构"""
    id: str
    content: str
    timestamp: float
    source: str = "unknown"
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Task:
    """任务数据结构"""
    id: str
    name: str
    description: str
    priority: str = "medium"  # critical, high, medium, low
    status: str = "pending"  # pending, running, completed, failed
    observations: List[str] = field(default_factory=list)
    parameters: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    retry_count: int = 0
    error: Optional[str] = None


@dataclass
class SkillConfig:
    """技能配置数据结构"""
    name: str
    description: str
    version: str = "1.0.0"
    author: str = "unknown"
    entry_point: str = "main"
    requirements: List[str] = field(default_factory=list)
    parameters: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    status: str = "active"


@dataclass
class ExecutionResult:
    """执行结果数据结构"""
    task_id: str
    success: bool
    result: Any = None
    error: Optional[str] = None
    execution_time: float = 0.0
    timestamp: float = field(default_factory=time.time)


class ObservationAnalyzer:
    """观察分析器，用于分析未处理的观察数据"""
    
    def __init__(self, observations_path: str = None):
        """
        初始化观察分析器
        
        Args:
            observations_path: 观察数据文件路径
        """
        self.observations_path = observations_path or os.getenv(
            'OBSERVATIONS_FILE', 'observations_unanalyzed.json'
        )
        self.logger = logging.getLogger(f"{__name__}.ObservationAnalyzer")
    
    def analyze_pending(self) -> List[Observation]:
        """
        读取并分析 observations_unanalyzed，将观察内容结构化
        
        Returns:
            结构化后的观察列表
        """
        try:
            observations_file = Path(self.observations_path)
            if not observations_file.exists():
                self.logger.warning(f"观察文件不存在: {observations_file}")
                return []
            
            with open(observations_file, 'r', encoding='utf-8') as f:
                raw_observations = json.load(f)
            
            observations = []
            for i, raw in enumerate(raw_observations):
                try:
                    # 生成唯一ID
                    obs_id = f"obs_{int(time.time())}_{hashlib.md5(str(raw).encode()).hexdigest()[:8]}"
                    
                    # 创建观察对象
                    observation = Observation(
                        id=obs_id,
                        content=raw.get('content', str(raw)),
                        timestamp=raw.get('timestamp', time.time()),
                        source=raw.get('source', 'unknown'),
                        metadata=raw.get('metadata', {})
                    )
                    observations.append(observation)
                except Exception as e:
                    self.logger.error(f"处理观察 {i} 时出错: {e}")
            
            self.logger.info(f"成功分析 {len(observations)} 条观察")
            return observations
            
        except json.JSONDecodeError as e:
            self.logger.error(f"JSON解析错误: {e}")
            return []
        except Exception as e:
            self.logger.error(f"分析观察时出错: {e}")
            return []
    
    def extract_action_items(self, observations: List[Observation]) -> List[Task]:
        """
        从观察中提取可执行的任务项
        
        Args:
            observations: 观察列表
            
        Returns:
            提取的任务列表
        """
        tasks = []
        
        for obs in observations:
            try:
                # 这里可以添加更复杂的任务提取逻辑
                # 目前使用简单的关键词匹配
                content = obs.content.lower()
                
                # 根据内容判断任务类型
                if "创建" in content or "生成" in content:
                    task_type = "create"
                elif "修改" in content or "更新" in content:
                    task_type = "update"
                elif "删除" in content or "移除" in content:
                    task_type = "delete"
                else:
                    task_type = "analyze"
                
                # 创建任务
                task_id = f"task_{int(time.time())}_{hashlib.md5(content.encode()).hexdigest()[:8]}"
                task = Task(
                    id=task_id,
                    name=f"{task_type}_from_obs_{obs.id}",
                    description=f"从观察 {obs.id} 提取的任务: {content[:100]}...",
                    observations=[obs.id],
                    parameters={"observation_id": obs.id, "content": content}
                )
                tasks.append(task)
                
            except Exception as e:
                self.logger.error(f"从观察 {obs.id} 提取任务时出错: {e}")
        
        self.logger.info(f"提取了 {len(tasks)} 个任务")
        return tasks
    
    def prioritize_tasks(self, tasks: List[Task]) -> List[Task]:
        """
        根据进化目标优先级排序任务
        
        Args:
            tasks: 任务列表
            
        Returns:
            排序后的任务列表
        """
        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        
        # 这里可以添加更复杂的优先级计算逻辑
        # 目前使用简单的基于关键词的优先级分配
        def assign_priority(task: Task) -> str:
            content = task.description.lower()
            
            # 关键词匹配确定优先级
            critical_keywords = ["紧急", "错误", "崩溃", "致命", "critical"]
            high_keywords = ["重要", "关键", "high", "high"]
            medium_keywords = ["中等", "改进", "medium"]
            low_keywords = ["低", "可选", "low"]
            
            for keyword in critical_keywords:
                if keyword in content:
                    return "critical"
            