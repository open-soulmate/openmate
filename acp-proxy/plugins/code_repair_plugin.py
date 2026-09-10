# acp-proxy/plugins/code_repair_plugin.py
import logging
import traceback
import json
import os
import re
import tempfile
import hashlib
from datetime import datetime
from typing import Dict, Any, Optional, Tuple, List
from dataclasses import dataclass

# 假设的基础插件类
from .base_plugin import BasePlugin

logger = logging.getLogger(__name__)


@dataclass
class ErrorContext:
    """错误上下文数据类"""
    exception_type: str
    exception_message: str
    traceback_str: str
    filename: str
    line_number: int
    function_name: str
    code_snippet: List[str]
    input_params: Optional[Dict] = None
    timestamp: datetime = None


@dataclass
class RepairSuggestion:
    """修复建议数据类"""
    analysis: str
    root_cause: str
    patch_code: str
    patch_file_path: str
    application_steps: List[str]
    risk_assessment: str


class CodeRepairPlugin(BasePlugin):
    """代码自修复插件，用于增强系统的错误自修复和自编程能力"""
    
    # 安全限制：禁止修改的核心目录和文件模式
    FORBIDDEN_PATHS = [
        "acp-proxy/",
        "main.py",
        "run.py",
        "config.py",
        "settings.py",
        "requirements.txt",
        "setup.py",
        "setup.cfg",
        ".git/",
        ".github/",
        "__pycache__/",
        "node_modules/",
        "venv/",
        "env/",
        ".env"
    ]
    
    # 允许修复的目录
    ALLOWED_DIRECTORIES = [
        "skills/",
        "plugins/",
        "lib/",
        "utils/",
        "modules/"
    ]
    