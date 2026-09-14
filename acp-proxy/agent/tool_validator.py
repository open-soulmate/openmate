"""
工具调用结果验证器 — 借鉴ToolBench/ToolLLM结果验证
核心思想：工具返回结果自动验证（格式/内容/安全），防止脏数据进入LLM上下文
"""

import logging
import json
import re
from dataclasses import dataclass, field
from typing import Optional, Any, Callable

logger = logging.getLogger("acp-proxy.tool-validator")


@dataclass
class ValidationRule:
    rule_id: str
    name: str
    description: str
    check_fn: Optional[Callable] = None
    severity: str = "error"  # "error" (阻止) / "warning" (警告) / "info" (信息)
    enabled: bool = True


@dataclass
class ValidationResult:
    valid: bool
    tool_name: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    sanitized_result: Any = None
    metadata: dict = field(default_factory=dict)


class ToolResultValidator:
    """工具结果验证器"""

    def __init__(self):
        self._rules: dict[str, ValidationRule] = {}
        self._stats = {
            "total_validations": 0,
            "passed": 0,
            "failed": 0,
            "warnings": 0,
            "sanitized": 0,
        }
        self._register_default_rules()

    def _register_default_rules(self):
        """注册默认验证规则"""
        self.register(ValidationRule(
            rule_id="not_empty",
            name="结果非空",
            description="工具返回结果不应为空",
            check_fn=lambda r: r is not None and str(r).strip() != "",
            severity="error",
        ))

        self.register(ValidationRule(
            rule_id="no_error_string",
            name="无错误字符串",
            description="结果不应包含未处理的错误信息",
            check_fn=lambda r: not self._contains_error(str(r)),
            severity="warning",
        ))

        self.register(ValidationRule(
            rule_id="max_size",
            name="大小限制",
            description="单个结果不应超过100KB（防止上下文爆炸）",
            check_fn=lambda r: len(str(r)) < 100_000,
            severity="error",
        ))

        self.register(ValidationRule(
            rule_id="no_sensitive_data",
            name="无敏感数据",
            description="结果不应包含密码/token等敏感信息",
            check_fn=lambda r: not self._contains_sensitive(str(r)),
            severity="error",
        ))

        self.register(ValidationRule(
            rule_id="valid_json",
            name="JSON格式正确",
            description="如果看起来像JSON，应该能被解析",
            check_fn=lambda r: self._validate_json_if_applicable(str(r)),
            severity="warning",
        ))

    def _contains_error(self, text: str) -> bool:
        """检测错误字符串"""
        error_patterns = [
            r"Traceback \(most recent call last\)",
            r"Exception:",
            r"Error:",
            r"FATAL",
            r"Permission denied",
            r"Connection refused",
            r"timed out",
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in error_patterns)

    def _contains_sensitive(self, text: str) -> bool:
        """检测敏感数据"""
        sensitive_patterns = [
            r"password\s*[:=]\s*\S+",
            r"api[_-]?key\s*[:=]\s*\S+",
            r"secret\s*[:=]\s*\S+",
            r"token\s*[:=]\s*[A-Za-z0-9]{20,}",
            r"Bearer\s+[A-Za-z0-9]{20,}",
        ]
        return any(re.search(p, text, re.IGNORECASE) for p in sensitive_patterns)

    def _validate_json_if_applicable(self, text: str) -> bool:
        """如果看起来像JSON，验证其格式"""
        text = text.strip()
        if text.startswith(("{", "[")):
            try:
                json.loads(text)
                return True
            except json.JSONDecodeError:
                return False
        return True

    def register(self, rule: ValidationRule):
        """注册验证规则"""
        self._rules[rule.rule_id] = rule

    def validate(self, tool_name: str, result: Any) -> ValidationResult:
        """验证工具结果"""
        self._stats["total_validations"] += 1

        errors = []
        warnings = []
        sanitized = result

        for rule in self._rules.values():
            if not rule.enabled:
                continue

            try:
                if rule.check_fn and not rule.check_fn(result):
                    if rule.severity == "error":
                        errors.append(f"[{rule.name}] {rule.description}")
                    elif rule.severity == "warning":
                        warnings.append(f"[{rule.name}] {rule.description}")
            except Exception as e:
                logger.warning(f"Rule {rule.rule_id} failed: {e}")

        valid = len(errors) == 0

        # 自动清理
        if valid and isinstance(result, str):
            sanitized = self._sanitize(result)
            if sanitized != result:
                self._stats["sanitized"] += 1

        if valid:
            self._stats["passed"] += 1
        else:
            self._stats["failed"] += 1

        if warnings:
            self._stats["warnings"] += 1

        return ValidationResult(
            valid=valid,
            tool_name=tool_name,
            errors=errors,
            warnings=warnings,
            sanitized_result=sanitized,
        )

    def _sanitize(self, text: str) -> str:
        """清理敏感数据"""
        # 替换敏感信息为占位符
        sanitized = re.sub(
            r'(password|api[_-]?key|secret|token)\s*[:=]\s*\S+',
            r'\1=***REDACTED***',
            text,
            flags=re.IGNORECASE,
        )
        # 截断过长结果
        if len(sanitized) > 50_000:
            sanitized = sanitized[:50_000] + "\n...[结果已截断，共" + str(len(text)) + "字符]"

        return sanitized

    def get_stats(self) -> dict:
        return {
            **self._stats,
            "total_rules": len(self._rules),
            "enabled_rules": sum(1 for r in self._rules.values() if r.enabled),
        }
