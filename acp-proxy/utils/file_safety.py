"""
文件安全写入 — 原子写入（防进程中断）

使用方式：
    from utils.file_safety import atomic_write
    atomic_write(path, content)  # 原子写入，绝不留半写文件

注意：内容校验（语法、行数、截断）在LLM Gateway层完成，不在此处。
"""

import logging
import os
import tempfile
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
    path = Path(path)
    tmp_path = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding=encoding,
            dir=str(path.parent),
            suffix=".tmp",
            delete=False,
        ) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        os.replace(tmp_path, str(path))
        return True, ""
    except Exception as e:
        logger.error(f"Atomic write failed: {path} - {e}")
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
        return False, f"Atomic write failed: {e}"
