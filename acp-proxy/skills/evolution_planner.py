"""
Evolution Planner Skill

Core meta-skill for self-evolution planning. Analyzes reflection data and generates
improvement plans for the agent's next execution cycle.
"""

import json
import logging
from typing import List, Dict, Any
from datetime import datetime

# Import other skills for context gathering
from acp_proxy.skills import memory_manager
from acp_proxy.skills import reflection_engine

logger = logging.getLogger(__name__)

# Constants
FAILURE_PATTERN_MAPPING = {
    "项目代码文件为空": {
        "type": "skill",
        "target_file": "acp-proxy/skills/code_scaffolder.py",
        "description": "创建基础代码结构生成技能，能够自动创建项目骨架代码",
        "requirements": ["os", "pathlib", "json"],
        "commit_message": "feat(skills): add code scaffolding skill for empty project files"
    },
    "技能执行失败": {
        "type": "skill",
        "target_file": "acp-proxy/skills/error_handler.py",
        "description": "增强错误处理和恢复机制，提高技能执行的稳定性",
        "requirements": ["traceback", "logging"],
        "commit_message": "feat(skills): enhance error handling for skill execution"
    },
    "插件调用超时": {
        "type": "plugin",
        "target_file": "acp-proxy/plugins/timeout_manager.py",
        "description": "创建超时管理插件，优化插件调用的超时处理机制",
        "requirements": ["asyncio", "time"],
        "commit_message": "feat(plugins): add timeout management plugin"
    },
    "记忆检索失败": {
        "type": "skill",
        "target_file": "acp-proxy/skills/memory_enhancer.py",
        "description": "增强记忆系统，改进检索算法和上下文关联性",
        "requirements": ["numpy", "scikit-learn"],
        "commit_message": "feat(skills): enhance memory retrieval capabilities"
    }
}

HIGH_PRIORITY_GOALS = [
    "自编程能力",
    "工具创造",
    "知识图谱构建",
    "自我监控",
    "协作规划"
]

GOAL_THRESHOLDS = {
    "自编程能力": 0.10,
    "工具创造": 0.10,
    "知识图谱构建": 0.15,
    "自我监控": 0.20,
    "协作规划": 0.10
}


def plan_improvements(reflection: dict, available_skills: list, available_plugins: list) -> List[Dict[str, Any]]:
    """
    Generate improvement plans based on reflection data.
    
    Args:
        reflection: Dictionary containing failure_patterns, success_patterns, goal_progress
        available_skills: List of currently available skills
        available_plugins: List of currently available plugins
        
    Returns:
        List of improvement dictionaries with type, target_file, description, requirements, commit_message
    """
    improvements = []
    
    # Get additional context from memory if available
    try:
        recent_context = memory_manager.get_recent_context(limit=5)
        logger.debug(f"Retrieved recent context with {len(recent_context)} entries")
    except Exception as e:
        logger.warning(f"Could not retrieve memory context: {e}")
        recent_context = []
    
    # Step 1: Process failure patterns
    failure_improvements = _process_failure_patterns(
        reflection.get("failure_patterns", []),
        available_skills,
        available_plugins
    )
    improvements.extend(failure_improvements)
    
    # Step 2: Process goal progress (only if we need more improvements)