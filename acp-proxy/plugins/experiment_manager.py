import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from acp_proxy.core.base_plugin import BasePlugin


class ExperimentManager(BasePlugin):
    """
    实验管理插件 - 系统化地进行'大胆尝试，高探索'的激进策略
    """
    
    def __init__(self, experiments_dir: str = "experiments"):
        """
        初始化实验管理器
        
        Args:
            experiments_dir: 实验存储目录
        """
        super().__init__()
        self.experiments_dir = Path(experiments_dir)
        self.experiments_dir.mkdir(exist_ok=True)
        self.active_experiments: Dict[str, Dict] = {}
        self._load_active_experiments()
    
    def _load_active_experiments(self):
        """加载所有活跃的实验"""
        for exp_dir in self.experiments_dir.iterdir():
            if exp_dir.is_dir() and (exp_dir / "experiment.json").exists():
                with open(exp_dir / "experiment.json", 'r', encoding='utf-8') as f:
                    experiment_data = json.load(f)
                    if experiment_data.get("status") == "active":
                        self.active_experiments[experiment_data["id"]] = experiment_data
    
    def _save_experiment(self, experiment_id: str, experiment_data: Dict):
        """保存实验数据到文件"""
        exp_dir = self.experiments_dir / experiment_id
        exp_dir.mkdir(exist_ok=True)
        
        with open(exp_dir / "experiment.json", 'w', encoding='utf-8') as f:
            json.dump(experiment_data, f, indent=2, ensure_ascii=False)
        
        self.active_experiments[experiment_id] = experiment_data
    
    def create_experiment(
        self,
        name: str,
        hypothesis: str,
        variables: Dict[str, Any],
        metrics: List[str],
        description: Optional[str] = None
    ) -> str:
        """
        创建新的实验
        
        Args:
            name: 实验名称
            hypothesis: 实验假设
            variables: 实验变量字典
            metrics: 评估指标列表
            description: 实验描述
            
        Returns:
            str: 实验ID
        """
        experiment_id = str(uuid.uuid4())[:8]
        experiment_data = {
            "id": experiment_id,
            "name": name,
            "hypothesis": hypothesis,
            "variables": variables,
            "metrics": metrics,
            "description": description,
            "status": "active",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "steps": [],
            "conclusion": None,
            "outcome_summary": None,
            "learning_points": [],
            "new_skill_suggestion": None
        }
        
        self._save_experiment(experiment_id, experiment_data)
        
        # 记录到主Agent的工作流中
        self.log_to_workflow(f"创建新实验: {name} (ID: {experiment_id})")
        self.log_to_memory(f"实验开始: {name} - {hypothesis}")
        
        return experiment_id
    
    def log_step(
        self,
        experiment_id: str,
        step_description: str,
        data: Optional[Dict[str, Any]] = None,
        observations: Optional[str] = None
    ) -> bool:
        """
        记录实验步骤
        
        Args:
            experiment_id: 实验ID
            step_description: 步骤描述
            data: 步骤数据
            observations: 观察结果
            
        Returns:
            bool: 是否成功记录
        """
        if experiment_id not in self.active_experiments:
            self.log_to_workflow(f"实验 {experiment_id} 不存在或已结束", level="WARNING")
            return False
        
        step = {
            "timestamp": datetime.now().isoformat(),
            "description": step_description,
            "data": data or {},
            "observations": observations
        }
        
        experiment_data = self.active_experiments[experiment_id]
        experiment_data["steps"].append(step)
        experiment_data["updated_at"] = datetime.now().isoformat()
        
        self._save_experiment(experiment_id, experiment_data)
        
        self.log_to_workflow(f"实验 {experiment_data['name']} 步骤记录: {step_description}")
        
        return True
    
    def conclude_experiment(
        self,
        experiment_id: str,
        outcome_summary: str,
        conclusion: str,
        learning_points: Optional[List[str]] = None,
        success: bool = False
    ) -> Dict[str, Any]:
        """
        结束实验并生成总结
        
        Args:
            experiment_id: 实验ID
            outcome_summary: 结果摘要
            conclusion: 结论
            learning_points: 学习要点列表
            success: 是否成功
            
        Returns:
            dict: 实验结果分析
        """
        if experiment_id not in self.active_experiments:
            self.log_to_workflow(f"实验 {experiment_id} 不存在或已结束", level="WARNING")
            return {"error": "实验不存在或已结束"}
        
        experiment_data = self.active_experiments[experiment_id]
        experiment_data["status"] = "concluded"
        experiment_data["conclusion"] = conclusion
        experiment_data["outcome_summary"] = outcome_summary
        experiment_data["learning_points"] = learning_points or []
        experiment_data["success"] = success
        experiment_data["concluded_at"] = datetime.now().isoformat()
        experiment_data["updated_at"] = datetime.now().isoformat()
        
        # 计算实验指标
        analysis = self._analyze_experiment(experiment_data)
        experiment_data["analysis"] = analysis
        
        self._save_experiment(experiment_id, experiment_data)
        
        # 从活跃实验中移除
        del self.active_experiments[experiment_id]
        
        self.log_to_workflow(f"实验 {experiment_data['name']} 已结束: {outcome_summary}")
        self.log_to_memory(f"实验总结: {experiment_data['name']} - {conclusion}")
        
        # 如果实验成功，建议新技能
        if success:
            skill_suggestion = self.suggest_new_skill_from_experiment(experiment_id)
            experiment_data["new_skill_suggestion"] = skill_suggestion