"""
任务规划与自省引擎
PRD P0-1: 分层任务规划、自省校验、断点续跑

核心流程：
1. 用户输入复杂目标 → LLM 评估是否需要分解
2. 需要分解 → 生成任务树（子任务 + 依赖关系）
3. 逐步执行子任务，每步执行后自省校验
4. 失败时动态重规划，而非直接终止
5. 全状态持久化，支持断点续跑
"""

import json
import sqlite3
import time
import uuid
import logging
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Optional

logger = logging.getLogger("acp-agent.task-engine")


# ── 数据模型 ──────────────────────────────────────────

class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    REPLANNED = "replanned"


class ErrorType(str, Enum):
    TOOL_ERROR = "tool_error"          # 工具执行报错
    LOGIC_ERROR = "logic_error"        # 结果正确但不符合业务需求
    UNDERSTANDING_ERROR = "understanding_error"  # 需求理解偏差


@dataclass
class SubTask:
    id: str
    description: str
    tool_hint: str = ""           # 建议使用的工具
    depends_on: list[str] = field(default_factory=list)  # 依赖的子任务ID
    status: StepStatus = StepStatus.PENDING
    result: str = ""
    error: str = ""
    error_type: str = ""
    reflection: str = ""
    retry_count: int = 0
    max_retries: int = 2
    created_at: float = field(default_factory=time.time)
    completed_at: float = 0.0


@dataclass
class TaskPlan:
    id: str
    session_id: str
    goal: str                          # 用户原始目标
    subtasks: list[SubTask] = field(default_factory=list)
    status: str = "active"             # active / completed / failed / paused
    current_step_idx: int = 0
    reflection_report: str = ""
    replan_count: int = 0
    max_replans: int = 3
    created_at: float = field(default_factory=time.time)
    completed_at: float = 0.0


# ── 数据库持久化 ──────────────────────────────────────

