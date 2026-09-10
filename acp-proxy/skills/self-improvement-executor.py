#!/usr/bin/env python3
"""
ACP Self-Improvement Executor Skill
作为「规划-执行-验证」闭环的自主执行引擎
"""

import json
import os
import ast
import time
import logging
import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import re

class SelfImprovementExecutor:
    """核心技能：自主改进执行器"""
    
    def __init__(self, config_path: str = "acp-proxy/config/evolution_plan.json"):
        """初始化执行器"""
        self.config_path = config_path
        self.reports_dir = Path("memory/evolution_reports")
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        
        # 配置日志
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger("SelfImprovementExecutor")
        
        # 任务类型处理器映射
        self.task_processors = {
            "memory_management": self._process_memory_task,
            "prompt_optimization": self._process_prompt_task,
            "config_tuning": self._process_config_task,
            "code_snippet_gen": self._process_code_task,
        }
        
        # 验证方法映射
        self.verification_methods = {
            "memory_management": self._verify_memory_task,
            "prompt_optimization": self._verify_prompt_task,
            "config_tuning": self._verify_config_task,
            "code_snippet_gen": self._verify_code_task,
        }
        
        # 默认改进任务库
        self.default_tasks = [
            {
                "id": "default_memory_001",
                "description": "优化记忆条目标签，提高检索效率",
                "type": "memory_management",
                "difficulty": "trivial",
                "assigned_to": "self",
                "status": "planned",
                "verification_method": "check_data_consistency",
                "action": {
                    "operation": "optimize_memory_tags",
                    "target": "memory/entries/",
                    "criteria": {"tags_length": "max_3"}
                }
            },
            {
                "id": "default_memory_002",
                "description": "清理过时的观察记录",
                "type": "memory_management",
                "difficulty": "trivial",
                "assigned_to": "self",
                "status": "planned",
                "verification_method": "check_data_consistency",
                "action": {
                    "operation": "clean_outdated_observations",
                    "target": "memory/observations/",
                    "criteria": {"age_days": 90}
                }
            },
            {
                "id": "default_prompt_001",
                "description": "优化查询提示词，增加对时间范围的敏感度",
                "type": "prompt_optimization",
                "difficulty": "small",
                "assigned_to": "self",
                "status": "planned",
                "verification_method": "simulate_conversation",
                "action": {
                    "operation": "enhance_time_sensitivity",
                    "target": "prompts/query_prompt.txt",
                    "modification": {
                        "add_time_range_section": True,
                        "keywords": ["今天", "昨天", "本周", "上周", "本月", "上月"]
                    }
                }
            },
            {
                "id": "default_config_001",
                "description": "调整记忆检索相似度阈值",
                "type": "config_tuning",
                "difficulty": "trivial",
                "assigned_to": "self",
                "status": "planned",
                "verification_method": "check_config_and_function",
                "action": {
                    "operation": "adjust_similarity_threshold",
                    "target": "config/memory_config.json",
                    "modification": {
                        "field": "retrieval.similarity_threshold",
                        "value": 0.75,
                        "previous": 0.7
                    }
                }
            }
        ]
    
    def run(self, task_id: Optional[str] = None) -> Dict[str, Any]:
        """
        主运行方法：执行自改进任务
        
        Args:
            task_id: 可选，指定执行的任务ID，若未指定则自动选择
            
        Returns:
            包含执行结果的字典
        """
        start_time = time.time()
        
        try:
            # 1. 加载或获取任务
            task = self._load_or_generate_task(task_id)
            task_id = task["id"]
            
            self.logger.info(f"开始执行任务: {task_id} - {task['description']}")
            
            # 2. 执行任务
            execution_result = self._execute_task(task)
            
            # 3. 验证任务
            verification_result = self._verify_task(task, execution_result)
            
            # 4. 更新任务状态
            self._update_task_status(task, verification_result["passed"])
            
            # 5. 生成执行报告
            report = self._generate_report(
                task, execution_result, verification_result, 
                time.time() - start_time
            )
            
            # 6. 保存报告
            self._save_report(report)
            
            # 7. 返回结果
            return {
                "task_id": task_id,
                "status": "success" if verification_result["passed"] else "failure",
                "verification_passed": verification_result["passed"],
                "log": verification_result["log"],
                "suggested_progress_update": self._calculate_progress_update(task, verification_result)
            }
            
        except Exception as e:
            self.logger.error(f"任务执行失败: {str(e)}")
            return {
                "task_id": task_id if task_id else "unknown",
                "status": "failure",
                "verification_passed": False,
                "log": f"执行错误: {str(e)}",
                "suggested_progress_update": {"goal_name": "unknown", "delta": 0.0}
            }
    
    def _load_or_generate_task(self, task_id: Optional[str] = None) -> Dict[str, Any]:
        """加载或生成任务"""
        # 尝试从进化计划中加载任务
        plan = self._load_evolution_plan()
        
        if task_id:
            # 查找指定任务
            task = self._find_task_by_id(plan, task_id)
            if task:
                return task
            else:
                raise ValueError(f"未找到指定的任务: {task_id}")
        else:
            # 按优先级规则选择任务
            task = self._select_task_by_priority(plan)
            if task:
                return task
            else:
                # 使用默认任务库生成任务
                self.logger.info("没有合适的任务，从默认库生成任务")
                return self._generate_default_task()
    
    def _load_evolution_plan(self) -> Dict[str, Any]:
        """加载进化计划文件"""
        try:
            config_path = Path(self.config_path)
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            else:
                self.logger.warning(f"进化计划文件不存在: {self.config_path}")
                return {"current_cycle": 0, "pending_tasks": []}
        except Exception as e:
            self.logger.error(f"加载进化计划失败: {e}")