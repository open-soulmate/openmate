import json
import os
import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional

class ExperimentManager:
    """
    实验管理插件，用于系统化地进行‘大胆尝试，高探索’的激进策略。
    管理一个实验目录，每个实验代表一种新的方法、工具用法或问题解决路径。
    """

    def __init__(self, base_dir: str = "experiments"):
        """
        初始化实验管理器。
        
        Args:
            base_dir: 实验存储的基础目录路径，默认为 "experiments"
        """
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def create_experiment(self, name: str, hypothesis: str, variables: Dict[str, Any], metrics: List[str]) -> str:
        """
        创建一个新的实验。
        
        Args:
            name: 实验名称
            hypothesis: 实验假设
            variables: 实验变量字典
            metrics: 评估指标列表
            
        Returns:
            实验ID
        """
        experiment_id = str(uuid.uuid4())
        experiment_dir = os.path.join(self.base_dir, experiment_id)
        os.makedirs(experiment_dir, exist_ok=True)
        
        # 创建实验配置文件
        experiment_config = {
            "id": experiment_id,
            "name": name,
            "hypothesis": hypothesis,
            "variables": variables,
            "metrics": metrics,
            "status": "in_progress",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        with open(os.path.join(experiment_dir, "experiment.json"), "w") as f:
            json.dump(experiment_config, f, indent=2)
        
        # 创建步骤日志文件
        with open(os.path.join(experiment_dir, "steps.json"), "w") as f:
            json.dump([], f)
        
        return experiment_id

    def log_step(self, experiment_id: str, step_description: str, data: Dict[str, Any]) -> None:
        """
        记录实验步骤。
        
        Args:
            experiment_id: 实验ID
            step_description: 步骤描述
            data: 步骤相关数据
        """
        experiment_dir = os.path.join(self.base_dir, experiment_id)
        steps_file = os.path.join(experiment_dir, "steps.json")
        
        # 读取现有步骤
        with open(steps_file, "r") as f:
            steps = json.load(f)
        
        # 添加新步骤
        step = {
            "timestamp": datetime.now().isoformat(),
            "description": step_description,
            "data": data
        }
        steps.append(step)
        
        # 更新步骤文件
        with open(steps_file, "w") as f:
            json.dump(steps, f, indent=2)
        
        # 更新实验配置文件的更新时间
        config_file = os.path.join(experiment_dir, "experiment.json")
        with open(config_file, "r") as f:
            config = json.load(f)
        config["updated_at"] = datetime.now().isoformat()
        with open(config_file, "w") as f:
            json.dump(config, f, indent=2)

    def conclude_experiment(self, experiment_id: str, outcome_summary: str) -> None:
        """
        总结实验。
        
        Args:
            experiment_id: 实验ID
            outcome_summary: 实验结果摘要
        """
        experiment_dir = os.path.join(self.base_dir, experiment_id)
        config_file = os.path.join(experiment_dir, "experiment.json")
        
        # 读取实验配置
        with open(config_file, "r") as f:
            config = json.load(f)
        
        # 更新状态和结局信息
        config["status"] = "completed"
        config["outcome_summary"] = outcome_summary
        config["completed_at"] = datetime.now().isoformat()
        config["updated_at"] = datetime.now().isoformat()
        
        # 保存更新后的配置
        with open(config_file, "w") as f:
            json.dump(config, f, indent=2)
        
        # 创建结论文件
        conclusion = {
            "experiment_id": experiment_id,
            "outcome_summary": outcome_summary,
            "concluded_at": datetime.now().isoformat()
        }
        with open(os.path.join(experiment_dir, "conclusion.json"), "w") as f:
            json.dump(conclusion, f, indent=2)

    def suggest_new_skill_from_experiment(self, experiment_id: str) -> Optional[Dict[str, Any]]:
        """
        分析成功实验，输出可能的新技能定义。
        
        Args:
            experiment_id: 实验ID
            
        Returns:
            如果实验成功，返回新技能定义字典；否则返回None
        """
        experiment_dir = os.path.join(self.base_dir, experiment_id)
        config_file = os.path.join(experiment_dir, "experiment.json")
        
        # 读取实验配置