class TaskStore:
    """任务状态持久化到 SQLite"""

    def __init__(self, db_path: str = "/home/climbing/opensoul/data/opensoul.db"):
        self.db_path = db_path
        self._init_tables()

    def _init_tables(self):
        db = sqlite3.connect(self.db_path)
        db.execute("""
            CREATE TABLE IF NOT EXISTS task_plans (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                goal TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                current_step_idx INTEGER DEFAULT 0,
                reflection_report TEXT DEFAULT '',
                replan_count INTEGER DEFAULT 0,
                created_at REAL,
                completed_at REAL DEFAULT 0
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS task_steps (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                description TEXT NOT NULL,
                tool_hint TEXT DEFAULT '',
                depends_on TEXT DEFAULT '[]',
                status TEXT DEFAULT 'pending',
                result TEXT DEFAULT '',
                error TEXT DEFAULT '',
                error_type TEXT DEFAULT '',
                reflection TEXT DEFAULT '',
                retry_count INTEGER DEFAULT 0,
                created_at REAL,
                completed_at REAL DEFAULT 0,
                step_order INTEGER DEFAULT 0,
                FOREIGN KEY (plan_id) REFERENCES task_plans(id)
            )
        """)
        db.commit()
        db.close()

    def save_plan(self, plan: TaskPlan):
        db = sqlite3.connect(self.db_path)
        db.execute("""
            INSERT OR REPLACE INTO task_plans
            (id, session_id, goal, status, current_step_idx, reflection_report, replan_count, created_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (plan.id, plan.session_id, plan.goal, plan.status,
              plan.current_step_idx, plan.reflection_report, plan.replan_count,
              plan.created_at, plan.completed_at))
        # 保存子任务
        for idx, step in enumerate(plan.subtasks):
            db.execute("""
                INSERT OR REPLACE INTO task_steps
                (id, plan_id, description, tool_hint, depends_on, status, result, error, error_type, reflection, retry_count, created_at, completed_at, step_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (step.id, plan.id, step.description, step.tool_hint,
                  json.dumps(step.depends_on), step.status.value, step.result,
                  step.error, step.error_type, step.reflection, step.retry_count,
                  step.created_at, step.completed_at, idx))
        db.commit()
        db.close()

    def load_plan(self, plan_id: str) -> Optional[TaskPlan]:
        db = sqlite3.connect(self.db_path)
        db.row_factory = sqlite3.Row
        row = db.execute("SELECT * FROM task_plans WHERE id = ?", (plan_id,)).fetchone()
        if not row:
            db.close()
            return None
        plan = TaskPlan(
            id=row["id"], session_id=row["session_id"], goal=row["goal"],
            status=row["status"], current_step_idx=row["current_step_idx"],
            reflection_report=row["reflection_report"], replan_count=row["replan_count"],
            created_at=row["created_at"], completed_at=row["completed_at"],
        )
        steps = db.execute("SELECT * FROM task_steps WHERE plan_id = ? ORDER BY step_order", (plan_id,)).fetchall()
        for s in steps:
            plan.subtasks.append(SubTask(
                id=s["id"], description=s["description"], tool_hint=s["tool_hint"],
                depends_on=json.loads(s["depends_on"]), status=StepStatus(s["status"]),
                result=s["result"], error=s["error"], error_type=s["error_type"],
                reflection=s["reflection"], retry_count=s["retry_count"],
                created_at=s["created_at"], completed_at=s["completed_at"],
            ))
        db.close()
        return plan

    def get_active_plan(self, session_id: str) -> Optional[TaskPlan]:
        """获取会话的活跃任务计划"""
        db = sqlite3.connect(self.db_path)
        db.row_factory = sqlite3.Row
        row = db.execute(
            "SELECT id FROM task_plans WHERE session_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
            (session_id,)
        ).fetchone()
        db.close()
        if row:
            return self.load_plan(row["id"])
        return None

    def list_plans(self, session_id: str, limit: int = 10) -> list[dict]:
        db = sqlite3.connect(self.db_path)
        db.row_factory = sqlite3.Row
        rows = db.execute(
            "SELECT id, goal, status, created_at, completed_at FROM task_plans WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
            (session_id, limit)
        ).fetchall()
        db.close()
        return [dict(r) for r in rows]


# ── 任务规划器 ────────────────────────────────────────

PLANNING_PROMPT = """你是一个任务规划器。用户给了你一个目标，你需要判断是否需要拆分为子任务。

## 规则
1. 简单任务（一句话能完成、单次工具调用）→ 不拆分，返回空列表
2. 中等任务（需要2-3步）→ 拆分为2-3个子任务
3. 复杂任务（需要多步骤、多工具协作）→ 拆分为多个子任务，标注依赖关系

## 输出格式（严格JSON）
```json
{
  "needs_planning": true/false,
  "reason": "判断理由",
  "subtasks": [
    {
      "id": "step_1",
      "description": "子任务描述",
      "tool_hint": "建议使用的工具",
      "depends_on": []
    }
  ]
}
```

只输出JSON，不要其他文字。"""

REPLAN_PROMPT = """你是一个任务重规划器。之前的任务计划中有子任务失败了，需要你决定如何调整。

## 当前任务计划
{plan_json}

## 失败的子任务
{failed_step}

## 错误信息
{error_info}

## 选项
1. retry — 重试当前子任务（换个方式）
2. skip — 跳过当前子任务（不影响后续）
3. replan — 重新规划后续子任务
4. abort — 终止整个任务

## 输出格式（严格JSON）
```json
{
  "action": "retry|skip|replan|abort",
  "reason": "决策理由",
  "new_subtasks": []
}
```
只输出JSON。"""

REFLECTION_PROMPT = """你是一个自省引擎。一个子任务刚执行完，你需要校验结果。

## 子任务
{step_description}

## 执行结果
{step_result}

## 期望
这个子任务应该完成什么：{step_expectation}

## 校验规则
1. 工具是否成功执行（无报错）
2. 结果是否符合子任务的目标
3. 是否有遗漏或错误

## 输出格式（严格JSON）
```json
{
  "passed": true/false,
  "confidence": 0.0-1.0,
  "error_type": "tool_error|logic_error|understanding_error|null",
  "summary": "一句话总结",
  "suggestion": "如果失败，建议怎么修"
}
```
只输出JSON。"""


class TaskPlanner:
    """任务规划器 — 使用 LLM 分解复杂目标"""

    def __init__(self, llm_call_fn):
        """
        llm_call_fn: async fn(messages: list[dict]) -> str
        一个调用 LLM 并返回文本的函数
        """
        self._llm_call = llm_call_fn
        self.store = TaskStore()

    async def plan(self, goal: str, session_id: str) -> TaskPlan:
        """分析目标，决定是否需要拆分，生成任务计划"""
        # 先检查是否有活跃任务
        existing = self.store.get_active_plan(session_id)
        if existing and existing.status == "active":
            logger.info(f"[plan] Resuming existing plan: {existing.id}")
            return existing

        messages = [
            {"role": "system", "content": PLANNING_PROMPT},
            {"role": "user", "content": f"目标：{goal}"},
        ]

        try:
            raw = await self._llm_call(messages)
            # 提取 JSON
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            data = json.loads(raw)
        except Exception as e:
            logger.warning(f"[plan] LLM planning failed: {e}, treating as simple task")
            data = {"needs_planning": False, "reason": "规划失败，作为简单任务处理", "subtasks": []}

        if not data.get("needs_planning") or not data.get("subtasks"):
            # 简单任务，不需要规划
            plan = TaskPlan(
                id=f"plan-{uuid.uuid4().hex[:8]}",
                session_id=session_id,
                goal=goal,
                status="completed",  # 简单任务直接标记完成
            )
            logger.info(f"[plan] Simple task, no decomposition needed: {data.get('reason', '')}")
            return plan

        # 构建任务计划
        subtasks = []
        for item in data["subtasks"]:
            subtasks.append(SubTask(
                id=item.get("id", f"step_{uuid.uuid4().hex[:6]}"),
                description=item["description"],
                tool_hint=item.get("tool_hint", ""),
                depends_on=item.get("depends_on", []),
            ))

        plan = TaskPlan(
            id=f"plan-{uuid.uuid4().hex[:8]}",
            session_id=session_id,
            goal=goal,
            subtasks=subtasks,
        )
        self.store.save_plan(plan)
        logger.info(f"[plan] Created plan {plan.id} with {len(subtasks)} subtasks")
        return plan

    async def replan(self, plan: TaskPlan, failed_step: SubTask, error: str) -> TaskPlan:
        """失败时动态重规划"""
        if plan.replan_count >= plan.max_replans:
            logger.warning(f"[replan] Max replans reached for plan {plan.id}")
            plan.status = "failed"
            plan.reflection_report = f"超过最大重规划次数({plan.max_replans})，任务终止。最后错误：{error}"
            self.store.save_plan(plan)
            return plan

        plan_json = json.dumps({
            "goal": plan.goal,
            "subtasks": [{"id": s.id, "desc": s.description, "status": s.status.value} for s in plan.subtasks],
        }, ensure_ascii=False, indent=2)

        messages = [
            {"role": "system", "content": REPLAN_PROMPT.format(
                plan_json=plan_json,
                failed_step=f"{failed_step.id}: {failed_step.description}",
                error_info=error[:500],
            )},
            {"role": "user", "content": "请决定如何处理这个失败。"},
        ]

        try:
            raw = await self._llm_call(messages)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            data = json.loads(raw)
        except Exception as e:
            logger.warning(f"[replan] LLM replan failed: {e}, defaulting to retry")
            data = {"action": "retry", "reason": "重规划失败，默认重试"}

        action = data.get("action", "retry")
        reason = data.get("reason", "")
        logger.info(f"[replan] Action: {action}, reason: {reason}")

        if action == "retry":
            failed_step.retry_count += 1
            failed_step.status = StepStatus.PENDING
            failed_step.error = ""
        elif action == "skip":
            failed_step.status = StepStatus.SKIPPED
            failed_step.reflection = f"跳过：{reason}"
        elif action == "replan":
            failed_step.status = StepStatus.REPLANNED
            # 替换后续子任务
            new_subtasks: list[dict] = data.get("new_subtasks", [])
            if new_subtasks:
                idx = plan.subtasks.index(failed_step)
                plan.subtasks = plan.subtasks[:idx]  # 保留已完成的
                for item in new_subtasks:
                    plan.subtasks.append(SubTask(
                        id=str(item.get("id", f"step_{uuid.uuid4().hex[:6]}")),
                        description=str(item.get("description", "")),
                        tool_hint=str(item.get("tool_hint", "")),
                        depends_on=list(item.get("depends_on", [])),
                    ))
            plan.replan_count += 1
        elif action == "abort":
            plan.status = "failed"
            plan.reflection_report = f"任务终止：{reason}"

        self.store.save_plan(plan)
        return plan


# ── 自省引擎 ──────────────────────────────────────────

class SelfReflector:
    """自省引擎 — 每步执行后校验结果"""

    def __init__(self, llm_call_fn):
        self._llm_call = llm_call_fn

    async def reflect(self, step: SubTask, expectation: str = "") -> dict:
        """校验子任务执行结果"""
        if not step.result:
            return {
                "passed": False,
                "confidence": 0.0,
                "error_type": "tool_error",
                "summary": "没有执行结果",
                "suggestion": "检查工具是否正确执行",
            }

        # 简单规则校验：有错误关键词
        error_keywords = ["错误", "失败", "error", "failed", "exception", "traceback"]
        has_error = any(kw in step.result.lower() for kw in error_keywords)

        if has_error:
            return {
                "passed": False,
                "confidence": 0.8,
                "error_type": "tool_error",
                "summary": "执行结果包含错误信息",
                "suggestion": "检查工具参数和执行环境",
            }

        # 对于简单结果（短文本），跳过 LLM 校验以节省 token
        if len(step.result) < 100 and not expectation:
            return {
                "passed": True,
                "confidence": 0.7,
                "error_type": None,
                "summary": "执行成功（简短结果，跳过深度校验）",
                "suggestion": "",
            }

        # 用 LLM 深度校验
        messages = [
            {"role": "system", "content": REFLECTION_PROMPT.format(
                step_description=step.description,
                step_result=step.result[:1000],
                step_expectation=expectation or step.description,
            )},
            {"role": "user", "content": "请校验这个子任务的执行结果。"},
        ]

        try:
            raw = await self._llm_call(messages)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            return json.loads(raw)
        except Exception as e:
            logger.warning(f"[reflect] LLM reflection failed: {e}")
            # 降级：只要有结果就算通过
            return {
                "passed": bool(step.result),
                "confidence": 0.5,
                "error_type": None,
                "summary": f"自省引擎降级处理（LLM调用失败: {e}）",
                "suggestion": "",
            }
