"""
OpenSoul — 大脑主控

Agent的大脑 — 调度四层认知流水线。
SoulBrain不是替代工具，是工具的大脑层。
只做思考、评估、决策、复盘，不直接操作文件。
"""

import logging
import uuid
from typing import Optional

from soul.data_models import (
    Decision, Intent, Risk, RiskAssessment,
    TaskContext, Verification,
)
from soul.memory.project_memory import ProjectMemory
from soul.memory.experience import ExperienceMemory
from soul.memory.user_memory import UserMemory
from soul.risk.assessor import RiskAssessor
from soul.reflection.reflector import Reflector

logger = logging.getLogger(__name__)


class SoulBrain:
    """Agent的大脑 — 调度四层认知流水线"""

    def __init__(self, repo_root: str):
        self.project_memory = ProjectMemory(repo_root)
        self.user_memory = UserMemory()
        self.experience = ExperienceMemory()
        self.assessor = RiskAssessor(self.project_memory, self.experience)
        self.reflector = Reflector(self.experience)
        logger.info("SoulBrain初始化完成, repo=%s", repo_root)

    async def think(self, user_input: str, task_ctx: TaskContext) -> Decision:
        """思考主入口：用户输入 → 执行决策"""
        task_ctx.user_input = user_input
        if not task_ctx.task_id:
            task_ctx.task_id = str(uuid.uuid4())[:8]

        # 1. 意图理解
        intent = await self._understand_intent(user_input, task_ctx)
        task_ctx.intent = intent

        # 2. 风险评估（考虑历史验证失败的升级）
        risk = await self.assessor.assess(intent, task_ctx)
        
        # 3. 如果存在历史验证失败，升级风险等级
        if task_ctx.verification and not task_ctx.verification.success:
            risk = self._escalate_risk_after_failure(risk, task_ctx)
        
        task_ctx.risk = risk

        # 4. 策略决策
        decision = self._decide(intent, risk, task_ctx)
        task_ctx.decision = decision

        logger.info("思考完成: goal=%s, files=%s, risk=%s, execute=%s",
                     intent.goal, intent.target_files,
                     risk.overall_level, decision.execute_mode)
        return decision

    async def verify(self, action: str, result: dict, task_ctx: TaskContext) -> Verification:
        """执行后反思验证 — 无论成功/失败/异常都进入复盘"""
        # 调用reflector.reflect进行反思验证
        verification = await self.reflector.reflect(action, result, task_ctx)
        
        # 确保verification结构完整
        if not isinstance(verification, Verification):
            logger.error("reflector.reflect返回了非Verification对象: %s", type(verification))
            verification = Verification(
                success=False,
                checks=[],
                summary="反思验证返回值类型错误",
                retry_suggested=True
            )
        
        # 将验证结果整合回任务上下文
        task_ctx.verification = verification

        # 学习：记住这次的结果
        self.experience.record(action, result, verification, task_ctx)

        # 更新任务上下文历史
        task_ctx.history.append({
            "action": action,
            "success": verification.success,
            "checks": [(c.name, c.passed) for c in verification.checks],
            "summary": verification.summary
        })

        # 根据验证结果更新任务状态
        if not verification.success:
            task_ctx.retry_count = getattr(task_ctx, 'retry_count', 0) + 1
            logger.warning("验证失败: action=%s, summary=%s, retry_count=%d",
                          action, verification.summary, task_ctx.retry_count)
            
            # 如果建议重试且未超过重试次数限制，标记需要重新决策
            if verification.retry_suggested and task_ctx.retry_count < 3:
                task_ctx.needs_re_decision = True
                logger.info("标记需要重新决策: retry_count=%d", task_ctx.retry_count)
        else:
            # 验证成功，重置重试计数
            task_ctx.retry_count = 0
            task_ctx.needs_re_decision = False
            logger.info("验证成功: action=%s", action)

        return verification

    def _escalate_risk_after_failure(self, risk: RiskAssessment, task_ctx: TaskContext) -> RiskAssessment:
        """验证失败后升级风险等级"""
        escalation_map = {
            "low": "medium",
            "medium": "high", 
            "high": "critical",
            "critical": "critical"
        }
        
        previous_risk = risk.overall_level
        new_risk_level = escalation_map.get(previous_risk, "high")
        
        # 创建升级后的风险评估
        escalated_risk = RiskAssessment(
            overall_level=new_risk_level,
            factors=risk.factors + [Risk(
                name="verification_failure",
                level=new_risk_level,
                description=f"前次验证失败，风险从{previous_risk}升级到{new_risk_level}"
            )],
            mitigations=risk.mitigations + ["建议用户确认后继续"],
            require_confirmation=True
        )
        
        logger.info("风险升级: %s -> %s (原因: 验证失败)", previous_risk, new_risk_level)
        return escalated_risk

    def _decide(self, intent: Intent, risk: RiskAssessment, task_ctx: TaskContext) -> Decision:
        """策略决策：基于意图、风险和上下文生成执行决策"""
        # 基础执行模式
        execute_mode = "auto"
        
        # 高风险需要确认
        if risk.overall_level in ("high", "critical"):
            execute_mode = "confirm"
        
        # 验证失败重试时需要确认
        if getattr(task_ctx, 'retry_count', 0) > 0:
            execute_mode = "confirm"
        
        # 构建决策
        decision = Decision(
            execute_mode=execute_mode,
            target_files=intent.target_files,
            action_plan=self._build_action_plan(intent, risk),
            risk_level=risk.overall_level,
            requires_confirmation=(execute_mode == "confirm"),
            retry_from_failure=getattr(task_ctx, 'needs_re_decision', False)
        )
        
        return decision

    def _build_action_plan(self, intent: Intent, risk: RiskAssessment) -> list:
        """构建行动计划"""
        plan = []
        plan.append(f"目标: {intent.goal}")
        plan.append(f"文件: {', '.join(intent.target_files)}")
        plan.append(f"风险等级: {risk.overall_level}")
        if risk.mitigations:
            plan.append(f"缓解措施: {', '.join(risk.mitigations)}")
        return plan

    async def _understand_intent(self, user_input: str, task_ctx: TaskContext) -> Intent:
        """意图理解：用规则+模式匹配解析用户意图

        Phase 1: 基于关键词的简单匹配
        Phase 2: 用LLM做深度意图理解
        """
        text = user_input.lower()

        # 目标文件提取
        target_files = self._extract_target_files(user_input)

        # 目标类型判断
        goal = self._classify_goal(text)

        # 改动规模估算
        change_size = self._estimate_change_size(text, goal)

        # 改动范围
        if len(target_files) > 3:
            modify_scope = "multi_file"
        elif len(target_files) > 1:
            modify_scope = "few_files"
        elif len(target_files) == 1:
            modify_scope = "single_file"
        else:
            modify_scope = "ambiguous"

        # 构建Intent对象
        intent = Intent(
            goal=goal,
            target_files=target_files,
            change_size=change_size,
            modify_scope=modify_scope,
            raw_input=user_input,
            context=task_ctx
        )

        return intent

    def _extract_target_files(self, user_input: str) -> list:
        """提取目标文件列表"""
        import re
        # 匹配常见的文件路径模式