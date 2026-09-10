"""
autonomous_programmer.py
核心技能：自编程能力引擎
实现"执行-验证-修复"的代码生成闭环
"""
import asyncio
import json
import logging
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path

# 假设项目结构中的导入
try:
    from acp_proxy.agents.llm_client import get_llm_client
    from acp_proxy.sandbox.python_executor import PythonSandbox
    from acp_proxy.skills.base_skill import BaseSkill
    from acp_proxy.utils.logger import get_logger
except ImportError:
    # 备用导入路径
    from agents.llm_client import get_llm_client
    from sandbox.python_executor import PythonSandbox
    from skills.base_skill import BaseSkill
    from utils.logger import get_logger

logger = get_logger(__name__)

class AutonomousProgrammer(BaseSkill):
    """
    自编程能力技能：接受自然语言编程任务，生成代码并执行验证-修复循环
    """
    
    def __init__(self, config: Optional[Dict] = None):
        """
        初始化自编程技能
        
        Args:
            config: 配置字典，可包含：
                - max_attempts: 最大重试次数（默认3）
                - sandbox_timeout: 沙箱执行超时时间（秒）
                - llm_model: 使用的LLM模型名称
                - temperature: LLM生成温度
        """
        super().__init__(skill_name="autonomous_programmer", config=config)
        
        # 配置参数
        self.max_attempts = config.get("max_attempts", 3) if config else 3
        self.sandbox_timeout = config.get("sandbox_timeout", 30) if config else 30
        self.llm_model = config.get("llm_model", "gpt-4-turbo") if config else "gpt-4-turbo"
        self.temperature = config.get("temperature", 0.3) if config else 0.3
        
        # 初始化组件
        self.llm_client = None
        self.sandbox = PythonSandbox(timeout=self.sandbox_timeout)
        
        logger.info(f"AutonomousProgrammer initialized with max_attempts={self.max_attempts}")
    
    async def _initialize_llm_client(self) -> bool:
        """
        初始化LLM客户端
        
        Returns:
            是否初始化成功
        """
        try:
            self.llm_client = get_llm_client(model=self.llm_model, temperature=self.temperature)
            return True
        except Exception as e:
            logger.error(f"Failed to initialize LLM client: {e}")
            return False
    
    async def generate_and_verify(self, task_description: str, context_files: List[str]) -> Dict[str, Any]:
        """
        主要方法：生成代码并执行验证-修复循环
        
        Args:
            task_description: 自然语言描述的编程任务
            context_files: 上下文文件路径列表
            
        Returns:
            结果字典，格式：
            {
                "success": bool,          # 是否成功
                "final_code": str,        # 最终代码
                "execution_log": str,     # 执行日志
                "verification_passed": bool  # 验证是否通过
            }
        """
        # 初始化结果字典
        result = {
            "success": False,
            "final_code": "",
            "execution_log": "",
            "verification_passed": False
        }
        
        # 1. 确保LLM客户端已初始化
        if not self.llm_client:
            if not await self._initialize_llm_client():
                result["execution_log"] = "Failed to initialize LLM client"
                return result
        
        # 2. 读取上下文文件内容
        context_content = await self._read_context_files(context_files)
        
        # 3. 初始化执行日志
        execution_log = []
        current_code = ""
        
        # 4. 执行验证-修复循环
        for attempt in range(1, self.max_attempts + 1):
            logger.info(f"Attempt {attempt}/{self.max_attempts}")
            execution_log.append(f"--- Attempt {attempt} ---")
            
            # 4.1 生成代码（第一次或修复后重新生成）
            if attempt == 1:
                # 第一次尝试：生成初始代码
                code_generation_prompt = self._create_generation_prompt(
                    task_description, context_content
                )
            else:
                # 后续尝试：根据错误修复代码
                code_generation_prompt = self._create_fix_prompt(
                    task_description, context_content, current_code, last_error
                )
            
            try:
                current_code = await self.llm_client.generate(
                    prompt=code_generation_prompt,
                    max_tokens=2000
                )
                
                # 清理代码，移除可能的Markdown包装
                current_code = self._clean_generated_code(current_code)
                execution_log.append(f"Generated code:\n{current_code}")
                
            except Exception as e:
                logger.error(f"Code generation failed on attempt {attempt}: {e}")
                execution_log.append(f"Generation failed: {str(e)}")
                continue
            
            # 4.2 在沙箱中执行测试