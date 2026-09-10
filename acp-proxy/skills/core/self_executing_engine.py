"""
Self-Executing Engine - 核心技能
让Agent能主动规划并执行自我改进任务，强制自主执行比例。
"""

import json
import sqlite3
import time
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime


class SelfExecutingEngine:
    """自我执行引擎：解析反思记录，生成自主改进计划"""

    # 自主执行关键词 - 高可行性
    SELF_EXECUTABLE_KEYWORDS = [
        '自己写代码', '修复bug', '创建脚本', '重构', '优化代码',
        '写一个', '实现', '添加功能', '更新', '修改', '改进',
        '写代码', '脚本', '函数', '模块', '插件', '自动化',
        '修复', 'debug', 'test', '测试', '文档', '注释',
        '小工具', 'utility', 'helper', '配置', '设置'
    ]

    # 需要协作的关键词 - 低可行性
    COLLABORATIVE_KEYWORDS = [
        '需要partner', '请示', '汇报', '审批', '讨论', '会议',
        '确认', '询问', '外部', '人工', '手动', '第三方',
        '硬件', '物理', '部署到服务器', '发布', '上线',
        '客户', '用户反馈', '等待回复'
    ]

    # 难度评估关键词
    COMPLEXITY_KEYWORDS = {
        'low': ['简单', '快速', '小', 'minor', 'tiny', '简单修改', '添加注释', '重命名'],
        'medium': ['重构', '优化', '添加功能', '扩展', '适配', '集成'],
        'high': ['架构', '重新设计', '大规模', '全面', '系统', '核心模块']
    }

    def __init__(self, memory_db_path: str = "memory.db", plan_output_dir: str = "."):
        """
        初始化自我执行引擎
        
        Args:
            memory_db_path: memory.db 数据库路径
            plan_output_dir: 计划输出目录
        """
        self.memory_db_path = memory_db_path
        self.plan_output_dir = Path(plan_output_dir)
        self._init_database()

    def _init_database(self):
        """初始化数据库表结构"""
        with sqlite3.connect(self.memory_db_path) as conn:
            cursor = conn.cursor()
            
            # 反思记录表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS reflections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cycle_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    reflection_type TEXT DEFAULT 'general',
                    metadata TEXT DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # 自主执行计划表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS self_execution_plans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cycle_id INTEGER NOT NULL,
                    plan_json TEXT NOT NULL,
                    total_tasks INTEGER DEFAULT 0,
                    self_exec_tasks INTEGER DEFAULT 0,
                    actual_ratio REAL DEFAULT 0.0,
                    status TEXT DEFAULT 'generated',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # 任务执行历史表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS task_execution_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL UNIQUE,
                    plan_cycle_id INTEGER,
                    description TEXT,
                    feasibility_score REAL DEFAULT 0.0,
                    was_executed BOOLEAN DEFAULT FALSE,
                    execution_success BOOLEAN DEFAULT FALSE,
                    execution_duration_seconds INTEGER DEFAULT 0,
                    feedback TEXT DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    executed_at TIMESTAMP
                )
            """)
            
            conn.commit()

    def _calculate_feasibility_score(self, 
                                      improvement_text: str, 
                                      available_skills: List[str],
                                      available_plugins: List[str],
                                      execution_history: Dict[str, Any]) -> float:
        """
        计算改进项的自主可行性得分
        
        Args:
            improvement_text: 改进项描述文本
            available_skills: 可用技能列表
            available_plugins: 可用插件列表
            execution_history: 历史执行记录
            
        Returns:
            可行性得分 (0.0 - 1.0)
        """
        score = 0.5  # 基础分
        text_lower = improvement_text.lower()
        
        # 1. 关键词匹配评分
        self_exec_matches = sum(1 for kw in SELF_EXECUTABLE_KEYWORDS if kw in text_lower)
        collab_matches = sum(1 for kw in COLLABORATIVE_KEYWORDS if kw in text_lower)
        
        keyword_score = (self_exec_matches * 0.15) - (collab_matches * 0.25)
        score += keyword_score
        
        # 2. 复杂度评估
        complexity = 'medium'
        for level, keywords in self.COMPLEXITY_KEYWORDS.items():
            if any(kw in text_lower for kw in keywords):
                complexity = level
                break
        
        complexity_scores = {'low': 0.2, 'medium': 0.0, 'high': -0.15}
        score += complexity_scores.get(complexity, 0.0)
        
        # 3. 目标文件匹配（检查是否涉及已有技能/插件）
        available_resources = set(available_skills + available_plugins)
        for resource in available_resources:
            if resource.lower() in text_lower:
                score += 0.1
                break
        
        # 4. 历史执行成功率参考
        similar_tasks = self._find_similar_tasks(improvement_text, execution_history)
        if similar_tasks:
            avg_success_rate = sum(
                1 for t in similar_tasks if t.get('execution_success', False)
            ) / len(similar_tasks)
            score = score * 0.7 + avg_success_rate * 0.3
        
        # 确保分数在合理范围内
        return max(0.0, min(1.0, score))

    def _find_similar_tasks(self, text: str, history: Dict[str, Any]) -> List[Dict]:
        """查找历史中相似的任务"""
        similar = []
        text_words = set(text.lower().split())
        
        for task_id, task_info in history.items():
            task_desc = task_info.get('description', '').lower()
            task_words = set(task_desc.split())
            
            # 简单的词重叠相似度
            overlap = len(text_words & task_words)
            if overlap >= 2:  # 至少2个词重叠
                similar.append(task_info)
        
        return similar

    def _extract_possible_target_files(self, improvement_text: str) -> List[str]:
        """从改进描述中提取可能涉及的目标文件"""
        targets = []
        
        # 常见文件模式
        import re
        file_patterns = [
            r'[\w/]+\.py',
            r'[\w/]+\.js',
            r'[\w/]+\.ts',
            r'[\w/]+\.json',
            r'[\w/]+\.yaml',
            r'[\w/]+\.yml',
            r'[\w/]+\.md',
        ]
        
        for pattern in file_patterns:
            matches = re.findall(pattern, improvement_text)
            targets.extend(matches)
        
        # 如果没有明确文件，推断可能的目录
        if not targets:
            if any(kw in improvement_text for kw in ['技能', 'skill', '插件', 'plugin']):
                targets.append("acp-proxy/skills/")
            elif any(kw in improvement_text for kw in ['配置', 'config', '设置']):
                targets.append("config/")
            elif any(kw in improvement_text for kw in ['文档', 'doc', 'readme']):
                targets.append("docs/")
        
        return list(set(targets)) if targets else ["待确定"]

    def _generate_verification_criteria(self, improvement_text: str, task_type: str) -> List[str]:
        """生成验证标准"""
        criteria = []
        
        # 通用验证标准
        criteria.append("代码无语法错误，可通过基本lint检查")
        criteria.append("新增/修改的代码包含适当的注释")
        
        # 基于任务类型的特定标准