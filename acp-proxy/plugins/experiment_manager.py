import json
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

class ExperimentManager:
    """管理大胆实验的插件，用于系统性探索新策略、工具和方法"""
    
    def __init__(self, base_path: str = "experiments"):
        """
        初始化实验管理器
        
        Args:
            base_path: 实验存储的基础目录路径
        """
        self.base_path = base_path
        os.makedirs(self.base_path, exist_ok=True)
        self.active_experiments = {}  # 内存中跟踪活跃实验
        
    def create_experiment(self, name: str, hypothesis: str, variables: dict, metrics: list[str]) -> str:
        """
        创建新实验，定义假设、变量和评估指标
        
        Args:
            name: 实验名称
            hypothesis: 要验证的假设
            variables: 实验变量及其初始值
            metrics: 评估指标列表
            
        Returns:
            实验ID字符串
        """
        experiment_id = str(uuid.uuid4())[:8]
        experiment_dir = os.path.join(self.base_path, experiment_id)
        os.makedirs(experiment_dir, exist_ok=True)
        
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
            "conclusion": None,
            "outcome_summary": None
        }
        
        config_path = os.path.join(experiment_dir, "experiment.json")
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(experiment_data, f, ensure_ascii=False, indent=2)
        
        # 创建日志文件
        log_path = os.path.join(experiment_dir, "log.jsonl")
        with open(log_path, 'w', encoding='utf-8') as f:
            first_entry = {
                "timestamp": datetime.now().isoformat(),
                "type": "creation",
                "description": f"实验 '{name}' 创建",
                "data": {
                    "hypothesis": hypothesis,
                    "variables": variables,
                    "metrics": metrics
                }
            }
            f.write(json.dumps(first_entry, ensure_ascii=False) + "\n")
        
        # 内存中跟踪实验状态
        self.active_experiments[experiment_id] = {
            "config_path": config_path,
            "log_path": log_path,
            "status": "created"
        }
        
        # 更新实验状态
        experiment_data["status"] = "in_progress"
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(experiment_data, f, ensure_ascii=False, indent=2)
        
        self.active_experiments[experiment_id]["status"] = "in_progress"
        
        return experiment_id
    
    def log_step(self, experiment_id: str, step_description: str, data: dict) -> bool:
        """
        记录实验步骤和数据
        
        Args:
            experiment_id: 实验ID
            step_description: 步骤描述
            data: 相关数据
            
        Returns:
            操作是否成功
        """
        if experiment_id not in self.active_experiments:
            return False
            
        log_path = self.active_experiments[experiment_id]["log_path"]
        
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "type": "step",
            "description": step_description,
            "data": data
        }
        
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
        
        # 更新实验配置中的更新时间
        config_path = self.active_experiments[experiment_id]["config_path"]
        with open(config_path, 'r', encoding='utf-8') as f:
            experiment_data = json.load(f)
        
        experiment_data["updated_at"] = datetime.now().isoformat()
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(experiment_data, f, ensure_ascii=False, indent=2)
        
        return True
    
    def conclude_experiment(self, experiment_id: str, outcome_summary: str) -> dict:
        """
        总结实验，生成结论
        
        Args:
            experiment_id: 实验ID
            outcome_summary: 实验结果总结
            
        Returns:
            包含实验结论的字典
        """
        if experiment_id not in self.active_experiments:
            return {"error": "实验不存在"}
            
        config_path = self.active_experiments[experiment_id]["config_path"]
        log_path = self.active_experiments[experiment_id]["log_path"]
        
        # 读取实验配置
        with open(config_path, 'r', encoding='utf-8') as f:
            experiment_data = json.load(f)
        
        # 读取所有日志条目
        log_entries = []
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    log_entries.append(json.loads(line))
        
        # 生成结论
        conclusion = {
            "experiment_id": experiment_id,
            "experiment_name": experiment_data["name"],
            "hypothesis": experiment_data["hypothesis"],
            "outcome_summary": outcome_summary,
            "total_steps": len([e for e in log_entries if e["type"] == "step"]),
            "metrics_collected": experiment_data["metrics"],
            "concluded_at": datetime.now().isoformat()
        }
        
        # 保存结论文件
        conclusion_path = os.path.join(self.base_path, experiment_id, "conclusion.json")
        with open(conclusion_path, 'w', encoding='utf-8') as f:
            json.dump(conclusion, f, ensure_ascii=False, indent=2)
        
        # 更新实验状态
        experiment_data["status"] = "concluded"
        experiment_data["conclusion"] = outcome_summary
        experiment_data["updated_at"] = datetime.now().isoformat()
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(experiment_data, f, ensure_ascii=False, indent=2)
        
        # 从内存中移除
        self.active_experiments.pop(experiment_id, None)
        
        return conclusion
    
    def suggest_new_skill_from_experiment(self, experiment_id: str) -> dict:
        """
        分析成功实验，建议新的技能定义
        
        Args:
            experiment_id: 实验ID
            
        Returns:
            新技能的定义字典，或错误信息
        """
        experiment_dir = os.path.join(self.base_path, experiment_id)