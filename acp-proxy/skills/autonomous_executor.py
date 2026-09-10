#!/usr/bin/env python3
"""
Autonomous Executor Skill Module

This module implements the autonomous execution capabilities for the ACP proxy,
enabling self-programming and tool creation by transforming planning into action.
"""

import ast
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, asdict
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Any, Union, Callable

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TaskPriority(Enum):
    """Enumeration for task priorities."""
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4


class TaskStatus(Enum):
    """Enumeration for task statuses."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class Observation:
    """Data structure for observations."""
    id: str
    content: Dict[str, Any]
    timestamp: float
    source: str
    priority: TaskPriority = TaskPriority.MEDIUM
    processed: bool = False


@dataclass
class Task:
    """Data structure for executable tasks."""
    id: str
    name: str
    description: str
    priority: TaskPriority
    task_type: str
    parameters: Dict[str, Any]
    status: TaskStatus = TaskStatus.PENDING
    created_at: float = None
    executed_at: Optional[float] = None
    completed_at: Optional[float] = None
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    retry_count: int = 0

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = time.time()


@dataclass
class SkillConfig:
    """Configuration structure for skills."""
    name: str
    version: str
    description: str
    entry_point: str
    dependencies: List[str]
    config_schema: Dict[str, Any]


@dataclass
class ExecutionResult:
    """Structure for execution results."""
    task_id: str
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    duration: float = 0.0
    timestamp: float = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = time.time()


class ObservationAnalyzer:
    """Analyzes observations and extracts actionable items."""

    def __init__(self, storage_path: Union[str, Path] = None):
        """
        Initialize the observation analyzer.
        
        Args:
            storage_path: Path to store observations. Defaults to environment variable or current directory.
        """
        self.storage_path = Path(storage_path) if storage_path else Path(os.getenv('ACP_OBSERVATION_PATH', '.'))
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.observations: List[Observation] = []

    def analyze_pending(self) -> List[Observation]:
        """
        Read and analyze unanalyzed observations, structuring the content.
        
        Returns:
            List of processed observations.
        """
        try:
            observations_file = self.storage_path / 'observations_unanalyzed.json'
            
            if not observations_file.exists():
                logger.info("No unanalyzed observations found")
                return []
            
            with open(observations_file, 'r') as f:
                raw_observations = json.load(f)
            
            processed_observations = []
            
            for obs_data in raw_observations:
                observation = Observation(
                    id=obs_data.get('id', self._generate_id(obs_data.get('content', {}))),
                    content=obs_data.get('content', {}),
                    timestamp=obs_data.get('timestamp', time.time()),
                    source=obs_data.get('source', 'unknown'),
                    priority=TaskPriority(obs_data.get('priority', 3)),
                    processed=False
                )
                
                # Process observation content
                processed_content = self._process_observation_content(observation.content)
                observation.content = processed_content
                processed_observations.append(observation)
            
            self.observations.extend(processed_observations)
            
            # Clear processed observations from file
            self._clear_analyzed_observations()
            
            logger.info(f"Analyzed {len(processed_observations)} observations")
            return processed_observations
            
        except Exception as e:
            logger.error(f"Error analyzing pending observations: {e}")
            return []

    def extract_action_items(self, observations: Optional[List[Observation]] = None) -> List[Task]:
        """
        Extract executable task items from observations.
        
        Args:
            observations: List of observations to process. Uses stored observations if None.
            
        Returns:
            List of extracted tasks.
        """
        if observations is None:
            observations = self.observations
        
        tasks = []
        
        for observation in observations:
            if observation.processed:
                continue
                
            # Extract tasks based on observation content
            extracted_tasks = self._extract_tasks_from_observation(observation)
            tasks.extend(extracted_tasks)
            
            # Mark observation as processed
            observation.processed = True
        
        logger.info(f"Extracted {len(tasks)} action items from observations")
        return tasks

    def prioritize_tasks(self, tasks: List[Task]) -> List[Task]:
        """
        Sort tasks based on evolution goal priorities.
        
        Args:
            tasks: List of tasks to prioritize.
            
        Returns:
            Sorted list of tasks (highest priority first).
        """
        priority_order = {
            TaskPriority.CRITICAL: 0,
            TaskPriority.HIGH: 1,
            TaskPriority.MEDIUM: 2,
            TaskPriority.LOW: 3
        }
        
        sorted_tasks = sorted(tasks, key=lambda t: priority_order[t.priority])
        
        logger.info(f"Prioritized {len(sorted_tasks)} tasks")
        return sorted_tasks

    def _process_observation_content(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Process and structure observation content."""
        # Implement content processing logic
        processed = content.copy()
        
        # Add metadata
        processed['_processed_at'] = time.time()
        processed['_content_hash'] = self._generate_id(content)
        
        return processed

    def _extract_tasks_from_observation(self, observation: Observation) -> List[Task]:
        """Extract tasks from a single observation."""
        tasks = []
        content = observation.content
        
        # Pattern matching for different types of actions
        if 'action_items' in content:
            for item in content['action_items']:
                task = Task(
                    id=self._generate_id(item),
                    name=item.get('name', f'Task from observation {observation.id}'),
                    description=item.get('description', ''),
                    priority=observation.priority,
                    task_type=item.get('type', 'generic'),
                    parameters=item.get('parameters', {})
                )
                tasks.append(task)
        
        elif 'errors' in content:
            # Create fix tasks for errors
            for error in content['errors']:
                task = Task(
                    id=self._generate_id(error),
                    name=f"Fix error: {error.get('message', 'Unknown error')}",
                    description=f"Fix error from observation {observation.id}",
                    priority=TaskPriority.HIGH,
                    task_type='error_fix',
                    parameters={'error_details': error}
                )
                tasks.append(task)
        
        elif 'requirements' in content:
            # Create implementation tasks
            for req in content['requirements']:
                task = Task(
                    id=self._generate_id(req),
                    name=f"Implement: {req.get('name', 'Unknown requirement')}",
                    description=req.get('description', ''),
                    priority=TaskPriority.MEDIUM,
                    task_type='implementation',
                    parameters={'requirements': req}
                )
                tasks.append(task)
        
        return tasks

    def _generate_id(self, data: Any) -> str:
        """Generate a unique ID for data."""
        if isinstance(data, dict):
            data_str = json.dumps(data, sort_keys=True)
        else:
            data_str = str(data)
        