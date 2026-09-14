"""
任务规划器 — 借鉴LLM Compiler/Plan-and-Execute/Tree of Thoughts
核心思想：复杂任务自动分解为DAG（有向无环图），支持并行执行和依赖管理
"""

import logging
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional, Any
from enum import Enum

logger = logging.getLogger("acp-proxy.task-planner")


class StepStatus(str, Enum):
    PENDING = "pending"
    READY = "ready"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class PlanStep:
    step_id: str
    description: str
    tool_name: str = ""
    arguments: dict = field(default_factory=dict)
    depends_on: list[str] = field(default_factory=list)
    status: StepStatus = StepStatus.PENDING
    result: Any = None
    error: str = ""
    estimated_duration: float = 0.0
    actual_duration: float = 0.0
    retry_count: int = 0


@dataclass
class ExecutionPlan:
    plan_id: str
    goal: str
    steps: list[PlanStep] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    started_at: float = 0.0
    completed_at: float = 0.0
    status: str = "pending"
    metadata: dict = field(default_factory=dict)

    @property
    def progress(self) -> float:
        if not self.steps:
            return 0.0
        completed = sum(1 for s in self.steps if s.status == StepStatus.COMPLETED)
        return completed / len(self.steps)

    @property
    def is_complete(self) -> bool:
        return all(
            s.status in (StepStatus.COMPLETED, StepStatus.SKIPPED, StepStatus.FAILED)
            for s in self.steps
        )

    def get_ready_steps(self) -> list[PlanStep]:
        """获取可执行的步骤（依赖已满足）"""
        completed_ids = {
            s.step_id for s in self.steps if s.status == StepStatus.COMPLETED
        }
        return [
            s for s in self.steps
            if s.status == StepStatus.PENDING
            and all(dep in completed_ids for dep in s.depends_on)
        ]


class TaskPlanner:
    """任务规划器"""

    def __init__(self):
        self._plans: dict[str, ExecutionPlan] = {}
        self._stats = {
            "total_plans": 0,
            "completed_plans": 0,
            "failed_plans": 0,
            "total_steps": 0,
        }

    def create_plan(self, goal: str, steps_spec: list[dict]) -> ExecutionPlan:
        """创建执行计划"""
        plan_id = f"plan_{uuid.uuid4().hex[:12]}"

        steps = []
        for i, spec in enumerate(steps_spec):
            step = PlanStep(
                step_id=spec.get("id", f"step_{i}"),
                description=spec.get("description", ""),
                tool_name=spec.get("tool", ""),
                arguments=spec.get("arguments", {}),
                depends_on=spec.get("depends_on", []),
                estimated_duration=spec.get("estimated_seconds", 0),
            )
            steps.append(step)

        plan = ExecutionPlan(
            plan_id=plan_id,
            goal=goal,
            steps=steps,
        )

        self._plans[plan_id] = plan
        self._stats["total_plans"] += 1
        self._stats["total_steps"] += len(steps)

        logger.info(f"Created plan {plan_id}: {len(steps)} steps for goal: {goal[:50]}")
        return plan

    def create_plan_from_llm(self, goal: str, llm_response: str) -> Optional[ExecutionPlan]:
        """从LLM响应解析执行计划"""
        try:
            # 尝试解析JSON格式的计划
            data = json.loads(llm_response)
            if isinstance(data, dict) and "steps" in data:
                return self.create_plan(goal, data["steps"])
            elif isinstance(data, list):
                return self.create_plan(goal, data)
        except json.JSONDecodeError:
            pass

        # 解析文本格式的计划
        steps_spec = []
        lines = llm_response.split("\n")
        current_step: dict = {}

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # 识别步骤开始
            if line.startswith(("Step ", "步骤 ", "- Step", "1.", "2.", "3.")):
                if current_step:
                    steps_spec.append(current_step)
                step_num = len(steps_spec)
                current_step = {
                    "id": f"step_{step_num}",
                    "description": line,
                }
            elif current_step and ("depends" in line.lower() or "依赖" in line):
                # 提取依赖
                import re
                deps = re.findall(r"step[_\s]*(\d+)", line, re.IGNORECASE)
                current_step["depends_on"] = [f"step_{d}" for d in deps]
            elif current_step:
                current_step["description"] += f" {line}"

        if current_step:
            steps_spec.append(current_step)

        if steps_spec:
            return self.create_plan(goal, steps_spec)

        logger.warning(f"Could not parse LLM response as plan: {llm_response[:200]}")
        return None

    def get_plan(self, plan_id: str) -> Optional[ExecutionPlan]:
        return self._plans.get(plan_id)

    def update_step(
        self,
        plan_id: str,
        step_id: str,
        status: StepStatus,
        result: Any = None,
        error: str = "",
    ):
        """更新步骤状态"""
        plan = self._plans.get(plan_id)
        if not plan:
            return

        for step in plan.steps:
            if step.step_id == step_id:
                step.status = status
                step.result = result
                step.error = error
                break

        # 检查计划是否完成
        if plan.is_complete:
            plan.completed_at = time.time()
            failed = sum(1 for s in plan.steps if s.status == StepStatus.FAILED)
            if failed == 0:
                plan.status = "completed"
                self._stats["completed_plans"] += 1
            else:
                plan.status = "failed"
                self._stats["failed_plans"] += 1

    def visualize_plan(self, plan_id: str) -> str:
        """可视化执行计划（文本DAG）"""
        plan = self._plans.get(plan_id)
        if not plan:
            return "Plan not found"

        lines = [f"📋 Plan: {plan.goal}"]
        lines.append(f"   Status: {plan.status} | Progress: {plan.progress:.0%}")
        lines.append("")

        for step in plan.steps:
            status_icon = {
                StepStatus.PENDING: "⏳",
                StepStatus.READY: "🔵",
                StepStatus.RUNNING: "🔄",
                StepStatus.COMPLETED: "✅",
                StepStatus.FAILED: "❌",
                StepStatus.SKIPPED: "⏭️",
            }.get(step.status, "❓")

            deps = f" (depends: {', '.join(step.depends_on)})" if step.depends_on else ""
            lines.append(f"  {status_icon} {step.step_id}: {step.description[:60]}{deps}")

            if step.error:
                lines.append(f"     ⚠️ Error: {step.error[:80]}")

        return "\n".join(lines)

    def get_stats(self) -> dict:
        return {
            **self._stats,
            "active_plans": sum(
                1 for p in self._plans.values()
                if p.status in ("pending", "running")
            ),
        }
