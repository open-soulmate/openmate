# acp-proxy/skills/core/self_executing_engine.py

import json
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from pathlib import Path


class SelfExecutingEngine:
    """核心技能：Agent自我执行引擎，用于生成和执行自我改进计划。"""
    
    # 启发式关键词库
    SELF_EXECUTABLE_KEYWORDS = [
        '自己写代码', '修复bug', '创建脚本', '优化代码', '重构',
        '写测试', '改进文档', '调整配置', '创建插件', '开发功能',
        '修复错误', '自动修复', '自我改进', '代码优化', '工具开发'
    ]
    
    # 需要协作的关键词
    COLLABORATIVE_KEYWORDS = [
        '需要partner', '需要协助', '需要审批', '外部依赖', '需要资源',
        '人工审核', '需要确认', '外部接口', '集成测试'
    ]
    
    def __init__(self, db_path: str = "memory.db"):
        """初始化引擎。
        
        Args:
            db_path: memory.db数据库路径
        """
        self.db_path = db_path
        self.current_cycle_id = self._generate_cycle_id()
        self._init_database()
    
    def _generate_cycle_id(self) -> int:
        """生成周期ID。"""
        return int(datetime.now().timestamp())
    
    def _init_database(self):
        """初始化数据库表结构。"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 创建自我执行计划表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS self_execution_plans (
                plan_id TEXT PRIMARY KEY,
                cycle_id INTEGER,
                plan_json TEXT,
                created_at TEXT,
                updated_at TEXT,
                status TEXT DEFAULT 'active'
            )
        ''')
        
        # 创建任务执行历史表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS task_execution_history (
                task_id TEXT PRIMARY KEY,
                cycle_id INTEGER,
                description TEXT,
                execution_status TEXT,
                success_rate REAL,
                executed_at TEXT,
                notes TEXT
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def generate_self_plan(self, reflections_json: List[Dict[str, Any]], 
                          current_assets: List[str]) -> Dict[str, Any]:
        """生成自我执行计划。
        
        Args:
            reflections_json: 从memory.db解析的反思记录列表
            current_assets: 当前技能/插件目录列表
            
        Returns:
            符合schema的自我执行计划字典
        """
        # 1. 解析反思记录，提取可执行项
        executable_items = self._extract_executable_items(reflections_json)
        
        # 2. 计算每个项目的自主可行性得分
        scored_items = self._score_executability(executable_items)
        
        # 3. 筛选高得分项目（自主可行性阈值）
        high_scored_items = self._filter_by_threshold(scored_items, threshold=0.6)
        
        # 4. 生成任务列表
        tasks = self._generate_tasks(high_scored_items, current_assets)
        
        # 5. 计算自我执行比例
        self_exec_ratio = self._calculate_self_exec_ratio(tasks)
        
        # 6. 构建计划
        plan = {
            "cycle_id": self.current_cycle_id,
            "tasks": tasks,
            "self_exec_ratio_target": 0.5
        }
        
        # 7. 持久化计划
        self._save_plan_to_db(plan)
        
        # 8. 保存计划到文件
        self._save_plan_to_file(plan)
        
        return plan
    
    def _extract_executable_items(self, reflections: List[Dict]) -> List[Dict]:
        """从反思记录中提取可执行改进项。"""
        executable_items = []
        
        for reflection in reflections:
            # 检查反思记录的结构
            if not isinstance(reflection, dict):
                continue
            
            # 提取关键信息
            content = reflection.get('content', '')
            timestamp = reflection.get('timestamp', datetime.now().isoformat())
            
            # 分析内容是否包含可执行改进项
            if self._contains_executable_content(content):
                item = {
                    'reflection_id': reflection.get('id', str(uuid.uuid4())),
                    'content': content,
                    'timestamp': timestamp,
                    'source': reflection.get('source', 'unknown')
                }
                executable_items.append(item)
        
        return executable_items
    
    def _contains_executable_content(self, content: str) -> bool:
        """检查内容是否包含可执行改进项。"""
        content_lower = content.lower()
        
        # 检查是否包含自我执行关键词
        for keyword in self.SELF_EXECUTABLE_KEYWORDS:
            if keyword in content_lower:
                return True
        
        return False
    
    def _score_executability(self, items: List[Dict]) -> List[Dict]:
        """计算每个项目的自主可行性得分。"""
        scored_items = []
        
        for item in items:
            score = self._calculate_item_score(item)
            item['executability_score'] = score
            scored_items.append(item)
        
        return scored_items
    
    def _calculate_item_score(self, item: Dict) -> float:
        """计算单个项目的自主可行性得分。"""
        content = item.get('content', '').lower()
        base_score = 0.0
        
        # 1. 关键词匹配得分
        keyword_score = 0.0
        for keyword in self.SELF_EXECUTABLE_KEYWORDS:
            if keyword in content:
                keyword_score += 0.2
        
        # 限制基础得分
        keyword_score = min(keyword_score, 0.8)
        
        # 2. 检查是否包含协作关键词（减分项）
        collaborative_penalty = 0.0
        for keyword in self.COLLABORATIVE_KEYWORDS:
            if keyword in content:
                collaborative_penalty += 0.3
        
        collaborative_penalty = min(collaborative_penalty, 0.6)
        
        # 3. 历史执行记录得分
        history_score = self._get_history_score(item.get('reflection_id'))
        
        # 4. 综合得分计算
        total_score = keyword_score - collaborative_penalty + history_score
        
        # 确保得分在0-1范围内
        return max(0.0, min(1.0, total_score))
    
    def _get_history_score(self, reflection_id: str) -> float:
        """根据历史执行记录计算得分。"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # 查询历史执行记录
            cursor.execute('''
                SELECT success_rate FROM task_execution_history 
                WHERE task_id = ? AND execution_status = 'completed'
                ORDER BY executed_at DESC LIMIT 5
            ''', (reflection_id,))
            
            results = cursor.fetchall()
            conn.close()
            
            if not results:
                return 0.0  # 没有历史记录
            
            # 计算平均成功率
            avg_success_rate = sum(r[0] for r in results) / len(results)
            return avg_success_rate * 0.2  # 最多加0.2分
            
        except Exception:
            return 0.0
    
    def _filter_by_threshold(self, items: List[Dict], threshold: float) -> List[Dict]:
        """根据阈值筛选项目。"""
        return [item for item in items if item.get('executability_score', 0) >= threshold]
    
    def _generate_tasks(self, items: List[Dict], current_assets: List[str]) -> List[Dict]:
        """生成任务列表。"""