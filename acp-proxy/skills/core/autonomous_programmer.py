"""
autonomous_programmer.py - 核心技能：自编程能力引擎
专注于攻克'自编程能力'，实现自动生成代码并验证的闭环流程。
"""

import logging
from typing import Dict, List, Any, Optional
from pathlib import Path
import json

from ..base_skill import BaseSkill
from ..llm_integration import LLMIntegration
from ..sandbox.code_executor import SandboxExecutor
from ..utils.file_utils import read_file_content

logger = logging.getLogger(__name__)


class AutonomousProgrammer(BaseSkill):
    """
    自编程技能：通过LLM生成代码，沙箱执行验证，错误修复的闭环流程。
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """初始化自编程器"""
        super().__init__()
        self.skill_name = "autonomous_programmer"
        self.description = "自编程能力技能，通过LLM生成代码并验证修复"
        self.llm = LLMIntegration()
        self.sandbox = SandboxExecutor()
        self.max_retries = 3  # 最大重试次数
        self.test_case_timeout = 30  # 测试用例执行超时时间(秒)
        
        # 加载配置
        self.config = config or {}
        self.verbose = self.config.get("verbose", True)
        
    def generate_and_verify(self, task_description: str, context_files: List[str]) -> Dict[str, Any]:
        """
        生成代码并验证的核心方法。
        
        Args:
            task_description: 自然语言描述的编程任务
            context_files: 相关上下文文件路径列表
            
        Returns:
            包含结果的字典:
            {
                "success": bool,  # 整体是否成功
                "final_code": str,  # 最终生成的代码
                "execution_log": str,  # 执行日志
                "verification_passed": bool,  # 验证是否通过
                "iterations": int  # 尝试次数
            }
        """
        logger.info(f"开始自编程任务: {task_description}")
        
        # 读取上下文文件内容
        context_contents = self._read_context_files(context_files)
        
        # 生成初始代码
        current_code = self._generate_initial_code(task_description, context_contents)
        
        # 验证循环
        execution_log = ""
        verification_passed = False
        
        for iteration in range(self.max_retries):
            logger.info(f"第 {iteration + 1} 次尝试")
            
            # 1. 生成测试用例
            test_cases = self._generate_test_cases(task_description, current_code, context_contents)
            
            # 2. 在沙箱中执行代码和测试用例