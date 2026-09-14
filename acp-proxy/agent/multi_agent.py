"""
多Agent协作协调器 — 借鉴AutoGen/CrewAI/LangGraph多Agent编排
核心思想：定义Agent角色、任务分配、结果聚合、冲突解决
"""

import logging
import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional, Any, Callable, Awaitable
from enum import Enum

logger = logging.getLogger("acp-proxy.multi-agent")


class AgentRole(str, Enum):
    PLANNER = "planner"        # 规划者：分解任务
    EXECUTOR = "executor"      # 执行者：执行具体操作
    REVIEWER = "reviewer"      # 审查者：检查结果质量
    RESEARCHER = "researcher"  # 研究者：收集信息
    CODER = "coder"           # 编码者：写代码
    TESTER = "tester"         # 测试者：验证结果
    COORDINATOR = "coordinator"  # 协调者：管理流程


class TaskStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    REVIEW = "review"
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass
class AgentSpec:
    agent_id: str
    name: str
    role: AgentRole
    capabilities: list[str] = field(default_factory=list)
    max_concurrent_tasks: int = 3
    priority: int = 5  # 1-10, 越高越优先
    handler: Optional[Callable] = None  # 实际执行函数


@dataclass
class Task:
    task_id: str
    description: str
    required_role: AgentRole = AgentRole.EXECUTOR
    required_capabilities: list[str] = field(default_factory=list)
    priority: int = 5
    status: TaskStatus = TaskStatus.PENDING
    assigned_agent: str = ""
    result: Any = None
    error: str = ""
    created_at: float = field(default_factory=time.time)
    started_at: float = 0.0
    completed_at: float = 0.0
    dependencies: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


@dataclass
class CollaborationResult:
    workflow_id: str
    tasks: list[Task]
    final_output: Any = None
    success: bool = False
    total_time_seconds: float = 0.0
    agent_utilization: dict = field(default_factory=dict)


