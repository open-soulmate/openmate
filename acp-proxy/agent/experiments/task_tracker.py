import json
import os
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

class TaskTracker:
    """任务跟踪器插件，用于明确执行责任并建立闭环跟踪机制"""
    
    def __init__(self, task_queue_path: str = "tasks/task_queue.json"):
        """初始化任务跟踪器
        
        Args:
            task_queue_path: 任务队列JSON文件路径
        """
        self.task_queue_path = task_queue_path
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self._load_tasks()
        
        # 验证负责人合法性的白名单
        self.valid_parties = {'self', 'partner'}
        
        # 验证状态合法性的白名单
        self.valid_statuses = {'pending', 'in_progress', 'completed', 'blocked'}
        
    def _load_tasks(self):
        """从JSON文件加载任务队列"""
        if not os.path.exists(self.task_queue_path):
            # 创建目录和空文件
            os.makedirs(os.path.dirname(self.task_queue_path), exist_ok=True)
            self.tasks = {}
            self._save_tasks()
            return
            
        try:
            with open(self.task_queue_path, 'r', encoding='utf-8') as f:
                self.tasks = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            logger.warning(f"无法从 {self.task_queue_path} 加载任务队列，创建新的任务队列")
            self.tasks = {}
            self._save_tasks()
    
    def _save_tasks(self):
        """保存任务队列到JSON文件"""
        try:
            from utils.file_safety import atomic_write
            content = json.dumps(self.tasks, indent=2, ensure_ascii=False)
            ok, err = atomic_write(self.task_queue_path, content)
            if not ok:
                logger.error(f"保存任务队列失败: {err}")
        except Exception as e:
            logger.error(f"保存任务队列到 {self.task_queue_path} 失败: {e}")
    
    def _record_memory(self, action: str, task_id: str, details: str = ""):
        """记录任务状态变更到记忆系统
        
        Args:
            action: 执行的动作
            task_id: 任务ID
            details: 详细描述
        """
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {action}: 任务 {task_id}"
        if details:
            log_entry += f" - {details}"
        
        logger.info(log_entry)
        
        # 这里假设存在外部记忆系统，可以通过某种方式记录
        # 如果实际环境有不同的记忆系统接口，需要在此适配
        try:
            # 尝试导入并使用外部记忆模块
            from memory import MemoryManager
            memory = MemoryManager()
            memory.log_event(
                event_type="task_update",
                content=log_entry,
                metadata={
                    "task_id": task_id,
                    "action": action,
                    "timestamp": timestamp
                }
            )
        except ImportError:
            # 记忆系统不存在时的备用方案：写入本地日志文件
            log_file = "memory/task_tracker.log"
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(log_entry + "\n")
    
    def add_task(self, task_id: str, description: str, responsible_party: str = 'self', deadline_cycle: Optional[int] = None) -> bool:
        """添加新任务到队列
        
        Args:
            task_id: 任务唯一标识符
            description: 任务描述
            responsible_party: 负责人，只能是'self'或'partner'
            deadline_cycle: 截止循环编号（可选）
            
        Returns:
            bool: 是否添加成功
        """
        # 验证负责人
        if responsible_party not in self.valid_parties:
            logger.error(f"无效的负责人 '{responsible_party}'，必须是 {self.valid_parties} 之一")
            return False
        
        # 检查任务ID是否已存在
        if task_id in self.tasks:
            logger.error(f"任务 {task_id} 已存在")
            return False
        
        # 创建任务记录
        self.tasks[task_id] = {
            "description": description,
            "responsible_party": responsible_party,
            "deadline_cycle": deadline_cycle,
            "status": "pending",
            "notes": "",
            "verification_method": None,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        self._save_tasks()
        self._record_memory("添加任务", task_id, f"负责人: {responsible_party}, 描述: {description}")
        
        return True
    
    def update_task(self, task_id: str, status: str, notes: str = "") -> bool:
        """更新任务状态
        
        Args:
            task_id: 任务ID
            status: 新状态，必须是'pending', 'in_progress', 'completed', 'blocked'之一
            notes: 更新备注
            
        Returns:
            bool: 是否更新成功
        """
        # 验证任务存在
        if task_id not in self.tasks:
            logger.error(f"任务 {task_id} 不存在")
            return False
        
        # 验证状态
        if status not in self.valid_statuses:
            logger.error(f"无效的状态 '{status}'，必须是 {self.valid_statuses} 之一")
            return False
        
        old_status = self.tasks[task_id]["status"]
        self.tasks[task_id]["status"] = status
        self.tasks[task_id]["notes"] = notes
        self.tasks[task_id]["updated_at"] = datetime.now().isoformat()
        
        self._save_tasks()
        self._record_memory("更新任务状态", task_id, f"从 {old_status} 更新为 {status}")
        
        return True
    
    def verify_task(self, task_id: str, verification_method: str) -> bool:
        """标记任务为已完成并记录验证方法
        
        Args:
            task_id: 任务ID
            verification_method: 验证方法（如"运行单元测试通过", "手动测试确认"）
            
        Returns:
            bool: 是否验证成功
        """
        if task_id not in self.tasks:
            logger.error(f"任务 {task_id} 不存在")
            return False
        
        # 检查任务状态，必须为已阻塞或进行中才能验证完成
        current_status = self.tasks[task_id]["status"]