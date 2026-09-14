"""
Agent输出格式化器 — 借鉴LangChain OutputParser + Anthropic XML tags
核心思想：将Agent输出格式化为前端友好的结构化格式
"""

import logging
import re
import json
from dataclasses import dataclass, field
from typing import Optional, Any

logger = logging.getLogger("acp-proxy.output-formatter")


@dataclass
class FormattedOutput:
    content_type: str  # "text", "markdown", "code", "json", "table", "mermaid"
    content: str
    language: str = ""  # 代码语言
    metadata: dict = field(default_factory=dict)


class OutputFormatter:
    """输出格式化器"""

    def __init__(self):
        self._stats = {"total_formatted": 0, "by_type": {}}

    def format(self, raw_output: str) -> FormattedOutput:
        """自动检测并格式化输出"""
        self._stats["total_formatted"] += 1

        if not raw_output or not raw_output.strip():
            return FormattedOutput(content_type="text", content="")

        # 检测JSON
        if self._looks_like_json(raw_output):
            return self._format_json(raw_output)

        # 检测代码块
        code_match = re.search(r'```(\w*)\n(.*?)```', raw_output, re.DOTALL)
        if code_match:
            lang = code_match.group(1) or "text"
            return FormattedOutput(
                content_type="code",
                content=code_match.group(2).strip(),
                language=lang,
            )

        # 检测Mermaid
        if "graph " in raw_output or "sequenceDiagram" in raw_output or "flowchart" in raw_output:
            return FormattedOutput(
                content_type="mermaid",
                content=raw_output.strip(),
            )

        # 检测表格
        if self._looks_like_table(raw_output):
            return FormattedOutput(
                content_type="table",
                content=raw_output.strip(),
            )

        # 默认markdown
        self._stats["by_type"]["markdown"] = self._stats["by_type"].get("markdown", 0) + 1
        return FormattedOutput(content_type="markdown", content=raw_output)

    def _looks_like_json(self, text: str) -> bool:
        text = text.strip()
        if text.startswith(("{", "[")):
            try:
                json.loads(text)
                return True
            except json.JSONDecodeError:
                return False
        return False

    def _format_json(self, text: str) -> FormattedOutput:
        try:
            data = json.loads(text)
            pretty = json.dumps(data, indent=2, ensure_ascii=False)
            self._stats["by_type"]["json"] = self._stats["by_type"].get("json", 0) + 1
            return FormattedOutput(
                content_type="json",
                content=pretty,
                language="json",
            )
        except json.JSONDecodeError:
            return FormattedOutput(content_type="text", content=text)

    def _looks_like_table(self, text: str) -> bool:
        lines = text.strip().split("\n")
        if len(lines) < 2:
            return False
        # 检查是否有Markdown表格格式
        return any("|" in line for line in lines[:3])

    def extract_tool_calls(self, text: str) -> list[dict]:
        """从输出中提取工具调用"""
        # 匹配function_call格式
        calls = []
        pattern = r'<function_call>\s*(\{.*?\})\s*</function_call>'
        for match in re.finditer(pattern, text, re.DOTALL):
            try:
                calls.append(json.loads(match.group(1)))
            except json.JSONDecodeError:
                pass
        return calls

    def split_by_tags(self, text: str, tag: str) -> list[str]:
        """按XML标签分割内容"""
        pattern = f'<{tag}>(.*?)</{tag}>'
        return [m.strip() for m in re.findall(pattern, text, re.DOTALL)]

    def get_stats(self) -> dict:
        return self._stats
