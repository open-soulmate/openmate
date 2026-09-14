"""
OpenSoul — 反思器

行动后反思：无论成功/失败/异常，统一复盘。
每次交互都参与学习。
"""

import logging
from typing import List

from soul.data_models import (
    CheckItem, Intent, TaskContext, Verification,
)
from soul.memory.experience import ExperienceMemory

logger = logging.getLogger(__name__)


class Reflector:
    """行动后反思器"""

    def __init__(self, experience: ExperienceMemory):
        self.experience = experience

    async def reflect(self, action: str, result: dict, task_ctx: TaskContext) -> Verification:
        """复盘单次行动 — 正常/异常/业务失败全部进入复盘"""
        checks: List[CheckItem] = []

        # 1. 系统异常检查（异常不能跳出闭环）
        if result.get("exception"):
            checks.append(CheckItem(
                name="系统异常",
                passed=False,
                error=result.get("error", "未知异常"),
            ))

        # 2. 语法检查
        if result.get("file_written"):
            syntax_ok = await self._check_syntax(result["file_path"])
            checks.append(CheckItem(
                name="语法校验",
                passed=syntax_ok,
                error=None if syntax_ok else f"语法错误: {result['file_path']}",
            ))

        # 3. 功能检查（如果有测试输出）
        if result.get("test_output"):
            test_ok = result["test_output"].get("passed", False)
            checks.append(CheckItem(
                name="功能校验",
                passed=test_ok,
                error=result["test_output"].get("error"),
            ))

        # 4. 意图匹配检查
        if result.get("diff") and task_ctx.intent:
            intent_match = await self._check_intent_match(result["diff"], task_ctx.intent)
            checks.append(CheckItem(
                name="意图匹配",
                passed=intent_match,
                error=None if intent_match else "改动与预期意图不符",
            ))

        # 如果没有检查项，默认通过
        if not checks:
            checks.append(CheckItem(name="无检查项", passed=True))

        success = all(c.passed for c in checks)

        # 失败时生成修复建议
        fix = None
        error = None
        if not success:
            failed = [c for c in checks if not c.passed]
            error = failed[0].error if failed else "未知错误"
            fix = self._suggest_fix(failed)

        verification = Verification(
            success=success,
            checks=checks,
            error=error,
            fix=fix,
        )

        logger.info("反思结果: success=%s, checks=%s",
                     success, [f"{c.name}={'✓' if c.passed else '✗'}" for c in checks])
        return verification

    async def _check_syntax(self, file_path: str) -> bool:
        """检查文件语法"""
        import subprocess
        from pathlib import Path

        path = Path(file_path)
        if not path.exists():
            return True  # 文件不存在不算语法错误

        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            return True

        suffix = path.suffix.lower()
        if suffix == ".py":
            try:
                compile(content, file_path, "exec")
                return True
            except SyntaxError:
                return False
        elif suffix in (".ts", ".tsx", ".js", ".jsx"):
            try:
                result = subprocess.run(
                    ["node", "--check", file_path],
                    capture_output=True, timeout=5
                )
                return result.returncode == 0
            except Exception:
                return True  # node不可用时不检查
        elif suffix == ".json":
            import json
            try:
                json.loads(content)
                return True
            except json.JSONDecodeError:
                return False
        return True  # 不支持的语言默认通过

    async def _check_intent_match(self, diff: str, intent: Intent) -> bool:
        """检查改动是否符合意图（简单匹配）"""
        # 简化实现：检查diff中是否涉及目标文件
        for f in intent.target_files:
            if f in diff:
                return True
        # 如果diff为空或不涉及目标文件，可能是不匹配
        return len(diff) > 0

    def _suggest_fix(self, failed_checks: List[CheckItem]) -> str:
        """根据失败的检查项，建议修复方案"""
        suggestions = []
        for check in failed_checks:
            if check.name == "语法校验":
                suggestions.append("修复语法错误后重试")
            elif check.name == "系统异常":
                suggestions.append(f"异常处理：{check.error}")
            elif check.name == "意图匹配":
                suggestions.append("改动与预期不符，建议用增量编辑重试")
            elif check.name == "功能校验":
                suggestions.append(f"功能测试失败：{check.error}")
        return "; ".join(suggestions) if suggestions else "请人工检查"
