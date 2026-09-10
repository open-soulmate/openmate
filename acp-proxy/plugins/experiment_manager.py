import json
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path


class ExperimentManager:
    """实验管理插件，用于系统化地进行大胆尝试和高探索性的激进策略"""
    
    def __init__(self, base_dir: str = "experiments"):
        """初始化实验管理器
        
        Args:
            base_dir: 实验目录的基础路径
        """
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.memory_connector = None  # 用于连接主Agent的对话记忆
        self.workflow_connector = None  # 用于连接主Agent的工作流
    
    def set_connectors(self, memory_connector: Any, workflow_connector: Any):
        """设置与主Agent的连接器
        
        Args:
            memory_connector: 对话记忆连接器
            workflow_connector: 工作流连接器
        """
        self.memory_connector = memory_connector
        self.workflow_connector = workflow_connector
    
    def create_experiment(self, name: str, hypothesis: str, 
                         variables: Dict[str, Any], metrics: List[str]) -> str:
        """创建新实验
        
        Args:
            name: 实验名称
            hypothesis: 实验假设
            variables: 实验变量字典
            metrics: 评估指标列表
            
        Returns:
            实验ID
        """
        experiment_id = str(uuid.uuid4())
        experiment_dir = self.base_dir / experiment_id
        
        # 创建实验目录结构
        experiment_dir.mkdir(exist_ok=True)
        (experiment_dir / "steps").mkdir(exist_ok=True)
        
        # 创建实验配置文件
        experiment_data = {
            "id": experiment_id,
            "name": name,
            "hypothesis": hypothesis,
            "variables": variables,
            "metrics": metrics,
            "status": "created",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "steps": [],
            "conclusion": None,
            "success_score": None
        }
        
        # 保存实验配置
        config_path = experiment_dir / "experiment.json"
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(experiment_data, f, ensure_ascii=False, indent=2)
        
        # 记录到对话记忆（如果可用）
        if self.memory_connector:
            self.memory_connector.add_memory(
                f"创建了新实验: {name} (ID: {experiment_id})",
                "experiment_creation",
                {"experiment_id": experiment_id, "hypothesis": hypothesis}
            )
        
        # 更新工作流状态（如果可用）
        if self.workflow_connector:
            self.workflow_connector.update_status(
                "experiment_manager",
                f"正在管理实验 {name}",
                {"experiment_id": experiment_id}
            )
        
        return experiment_id
    
    def log_step(self, experiment_id: str, step_description: str, data: Dict[str, Any]) -> bool:
        """记录实验步骤
        
        Args:
            experiment_id: 实验ID
            step_description: 步骤描述
            data: 步骤数据
            
        Returns:
            是否记录成功
        """
        experiment_dir = self.base_dir / experiment_id
        if not experiment_dir.exists():
            return False
        
        # 读取实验配置
        config_path = experiment_dir / "experiment.json"
        with open(config_path, 'r', encoding='utf-8') as f:
            experiment_data = json.load(f)
        
        # 创建步骤记录
        step_id = str(uuid.uuid4())
        step_data = {
            "step_id": step_id,
            "description": step_description,
            "timestamp": datetime.now().isoformat(),
            "data": data
        }
        
        # 保存步骤到单独文件
        step_path = experiment_dir / "steps" / f"{step_id}.json"
        with open(step_path, 'w', encoding='utf-8') as f:
            json.dump(step_data, f, ensure_ascii=False, indent=2)
        
        # 更新实验配置
        experiment_data["steps"].append(step_id)
        experiment_data["updated_at"] = datetime.now().isoformat()
        experiment_data["status"] = "in_progress"
        
        # 保存更新后的配置
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(experiment_data, f, ensure_ascii=False, indent=2)
        
        # 记录到对话记忆
        if self.memory_connector:
            self.memory_connector.add_memory(
                f"实验 {experiment_id} 记录新步骤: {step_description}",
                "experiment_step",
                {
                    "experiment_id": experiment_id,
                    "step_id": step_id,
                    "description": step_description
                }
            )
        
        return True
    
    def conclude_experiment(self, experiment_id: str, outcome_summary: str) -> bool:
        """总结实验并结束
        
        Args:
            experiment_id: 实验ID
            outcome_summary: 结果总结
            
        Returns:
            是否成功结束实验
        """
        experiment_dir = self.base_dir / experiment_id
        if not experiment_dir.exists():
            return False
        
        # 读取实验配置
        config_path = experiment_dir / "experiment.json"
        with open(config_path, 'r', encoding='utf-8') as f:
            experiment_data = json.load(f)
        
        # 更新实验状态
        experiment_data["status"] = "concluded"
        experiment_data["conclusion"] = {
            "summary": outcome_summary,
            "concluded_at": datetime.now().isoformat()
        }
        experiment_data["updated_at"] = datetime.now().isoformat()
        
        # 计算成功分数（示例：基于步骤数量和完成状态）
        step_count = len(experiment_data["steps"])
        success_score = min(100, step_count * 20)  # 示例算法
        experiment_data["success_score"] = success_score
        
        # 保存结论文件
        conclusion_path = experiment_dir / "conclusion.json"
        conclusion_data = {
            "experiment_id": experiment_id,
            "outcome_summary": outcome_summary,
            "success_score": success_score,
            "step_count": step_count,
            "concluded_at": datetime.now().isoformat()
        }
        
        with open(conclusion_path, 'w', encoding='utf-8') as f:
            json.dump(conclusion_data, f, ensure_ascii=False, indent=2)
        
        # 更新实验配置
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(experiment_data, f, ensure_ascii=False, indent=2)
        
        # 记录到对话记忆
        if self.memory_connector:
            self.memory_connector.add_memory(
                f"实验 {experiment_id} 已结束，成功分数: {success_score}",
                "experiment_conclusion",
                {
                    "experiment_id": experiment_id,
                    "success_score": success_score,
                    "outcome_summary": outcome_summary
                }
            )
        
        return True
    
    def suggest_new_skill_from_experiment(self, experiment_id: str) -> Optional[Dict[str, Any]]:
        """分析成功实验并建议新技能
        
        Args:
            experiment_id: 实验ID
            
        Returns:
            新技能定义字典，或None如果实验不成功
        """
        experiment_dir = self.base_dir / experiment_id
        if not experiment_dir.exists():
            return None
        
        # 读取实验配置
        config_path = experiment_dir / "experiment.json"
        with open(config_path, 'r', encoding='utf-8') as f:
            experiment_data = json.load(f)
        
        # 检查实验是否成功（成功分数>70视为成功）