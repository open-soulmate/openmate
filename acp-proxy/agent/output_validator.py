"""
输出格式验证器 — 借鉴Guardrails AI/Outlines/Instructor
核心思想：LLM输出必须符合预定义schema，自动验证+修复+重新生成
"""

import logging
import json
import re
from dataclasses import dataclass, field
from typing import Any, Optional, Callable
from enum import Enum

logger = logging.getLogger("acp-proxy.output-validator")


class ValidationSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class ValidationResult:
    is_valid: bool
    errors: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)
    repaired_output: Any = None
    original_output: Any = None

    def add_error(self, message: str, path: str = "", severity: ValidationSeverity = ValidationSeverity.ERROR):
        self.errors.append({"message": message, "path": path, "severity": severity.value})
        self.is_valid = False

    def add_warning(self, message: str, path: str = ""):
        self.warnings.append({"message": message, "path": path})


@dataclass
class SchemaField:
    name: str
    type: str  # "string", "number", "boolean", "array", "object"
    required: bool = True
    default: Any = None
    validator: Optional[Callable] = None
    description: str = ""


class OutputValidator:
    """输出格式验证器"""

    def __init__(self):
        self._stats = {"total_validations": 0, "passed": 0, "failed": 0, "repaired": 0}

    def validate_json(self, output: str, schema: dict) -> ValidationResult:
        """验证JSON输出"""
        self._stats["total_validations"] += 1
        result = ValidationResult(is_valid=True, original_output=output)

        # 1. 尝试解析JSON
        parsed = self._extract_json(output)
        if parsed is None:
            result.add_error("Output is not valid JSON", severity=ValidationSeverity.CRITICAL)
            self._stats["failed"] += 1
            return result

        # 2. 验证schema
        self._validate_against_schema(parsed, schema, result)

        # 3. 尝试修复
        if not result.is_valid:
            repaired = self._try_repair(parsed, schema)
            if repaired:
                result.repaired_output = repaired
                self._stats["repaired"] += 1
                logger.info(f"Output repaired: {len(result.errors)} errors fixed")

        if result.is_valid:
            self._stats["passed"] += 1
        else:
            self._stats["failed"] += 1

        return result

    def validate_tool_call(self, output: str, tool_schema: dict) -> ValidationResult:
        """验证工具调用输出"""
        self._stats["total_validations"] += 1
        result = ValidationResult(is_valid=True, original_output=output)

        # 提取工具调用
        tool_call = self._extract_tool_call(output)
        if not tool_call:
            result.add_error("No tool call found in output")
            self._stats["failed"] += 1
            return result

        # 验证工具名
        expected_name = tool_schema.get("name", "")
        if expected_name and tool_call.get("name") != expected_name:
            result.add_error(
                f"Tool name mismatch: expected {expected_name}, got {tool_call.get('name')}"
            )

        # 验证参数
        args_schema = tool_schema.get("parameters", {})
        if args_schema:
            self._validate_against_schema(
                tool_call.get("arguments", {}), args_schema, result
            )

        if result.is_valid:
            self._stats["passed"] += 1
        else:
            self._stats["failed"] += 1

        return result

    def _extract_json(self, text: str) -> Optional[Any]:
        """从文本中提取JSON"""
        # 尝试直接解析
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 尝试提取```json块
        json_match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # 尝试提取{...}或[...]
        for pattern in [r"\{.*\}", r"\[.*\]"]:
            match = re.search(pattern, text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    continue

        return None

    def _extract_tool_call(self, text: str) -> Optional[dict]:
        """提取工具调用"""
        # 常见格式: {"name": "...", "arguments": {...}}
        json_data = self._extract_json(text)
        if isinstance(json_data, dict):
            if "name" in json_data or "tool" in json_data or "function" in json_data:
                return {
                    "name": json_data.get("name") or json_data.get("tool") or json_data.get("function"),
                    "arguments": json_data.get("arguments") or json_data.get("args") or json_data.get("parameters") or {},
                }
        return None

    def _validate_against_schema(self, data: Any, schema: dict, result: ValidationResult, path: str = ""):
        """递归验证schema"""
        if not isinstance(schema, dict):
            return

        schema_type = schema.get("type", "")

        if schema_type == "object":
            if not isinstance(data, dict):
                result.add_error(f"Expected object at {path}, got {type(data).__name__}", path)
                return

            properties = schema.get("properties", {})
            required = schema.get("required", [])

            # 检查必填字段
            for req_field in required:
                if req_field not in data:
                    result.add_error(f"Missing required field: {req_field}", f"{path}.{req_field}")

            # 验证每个字段
            for field_name, field_schema in properties.items():
                if field_name in data:
                    self._validate_against_schema(
                        data[field_name], field_schema, result, f"{path}.{field_name}"
                    )

        elif schema_type == "array":
            if not isinstance(data, list):
                result.add_error(f"Expected array at {path}, got {type(data).__name__}", path)
                return

            items_schema = schema.get("items", {})
            for i, item in enumerate(data):
                self._validate_against_schema(item, items_schema, result, f"{path}[{i}]")

        elif schema_type == "string":
            if not isinstance(data, str):
                result.add_error(f"Expected string at {path}, got {type(data).__name__}", path)

            # 枚举检查
            if "enum" in schema and data not in schema["enum"]:
                result.add_error(
                    f"Value '{data}' not in enum {schema['enum']} at {path}", path
                )

        elif schema_type == "number":
            if not isinstance(data, (int, float)):
                result.add_error(f"Expected number at {path}, got {type(data).__name__}", path)
            else:
                if "minimum" in schema and data < schema["minimum"]:
                    result.add_warning(f"Value {data} below minimum {schema['minimum']} at {path}", path)
                if "maximum" in schema and data > schema["maximum"]:
                    result.add_warning(f"Value {data} above maximum {schema['maximum']} at {path}", path)

        elif schema_type == "boolean":
            if not isinstance(data, bool):
                result.add_error(f"Expected boolean at {path}, got {type(data).__name__}", path)

    def _try_repair(self, data: Any, schema: dict) -> Optional[Any]:
        """尝试修复数据"""
        if not isinstance(data, dict) or not isinstance(schema, dict):
            return None

        repaired = dict(data)
        properties = schema.get("properties", {})
        required = schema.get("required", [])

        # 填充缺失的必填字段（使用默认值）
        for req_field in required:
            if req_field not in repaired:
                field_schema = properties.get(req_field, {})
                default = field_schema.get("default")
                if default is not None:
                    repaired[req_field] = default
                elif field_schema.get("type") == "string":
                    repaired[req_field] = ""
                elif field_schema.get("type") == "number":
                    repaired[req_field] = 0
                elif field_schema.get("type") == "boolean":
                    repaired[req_field] = False
                elif field_schema.get("type") == "array":
                    repaired[req_field] = []
                elif field_schema.get("type") == "object":
                    repaired[req_field] = {}

        return repaired

    def get_stats(self) -> dict:
        total = self._stats["total_validations"]
        return {
            **self._stats,
            "pass_rate": f"{self._stats['passed'] / max(total, 1) * 100:.1f}%",
            "repair_rate": f"{self._stats['repaired'] / max(self._stats['failed'], 1) * 100:.1f}%",
        }
