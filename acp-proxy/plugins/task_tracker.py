import json
import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Union
from pathlib import Path

logger = logging.getLogger(__name__)

class TaskTracker:
    """管理任务队列的插件，确保每个改进任务有明确的负责人和闭环跟踪"""
    
    VALID_STATUS = ['pending', 'in_progress', 'completed', 'blocked']
    VALID_PARTIES = ['self', 'partner']
    
    def __init__(self, task_file_path: str = "tasks/task_queue.json"):
        """初始化任务跟踪器
        
        Args:
            task_file_path: 任务队列文件路径，默认为 tasks/task_queue.json
        """
        self.task_file_path = Path(task_file_path)
        self.tasks = self._load_tasks()
        logger.info(f"TaskTracker initialized with {len(self.tasks)} tasks")
    
    def _load_tasks(self) -> Dict[str, Any]:
        """从JSON文件加载任务队列"""
        try:
            if self.task_file_path.exists():
                with open(self.task_file_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            else:
                # 确保目录存在
                self.task_file_path.parent.mkdir(parents=True, exist_ok=True)
                return {}
        except Exception as e:
            logger.error(f"Failed to load tasks from {self.task_file_path}: {e}")
            return {}
    
    def _save_tasks(self) -> None:
        """保存任务队列到JSON文件"""
        try:
            with open(self.task_file_path, 'w', encoding='utf-8') as f:
                json.dump(self.tasks, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save tasks to {self.task_file_path}: {e}")
            raise
    
    def _record_to_memory(self, action: str, task_id: str, details: Dict[str, Any]) -> None:
        """记录任务变更到记忆日志系统
        
        Args:
            action: 执行的动作（add/update/verify）
            task_id: 任务ID
            details: 变更详情
        """
        # 这里假设存在一个memory模块，实际实现可能需要根据项目结构调整
        try:
            # 尝试导入memory模块
            from memory import memory_system
            
            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "action": action,
                "task_id": task_id,
                "details": details
            }
            
            # 记录到记忆系统
            memory_system.log_task_event(log_entry)
            
        except ImportError:
            logger.warning("Memory module not found, task changes not recorded to memory system")
        except Exception as e:
            logger.error(f"Failed to record to memory system: {e}")
    
    def add_task(self, task_id: str, description: str, 
                 responsible_party: str = 'self', 
                 deadline_cycle: Optional[int] = None) -> bool:
        """添加新任务
        
        Args:
            task_id: 任务唯一标识
            description: 任务描述
            responsible_party: 负责人，'self'或'partner'
            deadline_cycle: 截止循环数（可选）
            
        Returns:
            bool: 是否添加成功
        """
        # 验证负责人
        if responsible_party not in self.VALID_PARTIES:
            raise ValueError(f"responsible_party must be one of {self.VALID_PARTIES}, got '{responsible_party}'")
        
        # 检查任务ID是否已存在
        if task_id in self.tasks:
            raise ValueError(f"Task '{task_id}' already exists")
        
        # 创建任务对象
        task = {
            "task_id": task_id,
            "description": description,
            "responsible_party": responsible_party,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "deadline_cycle": deadline_cycle,
            "verification_method": None,
            "verified_at": None,
            "notes": []
        }
        
        # 添加到任务队列
        self.tasks[task_id] = task
        self._save_tasks()
        
        # 记录到记忆系统
        self._record_to_memory("add", task_id, {
            "description": description,
            "responsible_party": responsible_party,
            "deadline_cycle": deadline_cycle
        })
        
        logger.info(f"Task '{task_id}' added with responsible_party='{responsible_party}'")
        return True
    
    def update_task(self, task_id: str, status: str, notes: str = '') -> bool:
        """更新任务状态
        
        Args:
            task_id: 任务标识
            status: 新状态，必须为['pending', 'in_progress', 'completed', 'blocked']之一
            notes: 备注信息
            
        Returns:
            bool: 是否更新成功
        """
        # 验证任务是否存在
        if task_id not in self.tasks:
            raise ValueError(f"Task '{task_id}' not found")
        
        # 验证状态
        if status not in self.VALID_STATUS:
            raise ValueError(f"Status must be one of {self.VALID_STATUS}, got '{status}'")
        
        # 更新任务状态
        task = self.tasks[task_id]
        task["status"] = status
        task["updated_at"] = datetime.now().isoformat()
        
        # 添加备注
        if notes:
            note_entry = {
                "timestamp": datetime.now().isoformat(),
                "content": notes
            }
            task["notes"].append(note_entry)
        
        self._save_tasks()
        
        # 记录到记忆系统
        self._record_to_memory("update", task_id, {
            "old_status": self.tasks[task_id]["status"],
            "new_status": status,
            "notes": notes
        })
        
        logger.info(f"Task '{task_id}' status updated to '{status}'")
        return True
    
    def verify_task(self, task_id: str, verification_method: str) -> bool:
        """验证任务完成
        
        Args:
            task_id: 任务标识
            verification_method: 验证方法描述
            
        Returns:
            bool: 是否验证成功
        """
        # 验证任务是否存在
        if task_id not in self.tasks:
            raise ValueError(f"Task '{task_id}' not found")
        
        # 验证任务当前状态是否可以验证
        task = self.tasks[task_id]
        if task["status"] not in ['pending', 'in_progress', 'blocked']:
            raise ValueError(f"Task '{task_id}' cannot be verified in current status '{task['status']}'")
        
        # 更新任务为已完成状态
        task["status"] = "completed"
        task["updated_at"] = datetime.now().isoformat()
        task["verification_method"] = verification_method
        task["verified_at"] = datetime.now().isoformat()
        
        # 添加验证记录到备注
        verify_note = {
            "timestamp": datetime.now().isoformat(),
            "content": f"Task verified: {verification_method}"
        }
        task["notes"].append(verify_note)
        
        self._save_tasks()
        
        # 记录到记忆系统
        self._record_to_memory("verify", task_id, {
            "verification_method": verification_method,
            "verified_at": task["verified_at"]
        })
        
        logger.info(f"Task '{task_id}' verified with method: {verification_method}")