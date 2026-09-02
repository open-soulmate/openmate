"""Scheduler v1.0 调度引擎 — 即时/延迟/周期任务调度。"""
from __future__ import annotations
import time, threading, uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Any

class TaskState(str, Enum):
    """任务状态。"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class Task:
    """调度任务。"""
    task_id: str
    name: str
    callback: Callable
    state: TaskState = TaskState.PENDING
    delay_seconds: float = 0
    interval_seconds: float = 0  # 0=一次性
    created_at: float = field(default_factory=time.time)
    run_at: float = 0
    result: Any = None
    error: str = ""

class SchedulerEngine:
    """调度引擎（单例）。"""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._tasks: dict[str, Task] = {}
                    cls._instance._running = False
        return cls._instance

    def submit(self, name: str, callback: Callable, delay_seconds: float = 0, interval_seconds: float = 0) -> Task:
        """提交任务。"""
        task = Task(task_id=f"task-{uuid.uuid4().hex[:8]}", name=name, callback=callback, delay_seconds=delay_seconds, interval_seconds=interval_seconds, run_at=time.time() + delay_seconds)
        self._tasks[task.task_id] = task
        return task

    def cancel(self, task_id: str) -> bool:
        """取消任务。"""
        task = self._tasks.get(task_id)
        if task and task.state == TaskState.PENDING:
            task.state = TaskState.CANCELLED
            return True
        return False

    def list_tasks(self, state: TaskState = None) -> list[Task]:
        """列出任务。"""
        tasks = list(self._tasks.values())
        if state:
            tasks = [t for t in tasks if t.state == state]
        return tasks

    def tick(self):
        """调度循环（外部定期调用）。"""
        now = time.time()
        for task in self._tasks.values():
            if task.state != TaskState.PENDING:
                continue
            if now < task.run_at:
                continue
            task.state = TaskState.RUNNING
            try:
                task.result = task.callback()
                task.state = TaskState.COMPLETED
            except Exception as e:
                task.error = str(e)
                task.state = TaskState.FAILED
