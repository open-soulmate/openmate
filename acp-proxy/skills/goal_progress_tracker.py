import json
from typing import Dict, List, Any
from datetime import datetime


class GoalProgressTracker:
    """
    进化目标进度追踪技能 - 解决目标孤立和自我进化循环不闭合问题
    维护目标进度字典，定义可验证里程碑，智能推荐下一步行动
    """
    
    def __init__(self, llm_handler=None):
        self.llm_handler = llm_handler
        self.goal_registry: Dict[str, Dict] = {}
        self.initialize_default_goals()
        
    def initialize_default_goals(self):
        """初始化默认进化目标及其初始里程碑定义"""
        default_goals = {
            "self_programming_ability": {
                "description": "自编程能力 - 能够生成、执行和优化自身代码",
                "current_milestone": "成功执行一次自我生成的代码片段",
                "progress": 0.1,
                "next_milestone": "实现一个完整的自定义功能模块",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "milestone_history": []
            },
            "error_self_repair": {
                "description": "错误自修复能力 - 能够识别、分析和修复自身错误",
                "current_milestone": "识别并报告一个系统错误",
                "progress": 0.15,
                "next_milestone": "成功修复一个已知错误",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "milestone_history": []
            },
            "knowledge_integration": {
                "description": "知识整合能力 - 将多源信息整合为可执行知识",
                "current_milestone": "完成一次成功的跨领域知识关联",
                "progress": 0.2,
                "next_milestone": "构建一个实用的知识图谱片段",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "milestone_history": []
            },
            "adaptive_learning": {
                "description": "自适应学习能力 - 根据反馈动态调整学习策略",
                "current_milestone": "根据一次失败调整学习参数",
                "progress": 0.1,
                "next_milestone": "实现一个自动化的策略优化循环",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "milestone_history": []
            }
        }
        
        self.goal_registry.update(default_goals)
    
    def add_goal(self, goal_id: str, goal_data: Dict[str, Any]) -> bool:
        """添加新进化目标"""
        if goal_id in self.goal_registry:
            return False
            
        goal_data.setdefault("created_at", datetime.now().isoformat())
        goal_data.setdefault("updated_at", datetime.now().isoformat())
        goal_data.setdefault("progress", 0.0)
        goal_data.setdefault("milestone_history", [])
        
        self.goal_registry[goal_id] = goal_data
        return True
    
    def update_milestone(self, goal_id: str, new_milestone: str, progress_increment: float = 0.1) -> Dict:
        """更新目标里程碑，记录里程碑历史"""
        if goal_id not in self.goal_registry:
            raise ValueError(f"目标 {goal_id} 不存在")
            
        goal = self.goal_registry[goal_id]
        
        # 记录历史里程碑
        milestone_record = {
            "milestone": goal["current_milestone"],
            "achieved_at": datetime.now().isoformat(),
            "progress_before": goal["progress"]
        }
        goal["milestone_history"].append(milestone_record)
        
        # 更新当前里程碑和进度
        goal["current_milestone"] = new_milestone
        goal["progress"] = min(1.0, goal["progress"] + progress_increment)
        goal["updated_at"] = datetime.now().isoformat()
        
        return goal
    
    def get_goal_progress(self, goal_id: str = None) -> Dict:
        """获取目标进度信息"""
        if goal_id:
            return self.goal_registry.get(goal_id, {})
        return self.goal_registry
    
    def recommend_actions(self, current_state: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        基于当前状态推荐具体行动
        
        current_state应包含：
        - goal_progress: 目标进度字典
        - observations: 最近观察列表
        - error_analysis: 错误分析结果
        - recent_actions: 最近执行的动作
        """
        # 构造详细的上下文信息
        context = self._build_context(current_state)
        
        # 构造LLM提示词
        prompt = self._construct_recommendation_prompt(context)
        
        # 调用LLM获取建议
        raw_response = self._call_llm(prompt)
        
        # 解析响应
        recommended_actions = self._parse_response(raw_response)
        
        return recommended_actions
    
    def _build_context(self, current_state: Dict[str, Any]) -> Dict[str, Any]:
        """构建完整上下文信息"""
        goal_progress = current_state.get("goal_progress", {})
        observations = current_state.get("observations", [])
        error_analysis = current_state.get("error_analysis", {})
        recent_actions = current_state.get("recent_actions", [])
        
        # 合并目标进度信息
        enriched_progress = {}
        for goal_id, progress_data in goal_progress.items():
            if goal_id in self.goal_registry:
                enriched_progress[goal_id] = {
                    **self.goal_registry[goal_id],
                    **progress_data,
                    "goal_id": goal_id
                }
        
        return {
            "timestamp": datetime.now().isoformat(),
            "goal_registry": self.goal_registry,
            "enriched_progress": enriched_progress,
            "recent_observations": observations[-5:] if observations else [],
            "error_analysis": error_analysis,
            "recent_actions": recent_actions[-3:] if recent_actions else [],
            "system_state": {
                "total_goals": len(self.goal_registry),
                "active_goals": len([g for g in self.goal_registry.values() if g.get("progress", 0) < 1.0]),
                "average_progress": sum(g.get("progress", 0) for g in self.goal_registry.values()) / max(1, len(self.goal_registry))
            }
        }
    
    def _construct_recommendation_prompt(self, context: Dict[str, Any]) -> str:
        """构造详细的LLM提示词"""