import json
import sqlite3
import re
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from pathlib import Path
import uuid

class SelfExecutingEngine:
    """
    核心技能：自我执行引擎
    让Agent能主动规划并执行自我改进任务，强制其自主执行比例
    """
    
    def __init__(self, db_path: str = "memory.db"):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """初始化数据库，创建必要的表"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                # 创建反思记录表
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS reflections (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        cycle_id INTEGER,
                        content TEXT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                # 创建自主执行计划表
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS self_execution_plans (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        cycle_id INTEGER,
                        plan_data TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        status TEXT DEFAULT 'active'
                    )
                """)
                # 创建历史执行记录表
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS execution_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        plan_id INTEGER,
                        task_id TEXT,
                        status TEXT,
                        execution_time DATETIME,
                        success BOOLEAN,
                        notes TEXT
                    )
                """)
                conn.commit()
        except Exception as e:
            print(f"初始化数据库错误: {e}")
    
    def generate_self_plan(
        self, 
        reflection_data: Dict[str, Any], 
        available_skills: List[str],
        current_cycle_id: int
    ) -> Dict[str, Any]:
        """
        生成自我执行计划
        
        Args:
            reflection_data: 反思JSON数据
            available_skills: 当前技能/插件目录列表
            current_cycle_id: 当前周期ID
            
        Returns:
            生成的自我执行计划
        """