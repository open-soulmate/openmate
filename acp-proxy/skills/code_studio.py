import os
import sys
import json
import signal
import tempfile
import traceback
from typing import Any, Dict, Optional, Tuple, Union
from contextlib import contextmanager
from pathlib import Path

# 导入ACP基础类（假设存在）
from acp_proxy.skills.base import BaseSkill


class TimeoutError(Exception):
    pass


@contextmanager
def timeout(seconds: int):
    """超时上下文管理器"""
    def timeout_handler(signum, frame):
        raise TimeoutError("代码执行超时")
    
    # 保存旧的信号处理器
    old_handler = signal.signal(signal.SIGALRM, timeout_handler)