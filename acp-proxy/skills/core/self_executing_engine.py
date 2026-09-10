import json
import re
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
from loguru import logger
import sqlite3


class SelfExecutingEngine:
    """
    核心技能：自我执行引擎
    让Agent能主动规划并执行自我改进任务，强制其自主执行比例
    """
    
    # 自主可行性关键词配置
    SELF_EXECUTION_KEYWORDS = {
        "positive": [
            "自己写代码", "写代码", "修复bug", "修复错误", "创建脚本", "自动执行",
            "自我改进", "优化", "重构", "编写", "实现", "开发", "编码", "自动化",
            "脚本", "工具", "改进", "升级", "增强", "修复", "补丁", "配置",
            "测试", "调试", "部署", "集成", "插件", "技能", "模块", "组件"
        ],
        "negative": [
            "需要partner", "需要协作", "团队讨论", "共同决策", "会议",
            "需要审批", "需要外部帮助", "等待反馈", "依赖他人", "多人",
            "团队", "合作", "协调", "沟通", "讨论", "协商"
        ]
    }
    
    def __init__(self, memory_db_path: str = "memory.db"):
        """
        初始化自我执行引擎
        
        Args:
            memory_db_path: memory.db数据库路径
        """
        self.memory_db_path = Path(memory_db_path)
        self._init_db()
        
    def _init_db(self):
        """初始化数据库，确保必要的表存在"""
        try:
            conn = sqlite3.connect(self.memory_db_path)
            cursor = conn.cursor()
            
            # 创建计划状态表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS self_execution_plans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cycle_id INTEGER NOT NULL,
                    plan_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'active'
                )
            ''')
            
            # 创建历史执行记录表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS execution_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    reflection TEXT,
                    success BOOLEAN,
                    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    notes TEXT
                )
            ''')
            
            conn.commit()
            conn.close()
            logger.info("数据库初始化完成")
        except Exception as e:
            logger.error(f"数据库初始化失败: {e}")
            raise
    
    def _get_historical_success_rate(self, task_description: str) -> float:
        """
        获取类似任务的历史执行成功率
        
        Args:
            task_description: 任务描述
            
        Returns:
            历史成功率 (0.0-1.0)
        """
        try:
            conn = sqlite3.connect(self.memory_db_path)
            cursor = conn.cursor()
            
            # 简单的关键词匹配查询
            cursor.execute('''
                SELECT success FROM execution_history 
                WHERE reflection LIKE ? OR notes LIKE ?
            ''', (f'%{task_description[:50]}%', f'%{task_description[:50]}%'))
            
            results = cursor.fetchall()
            conn.close()
            
            if not results:
                return 0.5  # 默认成功率
            
            success_count = sum(1 for row in results if row[0])
            return success_count / len(results)
            
        except Exception as e:
            logger.warning(f"查询历史记录失败: {e}")
            return 0.5  # 默认成功率
    
    def _calculate_self_exec_feasibility(self, reflection_text: str, historical_rate: float) -> float:
        """
        计算自主可行性得分
        
        Args:
            reflection_text: 反思文本
            historical_rate: 历史成功率
            
        Returns:
            可行性得分 (0.0-1.0)
        """