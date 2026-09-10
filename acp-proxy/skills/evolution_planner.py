"""
Self-evolution planning skill for generating executable improvement plans.
"""

import json
from typing import List, Dict, Any


def plan_improvements(reflection: Dict[str, Any], available_skills: List[str], available_plugins: List[str]) -> List[Dict[str, Any]]:
    """
    Analyzes reflection data and generates 1-3 executable improvement items.
    
    Args:
        reflection: Dictionary containing failure_patterns, success_patterns, goal_progress
        available_skills: List of currently available skills
        available_plugins: List of currently available plugins
        
    Returns:
        List of improvement dictionaries with keys: type, target_file, description, requirements, commit_message
    """
    
    improvements = []
    max_improvements = 3
    
    # Extract key data from reflection
    failure_patterns = reflection.get('failure_patterns', [])
    success_patterns = reflection.get('success_patterns', [])
    goal_progress = reflection.get('goal_progress', {})
    
    # Rule 1: Process failure patterns
    for pattern in failure_patterns[:2]:  # Limit to first 2 patterns to stay within limit
        improvement = _generate_from_failure_pattern(pattern, available_skills, available_plugins)
        if improvement and len(improvements) < max_improvements:
            improvements.append(improvement)
    
    # Rule 2: Check low-progress goals
    low_progress_goals = _get_low_progress_goals(goal_progress, threshold=0.10)
    for goal_name, progress in low_progress_goals:
        if len(improvements) < max_improvements:
            improvement = _generate_from_low_progress_goal(goal_name, progress, available_skills, available_plugins)
            if improvement:
                improvements.append(improvement)
    
    # Rule 3: Consider collaboration patterns from success patterns
    if len(improvements) < max_improvements and _has_collaboration_pattern(success_patterns):
        improvement = _generate_collaboration_improvement(available_skills, available_plugins)
        if improvement:
            improvements.append(improvement)
    
    # Rule 4: Ensure we have at least one improvement
    if not improvements and len(improvements) < max_improvements:
        default_improvement = _generate_default_improvement(available_skills, available_plugins)
        improvements.append(default_improvement)
    
    # Ensure total doesn't exceed maximum
    return improvements[:max_improvements]


def _generate_from_failure_pattern(pattern: str, available_skills: List[str], available_plugins: List[str]) -> Dict[str, Any]:
    """Map failure patterns to specific improvement actions."""
    
    pattern_lower = pattern.lower()
    
    # Pattern: Empty code files
    if "空文件" in pattern_lower or "为空" in pattern_lower or "empty file" in pattern_lower:
        return {
            "type": "skill",
            "target_file": "acp-proxy/core/self_evolution.py",
            "description": "创建基础代码结构文件",
            "requirements": "创建一个包含基本框架和示例代码的Python文件，确保文件非空且包含可执行的代码结构",
            "commit_message": "feat: add basic code structure for self-evolution"
        }
    
    # Pattern: Test failures