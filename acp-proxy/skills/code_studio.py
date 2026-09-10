# acp-proxy/skills/code_studio.py
import os
import tempfile
import signal
from typing import Dict, Any, Optional, Tuple
from contextlib import contextmanager

class CodeStudioSkill:
    """
    Code Studio技能：实现自编程和工具创造的沙箱执行引擎
    接收明确的任务描述，在安全环境中生成、测试和输出代码
    """
    
    def __init__(self, workspace_root: str = "workspace/generated"):
        """
        初始化Code Studio技能
        
        Args:
            workspace_root: 生成代码的根目录
        """
        self.workspace_root = workspace_root
        self._ensure_workspace_exists()
        
        # 定义安全的执行环境（受限全局变量）
        self.restricted_globals = self._create_restricted_globals()
        
    def _ensure_workspace_exists(self):
        """确保工作空间目录存在"""
        os.makedirs(self.workspace_root, exist_ok=True)
    
    def _create_restricted_globals(self) -> Dict[str, Any]:
        """
        创建安全的受限全局变量环境
        
        Returns:
            包含安全内置函数和常量的字典
        """
        # 只暴露安全的内置函数
        safe_builtins = {
            'abs': abs,
            'bool': bool,
            'bytes': bytes,
            'chr': chr,
            'dict': dict,
            'float': float,
            'frozenset': frozenset,
            'int': int,
            'len': len,
            'list': list,
            'max': max,
            'min': min,
            'pow': pow,
            'print': print,  # 允许输出用于调试
            'range': range,
            'repr': repr,
            'set': set,
            'slice': slice,
            'sorted': sorted,
            'str': str,
            'sum': sum,
            'tuple': tuple,
            'type': type,
            'zip': zip,
            'enumerate': enumerate,
            'filter': filter,
            'map': map,
            'reversed': reversed,
        }
        
        # 添加安全的模块（如果需要）
        safe_imports = {}
        
        # 合并全局变量
        restricted_globals = {
            '__builtins__': safe_builtins,
            **safe_imports
        }
        
        return restricted_globals
    
    @contextmanager
    def _timeout_context(self, seconds: int = 30):
        """
        超时上下文管理器
        
        Args:
            seconds: 超时秒数
        """
        def timeout_handler(signum, frame):
            raise TimeoutError(f"代码执行超时 ({seconds}秒)")
        
        # 设置信号处理器
        old_handler = signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(seconds)
        
        try:
            yield
        finally:
            # 恢复原始处理器并取消警报
            signal.signal(signal.SIGALRM, old_handler)
            signal.alarm(0)
    
    def _generate_plan(self, task_description: str) -> Dict[str, Any]:
        """
        根据任务描述生成实现计划
        
        Args:
            task_description: 任务描述字符串
            
        Returns:
            实现计划字典
        """
        # 简化实现：根据任务描述解析基本要素
        # 实际应用中这里可以调用LLM来生成更复杂的计划
        
        plan = {
            "task": task_description,
            "functions": [],
            "main_function": None,
            "inputs": [],
            "outputs": [],
            "steps": []
        }
        
        # 从任务描述中提取关键信息
        task_lower = task_description.lower()
        
        # 检测是否包含特定模式
        if "function" in task_lower or "定义" in task_description:
            plan["main_function"] = "main_function"
            plan["functions"].append(plan["main_function"])
            plan["inputs"] = ["*args", "**kwargs"]
            plan["outputs"] = ["result"]
            
            # 生成基本步骤
            plan["steps"] = [
                "解析输入参数",
                "执行核心逻辑",
                "返回结果"
            ]
        
        return plan
    
    def _generate_code(self, plan: Dict[str, Any]) -> str:
        """
        根据计划生成Python代码
        
        Args:
            plan: 实现计划
            
        Returns:
            生成的Python代码字符串
        """
        # 基本代码模板