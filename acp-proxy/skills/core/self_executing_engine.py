import json
import sqlite3
from datetime import datetime
from typing import Dict, List, Any
from pathlib import Path

class SelfExecutingEngine:
    """
    自执行引擎技能：解析反思记录，生成自主改进计划
    """
    
    def __init__(self, db_path: str = "memory.db", plan_output_path: str = "self_execution_plan.json"):
        self.db_path = db_path
        self.plan_output_path = plan_output_path
        self.autonomous_keywords = [
            "自己写代码", "修复bug", "创建脚本", "自主编写", 
            "自动修复", "开发插件", "优化代码", "重构逻辑",
            "自己实现", "独立完成", "自动化任务", "脚本开发"
        ]
        self.collaboration_indicators = [
            "需要帮助", "与partner", "协作完成", "需要人工", 
            "需要审核", "需要确认", "需要支持", "团队协作"
        ]
        self.min_confidence_threshold = 0.6
        self.autonomous_ratio_target = 0.5
        
    def generate_self_plan(self, reflection_data: Dict, skill_plugin_list: List[str], cycle_id: int = None) -> Dict:
        """
        生成自主执行计划
        
        Args:
            reflection_data: 从memory.db中解析的反思记录
            skill_plugin_list: 当前技能和插件目录列表
            cycle_id: 当前周期ID
            
        Returns:
            符合schema的自主执行计划字典
        """
        if cycle_id is None:
            cycle_id = int(datetime.now().timestamp())
            
        reflection_items = self._extract_reflection_items(reflection_data)
        autonomous_candidates = []
        
        # 遍历每个反思项，评估自主可行性
        for item in reflection_items:
            score = self._calculate_autonomous_score(item)
            if score >= self.min_confidence_threshold:
                if self._is_in_scope(item, skill_plugin_list):
                    autonomous_candidates.append({
                        "source": item,
                        "score": score
                    })
        
        # 按得分排序，选择前50%作为自主任务
        autonomous_candidates.sort(key=lambda x: x["score"], reverse=True)
        selected_count = max(1, int(len(autonomous_candidates) * self.autonomous_ratio_target))
        selected_tasks = autonomous_candidates[:selected_count]
        
        # 生成任务列表
        tasks = []
        for idx, task_candidate in enumerate(selected_tasks, 1):
            task = self._create_task_from_reflection(task_candidate["source"], idx, cycle_id)
            tasks.append(task)
        
        # 构建计划
        plan = {
            "cycle_id": cycle_id,
            "tasks": tasks,
            "self_exec_ratio_target": self.autonomous_ratio_target,
            "generated_at": datetime.now().isoformat(),
            "total_candidates": len(autonomous_candidates),
            "selected_count": selected_count
        }
        
        # 持久化到文件
        self._save_plan_to_file(plan)
        
        # 持久化到memory.db
        self._save_plan_to_db(plan, cycle_id)
        
        return plan
    
    def _extract_reflection_items(self, reflection_data: Dict) -> List[Dict]:
        """从反思数据中提取需要改进的项目"""
        if isinstance(reflection_data, dict):
            # 假设反思数据结构为 {"reflections": [...]}
            return reflection_data.get("reflections", [])
        elif isinstance(reflection_data, list):
            return reflection_data
        else:
            return []
    
    def _calculate_autonomous_score(self, reflection_item: Dict) -> float:
        """计算反思项的自主可行性得分"""
        content = reflection_item.get("content", "").lower()
        description = reflection_item.get("description", "").lower()
        combined_text = f"{content} {description}"
        
        score = 0.5  # 基础分
        
        # 关键词匹配（正向）
        for keyword in self.autonomous_keywords:
            if keyword in combined_text:
                score += 0.1
        
        # 协作指标匹配（负向）
        for indicator in self.collaboration_indicators:
            if indicator in combined_text:
                score -= 0.3
        
        # 历史执行记录分析
        execution_history = reflection_item.get("execution_history", {})
        if execution_history:
            last_success = execution_history.get("last_success_rate", 0.5)
            score += (last_success - 0.5) * 0.2
        
        # 技术复杂度评估（简单任务得分高）
        complexity_keywords = ["复杂", "困难", "系统", "架构", "大规模"]
        for keyword in complexity_keywords:
            if keyword in combined_text:
                score -= 0.1
        
        # 确保分数在合理范围内
        return max(0.0, min(1.0, score))
    
    def _is_in_scope(self, reflection_item: Dict, skill_plugin_list: List[str]) -> bool:
        """检查改进项是否在当前技能/插件范围内"""
        target = reflection_item.get("target", "")
        
        # 如果没有明确目标，则默认为在范围内
        if not target:
            return True
            
        # 检查目标是否与现有技能/插件相关
        for skill_plugin in skill_plugin_list:
            if skill_plugin.lower() in target.lower():
                return True
                
        # 检查是否为内部逻辑改进