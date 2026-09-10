#!/usr/bin/env python3
"""
自主执行技能模块
解决agent无法自主执行任务的核心问题
"""

import ast
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)


@dataclass
class Task:
    """任务数据结构"""
    id: str
    name: str
    description: str
    task_type: str
    priority: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    status: str = "pending"
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    retry_count: int = 0
    max_retries: int = 3
    dependencies: List[str] = field(default_factory=list)


@dataclass
class Observation:
    """观察数据结构"""
    id: str
    content: str
    source: str
    timestamp: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    analysis_status: str = "pending"


@dataclass
class SkillConfig:
    """技能配置数据结构"""
    name: str
    description: str
    version: str
    author: str
    entry_point: str
    dependencies: List[str] = field(default_factory=list)
    parameters: Dict[str, Any] = field(default_factory=dict)
    status: str = "active"


@dataclass
class ErrorReport:
    """错误报告数据结构"""
    error_id: str
    task_id: str
    error_message: str
    traceback: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    severity: str = "medium"


@dataclass
class ExecutionResult:
    """执行结果数据结构"""
    task_id: str
    status: str
    output: Any = None
    error: Optional[str] = None
    duration: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


class ObservationAnalyzer:
    """观察分析器"""
    
    def __init__(self):
        self.unanalyzed_file = Path("observations_unanalyzed.json")
        self.analyzed_file = Path("observations_analyzed.json")
    
    def analyze_pending(self) -> List[Observation]:
        """
        分析待处理的观察
        
        Returns:
            List[Observation]: 结构化后的观察列表
        """
        try:
            if not self.unanalyzed_file.exists():
                logger.info("未找到待分析观察文件")
                return []
            
            with open(self.unanalyzed_file, 'r', encoding='utf-8') as f:
                observations_data = json.load(f)
            
            observations = []
            for obs_data in observations_data:
                try:
                    observation = Observation(
                        id=obs_data.get("id", self._generate_id()),
                        content=obs_data.get("content", ""),
                        source=obs_data.get("source", "unknown"),
                        timestamp=obs_data.get("timestamp", datetime.now().isoformat()),
                        metadata=obs_data.get("metadata", {}),
                        analysis_status="pending"
                    )
                    observations.append(observation)
                except Exception as e:
                    logger.error(f"解析观察数据失败: {e}")
                    continue
            
            # 标记为已分析并保存
            self._save_analyzed_observations(observations)
            
            logger.info(f"分析完成，共处理 {len(observations)} 条观察")
            return observations
            
        except Exception as e:
            logger.error(f"分析待处理观察时出错: {e}")
            return []
    
    def extract_action_items(self, observations: List[Observation]) -> List[Task]:
        """
        从观察中提取可执行的任务项
        
        Args:
            observations: 观察列表
            
        Returns:
            List[Task]: 提取的任务列表
        """
        tasks = []
        
        for obs in observations:
            try:
                # 简单的任务提取逻辑（可根据实际需求扩展）
                if "action" in obs.content.lower() or "task" in obs.content.lower():
                    task_id = self._generate_task_id(obs.id)
                    
                    # 尝试从内容中提取任务信息
                    task = Task(
                        id=task_id,
                        name=f"Task from {obs.id}",
                        description=obs.content,
                        task_type="generic",
                        priority="medium",
                        parameters={"observation_id": obs.id},
                        status="pending"
                    )
                    
                    tasks.append(task)
                    
                    # 更新观察状态
                    obs.analysis_status = "action_extracted"
                    
            except Exception as e:
                logger.error(f"从观察 {obs.id} 提取任务失败: {e}")
        
        logger.info(f"从观察中提取了 {len(tasks)} 个任务")
        return tasks
    
    def prioritize_tasks(self, tasks: List[Task], evolution_goals: Optional[List[str]] = None) -> List[Task]:
        """
        根据进化目标优先级排序任务
        
        Args:
            tasks: 任务列表
            evolution_goals: 进化目标列表
            
        Returns:
            List[Task]: 排序后的任务列表
        """
        if evolution_goals is None:
            evolution_goals = []
        
        priority_map = {
            "critical": 4,
            "high": 3,
            "medium": 2,
            "low": 1
        }
        
        def priority_score(task: Task) -> int:
            base_score = priority_map.get(task.priority, 0)
            
            # 如果任务与进化目标相关，增加优先级
            if evolution_goals:
                for goal in evolution_goals:
                    if goal.lower() in task.description.lower():
                        base_score += 1
                        break
            
            return base_score
        
        try:
            sorted_tasks = sorted(tasks, key=priority_score, reverse=True)
            logger.info(f"任务优先级排序完成，共 {len(sorted_tasks)} 个任务")
            return sorted_tasks
        except Exception as e:
            logger.error(f"任务优先级排序失败: {e}")
            return tasks
    
    def _save_analyzed_observations(self, observations: List[Observation]) -> None:
        """保存已分析的观察"""
        try:
            analyzed_data = [
                {
                    "id": obs.id,
                    "content": obs.content,
                    "source": obs.source,
                    "timestamp": obs.timestamp,
                    "metadata": obs.metadata,
                    "analysis_status": obs.analysis_status
                }
                for obs in observations
            ]
            
            # 读取现有数据（如果存在）
            existing_data = []
            if self.analyzed_file.exists():
                with open(self.analyzed_file, 'r', encoding='utf-8') as f:
                    existing_data = json.load(f)
            
            # 合并数据（避免重复）
            existing_ids = {obs["id"] for obs in existing_data}
            new_data = [obs for obs in analyzed_data if obs["id"] not in existing_ids]
            existing_data.extend(new_data)
            
            with open(self.analyzed_file, 'w', encoding='utf-8') as f:
                json.dump(existing_data, f, ensure_ascii=False, indent=2)
                
        except Exception as e:
            logger.error(f"保存已分析观察失败: {e}")
    
    def _generate_id(self) -> str:
        """生成唯一ID"""
        return hashlib.md5(f"{time.time()}{os.urandom(8)}".encode()).hexdigest()[:12]
    
    def _generate_task_id(self, observation_id: str) -> str:
        """根据观察ID生成任务ID"""
        return f"task_{observation_id}_{int(time.time())}"


class TaskExecutor:
    """任务执行器"""
    