class MultiAgentCoordinator:
    """多Agent协作协调器"""

    def __init__(self):
        self._agents: dict[str, AgentSpec] = {}
        self._tasks: dict[str, Task] = {}
        self._workflows: dict[str, CollaborationResult] = {}
        self._stats = {
            "total_workflows": 0,
            "total_tasks": 0,
            "completed_tasks": 0,
            "failed_tasks": 0,
        }

    def register_agent(self, spec: AgentSpec):
        """注册Agent"""
        self._agents[spec.agent_id] = spec
        logger.info(f"Registered agent: {spec.name} ({spec.role.value})")

    def create_workflow(
        self,
        tasks: list[Task],
        workflow_id: Optional[str] = None,
    ) -> str:
        """创建工作流"""
        workflow_id = workflow_id or f"wf_{uuid.uuid4().hex[:12]}"

        for task in tasks:
            self._tasks[task.task_id] = task

        self._workflows[workflow_id] = CollaborationResult(
            workflow_id=workflow_id,
            tasks=tasks,
        )
        self._stats["total_workflows"] += 1
        self._stats["total_tasks"] += len(tasks)

        logger.info(f"Created workflow {workflow_id}: {len(tasks)} tasks")
        return workflow_id

    async def execute_workflow(
        self,
        workflow_id: str,
        max_parallel: int = 3,
    ) -> CollaborationResult:
        """执行工作流"""
        workflow = self._workflows.get(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        start_time = time.time()
        pending_tasks = [t for t in workflow.tasks if t.status == TaskStatus.PENDING]
        completed_tasks: list[Task] = []

        while pending_tasks:
            # 找出可执行的任务（依赖已满足）
            ready_tasks = [
                t for t in pending_tasks
                if all(
                    self._tasks[dep].status == TaskStatus.COMPLETED
                    for dep in t.dependencies
                    if dep in self._tasks
                )
            ]

            if not ready_tasks:
                logger.warning("No ready tasks but pending tasks remain - possible deadlock")
                break

            # 按优先级排序
            ready_tasks.sort(key=lambda t: -t.priority)

            # 分配Agent并执行
            batch = ready_tasks[:max_parallel]
            execution_tasks = []

            for task in batch:
                agent = self._assign_agent(task)
                if agent:
                    task.assigned_agent = agent.agent_id
                    task.status = TaskStatus.ASSIGNED
                    execution_tasks.append(
                        self._execute_task(task, agent)
                    )
                else:
                    task.status = TaskStatus.FAILED
                    task.error = "No suitable agent available"
                    logger.warning(f"No agent for task {task.task_id}: {task.description[:50]}")

            # 并行执行
            if execution_tasks:
                await asyncio.gather(*execution_tasks, return_exceptions=True)

            # 更新状态
            completed_tasks.extend(
                t for t in batch if t.status == TaskStatus.COMPLETED
            )
            pending_tasks = [
                t for t in pending_tasks
                if t.status not in (TaskStatus.COMPLETED, TaskStatus.FAILED)
            ]

        # 计算结果
        workflow.total_time_seconds = time.time() - start_time
        workflow.success = all(
            t.status == TaskStatus.COMPLETED for t in workflow.tasks
        )
        workflow.final_output = self._aggregate_results(workflow.tasks)

        # 统计Agent利用率
        workflow.agent_utilization = {}
        for task in workflow.tasks:
            if task.assigned_agent:
                workflow.agent_utilization[task.assigned_agent] = \
                    workflow.agent_utilization.get(task.assigned_agent, 0) + 1

        logger.info(
            f"Workflow {workflow_id} completed: "
            f"{len(completed_tasks)}/{len(workflow.tasks)} tasks, "
            f"{workflow.total_time_seconds:.1f}s"
        )

        return workflow

    def _assign_agent(self, task: Task) -> Optional[AgentSpec]:
        """为任务分配最合适的Agent"""
        candidates = []

        for agent in self._agents.values():
            # 检查角色匹配
            if agent.role != task.required_role:
                continue

            # 检查能力匹配
            if task.required_capabilities:
                if not all(cap in agent.capabilities for cap in task.required_capabilities):
                    continue

            # 检查并发限制
            current_tasks = sum(
                1 for t in self._tasks.values()
                if t.assigned_agent == agent.agent_id
                and t.status == TaskStatus.IN_PROGRESS
            )
            if current_tasks >= agent.max_concurrent_tasks:
                continue

            candidates.append(agent)

        if not candidates:
            return None

        # 选择优先级最高的
        candidates.sort(key=lambda a: -a.priority)
        return candidates[0]

    async def _execute_task(self, task: Task, agent: AgentSpec):
        """执行单个任务"""
        task.status = TaskStatus.IN_PROGRESS
        task.started_at = time.time()

        try:
            if agent.handler:
                result = await agent.handler(task)
                task.result = result
            else:
                # 模拟执行
                await asyncio.sleep(0.1)
                task.result = f"Completed by {agent.name}"

            task.status = TaskStatus.COMPLETED
            self._stats["completed_tasks"] += 1

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            self._stats["failed_tasks"] += 1
            logger.error(f"Task {task.task_id} failed: {e}")

        finally:
            task.completed_at = time.time()

    def _aggregate_results(self, tasks: list[Task]) -> dict:
        """聚合任务结果"""
        return {
            "completed": [
                {"task_id": t.task_id, "result": t.result}
                for t in tasks if t.status == TaskStatus.COMPLETED
            ],
            "failed": [
                {"task_id": t.task_id, "error": t.error}
                for t in tasks if t.status == TaskStatus.FAILED
            ],
        }

    def get_workflow_status(self, workflow_id: str) -> Optional[dict]:
        """获取工作流状态"""
        workflow = self._workflows.get(workflow_id)
        if not workflow:
            return None

        return {
            "workflow_id": workflow.workflow_id,
            "total_tasks": len(workflow.tasks),
            "completed": sum(1 for t in workflow.tasks if t.status == TaskStatus.COMPLETED),
            "failed": sum(1 for t in workflow.tasks if t.status == TaskStatus.FAILED),
            "pending": sum(1 for t in workflow.tasks if t.status == TaskStatus.PENDING),
            "success": workflow.success,
            "total_time_seconds": workflow.total_time_seconds,
        }

    def get_stats(self) -> dict:
        return {
            **self._stats,
            "registered_agents": len(self._agents),
            "active_workflows": len(self._workflows),
            "agent_roles": {
                role.value: sum(1 for a in self._agents.values() if a.role == role)
                for role in AgentRole
            },
        }
