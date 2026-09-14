"""
文件安全写入 — 原子写入 + 编辑验证

使用方式：
    from utils.file_safety import atomic_write, dry_run_edits, find_closest_match
    atomic_write(path, content)  # 原子写入
    error, content = dry_run_edits(old, edits)  # 干跑验证
"""

import json
import logging
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

logger = logging.getLogger(__name__)


def atomic_write(
    path: str | Path,
    content: str,
    encoding: str = "utf-8",
) -> tuple[bool, str]:
    """原子写入：tempfile + os.replace，绝不留半写文件

    来源：OpenHands editor.py:448-473

    返回：(成功与否, 错误信息)
    """
    file_path = Path(path)
    tmp_path = None
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding=encoding,
            dir=str(file_path.parent),
            suffix=".tmp",
            delete=False,
        ) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        os.replace(tmp_path, str(file_path))
        return True, ""
    except Exception as e:
        logger.error(f"Atomic write failed: {path} - {e}")
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
        return False, f"Atomic write failed: {e}"


def dry_run_edits(old_content: str, edits: list[dict]) -> tuple[str | None, str]:
    """干跑验证所有编辑，返回 (错误信息, 验证后内容)

    来源：Aider base_coder.py:2296-2304
    """
    content = old_content
    for i, edit in enumerate(edits):
        old_str = edit.get("old_string", "")
        new_str = edit.get("new_string", "")

        if not old_str:
            return f"Edit {i}: old_string is empty", ""
        if old_str == new_str:
            return f"Edit {i}: old_string equals new_string (no-op)", ""

        count = content.count(old_str)
        if count == 0:
            hint = find_closest_match(content, old_str)
            if hint:
                return (
                    f"Edit {i}: old_string not found exactly. Did you mean:\n"
                    f"  FOUND: {hint[:200]}\n"
                    f"  WANTED: {old_str[:200]}",
                    "",
                )
            return f"Edit {i}: old_string not found: {old_str[:100]}...", ""
        if count > 1:
            return f"Edit {i}: old_string matched {count} times. Provide more context.", ""

        content = content.replace(old_str, new_str, 1)

    return None, content


def find_closest_match(content: str, target: str) -> str | None:
    """5种策略查找最相似的文本片段

    来源：MiMo Code edit.ts:710-745
    """
    content_lines = content.splitlines()
    target_lines = target.splitlines()

    if not target_lines:
        return None

    # 策略1: 行级trim匹配
    target_trimmed = "\n".join(l.strip() for l in target_lines)
    for i in range(len(content_lines)):
        for j in range(i + 1, min(i + len(target_lines) + 5, len(content_lines) + 1)):
            candidate = "\n".join(l.strip() for l in content_lines[i:j])
            if candidate == target_trimmed:
                return "\n".join(content_lines[i:j])

    # 策略2: 缩进灵活匹配
    target_dedented = "\n".join(re.sub(r"^\s+", "", l) for l in target_lines)
    for i in range(len(content_lines)):
        for j in range(i + 1, min(i + len(target_lines) + 5, len(content_lines) + 1)):
            candidate = "\n".join(re.sub(r"^\s+", "", l) for l in content_lines[i:j])
            if candidate == target_dedented:
                return "\n".join(content_lines[i:j])

    # 策略3: 空白归一化
    def normalize_ws(s):
        return re.sub(r"\s+", " ", s).strip()

    target_norm = normalize_ws(target)
    for i in range(len(content_lines)):
        for j in range(i + 1, min(i + len(target_lines) + 5, len(content_lines) + 1)):
            candidate = normalize_ws("\n".join(content_lines[i:j]))
            if candidate == target_norm:
                return "\n".join(content_lines[i:j])

    # 策略4: 块锚点匹配
    if len(target_lines) >= 2:
        first_line = target_lines[0].strip()
        last_line = target_lines[-1].strip()
        for i, line in enumerate(content_lines):
            if line.strip() == first_line:
                for j in range(i + 1, min(i + len(target_lines) + 10, len(content_lines))):
                    if content_lines[j].strip() == last_line:
                        return "\n".join(content_lines[i : j + 1])

    # 策略5: 部分匹配
    if len(target_lines) >= 3:
        prefix = "\n".join(l.strip() for l in target_lines[:3])
        for i in range(len(content_lines) - 2):
            candidate = "\n".join(l.strip() for l in content_lines[i : i + 3])
            if candidate == prefix:
                end = min(i + len(target_lines), len(content_lines))
                return "\n".join(content_lines[i:end])

    return None
