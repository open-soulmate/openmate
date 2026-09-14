import os
import yaml
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime

class EvolutionConfig:
    """进化配置类"""
    
    def __init__(self, config_path: str = "config/evolution_config.yaml"):
        self.config_path = config_path
        self.config = self._load_config()
        
    def _load_config(self) -> Dict[str, Any]:
        """加载配置文件"""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            return self._get_default_config()
    
    def _get_default_config(self) -> Dict[str, Any]:
        """获取默认配置"""
        return {
            "evolution": {
                "target_types": ["code", "documentation"],
                "code": {
                    "max_improvement_rounds": 5,
                    "pass_threshold": 0.95
                },
                "documentation": {
                    "trigger": {
                        "type": "file_change",
                        "directory": "docs/",
                        "file_pattern": "*.md"
                    },
                    "max_improvement_rounds": 3,
                    "pass_threshold": 1.0
                },
                "schedule": {
                    "daily": "02:00",
                    "weekly": "Sunday 03:00"
                }
            }
        }
    
    def get_target_types(self) -> List[str]:
        """获取进化目标类型"""
        return self.config.get("evolution", {}).get("target_types", ["code", "documentation"])
    
    def get_documentation_config(self) -> Dict[str, Any]:
        """获取文档进化配置"""
        return self.config.get("evolution", {}).get("documentation", {})
    
    def should_trigger_documentation_evolution(self) -> bool:
        """判断是否应该触发文档进化"""
        doc_config = self.get_documentation_config()
        trigger = doc_config.get("trigger", {})
        
        if trigger.get("type") != "file_change":
            return False
        
        directory = trigger.get("directory", "docs/")
        file_pattern = trigger.get("file_pattern", "*.md")
        
        return self._check_file_changes(directory, file_pattern)
    
    def _check_file_changes(self, directory: str, pattern: str) -> bool:
        """检查指定目录下的文件变化"""
        if not os.path.exists(directory):
            return False
        
        try:
            # 这里可以实现具体的文件变化检测逻辑
            # 简化实现：检查目录下是否有新增或修改的文件
            dir_path = Path(directory)
            md_files = list(dir_path.glob(pattern))
            
            if not md_files:
                return False
            
            # 检查文件修改时间
            current_time = datetime.now().timestamp()
            one_hour_ago = current_time - 3600  # 1小时前
            
            for md_file in md_files:
                if md_file.is_file():
                    mod_time = md_file.stat().st_mtime
                    if mod_time > one_hour_ago:
                        return True
            
            return False
            
        except Exception:
            return False

class EvolutionCycle:
    """进化周期管理类"""
    
    def __init__(self, config_path: str = "config/evolution_config.yaml"):
        self.config = EvolutionConfig(config_path)
        self.target_types = self.config.get_target_types()
    
    def run_evolution_cycle(self, evolution_type: str) -> Dict[str, Any]:
        """运行进化周期"""
        if evolution_type not in self.target_types:
            raise ValueError(f"不支持的进化类型: {evolution_type}")
        
        if evolution_type == "code":
            return self._run_code_evolution()
        elif evolution_type == "documentation":
            return self._run_documentation_evolution()
        else:
            raise ValueError(f"未知的进化类型: {evolution_type}")
    
    def _run_code_evolution(self) -> Dict[str, Any]:
        """运行代码进化周期"""
        # 代码进化逻辑
        return {
            "type": "code",
            "status": "completed",
            "rounds": 0,
            "improvements": []
        }
    
    def _run_documentation_evolution(self) -> Dict[str, Any]:
        """运行文档进化周期"""
        doc_config = self.config.get_documentation_config()
        max_rounds = doc_config.get("max_improvement_rounds", 3)
        pass_threshold = doc_config.get("pass_threshold", 1.0)
        
        # 文档进化逻辑
        return {
            "type": "documentation",
            "status": "completed",
            "max_rounds": max_rounds,
            "pass_threshold": pass_threshold,
            "rounds_executed": 0,
            "validation_passed": False
        }
    
    def check_and_trigger_documentation_evolution(self) -> bool:
        """检查并触发文档进化"""
        if self.config.should_trigger_documentation_evolution():
            result = self.run_evolution_cycle("documentation")
            return result.get("validation_passed", False)
        return False
    
    def get_evolution_status(self) -> Dict[str, Any]:
        """获取进化状态"""
        return {
            "target_types": self.target_types,
            "timestamp": datetime.now().isoformat(),
            "documentation_evolution_needed": self.config.should_trigger_documentation_evolution()
        }