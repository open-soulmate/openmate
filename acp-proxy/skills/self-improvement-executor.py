import json
import os
import ast
import time
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
import sys

class self_improvement_executor:
    """自主执行引擎技能，实现规划-执行-验证闭环"""
    
    # 技能元信息
    SKILL_NAME = "self_improvement_executor"
    SKILL_VERSION = "1.0.0"
    SKILL_DESCRIPTION = "自主执行小型改进任务，打破规划依赖外部执行的模式"
    
    # 默认改进库
    DEFAULT_IMPROVEMENT_LIBRARY = [
        {
            "id": "auto_mem_001",
            "description": "优化记忆条目标签结构，添加分类标签",
            "type": "memory_management",
            "difficulty": "trivial",
            "assigned_to": "self",
            "status": "planned",
            "verification_method": "data_consistency_check",
            "action": "memory_tag_optimization"
        },
        {
            "id": "auto_obs_002",
            "description": "清理过时的观察记录（超过30天）",
            "type": "memory_management",
            "difficulty": "trivial",
            "assigned_to": "self",
            "status": "planned",
            "verification_method": "data_consistency_check",
            "action": "cleanup_old_observations"
        },
        {
            "id": "auto_cfg_003",
            "description": "优化配置文件的默认值注释",
            "type": "config_tuning",
            "difficulty": "trivial",
            "assigned_to": "self",
            "status": "planned",
            "verification_method": "config_validity_check",
            "action": "optimize_config_comments"
        }
    ]
    
    # 任务类型处理器和验证方法映射
    TASK_HANDLERS: Dict[str, Dict[str, Callable]] = {
        "memory_management": {
            "handler": "_handle_memory_management",
            "verifier": "_verify_memory_management"
        },
        "prompt_optimization": {
            "handler": "_handle_prompt_optimization",
            "verifier": "_verify_prompt_optimization"
        },
        "config_tuning": {
            "handler": "_handle_config_tuning",
            "verifier": "_verify_config_tuning"
        },
        "code_snippet_gen": {
            "handler": "_handle_code_snippet_generation",
            "verifier": "_verify_code_snippet_execution"
        }
    }
    
    # 安全边界配置
    SAFE_DIRECTORIES = [
        "memory/",
        "config/",
        "templates/",
        "skills/"
    ]
    
    def __init__(self, config: Dict[str, Any] = None):
        """初始化执行器"""
        self.config = config or {}
        self.execution_log = []
        self.plan_path = self.config.get("plan_path", "acp-proxy/config/evolution_plan.json")
        self.memory_path = self.config.get("memory_path", "memory/")
        self.config_path = self.config.get("config_path", "acp-proxy/config/")
        self.reports_path = self.config.get("reports_path", "memory/evolution_reports/")
        self.current_task = None
        
        # 确保报告目录存在
        os.makedirs(self.reports_path, exist_ok=True)
    
    def run(self, **kwargs) -> Dict[str, Any]:
        """主执行方法，实现规划-执行-验证闭环"""
        try:
            # 1. 加载和选择任务
            task = self._select_task()
            if not task:
                return self._create_error_response("no_task_selected", "未找到可执行的任务")
            
            self.current_task = task
            self._log(f"开始执行任务: {task['id']} - {task['description']}")
            
            # 2. 执行任务
            execution_result = self._execute_task(task)
            if not execution_result["success"]:
                return self._create_task_response(
                    task["id"], "failure", False, 
                    f"任务执行失败: {execution_result['error']}"
                )
            
            # 3. 自验证
            verification_passed = self._verify_task(task, execution_result.get("result"))
            
            # 4. 更新任务状态
            task_status = "completed" if verification_passed else "failed"
            self._update_task_status(task["id"], task_status)
            
            # 5. 生成执行报告
            report = self._generate_report(task, verification_passed, execution_result)
            self._save_report(report)
            
            # 6. 估算贡献
            progress_update = self._estimate_progress_contribution(task, verification_passed)
            
            # 7. 返回结果
            return {
                "task_id": task["id"],
                "status": "success" if verification_passed else "failure",
                "verification_passed": verification_passed,
                "log": self._get_formatted_log(),
                "suggested_progress_update": progress_update,
                "report_file": report.get("file_path", "")
            }
            
        except Exception as e:
            error_msg = f"执行器运行异常: {str(e)}"
            self._log(error_msg)
            return self._create_error_response("executor_error", error_msg)
    
    def _select_task(self) -> Optional[Dict[str, Any]]:
        """根据优先级规则选择任务"""
        try:
            # 加载进化引擎规划
            plan = self._load_evolution_plan()
            pending_tasks = plan.get("pending_tasks", [])
            
            # 按优先级筛选
            filtered_tasks = []
            for task in pending_tasks:
                # 优先级规则：planned状态，assigned_to为self，难度为trivial/small
                if (task.get("status") == "planned" and
                    task.get("assigned_to") == "self" and
                    task.get("difficulty") in ["trivial", "small"]):
                    
                    # 计算优先级分数
                    priority_score = self._calculate_priority_score(task)
                    filtered_tasks.append((priority_score, task))
            
            # 按优先级排序
            if filtered_tasks:
                filtered_tasks.sort(reverse=True, key=lambda x: x[0])
                selected_task = filtered_tasks[0][1]
                self._log(f"从规划中选择任务: {selected_task['id']}")
                return selected_task
            
            # 从默认改进库中选择
            self._log("规划中无合适任务，使用默认改进库")
            for task in self.DEFAULT_IMPROVEMENT_LIBRARY:
                if task["status"] == "planned":
                    self._log(f"从默认库选择任务: {task['id']}")
                    return task.copy()
            
            return None
            
        except Exception as e:
            self._log(f"任务选择失败: {str(e)}")
            return None
    
    def _calculate_priority_score(self, task: Dict[str, Any]) -> float:
        """计算任务优先级分数"""
        score = 0.0
        
        # 难度权重
        difficulty_weights = {
            "trivial": 1.0,
            "small": 0.8,
            "medium": 0.5,
            "large": 0.2
        }