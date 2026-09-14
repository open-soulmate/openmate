"""
OpenSoul — 风险评估器

理解式风险评估：不靠规则阈值，靠LLM理解意图 + 结合项目记忆 + 经验记忆。
支持多文件风险聚合。
"""

import logging
from typing import List

from soul.data_models import (
    Intent, Risk, RiskAssessment, TaskContext,
)
from soul.memory.project_memory import ProjectMemory
from soul.memory.experience import ExperienceMemory

logger = logging.getLogger(__name__)


class RiskAssessor:
    """理解式风险评估器"""

    def __init__(self, project_memory: ProjectMemory, experience: ExperienceMemory):
        self.project = project_memory
        self.experience = experience

    async def assess(self, intent: Intent, task_ctx: TaskContext) -> RiskAssessment:
        """遍历全部target_files，单文件评估后做风险聚合"""
        all_risks: List[Risk] = []

        # 1. 单文件风险评估
        for file_path in intent.target_files:
            file_risks = self._assess_single_file(file_path, intent)
            all_risks.extend(file_risks)

        # 2. 多文件联动风险
        if len(intent.target_files) > 3:
            all_risks.append(Risk(
                title="多文件改动",
                level="medium",
                desc=f"同时修改{len(intent.target_files)}个文件，建议分步执行",
            ))

        # 3. 历史经验风险
        similar_failures = self.experience.get_similar_failures(intent)
        if similar_failures:
            level = "high" if len(similar_failures) >= 3 else "medium"
            all_risks.append(Risk(
                title="历史失败经验",
                level=level,
                desc=f"类似操作曾失败{len(similar_failures)}次",
            ))

        # 4. 聚合
        overall = self._aggregate_risk_level(all_risks)
        recommendation = self._recommend(all_risks, intent)

        assessment = RiskAssessment(
            risks=all_risks,
            overall_level=overall,
            recommendation=recommendation,
        )

        logger.info("风险评估: level=%s, risks=%d, files=%s",
                     overall, len(all_risks), intent.target_files)
        return assessment

    def _assess_single_file(self, path: str, intent: Intent) -> List[Risk]:
        """单文件风险评估"""
        risks = []

        # 核心文件
        if self.project.is_core_file(path):
            risks.append(Risk(
                title="核心文件修改",
                level="high",
                desc=f"{path}是项目核心文件，被多个模块依赖",
            ))

        # 影响范围
        impact = self.project.get_impact(path)
        if impact.risk_level in ("high", "critical"):
            risks.append(Risk(
                title=f"影响{len(impact.direct_impact)}个直接依赖文件",
                level=impact.risk_level,
                desc=f"直接依赖：{', '.join(impact.direct_impact[:5])}",
            ))

        # 改动规模
        if intent.change_size == "large":
            risks.append(Risk(
                title="大规模改动",
                level="medium",
                desc="建议分步执行，每步验证",
            ))

        return risks

    def _aggregate_risk_level(self, risks: List[Risk]) -> str:
        """多风险聚合：不简单取max，考虑风险叠加"""
        if not risks:
            return "low"

        levels = [r.level for r in risks]

        if "critical" in levels:
            return "critical"

        high_count = levels.count("high")
        if high_count >= 2:
            return "critical"  # 多个高风险叠加 = 临界
        if "high" in levels:
            return "high"

        medium_count = levels.count("medium")
        if medium_count >= 2:
            return "high"  # 多个中风险叠加 = 高
        if "medium" in levels:
            return "medium"

        return "low"

    def _recommend(self, risks: List[Risk], intent: Intent) -> str:
        """基于风险给出建议"""
        if any(r.level == "critical" for r in risks):
            return "风险过高，建议人工审查后执行"
        if any(r.level == "high" for r in risks):
            return "建议：先备份，增量编辑，改完验证"
        if any(r.level == "medium" for r in risks):
            return "建议：增量编辑，改完检查"
        return "正常执行"
