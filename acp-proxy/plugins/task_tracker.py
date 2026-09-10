#!/usr/bin/env python3
"""
Task Tracker Plugin - 任务执行责任管理与闭环跟踪机制
"""
import json
import os
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from pathlib import Path

logger = logging.getLogger(__name__)

class TaskTracker:
    """
    任务跟踪器插件 - 管理任务队列，确保改进项有明确负责人和闭环跟踪
    """
    
    VALID_RESPONSIBLE_PARTIES = ['self', 'partner']
    VALID_STATUSES = ['pending', 'in_progress', 'completed', 'blocked']
    
    def __init__(self, tasks_dir: str = "tasks", memory_system=None):
        """
        初始化任务跟踪器
        
        Args:
            tasks_dir: 任务目录路径
            memory_system: 记忆系统实例，用于记录状态变更
        """
        self.tasks_dir = Path(tasks_dir)
        self.task_queue_file = self.tasks_dir / "task_queue.json"
        self.memory_system = memory_system
        self.tasks: Dict[str, Dict[str, Any]] = {}
        
        # 确保目录存在
        self.tasks_dir.mkdir(parents=True, exist_ok=True)
        
        # 加载现有任务
        self._load_tasks()
        
        logger.info(f"TaskTracker initialized with {len(self.tasks)} tasks")
    
    def _load_tasks(self) -> None:
        """从JSON文件加载任务队列"""
        try:
            if self.task_queue_file.exists():
                with open(self.task_queue_file, 'r', encoding='utf-8') as f:
                    self.tasks = json.load(f)
                logger.info(f"Loaded {len(self.tasks)} tasks from {self.task_queue_file}")
        except Exception as e:
            logger.error(f"Failed to load tasks: {e}")
            self.tasks = {}
    
    def _save_tasks(self) -> None:
        """保存任务队列到JSON文件"""
        try:
            with open(self.task_queue_file, 'w', encoding='utf-8') as f:
                json.dump(self.tasks, f, indent=2, ensure_ascii=False)
            logger.debug(f"Saved {len(self.tasks)} tasks to {self.task_queue_file}")
        except Exception as e:
            logger.error(f"Failed to save tasks: {e}")
    
    def _log_memory(self, message: str, level: str = "info") -> None:
        """记录到记忆系统"""
        if self.memory_system:
            try:
                if hasattr(self.memory_system, 'log'):
                    self.memory_system.log(message, level=level)
                elif callable(self.memory_system):
                    self.memory_system(message)
                else:
                    logger.warning("Memory system does not have a compatible interface")
            except Exception as e:
                logger.error(f"Failed to log to memory system: {e}")
        else:
            logger.debug(f"Memory system not available, message: {message}")
    
    def add_task(self, task_id: str, description: str, 
                 responsible_party: str = 'self', deadline_cycle: Optional[int] = None) -> bool:
        """
        添加新任务
        
        Args:
            task_id: 任务唯一标识
            description: 任务描述
            responsible_party: 负责方，只能是'self'或'partner'
            deadline_cycle: 截止循环周期数
            
        Returns:
            bool: 是否添加成功
        """
        # 验证负责方
        if responsible_party not in self.VALID_RESPONSIBLE_PARTIES:
            logger.error(f"Invalid responsible party: {responsible_party}. Must be 'self' or 'partner'")
            return False
        
        # 检查任务ID是否已存在
        if task_id in self.tasks:
            logger.error(f"Task ID {task_id} already exists")
            return False
        
        # 创建任务对象
        task = {
            "task_id": task_id,
            "description": description,
            "responsible_party": responsible_party,
            "status": "pending",
            "deadline_cycle": deadline_cycle,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "notes": [],
            "verification_method": None,
            "verified_at": None,
            "cycle_created": None
        }
        
        # 添加到任务队列
        self.tasks[task_id] = task
        
        # 保存到文件
        self._save_tasks()
        
        # 记录到记忆系统
        memory_message = f"Task added: {task_id} - {description} (responsible: {responsible_party})"
        self._log_memory(memory_message)
        
        logger.info(f"Task {task_id} added successfully")
        return True
    
    def update_task(self, task_id: str, status: str, notes: str = '') -> bool:
        """
        更新任务状态
        
        Args:
            task_id: 任务ID
            status: 新状态，必须是valid_statuses中的一个
            notes: 更新备注
            
        Returns:
            bool: 是否更新成功
        """
        # 检查任务是否存在
        if task_id not in self.tasks:
            logger.error(f"Task {task_id} not found")
            return False
        
        # 验证状态有效性
        if status not in self.VALID_STATUSES:
            logger.error(f"Invalid status: {status}. Must be one of {self.VALID_STATUSES}")
            return False
        
        # 记录之前的状态
        previous_status = self.tasks[task_id]["status"]
        
        # 更新任务状态
        self.tasks[task_id]["status"] = status
        self.tasks[task_id]["updated_at"] = datetime.now().isoformat()
        
        # 添加备注
        if notes:
            note_entry = {
                "timestamp": datetime.now().isoformat(),
                "content": notes
            }
            self.tasks[task_id]["notes"].append(note_entry)
        
        # 保存到文件
        self._save_tasks()
        