import sys
import io
import contextlib
import traceback
import json
import math
from typing import Dict, Any, Optional, Union
import ast

class SelfCodeGenerator:
    """
    自编程技能类，用于根据自然语言描述生成并执行Python代码
    """
    
    def __init__(self):
        """初始化自编程生成器"""
        # 安全限制：允许的模块白名单
        self.safe_modules = {
            'math': math,
            'json': json
        }
        
        # 允许的内置函数
        self.safe_builtins = {
            'print': print,
            'len': len,
            'range': range,
            'int': int,
            'float': float,
            'str': str,
            'list': list,
            'dict': dict,
            'set': set,
            'tuple': tuple,
            'bool': bool,
            'abs': abs,
            'max': max,
            'min': min,
            'sum': sum,
            'sorted': sorted,
            'reversed': reversed,
            'enumerate': enumerate,
            'zip': zip,
            'map': map,
            'filter': filter,
            'type': type,
            'isinstance': isinstance,
            'issubclass': issubclass,
            'hasattr': hasattr,
            'getattr': getattr,
            'setattr': setattr,
            'delattr': delattr,
            'property': property,
            'staticmethod': staticmethod,
            'classmethod': classmethod,
            'super': super,
            'object': object,
            'Exception': Exception,
            'ValueError': ValueError,
            'TypeError': TypeError,
            'KeyError': KeyError,
            'IndexError': IndexError,
            'AttributeError': AttributeError,
            'RuntimeError': RuntimeError,
            'StopIteration': StopIteration,
            'None': None,
            'True': True,
            'False': False,
            '__import__': self._safe_import
        }
        
        # 禁止的关键词列表
        self.forbidden_keywords = [
            'os', 'subprocess', 'sys', 'shutil', 'glob',
            'io', 'socket', 'http', 'urllib', 'requests',
            'open', 'file', 'read', 'write', 'exec', 'eval',
            'compile', 'globals', 'locals', 'execfile',
            'input', 'raw_input', 'vars', 'dir', 'exit',
            'quit', 'reload', 'breakpoint', 'pdb', 'traceback'
        ]
        
    def _safe_import(self, name: str, *args, **kwargs) -> Any:
        """安全的导入函数，只允许导入白名单中的模块"""
        if name in self.safe_modules:
            return self.safe_modules[name]
        else:
            raise ImportError(f"安全限制：不允许导入模块 '{name}'")
    